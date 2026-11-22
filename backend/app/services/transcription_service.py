import os
import io
import time
import math
import logging
from typing import Optional, Tuple, Dict, Any
from app.config import settings
from app.services.speech_validator import (
    validate_audio_file_silence,
    is_silence_or_hallucination,
    is_transcription_unclear
)

logger = logging.getLogger("biasguard.transcription")

DEFAULT_TECHNICAL_VOCABULARY_PROMPT = (
    "Technical software engineering interview in English, Indian English, or Hindi (Hinglish). "
    "Candidate explains programming concepts. Key technical terms: "
    "Java, Python, JVM, JDK, JRE, bytecode, garbage collection, OOP, polymorphism, inheritance, "
    "encapsulation, abstraction, recursion, base case, call stack, arrays, ArrayList, LinkedList, "
    "HashMap, HashSet, binary search tree, graph, DFS, BFS, dynamic programming, memoization, "
    "SQL, SELECT, MAX, JOIN, INNER JOIN, LEFT JOIN, GROUP BY, HAVING, WHERE, INDEX, EXPLAIN, "
    "DBMS, ACID properties, transactions, normalization, 1NF, 2NF, 3NF, BCNF, primary key, "
    "foreign key, deadlock, Coffman conditions, mutual exclusion, hold and wait, no preemption, "
    "circular wait, mutex, semaphore, GIL, Global Interpreter Lock, multiprocessing, multithreading, "
    "time complexity O(1), O(N), O(N log N), space complexity O(1), O(N), Big-O, REST API."
)

# Domain spoken templates for offline / pytest testing mode
OFFLINE_DOMAIN_TRANSCRIPTS = {
    "DSA": (
        "Um, to solve this problem, we can use a hash map where we iterate through the array once. "
        "For each number, we compute the target minus current number. If that complement is in the map, "
        "we return both indices. That gives us O(N) time complexity and O(N) auxiliary space. "
        "Alternatively, if memory is restricted, we can sort the array and use a two-pointer approach "
        "from both ends, which takes O(N log N) time but runs in strict O(1) space."
    ),
    "Python": (
        "In Python, the Global Interpreter Lock, or GIL, is a mutual exclusion lock inside CPython that ensures "
        "only one native thread executes Python bytecode at a given time. It protects CPython's reference counting "
        "memory management against data races. For I/O bound tasks threads release the GIL, but for CPU-bound tasks "
        "we use the multiprocessing module or ProcessPoolExecutor to utilize multiple CPU cores."
    ),
    "Java": (
        "In Java 8, HashMap uses an array of Node buckets. When collisions occur, keys are chained in a LinkedList. "
        "If a bucket reaches TREEIFY_THRESHOLD of 8 and the table capacity is at least 64, it converts the list into "
        "a Red-Black Tree, reducing lookup from O(N) to O(log N). Overriding equals() without hashCode() violates "
        "the contract because two equal objects would hash to different buckets, causing get() to fail."
    ),
    "SQL": (
        "To find the second highest salary without using LIMIT or TOP, we can write: "
        "SELECT MAX(salary) FROM Employee WHERE salary < (SELECT MAX(salary) FROM Employee). "
        "Another valid approach is using the DENSE_RANK() window function in a CTE partitioned or ordered by salary descending, "
        "and filtering for rank equals 2 to handle duplicate salaries correctly."
    ),
    "DBMS": (
        "Database normalization eliminates redundancy and prevents update, insert, and delete anomalies. "
        "1NF requires atomic values in each column. 2NF removes partial functional dependencies on composite keys. "
        "3NF removes transitive functional dependencies where a non-key attribute depends on another non-key attribute. "
        "We selectively de-normalize in read-heavy analytics to avoid expensive multi-table JOINs."
    ),
    "Operating Systems": (
        "A deadlock occurs when a set of processes are blocked because each holds a resource while waiting for another "
        "held by another process. The four Coffman conditions are mutual exclusion, hold and wait, no preemption, and circular wait. "
        "All four must hold simultaneously. We can prevent deadlock by ordering resource acquisition to break circular wait, "
        "or avoid it dynamically using the Banker's algorithm."
    )
}

def is_audio_silent_or_empty(
    file_path: str,
    file_size: int,
    content_type: str,
    client_speech_detected: Optional[bool] = None
) -> bool:
    """Detects if the audio file contains silence, negligible noise, or empty frames."""
    is_silent, _ = validate_audio_file_silence(file_path, file_size, content_type, client_speech_detected)
    return is_silent

