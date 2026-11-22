from fastapi import APIRouter, HTTPException, status, Depends
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from bson import ObjectId
from app.models.evaluation import (
    EvaluationRequest, 
    EvaluationRecord, 
    AIEvaluationOutput, 
    DiscrepancyDetail,
    HumanScoreRequest
)
from app.database import (
    get_evaluations_collection,
    get_interviews_collection,
    get_candidates_collection,
    get_reports_collection,
    get_audio_recordings_collection,
    get_score_audits_collection,
    serialize_doc
)
from app.services.auth_service import get_current_user
from app.services.ai_evaluator import evaluate_with_openai
from app.services.bias_detector import analyze_discrepancy
from app.services.speech_validator import (
    classify_recording_status,
    is_silence_or_hallucination,
    is_transcription_unclear
)
from app.config import settings
import logging

logger = logging.getLogger("biasguard.evaluations")

router = APIRouter(prefix="/evaluations", tags=["Evaluations"])

def mask_sealed_evaluation(ev: dict, is_interview_completed: bool) -> dict:
    """Masks sensitive AI evaluation details during active interview to prevent human anchoring."""
    if is_interview_completed:
        ev["is_sealed"] = False
        return ev
    
    ev_copy = dict(ev)
    ev_copy["is_sealed"] = True
    if "ai_evaluation" in ev_copy and isinstance(ev_copy["ai_evaluation"], dict):
        ai = dict(ev_copy["ai_evaluation"])
        ai["is_sealed"] = True
        ai["technical_score"] = None
        ai["score_breakdown"] = None
        ai["explanation"] = "AI evaluation completed and sealed. Complete technical analysis will be revealed upon ending the interview."
        ai["correct_concepts"] = []
        ai["incorrect_concepts"] = []
        ai["missing_concepts"] = []
        ai["alternative_valid_approaches"] = []
        ai["evidence"] = ""
        ai["review_recommendation"] = "Sealed until interview completion."
        ev_copy["ai_evaluation"] = ai
    if "discrepancy" in ev_copy and isinstance(ev_copy["discrepancy"], dict):
        ev_copy["discrepancy"] = {
            "detected": False,
            "type": "SEALED",
            "severity": "LOW",
            "score_delta": 0.0,
            "evidence": "Bias discrepancy audit will be revealed upon ending the interview.",
            "bias_category": "Sealed"
        }
    return ev_copy

