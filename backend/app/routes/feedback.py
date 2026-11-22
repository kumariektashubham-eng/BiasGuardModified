from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import List, Optional
from bson import ObjectId
from app.models.feedback import FeedbackCreate, FeedbackUpdateStatus, FeedbackResponse
from app.database import get_evaluation_feedbacks_collection, serialize_doc
from app.services.auth_service import get_current_user, require_admin
from app.services.feedback_service import submit_expert_feedback, list_feedbacks

router = APIRouter(prefix="/feedback", tags=["Human Feedback"])

@router.get("", response_model=List[FeedbackResponse])
async def get_feedbacks_list(
    status: Optional[str] = None,
    domain: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    return list_feedbacks(status=status, domain=domain)

@router.post("", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
async def create_feedback(
    feedback_in: FeedbackCreate,
    current_user: dict = Depends(get_current_user)
):
    try:
        record = submit_expert_feedback(feedback_in, current_user)
        return record
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to submit feedback: {e}")

@router.get("/{feedback_id}", response_model=FeedbackResponse)
async def get_feedback_detail(
    feedback_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        obj_id = ObjectId(feedback_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID format.")
    col = get_evaluation_feedbacks_collection()
    doc = col.find_one({"_id": obj_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Feedback not found.")
    return serialize_doc(doc)

@router.put("/{feedback_id}/status", response_model=FeedbackResponse)
async def update_status(
    feedback_id: str,
    status_update: FeedbackUpdateStatus,
    current_user: dict = Depends(require_admin)
):
    try:
        obj_id = ObjectId(feedback_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID format.")
    col = get_evaluation_feedbacks_collection()
    res = col.find_one_and_update(
        {"_id": obj_id},
        {"$set": {
            "status": status_update.status,
            "status_updated_by": current_user.get("name", "Admin")
        }},
        return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="Feedback not found.")
    return serialize_doc(res)
