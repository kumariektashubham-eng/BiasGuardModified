import pytest
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_interviews_collection, get_users_collection, get_candidates_collection
from app.services.email_service import generate_invitation_token
from app.services.auth_service import create_access_token

client = TestClient(app)

@pytest.fixture
def setup_workflow_interview():
    interviews_col = get_interviews_collection()
    users_col = get_users_collection()

    interviewer = users_col.find_one({"role": "interviewer"})
    if not interviewer:
        i_id = users_col.insert_one({
            "name": "Live Interviewer",
            "email": "interviewer.workflow@biasguard.ai",
            "role": "interviewer"
        }).inserted_id
        interviewer_id = str(i_id)
        interviewer_email = "interviewer.workflow@biasguard.ai"
    else:
        interviewer_id = str(interviewer["_id"])
        interviewer_email = interviewer["email"]

    interviewer_jwt = create_access_token({"sub": interviewer_email, "role": "interviewer"})

    raw_token, token_hash, expires_at = generate_invitation_token(expiry_hours=24)
    now = datetime.now(timezone.utc)

    interview_doc = {
        "title": "Workflow Test Interview",
        "candidate_id": "507f1f77bcf86cd799439099",
        "candidate_name": "Workflow Candidate",
        "candidate_role": "Backend Engineer",
        "candidate_email": "candidate.workflow@example.com",
        "interviewer_id": interviewer_id,
        "interviewer_name": "Live Interviewer",
        "domains": ["DSA"],
        "status": "active",
        "session_state": "in_progress",
        "questions": [
            {
                "id": "q_wf_1",
                "domain": "DSA",
                "question_text": "Explain quicksort partitioning and worst case complexity.",
                "difficulty": "Medium",
                "expected_criteria": ["Lomuto or Hoare partitioning", "O(n^2) worst case", "O(n log n) average"],
                "sample_answer": "Confidential rubric answer",
                "interviewer_score": None,
                "interviewer_notes": "",
                "candidate_answer": "",
                "transcription": "",
                "question_state": "Ready",
                "answer_state": "Awaiting Response"
            },
            {
                "id": "q_wf_2",
                "domain": "DSA",
                "question_text": "How do you detect a cycle in a singly linked list?",
                "difficulty": "Easy",
                "expected_criteria": ["Floyd cycle detection", "Slow and fast pointers"],
                "sample_answer": "Confidential rubric answer 2",
                "interviewer_score": None,
                "interviewer_notes": "",
                "candidate_answer": "",
                "transcription": "",
                "question_state": "Ready",
                "answer_state": "Awaiting Response"
            }
        ],
        "current_question_index": 0,
        "invitation": {
            "token_hash": token_hash,
            "expires_at": expires_at,
            "status": "started",
            "candidate_email": "candidate.workflow@example.com"
        },
        "created_at": now,
        "updated_at": now
    }

    insert_res = interviews_col.insert_one(interview_doc)
    doc_id = insert_res.inserted_id

    yield {
        "interview_id": str(doc_id),
        "raw_token": raw_token,
        "interviewer_jwt": interviewer_jwt
    }

    interviews_col.delete_one({"_id": doc_id})

