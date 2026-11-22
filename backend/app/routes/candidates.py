import os
import logging
from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import List, Optional
from datetime import datetime, timezone
from bson import ObjectId
from app.models.candidate import CandidateCreate, CandidateUpdate, CandidateResponse
from app.database import (
    get_candidates_collection,
    get_interviews_collection,
    get_evaluations_collection,
    get_reports_collection,
    get_audio_recordings_collection,
    serialize_doc
)
from app.services.auth_service import get_current_user

logger = logging.getLogger("biasguard.candidates")

router = APIRouter(prefix="/candidates", tags=["Candidates"])

@router.get("", response_model=List[CandidateResponse])
async def list_candidates(
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    candidates_col = get_candidates_collection()
    interviews_col = get_interviews_collection()
    evaluations_col = get_evaluations_collection()
    
    query = {}
    if search:
        query = {
            "$or": [
                {"name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"target_role": {"$regex": search, "$options": "i"}}
            ]
        }
        
    cursor = candidates_col.find(query).sort("created_at", -1)
    results = []
    
    for c in cursor:
        c_id = str(c["_id"])
        # compute interview count and avg score
        int_count = interviews_col.count_documents({"candidate_id": c_id})
        evals = list(evaluations_col.find({"candidate_id": c_id}))
        avg_score = 0.0
        if evals:
            scores = [float(e["ai_evaluation"]["technical_score"]) for e in evals if "ai_evaluation" in e and "technical_score" in e["ai_evaluation"]]
            if scores:
                avg_score = round(sum(scores) / len(scores), 1)
                
        doc = serialize_doc(c)
        doc["interviews_count"] = int_count
        doc["average_score"] = avg_score
        results.append(doc)
        
    return results

@router.post("", response_model=CandidateResponse, status_code=status.HTTP_201_CREATED)
async def create_candidate(
    candidate_in: CandidateCreate,
    current_user: dict = Depends(get_current_user)
):
    candidates_col = get_candidates_collection()
    
    # Check if candidate email already exists
    existing = candidates_col.find_one({"email": candidate_in.email.lower()})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A candidate with this email address already exists."
        )
        
    now = datetime.now(timezone.utc)
    new_cand = candidate_in.model_dump()
    new_cand["email"] = new_cand["email"].lower()
    new_cand["created_at"] = now
    
    result = candidates_col.insert_one(new_cand)
    new_cand["_id"] = result.inserted_id
    doc = serialize_doc(new_cand)
    doc["interviews_count"] = 0
    doc["average_score"] = 0.0
    return doc

@router.get("/{candidate_id}")
async def get_candidate(
    candidate_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        obj_id = ObjectId(candidate_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid candidate ID format.")
        
    candidates_col = get_candidates_collection()
    cand = candidates_col.find_one({"_id": obj_id})
    if not cand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")
        
    # Get associated interviews and evaluations
    interviews_col = get_interviews_collection()
    evaluations_col = get_evaluations_collection()
    
    interviews = list(interviews_col.find({"candidate_id": candidate_id}).sort("created_at", -1))
    evaluations = list(evaluations_col.find({"candidate_id": candidate_id}).sort("evaluated_at", -1))
    
    doc = serialize_doc(cand)
    doc["interviews"] = [serialize_doc(i) for i in interviews]
    doc["evaluations"] = [serialize_doc(e) for e in evaluations]
    
    if evaluations:
        scores = [float(e["ai_evaluation"]["technical_score"]) for e in evaluations if "ai_evaluation" in e and "technical_score" in e["ai_evaluation"]]
        doc["average_score"] = round(sum(scores) / len(scores), 1) if scores else 0.0
    else:
        doc["average_score"] = 0.0
        
    doc["interviews_count"] = len(interviews)
    return doc

@router.put("/{candidate_id}", response_model=CandidateResponse)
async def update_candidate(
    candidate_id: str,
    candidate_update: CandidateUpdate,
    current_user: dict = Depends(get_current_user)
):
    try:
        obj_id = ObjectId(candidate_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid candidate ID format.")
        
    candidates_col = get_candidates_collection()
    cand = candidates_col.find_one({"_id": obj_id})
    if not cand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")

    update_data = {k: v for k, v in candidate_update.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided for update.")

    # Check email uniqueness if email is changed
    if "email" in update_data and update_data["email"]:
        update_data["email"] = update_data["email"].lower()
        if update_data["email"] != cand.get("email", "").lower():
            existing = candidates_col.find_one({
                "email": update_data["email"],
                "_id": {"$ne": obj_id}
            })
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Another candidate with this email address already exists."
                )

    res = candidates_col.find_one_and_update(
        {"_id": obj_id},
        {"$set": update_data},
        return_document=True
    )
    if not res:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")

    # Synchronize candidate_name and candidate_role in associated interviews and reports
    interviews_col = get_interviews_collection()
    reports_col = get_reports_collection()
    sync_fields = {}
    if "name" in update_data:
        sync_fields["candidate_name"] = update_data["name"]
    if "target_role" in update_data:
        sync_fields["candidate_role"] = update_data["target_role"]

    if sync_fields:
        interviews_col.update_many({"candidate_id": candidate_id}, {"$set": sync_fields})
        reports_col.update_many({"candidate_id": candidate_id}, {"$set": sync_fields})

    # Compute stats for response
    evaluations_col = get_evaluations_collection()
    int_count = interviews_col.count_documents({"candidate_id": candidate_id})
    evals = list(evaluations_col.find({"candidate_id": candidate_id}))
    avg_score = 0.0
    if evals:
        scores = [
            float(e["ai_evaluation"]["technical_score"])
            for e in evals
            if "ai_evaluation" in e and "technical_score" in e["ai_evaluation"]
        ]
        if scores:
            avg_score = round(sum(scores) / len(scores), 1)

    doc = serialize_doc(res)
    doc["interviews_count"] = int_count
    doc["average_score"] = avg_score
    return doc

@router.delete("/{candidate_id}")
async def delete_candidate(
    candidate_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        obj_id = ObjectId(candidate_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid candidate ID format.")
        
    candidates_col = get_candidates_collection()
    cand = candidates_col.find_one({"_id": obj_id})
    if not cand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")

    cand_name = cand.get("name", "Candidate")

    # 1. Safely remove candidate's audio recording files and collection entries
    try:
        audio_col = get_audio_recordings_collection()
        recordings = list(audio_col.find({"candidate_id": candidate_id}))
        for rec in recordings:
            filepath = rec.get("filepath")
            if filepath and os.path.exists(filepath):
                try:
                    os.remove(filepath)
                except Exception as file_err:
                    logger.warning(f"Failed to remove candidate audio file {filepath}: {file_err}")
        audio_col.delete_many({"candidate_id": candidate_id})
    except Exception as e:
        logger.warning(f"Error while cleaning up candidate audio recordings: {e}")

    # 2. Delete candidate evaluations
    evaluations_col = get_evaluations_collection()
    evaluations_col.delete_many({"candidate_id": candidate_id})

    # 3. Delete candidate reports
    reports_col = get_reports_collection()
    reports_col.delete_many({"candidate_id": candidate_id})

    # 4. Delete candidate-specific interviews (shared question templates remain intact)
    interviews_col = get_interviews_collection()
    interviews_col.delete_many({"candidate_id": candidate_id})

    # 5. Delete candidate profile
    candidates_col.delete_one({"_id": obj_id})

    return {
        "status": "success",
        "message": f"Candidate '{cand_name}' and all associated interview records were deleted successfully."
    }
