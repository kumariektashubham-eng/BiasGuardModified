from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class TrainingPrepareRequest(BaseModel):
    validation_split: float = Field(default=0.2, ge=0.05, le=0.5)
    filter_domain: Optional[str] = None
    require_validated_only: bool = True

class TrainingPrepareResponse(BaseModel):
    total_eligible_examples: int
    train_count: int
    validation_count: int
    domains_distribution: Dict[str, int]
    avg_answer_length_chars: int
    jsonl_preview: List[Dict[str, Any]]
    is_ready_for_fine_tuning: bool
    validation_warnings: List[str]

class FineTuneRequest(BaseModel):
    base_model: str = Field(default="gpt-4o-mini-2024-07-18")
    hyperparameters: Optional[Dict[str, Any]] = Field(default_factory=dict)
    validation_split: float = Field(default=0.2)
    job_label: Optional[str] = "biasguard-fine-tune"

class FineTuneJobResponse(BaseModel):
    id: str
    job_id: str
    status: str
    base_model: str
    fine_tuned_model: Optional[str] = None
    training_examples_count: int
    validation_examples_count: int
    created_at: datetime
    finished_at: Optional[datetime] = None
    metrics: Dict[str, Any] = Field(default_factory=dict)
    message: Optional[str] = ""
