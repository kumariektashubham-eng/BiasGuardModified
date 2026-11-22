from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class QuestionItem(BaseModel):
    id: str = Field(default_factory=lambda: "")
    domain: str = Field(..., description="Java, Python, DSA, DBMS, SQL, Operating Systems, etc.")
    question_text: str = Field(..., min_length=5)
    difficulty: str = Field(default="Medium", description="Easy, Medium, Hard")
    expected_criteria: List[str] = Field(default_factory=list, description="Key concepts, complexities, edge cases")
    sample_answer: Optional[str] = ""
    candidate_answer: Optional[str] = ""
    transcription: Optional[str] = ""
    interviewer_score: Optional[float] = None
    interviewer_notes: Optional[str] = ""
    evaluated: bool = False
    evaluation_id: Optional[str] = None
    submission_mode: Optional[str] = "text"
    audio_id: Optional[str] = None
    audio_url: Optional[str] = None
    video_id: Optional[str] = None
    video_url: Optional[str] = None
    recording_type: Optional[str] = "audio_video"
    recording_duration: Optional[float] = None
    submitted_at: Optional[datetime] = None

class InterviewInvitation(BaseModel):
    token_hash: Optional[str] = None
    expires_at: Optional[datetime] = None
    status: str = Field(default="pending", description="pending, sent, accepted, started, completed, expired, cancelled")
    sent_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    candidate_email: Optional[str] = None
    invite_url: Optional[str] = None
    raw_token: Optional[str] = None
    email_status: Optional[str] = None
    email_error: Optional[str] = None
    email_sent_at: Optional[datetime] = None

class SendInvitationRequest(BaseModel):
    candidate_email: Optional[str] = None
    force_resend: Optional[bool] = False

class SuggestedQuestionItem(BaseModel):
    id: str = Field(default_factory=lambda: "")
    question_text: str = Field(..., min_length=5)
    domain: str = Field(default="General")
    difficulty: str = Field(default="Medium")
    follow_up_reason: Optional[str] = ""
    expected_criteria: List[str] = Field(default_factory=list)
    sample_answer: Optional[str] = ""
    status: str = Field(default="suggested", description="suggested, selected, asked, skipped")
    created_at: Optional[datetime] = None

class GenerateSuggestedQuestionsRequest(BaseModel):
    domain: Optional[str] = None
    force_refresh: Optional[bool] = False

class InterviewCreate(BaseModel):
    title: str = Field(..., min_length=3)
    candidate_id: str
    domains: List[str] = Field(default_factory=list)
    questions: List[QuestionItem] = Field(default_factory=list)
    status: Optional[str] = "not_started"
    send_invitation: Optional[bool] = False
    candidate_email: Optional[str] = None

class InterviewUpdate(BaseModel):
    title: Optional[str] = None
    domains: Optional[List[str]] = None
    status: Optional[str] = None
    questions: Optional[List[QuestionItem]] = None
    suggested_questions: Optional[List[SuggestedQuestionItem]] = None
    current_question_index: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    invitation: Optional[InterviewInvitation] = None
    room_name: Optional[str] = None

class InterviewResponse(BaseModel):
    id: str
    title: str
    candidate_id: str
    candidate_name: Optional[str] = ""
    candidate_role: Optional[str] = ""
    candidate_email: Optional[str] = ""
    interviewer_id: str
    interviewer_name: Optional[str] = ""
    domains: List[str]
    status: str
    questions: List[QuestionItem]
    suggested_questions: Optional[List[SuggestedQuestionItem]] = Field(default_factory=list)
    current_question_index: Optional[int] = 0
    invitation: Optional[InterviewInvitation] = None
    room_name: Optional[str] = None
    livekit_url: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    total_questions: Optional[int] = 0
    evaluated_questions: Optional[int] = 0
    discrepancy_count: Optional[int] = 0
    average_interviewer_score: Optional[float] = None
    average_ai_score: Optional[float] = None
