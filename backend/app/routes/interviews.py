import logging
import json
import asyncio
from fastapi import APIRouter, HTTPException, status, Depends, Query, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from collections import defaultdict
import time
import uuid
from bson import ObjectId
from pydantic import BaseModel, Field
from app.models.interview import (
    InterviewCreate, 
    InterviewUpdate, 
    InterviewResponse, 
    QuestionItem,
    SuggestedQuestionItem,
    GenerateSuggestedQuestionsRequest,
    SendInvitationRequest,
    InterviewInvitation
)
from app.database import (
    get_interviews_collection,
    get_candidates_collection,
    get_evaluations_collection,
    get_users_collection,
    serialize_doc
)
from app.services.auth_service import get_current_user, get_optional_current_user, decode_token, create_access_token
from app.routes.evaluations import sync_interview_report, unseal_all_interview_evaluations, run_independent_ai_evaluation
from app.services.question_suggester import (
    generate_suggested_questions as service_generate_suggested_questions,
    ask_suggested_question as service_ask_suggested_question,
    skip_suggested_question as service_skip_suggested_question
)
from app.services.email_service import (
    generate_invitation_token,
    hash_token,
    is_token_expired,
    send_interview_invitation,
    validate_candidate_email
)
from app.services.livekit_service import get_room_name, check_livekit_service_status
from app.config import settings

logger = logging.getLogger("biasguard.interviews")

router = APIRouter(prefix="/interviews", tags=["Interviews"])

DEFAULT_QUESTION_TEMPLATES = [
    {
        "domain": "DSA",
        "question_text": "Given an array of integers and an integer target, how would you find indices of the two numbers such that they add up to target? What are the time and space complexity trade-offs between different approaches?",
        "difficulty": "Medium",
        "expected_criteria": [
            "Brute force O(n^2) time comparison",
            "Hash Map O(n) time and O(n) space optimization",
            "Two-pointer approach O(n log n) if sorted, with O(1) space",
            "Handling duplicates and single-pass iteration"
        ]
    },
    {
        "domain": "DSA",
        "question_text": "Explain how you would detect a cycle in a singly linked list. If a cycle exists, how do you identify the node where the cycle begins?",
        "difficulty": "Medium",
        "expected_criteria": [
            "Floyd's Cycle-Finding Algorithm (Tortoise and Hare fast/slow pointers)",
            "O(n) time and O(1) auxiliary space requirement",
            "Alternative hash set approach tracking visited pointers (O(n) space)",
            "Mathematical proof of pointer reset to head to find cycle origin"
        ]
    },
    {
        "domain": "SQL",
        "question_text": "Write a SQL query to find the second highest salary from an Employee table without using the LIMIT or TOP clause. Explain why your query works across different SQL dialects.",
        "difficulty": "Medium",
        "expected_criteria": [
            "Subquery with MAX(salary) < (SELECT MAX(salary) FROM Employee)",
            "Alternative using DENSE_RANK() OVER (ORDER BY salary DESC)",
            "Handling NULL cases when fewer than two distinct salaries exist",
            "Performance difference with indexing on salary column"
        ]
    },
    {
        "domain": "DBMS",
        "question_text": "What is Database Normalization? Walk through 1NF, 2NF, 3NF, and BCNF with examples, and discuss scenarios where de-normalization is deliberately preferred in production.",
        "difficulty": "Hard",
        "expected_criteria": [
            "1NF: Atomic values and elimination of repeating groups",
            "2NF: Full functional dependency on primary key (no partial dependency)",
            "3NF: Elimination of transitive functional dependencies",
            "BCNF: For every functional dependency X -> Y, X must be a super key",
            "De-normalization trade-offs: Read-heavy OLAP workloads, reducing costly JOINs, caching"
        ]
    },
    {
        "domain": "Python",
        "question_text": "Explain Python's Global Interpreter Lock (GIL). What problem does it solve in CPython, what limitations does it impose on multi-threaded CPU-bound programs, and how do you achieve true parallelism?",
        "difficulty": "Medium",
        "expected_criteria": [
            "CPython reference counting memory management thread-safety",
            "Single-core execution constraint for CPU-bound threads",
            "Thread release during I/O operations (network, disk)",
            "True parallelism via multiprocessing, Cython C-extensions, or subinterpreters (PEP 684)"
        ]
    },
    {
        "domain": "Java",
        "question_text": "Explain the internal working of HashMap in Java. How does it handle hash collisions in Java 8+, and why is overriding hashCode() mandatory when overriding equals()?",
        "difficulty": "Hard",
        "expected_criteria": [
            "Array of Node/Entry buckets with hash calculation and bitwise indexing",
            "Collision handling via LinkedList converting to Red-Black Tree (TREEIFY_THRESHOLD = 8)",
            "equals() and hashCode() contract: equal objects must produce identical hash codes",
            "Load factor (0.75) and capacity resizing implications"
        ]
    },
    {
        "domain": "Operating Systems",
        "question_text": "What is Deadlock in operating systems? State the four Coffman conditions necessary for deadlock to occur, and explain one deadlock prevention and one deadlock detection technique.",
        "difficulty": "Hard",
        "expected_criteria": [
            "Four Coffman conditions: Mutual Exclusion, Hold & Wait, No Preemption, Circular Wait",
            "Resource allocation graph (RAG) cycle detection",
            "Banker's Algorithm for deadlock avoidance (safe vs unsafe states)",
            "Prevention by breaking circular wait through ordered resource acquisition"
        ]
    }
]

@router.get("/templates/questions")
async def get_question_templates(current_user: dict = Depends(get_current_user)):
    """Provides curated standard questions for technical domains."""
    return DEFAULT_QUESTION_TEMPLATES

@router.get("", response_model=List[InterviewResponse])
async def list_interviews(
    domain: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    interviews_col = get_interviews_collection()
    candidates_col = get_candidates_collection()
    evaluations_col = get_evaluations_collection()
    
    query = {}
    if domain:
        query["domains"] = {"$in": [domain]}
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"candidate_name": {"$regex": search, "$options": "i"}}
        ]
        
    cursor = interviews_col.find(query).sort("created_at", -1)
    results = []
    
    for item in cursor:
        doc = serialize_doc(item)
        i_id = doc["id"]
        
        # Calculate evaluation progress
        evals = list(evaluations_col.find({"interview_id": i_id}))
        doc["total_questions"] = len(doc.get("questions", []))
        doc["evaluated_questions"] = len(evals)
        
        discrepancies = sum(1 for e in evals if e.get("discrepancy", {}).get("detected"))
        doc["discrepancy_count"] = discrepancies
        
        ai_scores = [float(e["ai_evaluation"]["technical_score"]) for e in evals if "ai_evaluation" in e and "technical_score" in e["ai_evaluation"]]
        int_scores = [float(e["interviewer_score"]) for e in evals if e.get("interviewer_score") is not None]
        
        doc["average_ai_score"] = round(sum(ai_scores) / len(ai_scores), 1) if ai_scores else None
        doc["average_interviewer_score"] = round(sum(int_scores) / len(int_scores), 1) if int_scores else None
        doc["current_question_index"] = item.get("current_question_index", 0)
        doc["started_at"] = item.get("started_at")
        doc["completed_at"] = item.get("completed_at")
        
        results.append(doc)
        
    return results

