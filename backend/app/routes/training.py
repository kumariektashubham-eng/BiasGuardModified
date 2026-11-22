from fastapi import APIRouter, HTTPException, status, Depends
from typing import List, Optional
from app.models.training import (
    TrainingPrepareRequest,
    TrainingPrepareResponse,
    FineTuneRequest,
    FineTuneJobResponse
)
from app.services.auth_service import get_current_user, require_admin
from app.services.training_service import (
    prepare_fine_tuning_dataset,
    trigger_fine_tuning_job,
    list_fine_tuning_jobs
)
from app.database import get_fine_tuning_jobs_collection, serialize_doc
from bson import ObjectId

router = APIRouter(prefix="/training", tags=["Model Training"])

@router.post("/prepare", response_model=TrainingPrepareResponse)
async def prepare_training(
    prep_in: TrainingPrepareRequest,
    current_user: dict = Depends(get_current_user)
):
    res = prepare_fine_tuning_dataset(
        validation_split=prep_in.validation_split,
        filter_domain=prep_in.filter_domain,
        require_validated_only=prep_in.require_validated_only
    )
    return res

@router.post("/fine-tune", response_model=FineTuneJobResponse, status_code=status.HTTP_201_CREATED)
async def launch_fine_tune(
    ft_in: FineTuneRequest,
    current_user: dict = Depends(require_admin)
):
    job = trigger_fine_tuning_job(
        base_model=ft_in.base_model,
        validation_split=ft_in.validation_split,
        hyperparameters=ft_in.hyperparameters,
        job_label=ft_in.job_label or "biasguard-calibrated",
        user=current_user
    )
    return job

@router.get("/jobs", response_model=List[FineTuneJobResponse])
async def get_jobs_list(current_user: dict = Depends(get_current_user)):
    return list_fine_tuning_jobs()

@router.get("/jobs/{job_id}", response_model=FineTuneJobResponse)
async def get_job_status(
    job_id: str,
    current_user: dict = Depends(get_current_user)
):
    col = get_fine_tuning_jobs_collection()
    query = {"job_id": job_id}
    try:
        query = {"$or": [{"_id": ObjectId(job_id)}, {"job_id": job_id}]}
    except Exception:
        pass
    job = col.find_one(query)
    if not job:
        raise HTTPException(status_code=404, detail="Fine tuning job not found.")
    return serialize_doc(job)
