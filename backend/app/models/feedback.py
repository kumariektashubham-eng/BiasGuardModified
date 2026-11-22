from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class FeedbackCreate(BaseModel):
    evaluation_id: str
    interview_id: str
    question_id: str
    expert_score: float = Field(..., ge=0.0, le=10.0)
    expert_explanation: str = Field(..., min_length=5)
    expert_correct_concepts: List[str] = Field(default_factory=list)
    expert_missing_concepts: List[str] = Field(default_factory=list)
    expert_incorrect_concepts: List[str] = Field(default_factory=list)
    is_alternative_approach: bool = False
    alternative_approach_name: Optional[str] = ""
    feedback_notes: Optional[str] = ""
    promote_to_training: bool = True

class FeedbackUpdateStatus(BaseModel):
    status: str = Field(..., description="'approved', 'rejected', 'pending'")
    review_notes: Optional[str] = None

class FeedbackResponse(BaseModel):
    id: str
    evaluation_id: str
    interview_id: str
    question_id: str
    candidate_name: Optional[str] = ""
    domain: Optional[str] = ""
    question_text: Optional[str] = ""
    candidate_answer: Optional[str] = ""
    original_ai_score: float
    original_ai_explanation: str
    original_ai_concepts: Optional[Dict[str, Any]] = None
    expert_score: float
    expert_explanation: str
    expert_correct_concepts: List[str]
    expert_missing_concepts: List[str]
    expert_incorrect_concepts: List[str]
    is_alternative_approach: bool
    alternative_approach_name: Optional[str]
    feedback_notes: Optional[str]
    reviewed_by: str
    status: str
    promoted_to_dataset: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
