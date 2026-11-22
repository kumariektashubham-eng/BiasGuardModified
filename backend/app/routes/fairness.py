from fastapi import APIRouter, Depends
from app.models.fairness import FairnessTestRunResponse
from app.services.auth_service import get_current_user
from app.services.fairness_service import run_fairness_benchmark_suite, get_latest_fairness_run

router = APIRouter(prefix="/fairness", tags=["Fairness Testing"])

@router.get("/benchmark", response_model=FairnessTestRunResponse)
async def get_benchmark(current_user: dict = Depends(get_current_user)):
    """Returns the latest fairness and stylistic invariance audit results."""
    return get_latest_fairness_run()

@router.post("/run", response_model=FairnessTestRunResponse)
async def trigger_run(current_user: dict = Depends(get_current_user)):
    """Executes a new automated fairness benchmark testing stylistic and alternative approach parity."""
    return run_fairness_benchmark_suite()
