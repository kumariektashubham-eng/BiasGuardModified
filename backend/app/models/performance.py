from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class DomainPerformance(BaseModel):
    domain: str
    total_evaluations: int
    mae: float
    rmse: float
    accuracy: float
    precision: float
    recall: float
    consistency: float

class ConfusionMatrix(BaseModel):
    labels: List[str]
    matrix: List[List[int]]

class PerformanceMetricsResponse(BaseModel):
    total_evaluations_audited: int
    mean_absolute_error: float
    root_mean_squared_error: float
    classification_accuracy: float
    precision: float
    recall: float
    f1_score: float
    evaluation_consistency_score: float
    domain_breakdown: List[DomainPerformance]
    confusion_matrix: ConfusionMatrix
    model_version_history: List[Dict[str, Any]]
    ai_vs_expert_comparisons: List[Dict[str, Any]]