def test_full_candidate_submission_and_manual_next_question_workflow(setup_workflow_interview):
    raw_token = setup_workflow_interview["raw_token"]
    int_id = setup_workflow_interview["interview_id"]
    int_headers = {"Authorization": f"Bearer {setup_workflow_interview['interviewer_jwt']}"}

    # Step 1: Interviewer sends Question 1
    res_send = client.post(
        f"/api/interviews/{int_id}/send-question",
        headers=int_headers,
        json={"question_id": "q_wf_1", "question_index": 0}
    )
    assert res_send.status_code == 200
    assert res_send.json()["status"] == "question_sent"
    assert res_send.json()["question_id"] == "q_wf_1"

    # Step 2: Candidate retrieves invitation view and sees Question 1 active
    res_cand_view = client.get(f"/api/interviews/invitation/{raw_token}")
    assert res_cand_view.status_code == 200
    cand_data = res_cand_view.json()
    assert cand_data["current_question"] is not None
    assert cand_data["current_question"]["id"] == "q_wf_1"
    assert cand_data["current_question"]["question_text"] == "Explain quicksort partitioning and worst case complexity."
    assert cand_data["current_question"]["is_submitted"] is False

    # Step 3: Candidate clicks Stop & Submit Answer
    res_ans = client.post(
        f"/api/interviews/invitation/{raw_token}/answer",
        json={
            "question_id": "q_wf_1",
            "candidate_answer": "Quicksort uses a pivot to partition elements. Worst case O(n^2) when already sorted.",
            "transcription": "Quicksort uses a pivot to partition elements. Worst case O(n^2) when already sorted.",
            "submission_mode": "voice_recorded",
            "audio_url": "/api/voice/recording/rec_12345.webm",
            "recording_duration": 42.5
        }
    )
    assert res_ans.status_code == 200
    assert res_ans.json()["status"] == "success"

    # Step 4: Candidate view now reflects submitted answer and awaiting next question
    res_cand_view2 = client.get(f"/api/interviews/invitation/{raw_token}")
    cand_data2 = res_cand_view2.json()
    assert cand_data2["current_question"]["is_submitted"] is True

    # Step 5: Interviewer receives live-status notification and answer data
    res_live = client.get(f"/api/interviews/{int_id}/live-status", headers=int_headers)
    assert res_live.status_code == 200
    live_data = res_live.json()
    assert live_data["last_answered_question_id"] == "q_wf_1"
    assert live_data["questions"][0]["is_answered"] is True
    assert live_data["questions"][0]["question_state"] == "Answer Submitted"
    assert live_data["questions"][0]["answer_state"] == "Submitted"
    assert live_data["questions"][0]["audio_url"] == "/api/voice/recording/rec_12345.webm"

    # Step 6: Interviewer logs human score and notes
    res_score = client.post(
        "/api/evaluations/human-score",
        headers=int_headers,
        json={
            "interview_id": int_id,
            "question_id": "q_wf_1",
            "interviewer_score": 8.5,
            "interviewer_notes": "Clear explanation of partitioning and complexity."
        }
    )
    assert res_score.status_code == 200

    # Step 7: Interviewer clicks manual "Next Question"
    res_next = client.post(
        f"/api/interviews/{int_id}/next-question",
        headers=int_headers,
        json={"target_index": 1}
    )
    assert res_next.status_code == 200
    next_payload = res_next.json()
    assert next_payload["status"] == "success"
    assert next_payload["current_question_index"] == 1
    assert next_payload["question"]["id"] == "q_wf_2"
    assert next_payload["question"]["question_state"] == "Active"
    assert next_payload["question"]["answer_state"] == "Awaiting Response"

    # Step 8: Candidate immediately sees Question 2 on their screen
    res_cand_view3 = client.get(f"/api/interviews/invitation/{raw_token}")
    cand_data3 = res_cand_view3.json()
    assert cand_data3["current_question"]["id"] == "q_wf_2"
    assert cand_data3["current_question"]["is_submitted"] is False
    assert cand_data3["current_question"]["question_text"] == "How do you detect a cycle in a singly linked list?"

    # Step 9: Remote recording control test
    res_rec_ctrl = client.post(
        f"/api/interviews/{int_id}/recording-control",
        headers=int_headers,
        json={"action": "start", "question_id": "q_wf_2"}
    )
    assert res_rec_ctrl.status_code == 200
    assert res_rec_ctrl.json()["status"] == "ok"

    # Step 10: Interviewer adds and pushes custom question
    res_custom = client.post(
        f"/api/interviews/{int_id}/next-question",
        headers=int_headers,
        json={
            "custom_question": {
                "question_text": "What are the trade-offs of using optimistic locking in distributed systems?",
                "domain": "System Design",
                "difficulty": "Hard"
            }
        }
    )
    assert res_custom.status_code == 200
    custom_data = res_custom.json()
    assert custom_data["question"]["domain"] == "System Design"
    assert "optimistic locking" in custom_data["question"]["question_text"]