def run_independent_ai_evaluation(
    interview_id: str,
    question_id: str,
    candidate_answer: str,
    domain: str = "DSA",
    question_text: str = "",
    expected_criteria: Optional[List[str]] = None,
    audio_id: Optional[str] = None,
    audio_url: Optional[str] = None,
    recording_duration: Optional[float] = None,
    submission_mode: Optional[str] = "voice_recorded"
) -> Dict[str, Any]:
    """
    Performs pure independent background AI technical evaluation for an answer.
    Does not receive or rely on human interviewer score.
    """
    interviews_col = get_interviews_collection()
    evaluations_col = get_evaluations_collection()
    
    try:
        int_obj = interviews_col.find_one({"_id": ObjectId(interview_id)})
    except Exception:
        int_obj = None

    if not int_obj:
        return {}
        
    target_q = None
    for q in int_obj.get("questions", []):
        if q.get("id") == question_id:
            target_q = q
            break
            
    if target_q:
        if not domain:
            domain = target_q.get("domain", "DSA")
        if not question_text:
            question_text = target_q.get("question_text", "")
        if expected_criteria is None:
            expected_criteria = target_q.get("expected_criteria", [])
            
    if expected_criteria is None:
        expected_criteria = []

    # Check for empty answer, silence, or unclear speech before running AI
    status_code, status_label, status_message = classify_recording_status(candidate_answer)
    
    if status_code != "completed":
        ai_output = AIEvaluationOutput(
            technical_score=None,
            score_breakdown=None,
            status=status_code,
            status_label=status_label,
            status_message=status_message,
            correct_concepts=[],
            incorrect_concepts=[],
            missing_concepts=["No technical answer provided to evaluate."],
            alternative_valid_approaches=[],
            evidence="",
            explanation=status_message,
            potential_discrepancy=False,
            review_recommendation=f"Status: {status_label}. {status_message}",
            is_sealed=True
        )
    else:
        # Run independent AI evaluation strictly on verified speech content (NO human score)
        ai_raw = evaluate_with_openai(
            domain=domain,
            question_text=question_text,
            expected_criteria=expected_criteria,
            candidate_answer=candidate_answer
        )
        ai_output = AIEvaluationOutput(**ai_raw)
        ai_output.is_sealed = True

    now = datetime.now(timezone.utc)
    existing = evaluations_col.find_one({
        "interview_id": interview_id,
        "question_id": question_id
    })

    discrepancy = DiscrepancyDetail(
        detected=False,
        type="SEALED",
        severity="LOW",
        score_delta=0.0,
        evidence="Analysis sealed during active interview",
        bias_category="Sealed"
    )

    eval_data = {
        "interview_id": interview_id,
        "question_id": question_id,
        "candidate_id": int_obj.get("candidate_id"),
        "candidate_name": int_obj.get("candidate_name", "Candidate"),
        "domain": domain,
        "question_text": question_text,
        "expected_criteria": expected_criteria,
        "candidate_answer": candidate_answer or "",
        "submission_mode": submission_mode or "voice_recorded",
        "audio_id": audio_id,
        "audio_url": audio_url or (f"/api/voice/audio/{audio_id}" if audio_id else None),
        "recording_duration": recording_duration,
        "status": status_code,
        "status_label": status_label,
        "status_message": status_message,
        "ai_evaluation": ai_output.model_dump(),
        "discrepancy": discrepancy.model_dump(),
        "is_sealed": True,
        "evaluated_at": now,
        "evaluated_by": "BiasGuard Independent AI Engine",
        "model_used": "BiasGuard AI Evaluator (" + ("Mock Mode" if settings.MOCK_AI_MODE else settings.OPENAI_MODEL) + ")"
    }

    if existing:
        eval_data["interviewer_score"] = existing.get("interviewer_score")
        eval_data["interviewer_notes"] = existing.get("interviewer_notes", "")
        eval_data["score_audit_trail"] = existing.get("score_audit_trail", [])
        evaluations_col.update_one({"_id": existing["_id"]}, {"$set": eval_data})
        eval_id = str(existing["_id"])
    else:
        eval_data["interviewer_score"] = target_q.get("interviewer_score") if target_q else None
        eval_data["interviewer_notes"] = target_q.get("interviewer_notes", "") if target_q else ""
        eval_data["score_audit_trail"] = []
        res = evaluations_col.insert_one(eval_data)
        eval_id = str(res.inserted_id)

    eval_data["id"] = eval_id

    # Update question in interview doc
    updated_questions = []
    for q in int_obj.get("questions", []):
        if q.get("id") == question_id:
            q["candidate_answer"] = candidate_answer or ""
            q["submission_mode"] = submission_mode or "voice_recorded"
            if audio_id:
                q["audio_id"] = audio_id
                q["audio_url"] = f"/api/voice/audio/{audio_id}"
            if recording_duration:
                q["recording_duration"] = recording_duration
            q["ai_evaluated"] = True
            q["evaluation_id"] = eval_id
            q["evaluation_status"] = status_code
            q["evaluation_label"] = status_label
            q["evaluation_message"] = status_message
            q["ai_score"] = ai_output.technical_score
        updated_questions.append(q)

    interviews_col.update_one(
        {"_id": ObjectId(interview_id)},
        {"$set": {
            "questions": updated_questions,
            "updated_at": now
        }}
    )

    return eval_data

