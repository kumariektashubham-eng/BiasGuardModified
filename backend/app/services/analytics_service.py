import logging
from typing import Dict, Any, List
from app.database import (
    get_interviews_collection,
    get_candidates_collection,
    get_evaluations_collection,
    get_reports_collection
)

logger = logging.getLogger("biasguard.analytics_service")

def get_dashboard_metrics() -> Dict[str, Any]:
    interviews_col = get_interviews_collection()
    candidates_col = get_candidates_collection()
    evaluations_col = get_evaluations_collection()
    
    total_interviews = interviews_col.count_documents({})
    total_candidates = candidates_col.count_documents({})
    total_evaluations = evaluations_col.count_documents({})
    
    # Calculate averages and discrepancies
    all_evals = list(evaluations_col.find({}))
    
    ai_scores = []
    interviewer_scores = []
    discrepancy_count = 0
    discrepancies_by_category = {}
    domain_stats = {}
    score_comparison_pairs = []
    
    for ev in all_evals:
        ai_score = ev.get("ai_evaluation", {}).get("technical_score")
        if ai_score is not None:
            ai_scores.append(float(ai_score))
            
        int_score = ev.get("interviewer_score")
        if int_score is not None:
            interviewer_scores.append(float(int_score))
            
        discrepancy = ev.get("discrepancy", {})
        if discrepancy.get("detected"):
            discrepancy_count += 1
            cat = discrepancy.get("bias_category") or "Other Discrepancy"
            discrepancies_by_category[cat] = discrepancies_by_category.get(cat, 0) + 1
            
        # Domain tracking
        domain = ev.get("domain", "General")
        if domain not in domain_stats:
            domain_stats[domain] = {
                "domain": domain,
                "count": 0,
                "ai_score_sum": 0.0,
                "interviewer_score_sum": 0.0,
                "discrepancies": 0
            }
        domain_stats[domain]["count"] += 1
        if ai_score is not None:
            domain_stats[domain]["ai_score_sum"] += float(ai_score)
        if int_score is not None:
            domain_stats[domain]["interviewer_score_sum"] += float(int_score)
        if discrepancy.get("detected"):
            domain_stats[domain]["discrepancies"] += 1
            
        # Pair for scatter / comparison chart
        if ai_score is not None and int_score is not None:
            score_comparison_pairs.append({
                "id": str(ev.get("_id")),
                "candidate": ev.get("candidate_name") or "Candidate",
                "domain": domain,
                "interviewer_score": round(float(int_score), 1),
                "ai_score": round(float(ai_score), 1),
                "delta": round(float(int_score) - float(ai_score), 1),
                "has_discrepancy": bool(discrepancy.get("detected"))
            })

    avg_ai_score = round(sum(ai_scores) / len(ai_scores), 2) if ai_scores else 0.0
    avg_interviewer_score = round(sum(interviewer_scores) / len(interviewer_scores), 2) if interviewer_scores else 0.0
    discrepancy_rate = round((discrepancy_count / total_evaluations * 100), 1) if total_evaluations else 0.0
    
    # Format domain list
    formatted_domains = []
    for d_name, d_val in domain_stats.items():
        cnt = d_val["count"]
        formatted_domains.append({
            "domain": d_name,
            "evaluations": cnt,
            "avg_ai_score": round(d_val["ai_score_sum"] / cnt, 1) if cnt else 0.0,
            "avg_interviewer_score": round(d_val["interviewer_score_sum"] / cnt, 1) if cnt else 0.0,
            "discrepancies": d_val["discrepancies"]
        })

    # Convert category dict to list
    category_breakdown = [
        {"name": k, "value": v} for k, v in discrepancies_by_category.items()
    ]
    if not category_breakdown:
        category_breakdown = [
            {"name": "Calibrated & Consistent", "value": max(1, total_evaluations)}
        ]

    # Score distribution brackets (0-3, 4-6, 7-8, 9-10)
    score_distribution = [
        {"range": "0 - 3.9", "ai": sum(1 for s in ai_scores if s < 4.0), "interviewer": sum(1 for s in interviewer_scores if s < 4.0)},
        {"range": "4.0 - 6.4", "ai": sum(1 for s in ai_scores if 4.0 <= s < 6.5), "interviewer": sum(1 for s in interviewer_scores if 4.0 <= s < 6.5)},
        {"range": "6.5 - 8.4", "ai": sum(1 for s in ai_scores if 6.5 <= s < 8.5), "interviewer": sum(1 for s in interviewer_scores if 6.5 <= s < 8.5)},
        {"range": "8.5 - 10.0", "ai": sum(1 for s in ai_scores if s >= 8.5), "interviewer": sum(1 for s in interviewer_scores if s >= 8.5)},
    ]

    return {
        "total_interviews": total_interviews,
        "total_candidates": total_candidates,
        "total_evaluations": total_evaluations,
        "average_ai_score": avg_ai_score,
        "average_interviewer_score": avg_interviewer_score,
        "discrepancy_count": discrepancy_count,
        "discrepancy_rate": discrepancy_rate,
        "domain_analytics": formatted_domains,
        "discrepancy_categories": category_breakdown,
        "score_distribution": score_distribution,
        "score_comparison_pairs": score_comparison_pairs[-30:]  # last 30 for visualization
    }
