import pytest
import io
import wave
import struct
import math
from fastapi.testclient import TestClient
from app.main import app
from app.services.auth_service import create_access_token
from app.database import init_db, get_interviews_collection, get_audio_recordings_collection, get_score_audits_collection

client = TestClient(app)

def generate_pcm_wav(duration_secs=2.0, frequency=440.0) -> bytes:
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
    token = create_access_token({"sub": "interviewer@biasguard.ai", "role": "interviewer", "name": "Sarah Chen"})
    return {"Authorization": f"Bearer {token}"}

def test_audio_first_evaluation_without_candidate_text(auth_headers):
    """
    Validates that in an AUDIO-FIRST workflow, the candidate does NOT need to provide
    any text-answer. The backend automatically resolves the internal Whisper transcription
    from audio_id and performs AI technical evaluation.
    """
    ints_col = get_interviews_collection()
    interview = ints_col.find_one({})
    assert interview is not None, "Seed interview should exist"
    
    interview_id = str(interview["_id"])
    question = interview["questions"][0]
    question_id = question["id"]
    
    # 1. Candidate records and uploads audio
    audio_wav = generate_pcm_wav(duration_secs=3.0, frequency=440.0)
    files = {"file": ("candidate_spoken_answer.wav", io.BytesIO(audio_wav), "audio/wav")}
    data = {
        "interview_id": interview_id,
        "question_id": question_id,
        "domain": question["domain"],
        "question_text": question["question_text"],
        "submission_mode": "voice_recorded"
    }
    upload_res = client.post("/api/voice/upload", files=files, data=data, headers=auth_headers)
    assert upload_res.status_code == 201
    audio_id = upload_res.json()["id"]
    
    # 2. Evaluate answer by passing ONLY audio_id (NO candidate_answer text)
    eval_payload = {
        "interview_id": interview_id,
        "question_id": question_id,
        "question_text": question["question_text"],
        "domain": question["domain"],
        "expected_criteria": question.get("expected_criteria", []),
        "candidate_answer": "",  # Empty text field: must be auto-resolved from audio_id!
        "audio_id": audio_id,
        "submission_mode": "voice_recorded",
        "interviewer_score": 7.5,
        "interviewer_notes": "Audio answer reviewed via voice playback."
    }
    eval_res = client.post("/api/evaluations/evaluate", json=eval_payload, headers=auth_headers)
    assert eval_res.status_code == 200
    eval_data = eval_res.json()
    
    assert eval_data["audio_id"] == audio_id
    assert eval_data["submission_mode"] == "voice_recorded"
    assert len(eval_data["candidate_answer"]) > 0  # Resolved internally
    assert "ai_evaluation" in eval_data
    # Active interview seals the evaluation to prevent anchoring bias
    assert eval_data["is_sealed"] is True
    assert eval_data["ai_evaluation"]["technical_score"] is None
    
    # 3. Test Interviewer Score Modification & Audit Trail Tracking
    # Interviewer updates score from 7.5 to 4.0
    eval_payload["interviewer_score"] = 4.0
    eval_payload["interviewer_notes"] = "After careful re-listening to the audio, candidate omitted edge cases."
    update_res = client.post("/api/evaluations/evaluate", json=eval_payload, headers=auth_headers)
    assert update_res.status_code == 200
    
    # Check that score change was recorded in audit trail endpoint
    audit_res = client.get(f"/api/evaluations/audit-trail/{interview_id}", headers=auth_headers)
    assert audit_res.status_code == 200
    audits = audit_res.json()
    assert len(audits) >= 2
    
    latest_audit = audits[0]
    assert latest_audit["question_id"] == question_id
    assert latest_audit["previous_score"] == 7.5
    assert latest_audit["new_score"] == 4.0
    assert "re-listening to the audio" in latest_audit["new_notes"]
    assert latest_audit["modified_by"] in ["Sarah Chen", "Sarah Jenkins"]
    
    # 4. Check historical takes endpoint preserves all recordings without overwriting
    takes_res = client.get(f"/api/voice/takes/{interview_id}/{question_id}", headers=auth_headers)
    assert takes_res.status_code == 200
    takes = takes_res.json()
    assert len(takes) >= 1
    assert any(t["id"] == audio_id for t in takes)
