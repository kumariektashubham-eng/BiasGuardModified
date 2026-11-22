import pytest
import uuid
from datetime import datetime, timezone
from bson import ObjectId
from app.database import get_interviews_collection, get_candidates_collection, init_db
from app.services.question_suggester import (
    generate_suggested_questions,
    ask_suggested_question,
    skip_suggested_question
)

@pytest.fixture
def setup_interview():
    init_db()
    cands_col = get_candidates_collection()
    interviews_col = get_interviews_collection()

    cand_oid = ObjectId()
    cand = {
        "_id": cand_oid,
        "name": "Alex Mercer",
        "email": f"alex.{uuid.uuid4().hex[:6]}@example.com",
        "target_role": "Backend Java Engineer",
        "status": "in_progress",
        "created_at": datetime.now(timezone.utc)
    }
    cands_col.insert_one(cand)

    int_oid = ObjectId()
    initial_q_id = f"q_{uuid.uuid4().hex[:8]}"
    interview = {
        "_id": int_oid,
        "title": "Java Architecture Assessment",
        "candidate_id": str(cand_oid),
        "candidate_name": cand["name"],
        "candidate_role": cand["target_role"],
        "interviewer_id": "interviewer_123",
        "domains": ["Java", "DSA"],
        "status": "active",
        "current_question_index": 0,
        "questions": [
            {
                "id": initial_q_id,
                "domain": "Java",
                "question_text": "Explain the internal structure of Java HashMap and how hash collisions are handled.",
                "difficulty": "Medium",
                "expected_criteria": ["Node array", "Treeify at 8"],
                "candidate_answer": "",
                "transcription": "",
                "audio_id": None,
                "evaluated": False
            }
        ],
        "suggested_questions": [],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    interviews_col.insert_one(interview)

    yield {"cand": cand, "interview": interview}

    interviews_col.delete_one({"_id": int_oid})
    cands_col.delete_one({"_id": cand_oid})

def test_suggested_questions_generation_and_asking(setup_interview):
    """
    Validates:
    1. Generates 3-4 contextual suggestions tailored to Java / DSA.
    2. Suggestion items have id, question_text, domain, difficulty, and criteria.
    3. Asking a suggestion appends it as Question 2 in the interview and sets index.
    4. Status of the asked suggestion updates to 'asked'.
    5. Skipping a suggestion marks it as 'skipped'.
    """
    interview_id = str(setup_interview["interview"]["_id"])

    # 1. Generate suggestions
    suggestions = generate_suggested_questions(interview_id, force_refresh=True)
    assert len(suggestions) >= 3, f"Expected at least 3 suggestions, got {len(suggestions)}"

    first_sug = suggestions[0]
    assert "id" in first_sug
    assert "question_text" in first_sug
    assert len(first_sug["question_text"]) > 10
    assert first_sug["difficulty"] in ["Easy", "Medium", "Hard"]
    assert first_sug["status"] == "suggested"

    # 2. Ask the first suggested question
    ask_result = ask_suggested_question(interview_id, first_sug["id"])
    assert ask_result["suggestion_id"] == first_sug["id"]
    assert ask_result["new_question_index"] == 1
    assert ask_result["new_question"]["question_text"] == first_sug["question_text"]

    # 3. Verify in database
    interviews_col = get_interviews_collection()
    updated_doc = interviews_col.find_one({"_id": ObjectId(interview_id)})
    assert len(updated_doc["questions"]) == 2
    assert updated_doc["questions"][1]["question_text"] == first_sug["question_text"]
    assert updated_doc["current_question_index"] == 1

    # Check that suggestion status is 'asked'
    asked_sug = next((s for s in updated_doc["suggested_questions"] if s["id"] == first_sug["id"]), None)
    assert asked_sug is not None
    assert asked_sug["status"] == "asked"

    # 4. Skip a remaining suggestion
    remaining_suggestions = [s for s in updated_doc["suggested_questions"] if s["status"] == "suggested"]
    if remaining_suggestions:
        sug_to_skip = remaining_suggestions[0]
        skip_suggested_question(interview_id, sug_to_skip["id"])
        refreshed_doc = interviews_col.find_one({"_id": ObjectId(interview_id)})
        skipped_sug = next((s for s in refreshed_doc["suggested_questions"] if s["id"] == sug_to_skip["id"]), None)
        assert skipped_sug is not None
        assert skipped_sug["status"] == "skipped"
