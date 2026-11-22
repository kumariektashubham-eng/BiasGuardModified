from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.models.evaluation import AIEvaluationOutput, DiscrepancyDetail

class SingleReportItem(BaseModel):
    evaluation_id: str
    question_id: str
    domain: str
    question_text: str
    expected_criteria: List[str]
    candidate_answer: str
    interviewer_score: Optional[float]
    interviewer_notes: Optional[str]
    submission_mode: Optional[str] = "text"
    audio_id: Optional[str] = None
    audio_url: Optional[str] = None
    recording_duration: Optional[float] = None
    ai_evaluation: AIEvaluationOutput
    discrepancy: DiscrepancyDetail

class InterviewReportResponse(BaseModel):
    id: str
    interview_id: str
    interview_title: str
    candidate_id: str
    candidate_name: str
    candidate_role: str
    interviewer_id: str
    interviewer_name: str
    domains: List[str]
    created_at: datetime
    
    # Aggregated stats
    total_questions: int
    evaluated_questions: int
    average_interviewer_score: Optional[float]
    average_ai_score: Optional[float]
    discrepancy_count: int
    overall_fairness_rating: str  # "High Consistency", "Moderate Discrepancy", "Action Recommended"
    
    # Items
    evaluations: List[SingleReportItem]
    executive_summary: str
    recommendations: List[str]
