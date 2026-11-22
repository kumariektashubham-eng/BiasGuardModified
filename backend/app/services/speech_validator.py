import re
import os
import struct
import logging
from typing import Optional, Tuple, Dict, Any

logger = logging.getLogger("biasguard.speech_validator")

# Known Whisper hallucinations generated on silence, ambient hum, or non-speech noise
WHISPER_SILENCE_HALLUCINATIONS = {
    "",
    "you",
    "you.",
    "you're",
    "you?",
    "to you",
    "thank you",
    "thank you.",
    "thank you!",
    "thank you very much.",
    "thank you for watching",
    "thank you for watching.",
    "thank you for watching!",
    "thanks for watching",
    "thanks for watching.",
    "thanks for listening.",
    "bye",
    "bye.",
    "bye bye",
    "bye-bye",
    "goodbye.",
    "so",
    "so.",
    "the",
    "a",
    "and",
    "okay",
    "okay.",
    "yeah",
    "yes",
    "no",
    "um",
    "uh",
    "ah",
    "hmm",
    "silence",
    "[silence]",
    "(silence)",
    "music",
    "[music]",
    "(music)",
    "applause",
    "[applause]",
    "laughter",
    "[laughter]",
    "snort",
    "[snort]",
    ".",
    "..",
    "...",
    "?",
    "!",
    "-",
    "--",
    "subtitles by",
    "amara.org",
    "subtitles by the amara.org community",
    "transcription by",
    "translated by"
}

def clean_transcript(text: Optional[str]) -> str:
    """Cleans and normalizes transcript text for validation."""
    if not text:
        return ""
    cleaned = text.strip()
    # Remove surrounding quotes, brackets, and redundant whitespace
    cleaned = re.sub(r'^[“"\'`\(\[\{]+|[”"\'`\)\]\}]+$', '', cleaned).strip()
    return cleaned

def is_silence_or_hallucination(text: Optional[str]) -> bool:
    """
    Returns True if the text represents silence or a known Whisper silence hallucination.
    """
    if not text:
        return True
    cleaned = clean_transcript(text).lower()
    if not cleaned:
        return True
    
    # Direct match against known silence hallucinations
    if cleaned in WHISPER_SILENCE_HALLUCINATIONS:
        return True

    # Strip punctuation to check single token hallucinations (e.g. 'you', 'thank you')
    no_punct = re.sub(r'[^\w\s]', '', cleaned).strip()
    if no_punct in WHISPER_SILENCE_HALLUCINATIONS:
        return True

    # Check if text is just repeated punctuation or whitespace
    if re.fullmatch(r'[\s\.\,\-\_\?\!\;\"\']+', cleaned):
        return True

    return False

def is_transcription_unclear(text: Optional[str]) -> bool:
    """
    Returns True if the candidate made a very short or unintelligible sound
    (e.g., 1-2 words or muffled syllable) that does not constitute a technical answer.
    """
    if not text:
        return False
    cleaned = clean_transcript(text)
    words = [w for w in re.split(r'\s+', cleaned) if re.search(r'\w', w)]
    
    # A meaningful technical answer must consist of at least 3 distinct words
    if len(words) < 3:
        return True
        
    # Extremely short character count (e.g. "hi there")
    if len(cleaned) < 12 and len(words) < 3:
        return True

    return False

def validate_audio_file_silence(
    file_path: str,
    file_size: int,
    content_type: str = "",
    client_speech_detected: Optional[bool] = None
) -> Tuple[bool, str]:
    """
    Analyzes raw audio file properties and voice activity detection indicators.
    Returns (is_silent: bool, reason: str).
    """
    # 1. Respect client-side Web Audio VAD flag if explicitly passed as False
    if client_speech_detected is False:
        return True, "No audible microphone input detected by browser voice monitor."

    # 2. File size threshold: audio under 400 bytes cannot contain audible spoken answers
    if file_size < 400:
        return True, "Audio file is too small to contain spoken speech."

    # 3. For WAV files, inspect raw PCM amplitude
    if file_path.lower().endswith(".wav") or (content_type and "wav" in content_type):
        try:
            import wave
            with wave.open(file_path, 'rb') as wf:
                n_frames = wf.getnframes()
                if n_frames == 0:
                    return True, "WAV audio container contains 0 audio frames."

                sample_width = wf.getsampwidth()
                if sample_width == 2:
                    frames_to_read = min(n_frames, 32000)
                    raw_data = wf.readframes(frames_to_read)
                    num_samples = len(raw_data) // 2
                    if num_samples > 0:
                        fmt = f"<{num_samples}h"
                        samples = struct.unpack(fmt, raw_data)
                        max_amp = max(abs(s) for s in samples) if samples else 0
                        # Standard 16-bit PCM silence threshold (< 180 out of 32767)
                        if max_amp < 180:
                            return True, f"Audio waveform amplitude ({max_amp}) is below audible speech threshold."
        except Exception as e:
            logger.debug(f"WAV silence analysis error: {e}")

    return False, "Audio signal contains data."

def classify_recording_status(
    transcript: Optional[str],
    transcription_error: Optional[str] = None,
    is_silent_audio: bool = False,
    silence_reason: str = ""
) -> Tuple[str, str, str]:
    """
    Classifies the candidate's recording into one of the four mandatory lifecycle states:
    - Case A: No Answer Detected ('no_speech_detected')
    - Case B: Transcription Unclear ('transcription_unclear')
    - Case C: Transcription Failed ('transcription_failed')
    - Case D: Completed ('completed')

    Returns: (status_code, status_label, user_display_message)
    """
    # Case C / A / B from explicit error message
    if transcription_error:
        err_lower = transcription_error.lower()
        # If the error was explicitly due to silence, map to Case A
        if any(term in err_lower for term in ["silence", "empty", "no speech", "no audible speech"]):
            return (
                "no_speech_detected",
                "No Answer Detected",
                "No speech detected. Please record your answer again."
            )
        # If the error was due to unclear / short audio
        if any(term in err_lower for term in ["unclear", "unable to understand", "unintelligible", "too brief"]):
            return (
                "transcription_unclear",
                "Transcription Unclear",
                "Unable to understand the recorded answer. Please try again."
            )
        return (
            "transcription_failed",
            "Transcription Failed",
            "Speech-to-text failed. Your original recording has been preserved. Please retry."
        )

    # Case A: Candidate records silence or audio probe confirms silence
    if is_silent_audio or is_silence_or_hallucination(transcript):
        return (
            "no_speech_detected",
            "No Answer Detected",
            "No speech detected. Please record your answer again."
        )

    # Case B: Candidate makes a very short or unclear sound
    if is_transcription_unclear(transcript):
        return (
            "transcription_unclear",
            "Transcription Unclear",
            "Unable to understand the recorded answer. Please try again."
        )

    # Case D: Candidate gives an actual answer
    return (
        "completed",
        "Completed",
        "Answer evaluated successfully."
    )