class CandidateAnswerSubmission(BaseModel):
    question_id: str
    candidate_answer: Optional[str] = ""
    transcription: Optional[str] = ""
    submission_mode: Optional[str] = "text"
    audio_url: Optional[str] = None
    video_url: Optional[str] = None
    recording_duration: Optional[float] = None

@router.post("", response_model=InterviewResponse, status_code=status.HTTP_201_CREATED)
async def create_interview(
    interview_in: InterviewCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    candidates_col = get_candidates_collection()
    interviews_col = get_interviews_collection()
    
    # Verify candidate
    try:
        cand = candidates_col.find_one({"_id": ObjectId(interview_in.candidate_id)})
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid candidate ID.")
        
    if not cand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")
        
    now = datetime.now(timezone.utc)
    
    # Ensure every question has a unique ID
    questions_list = []
    for q in interview_in.questions:
        q_dict = q.model_dump()
        if not q_dict.get("id"):
            q_dict["id"] = f"q_{uuid.uuid4().hex[:8]}"
        questions_list.append(q_dict)
        
    raw_token, token_hash, expires_at = generate_invitation_token()
    candidate_email = (interview_in.candidate_email or cand.get("email", "")).strip()
    invite_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/interview-room/{raw_token}"
    
    # Store ONLY token_hash in database (never raw_token)
    invitation_dict = {
        "token_hash": token_hash,
        "expires_at": expires_at,
        "status": "sent" if interview_in.send_invitation else "pending",
        "sent_at": now if interview_in.send_invitation else None,
        "accepted_at": None,
        "candidate_email": candidate_email
    }

    new_interview = {
        "title": interview_in.title,
        "candidate_id": interview_in.candidate_id,
        "candidate_name": cand.get("name", ""),
        "candidate_role": cand.get("target_role", ""),
        "candidate_email": candidate_email,
        "interviewer_id": current_user["id"],
        "interviewer_name": current_user.get("name", "Interviewer"),
        "domains": interview_in.domains,
        "status": getattr(interview_in, "status", None) or "not_started",
        "questions": questions_list,
        "current_question_index": 0,
        "invitation": invitation_dict,
        "room_name": "",
        "started_at": None,
        "completed_at": None,
        "created_at": now,
        "updated_at": now
    }
    
    res = interviews_col.insert_one(new_interview)
    new_id_str = str(res.inserted_id)
    room_name = get_room_name(new_id_str)
    interviews_col.update_one({"_id": res.inserted_id}, {"$set": {"room_name": room_name}})
    
    new_interview["_id"] = res.inserted_id
    new_interview["room_name"] = room_name

    # Update candidate record email if missing
    if candidate_email and not cand.get("email"):
        try:
            candidates_col.update_one({"_id": cand["_id"]}, {"$set": {"email": candidate_email, "updated_at": now}})
        except Exception:
            pass

    # Dispatch email asynchronously in background task (never blocks API)
    if interview_in.send_invitation:
        if candidate_email and validate_candidate_email(candidate_email):
            invitation_dict["email_status"] = "pending"
            interviews_col.update_one(
                {"_id": res.inserted_id},
                {"$set": {"invitation.email_status": "pending", "email_status": "pending"}}
            )
            background_tasks.add_task(
                send_interview_invitation,
                candidate_name=cand.get("name", "Candidate"),
                candidate_email=candidate_email,
                interview_title=interview_in.title,
                domains=interview_in.domains,
                raw_token=raw_token,
                interview_id=new_id_str,
                interviewer_name=current_user.get("name", "Interviewer")
            )
        else:
            skip_msg = "Candidate email address is missing or invalid."
            invitation_dict["email_status"] = "skipped"
            invitation_dict["email_error"] = skip_msg
            invitation_dict["status"] = "pending"
            interviews_col.update_one(
                {"_id": res.inserted_id},
                {"$set": {
                    "invitation.email_status": "skipped",
                    "invitation.email_error": skip_msg,
                    "invitation.status": "pending",
                    "email_status": "skipped",
                    "email_error": skip_msg
                }}
            )
            logger.warning(f"[EMAIL SKIPPED] No valid candidate email for interview {new_id_str}. Email dispatch skipped.")

    doc = serialize_doc(new_interview)
    doc["total_questions"] = len(questions_list)
    doc["evaluated_questions"] = 0
    doc["discrepancy_count"] = 0
    doc["current_question_index"] = 0
    doc["started_at"] = None
    doc["completed_at"] = None
    doc["room_name"] = room_name
    doc["livekit_url"] = settings.LIVEKIT_URL
    doc["candidate_email"] = candidate_email
    if "invitation" in doc and doc["invitation"]:
        doc["invitation"]["invite_url"] = invite_url
        doc["invitation"]["raw_token"] = raw_token
    return doc

# =========================================================================
# Public Candidate Invitation Endpoints (No Authentication Required)
# =========================================================================

_invitation_request_history = defaultdict(list)
INVITATION_RATE_LIMIT_MAX_REQUESTS = 60
INVITATION_RATE_LIMIT_WINDOW_SECONDS = 60.0

def rate_limit_invitation_endpoint(request: Request):
    """
    Limits public invitation endpoint requests by client IP to prevent brute-forcing.
    Allows up to 60 requests per minute per IP address.
    """
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    cutoff = now - INVITATION_RATE_LIMIT_WINDOW_SECONDS

    history = _invitation_request_history[client_ip]
    _invitation_request_history[client_ip] = [ts for ts in history if ts > cutoff]

    if len(_invitation_request_history[client_ip]) >= INVITATION_RATE_LIMIT_MAX_REQUESTS:
        logger.warning(f"Rate limit exceeded on invitation endpoint for IP: {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please wait a moment before trying again."
        )

    _invitation_request_history[client_ip].append(now)

def find_interview_by_token(token_str: str):
    """
    Looks up interview by SHA-256 token hash.
    Gracefully falls back to legacy raw_token match and automatically migrates the record by
    computing token_hash and unsetting raw_token and invite_url.
    """
    clean_token = token_str.strip() if token_str else ""
    if not clean_token:
        return None
    token_hash = hash_token(clean_token)
    interviews_col = get_interviews_collection()
    interview = interviews_col.find_one({"invitation.token_hash": token_hash})
    if not interview:
        interview = interviews_col.find_one({"invitation.raw_token": clean_token})
        if interview:
            now = datetime.now(timezone.utc)
            interviews_col.update_one(
                {"_id": interview["_id"]},
                {
                    "$set": {
                        "invitation.token_hash": token_hash,
                        "updated_at": now
                    },
                    "$unset": {
                        "invitation.raw_token": "",
                        "invitation.invite_url": ""
                    }
                }
            )
            interview.setdefault("invitation", {})
            interview["invitation"]["token_hash"] = token_hash
            interview["invitation"].pop("raw_token", None)
            interview["invitation"].pop("invite_url", None)
    return interview

def migrate_legacy_invitation_tokens():
    """
    Scans for any legacy interviews in MongoDB storing raw_token, converts them to token_hash,
    and removes raw_token and invite_url from storage.
    """
    try:
        interviews_col = get_interviews_collection()
        legacy_cursor = interviews_col.find({"invitation.raw_token": {"$exists": True, "$ne": None}})
        count = 0
        now = datetime.now(timezone.utc)
        for doc in legacy_cursor:
            raw = doc.get("invitation", {}).get("raw_token")
            if raw:
                h = hash_token(raw)
                interviews_col.update_one(
                    {"_id": doc["_id"]},
                    {
                        "$set": {
                            "invitation.token_hash": h,
                            "updated_at": now
                        },
                        "$unset": {
                            "invitation.raw_token": "",
                            "invitation.invite_url": ""
                        }
                    }
                )
                count += 1
        if count > 0:
            logger.info(f"Migrated {count} legacy interview invitation tokens to secure token_hash.")
    except Exception as e:
        logger.warning(f"Notice running invitation token migration: {e}")

@router.get("/invitation/{raw_token}", dependencies=[Depends(rate_limit_invitation_endpoint)])
async def get_invitation_details(raw_token: str):
    """
    Public endpoint for candidate guest to retrieve interview metadata and room information.
    Validates token hash and expiration. Rate-limited by IP address.
    Returns:
      - 404: If link is invalid or invitation not found
      - 410: If link has expired
      - 409: If interview has already been completed
      - 200: Valid session data, sanitized question list, and scoped candidate token
    """
    token_str = raw_token.strip()
    if not token_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation token is required.")

    interview = find_interview_by_token(token_str)
    
    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Interview invitation not found. Please verify the link or request a new invitation."
        )

    invitation = interview.get("invitation", {})
    expires_at = invitation.get("expires_at")
    if is_token_expired(expires_at):
        exp_str = expires_at.isoformat() if expires_at else "previously"
        raise HTTPException(
            status_code=status.HTTP_410_GONE, 
            detail=f"This interview invitation expired on {exp_str}. Please contact your interviewer for a new link."
        )

    if interview.get("status") == "completed" or invitation.get("status") == "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This technical interview has already been completed and submitted."
        )

    # Fetch candidate details
    candidate_name = interview.get("candidate_name", "Candidate")
    candidate_role = interview.get("candidate_role", "")
    candidate_email = interview.get("candidate_email") or invitation.get("candidate_email", "")
    try:
        cand = get_candidates_collection().find_one({"_id": ObjectId(interview["candidate_id"])})
        if cand:
            candidate_name = cand.get("name", candidate_name)
            candidate_role = cand.get("target_role", candidate_role)
            candidate_email = cand.get("email", candidate_email)
    except Exception:
        pass

    # Create scoped candidate JWT
    candidate_jwt = create_access_token(
        {
            "sub": candidate_email or f"candidate_{interview['_id']}",
            "role": "candidate",
            "interview_id": str(interview["_id"])
        },
        expires_delta=timedelta(hours=settings.INVITATION_EXPIRY_HOURS or 72)
    )

    questions = interview.get("questions", [])
    active_idx = interview.get("current_question_index", 0)
    pushed_q_id = interview.get("pushed_question_id")
    session_state = interview.get("session_state")
    inv_status = invitation.get("status", "pending")
    int_status = interview.get("status", "not_started")

    if not session_state:
        if int_status == "completed" or inv_status == "completed":
            session_state = "completed"
        elif inv_status == "declined" or int_status == "declined":
            session_state = "declined"
        elif int_status == "active" or inv_status in ("started", "in_call"):
            session_state = "in_progress"
        elif inv_status == "accepted":
            session_state = "candidate_joined"
        else:
            session_state = "invited"

    # Sanitize questions: strip interviewer scores, notes, criteria, sample answers, but provide question_text
    sanitized_questions = []
    for idx, q in enumerate(questions):
        has_ans = bool(q.get("candidate_answer") or q.get("transcription"))
        sanitized_questions.append({
            "id": q.get("id"),
            "index": idx + 1,
            "question_text": q.get("question_text", ""),
            "domain": q.get("domain"),
            "difficulty": q.get("difficulty"),
            "is_answered": has_ans,
            "question_state": q.get("question_state") or ("Completed" if has_ans and idx < active_idx else ("Answer Submitted" if has_ans else ("Active" if idx == active_idx and session_state in ("question_sent", "answering") else "Ready"))),
            "answer_state": q.get("answer_state") or ("Submitted" if has_ans else ("Awaiting Response" if idx == active_idx else "Awaiting Response"))
        })

    # Only provide current question if interviewer has explicitly pushed it
    current_q = None
    if (session_state in ("question_sent", "answering", "answer_saved") or pushed_q_id) and 0 <= active_idx < len(questions):
        curr_raw = questions[active_idx]
        has_curr_ans = bool(curr_raw.get("candidate_answer") or curr_raw.get("transcription"))
        current_q = {
            "id": curr_raw.get("id"),
            "domain": curr_raw.get("domain"),
            "question_text": curr_raw.get("question_text"),
            "difficulty": curr_raw.get("difficulty"),
            "index": active_idx + 1,
            "total": len(questions),
            "question_state": curr_raw.get("question_state") or ("Answer Submitted" if has_curr_ans else "Active"),
            "answer_state": curr_raw.get("answer_state") or ("Submitted" if has_curr_ans else "Awaiting Response"),
            "is_answered": has_curr_ans,
            "is_submitted": bool(interview.get("last_answered_question_id") == curr_raw.get("id") or (has_curr_ans and session_state == "answer_saved"))
        }

    return {
        "valid": True,
        "interview_id": str(interview["_id"]),
        "title": interview.get("title", "Technical Interview"),
        "domains": interview.get("domains", []),
        "status": interview.get("status", "not_started"),
        "session_state": session_state,
        "consent_recorded_at": interview.get("consent_recorded_at"),
        "candidate_id": str(interview.get("candidate_id", "")),
        "candidate_name": candidate_name,
        "candidate_role": candidate_role,
        "candidate_email": candidate_email,
        "current_question_index": active_idx,
        "pushed_question_id": pushed_q_id,
        "current_question": current_q,
        "questions": sanitized_questions,
        "total_questions": len(questions),
        "room_name": interview.get("room_name") or get_room_name(str(interview["_id"])),
        "livekit_url": settings.LIVEKIT_URL,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "invitation_status": inv_status,
        "candidate_token": candidate_jwt
    }

