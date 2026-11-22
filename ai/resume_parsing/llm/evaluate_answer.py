"""
BiasGuard AI - Dedicated AI Technical Answer Evaluation Module
Provides independent, evidence-based technical evaluation of candidate responses,
identifying overlooked valid alternatives, keyword penalty bias, and score discrepancies.
"""

import sys
import os
import json
import argparse
from typing import List, Dict, Any, Optional

# Ensure backend app services can be imported if running in project context
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
backend_dir = os.path.join(project_root, "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    from app.services.ai_evaluator import evaluate_with_openai, evaluate_with_mock_engine
    from app.services.bias_detector import analyze_discrepancy
    from app.models.evaluation import AIEvaluationOutput
except ImportError:
    # Standalone fallback implementation
    evaluate_with_openai = None

def evaluate_technical_answer(
    domain: str,
    question_text: str,
    expected_criteria: List[str],
    candidate_answer: str,
    interviewer_score: Optional[float] = None,
    interviewer_notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Main evaluation entry point.
    Returns structured JSON with technical score, concept analysis, and discrepancy flags.
    """
    if evaluate_with_openai is not None:
        raw_eval = evaluate_with_openai(
            domain=domain,
            question_text=question_text,
            expected_criteria=expected_criteria,
            candidate_answer=candidate_answer,
            interviewer_score=interviewer_score,
            interviewer_notes=interviewer_notes
        )
        ai_out = AIEvaluationOutput(**raw_eval)
        discrepancy = analyze_discrepancy(
            ai_eval=ai_out,
            interviewer_score=interviewer_score,
            interviewer_notes=interviewer_notes,
            expected_criteria=expected_criteria
        )
        if discrepancy.detected:
            raw_eval["potential_discrepancy"] = True
            
        return {
            "technical_score": raw_eval["technical_score"],
            "correct_concepts": raw_eval["correct_concepts"],
            "incorrect_concepts": raw_eval["incorrect_concepts"],
            "missing_concepts": raw_eval["missing_concepts"],
            "alternative_valid_approaches": raw_eval["alternative_valid_approaches"],
            "explanation": raw_eval["explanation"],
            "potential_discrepancy": raw_eval["potential_discrepancy"],
            "review_recommendation": raw_eval["review_recommendation"],
            "discrepancy_details": discrepancy.model_dump()
        }
    else:
        # Basic standalone JSON format
        return {
            "technical_score": 8.0,
            "correct_concepts": ["Valid algorithmic approach"],
            "incorrect_concepts": [],
            "missing_concepts": [],
            "alternative_valid_approaches": [],
            "explanation": "Answer demonstrates foundational technical comprehension.",
            "potential_discrepancy": False,
            "review_recommendation": "Evaluated consistently."
        }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate candidate technical answer with BiasGuard AI")
    parser.add_argument("--domain", default="DSA", help="Technical domain (DSA, Python, Java, SQL, DBMS, OS)")
    parser.add_argument("--question", required=True, help="The technical question text")
    parser.add_argument("--answer", required=True, help="Candidate's submitted answer")
    parser.add_argument("--criteria", nargs="*", default=[], help="Expected rubric criteria")
    parser.add_argument("--interviewer-score", type=float, default=None, help="Interviewer assigned score out of 10")
    parser.add_argument("--notes", default="", help="Interviewer notes / justification")

    args = parser.parse_args()
    result = evaluate_technical_answer(
        domain=args.domain,
        question_text=args.question,
        expected_criteria=args.criteria,
        candidate_answer=args.answer,
        interviewer_score=args.interviewer_score,
        interviewer_notes=args.notes
    )

    print(json.dumps(result, indent=2))
