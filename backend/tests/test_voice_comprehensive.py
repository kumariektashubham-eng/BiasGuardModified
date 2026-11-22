import pytest
import io
import wave
import struct
import math
from fastapi.testclient import TestClient
from app.main import app
from app.services.auth_service import create_access_token
from app.database import init_db
from app.services.ai_evaluator import evaluate_with_openai

client = TestClient(app)

def generate_pcm_wav(duration_secs=1.5, frequency=440.0) -> bytes:
    sample_rate = 16000
    n_samples = int(sample_rate * duration_secs)
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = bytearray()
        for i in range(n_samples):
            val = math.sin(2.0 * math.pi * frequency * (i / sample_rate))
            frames.extend(struct.pack('<h', int(val * 16000)))
        wf.writeframes(frames)
    return buffer.getvalue()

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    init_db()

@pytest.fixture
def auth_headers():
    token = create_access_token({"sub": "admin@biasguard.ai", "role": "admin"})
    return {"Authorization": f"Bearer {token}"}

def test_spoken_vs_typed_technical_equivalence():
    """
    Validates that the AI evaluation engine evaluates spoken/transcribed answers
    with conversational fillers ('um', 'so basically') equivalently to formal typed answers.
    """
    domain = "DSA"
    question = "Given an array of integers, how would you find two numbers that add up to target?"
    criteria = ["Hash map complement lookup", "O(N) time complexity", "O(N) space complexity"]

    # 1. Formal typed answer
    typed_answer = (
        "We iterate through the array using a single pass with a hash map. "
        "For each element x, we check if target - x is present. "
        "This achieves O(N) time and O(N) auxiliary space."
    )

    # 2. Spoken answer with conversational filler words and speech-to-text syntax
    spoken_answer = (
        "Um, yeah, so basically to solve this, what I would do is loop through the array once. "
        "And in the loop, for each number, I'd check a dictionary or hash map to see if target minus the number "
        "is already there. If it is, then boom, we found the pair. It runs super fast in O(N) time, "
        "and costs O(N) extra space in memory for the hash table."
    )

    typed_eval = evaluate_with_openai(
        domain=domain,
        question_text=question,
        expected_criteria=criteria,
        candidate_answer=typed_answer
    )

    spoken_eval = evaluate_with_openai(
        domain=domain,
        question_text=question,
        expected_criteria=criteria,
        candidate_answer=spoken_answer
    )

    score_typed = typed_eval["technical_score"]
    score_spoken = spoken_eval["technical_score"]

    # Scores should be virtually identical or within calibration tolerance (<= 1.0 pt)
    delta = abs(score_typed - score_spoken)
    assert delta <= 1.5, f"Spoken ({score_spoken}) vs Typed ({score_typed}) delta {delta} exceeded threshold!"
    assert score_spoken >= 7.0, f"Spoken answer unfairly penalized: score was {score_spoken}"

def test_unsupported_audio_format_rejection(auth_headers):
    text_content = b"This is not audio content."
    files = {"file": ("malicious.exe", io.BytesIO(text_content), "application/x-msdownload")}
    data = {
        "interview_id": "test_inv_unsupp",
        "question_id": "q_01",
        "domain": "DSA"
    }
    res = client.post("/api/voice/upload", files=files, data=data, headers=auth_headers)
    assert res.status_code == 400
    assert "unsupported" in res.json()["detail"].lower()

def test_audio_file_size_limit_rejection(auth_headers):
    # Create fake oversized audio (26 MB > 25 MB limit)
    oversized_data = b"0" * (26 * 1024 * 1024)
    files = {"file": ("huge_recording.wav", io.BytesIO(oversized_data), "audio/wav")}
    data = {
        "interview_id": "test_inv_huge",
        "question_id": "q_01",
        "domain": "DSA"
    }
    res = client.post("/api/voice/upload", files=files, data=data, headers=auth_headers)
    assert res.status_code == 413
    assert "exceeds" in res.json()["detail"].lower()

def test_multiple_recording_attempts_and_updates(auth_headers):
    # Attempt 1
    wav1 = generate_pcm_wav(duration_secs=2.0, frequency=400.0)
    files1 = {"file": ("take1.wav", io.BytesIO(wav1), "audio/wav")}
    data1 = {
        "interview_id": "test_multi_takes",
        "question_id": "q_take_01",
        "domain": "Python",
        "question_text": "Explain Python GIL"
    }
    res1 = client.post("/api/voice/upload", files=files1, data=data1, headers=auth_headers)
    assert res1.status_code == 201
    audio1_id = res1.json()["id"]

    # Candidate discards and re-records (Attempt 2)
    wav2 = generate_pcm_wav(duration_secs=2.5, frequency=520.0)
    files2 = {"file": ("take2.wav", io.BytesIO(wav2), "audio/wav")}
    res2 = client.post("/api/voice/upload", files=files2, data=data1, headers=auth_headers)
    assert res2.status_code == 201
    audio2_id = res2.json()["id"]

    assert audio1_id != audio2_id

    # Interview records list should show both takes
    list_res = client.get("/api/voice/interview/test_multi_takes", headers=auth_headers)
    assert list_res.status_code == 200
    takes = list_res.json()
    assert len(takes) >= 2
    take_ids = [t["id"] for t in takes]
    assert audio1_id in take_ids
    assert audio2_id in take_ids