@router.post("/invitation/{raw_token}/accept", dependencies=[Depends(rate_limit_invitation_endpoint)])
async def accept_invitation(raw_token: str):
    """
    Public endpoint for candidate guest to acknowledge / accept the invitation and record consent.
    No audio or video is recorded or streamed until this endpoint is called.
    """
    token_str = raw_token.strip()
    if not token_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation token is required.")

    interview = find_interview_by_token(token_str)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview invitation not found.")

    interviews_col = get_interviews_collection()
    now = datetime.now(timezone.utc)
    consent_iso = now.isoformat()

    interviews_col.update_one(
        {"_id": interview["_id"]},
        {"$set": {
            "invitation.status": "accepted",
            "invitation.accepted_at": now,
            "invitation.consent_recorded_at": consent_iso,
            "consent_recorded_at": consent_iso,
            "session_state": "candidate_joined",
            "status": "active",
            "updated_at": now
        }}
    )
    return {
        "status": "accepted",
        "session_state": "candidate_joined",
        "accepted_at": consent_iso,
        "consent_recorded_at": consent_iso
    }

@router.post("/invitation/{raw_token}/decline", dependencies=[Depends(rate_limit_invitation_endpoint)])
async def decline_invitation(raw_token: str):
    """
    Public endpoint for candidate guest to decline the interview invitation.
    Records refusal and prevents recording on both sides.
    """
    token_str = raw_token.strip()
    if not token_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation token is required.")

    interview = find_interview_by_token(token_str)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview invitation not found.")

    interviews_col = get_interviews_collection()
    now = datetime.now(timezone.utc)
    interviews_col.update_one(
        {"_id": interview["_id"]},
        {"$set": {
            "invitation.status": "declined",
            "invitation.declined_at": now,
            "session_state": "declined",
            "status": "declined",
            "updated_at": now
        }}
    )
    return {
        "status": "declined",
        "session_state": "declined",
        "declined_at": now.isoformat()
    }

