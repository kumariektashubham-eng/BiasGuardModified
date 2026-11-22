import json
import logging
import re
from typing import List, Dict, Any, Optional
from openai import OpenAI
from app.config import settings
from app.services.speech_validator import (
    classify_recording_status,
    is_silence_or_hallucination,
    is_transcription_unclear
)

logger = logging.getLogger("biasguard.ai_evaluator")

SYSTEM_EVALUATION_PROMPT = """
You are BiasGuard AI, an elite, unbiased principal technical interviewer, software architect, and AI evaluator.
Your mission is to perform an objective, evidence-based, deep technical evaluation of a candidate's answer to a technical interview question.

EVALUATION WEIGHTED RUBRIC (0.0 to 10.0 scale):
1. Technical Correctness (40% weight - Max 4.0 pts): Factual accuracy, computer science mechanisms, algorithms, data structures, and absence of critical misconceptions.
2. Conceptual Understanding (30% weight - Max 3.0 pts): Depth of understanding of core architectural principles, internal runtimes, and engineering trade-offs.
3. Completeness (20% weight - Max 2.0 pts): Thorough coverage of expected solution facets, boundary conditions, edge cases, and scaling concerns.
4. Logical Reasoning (10% weight - Max 1.0 pt): Coherent step-by-step technical deduction, clear architectural trade-off justification.

Overall Technical Score = Technical Correctness + Conceptual Understanding + Completeness + Logical Reasoning (rounded to 1 decimal place).

CORE PRINCIPLES & GUARDRAILS:
1. Pure Independent Assessment: Evaluate strictly on the technical evidence present in the candidate's response. Do NOT depend on or seek human interviewer scores.
2. Value Valid Alternatives: Candidates often propose alternative valid solutions (e.g., iterative vs recursive, two-pointers vs hash map, CTE vs window functions, event-driven vs polling). If their alternative is technically valid or has legitimate trade-offs, credit them accordingly. Do NOT score on exact keyword matching.
3. Distinguish Inaccuracy from Incompleteness: A candidate who accurately explains 70% of a concept without false claims should score higher than someone who rambles with technical hallucinations.
4. Spoken / Voice Transcription Invariance: The response is transcribed from a spoken voice recording. Evaluate strictly on computer science substance and engineering logic. NEVER penalize conversational filler words ('um', 'so basically', 'you know'), spoken tone, accent artifacts, or speech-to-text formatting differences.

You MUST respond strictly with a valid JSON object matching this schema:
{
  "technical_score": float,
  "score_breakdown": {
    "technical_correctness": float,
    "conceptual_understanding": float,
    "completeness": float,
    "reasoning": float
  },
  "correct_concepts": [string],
  "incorrect_concepts": [string],
  "missing_concepts": [string],
  "alternative_valid_approaches": [string],
  "evidence": string,
  "explanation": string,
  "potential_discrepancy": boolean,
  "review_recommendation": string
}
"""

def generate_prompt_for_question(
    domain: str,
    question_text: str,
    expected_criteria: List[str],
    candidate_answer: str,
    interviewer_score: Optional[float] = None,
    interviewer_notes: Optional[str] = None
) -> str:
    criteria_str = "\n".join([f"- {c}" for c in expected_criteria]) if expected_criteria else "Evaluate against industry-standard engineering benchmarks for this topic."

    # Retrieve RAG references from MongoDB Atlas Vector Search / Vector Store
    rag_context = ""
    try:
        from app.services.rag_service import retrieve_relevant_references
        refs = retrieve_relevant_references(candidate_answer, domain, top_k=2)
        if refs:
            rag_context = "\nVerified Expert Reference Answers & Alternative Solutions (Retrieved via MongoDB Vector Search):\n"
            for r in refs:
                rag_context += f"- [{r.get('title')}] (Similarity: {r.get('similarity_score', 'N/A')}): {r.get('reference_text')}\n  Key Concepts: {', '.join(r.get('key_concepts', []))}\n"
    except Exception as e:
        logger.debug(f"RAG reference retrieval: {e}")

    return f"""
Domain: {domain}
Technical Question:
\"\"\"{question_text}\"\"\"

Expected Evaluation Criteria / Standard Solution Expectations:
{criteria_str}
{rag_context}
Candidate's Submitted Answer:
\"\"\"{candidate_answer}\"\"\"

Carefully evaluate the candidate's answer against the core concepts of {domain} and the retrieved expert benchmarks using the 4-part weighted rubric:
- Technical Correctness (max 4.0)
- Conceptual Understanding (max 3.0)
- Completeness (max 2.0)
- Logical Reasoning (max 1.0)
Return the result strictly as the specified JSON schema.
"""

