import logging
import re
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, Field
from typing import Optional
from bson import ObjectId

from app.services.auth_service import get_current_user
from app.services.livekit_service import (
    generate_interviewer_livekit_token,
    generate_candidate_livekit_token,
    check_livekit_service_status,
    get_room_name,
    get_clean_livekit_credentials
)
from app.services.email_service import is_token_expired
from app.database import (
    get_interviews_collection,
    get_candidates_collection
)
from app.config import settings

logger = logging.getLogger("biasguard.livekit_route")

router = APIRouter(prefix="/livekit", tags=["LiveKit Video"])

class InterviewerTokenRequest(BaseModel):
    interview_id: str = Field(..., description="Interview ID to join as interviewer")

class CandidateTokenRequest(BaseModel):
    invitation_token: str = Field(..., description="Raw invitation token provided to candidate")

def resolve_interview_document(interview_id_or_suffix: str, interviews_col):
    """
    Resilient lookup for an interview document:
    1. By exact 24-hex ObjectId.
    2. Stripping leading 'interview_' prefix if present.
    3. By hex suffix match (e.g. 6-character suffix like 'afb731').
    """
    clean_id = (interview_id_or_suffix or "").strip()
    if clean_id.startswith("interview_"):
        clean_id = clean_id[len("interview_"):]

    # 1. Direct ObjectId match
    try:
        doc = interviews_col.find_one({"_id": ObjectId(clean_id)})
        if doc:
            return doc
    except Exception:
        pass

    # 2. Suffix match if at least 4 hex characters
    if len(clean_id) >= 4:
        try:
            # Query all interview IDs to find matching suffix
            all_interviews = list(interviews_col.find({}, {"_id": 1}))
            for item in all_interviews:
                if str(item["_id"]).endswith(clean_id) or str(item["_id"]).lower().endswith(clean_id.lower()):
                    return interviews_col.find_one({"_id": item["_id"]})
        except Exception:
            pass

    return None

@router.get("/status")
def get_status():
    """Checks LiveKit server configuration status."""
    return check_livekit_service_status()

@router.post("/token/interviewer")
def get_interviewer_token(
    payload: InterviewerTokenRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Generates a LiveKit JWT token for an authenticated interviewer to join the video room.
    Ensures URL uses wss://, room name is canonical across roles, and token is fresh.
    """
    raw_interview_id = payload.interview_id.strip()
    interviews_col = get_interviews_collection()
    
    int_obj = resolve_interview_document(raw_interview_id, interviews_col)
    if not int_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Interview session not found for identifier '{raw_interview_id}'."
        )

    canonical_interview_id = str(int_obj["_id"])
    user_id = str(current_user.get("id") or current_user.get("_id", "interviewer"))
    user_name = current_user.get("name", "Interviewer")
    
    token = generate_interviewer_livekit_token(
        interview_id=canonical_interview_id,
        user_id=user_id,
        user_name=user_name
    )
    
    room_name = get_room_name(canonical_interview_id)
    url, _, _ = get_clean_livekit_credentials()
    logger.info(f"Generated interviewer LiveKit token for user {user_name} (room: {room_name})")
    
    return {
        "url": url,
        "token": token,
        "room_name": room_name,
        "identity": f"interviewer_{user_id}",
        "name": user_name,
        "is_interviewer": True,
        "interview_id": canonical_interview_id
    }

@router.post("/token/candidate")
def get_candidate_token(payload: CandidateTokenRequest):
    """
    Generates a LiveKit JWT token for a guest candidate using their valid time-limited invitation token.
    No permanent account or login required.
    Ensures URL uses wss://, room name matches interviewer canonical room, and token is fresh.
    """
    raw_token = payload.invitation_token.strip()
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation token is required.")

    from app.routes.interviews import find_interview_by_token
    interviews_col = get_interviews_collection()
    candidates_col = get_candidates_collection()
    interview = find_interview_by_token(raw_token)
    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Invalid interview invitation link or token not found."
        )

    invitation = interview.get("invitation", {})
    expires_at = invitation.get("expires_at")
    if is_token_expired(expires_at):
        raise HTTPException(
            status_code=status.HTTP_410_GONE, 
            detail="This interview invitation link has expired. Please contact the interviewer for a new link."
        )

    candidate_id = str(interview.get("candidate_id", ""))
    candidate_name = "Candidate"
    
    if candidate_id:
        try:
            cand = candidates_col.find_one({"_id": ObjectId(candidate_id)})
            if cand:
                candidate_name = cand.get("name", "Candidate")
        except Exception:
            pass

    canonical_interview_id = str(interview["_id"])
    token = generate_candidate_livekit_token(
        interview_id=canonical_interview_id,
        candidate_id=candidate_id or "guest",
        candidate_name=candidate_name
    )
    
    # Mark invitation as accepted if it was pending/sent
    if invitation.get("status") in ("pending", "sent"):
        from datetime import datetime, timezone
        interviews_col.update_one(
            {"_id": interview["_id"]},
            {"$set": {
                "invitation.status": "accepted",
                "invitation.accepted_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }}
        )

    room_name = get_room_name(canonical_interview_id)
    url, _, _ = get_clean_livekit_credentials()
    logger.info(f"Generated candidate LiveKit token for candidate {candidate_name} (room: {room_name})")

    return {
        "url": url,
        "token": token,
        "room_name": room_name,
        "identity": f"candidate_{candidate_id or 'guest'}",
        "name": candidate_name,
        "is_interviewer": False,
        "interview_id": canonical_interview_id,
        "interview_title": interview.get("title", "Technical Interview")
    }