@router.post("/invitation/{raw_token}/start", dependencies=[Depends(rate_limit_invitation_endpoint)])
async def start_invitation_session(raw_token: str):
    """
    Candidate guest starts the interview session: transitions status to active and marks invitation started.
    """
    token_str = raw_token.strip()
    if not token_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation token is required.")

    interview = find_interview_by_token(token_str)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview invitation not found.")

    interviews_col = get_interviews_collection()
    invitation = interview.get("invitation", {})
    expires_at = invitation.get("expires_at")
    if is_token_expired(expires_at):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="This interview invitation has expired.")

    if interview.get("status") == "completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This interview has already been completed.")

    now = datetime.now(timezone.utc)
    started_at = interview.get("started_at") or now
    interviews_col.update_one(
        {"_id": interview["_id"]},
        {"$set": {
            "status": "active",
            "started_at": started_at,
            "invitation.status": "started",
            "invitation.started_at": now,
            "updated_at": now
        }}
    )
    return {"status": "active", "started_at": started_at.isoformat(), "invitation_status": "started"}

@router.post("/invitation/{raw_token}/answer", dependencies=[Depends(rate_limit_invitation_endpoint)])
async def submit_candidate_answer(
    raw_token: str,
    submission: CandidateAnswerSubmission,
    background_tasks: BackgroundTasks
):
    """
    Candidate submits an answer (typed text or recorded audio/video transcript) for a question.
    Saves the answer and initiates background AI evaluation.
    """
    token_str = raw_token.strip()
    if not token_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation token is required.")

    interview = find_interview_by_token(token_str)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview invitation not found.")

    interviews_col = get_interviews_collection()
    invitation = interview.get("invitation", {})
    if is_token_expired(invitation.get("expires_at")):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="This interview invitation has expired.")

    if interview.get("status") == "completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This interview has already been completed.")

    now = datetime.now(timezone.utc)
    q_found = False
    answer_text = (submission.candidate_answer or submission.transcription or "").strip()
    updated_questions = []
    matched_q = None

    for q in interview.get("questions", []):
        if q.get("id") == submission.question_id:
            q_found = True
            q["candidate_answer"] = answer_text
            if submission.transcription:
                q["transcription"] = submission.transcription
            if submission.submission_mode:
                q["submission_mode"] = submission.submission_mode
            if submission.audio_url:
                q["audio_url"] = submission.audio_url
            if submission.video_url:
                q["video_url"] = submission.video_url
            if submission.recording_duration:
                q["recording_duration"] = submission.recording_duration
            q["submitted_at"] = now
            q["question_state"] = "Answer Submitted"
            q["answer_state"] = "Submitted"
            matched_q = q
        updated_questions.append(q)

    if not q_found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question ID not found in this interview.")

    candidate_name = interview.get("candidate_name", "Candidate")
    cand_q_index = next((idx for idx, q in enumerate(updated_questions) if q.get("id") == submission.question_id), 0)

    interviews_col.update_one(
        {"_id": interview["_id"]},
        {"$set": {
            "questions": updated_questions,
            "session_state": "answer_saved",
            "last_answered_question_id": submission.question_id,
            "candidate_activity": {
                "state": "answer_submitted",
                "question_id": submission.question_id,
                "question_index": cand_q_index,
                "candidate_name": candidate_name,
                "submission_mode": submission.submission_mode or "voice_recorded",
                "updated_at": now.isoformat()
            },
            "updated_at": now
        }}
    )

    # Queue background AI evaluation if answer text is provided
    if answer_text and matched_q:
        try:
            background_tasks.add_task(
                run_independent_ai_evaluation,
                interview_id=str(interview["_id"]),
                question_id=matched_q.get("id"),
                candidate_answer=answer_text,
                domain=matched_q.get("domain", "DSA"),
                question_text=matched_q.get("question_text", ""),
                audio_id=matched_q.get("audio_id"),
                recording_duration=matched_q.get("recording_duration", 0.0),
                submission_mode=submission.submission_mode or "text"
            )
        except Exception as e:
            logger.warning(f"Notice queuing background AI evaluation: {e}")

    return {
        "status": "success",
        "question_id": submission.question_id,
        "submitted_at": now.isoformat(),
        "is_answered": True
    }

@router.post("/invitation/{raw_token}/complete", dependencies=[Depends(rate_limit_invitation_endpoint)])
async def complete_candidate_interview(raw_token: str):
    """
    Candidate completes and submits their interview.
    Transitions interview to completed and unseals evaluation reports.
    """
    token_str = raw_token.strip()
    if not token_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation token is required.")

    interview = find_interview_by_token(token_str)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview invitation not found.")

    interviews_col = get_interviews_collection()
    now = datetime.now(timezone.utc)
    interviews_col.update_one(
        {"_id": interview["_id"]},
        {"$set": {
            "status": "completed",
            "completed_at": now,
            "invitation.status": "completed",
            "invitation.completed_at": now,
            "updated_at": now
        }}
    )

    interview_id_str = str(interview["_id"])
    try:
        unseal_all_interview_evaluations(interview_id_str)
    except Exception as e:
        logger.warning(f"Notice unsealing evaluations on candidate completion: {e}")
        try:
            sync_interview_report(interview_id_str)
        except Exception as e2:
            logger.warning(f"Notice syncing report on candidate completion: {e2}")

    return {
        "status": "completed",
        "completed_at": now.isoformat(),
        "candidate_name": interview.get("candidate_name")
    }

class CandidateStateUpdate(BaseModel):
    state: str = Field("idle", description="idle, typing, recording, viewing")
    question_id: Optional[str] = None

@router.post("/invitation/{raw_token}/state", dependencies=[Depends(rate_limit_invitation_endpoint)])
async def update_candidate_state(raw_token: str, state_update: CandidateStateUpdate):
    """
    Public candidate endpoint to announce current activity state (e.g. typing, recording, idle)
    for real-time display on the interviewer's Live page.
    """
    token_str = raw_token.strip()
    if not token_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation token is required.")

    interview = find_interview_by_token(token_str)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview invitation not found.")

    now = datetime.now(timezone.utc)
    activity_doc = {
        "state": state_update.state,
        "question_id": state_update.question_id,
        "updated_at": now.isoformat()
    }

    interviews_col = get_interviews_collection()
    interviews_col.update_one(
        {"_id": interview["_id"]},
        {"$set": {
            "candidate_activity": activity_doc,
            "updated_at": now
        }}
    )
    return {"status": "ok", "activity": activity_doc}

