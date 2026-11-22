from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Query, Response
from typing import List, Optional
from datetime import datetime, timezone
import json
import csv
import io
from bson import ObjectId
from app.models.dataset import (
    DatasetItemCreate,
    DatasetItemUpdate,
    DatasetItemResponse,
    DatasetUploadStats
)
from app.database import get_training_datasets_collection, serialize_doc
from app.services.auth_service import get_current_user, require_admin
from app.services.training_service import export_jsonl_dataset

router = APIRouter(prefix="/datasets", tags=["Dataset Management"])

@router.get("", response_model=List[DatasetItemResponse])
async def list_dataset_items(
    domain: Optional[str] = None,
    validated: Optional[bool] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    col = get_training_datasets_collection()
    q = {}
    if domain and domain != "ALL":
        q["domain"] = domain
    if validated is not None:
        q["validated"] = validated
    if search:
        q["$or"] = [
            {"question_text": {"$regex": search, "$options": "i"}},
            {"candidate_answer": {"$regex": search, "$options": "i"}},
            {"expert_explanation": {"$regex": search, "$options": "i"}}
        ]
        
    cursor = col.find(q).sort("created_at", -1)
    return [serialize_doc(d) for d in cursor]

@router.post("", response_model=DatasetItemResponse, status_code=status.HTTP_201_CREATED)
async def create_dataset_item(
    item_in: DatasetItemCreate,
    current_user: dict = Depends(get_current_user)
):
    col = get_training_datasets_collection()
    now = datetime.now(timezone.utc)
    new_doc = item_in.model_dump()
    new_doc["created_at"] = now
    new_doc["updated_at"] = now
    new_doc["created_by"] = current_user.get("name", "User")
    
    res = col.insert_one(new_doc)
    new_doc["_id"] = res.inserted_id
    return serialize_doc(new_doc)

@router.get("/{item_id}", response_model=DatasetItemResponse)
async def get_dataset_item(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        obj_id = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID format.")
    col = get_training_datasets_collection()
    doc = col.find_one({"_id": obj_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset item not found.")
    return serialize_doc(doc)

@router.put("/{item_id}", response_model=DatasetItemResponse)
async def update_dataset_item(
    item_id: str,
    update_in: DatasetItemUpdate,
    current_user: dict = Depends(get_current_user)
):
    try:
        obj_id = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID format.")
        
    col = get_training_datasets_collection()
    update_data = {k: v for k, v in update_in.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    res = col.find_one_and_update(
        {"_id": obj_id},
        {"$set": update_data},
        return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="Dataset item not found.")
    return serialize_doc(res)

@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset_item(
    item_id: str,
    current_user: dict = Depends(require_admin)
):
    try:
        obj_id = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID format.")
    col = get_training_datasets_collection()
    col.delete_one({"_id": obj_id})
    return None

@router.post("/validate/{item_id}")
async def validate_dataset_item(
    item_id: str,
    current_user: dict = Depends(require_admin)
):
    try:
        obj_id = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID format.")
    col = get_training_datasets_collection()
    res = col.find_one_and_update(
        {"_id": obj_id},
        {"$set": {
            "validated": True,
            "validated_by": current_user.get("name", "Admin"),
            "validated_at": datetime.now(timezone.utc)
        }},
        return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="Dataset item not found.")
    return serialize_doc(res)

@router.post("/upload/json", response_model=DatasetUploadStats)
async def upload_json_dataset(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_admin)
):
    """
    Parses and ingests a JSON dataset file containing technical questions and expert-reviewed answers.
    """
    content = await file.read()
    try:
        items = json.loads(content.decode('utf-8'))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file format: {e}")
        
    if not isinstance(items, list):
        if isinstance(items, dict) and "examples" in items:
            items = items["examples"]
        else:
            raise HTTPException(status_code=400, detail="JSON must contain a list of dataset examples.")

    col = get_training_datasets_collection()
    now = datetime.now(timezone.utc)
    imported = 0
    errors = []
    
    for idx, item in enumerate(items):
        try:
            q_text = item.get("question_text") or item.get("question")
            ans = item.get("candidate_answer") or item.get("answer")
            if not q_text or not ans:
                errors.append(f"Row #{idx + 1}: Missing question_text or candidate_answer.")
                continue

            doc = {
                "question_text": q_text,
                "domain": item.get("domain", "General"),
                "expected_concepts": item.get("expected_concepts", []),
                "expected_criteria": item.get("expected_criteria", []),
                "candidate_answer": ans,
                "expert_score": float(item.get("expert_score", item.get("score", 7.0))),
                "correctness_label": item.get("correctness_label", "correct"),
                "expert_explanation": item.get("expert_explanation", item.get("explanation", "Standard technical evaluation.")),
                "alternative_approaches": item.get("alternative_approaches", []),
                "validated": bool(item.get("validated", True)),
                "source": "uploaded_json",
                "created_at": now,
                "updated_at": now
            }
            col.insert_one(doc)
            imported += 1
        except Exception as ex:
            errors.append(f"Row #{idx + 1}: {str(ex)}")

    return {
        "total_parsed": len(items),
        "successfully_imported": imported,
        "duplicates_skipped": 0,
        "errors": errors[:10]
    }

@router.post("/upload/csv", response_model=DatasetUploadStats)
async def upload_csv_dataset(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_admin)
):
    """
    Parses and ingests a CSV dataset file with columns:
    domain, question_text, candidate_answer, expert_score, expert_explanation, expected_concepts
    """
    content = await file.read()
    try:
        csv_text = content.decode('utf-8')
        reader = csv.DictReader(io.StringIO(csv_text))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid CSV file format: {e}")

    col = get_training_datasets_collection()
    now = datetime.now(timezone.utc)
    rows = list(reader)
    imported = 0
    errors = []

    for idx, row in enumerate(rows):
        try:
            q_text = row.get("question_text") or row.get("question")
            ans = row.get("candidate_answer") or row.get("answer")
            if not q_text or not ans:
                errors.append(f"Row #{idx + 1}: Missing question_text or candidate_answer.")
                continue

            concepts_raw = row.get("expected_concepts", "")
            concepts = [c.strip() for c in concepts_raw.split(";") if c.strip()] if concepts_raw else []

            score_raw = row.get("expert_score") or row.get("score") or "7.0"
            score = float(score_raw)

            doc = {
                "question_text": q_text.strip(),
                "domain": row.get("domain", "General").strip(),
                "expected_concepts": concepts,
                "expected_criteria": concepts,
                "candidate_answer": ans.strip(),
                "expert_score": score,
                "correctness_label": row.get("correctness_label", "correct").strip(),
                "expert_explanation": row.get("expert_explanation", row.get("explanation", "Expert reviewed.")).strip(),
                "alternative_approaches": [a.strip() for a in row.get("alternative_approaches", "").split(";") if a.strip()],
                "validated": True,
                "source": "uploaded_csv",
                "created_at": now,
                "updated_at": now
            }
            col.insert_one(doc)
            imported += 1
        except Exception as ex:
            errors.append(f"Row #{idx + 1}: {str(ex)}")

    return {
        "total_parsed": len(rows),
        "successfully_imported": imported,
        "duplicates_skipped": 0,
        "errors": errors[:10]
    }

@router.get("/export/jsonl")
async def export_jsonl(
    split: str = Query("train", description="'train' or 'val'"),
    validation_split: float = Query(0.2, ge=0.05, le=0.5),
    current_user: dict = Depends(get_current_user)
):
    jsonl_str = export_jsonl_dataset(split=split, validation_split=validation_split)
    filename = f"biasguard_{split}_dataset.jsonl"
    return Response(
        content=jsonl_str,
        media_type="application/jsonl",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
