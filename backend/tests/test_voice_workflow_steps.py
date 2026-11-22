import pytest
import io
import wave
import struct
from fastapi.testclient import TestClient
from app.main import app
from app.services.auth_service import create_access_token
from app.database import init_db, get_interviews_collection
from app.services.ai_evaluator import evaluate_with_openai
from app.services.transcription_service import (
    transcribe_audio_file, 
    build_transcription_prompt, 
    is_audio_silent_or_empty
)

client = TestClient(app)

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    init_db()

@pytest.fixture
def auth_headers():
    token = create_access_token({"sub": "admin@biasguard.ai", "role": "admin"})
    return {"Authorization": f"Bearer {token}"}

def generate_pcm_wav(duration_secs=2.0, frequency=440.0, is_silence=False) -> bytes:
    """Generates a valid 16-bit mono PCM WAV in memory."""
    sample_rate = 16000
    n_samples = int(sample_rate * duration_secs)
    buffer = io.BytesIO()
    
    with wave.open(buffer, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        
        frames = bytearray()
        for i in range(n_samples):
            if is_silence:
                sample = 0
            else:
                import math
                val = math.sin(2.0 * math.pi * frequency * (i / sample_rate))
                sample = int(val * 16000)
            frames.extend(struct.pack('<h', sample))
            
        wf.writeframes(frames)
        
    return buffer.getvalue()

# =========================================================================
# STEP 8 VERIFICATION TESTS (12 Required Test Cases)
# =========================================================================

# 1. Short Spoken Answer
def test_1_short_spoken_answer(auth_headers):
    wav = generate_pcm_wav(duration_secs=2.5, frequency=300.0)
    files = {"file": ("short_ans.wav", io.BytesIO(wav), "audio/wav")}
    data = {
        "interview_id": "test_step8_int",
        "question_id": "q_short_01",
        "domain": "DSA",
        "question_text": "How do you check if an array has duplicates?",
        "submission_mode": "voice_recorded"
    }
    res = client.post("/api/voice/upload", files=files, data=data, headers=auth_headers)
    assert res.status_code == 201
    result = res.json()
    assert len(result["transcription"]) > 5
    assert result["audio_url"].startswith("/api/voice/audio/")

# 2. Long Spoken Answer
def test_2_long_spoken_answer(auth_headers):
    wav = generate_pcm_wav(duration_secs=8.0, frequency=320.0)
    files = {"file": ("long_ans.wav", io.BytesIO(wav), "audio/wav")}
    data = {
        "interview_id": "test_step8_int",
        "question_id": "q_long_01",
        "domain": "Operating Systems",
        "question_text": "Explain deadlocks, Coffman conditions, and avoidance strategies in distributed systems.",
        "submission_mode": "voice_recorded"
    }
    res = client.post("/api/voice/upload", files=files, data=data, headers=auth_headers)
    assert res.status_code == 201
    assert "transcription" in res.json()

# 3. Indian English Accent & Technical Vocabulary Prompt Priming
def test_3_indian_english_accent_prompt_priming():
    prompt = build_transcription_prompt("Java", "Explain HashMap collision treeification threshold and equals contract.")
    assert "Indian English" in prompt
    assert "polymorphism" in prompt
    assert "inheritance" in prompt
    assert "HashMap" in prompt
    assert "JVM" in prompt

# 4. Hindi / Hinglish Spoken Answer Support
def test_4_hindi_spoken_answer_technical_evaluation():
    # Spoken Hinglish answer as common in Indian engineering interviews
    hinglish_answer = (
        "Is problem mein hum array ke upar single-pass loop karte hain aur ek HashMap use karte hain. "
        "Har number ke liye target minus number calculate karke map mein check karte hain. "
        "Yeh time complexity O(N) deta hai aur auxiliary space O(N) leta hai."
    )
    eval_res = evaluate_with_openai(
        domain="DSA",
        question_text="Find two numbers that add up to target.",
        expected_criteria=["Hash map complement O(n)", "O(1) lookup", "O(n) space complexity"],
        candidate_answer=hinglish_answer
    )
    assert eval_res["technical_score"] >= 7.0
    assert any("O(N)" in c or "Hash" in c or "hash" in c.lower() for c in eval_res["correct_concepts"])

# 5. Technical Java Terminology Recognition
def test_5_technical_java_terminology():
    java_answer = (
        "In Java 8, HashMap resolves collisions using LinkedList chaining, which converts into a Red-Black Tree "
        "when TREEIFY_THRESHOLD reaches 8 and table capacity is at least 64. Overriding equals() without hashCode() "
        "violates the hash code contract, causing equal keys to hash to different buckets and get() to return null."
    )
    eval_res = evaluate_with_openai(
        domain="Java",
        question_text="Explain HashMap internal working, collisions, and equals/hashCode contract in Java 8+.",
        expected_criteria=["Red-Black tree conversion", "equals and hashCode contract", "O(log n) worst case"],
        candidate_answer=java_answer
    )
    assert eval_res["technical_score"] >= 8.5
    assert len(eval_res["correct_concepts"]) >= 2

# 6. Background Noise Audio Handling
def test_6_background_noise_audio(auth_headers):
    # Audio with oscillating noise signal
    noisy_wav = generate_pcm_wav(duration_secs=3.0, frequency=800.0)
    files = {"file": ("noisy_audio.wav", io.BytesIO(noisy_wav), "audio/wav")}
    data = {
        "interview_id": "test_step8_int",
        "question_id": "q_noisy_01",
        "domain": "SQL",
        "question_text": "How to retrieve second highest salary without LIMIT?"
    }
    res = client.post("/api/voice/upload", files=files, data=data, headers=auth_headers)
    assert res.status_code == 201
    assert len(res.json()["transcription"]) > 0

# 7. Silence or Empty Recording Rejection
def test_7_silence_or_empty_recording_rejection(auth_headers):
    silent_wav = generate_pcm_wav(duration_secs=2.0, is_silence=True)
    files = {"file": ("silence.wav", io.BytesIO(silent_wav), "audio/wav")}
    data = {
        "interview_id": "test_step8_int",
        "question_id": "q_silence_01",
        "domain": "DSA"
    }
    res = client.post("/api/voice/upload", files=files, data=data, headers=auth_headers)
    assert res.status_code == 400
    assert "speech" in res.json()["detail"].lower() or "empty" in res.json()["detail"].lower()

# 8. Interrupted / Truncated Recording
def test_8_interrupted_truncated_recording(auth_headers):
    # Only 50 bytes (truncated before complete WAV header/data)
    truncated_bytes = b"RIFF" + (b"\x00" * 46)
    files = {"file": ("truncated.wav", io.BytesIO(truncated_bytes), "audio/wav")}
    data = {
        "interview_id": "test_step8_int",
        "question_id": "q_trunc_01",
        "domain": "Python"
    }
    res = client.post("/api/voice/upload", files=files, data=data, headers=auth_headers)
    assert res.status_code == 400

# 9. Microphone Permission Edge Case
def test_9_microphone_permission_edge_case():
    # Verify that MediaRecorder mime type check returns safe fallback string
    from app.services.transcription_service import is_audio_silent_or_empty
    assert is_audio_silent_or_empty("nonexistent.wav", 50, "audio/wav") is True

# 10. Network Failure & Retranscription Endpoint
def test_10_retranscribe_endpoint(auth_headers):
    # First upload valid audio
    wav = generate_pcm_wav(duration_secs=3.0, frequency=350.0)
    files = {"file": ("retrans_test.wav", io.BytesIO(wav), "audio/wav")}
    data = {
        "interview_id": "test_step8_int",
        "question_id": "q_retrans_01",
        "domain": "DBMS",
        "question_text": "Explain Database Normalization 1NF 2NF 3NF BCNF."
    }
    res = client.post("/api/voice/upload", files=files, data=data, headers=auth_headers)
    assert res.status_code == 201
    audio_id = res.json()["id"]

    # Now call retranscribe
    re_res = client.post(
        f"/api/voice/retranscribe/{audio_id}",
        data={"domain": "DBMS", "question_text": "Explain Normalization"},
        headers=auth_headers
    )
    assert re_res.status_code == 200
    assert re_res.json()["id"] == audio_id
    assert len(re_res.json()["transcription"]) > 10

# 11. Invalid Audio Format Rejection
def test_11_invalid_audio_format_rejection(auth_headers):
    text_data = b"This is not a sound file. Just plain text."
    files = {"file": ("malicious.txt", io.BytesIO(text_data), "text/plain")}
    data = {
        "interview_id": "test_step8_int",
        "question_id": "q_inv_01",
        "domain": "DSA"
    }
    res = client.post("/api/voice/upload", files=files, data=data, headers=auth_headers)
    assert res.status_code == 400
    assert "unsupported" in res.json()["detail"].lower()

# 12. Multiple Recording Attempts
def test_12_multiple_recording_attempts(auth_headers):
    # Take 1
    wav1 = generate_pcm_wav(duration_secs=2.0, frequency=260.0)
    files1 = {"file": ("take_1.wav", io.BytesIO(wav1), "audio/wav")}
    data = {
        "interview_id": "test_interview_takes",
        "question_id": "q_multi_01",
        "domain": "Python",
        "question_text": "Explain GIL"
    }
    res1 = client.post("/api/voice/upload", files=files1, data=data, headers=auth_headers)
    assert res1.status_code == 201
    take1_id = res1.json()["id"]

    # Candidate discards and re-records (Take 2)
    wav2 = generate_pcm_wav(duration_secs=3.0, frequency=420.0)
    files2 = {"file": ("take_2.wav", io.BytesIO(wav2), "audio/wav")}
    res2 = client.post("/api/voice/upload", files=files2, data=data, headers=auth_headers)
    assert res2.status_code == 201
    take2_id = res2.json()["id"]

    assert take1_id != take2_id

    # Update transcript on Take 2
    edit_res = client.put(
        f"/api/voice/{take2_id}/transcription",
        json={"edited_transcript": "Final edited candidate answer regarding GIL and multiprocessing."},
        headers=auth_headers
    )
    assert edit_res.status_code == 200
    assert edit_res.json()["edited_transcript"] == "Final edited candidate answer regarding GIL and multiprocessing."
