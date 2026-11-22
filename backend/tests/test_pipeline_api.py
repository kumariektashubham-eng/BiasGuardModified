import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.auth_service import create_access_token
from app.database import init_db

client = TestClient(app)

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    init_db()

@pytest.fixture
def auth_headers():
    token = create_access_token({"sub": "admin@biasguard.ai", "role": "admin"})
    return {"Authorization": f"Bearer {token}"}

def test_health_endpoint():
    # Test prefixed health endpoint
    res_api = client.get("/api/health")
    assert res_api.status_code == 200
    data_api = res_api.json()
    assert data_api["status"] in ("healthy", "degraded")
    assert data_api["backend"] == "online"
    assert "uptime_seconds" in data_api
    assert data_api["rag_enabled"] is True
    assert "database" in data_api
    assert "openai_key_configured" in data_api

    # Test root health endpoint
    res_root = client.get("/health")
    assert res_root.status_code == 200
    data_root = res_root.json()
    assert data_root["status"] in ("healthy", "degraded")
    assert data_root["backend"] == "online"
    assert "uptime_seconds" in data_root

def test_safe_api_status_check():
    res = client.get("/api/settings/status")
    assert res.status_code == 200
    data = res.json()
    assert "openai_key_configured" in data
    assert "speech_to_text_ready" in data
    assert "mock_ai_mode" in data
    # Ensure sensitive credentials are NEVER revealed
    assert "api_key" not in data
    assert "secret" not in data


def test_datasets_crud_and_validation(auth_headers):
    # 1. Create a dataset item
    new_item = {
        "domain": "DSA",
        "question_text": "Explain Breadth-First Search (BFS) and when it guarantees the shortest path.",
        "candidate_answer": "BFS traverses level by level using a queue FIFO data structure. It guarantees shortest path in unweighted graphs.",
        "expert_score": 9.5,
        "correctness_label": "correct",
        "expert_explanation": "Exact technical formulation with unweighted graph condition and queue mechanism.",
        "expected_concepts": ["Queue FIFO", "Level-order traversal", "Unweighted graph shortest path"],
        "alternative_approaches": [],
        "validated": True
    }
    create_res = client.post("/api/datasets", json=new_item, headers=auth_headers)
    assert create_res.status_code == 201
    created_data = create_res.json()
    item_id = created_data["id"]
    assert created_data["domain"] == "DSA"

    # 2. List datasets
    list_res = client.get("/api/datasets?domain=DSA", headers=auth_headers)
    assert list_res.status_code == 200
    items = list_res.json()
    assert any(i["id"] == item_id for i in items)

    # 3. Validate endpoint
    val_res = client.post(f"/api/datasets/validate/{item_id}", headers=auth_headers)
    assert val_res.status_code == 200
    assert val_res.json()["validated"] is True

    # 4. Clean up
    del_res = client.delete(f"/api/datasets/{item_id}", headers=auth_headers)
    assert del_res.status_code == 204

def test_performance_dashboard(auth_headers):
    res = client.get("/api/performance/dashboard", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "mean_absolute_error" in data
    assert "classification_accuracy" in data
    assert "confusion_matrix" in data
    assert "domain_breakdown" in data

def test_fairness_suite_api(auth_headers):
    res = client.post("/api/fairness/run", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_test_cases"] >= 3
    assert "average_variance" in data
    assert "test_results" in data
    assert len(data["test_results"]) >= 3

def test_training_prepare_api(auth_headers):
    payload = {
        "validation_split": 0.2,
        "require_validated_only": False
    }
    res = client.post("/api/training/prepare", json=payload, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_eligible_examples"] > 0
    assert data["train_count"] > 0
    assert len(data["jsonl_preview"]) > 0

def test_dataset_upload_json(auth_headers):
    json_content = b"""[
        {
            "domain": "SQL",
            "question_text": "How do you optimize a slow running query with multiple JOINs?",
            "candidate_answer": "Check execution plan using EXPLAIN, verify indexes on join columns, eliminate SELECT *, and replace correlated subqueries with JOINs or window functions.",
            "expert_score": 9.0,
            "correctness_label": "correct",
            "expert_explanation": "Solid practical query optimization steps covering execution plan, indexing, and projection.",
            "expected_concepts": ["EXPLAIN plan", "Index on JOIN columns", "Projection pruning"],
            "alternative_approaches": [],
            "validated": true
        }
    ]"""
    files = {"file": ("test_data.json", json_content, "application/json")}
    res = client.post("/api/datasets/upload/json", files=files, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_parsed"] == 1
    assert data["successfully_imported"] == 1
    assert len(data["errors"]) == 0

def test_dataset_upload_csv(auth_headers):
    csv_content = b"""domain,question_text,candidate_answer,expert_score,correctness_label,expert_explanation,expected_concepts,alternative_approaches
Operating Systems,What is thrashing in OS?,"Thrashing occurs when high paging activity causes CPU to spend more time swapping pages than executing instructions.",9.2,correct,"Accurate definition identifying paging overhead exceeding execution throughput.","Paging overhead; Swapping vs execution; Working set model","Page fault frequency management"
"""
    files = {"file": ("test_data.csv", csv_content, "text/csv")}
    res = client.post("/api/datasets/upload/csv", files=files, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_parsed"] == 1
    assert data["successfully_imported"] == 1
    assert len(data["errors"]) == 0
