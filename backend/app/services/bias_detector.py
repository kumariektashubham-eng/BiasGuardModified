import logging
from typing import Optional, Dict, Any, List
from app.config import settings
from app.models.evaluation import DiscrepancyDetail, AIEvaluationOutput

logger = logging.getLogger("biasguard.bias_detector")

def analyze_discrepancy(
    ai_eval: AIEvaluationOutput,
    interviewer_score: Optional[float],
    interviewer_notes: Optional[str] = "",
    expected_criteria: Optional[List[str]] = None
) -> DiscrepancyDetail:
    """
    Compares the interviewer's assessment against the independent AI evaluation.
    Identifies evidence-based discrepancies without asserting definitive malice,
    formulating constructive review flags for engineering leadership.
    """
    if interviewer_score is None:
        return DiscrepancyDetail(
            detected=False,
            type="NO_INTERVIEWER_SCORE",
            severity="LOW",
            score_delta=0.0,
            evidence="No interviewer score was provided for comparison.",
            bias_category="Pending Comparison"
        )
    
    if ai_eval.technical_score is None:
        status_lbl = getattr(ai_eval, "status_label", "Not Evaluated") or "Not Evaluated"
        status_msg = getattr(ai_eval, "status_message", "No technical score computed.") or "No technical score computed."
        return DiscrepancyDetail(
            detected=False,
            type="NOT_EVALUATED",
            severity="LOW",
            score_delta=0.0,
            evidence=f"Technical answer was not evaluated ({status_lbl}): {status_msg}",
            bias_category=status_lbl
        )
    
    ai_score = ai_eval.technical_score
    delta = round(interviewer_score - ai_score, 1)
    abs_delta = abs(delta)
    notes_clean = (interviewer_notes or "").strip().lower()
    
    # 1. Check for Overlooked Alternative Approach
    has_valid_alternative = len(ai_eval.alternative_valid_approaches) > 0
    mentions_wrong_approach = any(
        kw in notes_clean for kw in [
            "wrong approach", "not what i wanted", "did not use", "only wanted",
            "different way", "not the standard way", "incorrect method"
        ]
    )
    if has_valid_alternative and delta <= -2.0:
        return DiscrepancyDetail(
            detected=True,
            type="UNDER_EVALUATED_ALTERNATIVE",
            severity="HIGH" if abs_delta >= 3.0 else "MEDIUM",
            score_delta=delta,
            evidence=(
                f"Candidate proposed a valid alternative engineering solution ({ai_eval.alternative_valid_approaches[0]}), "
                f"yielding an AI technical correctness score of {ai_score}/10. However, the interviewer assigned {interviewer_score}/10. "
                "The evaluation may have penalized non-canonical yet viable problem-solving."
            ),
            bias_category="Alternative Approach Overlooked"
        )
        
    # 2. Check for Keyword Penalty / Fluency Bias
    # Candidate scored high technically (>= 7.0), but interviewer gave harsh score (<= 4.5)
    if ai_score >= 7.0 and interviewer_score <= 4.5:
        return DiscrepancyDetail(
            detected=True,
            type="KEYWORD_PENALTY_BIAS",
            severity="HIGH",
            score_delta=delta,
            evidence=(
                f"The candidate's response demonstrated verified technical understanding ({len(ai_eval.correct_concepts)} valid technical concepts identified), "
                f"earning an objective technical score of {ai_score}/10. The interviewer scored this {interviewer_score}/10 (delta: {delta} pts). "
                "This indicates potential penalization for phrasing, communication style, or omission of specific jargon rather than technical substance."
            ),
            bias_category="Strict Keyword / Terminology Bias"
        )
        
    # 3. Unjustified Severe Markdown (delta <= -threshold)
    if delta <= -settings.BIAS_SCORE_DELTA_THRESHOLD:
        severity = "HIGH" if abs_delta >= 3.5 else "MEDIUM"
        return DiscrepancyDetail(
            detected=True,
            type="UNJUSTIFIED_SEVERITY",
            severity=severity,
            score_delta=delta,
            evidence=(
                f"Interviewer assigned {interviewer_score}/10, which is significantly lower than the objective technical score of {ai_score}/10 "
                f"(difference: {abs_delta} points). Recommended for calibration review to ensure evaluation parity."
            ),
            bias_category="Uncalibrated Severity"
        )

    # 4. Grade Inflation / Halo Effect (interviewer score much higher than AI technical verification)
    if delta >= settings.BIAS_SCORE_DELTA_THRESHOLD and ai_score <= 5.5:
        return DiscrepancyDetail(
            detected=True,
            type="GRADE_INFLATION",
            severity="MEDIUM",
            score_delta=delta,
            evidence=(
                f"Interviewer assigned a generous score of {interviewer_score}/10 despite notable gaps in the candidate's technical response "
                f"(AI Technical Score: {ai_score}/10, with {len(ai_eval.missing_concepts)} missing core concepts). "
                "Potential positive halo effect or relaxed evaluation criteria."
            ),
            bias_category="Lenient Calibration / Halo Effect"
        )

    # 5. Lack of Technical Justification on Low Score
    if interviewer_score <= 4.0 and len(notes_clean) < 15 and ai_score >= 6.0:
        return DiscrepancyDetail(
            detected=True,
            type="LACK_OF_TECHNICAL_JUSTIFICATION",
            severity="MEDIUM",
            score_delta=delta,
            evidence=(
                f"Interviewer assigned a failing or marginal score ({interviewer_score}/10) without substantive written feedback, "
                f"while technical evaluation indicates partial-to-strong competence ({ai_score}/10)."
            ),
            bias_category="Insufficient Justification"
        )

    # Normal / Consistent Evaluation
    return DiscrepancyDetail(
        detected=False,
        type="CALIBRATED_CONSISTENT",
        severity="LOW",
        score_delta=delta,
        evidence=(
            f"Interviewer score ({interviewer_score}/10) is consistent with the independent technical evaluation ({ai_score}/10) "
            f"within standard variance tolerance (delta: {delta:+0.1f})."
        ),
        bias_category="Calibrated & Consistent"
    )