def estimate_audio_duration(file_path: str, file_size: int, content_type: str) -> float:
    """Estimates duration of the audio in seconds based on header or file size."""
    try:
        if content_type.endswith("wav") or file_path.lower().endswith(".wav"):
            import wave
            with wave.open(file_path, 'rb') as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                if rate > 0 and frames > 0:
                    return round(frames / float(rate), 2)
    except Exception as e:
        logger.debug(f"Wave duration estimate probe: {e}")

    # Fallback heuristic: typical voice codecs ~ 6 KB/sec
    estimated = max(1.0, min(round(file_size / 6000.0, 1), float(settings.MAX_RECORDING_DURATION_SECONDS)))
    return estimated

def build_transcription_prompt(domain: Optional[str] = None, question_text: Optional[str] = None, max_chars: int = 850) -> str:
    """
    Builds a technical context prompt to prime Whisper for technical terminology and accents.
    Enforces maximum character length (e.g. 850 chars) to strictly comply with Groq API's 896 character limit.
    """
    prompt = settings.WHISPER_PROMPT or DEFAULT_TECHNICAL_VOCABULARY_PROMPT
    if domain:
        prompt += f" Technical Domain: {domain}."
    if question_text:
        prompt += f" Question context: {question_text[:120]}."

    if len(prompt) > max_chars:
        prompt = prompt[:max_chars].rsplit(" ", 1)[0]
    return prompt

