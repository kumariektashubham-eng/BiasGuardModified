import pytest
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_interviews_collection, get_candidates_collection, get_users_collection
from app.services.email_service import generate_invitation_token, hash_token
from app.services.auth_service import create_access_token

client = TestClient(app)

@pytest.fixture
def setup_test_interview():
    interviews_col = get_interviews_collection()
    candidates_col = get_candidates_collection()
    users_col = get_users_collection()

    now = datetime.now(timezone.utc)
    raw_token, token_hash, expires_at = generate_invitation_token(expiry_hours=24)

    # 1. Interviewer user
    user = users_col.find_one({"role": "interviewer"})
    if not user:
        u_id = users_col.insert_one({
            "name": "Live Test Interviewer",
            "email": "interviewer_live_test@biasguard.ai",
            "role": "interviewer"
        }).inserted_id
        user = {"_id": u_id, "name": "Live Test Interviewer", "email": "interviewer_live_test@biasguard.ai"}

    # 2. Candidate
    cand_id = candidates_col.insert_one({
        "name": "Live Test Candidate",
        "email": "candidate_live_test@example.com",
        "target_role": "Senior Cloud Engineer",
        "created_at": now
    }).inserted_id

    # 3. Interview with confidential rubrics and sample answers
    int_doc = {
        "title": "Cloud Systems Live Interview",
        "candidate_id": str(cand_id),
        "candidate_name": "Live Test Candidate",
        "candidate_role": "Senior Cloud Engineer",
        "candidate_email": "candidate_live_test@example.com",
        "interviewer_id": str(user["_id"]),
        "interviewer_name": user.get("name", "Interviewer"),
        "domains": ["Python", "DSA"],
        "status": "not_started",
        "questions": [
            {
                "id": "q_secret_1",
                "domain": "Python",
                "question_text": "Explain memory management and GIL in Python.",
                "difficulty": "Medium",
                "expected_criteria": [
                    "Reference counting and cyclic GC",
                    "GIL lock contention in multi-threaded CPU-bound programs",
                    "Confidential rubric criteria that candidate must never see"
                ],
                "sample_answer": "Top secret sample rubric answer for interviewer reference only.",
                "interviewer_score": 8.5,
                "interviewer_notes": "Confidential interviewer internal scratchpad notes",
                "candidate_answer": "",
                "transcription": ""
            }
        ],
        "current_question_index": 0,
        "invitation": {
            "token_hash": token_hash,
            "expires_at": expires_at,
            "status": "sent",
            "candidate_email": "candidate_live_test@example.com"
        },
        "created_at": now,
        "updated_at": now
    }
    int_id = interviews_col.insert_one(int_doc).inserted_id

    interviewer_jwt = create_access_token({"sub": user["email"], "role": "interviewer"})
    candidate_jwt = create_access_token({
        "sub": "candidate_live_test@example.com",
        "role": "candidate",
        "interview_id": str(int_id)
    })

    yield {
        "interview_id": str(int_id),
        "candidate_id": str(cand_id),
        "raw_token": raw_token,
        "token_hash": token_hash,
        "interviewer_jwt": interviewer_jwt,
        "candidate_jwt": candidate_jwt
    }

    # Teardown
    interviews_col.delete_one({"_id": int_id})
    candidates_col.delete_one({"_id": cand_id})

def test_invitation_endpoints_return_no_scores_or_rubrics(setup_test_interview):
    """
    TASK 2: Verify candidate invitation endpoints return zero scores, zero rubrics,
    zero expected criteria, and zero interviewer notes.
    """
    raw_token = setup_test_interview["raw_token"]
    res = client.get(f"/api/interviews/invitation/{raw_token}")
    assert res.status_code == 200
    data = res.json()

    assert data["valid"] is True
    assert "questions" in data
    assert len(data["questions"]) == 1

    q = data["questions"][0]
    # Public candidate payload MUST NOT leak any of these fields:
    assert "expected_criteria" not in q, "Candidate payload leaked expected_criteria!"
    assert "sample_answer" not in q, "Candidate payload leaked sample_answer!"
    assert "interviewer_score" not in q, "Candidate payload leaked interviewer_score!"
    assert "interviewer_notes" not in q, "Candidate payload leaked interviewer_notes!"
    assert "ai_evaluation" not in q, "Candidate payload leaked ai_evaluation!"
    assert "discrepancy" not in q, "Candidate payload leaked discrepancy!"

    # Current question also must be sanitized
    current_q = data.get("current_question")
    if current_q:
        assert "expected_criteria" not in current_q
        assert "sample_answer" not in current_q
        assert "interviewer_score" not in current_q
        assert "interviewer_notes" not in current_q

