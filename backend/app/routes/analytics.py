from fastapi import APIRouter, Depends
from app.services.analytics_service import get_dashboard_metrics
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/analytics", tags=["Analytics"])

@router.get("/dashboard")
async def get_dashboard_analytics(
    current_user: dict = Depends(get_current_user)
):
    """Returns aggregated KPIs, domain breakdown, score distributions, and discrepancy charts."""
    return get_dashboard_metrics()