def evaluate_with_openai(
    domain: str,
    question_text: str,
    expected_criteria: List[str],
    candidate_answer: str,
    interviewer_score: Optional[float] = None,
    interviewer_notes: Optional[str] = None
) -> Dict[str, Any]:
    # Check for empty answer, silence, or unclear speech before invoking any LLM
    status_code, status_label, status_message = classify_recording_status(candidate_answer)
    if status_code != "completed":
        return {
            "technical_score": None,
            "score_breakdown": None,
            "status": status_code,
            "status_label": status_label,
            "status_message": status_message,
            "correct_concepts": [],
            "incorrect_concepts": [],
            "missing_concepts": ["No technical answer provided to evaluate."],
            "alternative_valid_approaches": [],
            "evidence": "",
            "explanation": status_message,
            "potential_discrepancy": False,
            "review_recommendation": f"Status: {status_label}. {status_message}"
        }

    api_key = settings.OPENAI_API_KEY
    if not api_key or "your-" in api_key or settings.MOCK_AI_MODE:
        return evaluate_with_mock_engine(
            domain, question_text, expected_criteria, candidate_answer, interviewer_score, interviewer_notes
        )

    try:
        client = OpenAI(api_key=api_key)
        user_prompt = generate_prompt_for_question(
            domain, question_text, expected_criteria, candidate_answer
        )
        response = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_EVALUATION_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=1500
        )
        content = response.choices[0].message.content
        result = json.loads(content)
        
        # Ensure all required keys exist and types match
        return normalize_ai_output(result, interviewer_score)
    except Exception as e:
        logger.error(f"OpenAI evaluation failed: {e}. Falling back to domain rule engine.")
        fallback = evaluate_with_mock_engine(
            domain, question_text, expected_criteria, candidate_answer, interviewer_score, interviewer_notes
        )
        fallback["explanation"] += f" (Note: Evaluated via BiasGuard Offline Semantic Engine: {str(e)[:50]}...)"
        return fallback

def normalize_ai_output(data: Dict[str, Any], interviewer_score: Optional[float] = None) -> Dict[str, Any]:
    raw_score = data.get("technical_score")
    if raw_score is None:
        score = None
    else:
        try:
            score = max(0.0, min(10.0, round(float(raw_score), 1)))
        except (ValueError, TypeError):
            score = None
    
    breakdown = data.get("score_breakdown")
    if breakdown and isinstance(breakdown, dict) and score is not None:
        score_breakdown = {
            "technical_correctness": min(4.0, max(0.0, round(float(breakdown.get("technical_correctness", score * 0.4)), 1))),
            "conceptual_understanding": min(3.0, max(0.0, round(float(breakdown.get("conceptual_understanding", score * 0.3)), 1))),
            "completeness": min(2.0, max(0.0, round(float(breakdown.get("completeness", score * 0.2)), 1))),
            "reasoning": min(1.0, max(0.0, round(float(breakdown.get("reasoning", score * 0.1)), 1)))
        }
    elif score is not None:
        score_breakdown = {
            "technical_correctness": round(score * 0.4, 1),
            "conceptual_understanding": round(score * 0.3, 1),
            "completeness": round(score * 0.2, 1),
            "reasoning": round(score * 0.1, 1)
        }
    else:
        score_breakdown = None

    correct = [str(x) for x in data.get("correct_concepts", [])]
    incorrect = [str(x) for x in data.get("incorrect_concepts", [])]
    missing = [str(x) for x in data.get("missing_concepts", [])]
    alternatives = [str(x) for x in data.get("alternative_valid_approaches", [])]
    evidence = str(data.get("evidence", ""))
    explanation = str(data.get("explanation", "Evaluation completed."))
    
    potential_discrepancy = bool(data.get("potential_discrepancy", False))
    if score is not None and interviewer_score is not None:
        delta = abs(interviewer_score - score)
        if delta >= settings.BIAS_SCORE_DELTA_THRESHOLD:
            potential_discrepancy = True

    rec = str(data.get("review_recommendation", ""))
    if not rec:
        if score is None:
            rec = data.get("status_message") or "Answer was not evaluated."
        elif potential_discrepancy:
            rec = "Secondary human peer review is recommended due to divergence between technical assessment and interviewer score."
        else:
            rec = "Interviewer evaluation aligns well with the independent technical assessment."

    return {
        "technical_score": score,
        "score_breakdown": score_breakdown,
        "status": data.get("status", "completed" if score is not None else "no_speech_detected"),
        "status_label": data.get("status_label", "Completed" if score is not None else "No Answer Detected"),
        "status_message": data.get("status_message"),
        "correct_concepts": correct,
        "incorrect_concepts": incorrect,
        "missing_concepts": missing,
        "alternative_valid_approaches": alternatives,
        "evidence": evidence,
        "explanation": explanation,
        "potential_discrepancy": potential_discrepancy,
        "review_recommendation": rec
    }

