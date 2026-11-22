from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class EvaluationRequest(BaseModel):
    interview_id: str
    question_id: str
    question_text: str
    domain: str
    expected_criteria: List[str] = Field(default_factory=list)
    candidate_answer: Optional[str] = Field(default="", description="Resolved from audio_id if omitted")
    interviewer_score: Optional[float] = Field(None, ge=0.0, le=10.0)
    interviewer_notes: Optional[str] = ""
    submission_mode: Optional[str] = Field("voice_recorded", description="'voice_recorded', 'audio_upload', 'text'")
    audio_id: Optional[str] = None
    audio_url: Optional[str] = None
    recording_duration: Optional[float] = None
    original_transcript: Optional[str] = None

class ScoreBreakdown(BaseModel):
    technical_correctness: Optional[float] = Field(None, ge=0.0, le=4.0, description="Max 4.0 (40% weight)")
    conceptual_understanding: Optional[float] = Field(None, ge=0.0, le=3.0, description="Max 3.0 (30% weight)")
    completeness: Optional[float] = Field(None, ge=0.0, le=2.0, description="Max 2.0 (20% weight)")
    reasoning: Optional[float] = Field(None, ge=0.0, le=1.0, description="Max 1.0 (10% weight)")

class HumanScoreRequest(BaseModel):
    interview_id: str
    question_id: str
    interviewer_score: float = Field(..., ge=0.0, le=10.0)
    interviewer_notes: Optional[str] = ""

class AIEvaluationOutput(BaseModel):
    technical_score: Optional[float] = Field(None, ge=0.0, le=10.0)
    score_breakdown: Optional[ScoreBreakdown] = None
    status: Optional[str] = "completed"  # 'completed' | 'no_speech_detected' | 'transcription_unclear' | 'transcription_failed'
    status_label: Optional[str] = "Completed"
    status_message: Optional[str] = None
    correct_concepts: List[str] = Field(default_factory=list)
    incorrect_concepts: List[str] = Field(default_factory=list)
    missing_concepts: List[str] = Field(default_factory=list)
    alternative_valid_approaches: List[str] = Field(default_factory=list)
    evidence: Optional[str] = ""
    explanation: str
    potential_discrepancy: bool = False
    review_recommendation: str
    is_sealed: bool = True

class DiscrepancyDetail(BaseModel):
    detected: bool = False
    type: Optional[str] = None  # e.g. "UNDER_EVALUATED_ALTERNATIVE_APPROACH", "UNREASONABLY_HARSH_SCORING", "KEYWORD_PENALTY_BIAS", "GRADE_INFLATION", "LACK_OF_TECHNICAL_JUSTIFICATION"
    severity: str = "LOW"  # LOW, MEDIUM, HIGH
    score_delta: float = 0.0  # interviewer_score - ai_score
    evidence: str = ""
    bias_category: Optional[str] = None

class EvaluationRecord(BaseModel):
    id: Optional[str] = None
    interview_id: str
    question_id: str
    candidate_id: str
    candidate_name: Optional[str] = ""
    domain: str
    question_text: str
    expected_criteria: List[str]
    candidate_answer: str
    interviewer_score: Optional[float] = None
    interviewer_notes: Optional[str] = ""
    submission_mode: Optional[str] = "text"
    audio_id: Optional[str] = None
    audio_url: Optional[str] = None
    recording_duration: Optional[float] = None
    original_transcript: Optional[str] = None
    status: Optional[str] = "completed"
    status_label: Optional[str] = "Completed"
    status_message: Optional[str] = None
    
    # AI Results
    ai_evaluation: AIEvaluationOutput
    is_sealed: bool = True
    
    # Bias / Discrepancy Analysis
    discrepancy: DiscrepancyDetail
    score_audit_trail: Optional[List[Dict[str, Any]]] = None
    
    evaluated_at: datetime = Field(default_factory=datetime.utcnow)
    evaluated_by: Optional[str] = "BiasGuard AI Engine"
    model_used: Optional[str] = "gpt-4o-mini"