def compute_candidate_presence(interview: dict) -> str:
    """Computes candidate presence status: invited, joined, in_session, finished."""
    invitation = interview.get("invitation", {})
    status = interview.get("status", "not_started")
    inv_status = invitation.get("status", "pending")

    if status == "completed" or inv_status == "completed":
        return "finished"
    if inv_status in ("started", "in_call") or status == "active":
        return "in_session"
    if inv_status == "accepted":
        return "joined"
    return "invited"

def build_live_status_payload(interview: dict) -> dict:
    interview_id_str = str(interview["_id"])
    evaluations_col = get_evaluations_collection()
    evals = list(evaluations_col.find({"interview_id": interview_id_str}))
    eval_by_q = {e.get("question_id"): e for e in evals}

    questions = interview.get("questions", [])
    active_idx = interview.get("current_question_index", 0)

    # Attach evaluation details for interviewer
    enriched_questions = []
    for idx, q in enumerate(questions):
        q_copy = dict(q)
        q_id = q_copy.get("id")
        has_ans = bool(q_copy.get("candidate_answer") or q_copy.get("transcription"))
        q_copy["is_answered"] = has_ans
        # Manage Question State & Answer State
        if not q_copy.get("question_state"):
            if has_ans:
                q_copy["question_state"] = "Answer Submitted" if idx == active_idx else "Completed"
            elif idx == active_idx and interview.get("session_state") in ("question_sent", "answering"):
                q_copy["question_state"] = "Active"
            elif idx < active_idx:
                q_copy["question_state"] = "Completed"
            else:
                q_copy["question_state"] = "Ready"

        if not q_copy.get("answer_state"):
            if has_ans:
                q_copy["answer_state"] = "Submitted"
            elif idx == active_idx:
                act = (interview.get("candidate_activity") or {}).get("state")
                if act == "recording":
                    q_copy["answer_state"] = "Recording"
                elif act == "uploading":
                    q_copy["answer_state"] = "Uploading"
                else:
                    q_copy["answer_state"] = "Awaiting Response"
            elif idx < active_idx:
                q_copy["answer_state"] = "Submitted" if has_ans else "Not Evaluated"
            else:
                q_copy["answer_state"] = "Awaiting Response"

        if q_id in eval_by_q:
            ev = eval_by_q[q_id]
            q_copy["evaluated"] = True
            q_copy["evaluation_id"] = str(ev["_id"])
            if "interviewer_score" in ev and ev["interviewer_score"] is not None:
                q_copy["interviewer_score"] = ev["interviewer_score"]
            if "interviewer_notes" in ev:
                q_copy["interviewer_notes"] = ev["interviewer_notes"]
            if "ai_evaluation" in ev:
                q_copy["ai_evaluation"] = ev["ai_evaluation"]
                q_copy["ai_score"] = ev["ai_evaluation"].get("technical_score")
            if "discrepancy" in ev:
                q_copy["discrepancy"] = ev["discrepancy"]
                q_copy["has_discrepancy"] = ev["discrepancy"].get("detected", False)
        enriched_questions.append(q_copy)

    current_q = None
    if 0 <= active_idx < len(enriched_questions):
        current_q = enriched_questions[active_idx]

    invitation = interview.get("invitation", {})
    cand_status = compute_candidate_presence(interview)
    activity = interview.get("candidate_activity") or {"state": "idle", "question_id": None, "updated_at": None}
    livekit_status = check_livekit_service_status()

    return {
        "interview_id": interview_id_str,
        "title": interview.get("title", "Technical Interview"),
        "status": interview.get("status", "not_started"),
        "session_state": interview.get("session_state") or ("in_session" if cand_status == "in_session" else ("completed" if cand_status == "finished" else "invited")),
        "consent_recorded_at": interview.get("consent_recorded_at"),
        "pushed_question_id": interview.get("pushed_question_id"),
        "last_answered_question_id": interview.get("last_answered_question_id"),
        "domains": interview.get("domains", []),
        "candidate_id": str(interview.get("candidate_id", "")),
        "candidate_name": interview.get("candidate_name", "Candidate"),
        "candidate_role": interview.get("candidate_role", ""),
        "candidate_email": interview.get("candidate_email") or invitation.get("candidate_email", ""),
        "interviewer_id": str(interview.get("interviewer_id", "")),
        "interviewer_name": interview.get("interviewer_name", "Interviewer"),
        "candidate_status": cand_status,
        "candidate_activity": activity,
        "current_question_index": active_idx,
        "current_question": current_q,
        "questions": enriched_questions,
        "total_questions": len(questions),
        "room_name": interview.get("room_name") or get_room_name(interview_id_str),
        "livekit_url": settings.LIVEKIT_URL,
        "livekit_configured": bool(livekit_status.get("configured")),
        "started_at": interview.get("started_at"),
        "completed_at": interview.get("completed_at")
    }

