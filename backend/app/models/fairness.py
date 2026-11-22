from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class FairnessVariationResult(BaseModel):
    style_label: str  # "Academic/Formal", "Casual/Pragmatic", "ESL/Non-Native", "Concise/Bullet", "Alternative Paradigm"
    answer_text: str
    ai_score: float
    score_delta_from_baseline: float
    identified_concepts_count: int
    flagged_discrepancy: bool
    evaluation_notes: str

class FairnessTestCaseResult(BaseModel):
    test_id: str
    domain: str
    question_text: str
    baseline_answer: str
    baseline_score: float
    variations: List[FairnessVariationResult]
    max_variance: float
    is_fair: bool
    flag_reason: Optional[str] = None

class FairnessTestRunResponse(BaseModel):
    id: str
    run_name: str
    created_at: datetime
    total_test_cases: int
    total_variations_evaluated: int
    average_variance: float
    max_observed_variance: float
    fairness_compliance_rate: float
    flagged_discrepancy_count: int
    test_results: List[FairnessTestCaseResult]
    summary_verdict: str