@router.post("/evaluate")
async def evaluate_answer(
    eval_req: EvaluationRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Evaluates candidate answer independently with AI and optionally saves human evaluation.
    """
    interviews_col = get_interviews_collection()
    
    try:
        int_obj = interviews_col.find_one({"_id": ObjectId(eval_req.interview_id)})
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    if not int_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    # Audio-first resolution: If audio_id is provided, resolve audio doc and candidate answer
    if eval_req.audio_id:
        audio_col = get_audio_recordings_collection()
        try:
            audio_doc = audio_col.find_one({"_id": ObjectId(eval_req.audio_id)})
        except Exception:
            audio_doc = audio_col.find_one({"filename": eval_req.audio_id})
        if audio_doc:
            if not eval_req.candidate_answer or not eval_req.candidate_answer.strip():
                eval_req.candidate_answer = audio_doc.get("transcription") or audio_doc.get("edited_transcript") or ""
            eval_req.submission_mode = audio_doc.get("submission_mode", "voice_recorded")
            if not eval_req.audio_url:
                eval_req.audio_url = f"/api/voice/audio/{eval_req.audio_id}"
            if not eval_req.recording_duration:
                eval_req.recording_duration = audio_doc.get("duration_seconds")
            if not eval_req.original_transcript:
                eval_req.original_transcript = audio_doc.get("transcription")

    evaluations_col = get_evaluations_collection()
    existing_prior = evaluations_col.find_one({
        "interview_id": eval_req.interview_id,
        "question_id": eval_req.question_id
    })
    prev_score = existing_prior.get("interviewer_score") if existing_prior else None
    prev_notes = existing_prior.get("interviewer_notes") if existing_prior else None

    # Run independent AI evaluation
    eval_data = run_independent_ai_evaluation(
        interview_id=eval_req.interview_id,
        question_id=eval_req.question_id,
        candidate_answer=eval_req.candidate_answer or "",
        domain=eval_req.domain,
        question_text=eval_req.question_text,
        expected_criteria=eval_req.expected_criteria,
        audio_id=eval_req.audio_id,
        audio_url=eval_req.audio_url,
        recording_duration=eval_req.recording_duration,
        submission_mode=eval_req.submission_mode
    )

    # If interviewer score provided in evaluate call, record it with audit tracking
    if eval_req.interviewer_score is not None:
        score_audits_col = get_score_audits_collection()
        now = datetime.now(timezone.utc)
        
        if prev_score != eval_req.interviewer_score or prev_notes != eval_req.interviewer_notes:
            score_audits_col.insert_one({
                "interview_id": eval_req.interview_id,
                "question_id": eval_req.question_id,
                "previous_score": prev_score,
                "new_score": eval_req.interviewer_score,
                "previous_notes": prev_notes,
                "new_notes": eval_req.interviewer_notes or "",
                "modified_by": current_user.get("name", "Interviewer"),
                "modified_by_email": current_user.get("email"),
                "timestamp": now
            })
            evaluations_col.update_one(
                {"_id": ObjectId(eval_data["id"])},
                {"$set": {
                    "interviewer_score": eval_req.interviewer_score,
                    "interviewer_notes": eval_req.interviewer_notes or ""
                }}
            )

    is_completed = (int_obj.get("status") == "completed")
    return serialize_doc(mask_sealed_evaluation(eval_data, is_completed))

@router.post("/human-score")
async def save_human_score(
    req: HumanScoreRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Saves the interviewer's independent human score and notes.
    Maintains an audit trail of changes without exposing AI evaluation.
    """
    interviews_col = get_interviews_collection()
    evaluations_col = get_evaluations_collection()
    score_audits_col = get_score_audits_collection()
    
    try:
        int_obj = interviews_col.find_one({"_id": ObjectId(req.interview_id)})
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview ID.")
        
    if not int_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    target_q = None
    for q in int_obj.get("questions", []):
        if q.get("id") == req.question_id:
            target_q = q
            break
            
    if not target_q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found in interview.")

    now = datetime.now(timezone.utc)
    existing = evaluations_col.find_one({
        "interview_id": req.interview_id,
        "question_id": req.question_id
    })

    prev_score = existing.get("interviewer_score") if existing else target_q.get("interviewer_score")
    prev_notes = existing.get("interviewer_notes") if existing else target_q.get("interviewer_notes", "")

    # Audit trail logging
    if prev_score != req.interviewer_score or prev_notes != req.interviewer_notes:
        score_audits_col.insert_one({
            "interview_id": req.interview_id,
            "question_id": req.question_id,
            "previous_score": prev_score,
            "new_score": req.interviewer_score,
            "previous_notes": prev_notes,
            "new_notes": req.interviewer_notes or "",
            "modified_by": current_user.get("name", "Interviewer"),
            "modified_by_email": current_user.get("email"),
            "timestamp": now
        })

    audits = list(score_audits_col.find({
        "interview_id": req.interview_id,
        "question_id": req.question_id
    }).sort("timestamp", -1).limit(10))
    score_audit_trail = [serialize_doc(a) for a in audits]

    if existing:
        evaluations_col.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "interviewer_score": req.interviewer_score,
                "interviewer_notes": req.interviewer_notes or "",
                "score_audit_trail": score_audit_trail,
                "human_evaluated_at": now,
                "updated_at": now
            }}
        )
        eval_id = str(existing["_id"])
    else:
        new_eval = {
            "interview_id": req.interview_id,
            "question_id": req.question_id,
            "candidate_id": int_obj.get("candidate_id"),
            "candidate_name": int_obj.get("candidate_name", "Candidate"),
            "domain": target_q.get("domain", "DSA"),
            "question_text": target_q.get("question_text", ""),
            "expected_criteria": target_q.get("expected_criteria", []),
            "candidate_answer": target_q.get("candidate_answer", ""),
            "interviewer_score": req.interviewer_score,
            "interviewer_notes": req.interviewer_notes or "",
            "submission_mode": target_q.get("submission_mode", "voice_recorded"),
            "audio_id": target_q.get("audio_id"),
            "audio_url": target_q.get("audio_url"),
            "status": "pending_ai",
            "status_label": "Pending AI Evaluation",
            "is_sealed": True,
            "score_audit_trail": score_audit_trail,
            "created_at": now,
            "updated_at": now
        }
        res = evaluations_col.insert_one(new_eval)
        eval_id = str(res.inserted_id)

    # Update question in interview
    updated_questions = []
    for q in int_obj.get("questions", []):
        if q.get("id") == req.question_id:
            q["interviewer_score"] = req.interviewer_score
            q["interviewer_notes"] = req.interviewer_notes or ""
            q["human_evaluated"] = True
            q["evaluation_id"] = eval_id
        updated_questions.append(q)

    interviews_col.update_one(
        {"_id": ObjectId(req.interview_id)},
        {"$set": {
            "questions": updated_questions,
            "updated_at": now
        }}
    )

    return {
        "status": "saved",
        "question_id": req.question_id,
        "interviewer_score": req.interviewer_score,
        "interviewer_notes": req.interviewer_notes or "",
        "score_audit_trail": score_audit_trail,
        "saved_at": now.isoformat()
    }