@router.get("/{interview_id}/live-status")
async def get_interview_live_status(
    interview_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Returns real-time candidate presence, current question, recording/typing activity,
    and answered transcripts for the interviewer's Live page.
    """
    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")

    interviews_col = get_interviews_collection()
    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    return build_live_status_payload(interview)

@router.get("/{interview_id}/live-stream")
async def stream_interview_live_events(
    interview_id: str,
    token: Optional[str] = Query(None),
    current_user: Optional[dict] = Depends(get_optional_current_user)
):
    """
    Server-Sent Events (SSE) stream delivering real-time candidate presence, typing/recording status,
    and answers to the Interviewer Live page.
    """
    user = current_user
    if not user and token:
        try:
            payload = decode_token(token)
            if payload.get("role") == "candidate":
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidates cannot access interviewer live stream.")
            users_col = get_users_collection()
            u = users_col.find_one({"email": payload.get("sub")})
            if u:
                user = serialize_doc(u)
        except Exception:
            pass

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required for live stream.")

    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")

    interviews_col = get_interviews_collection()

    async def event_generator():
        last_sig = ""
        try:
            for _ in range(60):
                interview = interviews_col.find_one({"_id": obj_id})
                if not interview:
                    yield f"event: error\ndata: {json.dumps({'error': 'Interview not found'})}\n\n"
                    break

                payload = build_live_status_payload(interview)
                activity_state = payload.get("candidate_activity", {}).get("state", "idle")
                answered_count = len([q for q in payload.get("questions", []) if q.get("is_answered")])
                current_sig = f"{payload['candidate_status']}_{payload['current_question_index']}_{activity_state}_{answered_count}_{payload['status']}"
                
                if current_sig != last_sig:
                    last_sig = current_sig
                    yield f"event: update\ndata: {json.dumps(payload, default=str)}\n\n"
                else:
                    yield f": heartbeat\n\n"

                await asyncio.sleep(1.5)
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.get("/{interview_id}", response_model=InterviewResponse)
async def get_interview(
    interview_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    interviews_col = get_interviews_collection()
    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")
        
    evaluations_col = get_evaluations_collection()
    evals = list(evaluations_col.find({"interview_id": interview_id}))
    
    doc = serialize_doc(interview)
    doc["total_questions"] = len(doc.get("questions", []))
    doc["evaluated_questions"] = len(evals)
    doc["current_question_index"] = interview.get("current_question_index", 0)
    doc["started_at"] = interview.get("started_at")
    doc["completed_at"] = interview.get("completed_at")
    
    discrepancies = sum(1 for e in evals if e.get("discrepancy", {}).get("detected"))
    doc["discrepancy_count"] = discrepancies
    
    ai_scores = [float(e["ai_evaluation"]["technical_score"]) for e in evals if "ai_evaluation" in e and "technical_score" in e["ai_evaluation"]]
    int_scores = [float(e["interviewer_score"]) for e in evals if e.get("interviewer_score") is not None]
    
    doc["average_ai_score"] = round(sum(ai_scores) / len(ai_scores), 1) if ai_scores else None
    doc["average_interviewer_score"] = round(sum(int_scores) / len(int_scores), 1) if int_scores else None
    
    # Map evaluation status into questions
    eval_by_q = {e.get("question_id"): e for e in evals}
    for q in doc.get("questions", []):
        if q.get("id") in eval_by_q:
            ev = eval_by_q[q["id"]]
            q["evaluated"] = True
            q["evaluation_id"] = str(ev["_id"])
            if "ai_evaluation" in ev:
                q["ai_score"] = ev["ai_evaluation"].get("technical_score")
            if "discrepancy" in ev:
                q["has_discrepancy"] = ev["discrepancy"].get("detected", False)
                q["bias_category"] = ev["discrepancy"].get("bias_category", "")

    doc["room_name"] = interview.get("room_name") or get_room_name(interview_id)
    doc["livekit_url"] = settings.LIVEKIT_URL
    doc["candidate_email"] = interview.get("candidate_email") or (interview.get("invitation") or {}).get("candidate_email", "")
    if not doc["candidate_email"]:
        try:
            cand = get_candidates_collection().find_one({"_id": ObjectId(interview["candidate_id"])})
            if cand:
                doc["candidate_email"] = cand.get("email", "")
        except Exception:
            pass

    return doc

@router.put("/{interview_id}", response_model=InterviewResponse)
async def update_interview(
    interview_id: str,
    update_in: InterviewUpdate,
    current_user: dict = Depends(get_current_user)
):
    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    interviews_col = get_interviews_collection()
    update_data = {k: v for k, v in update_in.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    if "questions" in update_data:
        # ensure ids
        for q in update_data["questions"]:
            if not q.get("id"):
                q["id"] = f"q_{uuid.uuid4().hex[:8]}"
                
    res = interviews_col.find_one_and_update(
        {"_id": obj_id},
        {"$set": update_data},
        return_document=True
    )
    if not res:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")
    return serialize_doc(res)

@router.delete("/{interview_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_interview(
    interview_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    interviews_col = get_interviews_collection()
    evaluations_col = get_evaluations_collection()
    
    interviews_col.delete_one({"_id": obj_id})
    evaluations_col.delete_many({"interview_id": interview_id})
    return None

# =============================================================================
# Continuous Interview Session Management & Dynamic Question Controls
# =============================================================================

class GenerateQuestionRequest(BaseModel):
    domain: Optional[str] = None

class ActiveQuestionRequest(BaseModel):
    index: int

@router.post("/{interview_id}/start", response_model=InterviewResponse)
async def start_interview(
    interview_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Starts the continuous interview session, transitioning status to 'active'."""
    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    interviews_col = get_interviews_collection()
    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")
        
    now = datetime.now(timezone.utc)
    started_at = interview.get("started_at") or now
    
    interviews_col.update_one(
        {"_id": obj_id},
        {"$set": {
            "status": "active",
            "started_at": started_at,
            "updated_at": now
        }}
    )
    return await get_interview(interview_id, current_user)

@router.post("/{interview_id}/pause", response_model=InterviewResponse)
async def pause_interview(
    interview_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Temporarily pauses the active interview session."""
    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    interviews_col = get_interviews_collection()
    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")
        
    now = datetime.now(timezone.utc)
    interviews_col.update_one(
        {"_id": obj_id},
        {"$set": {
            "status": "paused",
            "updated_at": now
        }}
    )
    return await get_interview(interview_id, current_user)

@router.post("/{interview_id}/resume", response_model=InterviewResponse)
async def resume_interview(
    interview_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Resumes a paused interview session back to 'active'."""
    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    interviews_col = get_interviews_collection()
    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")
        
    now = datetime.now(timezone.utc)
    interviews_col.update_one(
        {"_id": obj_id},
        {"$set": {
            "status": "active",
            "updated_at": now
        }}
    )
    return await get_interview(interview_id, current_user)

@router.post("/{interview_id}/end", response_model=InterviewResponse)
async def end_interview(
    interview_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Explicitly terminates the interview session and updates final evaluation reports."""
    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    interviews_col = get_interviews_collection()
    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")
        
    now = datetime.now(timezone.utc)
    interviews_col.update_one(
        {"_id": obj_id},
        {"$set": {
            "status": "completed",
            "completed_at": now,
            "updated_at": now
        }}
    )
    
    # Unseal all question AI evaluations and compute discrepancy analysis
    try:
        from app.routes.evaluations import unseal_all_interview_evaluations
        unseal_all_interview_evaluations(interview_id)
    except Exception as e:
        logger.warning(f"Unsealing evaluations notice on interview completion: {e}")
        try:
            sync_interview_report(interview_id)
        except Exception as e2:
            logger.warning(f"Report sync notice on interview completion: {e2}")
        
    return await get_interview(interview_id, current_user)

@router.post("/{interview_id}/questions", response_model=InterviewResponse)
async def add_interview_question(
    interview_id: str,
    question_in: QuestionItem,
    current_user: dict = Depends(get_current_user)
):
    """Dynamically appends a custom question during the live interview session."""
    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    interviews_col = get_interviews_collection()
    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")
        
    new_q = question_in.model_dump()
    if not new_q.get("id"):
        new_q["id"] = f"q_{uuid.uuid4().hex[:8]}"
        
    now = datetime.now(timezone.utc)
    interviews_col.update_one(
        {"_id": obj_id},
        {
            "$push": {"questions": new_q},
            "$set": {"updated_at": now}
        }
    )
    return await get_interview(interview_id, current_user)

@router.post("/{interview_id}/generate-question", response_model=InterviewResponse)
async def generate_additional_question(
    interview_id: str,
    req: GenerateQuestionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generates an additional relevant technical question so the interview can continue."""
    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    interviews_col = get_interviews_collection()
    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    existing_texts = {q.get("question_text", "").strip().lower() for q in interview.get("questions", [])}
    domains = [req.domain] if req.domain else interview.get("domains", ["DSA"])
    
    # Pick a template matching domain that hasn't been asked yet
    chosen_template = None
    for tmpl in DEFAULT_QUESTION_TEMPLATES:
        if tmpl["domain"] in domains and tmpl["question_text"].strip().lower() not in existing_texts:
            chosen_template = tmpl
            break
            
    if not chosen_template:
        for tmpl in DEFAULT_QUESTION_TEMPLATES:
            if tmpl["question_text"].strip().lower() not in existing_texts:
                chosen_template = tmpl
                break
                
    if not chosen_template:
        d = domains[0] if domains else "DSA"
        chosen_template = {
            "domain": d,
            "question_text": f"Follow-up Deep-Dive in {d}: How would you optimize this architecture for high concurrent throughput, prevent race conditions, and ensure fault tolerance?",
            "difficulty": "Hard",
            "expected_criteria": [
                "Bottleneck identification and horizontal scaling",
                "Locking strategies, concurrency, and thread-safety",
                "Fault tolerance, circuit breakers, and data consistency"
            ]
        }

    new_q = {
        "id": f"q_{uuid.uuid4().hex[:8]}",
        "domain": chosen_template["domain"],
        "question_text": chosen_template["question_text"],
        "difficulty": chosen_template.get("difficulty", "Medium"),
        "expected_criteria": chosen_template.get("expected_criteria", []),
        "sample_answer": chosen_template.get("sample_answer", ""),
        "candidate_answer": "",
        "transcription": "",
        "interviewer_score": None,
        "interviewer_notes": "",
        "evaluated": False,
        "evaluation_id": None,
        "submission_mode": "voice_recorded"
    }

    now = datetime.now(timezone.utc)
    interviews_col.update_one(
        {"_id": obj_id},
        {
            "$push": {"questions": new_q},
            "$set": {"updated_at": now}
        }
    )
    return await get_interview(interview_id, current_user)

@router.put("/{interview_id}/active-question")
async def set_active_question(
    interview_id: str,
    req: ActiveQuestionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Sets active question index for synchronized multi-device progression."""
    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    interviews_col = get_interviews_collection()
    interviews_col.update_one(
        {"_id": obj_id},
        {"$set": {
            "current_question_index": req.index,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    return {"status": "success", "current_question_index": req.index}

class SendQuestionRequest(BaseModel):
    question_id: str
    question_index: Optional[int] = 0

@router.post("/{interview_id}/send-question")
async def send_question_to_candidate(
    interview_id: str,
    req: SendQuestionRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Interviewer chooses a question from the question list and pushes it to the candidate in real time.
    Sets session_state to 'question_sent' and sets current_question_index.
    """
    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    interviews_col = get_interviews_collection()
    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    questions = interview.get("questions", [])
    target_q = None
    target_idx = req.question_index if req.question_index is not None else 0

    for idx, q in enumerate(questions):
        if q.get("id") == req.question_id:
            target_q = q
            target_idx = idx
            break

    if not target_q and 0 <= target_idx < len(questions):
        target_q = questions[target_idx]

    if not target_q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found in interview.")

    now = datetime.now(timezone.utc)
    for idx, q in enumerate(questions):
        if idx == target_idx:
            q["question_state"] = "Active"
            q["answer_state"] = "Awaiting Response"
        elif idx < target_idx and (q.get("candidate_answer") or q.get("transcription")):
            q["question_state"] = "Completed"
            q["answer_state"] = "Submitted"

    interviews_col.update_one(
        {"_id": obj_id},
        {"$set": {
            "questions": questions,
            "current_question_index": target_idx,
            "pushed_question_id": target_q.get("id"),
            "session_state": "question_sent",
            "candidate_activity": {
                "state": "question_received",
                "question_id": target_q.get("id"),
                "question_index": target_idx,
                "candidate_name": interview.get("candidate_name", "Candidate"),
                "updated_at": now.isoformat()
            },
            "updated_at": now
        }}
    )

    return {
        "status": "question_sent",
        "session_state": "question_sent",
        "question_id": target_q.get("id"),
        "question_index": target_idx,
        "question_text": target_q.get("question_text"),
        "domain": target_q.get("domain", "DSA"),
        "difficulty": target_q.get("difficulty", "Medium"),
        "total_questions": len(questions)
    }

class NextQuestionRequest(BaseModel):
    target_index: Optional[int] = None
    question_id: Optional[str] = None
    custom_question: Optional[dict] = None

@router.post("/{interview_id}/next-question")
async def advance_to_next_question(
    interview_id: str,
    req: Optional[NextQuestionRequest] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Interviewer controls progression: validates previous state, advances to the next question,
    saves next question in MongoDB, and returns payload to broadcast to the candidate in real time.
    """
    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    interviews_col = get_interviews_collection()
    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    questions = interview.get("questions", [])
    active_idx = interview.get("current_question_index", 0)
    now = datetime.now(timezone.utc)

    if req and req.custom_question:
        cq = req.custom_question
        new_q = {
            "id": cq.get("id") or f"q_{uuid.uuid4().hex[:8]}",
            "domain": cq.get("domain", "DSA"),
            "question_text": cq.get("question_text", "").strip(),
            "difficulty": cq.get("difficulty", "Medium"),
            "expected_criteria": cq.get("expected_criteria", []),
            "sample_answer": cq.get("sample_answer", ""),
            "candidate_answer": "",
            "transcription": "",
            "interviewer_score": None,
            "interviewer_notes": "",
            "evaluated": False,
            "question_state": "Active",
            "answer_state": "Awaiting Response",
            "created_at": now
        }
        if not new_q["question_text"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Custom question text cannot be empty.")
        questions.append(new_q)
        target_idx = len(questions) - 1
        target_q = new_q
    elif req and req.question_id:
        target_idx = next((i for i, q in enumerate(questions) if q.get("id") == req.question_id), None)
        if target_idx is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Specified question ID not found.")
        target_q = questions[target_idx]
    elif req and req.target_index is not None:
        target_idx = req.target_index
        if not (0 <= target_idx < len(questions)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target question index out of range.")
        target_q = questions[target_idx]
    else:
        target_idx = active_idx + 1
        if target_idx >= len(questions):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No more predefined questions remaining.")
        target_q = questions[target_idx]

    # Transition states of all questions
    for idx, q in enumerate(questions):
        if idx == target_idx:
            q["question_state"] = "Active"
            q["answer_state"] = "Awaiting Response"
        elif idx < target_idx:
            if q.get("candidate_answer") or q.get("transcription"):
                q["question_state"] = "Completed"
                q["answer_state"] = "Submitted"
            else:
                q["question_state"] = "Completed"

    interviews_col.update_one(
        {"_id": obj_id},
        {"$set": {
            "questions": questions,
            "current_question_index": target_idx,
            "pushed_question_id": target_q.get("id"),
            "session_state": "question_sent",
            "candidate_activity": {
                "state": "question_received",
                "question_id": target_q.get("id"),
                "question_index": target_idx,
                "candidate_name": interview.get("candidate_name", "Candidate"),
                "updated_at": now.isoformat()
            },
            "updated_at": now
        }}
    )

    return {
        "status": "success",
        "current_question_index": target_idx,
        "pushed_question_id": target_q.get("id"),
        "session_state": "question_sent",
        "question": {
            "id": target_q.get("id"),
            "question_text": target_q.get("question_text"),
            "domain": target_q.get("domain", "DSA"),
            "difficulty": target_q.get("difficulty", "Medium"),
            "index": target_idx + 1,
            "total": len(questions),
            "question_state": "Active",
            "answer_state": "Awaiting Response"
        }
    }

class RemoteRecordingControlRequest(BaseModel):
    action: str = Field(..., description="start or stop")
    question_id: Optional[str] = None

@router.post("/{interview_id}/recording-control")
async def remote_recording_control(
    interview_id: str,
    req: RemoteRecordingControlRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Allows interviewer to initiate or stop candidate voice recording remotely.
    Updates candidate activity and persists command signal.
    """
    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    interviews_col = get_interviews_collection()
    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    now = datetime.now(timezone.utc)
    activity_state = "recording" if req.action == "start" else "idle"
    interviews_col.update_one(
        {"_id": obj_id},
        {"$set": {
            "remote_recording_action": {
                "action": req.action,
                "question_id": req.question_id or interview.get("pushed_question_id"),
                "timestamp": now.isoformat()
            },
            "candidate_activity": {
                "state": activity_state,
                "question_id": req.question_id or interview.get("pushed_question_id"),
                "updated_at": now.isoformat()
            },
            "updated_at": now
        }}
    )
    return {"status": "ok", "action": req.action, "timestamp": now.isoformat()}

@router.get("/{interview_id}/suggested-questions")
async def get_suggested_questions(
    interview_id: str,
    force_refresh: bool = Query(False),
    domain: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Fetches AI-suggested follow-up/expansion questions for the active interview."""
    try:
        suggestions = service_generate_suggested_questions(
            interview_id=interview_id,
            domain=domain,
            force_refresh=force_refresh
        )
        return {"suggested_questions": suggestions, "total": len(suggestions)}
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as e:
        logger.error(f"Error generating suggested questions: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to generate suggested questions: {str(e)}")

@router.post("/{interview_id}/suggested-questions")
async def create_suggested_questions(
    interview_id: str,
    req: Optional[GenerateSuggestedQuestionsRequest] = None,
    current_user: dict = Depends(get_current_user)
):
    """Generates or refreshes AI-suggested questions with optional body parameters."""
    force_refresh = req.force_refresh if req else False
    domain = req.domain if req else None
    try:
        suggestions = service_generate_suggested_questions(
            interview_id=interview_id,
            domain=domain,
            force_refresh=force_refresh
        )
        return {"suggested_questions": suggestions, "total": len(suggestions)}
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as e:
        logger.error(f"Error generating suggested questions: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to generate suggested questions: {str(e)}")

@router.post("/{interview_id}/suggested-questions/{suggestion_id}/ask", response_model=InterviewResponse)
async def ask_suggested_question_endpoint(
    interview_id: str,
    suggestion_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Selects and asks a suggested question, appending it to the interview questions and advancing active index."""
    try:
        service_ask_suggested_question(interview_id=interview_id, suggestion_id=suggestion_id)
        return await get_interview(interview_id, current_user)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as e:
        logger.error(f"Error asking suggested question: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to ask suggested question: {str(e)}")

@router.post("/{interview_id}/suggested-questions/{suggestion_id}/skip")
async def skip_suggested_question_endpoint(
    interview_id: str,
    suggestion_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Skips a suggested question and returns remaining or replenished suggestions."""
    try:
        remaining = service_skip_suggested_question(interview_id=interview_id, suggestion_id=suggestion_id)
        return {"status": "skipped", "suggested_questions": remaining}
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as e:
        logger.error(f"Error skipping suggested question: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to skip suggested question: {str(e)}")

@router.post("/{interview_id}/invite")
async def send_or_resend_invitation(
    interview_id: str,
    background_tasks: BackgroundTasks,
    payload: Optional[SendInvitationRequest] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Generates a fresh secure time-limited invitation link and dispatches an invitation email to the candidate.
    Validates SMTP configuration, candidate email, resets completed state if previously finished,
    and returns the fallback link in the API response.
    """
    # 1. Validate Email Provider and SMTP Configuration
    provider = (settings.EMAIL_PROVIDER or "console").strip().lower()
    if provider != "smtp":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email provider is configured as '{provider}'. Real email delivery requires EMAIL_PROVIDER=smtp in backend/.env."
        )
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SMTP is misconfigured: SMTP_HOST, SMTP_USER, or SMTP_PASSWORD is not set in backend/.env."
        )

    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    interviews_col = get_interviews_collection()
    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    candidates_col = get_candidates_collection()
    cand = None
    try:
        cand = candidates_col.find_one({"_id": ObjectId(interview["candidate_id"])})
    except Exception:
        pass

    target_email = ""
    if payload and payload.candidate_email:
        target_email = payload.candidate_email.strip()
    elif interview.get("candidate_email"):
        target_email = interview["candidate_email"].strip()
    elif cand and cand.get("email"):
        target_email = cand["email"].strip()

    if not target_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="No candidate email address found for this interview. Please provide candidate_email."
        )

    if not validate_candidate_email(target_email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid candidate email address: '{target_email}'."
        )

    candidate_name = cand.get("name") if cand else interview.get("candidate_name", "Candidate")
    now = datetime.now(timezone.utc)

    # Update candidate record with email if missing
    if cand and target_email and not cand.get("email"):
        try:
            candidates_col.update_one({"_id": cand["_id"]}, {"$set": {"email": target_email, "updated_at": now}})
        except Exception:
            pass

    # Generate fresh secure token
    raw_token, token_hash, expires_at = generate_invitation_token()
    invite_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/interview-room/{raw_token}"

    is_previously_completed = (
        interview.get("status") == "completed" or 
        (interview.get("invitation") or {}).get("status") == "completed"
    )

    # Store ONLY token_hash in database, invalidating any previous link
    invitation_dict = {
        "token_hash": token_hash,
        "expires_at": expires_at,
        "status": "sent",
        "sent_at": now,
        "accepted_at": None,
        "completed_at": None,
        "candidate_email": target_email,
        "email_status": "pending",
        "email_error": None,
        "email_sent_at": None
    }

    update_fields = {
        "invitation": invitation_dict,
        "candidate_email": target_email,
        "email_status": "pending",
        "email_error": None,
        "email_sent_at": None,
        "session_state": "invited",
        "pushed_question_id": None,
        "last_answered_question_id": None,
        "updated_at": now
    }

    # Reset completed state so candidate can access new session
    if is_previously_completed:
        update_fields["status"] = "not_started"
        update_fields["completed_at"] = None

    interviews_col.update_one(
        {"_id": obj_id},
        {
            "$set": update_fields,
            "$unset": {
                "consent_recorded_at": ""
            }
        }
    )

    # Dispatch email invitation
    email_result = await send_interview_invitation(
        candidate_name=candidate_name,
        candidate_email=target_email,
        interview_title=interview.get("title", "Technical Interview"),
        domains=interview.get("domains", []),
        raw_token=raw_token,
        interview_id=interview_id,
        interviewer_name=current_user.get("name", "Interviewer")
    )

    return {
        "status": email_result["status"],
        "email_status": email_result["status"],
        "email_error": email_result.get("error"),
        "invite_url": invite_url,
        "raw_token": raw_token,
        "expires_at": expires_at.isoformat(),
        "candidate_email": target_email,
        "candidate_name": candidate_name
    }


