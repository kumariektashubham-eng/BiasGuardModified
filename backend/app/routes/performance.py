from fastapi import APIRouter, Depends
from app.models.performance import PerformanceMetricsResponse
from app.services.auth_service import get_current_user
from app.services.performance_service import calculate_performance_metrics

router = APIRouter(prefix="/performance", tags=["Model Performance"])

@router.get("/dashboard", response_model=PerformanceMetricsResponse)
async def get_performance_dashboard(
    current_user: dict = Depends(get_current_user)
):
    """
    Returns Mean Absolute Error (MAE), RMSE, Classification Accuracy,
    Precision, Recall, Consistency, Domain Matrix, and Model History.
    """
    return calculate_performance_metrics()
