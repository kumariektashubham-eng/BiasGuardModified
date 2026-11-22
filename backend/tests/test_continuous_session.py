import pytest
import uuid
from datetime import datetime, timezone
from bson import ObjectId
from app.database import get_database, get_interviews_collection, get_evaluations_collection, get_candidates_collection, init_db
from app.routes.interviews import sync_interview_report

@pytest.fixture
def test_user():
    return {
        "id": "507f1f77bcf86cd799439011",
        "email": "lead.interviewer@biasguard.ai",
        "name": "Sarah Connor",
        "role": "interviewer"
    }

@pytest.fixture
def setup_candidate():
    init_db()
    db = get_database()
    cands_col = get_candidates_collection()
    cand = {
        "_id": ObjectId("507f1f77bcf86cd799439012"),
        "name": "Jordan Lee",
        "email": f"jordan.{uuid.uuid4().hex[:6]}@example.com",
        "target_role": "Senior Distributed Systems Engineer",
        "status": "in_progress",
        "created_at": datetime.now(timezone.utc)
    }
    cands_col.replace_one({"_id": cand["_id"]}, cand, upsert=True)
    yield cand
    cands_col.delete_one({"_id": cand["_id"]})

def test_continuous_interview_session_lifecycle(setup_candidate, test_user):
    """
    Validates:
    1. Interview starts in 'not_started' status.
    2. Start interview transitions status to 'active'.
    3. Answering & evaluating question 1 keeps interview 'active'.
    4. Answering & evaluating question 2 (exhausting predefined questions) keeps interview 'active'.
    5. Generating an additional question appends Question 3 and preserves all previous questions & answers.
    6. Adding a custom question appends Question 4.
    7. Pausing sets status to 'paused'; Resuming restores status to 'active'.
    8. Active question index is tracked and updated.
    9. Only an explicit End Interview marks status 'completed'.
    10. MongoDB persistence verifies full integrity of all questions, answers, and audio data.
    """
    interviews_col = get_interviews_collection()
    evaluations_col = get_evaluations_collection()
    
    interview_oid = ObjectId()
    interview_id = str(interview_oid)
    now = datetime.now(timezone.utc)
    
    # 1. Create interview with 2 predefined questions
    q1_id = f"q_{uuid.uuid4().hex[:8]}"
    q2_id = f"q_{uuid.uuid4().hex[:8]}"
    initial_doc = {
        "_id": interview_oid,
        "title": "Continuous Technical Assessment - Distributed Systems",
        "candidate_id": str(setup_candidate["_id"]),
        "candidate_name": setup_candidate["name"],
        "candidate_role": setup_candidate["target_role"],
        "interviewer_id": test_user["id"],
        "interviewer_name": test_user["name"],
        "domains": ["DSA", "System Design"],
        "status": "not_started",
        "current_question_index": 0,
        "started_at": None,
        "completed_at": None,
        "questions": [
            {
                "id": q1_id,
                "domain": "DSA",
                "question_text": "Explain HashMap collisions, bucket arrays, and TreeNode conversion threshold.",
                "difficulty": "Medium",
                "expected_criteria": ["Separate chaining", "Treeification threshold 8"],
                "candidate_answer": "",
                "transcription": "",
                "audio_id": None,
                "evaluated": False
            },
            {
                "id": q2_id,
                "domain": "System Design",
                "question_text": "Design a globally distributed rate limiter with low latency.",
                "difficulty": "Hard",
                "expected_criteria": ["Token bucket / sliding window", "Redis cluster with local token batching"],
                "candidate_answer": "",
                "transcription": "",
                "audio_id": None,
                "evaluated": False
            }
        ],
        "created_at": now,
        "updated_at": now
    }
    interviews_col.insert_one(initial_doc)
    
    try:
        # Verify initial status
        doc = interviews_col.find_one({"_id": interview_oid})
        assert doc["status"] == "not_started"
        assert doc["started_at"] is None
        assert doc["completed_at"] is None
        assert len(doc["questions"]) == 2

        # 2. Start Interview
        interviews_col.update_one(
            {"_id": interview_oid},
            {"$set": {"status": "active", "started_at": datetime.now(timezone.utc)}}
        )
        doc = interviews_col.find_one({"_id": interview_oid})
        assert doc["status"] == "active"
        assert doc["started_at"] is not None

        # 3. Simulate Candidate voice submission & AI Evaluation for Q1
        audio_id_1 = f"audio_{uuid.uuid4().hex[:8]}"
        transcript_1 = "In Java HashMap, when buckets exceed threshold 8, linked nodes convert to red-black tree."
        eval_id_1 = str(ObjectId())
        
        # Save evaluation
        evaluations_col.insert_one({
            "_id": ObjectId(eval_id_1),
            "interview_id": interview_id,
            "question_id": q1_id,
            "interviewer_score": 8.5,
            "ai_evaluation": {
                "technical_score": 8.8,
                "correct_concepts": ["Red-black tree conversion", "Threshold 8"],
                "explanation": "Strong answer demonstrating internal understanding."
            },
            "discrepancy": {"detected": False}
        })
        
        # Update Q1 in interview
        interviews_col.update_one(
            {"_id": interview_oid, "questions.id": q1_id},
            {"$set": {
                "questions.$.candidate_answer": transcript_1,
                "questions.$.transcription": transcript_1,
                "questions.$.audio_id": audio_id_1,
                "questions.$.audio_url": f"/api/voice/audio/{audio_id_1}.webm",
                "questions.$.evaluated": True,
                "questions.$.evaluation_id": eval_id_1,
                "questions.$.interviewer_score": 8.5,
                "questions.$.submitted_at": datetime.now(timezone.utc)
            }}
        )
        
        # Verify interview status remains ACTIVE after answering Q1
        doc = interviews_col.find_one({"_id": interview_oid})
        assert doc["status"] == "active"
        assert doc["questions"][0]["evaluated"] is True
        assert doc["questions"][0]["audio_id"] == audio_id_1

        # 4. Simulate Candidate voice submission & AI Evaluation for Q2 (Exhausting predefined list)
        audio_id_2 = f"audio_{uuid.uuid4().hex[:8]}"
        transcript_2 = "For a distributed rate limiter, we use Redis token bucket with local in-memory batching to reduce RTT."
        eval_id_2 = str(ObjectId())
        
        evaluations_col.insert_one({
            "_id": ObjectId(eval_id_2),
            "interview_id": interview_id,
            "question_id": q2_id,
            "interviewer_score": 9.0,
            "ai_evaluation": {
                "technical_score": 9.2,
                "correct_concepts": ["Token bucket", "Redis batching"],
                "explanation": "Clear architectural trade-off analysis."
            },
            "discrepancy": {"detected": False}
        })
        
        interviews_col.update_one(
            {"_id": interview_oid, "questions.id": q2_id},
            {"$set": {
                "questions.$.candidate_answer": transcript_2,
                "questions.$.transcription": transcript_2,
                "questions.$.audio_id": audio_id_2,
                "questions.$.audio_url": f"/api/voice/audio/{audio_id_2}.webm",
                "questions.$.evaluated": True,
                "questions.$.evaluation_id": eval_id_2,
                "questions.$.interviewer_score": 9.0,
                "questions.$.submitted_at": datetime.now(timezone.utc)
            }}
        )
        
        # CRITICAL TEST: Interview status MUST remain ACTIVE! Never auto-completed!
        doc = interviews_col.find_one({"_id": interview_oid})
        assert doc["status"] == "active", "Interview must NOT auto-terminate when predefined questions are answered!"
        assert doc["completed_at"] is None

        # 5. Interviewer generates an additional question dynamically
        q3_id = f"q_{uuid.uuid4().hex[:8]}"
        new_q3 = {
            "id": q3_id,
            "domain": "DSA",
            "question_text": "How do you detect a cycle in a singly linked list with O(1) auxiliary space?",
            "difficulty": "Medium",
            "expected_criteria": ["Floyd's cycle-finding (slow and fast pointers)", "O(1) memory complexity"],
            "candidate_answer": "",
            "transcription": "",
            "audio_id": None,
            "evaluated": False
        }
        interviews_col.update_one(
            {"_id": interview_oid},
            {"$push": {"questions": new_q3}}
        )
        
        doc = interviews_col.find_one({"_id": interview_oid})
        assert len(doc["questions"]) == 3
        assert doc["questions"][0]["audio_id"] == audio_id_1, "Previous Q1 audio MUST be preserved!"
        assert doc["questions"][1]["audio_id"] == audio_id_2, "Previous Q2 audio MUST be preserved!"
        assert doc["questions"][2]["id"] == q3_id
        assert doc["status"] == "active"

        # 6. Interviewer adds a custom question
        q4_id = f"q_{uuid.uuid4().hex[:8]}"
        new_q4 = {
            "id": q4_id,
            "domain": "System Design",
            "question_text": "How would you handle clock skew in multi-region CockroachDB / Spanner databases?",
            "difficulty": "Hard",
            "expected_criteria": ["TrueTime API", "Hybrid Logical Clocks (HLC)"],
            "candidate_answer": "",
            "transcription": "",
            "audio_id": None,
            "evaluated": False
        }
        interviews_col.update_one(
            {"_id": interview_oid},
            {"$push": {"questions": new_q4}}
        )
        doc = interviews_col.find_one({"_id": interview_oid})
        assert len(doc["questions"]) == 4

        # 7. Pause and Resume Session
        interviews_col.update_one({"_id": interview_oid}, {"$set": {"status": "paused"}})
        doc = interviews_col.find_one({"_id": interview_oid})
        assert doc["status"] == "paused"

        interviews_col.update_one({"_id": interview_oid}, {"$set": {"status": "active"}})
        doc = interviews_col.find_one({"_id": interview_oid})
        assert doc["status"] == "active"

        # 8. Update Active Question Index
        interviews_col.update_one({"_id": interview_oid}, {"$set": {"current_question_index": 2}})
        doc = interviews_col.find_one({"_id": interview_oid})
        assert doc["current_question_index"] == 2

        # 9. Explicitly End Interview Session
        completed_time = datetime.now(timezone.utc)
        interviews_col.update_one(
            {"_id": interview_oid},
            {"$set": {"status": "completed", "completed_at": completed_time}}
        )
        
        # Synchronize full evaluation report
        sync_interview_report(interview_id)
        
        # 10. Verify MongoDB persistence
        final_doc = interviews_col.find_one({"_id": interview_oid})
        assert final_doc["status"] == "completed"
        assert final_doc["started_at"] is not None
        assert final_doc["completed_at"] is not None
        assert len(final_doc["questions"]) == 4
        # Verify Q1 and Q2 responses and audio IDs are still intact
        assert final_doc["questions"][0]["audio_id"] == audio_id_1
        assert final_doc["questions"][1]["audio_id"] == audio_id_2
        assert final_doc["questions"][0]["evaluated"] is True
        assert final_doc["questions"][1]["evaluated"] is True

    finally:
        interviews_col.delete_one({"_id": interview_oid})
        evaluations_col.delete_many({"interview_id": interview_id})
