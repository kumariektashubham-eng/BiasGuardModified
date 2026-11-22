import pytest
import io
import wave
import struct
import math
from fastapi.testclient import TestClient
from app.main import app
from app.services.auth_service import create_access_token
from app.database import init_db

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

def test_voice_upload_and_stream(auth_headers):
    wav_bytes = generate_pcm_wav(duration_secs=2.0, frequency=440.0)

    files = {"file": ("spoken_answer.wav", io.BytesIO(wav_bytes), "audio/wav")}
    data = {
        "interview_id": "test_interview_voice_123",
        "question_id": "q_dsa_01",
        "domain": "DSA",
        "question_text": "Find two numbers in array that sum to target.",
        "submission_mode": "voice_recorded"
    }

    # 1. Upload audio
    upload_res = client.post("/api/voice/upload", files=files, data=data, headers=auth_headers)
    assert upload_res.status_code == 201
    upload_data = upload_res.json()
    assert "id" in upload_data
    assert "transcription" in upload_data
    assert len(upload_data["transcription"]) > 10
    assert upload_data["audio_url"].startswith("/api/voice/audio/")
    audio_id = upload_data["id"]

    # 2. Retrieve metadata
    meta_res = client.get(f"/api/voice/{audio_id}", headers=auth_headers)
    assert meta_res.status_code == 200
    meta_data = meta_res.json()
    assert meta_data["filename"].endswith(".wav")
    assert meta_data["transcription"] == upload_data["transcription"]

    # 3. Stream audio file
    stream_res = client.get(f"/api/voice/audio/{audio_id}")
    assert stream_res.status_code == 200
    assert len(stream_res.content) == len(wav_bytes)

    # 4. Update transcription (simulating candidate editing typos before submission)
    edited_text = "I modified this transcription to clarify that hash map gives O(N) time complexity."
    update_res = client.put(
        f"/api/voice/{audio_id}/transcription",
        json={"edited_transcript": edited_text},
        headers=auth_headers
    )
    assert update_res.status_code == 200
    assert update_res.json()["edited_transcript"] == edited_text

    # 5. List recordings for interview
    list_res = client.get(f"/api/voice/interview/test_interview_voice_123", headers=auth_headers)
    assert list_res.status_code == 200
    recs = list_res.json()
    assert len(recs) >= 1
    assert any(r["id"] == audio_id for r in recs)

def test_voice_upload_validation_errors(auth_headers):
    # Empty file should return 400
    empty_files = {"file": ("empty.wav", io.BytesIO(b""), "audio/wav")}
    data = {
        "interview_id": "test_err_int",
        "question_id": "q_01",
        "domain": "DSA"
    }
    res = client.post("/api/voice/upload", files=empty_files, data=data, headers=auth_headers)
    assert res.status_code == 400
    assert "empty" in res.json()["detail"].lower()

def test_voice_evaluation_flow(auth_headers):
    from app.database import get_interviews_collection
    ints_col = get_interviews_collection()
    interview = ints_col.find_one({})
    if not interview:
        pytest.skip("No interview found in test DB to evaluate.")

    interview_id = str(interview["_id"])
    question = interview.get("questions", [])[0]
    question_id = question.get("id")

    # 1. Upload sample voice answer
    wav_bytes = generate_pcm_wav(duration_secs=2.0, frequency=480.0)
    files = {"file": ("spoken_solution.wav", io.BytesIO(wav_bytes), "audio/wav")}
    data = {
        "interview_id": interview_id,
        "question_id": question_id,
        "domain": question.get("domain", "DSA"),
        "question_text": question.get("question_text", "Two Sum"),
        "submission_mode": "voice_recorded"
    }
    upload_res = client.post("/api/voice/upload", files=files, data=data, headers=auth_headers)
    assert upload_res.status_code == 201
    audio_id = upload_res.json()["id"]

    # 2. Evaluate voice answer
    eval_payload = {
        "interview_id": interview_id,
        "question_id": question_id,
        "audio_id": audio_id,
        "final_answer": "In our system we use a hash map complement lookup which runs in O(N) time and O(N) space.",
        "domain": question.get("domain", "DSA"),
        "question_text": question.get("question_text", "Two Sum"),
        "expected_criteria": question.get("expected_criteria", []),
        "interviewer_score": 8.0,
        "interviewer_notes": "Spoken clearly with correct complexity.",
        "submission_mode": "voice_recorded"
    }

    eval_res = client.post("/api/voice/evaluate", json=eval_payload, headers=auth_headers)
    assert eval_res.status_code == 200
    res_data = eval_res.json()
    assert res_data["audio_id"] == audio_id
    assert res_data["submission_mode"] == "voice_recorded"
    assert "ai_evaluation" in res_data
    # Active interview seals the evaluation to prevent anchoring bias
    assert res_data["is_sealed"] is True
    assert res_data["ai_evaluation"]["technical_score"] is None
