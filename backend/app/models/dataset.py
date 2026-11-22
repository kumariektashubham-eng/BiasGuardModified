from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class DatasetItemBase(BaseModel):
    question_text: str = Field(..., min_length=5)
    domain: str = Field(..., description="Java, Python, DSA, DBMS, SQL, Operating Systems")
    expected_concepts: List[str] = Field(default_factory=list)
    expected_criteria: List[str] = Field(default_factory=list)
    candidate_answer: str = Field(..., min_length=2)
    expert_score: float = Field(..., ge=0.0, le=10.0)
    correctness_label: str = Field(
        default="correct", 
        description="'correct', 'partially_correct', 'incorrect', 'alternative_valid_approach'"
    )
    expert_explanation: str = Field(..., min_length=5)
    alternative_approaches: List[str] = Field(default_factory=list)
    validated: bool = Field(default=False)
    source: str = Field(default="manual_entry")

class DatasetItemCreate(DatasetItemBase):
    pass

class DatasetItemUpdate(BaseModel):
    question_text: Optional[str] = None
    domain: Optional[str] = None
    expected_concepts: Optional[List[str]] = None
    expected_criteria: Optional[List[str]] = None
    candidate_answer: Optional[str] = None
    expert_score: Optional[float] = None
    correctness_label: Optional[str] = None
    expert_explanation: Optional[str] = None
    alternative_approaches: Optional[List[str]] = None
    validated: Optional[bool] = None

class DatasetItemResponse(DatasetItemBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

class DatasetUploadStats(BaseModel):
    total_parsed: int
    successfully_imported: int
    duplicates_skipped: int
    errors: List[str] = Field(default_factory=list)