def test_candidate_token_rejected_on_all_interviewer_endpoints(setup_test_interview):
    """
    TASK 2: Verify candidate token gets 403 Forbidden on all interviewer operations.
    """
    candidate_jwt = setup_test_interview["candidate_jwt"]
    headers = {"Authorization": f"Bearer {candidate_jwt}"}
    int_id = setup_test_interview["interview_id"]

    # 1. Listing interviews
    res = client.get("/api/interviews", headers=headers)
    assert res.status_code == 403

    # 2. Getting single interview details (interviewer endpoint)
    res = client.get(f"/api/interviews/{int_id}", headers=headers)
    assert res.status_code == 403

    # 3. Creating interviews
    res = client.post("/api/interviews", headers=headers, json={"title": "Unauthorized"})
    assert res.status_code == 403

    # 4. Listing candidates
    res = client.get("/api/candidates", headers=headers)
    assert res.status_code == 403

    # 5. Listing reports
    res = client.get("/api/reports", headers=headers)
    assert res.status_code == 403

    # 6. Scoring evaluations
    res = client.post(
        "/api/evaluations/human-score",
        headers=headers,
        json={"interview_id": int_id, "question_id": "q1", "interviewer_score": 9.0}
    )
    assert res.status_code == 403

    # 7. Requesting interviewer LiveKit token
    res = client.post(
        "/api/livekit/token/interviewer",
        headers=headers,
        json={"interview_id": int_id}
    )
    assert res.status_code == 403

    # 8. Requesting live-status
    res = client.get(f"/api/interviews/{int_id}/live-status", headers=headers)
    assert res.status_code == 403

def test_livekit_tokens_and_live_presence_status(setup_test_interview):
    """
    TASK 3 & 4: Test LiveKit token generation for both candidate and interviewer,
    candidate activity updates, and interviewer live-status monitoring.
    """
    raw_token = setup_test_interview["raw_token"]
    int_id = setup_test_interview["interview_id"]
    interviewer_jwt = setup_test_interview["interviewer_jwt"]
    int_headers = {"Authorization": f"Bearer {interviewer_jwt}"}

    # 1. Candidate gets LiveKit token using invitation token (no bearer auth needed)
    cand_lk_res = client.post(
        "/api/livekit/token/candidate",
        json={"invitation_token": raw_token}
    )
    assert cand_lk_res.status_code == 200
    cand_lk_data = cand_lk_res.json()
    assert "token" in cand_lk_data
    assert cand_lk_data["is_interviewer"] is False
    assert cand_lk_data["room_name"] == f"interview_{int_id}"

    # Invalid invitation token rejected
    bad_lk_res = client.post(
        "/api/livekit/token/candidate",
        json={"invitation_token": "non_existent_token_1234"}
    )
    assert bad_lk_res.status_code == 404

    # 2. Interviewer gets LiveKit token
    int_lk_res = client.post(
        "/api/livekit/token/interviewer",
        headers=int_headers,
        json={"interview_id": int_id}
    )
    assert int_lk_res.status_code == 200
    int_lk_data = int_lk_res.json()
    assert "token" in int_lk_data
    assert int_lk_data["is_interviewer"] is True
    assert int_lk_data["room_name"] == f"interview_{int_id}"

    # 3. Candidate announces state (e.g. "recording")
    state_res = client.post(
        f"/api/interviews/invitation/{raw_token}/state",
        json={"state": "recording", "question_id": "q_secret_1"}
    )
    assert state_res.status_code == 200
    assert state_res.json()["activity"]["state"] == "recording"

    # 4. Interviewer polls live-status
    live_res = client.get(
        f"/api/interviews/{int_id}/live-status",
        headers=int_headers
    )
    assert live_res.status_code == 200
    live_data = live_res.json()

    assert live_data["candidate_status"] in ("joined", "in_session")
    assert live_data["candidate_activity"]["state"] == "recording"
    assert live_data["candidate_activity"]["question_id"] == "q_secret_1"
    assert live_data["total_questions"] == 1
    # Interviewer CAN see expected criteria on the live page
    assert "expected_criteria" in live_data["questions"][0]

    # 5. Candidate finishes answer and submits
    answer_res = client.post(
        f"/api/interviews/invitation/{raw_token}/answer",
        json={
            "question_id": "q_secret_1",
            "candidate_answer": "Python memory is handled by reference counting with cyclic garbage collection.",
            "submission_mode": "typed"
        }
    )
    assert answer_res.status_code == 200

    # 6. Candidate completes interview
    comp_res = client.post(f"/api/interviews/invitation/{raw_token}/complete")
    assert comp_res.status_code == 200

    # 7. Live status now reports "finished"
    live_after_comp = client.get(
        f"/api/interviews/{int_id}/live-status",
        headers=int_headers
    )
    assert live_after_comp.status_code == 200
    assert live_after_comp.json()["candidate_status"] == "finished"

