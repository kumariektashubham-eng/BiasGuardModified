import pytest
import secrets
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock
from bson import ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_interviews_collection, get_candidates_collection, get_users_collection
from app.services.email_service import (
    generate_invitation_token,
    hash_token,
    is_token_expired,
    build_email_template,
    send_interview_invitation,
    validate_candidate_email
)
from app.services.auth_service import create_access_token, decode_token

client = TestClient(app)

def test_invitation_token_properties():
    """Verify secrets.token_urlsafe(32) generation, SHA-256 hash, and expiry."""
    raw_token, token_hash, expires_at = generate_invitation_token(expiry_hours=48)
    assert len(raw_token) >= 40
    assert len(token_hash) == 64
    assert hash_token(raw_token) == token_hash
    # Tampering with single character breaks the hash
    tampered = raw_token[:-1] + ('x' if raw_token[-1] != 'x' else 'y')
    assert hash_token(tampered) != token_hash
    assert expires_at > datetime.now(timezone.utc)
    assert not is_token_expired(expires_at)

def test_candidate_email_validation():
    """Verify email syntax validation."""
    assert validate_candidate_email("candidate@example.com") is True
    assert validate_candidate_email("john.doe+test@sub.domain.org") is True
    assert validate_candidate_email("not-an-email") is False
    assert validate_candidate_email("") is False
    assert validate_candidate_email(None) is False

def test_email_template_contains_all_requirements():
    """Verify email template has candidate name, title, domains, start button, raw URL, instructions."""
    raw_token, _, expires_at = generate_invitation_token(expiry_hours=48)
    invite_url = f"http://localhost:5173/interview-room/{raw_token}"
    plain, html = build_email_template(
        candidate_name="Sarah Connor",
        interview_title="Lead Distributed Systems Engineer",
        domains=["Python", "Kafka", "DSA"],
        invite_url=invite_url,
        expires_at=expires_at,
        interviewer_name="Alex Vance"
    )
    # Check plain text
    assert "Sarah Connor" in plain
    assert "Lead Distributed Systems Engineer" in plain
    assert invite_url in plain
    assert "Alex Vance" in plain
    assert "quiet room" in plain.lower()

    # Check HTML
    assert "Sarah Connor" in html
    assert "Interview" in html
    assert invite_url in html
    assert "Kafka" in html
    assert "Chrome" in html or "browser" in html

@pytest.mark.anyio
async def test_mocked_smtp_delivery():
    """Verify SMTP delivery with clean MAIL FROM address, STARTTLS, and login."""
    raw_token, _, _ = generate_invitation_token()
    
    with patch("app.config.settings.EMAIL_PROVIDER", "smtp"), \
         patch("app.config.settings.SMTP_HOST", "smtp.test.com"), \
         patch("app.config.settings.SMTP_PORT", 587), \
         patch("app.config.settings.SMTP_USER", "mailer@test.com"), \
         patch("app.config.settings.SMTP_PASSWORD", "testpass123"), \
         patch("app.config.settings.EMAIL_FROM", "BiasGuard AI <mailer@test.com>"), \
         patch("smtplib.SMTP") as mock_smtp_cls:
        
        mock_server = MagicMock()
        mock_smtp_cls.return_value.__enter__.return_value = mock_server

        result = await send_interview_invitation(
            candidate_name="John Doe",
            candidate_email="john.doe@example.com",
            interview_title="Senior Python Engineer",
            domains=["Python"],
            raw_token=raw_token,
            interview_id="test_int_mock_123"
        )

        assert result["status"] in ("sent", "sent_smtp")
        assert result["recipient"] == "john.doe@example.com"
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once_with("mailer@test.com", "testpass123")
        # Ensure envelope sender is bare email "mailer@test.com", not "BiasGuard AI <...>"
        sent_args = mock_server.sendmail.call_args[0]
        assert sent_args[0] == "mailer@test.com"
        assert sent_args[1] == ["john.doe@example.com"]

