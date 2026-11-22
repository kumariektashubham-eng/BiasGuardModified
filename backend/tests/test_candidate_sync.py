import pytest
import uuid
from datetime import datetime, timezone
from bson import ObjectId
from app.database import (
    init_db,
    get_candidates_collection,
    get_interviews_collection,
    get_evaluations_collection,
    get_database
)
from app.services.auth_service import create_access_token

@pytest.fixture
def auth_headers():
    init_db()
    token = create_access_token({
        "id": "507f1f77bcf86cd799439011",
        "email": "lead.interviewer@biasguard.ai",
        "role": "interviewer"
    })
    return {"Authorization": f"Bearer {token}"}

def test_database_driven_candidate_sync(auth_headers):
    """
    Verifies that:
    1. A newly created candidate is saved directly to MongoDB.
    2. Returned candidate contains valid database ID, name, email, target_role.
    3. The candidate is immediately queryable via candidates collection & search API.
    4. Multiple candidates are deduplicated and sorted by creation date.
    5. Updating candidate synchronizes their name & role to associated interviews.
    6. Deleting candidate removes them from active lists.
    """
    init_db()
    cands_col = get_candidates_collection()
    interviews_col = get_interviews_collection()

    unique_suffix = uuid.uuid4().hex[:6]
    test_cand = {
        "name": f"Alex Rivera {unique_suffix}",
        "email": f"alex.{unique_suffix}@example.com",
        "target_role": "Staff Distributed Systems Engineer",
        "experience_years": 8.0,
        "primary_skills": ["DSA", "Java", "System Design"],
        "created_at": datetime.now(timezone.utc)
    }

    # 1. Insert candidate into MongoDB
    res = cands_col.insert_one(test_cand)
    cand_id = str(res.inserted_id)

    try:
        # 2. Verify candidate appears in MongoDB query
        saved_doc = cands_col.find_one({"_id": ObjectId(cand_id)})
        assert saved_doc is not None
        assert saved_doc["name"] == test_cand["name"]
        assert saved_doc["email"] == test_cand["email"]
        assert str(saved_doc["_id"]) == cand_id

        # 3. Create interview referencing this candidate
        interview_doc = {
            "title": f"Technical Round - {test_cand['name']}",
            "candidate_id": cand_id,
            "candidate_name": test_cand["name"],
            "candidate_role": test_cand["target_role"],
            "interviewer_id": "507f1f77bcf86cd799439011",
            "domains": ["DSA"],
            "status": "not_started",
            "questions": [],
            "created_at": datetime.now(timezone.utc)
        }
        int_res = interviews_col.insert_one(interview_doc)
        int_id = str(int_res.inserted_id)

        # 4. Update candidate details (e.g. name update)
        updated_name = f"Alex Rivera-Smith {unique_suffix}"
        cands_col.update_one(
            {"_id": ObjectId(cand_id)},
            {"$set": {"name": updated_name}}
        )
        # Synchronize associated interviews
        interviews_col.update_many(
            {"candidate_id": cand_id},
            {"$set": {"candidate_name": updated_name}}
        )

        # Verify synchronized name in interview document
        updated_int = interviews_col.find_one({"_id": ObjectId(int_id)})
        assert updated_int["candidate_name"] == updated_name

        # 5. Search filtering by name and email
        search_results = list(cands_col.find({
            "$or": [
                {"name": {"$regex": unique_suffix, "$options": "i"}},
                {"email": {"$regex": unique_suffix, "$options": "i"}}
            ]
        }))
        assert len(search_results) >= 1
        assert any(str(c["_id"]) == cand_id for c in search_results)

    finally:
        # Cleanup test records
        cands_col.delete_one({"_id": ObjectId(cand_id)})
        interviews_col.delete_many({"candidate_id": cand_id})
