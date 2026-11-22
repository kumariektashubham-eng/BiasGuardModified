import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from bson import ObjectId
from app.database import (
    get_evaluation_feedbacks_collection,
    get_evaluations_collection,
    get_training_datasets_collection,
    get_interviews_collection,
    serialize_doc
)
from app.models.feedback import FeedbackCreate
from app.services.rag_service import index_reference_answer

logger = logging.getLogger("biasguard.feedback_service")

def submit_expert_feedback(
    feedback_in: FeedbackCreate,
    expert_user: dict
) -> Dict[str, Any]:
    """
    Records an authorized human expert's review and correction of an AI evaluation.
    Keeps the original AI prediction immutable, stores the correction separately,
    and optionally promotes the verified example to the training dataset & RAG reference store.
    """
    eval_col = get_evaluations_collection()
    fb_col = get_evaluation_feedbacks_collection()
    
    # Verify original evaluation
    try:
        eval_obj = eval_col.find_one({"_id": ObjectId(feedback_in.evaluation_id)})
    except Exception:
        eval_obj = eval_col.find_one({"id": feedback_in.evaluation_id})
        
    if not eval_obj:
        raise ValueError(f"Original evaluation '{feedback_in.evaluation_id}' not found.")
        
    now = datetime.now(timezone.utc)
    original_ai = eval_obj.get("ai_evaluation", {})
    
    feedback_record = {
        "evaluation_id": str(eval_obj["_id"]),
        "interview_id": feedback_in.interview_id,
        "question_id": feedback_in.question_id,
        "candidate_name": eval_obj.get("candidate_name", "Candidate"),
        "domain": eval_obj.get("domain", "General"),
        "question_text": eval_obj.get("question_text", ""),
        "candidate_answer": eval_obj.get("candidate_answer", ""),
        "original_ai_score": float(original_ai.get("technical_score", 0.0)),
        "original_ai_explanation": original_ai.get("explanation", ""),
        "original_ai_concepts": {
            "correct_concepts": original_ai.get("correct_concepts", []),
            "incorrect_concepts": original_ai.get("incorrect_concepts", []),
            "missing_concepts": original_ai.get("missing_concepts", []),
            "alternative_valid_approaches": original_ai.get("alternative_valid_approaches", [])
        },
        "expert_score": float(feedback_in.expert_score),
        "expert_explanation": feedback_in.expert_explanation,
        "expert_correct_concepts": feedback_in.expert_correct_concepts,
        "expert_missing_concepts": feedback_in.expert_missing_concepts,
        "expert_incorrect_concepts": feedback_in.expert_incorrect_concepts,
        "is_alternative_approach": feedback_in.is_alternative_approach,
        "alternative_approach_name": feedback_in.alternative_approach_name or "",
        "feedback_notes": feedback_in.feedback_notes or "",
        "reviewed_by": expert_user.get("name", "Domain Expert"),
        "reviewer_id": expert_user.get("id"),
        "status": "approved",
        "promoted_to_dataset": bool(feedback_in.promote_to_training),
        "created_at": now,
        "updated_at": now
    }
    
    res = fb_col.insert_one(feedback_record)
    fb_id = str(res.inserted_id)
    feedback_record["_id"] = res.inserted_id
    
    # Mark evaluation document with expert review audit metadata
    eval_col.update_one(
        {"_id": eval_obj["_id"]},
        {"$set": {
            "has_expert_review": True,
            "expert_feedback_id": fb_id,
            "expert_calibrated_score": float(feedback_in.expert_score),
            "expert_reviewed_at": now
        }}
    )
    
    # Continuous Improvement Pipeline: Promote to Verified Training Dataset & RAG Vector Bank
    if feedback_in.promote_to_training:
        promote_feedback_to_dataset(feedback_record)
        
    return serialize_doc(feedback_record)

def promote_feedback_to_dataset(feedback_doc: dict):
    """
    Converts verified expert feedback into a high-quality ground-truth training item
    and indexes it in the RAG vector store for instant few-shot grounding.
    """
    ds_col = get_training_datasets_collection()
    
    # Determine correctness label
    score = feedback_doc["expert_score"]
    if feedback_doc.get("is_alternative_approach"):
        label = "alternative_valid_approach"
    elif score >= 8.0:
        label = "correct"
    elif score >= 5.0:
        label = "partially_correct"
    else:
        label = "incorrect"
        
    alt_approaches = []
    if feedback_doc.get("alternative_approach_name"):
        alt_approaches.append(feedback_doc["alternative_approach_name"])

    dataset_item = {
        "question_text": feedback_doc["question_text"],
        "domain": feedback_doc["domain"],
        "expected_concepts": feedback_doc.get("expert_correct_concepts", []),
        "expected_criteria": feedback_doc.get("expert_correct_concepts", []) + feedback_doc.get("expert_missing_concepts", []),
        "candidate_answer": feedback_doc["candidate_answer"],
        "expert_score": feedback_doc["expert_score"],
        "correctness_label": label,
        "expert_explanation": feedback_doc["expert_explanation"],
        "alternative_approaches": alt_approaches,
        "validated": True,
        "source": "human_feedback",
        "source_feedback_id": str(feedback_doc.get("_id", "")),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    ds_res = ds_col.insert_one(dataset_item)
    ds_id = str(ds_res.inserted_id)
    
    # Index in RAG vector store
    try:
        index_reference_answer(
            domain=feedback_doc["domain"],
            title=f"Expert Verified: {feedback_doc.get('question_text', '')[:45]}...",
            reference_text=feedback_doc["candidate_answer"],
            key_concepts=feedback_doc.get("expert_correct_concepts", []),
            dataset_id=ds_id,
            source="verified_human_feedback"
        )
        logger.info(f"Feedback promoted to verified training dataset (id: {ds_id}) and RAG reference store.")
    except Exception as e:
        logger.warning(f"Error indexing feedback in RAG: {e}")

def list_feedbacks(status: Optional[str] = None, domain: Optional[str] = None) -> List[Dict[str, Any]]:
    fb_col = get_evaluation_feedbacks_collection()
    q = {}
    if status:
        q["status"] = status
    if domain:
        q["domain"] = domain
    cursor = fb_col.find(q).sort("created_at", -1)
    return [serialize_doc(f) for f in cursor]
