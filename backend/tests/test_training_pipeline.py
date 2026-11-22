import pytest
import math
from app.services.rag_service import generate_embedding, cosine_similarity, retrieve_relevant_references
from app.services.training_service import format_example_to_chat_messages, prepare_fine_tuning_dataset
from app.services.performance_service import calculate_performance_metrics
from app.services.fairness_service import BENCHMARK_FAIRNESS_TEST_CASES, run_fairness_benchmark_suite
from app.database import init_db

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    init_db()

def test_rag_embedding_and_similarity():
    # Test vector generation
    text1 = "Two pointer algorithmic approach with O(1) space complexity on sorted array"
    text2 = "Two pointer traversal with constant memory O(1) space"
    text3 = "Database normalization 1NF 2NF and 3NF functional dependencies"

    emb1 = generate_embedding(text1)
    emb2 = generate_embedding(text2)
    emb3 = generate_embedding(text3)

    assert len(emb1) > 0
    assert len(emb2) > 0
    assert len(emb3) > 0

    sim_close = cosine_similarity(emb1, emb2)
    sim_far = cosine_similarity(emb1, emb3)

    # Semantically closer texts should have higher similarity
    assert sim_close > sim_far
    assert 0.0 <= sim_close <= 1.0

def test_training_message_formatting():
    sample = {
        "domain": "DSA",
        "question_text": "Find two numbers in array that sum to target.",
        "expected_criteria": ["Hash map O(n)", "Two pointer O(1) space"],
        "candidate_answer": "Use two pointers on sorted array for O(1) space.",
        "expert_score": 8.5,
        "expected_concepts": ["Two pointer pass", "O(1) space"],
        "expert_explanation": "Valid alternative approach.",
        "alternative_approaches": ["Two pointer traversal"]
    }

    formatted = format_example_to_chat_messages(sample)
    assert "messages" in formatted
    assert len(formatted["messages"]) == 3
    assert formatted["messages"][0]["role"] == "system"
    assert formatted["messages"][1]["role"] == "user"
    assert formatted["messages"][2]["role"] == "assistant"
    assert "8.5" in formatted["messages"][2]["content"]

def test_performance_metrics_calculation():
    metrics = calculate_performance_metrics()
    assert "mean_absolute_error" in metrics
    assert "root_mean_squared_error" in metrics
    assert "classification_accuracy" in metrics
    assert "precision" in metrics
    assert "recall" in metrics
    assert "f1_score" in metrics
    assert "domain_breakdown" in metrics
    
    assert metrics["mean_absolute_error"] >= 0.0
    assert metrics["root_mean_squared_error"] >= 0.0
    assert 0.0 <= metrics["classification_accuracy"] <= 100.0
    assert len(metrics["domain_breakdown"]) > 0

def test_fairness_benchmark_structure():
    assert len(BENCHMARK_FAIRNESS_TEST_CASES) >= 3
    case1 = BENCHMARK_FAIRNESS_TEST_CASES[0]
    assert "domain" in case1
    assert "baseline_answer" in case1
    assert len(case1["variations"]) >= 3
    # Verify stylistic tags exist
    styles = [v["style_label"] for v in case1["variations"]]
    assert any("Formal" in s or "Academic" in s for s in styles)
    assert any("Casual" in s or "Pragmatic" in s for s in styles)