@router.get("/{evaluation_id}")
async def get_evaluation(
    evaluation_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        obj_id = ObjectId(evaluation_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid evaluation ID.")
        
    evaluations_col = get_evaluations_collection()
    ev = evaluations_col.find_one({"_id": obj_id})
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found.")
        
    interviews_col = get_interviews_collection()
    int_obj = interviews_col.find_one({"_id": ObjectId(ev.get("interview_id"))})
    is_completed = (int_obj.get("status") == "completed") if int_obj else False
    
    return serialize_doc(mask_sealed_evaluation(ev, is_completed))

@router.get("/interview/{interview_id}")
async def get_interview_evaluations(
    interview_id: str,
    current_user: dict = Depends(get_current_user)
):
    evaluations_col = get_evaluations_collection()
    interviews_col = get_interviews_collection()
    
    try:
        int_obj = interviews_col.find_one({"_id": ObjectId(interview_id)})
    except Exception:
        int_obj = None
        
    is_completed = (int_obj.get("status") == "completed") if int_obj else False
    evals = list(evaluations_col.find({"interview_id": interview_id}).sort("evaluated_at", 1))
    return [serialize_doc(mask_sealed_evaluation(e, is_completed)) for e in evals]

@router.get("/audit-trail/{interview_id}")
async def get_interview_score_audit_trail(
    interview_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Returns the full chronological audit trail of all interviewer score changes for an interview."""
    score_audits_col = get_score_audits_collection()
    audits = list(score_audits_col.find({"interview_id": interview_id}).sort("timestamp", -1))
    return [serialize_doc(a) for a in audits]

def unseal_all_interview_evaluations(interview_id: str):
    """
    Unseals all evaluations for an interview, computes discrepancy analysis comparing
    independent human vs AI scores, and generates the final executive report.
    """
    evaluations_col = get_evaluations_collection()
    evals = list(evaluations_col.find({"interview_id": interview_id}))
    
    for ev in evals:
        ai_eval_dict = ev.get("ai_evaluation", {})
        int_score = ev.get("interviewer_score")
        int_notes = ev.get("interviewer_notes", "")
        
        # Discrepancy analysis
        if ai_eval_dict and ai_eval_dict.get("technical_score") is not None and int_score is not None:
            ai_output = AIEvaluationOutput(**ai_eval_dict)
            discrepancy = analyze_discrepancy(
                ai_eval=ai_output,
                interviewer_score=int_score,
                interviewer_notes=int_notes,
                expected_criteria=ev.get("expected_criteria", [])
            )
            discrepancy_dict = discrepancy.model_dump()
        else:
            discrepancy_dict = {
                "detected": False,
                "type": "CALIBRATED",
                "severity": "LOW",
                "score_delta": 0.0,
                "evidence": "No score divergence detected.",
                "bias_category": "Calibrated"
            }
            
        evaluations_col.update_one(
            {"_id": ev["_id"]},
            {"$set": {
                "is_sealed": False,
                "discrepancy": discrepancy_dict,
                "ai_evaluation.is_sealed": False,
                "unsealed_at": datetime.now(timezone.utc)
            }}
        )
    sync_interview_report(interview_id)

def sync_interview_report(interview_id: str):
    """Aggregates all question evaluations into an explainable executive report."""
    interviews_col = get_interviews_collection()
    evaluations_col = get_evaluations_collection()
    reports_col = get_reports_collection()
    
    try:
        interview = interviews_col.find_one({"_id": ObjectId(interview_id)})
        if not interview:
            return
        evals = list(evaluations_col.find({"interview_id": interview_id}))
        if not evals:
            return
            
        total_questions = len(interview.get("questions", []))
        evaluated_questions = len(evals)
        completion_rate = round((evaluated_questions / max(1, total_questions)) * 100, 1)
        
        ai_scores = [
            float(e["ai_evaluation"]["technical_score"]) 
            for e in evals 
            if "ai_evaluation" in e and e["ai_evaluation"].get("technical_score") is not None
        ]
        int_scores = [float(e["interviewer_score"]) for e in evals if e.get("interviewer_score") is not None]
        
        avg_ai = round(sum(ai_scores) / len(ai_scores), 1) if ai_scores else None
        avg_int = round(sum(int_scores) / len(int_scores), 1) if int_scores else None
        
        weighted_ai = round(avg_ai * (evaluated_questions / max(1, total_questions)), 1) if avg_ai is not None else None
        weighted_int = round(avg_int * (evaluated_questions / max(1, total_questions)), 1) if avg_int is not None else None
        
        discrepancies = [e for e in evals if e.get("discrepancy", {}).get("detected")]
        discrepancy_count = len(discrepancies)
        
        if discrepancy_count == 0:
            rating = "High Consistency"
            summary = "The interviewer's evaluations show strong parity with the independent AI technical benchmarks. Scoring is evidence-based and free from noticeable systemic bias."
        elif discrepancy_count == 1:
            rating = "Moderate Discrepancy"
            summary = "1 potential evaluation discrepancy detected. We recommend reviewing the specific question flag to confirm whether valid alternative solutions or language differences influenced scoring."
        else:
            rating = "Action Recommended"
            summary = f"{discrepancy_count} potential discrepancies detected across {evaluated_questions} questions. A senior bar raiser or calibration committee should review candidate answers prior to final hiring decision."
            
        if evaluated_questions < total_questions:
            summary += f" [Session Notice: Incomplete interview - {evaluated_questions} of {total_questions} questions attempted ({completion_rate}% completion).]"

        recommendations = []
        for d in discrepancies:
            disc = d.get("discrepancy", {})
            recommendations.append(f"Question '{d.get('question_text')[:40]}...': {disc.get('evidence', 'Review recommended')}")
            
        if not recommendations:
            recommendations.append("All evaluated responses match objective rubric standards.")
            
        report_data = {
            "interview_id": interview_id,
            "interview_title": interview.get("title", "Technical Interview"),
            "candidate_id": interview.get("candidate_id"),
            "candidate_name": interview.get("candidate_name", "Candidate"),
            "candidate_role": interview.get("candidate_role", "Engineer"),
            "interviewer_id": interview.get("interviewer_id"),
            "interviewer_name": interview.get("interviewer_name", "Interviewer"),
            "domains": interview.get("domains", []),
            "total_questions": total_questions,
            "evaluated_questions": evaluated_questions,
            "completion_rate": completion_rate,
            "average_interviewer_score": avg_int,
            "average_ai_score": avg_ai,
            "weighted_interviewer_score": weighted_int,
            "weighted_ai_score": weighted_ai,
            "discrepancy_count": discrepancy_count,
            "overall_fairness_rating": rating,
            "executive_summary": summary,
            "recommendations": recommendations,
            "updated_at": datetime.now(timezone.utc)
        }
        
        existing_report = reports_col.find_one({"interview_id": interview_id})
        if existing_report:
            reports_col.update_one({"_id": existing_report["_id"]}, {"$set": report_data})
        else:
            report_data["created_at"] = datetime.now(timezone.utc)
            reports_col.insert_one(report_data)
            
    except Exception as e:
        logger.error(f"Error syncing report: {e}")