def test_candidate_scoped_jwt_rejection_on_interviewer_routes():
    """Verify candidate token cannot access interviewer endpoints (returns 403 Forbidden)."""
    cand_jwt = create_access_token({
        "sub": "candidate@example.com",
        "role": "candidate",
        "interview_id": "test_id"
    })
    
    headers = {"Authorization": f"Bearer {cand_jwt}"}
    # Attempt to list candidates (interviewer endpoint)
    res = client.get("/api/candidates", headers=headers)
    assert res.status_code == 403
    assert "Candidate tokens cannot access interviewer operations" in res.json()["detail"]

    # Attempt to list interviews (interviewer endpoint)
    res2 = client.get("/api/interviews", headers=headers)
    assert res2.status_code == 403

def test_invitation_lifecycle_api():
    """Test full API lifecycle: 404, valid session, 410 expired, answer submission, complete, 409 conflict."""
    interviews_col = get_interviews_collection()
    candidates_col = get_candidates_collection()
    
    # 1. Non-existent token -> 404
    res_404 = client.get("/api/interviews/invitation/non_existent_token_1234567890")
    assert res_404.status_code == 404
    assert "not found" in res_404.json()["detail"].lower()

    # 2. Create test interview in MongoDB
    raw_token, token_hash, expires_at = generate_invitation_token(expiry_hours=24)
    now = datetime.now(timezone.utc)
    
    test_doc = {
        "title": "API Test Interview",
        "candidate_id": "507f1f77bcf86cd799439011",
        "candidate_name": "Test Candidate",
        "candidate_role": "Backend Engineer",
        "candidate_email": "test.candidate@example.com",
        "interviewer_id": "interviewer_1",
        "interviewer_name": "Lead Interviewer",
        "domains": ["DSA"],
        "status": "not_started",
        "questions": [
            {
                "id": "q_test_1",
                "domain": "DSA",
                "question_text": "Describe binary search algorithm and its time complexity.",
                "difficulty": "Easy",
                "expected_criteria": ["O(log n) time", "Divide and conquer"],
                "sample_answer": "Secret rubric sample answer that candidates must NOT see",
                "interviewer_score": 9.5,
                "interviewer_notes": "Confidential interviewer evaluation notes",
                "candidate_answer": "",
                "transcription": ""
            }
        ],
        "current_question_index": 0,
        "invitation": {
            "token_hash": token_hash,
            "expires_at": expires_at,
            "status": "sent",
            "candidate_email": "test.candidate@example.com"
        },
        "created_at": now,
        "updated_at": now
    }
    insert_res = interviews_col.insert_one(test_doc)
    doc_id = insert_res.inserted_id

    try:
        # 3. Valid Invitation Validation -> 200
        res_valid = client.get(f"/api/interviews/invitation/{raw_token}")
        assert res_valid.status_code == 200
        data = res_valid.json()
        assert data["valid"] is True
        assert data["title"] == "API Test Interview"
        assert data["candidate_name"] == "Test Candidate"
        assert "candidate_token" in data
        assert len(data["questions"]) == 1
        q = data["questions"][0]
        # Confidential fields must be stripped from candidate payload!
        assert "sample_answer" not in q
        assert "interviewer_notes" not in q
        assert "interviewer_score" not in q
        assert "expected_criteria" not in q
        assert q["question_text"] == "Describe binary search algorithm and its time complexity."

        # 4. Start Session
        res_start = client.post(f"/api/interviews/invitation/{raw_token}/start")
        assert res_start.status_code == 200
        assert res_start.json()["status"] == "active"

        # 5. Submit Candidate Answer
        res_answer = client.post(
            f"/api/interviews/invitation/{raw_token}/answer",
            json={
                "question_id": "q_test_1",
                "candidate_answer": "Binary search divides the search interval in half each step with O(log n) time complexity.",
                "submission_mode": "text"
            }
        )
        assert res_answer.status_code == 200
        assert res_answer.json()["status"] == "success"

        # Verify answer was persisted in MongoDB
        saved_int = interviews_col.find_one({"_id": doc_id})
        assert "O(log n)" in saved_int["questions"][0]["candidate_answer"]

        # 6. Complete Interview
        res_complete = client.post(f"/api/interviews/invitation/{raw_token}/complete")
        assert res_complete.status_code == 200
        assert res_complete.json()["status"] == "completed"

        # 7. Accessing completed interview invitation -> 409 Conflict
        res_409 = client.get(f"/api/interviews/invitation/{raw_token}")
        assert res_409.status_code == 409
        assert "completed" in res_409.json()["detail"].lower()

        # 8. Test 410 Expired
        # Set expires_at in past
        interviews_col.update_one(
            {"_id": doc_id},
            {"$set": {
                "status": "not_started",
                "invitation.status": "sent",
                "invitation.expires_at": datetime.now(timezone.utc) - timedelta(hours=10)
            }}
        )
        res_410 = client.get(f"/api/interviews/invitation/{raw_token}")
        assert res_410.status_code == 410
        assert "expired" in res_410.json()["detail"].lower()

    finally:
        interviews_col.delete_one({"_id": doc_id})