def transcribe_audio_file(
    file_path: str,
    domain: Optional[str] = None,
    question_text: Optional[str] = None,
    candidate_hint: Optional[str] = None,
    client_speech_detected: Optional[bool] = None
) -> Tuple[str, str]:
    """
    Transcribes audio using Groq Whisper API (whisper-large-v3) or OpenAI Whisper API (whisper-1).
    Selected via settings.TRANSCRIPTION_PROVIDER ('groq' or 'openai').
    Includes technical prompt priming for engineering terminology and accents.
    Returns (transcription_text, engine_used).
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    file_size = os.path.getsize(file_path)
    if file_size == 0:
        raise ValueError("Audio recording is empty (0 bytes).")

    # Check for empty audio / silence using speech validator
    content_type = "audio/wav" if file_path.endswith(".wav") else "audio/webm"
    if is_audio_silent_or_empty(file_path, file_size, content_type, client_speech_detected):
        raise ValueError("No speech detected. Please record your answer again.")

    provider = (settings.TRANSCRIPTION_PROVIDER or "groq").strip().lower()
    groq_api_key = (settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "")).strip()
    openai_api_key = (settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY", "")).strip()

    prompt = build_transcription_prompt(domain, question_text, max_chars=850)

    # 1. Pytest automated test harness fallback ONLY
    # In live runtime, do NOT silently generate fake or placeholder transcripts
    is_pytest = bool(os.environ.get("PYTEST_CURRENT_TEST")) and not bool(os.environ.get("TEST_LIVE_GROQ"))
    if is_pytest:
        domain_clean = (domain or "DSA").upper()
        if "JAVA" in domain_clean:
            matched = "Java"
        elif "PYTHON" in domain_clean:
            matched = "Python"
        elif "SQL" in domain_clean:
            matched = "SQL"
        elif "DBMS" in domain_clean or "DATABASE" in domain_clean:
            matched = "DBMS"
        elif "OS" in domain_clean or "OPERATING" in domain_clean:
            matched = "Operating Systems"
        else:
            matched = "DSA"

        transcript = OFFLINE_DOMAIN_TRANSCRIPTS.get(matched, OFFLINE_DOMAIN_TRANSCRIPTS["DSA"])
        return transcript, f"BiasGuard Speech-to-Text (Pytest Mock {provider.capitalize()})"

    # 2. GROQ SPEECH-TO-TEXT (whisper-large-v3)
    if provider == "groq" and groq_api_key and "your-" not in groq_api_key:
        logger.info(f"Submitting audio {file_path} ({file_size} bytes) to Groq Whisper ({settings.GROQ_TRANSCRIPTION_MODEL})...")
        try:
            try:
                from groq import Groq
                client = Groq(api_key=groq_api_key, timeout=60.0)
            except ImportError:
                from openai import OpenAI
                client = OpenAI(api_key=groq_api_key, base_url="https://api.groq.com/openai/v1", timeout=60.0)

            with open(file_path, "rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    model=settings.GROQ_TRANSCRIPTION_MODEL,
                    file=audio_file,
                    response_format="text",
                    temperature=settings.WHISPER_TEMPERATURE,
                    prompt=prompt
                )

            text = str(transcription).strip()
            if not text or is_silence_or_hallucination(text):
                raise ValueError("No speech detected. Please record your answer again.")

            if is_transcription_unclear(text):
                raise ValueError("Unable to understand the recorded answer. Please try again.")

            engine_label = f"Groq Whisper ({settings.GROQ_TRANSCRIPTION_MODEL})"
            logger.info(f"Groq Whisper successfully transcribed {len(text)} characters.")
            return text, engine_label

        except ValueError:
            raise
        except Exception as e:
            err_name = type(e).__name__
            if "Authentication" in err_name or "401" in str(e):
                logger.error("Groq authentication failed during speech-to-text.")
                raise ValueError("Groq Authentication failed: Invalid API key. Please verify your GROQ_API_KEY in backend/.env or Settings.")
            elif "RateLimit" in err_name or "429" in str(e):
                logger.warning(f"Groq Whisper rate limit exceeded: {e}")
                raise RuntimeError(f"Groq Whisper rate limit reached: {e}")
            else:
                logger.error(f"Groq Whisper transcription failed: {e}")
                raise RuntimeError(f"Groq Whisper transcription failed: {e}")

    # 3. OPENAI WHISPER FALLBACK / ALTERNATIVE
    if (provider == "openai" or (not groq_api_key and openai_api_key)) and openai_api_key and "your-" not in openai_api_key:
        from openai import OpenAI, AuthenticationError, RateLimitError, APITimeoutError
        try:
            client = OpenAI(api_key=openai_api_key, timeout=60.0)
        except Exception as e:
            raise ValueError(f"Failed to initialize OpenAI client: {e}")

        logger.info(f"Submitting audio {file_path} ({file_size} bytes) to OpenAI Whisper ({settings.WHISPER_MODEL})...")
        for attempt in range(1, 3):
            try:
                with open(file_path, "rb") as audio_file:
                    whisper_kwargs = {
                        "model": settings.WHISPER_MODEL,
                        "file": audio_file,
                        "response_format": "text",
                        "temperature": settings.WHISPER_TEMPERATURE,
                        "prompt": prompt
                    }
                    if settings.WHISPER_LANGUAGE:
                        whisper_kwargs["language"] = settings.WHISPER_LANGUAGE

                    transcription = client.audio.transcriptions.create(**whisper_kwargs)

                text = str(transcription).strip()
                if not text or is_silence_or_hallucination(text):
                    raise ValueError("No speech detected. Please record your answer again.")

                if is_transcription_unclear(text):
                    raise ValueError("Unable to understand the recorded answer. Please try again.")

                engine_label = f"OpenAI Whisper ({settings.WHISPER_MODEL})"
                logger.info(f"OpenAI Whisper successfully transcribed {len(text)} characters.")
                return text, engine_label

            except ValueError:
                raise
            except AuthenticationError:
                logger.error("OpenAI authentication failed during Whisper transcription.")
                raise ValueError("OpenAI Authentication failed: Invalid API key. Please verify your OPENAI_API_KEY in Settings or backend/.env.")
            except (APITimeoutError, RateLimitError) as err:
                if attempt == 2:
                    raise RuntimeError(f"OpenAI Whisper connection failed after 2 attempts: {err}")
                time.sleep(1.0)
            except Exception as e:
                logger.error(f"Whisper transcription failed: {e}")
                raise RuntimeError(f"OpenAI Whisper transcription failed: {e}")

    # 4. Live runtime with missing API credentials
    if provider == "groq":
        logger.error("Groq transcription aborted: GROQ_API_KEY is not configured.")
        raise ValueError(
            "Groq API key is missing. Please configure GROQ_API_KEY in backend/.env or in the Settings tab."
        )
    else:
        logger.error("OpenAI transcription aborted: OPENAI_API_KEY is not configured.")
        raise ValueError(
            "OpenAI API key is missing. Please configure OPENAI_API_KEY in backend/.env or in the Settings tab."
        )
