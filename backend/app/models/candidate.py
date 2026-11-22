from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime

class CandidateBase(BaseModel):
    name: str = Field(..., min_length=2)
    email: EmailStr
    phone: Optional[str] = ""
    experience_years: float = Field(default=0.0, ge=0.0)
    target_role: str = Field(..., min_length=2)
    primary_skills: List[str] = Field(default_factory=list)
    resume_summary: Optional[str] = ""
    notes: Optional[str] = ""

class CandidateCreate(CandidateBase):
    pass

class CandidateUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    experience_years: Optional[float] = None
    target_role: Optional[str] = None
    primary_skills: Optional[List[str]] = None
    resume_summary: Optional[str] = None
    notes: Optional[str] = None

class CandidateResponse(CandidateBase):
    id: str
    created_at: datetime
    interviews_count: Optional[int] = 0
    average_score: Optional[float] = 0.0