def test_token_hash_only_storage_and_resend_invalidation():
    """Verify that MongoDB stores ONLY token_hash, resending invalidates old token, and returns new invite URL."""
    interviews_col = get_interviews_collection()
    candidates_col = get_candidates_collection()
    users_col = get_users_collection()
    
    # Authenticate interviewer
    interviewer = users_col.find_one({"role": "interviewer"})
    if not interviewer:
        i_id = users_col.insert_one({
            "name": "Test Interviewer",
            "email": "int_test@biasguard.ai",
            "role": "interviewer"
        }).inserted_id
        interviewer = {"_id": i_id, "name": "Test Interviewer", "email": "int_test@biasguard.ai"}

    int_token = create_access_token({"sub": interviewer["email"], "role": "interviewer"})
    auth_headers = {"Authorization": f"Bearer {int_token}"}

    # Create candidate
    cand_id = candidates_col.insert_one({
        "name": "Jane Test",
        "email": "jane.test@example.com",
        "target_role": "Backend Engineer",
        "created_at": datetime.now(timezone.utc)
    }).inserted_id

    try:
        # Create interview with send_invitation=True
        create_res = client.post(
            "/api/interviews",
            headers=auth_headers,
            json={
                "title": "Token Hash Storage Test",
                "candidate_id": str(cand_id),
                "domains": ["Python"],
                "questions": [
                    {
                        "domain": "Python",
                        "question_text": "Explain Python GIL.",
                        "difficulty": "Medium"
                    }
                ],
                "send_invitation": True,
                "candidate_email": "jane.test@example.com"
            }
        )
        assert create_res.status_code == 201
        created_data = create_res.json()
        interview_id = created_data["id"]

        # Verify in memory API response has invite_url and raw_token
        assert "invitation" in created_data
        raw_token_1 = created_data["invitation"]["raw_token"]
        assert raw_token_1 is not None
        assert created_data["invitation"]["invite_url"] is not None

        # Verify in MongoDB: raw_token and invite_url MUST NOT be stored!
        mongo_doc = interviews_col.find_one({"_id": ObjectId(interview_id)})
        assert "raw_token" not in mongo_doc["invitation"], "raw_token must never be persisted to MongoDB!"
        assert "invite_url" not in mongo_doc["invitation"], "invite_url must never be persisted to MongoDB!"
        assert "token_hash" in mongo_doc["invitation"]
        assert len(mongo_doc["invitation"]["token_hash"]) == 64
        assert mongo_doc["invitation"]["token_hash"] == hash_token(raw_token_1)

        # Initial link works
        res_link1 = client.get(f"/api/interviews/invitation/{raw_token_1}")
        assert res_link1.status_code == 200
        assert res_link1.json()["valid"] is True

        # Resend invitation
        resend_res = client.post(
            f"/api/interviews/{interview_id}/invite",
            headers=auth_headers,
            json={"candidate_email": "jane.test@example.com"}
        )
        assert resend_res.status_code == 200
        resend_data = resend_res.json()
        raw_token_2 = resend_data["raw_token"]
        assert raw_token_2 is not None
        assert raw_token_2 != raw_token_1, "Resend must issue a fresh raw token!"

        # MongoDB updated with new hash and raw_token is still absent
        mongo_doc_updated = interviews_col.find_one({"_id": ObjectId(interview_id)})
        assert "raw_token" not in mongo_doc_updated["invitation"]
        assert mongo_doc_updated["invitation"]["token_hash"] == hash_token(raw_token_2)

        # Old link MUST be invalidated (returns 404)
        res_old = client.get(f"/api/interviews/invitation/{raw_token_1}")
        assert res_old.status_code == 404
        assert "not found" in res_old.json()["detail"].lower()

        # New link MUST succeed
        res_new = client.get(f"/api/interviews/invitation/{raw_token_2}")
        assert res_new.status_code == 200
        assert res_new.json()["valid"] is True

    finally:
        candidates_col.delete_one({"_id": cand_id})
        interviews_col.delete_one({"_id": ObjectId(interview_id)})

