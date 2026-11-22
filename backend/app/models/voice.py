from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class AudioUploadResponse(BaseModel):
    id: str
    interview_id: str
    question_id: str
    candidate_id: Optional[str] = None
    filename: str
    file_size: int
    content_type: str
    duration_seconds: float
    transcription: str = ""
    audio_url: str
    submission_mode: str = "voice_recorded"  # 'voice_recorded' or 'audio_upload'
    speech_detected: bool = True
    status: str = "ready"  # 'ready' | 'no_speech_detected' | 'transcription_unclear' | 'transcription_failed'
    status_label: str = "Completed"
    status_message: Optional[str] = None
    created_at: datetime

class AudioMetadataResponse(BaseModel):
    id: str
    interview_id: str
    question_id: str
    candidate_id: Optional[str] = None
    filename: str
    file_size: int
    content_type: str
    duration_seconds: float
    transcription: str = ""
    edited_transcript: Optional[str] = None
    audio_url: str
    submission_mode: str
    speech_detected: bool = True
    status: str = "ready"
    status_label: str = "Completed"
    status_message: Optional[str] = None
    created_at: datetime
    uploaded_by: Optional[str] = None

class TranscriptionUpdateRequest(BaseModel):
    edited_transcript: str = Field(..., min_length=1)

class VoiceEvaluationRequest(BaseModel):
    interview_id: str
    question_id: str
    audio_id: str
    final_answer: str = Field(..., min_length=2)
    domain: str
    question_text: str
    expected_criteria: List[str] = Field(default_factory=list)
    interviewer_score: Optional[float] = Field(None, ge=0.0, le=10.0)
    interviewer_notes: Optional[str] = ""
    submission_mode: str = "voice_recorded"