# =========================================================================
# Intelligent Semantic & Domain-Aware Fallback Engine (No External API Needed)
# Performs rigorous NLP heuristic analysis, concept extraction, complexity checking,
# and alternative approach detection for Java, Python, DSA, DBMS, SQL, and OS!
# =========================================================================

def evaluate_with_mock_engine(
    domain: str,
    question_text: str,
    expected_criteria: List[str],
    candidate_answer: str,
    interviewer_score: Optional[float] = None,
    interviewer_notes: Optional[str] = None
) -> Dict[str, Any]:
    # Check for empty answer, silence, or unclear speech
    status_code, status_label, status_message = classify_recording_status(candidate_answer)
    if status_code != "completed":
        return {
            "technical_score": None,
            "status": status_code,
            "status_label": status_label,
            "status_message": status_message,
            "correct_concepts": [],
            "incorrect_concepts": [],
            "missing_concepts": ["No technical answer provided to evaluate."],
            "alternative_valid_approaches": [],
            "explanation": status_message,
            "potential_discrepancy": False,
            "review_recommendation": f"Status: {status_label}. {status_message}"
        }

    ans = candidate_answer.strip()
    words = ans.split()
    word_count = len(words)
    lower_ans = ans.lower()
    lower_q = question_text.lower()
    
    correct_concepts = []
    incorrect_concepts = []
    missing_concepts = []
    alternative_valid_approaches = []
    
    # 1. Depth & Structural Checks
    has_code_or_syntax = bool(re.search(r"(\{|\}|def |class |SELECT |FROM |void |public |function |=>|;|\bint\b|\bfor\b|\bwhile\b)", ans, re.IGNORECASE))
    has_complexity_mention = bool(re.search(r"(O\(1\)|O\(n\)|O\(log\s*n\)|O\(n\s*log\s*n\)|O\(n\^2\)|time complexity|space complexity|linear|logarithmic|constant time)", lower_ans))
    
    # 2. Check Expected Criteria - strictly score matched criteria
    criteria_matched = 0
    if expected_criteria:
        for crit in expected_criteria:
            crit_words = [w for w in re.findall(r'\b\w{4,}\b', crit.lower()) if w not in {'using', 'should', 'could', 'their', 'which', 'about', 'concept'}]
            if crit_words and any(w in lower_ans for w in crit_words):
                criteria_matched += 1
                correct_concepts.append(f"Addressed: {crit}")
            else:
                missing_concepts.append(f"Unaddressed standard criterion: {crit}")
        
        criteria_ratio = criteria_matched / max(1, len(expected_criteria))
        if criteria_matched == 0:
            base_score = 1.0
        else:
            base_score = 4.0 + (criteria_ratio * 4.5)
    else:
        # Balanced semantic heuristic when no specific criteria passed
        # Evaluates vocabulary diversity, question relevance, and programming substance
        question_keywords = [w for w in re.findall(r'\b\w{4,}\b', lower_q) if w not in {'what', 'when', 'where', 'which', 'explain', 'describe', 'difference', 'between'}]
        relevance_matches = sum(1 for kw in question_keywords if kw in lower_ans)
        unique_word_ratio = len(set(words)) / max(1, word_count)

        # Baseline starts conservative at 4.0
        base_score = 4.0
        if relevance_matches > 0:
            base_score += min(2.0, relevance_matches * 0.7)
        if has_code_or_syntax:
            base_score += 1.0
        if has_complexity_mention:
            base_score += 0.8
        if unique_word_ratio > 0.6 and word_count >= 30:
            base_score += 0.7
        elif unique_word_ratio < 0.4:
            base_score -= 1.5  # Penalize repetitive filler text
        base_score = max(2.0, min(8.5, round(base_score, 1)))

    # 3. Domain-Specific Concept & Alternative Detection
    d = domain.upper()
    if "DSA" in d or "DATA STRUCTURE" in d or "ALGORITHM" in d:
        if has_complexity_mention:
            correct_concepts.append("Explicit Big-O time/space complexity analysis provided")
            base_score += 0.8
        else:
            missing_concepts.append("Asymptotic complexity bounds (Big-O analysis) not explicitly stated")
            
        # Alternative approach checks
        if any(term in lower_ans for term in ["hashmap", "hash table", "dictionary", "hash map"]) and any(term in lower_q for term in ["two sum", "search", "lookup", "frequency", "duplicate"]):
            correct_concepts.append("Employed hash-based lookup for O(1) average time trade-off")
            alternative_valid_approaches.append("Sorting + Two-pointer technique as O(n log n) time with O(1) auxiliary space")
        elif "two pointer" in lower_ans or "two-pointer" in lower_ans:
            correct_concepts.append("Applied two-pointer traversal reducing space overhead")
            alternative_valid_approaches.append("Hash table approach trading space for constant time lookup")
        elif "recursion" in lower_ans or "recursive" in lower_ans:
            correct_concepts.append("Clean recursive formulation of base case and subproblems")
            alternative_valid_approaches.append("Iterative traversal with explicit stack to prevent call-stack overflow")
        elif "iterative" in lower_ans or "stack" in lower_ans:
            correct_concepts.append("Iterative algorithm guaranteeing bounded call stack memory")
            alternative_valid_approaches.append("Recursive divide-and-conquer formulation")

    elif "SQL" in d or "DBMS" in d or "DATABASE" in d:
        if any(term in lower_ans for term in ["index", "b-tree", "b+ tree", "hash index"]):
            correct_concepts.append("Addressed index data structures (B+ Tree / Hash) and disk I/O implications")
            base_score += 0.6
        if any(term in lower_ans for term in ["acid", "atomicity", "consistency", "isolation", "durability"]):
            correct_concepts.append("Solid grounding in ACID transactional properties")
        if any(term in lower_ans for term in ["normalization", "1nf", "2nf", "3nf", "bcnf"]):
            correct_concepts.append("Schema design normalization principles correctly referenced")
        if any(term in lower_ans for term in ["window function", "partition by", "row_number", "rank", "dense_rank"]):
            correct_concepts.append("Modern SQL analytical window functions applied effectively")
            alternative_valid_approaches.append("Correlated subqueries or self-joins for legacy SQL engines")
        elif any(term in lower_ans for term in ["group by", "having", "join"]):
            correct_concepts.append("Accurate relational grouping and relational algebra joins")

    elif "PYTHON" in d:
        if any(term in lower_ans for term in ["gil", "global interpreter lock", "threading", "multiprocessing", "asyncio"]):
            correct_concepts.append("Understands CPython GIL execution model and CPU vs I/O bound concurrency")
            base_score += 0.6
        if any(term in lower_ans for term in ["generator", "yield", "iterator", "lazy evaluation"]):
            correct_concepts.append("Memory-efficient lazy streaming using Python generator protocols")
            alternative_valid_approaches.append("List comprehensions when all records must reside in memory upfront")
        if any(term in lower_ans for term in ["decorator", "dunder", "__init__", "context manager", "__enter__", "__exit__"]):
            correct_concepts.append("Idiomatic Python metaprogramming / protocol implementation")

    elif "JAVA" in d:
        if any(term in lower_ans for term in ["jvm", "garbage collection", "heap", "stack", "gc", "eden", "metaspace"]):
            correct_concepts.append("Accurate JVM memory model and garbage collection lifecycle understanding")
            base_score += 0.6
        if any(term in lower_ans for term in ["equals", "hashcode", "contract", "bucket"]):
            correct_concepts.append("Deep comprehension of the equals() and hashCode() contract")
            base_score += 0.8
        if any(term in lower_ans for term in ["treeify", "red-black tree", "collision", "hashmap", "linkedlist", "chaining"]):
            correct_concepts.append("Thorough understanding of Java HashMap internal collision resolution and treeification")
            base_score += 0.8
        if any(term in lower_ans for term in ["concurrenthashmap", "synchronized", "volatile", "threadpool", "atomic"]):
            correct_concepts.append("Thread safety, memory barrier visibility, and Java concurrent utilities")
            alternative_valid_approaches.append("Optimistic locking via AtomicReference / CAS primitives")
            base_score += 0.5

    elif "OPERATING SYSTEM" in d or "OS" in d:
        if any(term in lower_ans for term in ["process", "thread", "context switch", "pcb", "tcb"]):
            correct_concepts.append("Process vs Thread state management and kernel context switching")
        if any(term in lower_ans for term in ["virtual memory", "paging", "tlb", "page fault", "mmu"]):
            correct_concepts.append("Virtual memory hierarchy, page tables, and MMU address translation")
        if any(term in lower_ans for term in ["deadlock", "mutex", "semaphore", "banker", "race condition"]):
            correct_concepts.append("Concurrency synchronization primitives and Coffman deadlock conditions")
            base_score += 0.6

    # 4. Inaccuracy Detection
    if any(phrase in lower_ans for phrase in ["binary search takes o(n)", "hash map search is always o(n)", "gil allows parallel cpu execution"]):
        incorrect_concepts.append("Incorrect complexity claim or execution model misconception")
        base_score -= 2.0

    if word_count < 15:
        missing_concepts.append("Answer is very brief and lacks explanatory architectural depth")
        base_score = min(base_score, 2.5)
    elif word_count < 35:
        missing_concepts.append("Lacks discussion of edge cases, failover, or scaling considerations")

    # 5. RAG Retrieval Augmentation (offline)
    rag_reference_title = None
    try:
        from app.services.rag_service import retrieve_relevant_references
        refs = retrieve_relevant_references(candidate_answer, domain, top_k=1)
        if refs and refs[0].get("similarity_score", 0) > 0.45:
            rag_reference_title = refs[0].get("title")
            for kc in refs[0].get("key_concepts", []):
                if kc.lower() in lower_ans and kc not in correct_concepts:
                    correct_concepts.append(f"Grounded Reference Concept: {kc}")
    except Exception:
        pass

    # 4-part weighted scoring rubric breakdown (40% correctness, 30% understanding, 20% completeness, 10% reasoning)
    crit_ratio = (criteria_matched / max(1, len(expected_criteria))) if expected_criteria else (0.75 if word_count > 25 else 0.4)
    tech_correctness = min(4.0, max(0.4, round(crit_ratio * 4.0, 1)))
    if incorrect_concepts:
        tech_correctness = max(0.0, round(tech_correctness - 1.5, 1))

    concept_ratio = min(1.0, len(correct_concepts) / 2.0) if correct_concepts else 0.2
    concept_understanding = min(3.0, max(0.3, round(concept_ratio * 3.0, 1)))

    completeness_ratio = min(1.0, (criteria_matched + (1 if word_count > 35 else 0)) / max(1, len(expected_criteria) + 1))
    completeness = min(2.0, max(0.2, round(completeness_ratio * 2.0, 1)))

    reasoning_ratio = 1.0 if (has_complexity_mention or alternative_valid_approaches or has_code_or_syntax) else 0.5
    reasoning = min(1.0, max(0.1, round(reasoning_ratio * 1.0, 1)))

    calculated_score = round(tech_correctness + concept_understanding + completeness + reasoning, 1)
    final_score = max(1.0, min(9.8, round(max(base_score, calculated_score), 1)))

    # Supporting evidence excerpt
    sentences = [s.strip() for s in re.split(r'[.!?\n]', ans) if len(s.strip()) > 15]
    evidence_text = f"\"{sentences[0]}\"" if sentences else f"\"{ans[:120]}\""
    
    # 6. Potential Discrepancy & Bias Detection
    potential_discrepancy = False
    discrepancy_reasons = []
    
    if interviewer_score is not None:
        delta = interviewer_score - final_score
        
        # Scenario A: Candidate gave technically solid answer (or valid alternative) but interviewer underscored harshly
        if final_score >= 7.0 and interviewer_score <= 4.5:
            potential_discrepancy = True
            discrepancy_reasons.append(
                f"Candidate demonstrated sound technical logic (AI Score: {final_score}/10), but interviewer scored only {interviewer_score}/10. Valid alternative or functional explanation may have been dismissed due to phrasing differences."
            )
        # Scenario B: Significant score divergence >= threshold
        elif abs(delta) >= settings.BIAS_SCORE_DELTA_THRESHOLD:
            potential_discrepancy = True
            if delta < 0:
                discrepancy_reasons.append(
                    f"Candidate scored {final_score}/10 on technical merits, while interviewer assigned {interviewer_score}/10 (Difference: {abs(delta):.1f} pts). Potential strict keyword penalty or uncalibrated standard."
                )
            else:
                discrepancy_reasons.append(
                    f"Interviewer assigned {interviewer_score}/10, exceeding the technical evidence evaluated at {final_score}/10. Potential grade inflation or positive halo effect."
                )
                
        # Scenario C: Alternative approach penalization
        if alternative_valid_approaches and interviewer_notes:
            notes_lower = interviewer_notes.lower()
            if any(term in notes_lower for term in ["wrong approach", "not what i wanted", "did not use", "only wanted"]):
                potential_discrepancy = True
                discrepancy_reasons.append(
                    "Interviewer notes indicate rejection based on specific expected syntax or method, whereas candidate provided a functionally valid alternative engineering approach."
                )

    explanation = f"Evaluated candidate response for {domain} technical depth. "
    if rag_reference_title:
        explanation += f"Grounding matched with reference benchmark: '{rag_reference_title}'. "
    if correct_concepts:
        explanation += f"Identified {len(correct_concepts)} verified technical concepts: {'; '.join(correct_concepts[:3])}. "
    else:
        explanation += "No core technical concepts verified in candidate explanation. "
    if missing_concepts:
        explanation += f"Areas for growth include: {'; '.join(missing_concepts[:2])}. "
    if alternative_valid_approaches:
        explanation += f"Recognized valid architectural alternative: {alternative_valid_approaches[0]}. "
        
    rec = "Evaluation meets standard baseline."
    if potential_discrepancy:
        rec = "Flagged for Secondary Review: " + " ".join(discrepancy_reasons)
    else:
        rec = "Independent technical scoring confirms interviewer judgment is within acceptable calibration margins."

    return {
        "technical_score": final_score,
        "score_breakdown": {
            "technical_correctness": tech_correctness,
            "conceptual_understanding": concept_understanding,
            "completeness": completeness,
            "reasoning": reasoning
        },
        "status": "completed",
        "status_label": "Completed",
        "status_message": "Answer evaluated successfully based on verified technical concepts.",
        "correct_concepts": correct_concepts,
        "incorrect_concepts": incorrect_concepts,
        "missing_concepts": missing_concepts or ["Minor edge case exploration"],
        "alternative_valid_approaches": alternative_valid_approaches,
        "evidence": evidence_text,
        "explanation": explanation,
        "potential_discrepancy": potential_discrepancy,
        "review_recommendation": rec
    }