def test_legacy_raw_token_graceful_migration():
    """Verify that legacy interview records with raw_token are transparently migrated to token_hash."""
    interviews_col = get_interviews_collection()
    raw_legacy = "legacy_test_token_abc_12345"
    future = datetime.now(timezone.utc) + timedelta(hours=24)
    
    doc = {
        "title": "Legacy Migration Interview",
        "candidate_id": "507f1f77bcf86cd799439011",
        "candidate_name": "Legacy Candidate",
        "candidate_role": "Tester",
        "domains": ["DSA"],
        "status": "not_started",
        "questions": [
            {
                "id": "q1",
                "domain": "DSA",
                "question_text": "What is a heap?",
                "difficulty": "Easy"
            }
        ],
        "invitation": {
            "raw_token": raw_legacy,
            "expires_at": future,
            "status": "sent",
            "candidate_email": "legacy@example.com"
        },
        "created_at": datetime.now(timezone.utc)
    }
    inserted = interviews_col.insert_one(doc)
    doc_id = inserted.inserted_id

    try:
        # Accessing with the legacy token works transparently
        res = client.get(f"/api/interviews/invitation/{raw_legacy}")
        assert res.status_code == 200
        assert res.json()["valid"] is True

        # Document in MongoDB has been migrated: token_hash is present and raw_token is unset
        migrated_doc = interviews_col.find_one({"_id": doc_id})
        assert "raw_token" not in migrated_doc["invitation"]
        assert migrated_doc["invitation"]["token_hash"] == hash_token(raw_legacy)

    finally:
        interviews_col.delete_one({"_id": doc_id})

def test_candidate_token_scoped_to_interview_id():
    """Verify candidate token for Interview A cannot upload audio to Interview B (returns 403 Forbidden)."""
    cand_token_a = create_access_token({
        "sub": "candidate@example.com",
        "role": "candidate",
        "interview_id": "interview_session_A"
    })
    
    headers = {"Authorization": f"Bearer {cand_token_a}"}
    fake_audio_content = b"RIFF....WAVEfmt ...."
    
    # Attempt upload to interview_session_B
    res = client.post(
        "/api/voice/upload",
        headers=headers,
        data={
            "interview_id": "interview_session_B",
            "question_id": "q1",
            "submission_mode": "voice_recorded"
        },
        files={"file": ("test.wav", fake_audio_content, "audio/wav")}
    )
    assert res.status_code == 403
    assert "Candidate token does not match" in res.json()["detail"]

def test_invitation_rate_limiting():
    """Verify that exceeding rate limit on invitation endpoints returns 429 Too Many Requests."""
    from app.routes.interviews import _invitation_request_history, INVITATION_RATE_LIMIT_MAX_REQUESTS
    import time
    
    # Clean history for test client
    _invitation_request_history.clear()
    
    # Populate history to max
    test_ip = "testclient"
    now = time.time()
    _invitation_request_history[test_ip] = [now] * INVITATION_RATE_LIMIT_MAX_REQUESTS

    # The next request from this IP must trigger 429
    res = client.get("/api/interviews/invitation/some_test_token")
    assert res.status_code == 429
    assert "Too many requests" in res.json()["detail"]
    
    # Reset history
    _invitation_request_history.clear()