def test_candidate_accept_and_decline_consent_endpoints(setup_test_interview):
    """
    Verifies that the candidate invitation endpoints correctly record consent upon Accept,
    and cleanly record refusal upon Decline without recording any media.
    """
    raw_token = setup_test_interview["raw_token"]
    int_id = setup_test_interview["interview_id"]

    # 1. Accept consent flow
    accept_res = client.post(f"/api/interviews/invitation/{raw_token}/accept")
    assert accept_res.status_code == 200
    accept_data = accept_res.json()
    assert accept_data["status"] == "accepted"
    assert accept_data["session_state"] == "candidate_joined"
    assert "consent_recorded_at" in accept_data
    assert accept_data["consent_recorded_at"] is not None

    # Verify interview invitation details reflect consent
    cand_details = client.get(f"/api/interviews/invitation/{raw_token}")
    assert cand_details.status_code == 200
    assert cand_details.json()["consent_recorded_at"] is not None
    assert cand_details.json()["session_state"] == "candidate_joined"

    # 2. Decline flow
    decline_res = client.post(f"/api/interviews/invitation/{raw_token}/decline")
    assert decline_res.status_code == 200
    decline_data = decline_res.json()
    assert decline_data["status"] == "declined"
    assert decline_data["session_state"] == "declined"

    # Verify live-status reflects refusal
    int_headers = {"Authorization": f"Bearer {setup_test_interview['interviewer_jwt']}"}
    live_res = client.get(f"/api/interviews/{int_id}/live-status", headers=int_headers)
    assert live_res.status_code == 200
    assert live_res.json()["session_state"] == "declined"

def test_interviewer_send_question_push_and_candidate_view(setup_test_interview):
    """
    Verifies the Question Push flow:
    - Interviewer pushes Question 1
    - Candidate receives only the pushed question text, with zero rubrics/criteria
    - Candidate cannot push questions (403 Forbidden)
    """
    raw_token = setup_test_interview["raw_token"]
    int_id = setup_test_interview["interview_id"]
    int_headers = {"Authorization": f"Bearer {setup_test_interview['interviewer_jwt']}"}
    cand_headers = {"Authorization": f"Bearer {setup_test_interview['candidate_jwt']}"}

    # 1. Candidate tries to push a question -> 403 Forbidden
    cand_push = client.post(
        f"/api/interviews/{int_id}/send-question",
        headers=cand_headers,
        json={"question_id": "q_secret_1", "question_index": 0}
    )
    assert cand_push.status_code == 403

    # 2. Interviewer pushes Question 1
    int_push = client.post(
        f"/api/interviews/{int_id}/send-question",
        headers=int_headers,
        json={"question_id": "q_secret_1", "question_index": 0}
    )
    assert int_push.status_code == 200
    push_data = int_push.json()
    assert push_data["status"] == "question_sent"
    assert push_data["session_state"] == "question_sent"
    assert push_data["question_id"] == "q_secret_1"

    # 3. Candidate fetches invitation details: gets pushed question sanitized
    cand_view = client.get(f"/api/interviews/invitation/{raw_token}")
    assert cand_view.status_code == 200
    cand_data = cand_view.json()

    assert cand_data["session_state"] == "question_sent"
    assert cand_data["pushed_question_id"] == "q_secret_1"
    assert cand_data["current_question"] is not None
    current_q = cand_data["current_question"]

    assert current_q["id"] == "q_secret_1"
    assert "question_text" in current_q
    assert "expected_criteria" not in current_q
    assert "sample_answer" not in current_q
    assert "interviewer_score" not in current_q
    assert "interviewer_notes" not in current_q

