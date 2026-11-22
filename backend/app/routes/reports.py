from fastapi import APIRouter, HTTPException, status, Depends
from typing import List, Optional
from datetime import datetime
from bson import ObjectId
from app.database import (
    get_reports_collection,
    get_evaluations_collection,
    get_interviews_collection,
    serialize_doc
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("")
async def list_reports(
    current_user: dict = Depends(get_current_user)
):
    reports_col = get_reports_collection()
    cursor = reports_col.find({}).sort("updated_at", -1)
    return [serialize_doc(r) for r in cursor]

@router.get("/{id_or_interview_id}")
async def get_report_detail(
    id_or_interview_id: str,
    current_user: dict = Depends(get_current_user)
):
    reports_col = get_reports_collection()
    evaluations_col = get_evaluations_collection()
    interviews_col = get_interviews_collection()
    
    # Try finding by report _id or interview_id
    query = {"interview_id": id_or_interview_id}
    try:
        obj_id = ObjectId(id_or_interview_id)
        query = {"$or": [{"_id": obj_id}, {"interview_id": id_or_interview_id}]}
    except Exception:
        pass
        
    report = reports_col.find_one(query)
    
    # If not in reports_col yet, attempt to build on the fly from interview and evaluations
    if not report:
        try:
            int_obj = interviews_col.find_one({"_id": ObjectId(id_or_interview_id)})
            if int_obj:
                interview_id = str(int_obj["_id"])
                evals = list(evaluations_col.find({"interview_id": interview_id}))
                if evals:
                    from app.routes.evaluations import sync_interview_report
                    sync_interview_report(interview_id)
                    report = reports_col.find_one({"interview_id": interview_id})
        except Exception:
            pass

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation report not found for this identifier."
        )
        
    doc = serialize_doc(report)
    
    # Attach full single question evaluations
    interview_id = doc.get("interview_id")
    evals = list(evaluations_col.find({"interview_id": interview_id}).sort("evaluated_at", 1))
    doc["evaluations"] = [serialize_doc(e) for e in evals]
    
    return doc