def test_resend_invitation_mocked_smtp_reliability():
    """
    Task 4 verification:
    Verify that resend reliably regenerates token, invalidates old token,
    resets previously completed state so candidate can join,
    calls SMTP via STARTTLS with clean envelope sender,
    stores email_status='sent' and email_sent_at in MongoDB,
    and returns invite_url fallback in API response.
    """
    interviews_col = get_interviews_collection()
    candidates_col = get_candidates_collection()
    users_col = get_users_collection()

    # Authenticate interviewer
    interviewer = users_col.find_one({"role": "interviewer"})
    if not interviewer:
        i_id = users_col.insert_one({
            "name": "Reliability Lead",
            "email": "lead@biasguard.ai",
            "role": "interviewer"
        }).inserted_id
        interviewer = {"_id": i_id, "name": "Reliability Lead", "email": "lead@biasguard.ai"}

    int_token = create_access_token({"sub": interviewer["email"], "role": "interviewer"})
    auth_headers = {"Authorization": f"Bearer {int_token}"}

    # Initial token and completed interview setup
    raw_old_token, old_hash, _ = generate_invitation_token(expiry_hours=1)
    cand_id = candidates_col.insert_one({
        "name": "David Kim",
        "email": "david.kim@example.com",
        "target_role": "Platform Engineer"
    }).inserted_id

    doc_id = interviews_col.insert_one({
        "title": "Reliability Interview - David Kim",
        "candidate_id": str(cand_id),
        "candidate_name": "David Kim",
        "candidate_email": "david.kim@example.com",
        "domains": ["Python", "DSA"],
        "status": "completed",
        "completed_at": datetime.now(timezone.utc),
        "questions": [
            {
                "id": "q1",
                "domain": "DSA",
                "question_text": "Explain LRU cache implementation.",
                "difficulty": "Medium"
            }
        ],
        "invitation": {
            "token_hash": old_hash,
            "status": "completed",
            "completed_at": datetime.now(timezone.utc),
            "candidate_email": "david.kim@example.com"
        }
    }).inserted_id

    try:
        with patch("app.config.settings.EMAIL_PROVIDER", "smtp"), \
             patch("app.config.settings.SMTP_HOST", "smtp.test.com"), \
             patch("app.config.settings.SMTP_PORT", 587), \
             patch("app.config.settings.SMTP_USER", "smtp_user@biasguard.ai"), \
             patch("app.config.settings.SMTP_PASSWORD", "mock_pass_123"), \
             patch("app.config.settings.EMAIL_FROM", "BiasGuard AI <smtp_user@biasguard.ai>"), \
             patch("smtplib.SMTP") as mock_smtp_cls:

            mock_server = MagicMock()
            mock_smtp_cls.return_value.__enter__.return_value = mock_server

            # Trigger Resend
            res = client.post(
                f"/api/interviews/{str(doc_id)}/invite",
                headers=auth_headers,
                json={"candidate_email": "david.kim@example.com"}
            )

            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "sent"
            assert data["email_status"] == "sent"
            assert data["candidate_email"] == "david.kim@example.com"
            assert "invite_url" in data
            assert "raw_token" in data
            new_raw_token = data["raw_token"]
            assert new_raw_token != raw_old_token

            # Verify SMTP was called
            mock_server.starttls.assert_called_once()
            mock_server.login.assert_called_once_with("smtp_user@biasguard.ai", "mock_pass_123")
            sendmail_args = mock_server.sendmail.call_args[0]
            assert sendmail_args[0] == "smtp_user@biasguard.ai"
            assert sendmail_args[1] == ["david.kim@example.com"]

            # Verify MongoDB document state
            updated = interviews_col.find_one({"_id": doc_id})
            assert updated["status"] == "not_started", "Resend must reset completed status so session can be retaken"
            assert updated["email_status"] == "sent"
            assert updated["email_sent_at"] is not None
            assert updated["invitation"]["email_status"] == "sent"
            assert updated["invitation"]["status"] == "sent"
            assert updated["invitation"]["token_hash"] == hash_token(new_raw_token)

            # Old link must be invalidated (404)
            old_res = client.get(f"/api/interviews/invitation/{raw_old_token}")
            assert old_res.status_code == 404

            # New link must be active (200, valid session)
            new_res = client.get(f"/api/interviews/invitation/{new_raw_token}")
            assert new_res.status_code == 200
            assert new_res.json()["valid"] is True
            assert new_res.json()["status"] != "completed"

    finally:
        interviews_col.delete_one({"_id": doc_id})
        candidates_col.delete_one({"_id": cand_id})
