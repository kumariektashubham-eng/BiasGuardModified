import pytest
import uuid
from datetime import datetime, timezone
from bson import ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.database import (
    init_db,
    get_interviews_collection,
    get_evaluations_collection,
    get_candidates_collection,
)
from app.services.auth_service import create_access_token
from app.services.ai_evaluator import evaluate_with_mock_engine
from app.routes.evaluations import run_independent_ai_evaluation

client = TestClient(app)

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    init_db()

@pytest.fixture
def auth_headers():
    token = create_access_token({"sub": "interviewer@biasguard.ai", "role": "interviewer"})
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def test_interview_fixture():
    cands_col = get_candidates_collection()
    interviews_col = get_interviews_collection()
    evals_col = get_evaluations_collection()

    cand_oid = ObjectId()
    cand = {
        "_id": cand_oid,
        "name": "Maya Patel",
        "email": f"maya.{uuid.uuid4().hex[:6]}@example.com",
        "target_role": "Backend Java Architect",
        "status": "in_progress",
        "created_at": datetime.now(timezone.utc),
    }
    cands_col.insert_one(cand)

    int_oid = ObjectId()
    q_id = f"q_{uuid.uuid4().hex[:8]}"
    interview = {
        "_id": int_oid,
        "title": "Senior Java Architect Assessment",
        "candidate_id": str(cand_oid),
        "candidate_name": cand["name"],
        "candidate_role": cand["target_role"],
        "interviewer_id": "interviewer_001",
        "domains": ["Java", "Distributed Systems"],
        "status": "active",
        "current_question_index": 0,
        "questions": [
            {
                "id": q_id,
                "domain": "Java",
                "question_text": "Explain the internal structure of Java HashMap and how hash collisions are handled.",
                "difficulty": "Medium",
                "expected_criteria": ["Node array", "Treeify at 8 threshold", "O(1) average lookup"],
                "candidate_answer": "",
                "transcription": "",
                "audio_id": None,
                "evaluated": False,
            }
        ],
        "suggested_questions": [],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    interviews_col.insert_one(interview)

    yield {
        "candidate": cand,
        "interview": interview,
        "question_id": q_id,
        "interview_id": str(int_oid),
    }

    # Cleanup
    cands_col.delete_one({"_id": cand_oid})
    interviews_col.delete_one({"_id": int_oid})
    evals_col.delete_many({"interview_id": str(int_oid)})


def test_rubric_and_evidence_in_mock_engine():
    """Verify 4-part weighted rubric and evidence extraction."""
    # Valid answer
    good_answer = (
        "In Java, HashMap is built on a Node array. When keys have hash collisions, "
        "they are stored in linked lists. If a bucket reaches 8 elements, Java converts it "
        "into a balanced red-black tree (treeify) to improve search performance from O(N) to O(log N)."
    )
    result = evaluate_with_mock_engine(
        domain="Java",
        candidate_answer=good_answer,
        expected_criteria=["Node array", "Treeify at 8 threshold", "O(1) average lookup"],
        question_text="Explain the internal structure of Java HashMap and how hash collisions are handled.",
    )

    assert result["technical_score"] is not None
    assert result["technical_score"] >= 7.0
    assert result["score_breakdown"] is not None
    assert "technical_correctness" in result["score_breakdown"]
    assert "conceptual_understanding" in result["score_breakdown"]
    assert "completeness" in result["score_breakdown"]
    assert "reasoning" in result["score_breakdown"]
    assert len(result["evidence"]) > 0
    assert any(term in result["evidence"].lower() for term in ["tree", "collision", "node", "hashmap", "java"])

    # Empty answer should yield None score
    silent_result = evaluate_with_mock_engine(
        domain="Java",
        candidate_answer="",
        expected_criteria=["Node array"],
        question_text="Explain the internal structure of Java HashMap.",
    )
    assert silent_result["technical_score"] is None


def test_independent_evaluation_lifecycle_and_sealing(test_interview_fixture, auth_headers):
    """
    Validates complete double-blind independent evaluation workflow:
    1. Independent background AI evaluation runs without interviewer score.
    2. While interview is active, API masks/seals the AI score and explanations.
    3. Interviewer submits independent human score with audit trail.
    4. Concluding the interview unseals AI evaluation with full 4-part rubric and discrepancy metrics.
    """
    int_id = test_interview_fixture["interview_id"]
    q_id = test_interview_fixture["question_id"]

    answer_text = (
        "In Java, HashMap stores entries in an array of nodes. In case of collisions, "
        "elements are chained as a linked list until the bucket count reaches TREEIFY_THRESHOLD (8), "
        "at which point it transforms into a Red-Black tree providing O(log n) time complexity."
    )

    # Step 1: Run background independent AI evaluation
    eval_res = run_independent_ai_evaluation(
        interview_id=int_id,
        question_id=q_id,
        candidate_answer=answer_text,
        expected_criteria=["Node array", "TREEIFY_THRESHOLD 8", "Red-Black tree"],
        question_text="Explain the internal structure of Java HashMap and how hash collisions are handled.",
    )
    assert eval_res is not None
    eval_id = eval_res["id"]

    # Verify directly in MongoDB that it was stored with is_sealed = True
    evals_col = get_evaluations_collection()
    db_record = evals_col.find_one({"_id": ObjectId(eval_id)})
    assert db_record is not None
    assert db_record.get("is_sealed") is True
    # Real score is stored in DB, but must be masked in API while interview is active
    assert db_record.get("ai_evaluation", {}).get("technical_score") is not None

    # Step 2: Query API while interview is still 'active' -> must be masked/sealed
    resp_active = client.get(f"/api/evaluations/interview/{int_id}", headers=auth_headers)
    assert resp_active.status_code == 200
    active_evals = resp_active.json()
    assert len(active_evals) >= 1
    masked_eval = next(e for e in active_evals if e["question_id"] == q_id)
    assert masked_eval["is_sealed"] is True
    assert masked_eval["ai_evaluation"]["technical_score"] is None
    assert "Sealed" in masked_eval["ai_evaluation"]["explanation"] or "sealed" in masked_eval["ai_evaluation"]["explanation"]
    assert masked_eval["ai_evaluation"]["score_breakdown"] in (None, {})
    assert masked_eval["ai_evaluation"]["evidence"] == ""

    # Step 3: Interviewer assigns their independent score
    human_payload = {
        "interview_id": int_id,
        "question_id": q_id,
        "interviewer_score": 8.5,
        "interviewer_notes": "Candidate demonstrated solid understanding of treeify threshold and Red-Black tree mechanics.",
    }
    resp_score = client.post("/api/evaluations/human-score", json=human_payload, headers=auth_headers)
    assert resp_score.status_code == 200
    score_data = resp_score.json()
    assert score_data["interviewer_score"] == 8.5
    assert score_data["interviewer_notes"] == human_payload["interviewer_notes"]
    assert len(score_data["score_audit_trail"]) >= 1
    assert score_data["score_audit_trail"][0]["new_score"] == 8.5

    # Verify score update preserves and appends audit trail
    human_payload["interviewer_score"] = 9.0
    resp_score2 = client.post("/api/evaluations/human-score", json=human_payload, headers=auth_headers)
    assert resp_score2.status_code == 200
    score_data2 = resp_score2.json()
    assert score_data2["interviewer_score"] == 9.0
    assert len(score_data2["score_audit_trail"]) >= 2
    assert score_data2["score_audit_trail"][0]["new_score"] == 9.0
    assert score_data2["score_audit_trail"][0]["previous_score"] == 8.5

    # Also test audit trail endpoint
    resp_audits = client.get(f"/api/evaluations/audit-trail/{int_id}", headers=auth_headers)
    assert resp_audits.status_code == 200
    audits_list = resp_audits.json()
    assert len(audits_list) >= 2

    # Step 4: Conclude the interview via POST /api/interviews/{id}/end
    resp_end = client.post(f"/api/interviews/{int_id}/end", headers=auth_headers)
    assert resp_end.status_code == 200

    # Step 5: Query API after interview ended -> must now be unsealed!
    resp_completed = client.get(f"/api/evaluations/interview/{int_id}", headers=auth_headers)
    assert resp_completed.status_code == 200
    completed_evals = resp_completed.json()
    unsealed_eval = next(e for e in completed_evals if e["question_id"] == q_id)

    assert unsealed_eval["is_sealed"] is False
    assert unsealed_eval["ai_evaluation"]["technical_score"] is not None
    assert unsealed_eval["ai_evaluation"]["technical_score"] > 0
    assert unsealed_eval["interviewer_score"] == 9.0
    assert "score_breakdown" in unsealed_eval["ai_evaluation"]
    assert unsealed_eval["ai_evaluation"]["score_breakdown"]["technical_correctness"] > 0
    assert len(unsealed_eval["ai_evaluation"]["evidence"]) > 0
    # Discrepancy analysis should be computed
    assert "discrepancy" in unsealed_eval
    assert "score_delta" in unsealed_eval["discrepancy"]
    assert "severity" in unsealed_eval["discrepancy"]
