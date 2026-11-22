import os
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from bson import ObjectId

from app.config import settings
from app.database import get_interviews_collection, get_evaluations_collection

logger = logging.getLogger("biasguard.question_suggester")

SYSTEM_SUGGESTER_PROMPT = """You are BiasGuard AI, a principal technical interviewer and software architect.
Your mission is to suggest 3 to 4 highly relevant, technically precise follow-up and expansion interview questions for an active technical interview.

CORE GUIDELINES:
1. Dynamic Follow-Up Based on Technical Performance:
   - If the candidate answered correctly and demonstrated strong mastery: suggest a deeper architectural question, high-concurrency challenge, or edge-case trade-off.
   - If the candidate's answer was partially correct or had notable omissions: suggest a targeted question exploring the specific missing concepts.
   - If the candidate's answer had significant misconceptions or failed basic criteria: suggest a foundational conceptual question to verify core fundamentals.
   - If the candidate presented a valid alternative approach: suggest a question analyzing the trade-offs of their chosen approach.
2. Strict Technical Invariance & Anti-Bias Guardrails:
   - Base suggestions SOLELY on computer science substance and engineering logic.
   - NEVER suggest questions or evaluate candidates based on accent, pronunciation, grammar, speaking speed, conversational filler words, or verbal fluency.
3. Relevant & Non-Generic:
   - Tailor questions directly to the candidate's target job role and interview domains.
   - DO NOT repeat any questions already asked in the interview.
4. Return Format:
   Respond strictly with a valid JSON object matching this schema:
   {
     "suggested_questions": [
       {
         "question_text": "...",
         "domain": "...",
         "difficulty": "Easy|Medium|Hard",
         "follow_up_reason": "...",
         "expected_criteria": ["...", "..."],
         "sample_answer": "..."
       }
     ]
   }
"""

# Contextual domain matrices for resilient fallback generation
DOMAIN_FALLBACK_MATRICES = {
    "Java": {
        "deep_dive": [
            {
                "question_text": "How does ConcurrentHashMap achieve thread safety in Java 8+ without full table locking?",
                "domain": "Java",
                "difficulty": "Hard",
                "follow_up_reason": "Deep-dive: Evaluates multi-threading concurrency, CAS operations, and synchronized node locking.",
                "expected_criteria": [
                    "Node-level synchronized locking on the head bin instead of Segment locks",
                    "CAS (compare-and-swap) for empty bin insertion",
                    "TreeBin for treeified bins and concurrent resize transfer mechanism"
                ]
            },
            {
                "question_text": "Explain the difference between G1 and ZGC garbage collectors in the JVM and how ZGC achieves sub-millisecond pause times.",
                "domain": "Java",
                "difficulty": "Hard",
                "follow_up_reason": "Deep-dive: Advanced JVM memory architecture and low-latency garbage collection tuning.",
                "expected_criteria": [
                    "ZGC uses colored pointers and load barriers",
                    "Concurrent marking and relocation phases without stop-the-world pauses",
                    "G1 region-based generational collection vs ZGC's single-generation/scalable design"
                ]
            }
        ],
        "missing_concept": [
            {
                "question_text": "Why must equals() and hashCode() always be overridden together in Java? What happens in a HashSet if you override one without the other?",
                "domain": "Java",
                "difficulty": "Medium",
                "follow_up_reason": "Probes missing concept: Hashing contract and object equality in collections.",
                "expected_criteria": [
                    "Equal objects must produce identical hashCodes",
                    "Unequal hashCodes place equal objects in different buckets",
                    "Causes contains() or get() lookups to fail despite matching fields"
                ]
            },
            {
                "question_text": "What is the memory and performance impact of autoboxing and unboxing in performance-critical loops in Java?",
                "domain": "Java",
                "difficulty": "Medium",
                "follow_up_reason": "Probes missing concept: Primitive memory layout vs boxed object allocations.",
                "expected_criteria": [
                    "Creates unnecessary wrapper heap objects (Integer, Long) causing GC pressure",
                    "Primitive arrays have contiguous memory layout; boxed arrays store references",
                    "Best practices: using primitive streams or specialized collections"
                ]
            }
        ],
        "foundational": [
            {
                "question_text": "Explain the difference between an Abstract Class and an Interface in Java, including Java 8 default methods.",
                "domain": "Java",
                "difficulty": "Easy",
                "follow_up_reason": "Foundational check: OOP core design patterns and polymorphism in Java.",
                "expected_criteria": [
                    "Single inheritance for classes vs multiple interface implementations",
                    "Abstract classes can maintain instance state/constructors",
                    "Default methods provide backward-compatible interface evolution"
                ]
            },
            {
                "question_text": "What is the difference between Checked and Unchecked exceptions in Java and when should each be used?",
                "domain": "Java",
                "difficulty": "Easy",
                "follow_up_reason": "Foundational check: Error handling architecture in Java.",
                "expected_criteria": [
                    "Checked exceptions inherit from Exception and require compile-time handling",
                    "Unchecked exceptions inherit from RuntimeException indicating programming errors",
                    "Checked for recoverable business errors, unchecked for bugs/illegal arguments"
                ]
            }
        ]
    },
    "Python": {
        "deep_dive": [
            {
                "question_text": "How does CPython's memory management work under the hood regarding reference counting, cyclic garbage collection, and PyMalloc arenas?",
                "domain": "Python",
                "difficulty": "Hard",
                "follow_up_reason": "Deep-dive: Internal CPython runtime mechanics and memory allocation pools.",
                "expected_criteria": [
                    "Primary reference counting with instant deallocation when refcount reaches 0",
                    "Generational cyclic garbage collector (Gen 0, 1, 2) for circular references",
                    "PyMalloc small object allocator with pools, arenas, and blocks"
                ]
            },
            {
                "question_text": "How does Python's asyncio event loop schedule coroutines, and how do tasks differ from raw generators and threads?",
                "domain": "Python",
                "difficulty": "Hard",
                "follow_up_reason": "Deep-dive: Asynchronous non-blocking concurrency and event loop scheduling.",
                "expected_criteria": [
                    "Single-threaded cooperative multitasking using epoll/kqueue selectors",
                    "Coroutines yield control at await expressions to pending futures",
                    "Asyncio vs OS threads vs multiprocessing CPU scaling"
                ]
            }
        ],
        "missing_concept": [
            {
                "question_text": "Why should you never use mutable default arguments (like empty lists or dicts) in Python functions?",
                "domain": "Python",
                "difficulty": "Medium",
                "follow_up_reason": "Probes missing concept: Function definition evaluation and object mutation side effects.",
                "expected_criteria": [
                    "Default argument expressions are evaluated once when the function is defined, not called",
                    "Mutations persist across subsequent invocations",
                    "Standard idiom: use None as default and initialize inside function body"
                ]
            },
            {
                "question_text": "How do generator functions using 'yield' differ from standard functions in terms of memory efficiency when processing large datasets?",
                "domain": "Python",
                "difficulty": "Medium",
                "follow_up_reason": "Probes missing concept: Lazy evaluation and stream processing in memory.",
                "expected_criteria": [
                    "Generators produce items on demand without loading entire sequence into RAM",
                    "Preserves function execution state and local stack frame between yields",
                    "Constant O(1) space overhead compared to O(N) list allocations"
                ]
            }
        ],
        "foundational": [
            {
                "question_text": "What is the difference between deepcopy, shallow copy, and assignment in Python?",
                "domain": "Python",
                "difficulty": "Easy",
                "follow_up_reason": "Foundational check: Object reference semantics and memory duplication.",
                "expected_criteria": [
                    "Assignment binds a new name to the same object reference",
                    "Shallow copy duplicates the container but references nested objects",
                    "Deepcopy recursively copies container and all nested objects"
                ]
            },
            {
                "question_text": "What are *args and **kwargs in Python and how do you pass keyword arguments dynamically?",
                "domain": "Python",
                "difficulty": "Easy",
                "follow_up_reason": "Foundational check: Dynamic parameter unpacking in Python.",
                "expected_criteria": [
                    "*args unpacks positional arguments into a tuple",
                    "**kwargs unpacks keyword arguments into a dictionary",
                    "Useful for decorator functions and forwarders"
                ]
            }
        ]
    },
    "DSA": {
        "deep_dive": [
            {
                "question_text": "Given an unsorted integer array, how do you find the smallest missing positive integer in O(N) time and O(1) auxiliary space?",
                "domain": "DSA",
                "difficulty": "Hard",
                "follow_up_reason": "Deep-dive: In-place index cycle sort and linear time boundary analysis.",
                "expected_criteria": [
                    "In-place indexing / cycle sort putting each number k at index k - 1",
                    "Ignoring numbers <= 0 or > N",
                    "Second linear scan to find the first index where arr[i] != i + 1"
                ]
            },
            {
                "question_text": "How does the Monotonic Stack pattern work and how do you use it to find the Next Greater Element or calculate Trapping Rain Water in O(N) time?",
                "domain": "DSA",
                "difficulty": "Hard",
                "follow_up_reason": "Deep-dive: Advanced stack applications and amortized O(1) operations.",
                "expected_criteria": [
                    "Maintaining elements in strictly ascending or descending order",
                    "Popping smaller elements when a larger element arrives",
                    "Every element is pushed and popped at most once leading to linear amortized time"
                ]
            }
        ],
        "missing_concept": [
            {
                "question_text": "What is the difference between Quicksort and Mergesort regarding stability, worst-case time complexity, and auxiliary space?",
                "domain": "DSA",
                "difficulty": "Medium",
                "follow_up_reason": "Probes missing concept: Sorting stability and memory trade-offs.",
                "expected_criteria": [
                    "Mergesort guarantees O(N log N) worst-case time and is stable, but requires O(N) extra space",
                    "Quicksort is in-place O(1) auxiliary space, but degrades to O(N^2) if pivot selection is unoptimized",
                    "Stability preservation when sorting records with multiple keys"
                ]
            },
            {
                "question_text": "How do you detect a cycle in a directed graph vs an undirected graph using DFS?",
                "domain": "DSA",
                "difficulty": "Medium",
                "follow_up_reason": "Probes missing concept: Graph state tracking and back-edge detection.",
                "expected_criteria": [
                    "Directed graphs require 3-color state (unvisited, visiting/in recursion stack, visited)",
                    "Undirected graph cycle requires checking if adjacent visited node is not the parent",
                    "Time complexity O(V + E)"
                ]
            }
        ],
        "foundational": [
            {
                "question_text": "What is the time complexity of searching, inserting, and deleting in a Binary Search Tree (BST) in best, average, and worst cases?",
                "domain": "DSA",
                "difficulty": "Easy",
                "follow_up_reason": "Foundational check: Tree properties and skewed tree degeneration.",
                "expected_criteria": [
                    "Average case O(log N) for balanced trees",
                    "Worst case O(N) when tree degrades into a skewed linked list",
                    "Self-balancing trees like AVL or Red-Black trees prevent degradation"
                ]
            },
            {
                "question_text": "Explain why accessing an element in an array by index is O(1) time complexity.",
                "domain": "DSA",
                "difficulty": "Easy",
                "follow_up_reason": "Foundational check: Contiguous memory addressing arithmetic.",
                "expected_criteria": [
                    "Arrays occupy contiguous memory blocks",
                    "Memory address is calculated directly via: base_address + (index * element_size)",
                    "Direct pointer arithmetic performs zero traversal loops"
                ]
            }
        ]
    },
    "System Design": {
        "deep_dive": [
            {
                "question_text": "How would you design a distributed idempotency key mechanism for payment processing to guarantee exactly-once semantics across network retries?",
                "domain": "System Design",
                "difficulty": "Hard",
                "follow_up_reason": "Deep-dive: Distributed transaction safety, idempotency keys, and network partition resilience.",
                "expected_criteria": [
                    "Client generates unique idempotency UUID stored in database with unique constraint",
                    "State machine transitions: PENDING, IN_PROGRESS, SUCCESS, FAILED",
                    "Atomic lock acquisition (e.g. Redis SETNX or SQL row lock) with timeout and cached response replay"
                ]
            },
            {
                "question_text": "How do you handle Cache Stampede (Thundering Herd) when a hot cache key expires simultaneously under heavy traffic?",
                "domain": "System Design",
                "difficulty": "Hard",
                "follow_up_reason": "Deep-dive: High-throughput caching resilience and cache invalidation strategies.",
                "expected_criteria": [
                    "Probabilistic early expiration (XFetch algorithm)",
                    "Distributed mutex lock to allow only one thread/instance to recompute",
                    "Background worker refresh with soft TTL vs hard TTL"
                ]
            }
        ],
        "missing_concept": [
            {
                "question_text": "Explain the difference between strong consistency and eventual consistency and how the CAP and PACELC theorems apply.",
                "domain": "System Design",
                "difficulty": "Medium",
                "follow_up_reason": "Probes missing concept: Distributed data consistency trade-offs.",
                "expected_criteria": [
                    "Strong consistency: all reads see latest write at cost of higher latency",
                    "Eventual consistency: replicas converge over time with lower latency and higher availability",
                    "PACELC: If partition (P), choose A or C; Else (E), choose Latency (L) or Consistency (C)"
                ]
            },
            {
                "question_text": "How does Consistent Hashing work and why is it preferred over simple modulo hashing for distributed caching clusters?",
                "domain": "System Design",
                "difficulty": "Medium",
                "follow_up_reason": "Probes missing concept: Node rebalancing and key remap minimization.",
                "expected_criteria": [
                    "Keys and nodes mapped onto a 360-degree hash ring",
                    "Adding or removing a node only remaps K/N keys instead of nearly all keys",
                    "Virtual nodes ensure uniform distribution and prevent hot spot clusters"
                ]
            }
        ],
        "foundational": [
            {
                "question_text": "What is the difference between horizontal scaling and vertical scaling, and what are the limitations of each?",
                "domain": "System Design",
                "difficulty": "Easy",
                "follow_up_reason": "Foundational check: Core scalability architecture.",
                "expected_criteria": [
                    "Vertical scaling: adding CPU/RAM to a single server (hardware ceiling, single point of failure)",
                    "Horizontal scaling: adding more machines behind a load balancer (distributed complexity)",
                    "Stateless services enable easy horizontal scaling"
                ]
            },
            {
                "question_text": "What is the role of a Reverse Proxy (such as Nginx) in front of application web servers?",
                "domain": "System Design",
                "difficulty": "Easy",
                "follow_up_reason": "Foundational check: Network architecture and edge routing.",
                "expected_criteria": [
                    "Load balancing traffic across multiple backend workers",
                    "SSL termination / TLS offloading",
                    "Static asset caching, compression (Gzip/Brotli), and rate limiting"
                ]
            }
        ]
    },
    "SQL": {
        "deep_dive": [
            {
                "question_text": "How do database isolation levels (Read Uncommitted, Read Committed, Repeatable Read, Serializable) prevent Dirty Reads, Non-repeatable Reads, and Phantom Reads?",
                "domain": "SQL",
                "difficulty": "Hard",
                "follow_up_reason": "Deep-dive: ACID concurrency, MVCC, and transaction lock escalation.",
                "expected_criteria": [
                    "Dirty Read: reading uncommitted changes (prevented by Read Committed)",
                    "Non-repeatable Read: row values change between reads (prevented by Repeatable Read)",
                    "Phantom Read: new rows inserted matching query condition (prevented by Serializable / Next-Key Locks)",
                    "Multi-Version Concurrency Control (MVCC) implementation"
                ]
            }
        ],
        "missing_concept": [
            {
                "question_text": "What is the difference between Clustered and Non-Clustered B+ Tree indexes, and how does a Covering Index eliminate lookup overhead?",
                "domain": "SQL",
                "difficulty": "Medium",
                "follow_up_reason": "Probes missing concept: Index physical storage layout and query optimizer plans.",
                "expected_criteria": [
                    "Clustered index defines physical order of table rows (one per table)",
                    "Non-clustered index stores leaf pointers back to clustered key",
                    "Covering index includes all queried columns in leaf nodes, avoiding row table lookups"
                ]
            }
        ],
        "foundational": [
            {
                "question_text": "Explain the difference between WHERE and HAVING clauses in SQL.",
                "domain": "SQL",
                "difficulty": "Easy",
                "follow_up_reason": "Foundational check: SQL query execution order and grouping filters.",
                "expected_criteria": [
                    "WHERE filters individual rows before grouping and aggregation",
                    "HAVING filters aggregated groups after GROUP BY execution",
                    "HAVING can use aggregate functions (SUM, COUNT), WHERE cannot"
                ]
            }
        ]
    }
}

def _get_llm_client():
    """
    Returns an initialized LLM client (Groq or OpenAI) along with provider and model info.
    """
    # 1. Try Groq if configured
    if settings.GROQ_API_KEY and not settings.MOCK_AI_MODE:
        try:
            from groq import Groq
            client = Groq(api_key=settings.GROQ_API_KEY)
            return client, "groq", "qwen/qwen3.8-27b"
        except Exception as e:
            logger.warning(f"Groq client init error: {e}")

    # 2. Try OpenAI if configured
    if settings.OPENAI_API_KEY and not settings.MOCK_AI_MODE:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            return client, "openai", settings.OPENAI_MODEL
        except Exception as e:
            logger.warning(f"OpenAI client init error: {e}")

    return None, "mock", "fallback"

def _build_context_prompt(
    candidate_role: str,
    domains: List[str],
    asked_questions: List[str],
    evaluations_summary: List[Dict[str, Any]],
    target_domain: Optional[str] = None
) -> str:
    domain_list = target_domain if target_domain else ", ".join(domains or ["DSA", "Software Engineering"])
    asked_list = "\n".join([f"- {q}" for q in asked_questions]) if asked_questions else "None yet (Opening Question)"

    eval_history = ""
    if evaluations_summary:
        for i, ev in enumerate(evaluations_summary, 1):
            eval_history += f"""
Question {i}: "{ev.get('question_text')}" [{ev.get('domain')}]
- Technical Score: {ev.get('technical_score')}/10
- Candidate Spoken Answer: "{ev.get('candidate_answer', '')[:200]}..."
- Verified Correct Concepts: {', '.join(ev.get('correct_concepts', [])) or 'None'}
- Missing Concepts / Omissions: {', '.join(ev.get('missing_concepts', [])) or 'None'}
- Inaccurate Statements: {', '.join(ev.get('incorrect_concepts', [])) or 'None'}
- Alternative Approaches Used: {', '.join(ev.get('alternative_approaches', [])) or 'None'}
"""
    else:
        eval_history = "No questions have been answered or evaluated yet. Generate comprehensive opening technical questions."

    return f"""Candidate Target Role: {candidate_role}
Primary Technical Domains: {domain_list}

PREVIOUSLY ASKED QUESTIONS (DO NOT REPEAT ANY OF THESE):
{asked_list}

CANDIDATE PERFORMANCE & EVALUATION HISTORY:
{eval_history}

Please generate 3 to 4 technical follow-up questions tailored to this candidate.
Remember:
- Base suggestions purely on technical substance.
- Follow up on missing concepts or probe deeper if mastery was proven.
- Provide clear criteria for each question.
- Do not duplicate asked questions.
"""

def generate_contextual_fallbacks(
    domains: List[str],
    asked_texts: set,
    skipped_texts: set,
    last_score: Optional[float] = None,
    missing_concepts: Optional[List[str]] = None,
    alternative_used: bool = False
) -> List[Dict[str, Any]]:
    """
    Deterministically generates high-quality technical follow-up suggestions from domain matrices
    based on the candidate's actual recent score and missing concepts.
    """
    suggestions = []
    excluded = asked_texts | skipped_texts
    
    # Decide which tier to sample from
    tiers = []
    if last_score is not None:
        if last_score >= 7.5:
            tiers = ["deep_dive", "missing_concept", "deep_dive"]
        elif last_score >= 5.0:
            tiers = ["missing_concept", "deep_dive", "foundational"]
        else:
            tiers = ["foundational", "missing_concept", "foundational"]
    else:
        tiers = ["missing_concept", "deep_dive", "foundational"]

    # Pick matching domain templates
    for d in domains:
        matrix = DOMAIN_FALLBACK_MATRICES.get(d)
        if not matrix:
            continue
        for tier in tiers:
            candidates = matrix.get(tier, [])
            for item in candidates:
                q_text_norm = item["question_text"].strip().lower()
                if q_text_norm not in excluded and not any(s["question_text"].strip().lower() == q_text_norm for s in suggestions):
                    sug = dict(item)
                    sug["id"] = f"sug_{uuid.uuid4().hex[:8]}"
                    sug["status"] = "suggested"
                    sug["created_at"] = datetime.now(timezone.utc)
                    suggestions.append(sug)
                    if len(suggestions) >= 4:
                        break
            if len(suggestions) >= 4:
                break
        if len(suggestions) >= 4:
            break

    # If still fewer than 3 suggestions, draw from other general domains
    if len(suggestions) < 3:
        for d, matrix in DOMAIN_FALLBACK_MATRICES.items():
            for tier in ["deep_dive", "missing_concept", "foundational"]:
                for item in matrix.get(tier, []):
                    q_text_norm = item["question_text"].strip().lower()
                    if q_text_norm not in excluded and not any(s["question_text"].strip().lower() == q_text_norm for s in suggestions):
                        sug = dict(item)
                        sug["id"] = f"sug_{uuid.uuid4().hex[:8]}"
                        sug["status"] = "suggested"
                        sug["created_at"] = datetime.now(timezone.utc)
                        suggestions.append(sug)
                        if len(suggestions) >= 4:
                            break
                if len(suggestions) >= 4:
                    break
            if len(suggestions) >= 4:
                break

    return suggestions[:4]

def generate_suggested_questions(
    interview_id: str,
    domain: Optional[str] = None,
    force_refresh: bool = False
) -> List[Dict[str, Any]]:
    """
    Generates 3 to 4 AI-powered suggested questions based on the full interview context,
    candidate's target role, and past answers/evaluation results.
    """
    interviews_col = get_interviews_collection()
    evaluations_col = get_evaluations_collection()

    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise ValueError("Invalid interview ID format.")

    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise ValueError("Interview not found.")

    existing_suggestions = interview.get("suggested_questions") or []
    active_suggestions = [s for s in existing_suggestions if s.get("status") == "suggested"]

    # If suggestions already exist and not forcing refresh, return them
    if active_suggestions and not force_refresh:
        return active_suggestions

    candidate_role = interview.get("candidate_role") or "Software Engineer"
    domains = [domain] if domain else (interview.get("domains") or ["DSA"])
    questions = interview.get("questions") or []
    
    asked_texts = {q.get("question_text", "").strip().lower() for q in questions if q.get("question_text")}
    skipped_texts = {s.get("question_text", "").strip().lower() for s in existing_suggestions if s.get("status") in ["skipped", "asked"]}

    # Collect past evaluations for context
    eval_docs = list(evaluations_col.find({"interview_id": interview_id}))
    eval_map = {e.get("question_id"): e for e in eval_docs}

    evaluations_summary = []
    last_score = None
    last_missing_concepts = []
    last_alt_used = False

    for q in questions:
        q_id = q.get("id")
        if q_id in eval_map:
            e = eval_map[q_id]
            ai_eval = e.get("ai_evaluation", {})
            score = ai_eval.get("technical_score")
            correct = ai_eval.get("correct_concepts", [])
            missing = ai_eval.get("missing_concepts", [])
            incorrect = ai_eval.get("incorrect_concepts", [])
            alts = ai_eval.get("alternative_valid_approaches", [])
            
            evaluations_summary.append({
                "question_text": q.get("question_text"),
                "domain": q.get("domain"),
                "candidate_answer": q.get("candidate_answer") or q.get("transcription") or "",
                "technical_score": score,
                "correct_concepts": correct,
                "missing_concepts": missing,
                "incorrect_concepts": incorrect,
                "alternative_approaches": alts
            })
            last_score = score
            last_missing_concepts = missing
            if alts:
                last_alt_used = True

    # Attempt AI Generation via Groq or OpenAI
    client, provider, model = _get_llm_client()
    generated_items = []

    if client and provider in ["groq", "openai"]:
        try:
            prompt = _build_context_prompt(
                candidate_role=candidate_role,
                domains=domains,
                asked_questions=list(asked_texts),
                evaluations_summary=evaluations_summary,
                target_domain=domain
            )
            
            messages = [
                {"role": "system", "content": SYSTEM_SUGGESTER_PROMPT},
                {"role": "user", "content": prompt}
            ]

            response = client.chat.completions.create(
                model=model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0.7,
                max_tokens=800
            )

            raw_text = response.choices[0].message.content
            parsed = json.loads(raw_text)
            raw_sugs = parsed.get("suggested_questions") or parsed.get("questions") or []

            for item in raw_sugs:
                q_text = item.get("question_text", "").strip()
                if not q_text or len(q_text) < 5:
                    continue
                q_norm = q_text.lower()
                if q_norm in asked_texts or q_norm in skipped_texts:
                    continue

                generated_items.append({
                    "id": f"sug_{uuid.uuid4().hex[:8]}",
                    "question_text": q_text,
                    "domain": item.get("domain") or domains[0],
                    "difficulty": item.get("difficulty") or "Medium",
                    "follow_up_reason": item.get("follow_up_reason") or "Follow-up tailored to candidate's previous responses.",
                    "expected_criteria": item.get("expected_criteria") or [],
                    "sample_answer": item.get("sample_answer") or "",
                    "status": "suggested",
                    "created_at": datetime.now(timezone.utc)
                })
                if len(generated_items) >= 4:
                    break

        except Exception as e:
            logger.warning(f"AI question generation call error ({provider}:{model}): {e}. Using contextual fallback matrix.")

    # If AI generation didn't return enough questions, fill in with contextual fallbacks
    if len(generated_items) < 3:
        fallbacks = generate_contextual_fallbacks(
            domains=domains,
            asked_texts=asked_texts | {g["question_text"].strip().lower() for g in generated_items},
            skipped_texts=skipped_texts,
            last_score=last_score,
            missing_concepts=last_missing_concepts,
            alternative_used=last_alt_used
        )
        for fb in fallbacks:
            if len(generated_items) >= 4:
                break
            generated_items.append(fb)

    # Persist updated suggested questions list
    # Keep historical asked/skipped suggestions for telemetry, replace pending 'suggested' ones
    historical_suggestions = [s for s in existing_suggestions if s.get("status") in ["asked", "skipped"]]
    updated_all = historical_suggestions + generated_items

    now = datetime.now(timezone.utc)
    interviews_col.update_one(
        {"_id": obj_id},
        {"$set": {
            "suggested_questions": updated_all,
            "updated_at": now
        }}
    )

    return generated_items

def ask_suggested_question(interview_id: str, suggestion_id: str) -> Dict[str, Any]:
    """
    Converts a suggested question into an active interview question, appends it to interview.questions,
    marks suggestion status as 'asked', and advances current_question_index.
    """
    interviews_col = get_interviews_collection()

    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise ValueError("Invalid interview ID format.")

    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise ValueError("Interview not found.")

    suggestions = interview.get("suggested_questions") or []
    target_sug = None
    target_idx = -1

    for idx, s in enumerate(suggestions):
        if s.get("id") == suggestion_id:
            target_sug = s
            target_idx = idx
            break

    if not target_sug:
        raise ValueError(f"Suggested question '{suggestion_id}' not found.")

    # Create new QuestionItem
    new_q_id = f"q_{uuid.uuid4().hex[:8]}"
    new_question = {
        "id": new_q_id,
        "domain": target_sug.get("domain", "General"),
        "question_text": target_sug.get("question_text"),
        "difficulty": target_sug.get("difficulty", "Medium"),
        "expected_criteria": target_sug.get("expected_criteria", []),
        "sample_answer": target_sug.get("sample_answer", ""),
        "candidate_answer": "",
        "transcription": "",
        "interviewer_score": None,
        "interviewer_notes": "",
        "evaluated": False,
        "evaluation_id": None,
        "submission_mode": "voice_recorded"
    }

    # Update suggestion status to 'asked'
    suggestions[target_idx]["status"] = "asked"
    questions = interview.get("questions") or []
    new_active_index = len(questions)

    now = datetime.now(timezone.utc)
    interviews_col.update_one(
        {"_id": obj_id},
        {
            "$push": {"questions": new_question},
            "$set": {
                "suggested_questions": suggestions,
                "current_question_index": new_active_index,
                "updated_at": now
            }
        }
    )

    return {
        "new_question": new_question,
        "new_question_index": new_active_index,
        "suggestion_id": suggestion_id
    }

def skip_suggested_question(interview_id: str, suggestion_id: str) -> List[Dict[str, Any]]:
    """
    Marks a suggested question as 'skipped' so it won't appear to the interviewer.
    If remaining active suggestions are low, automatically replenishes them.
    """
    interviews_col = get_interviews_collection()

    try:
        obj_id = ObjectId(interview_id)
    except Exception:
        raise ValueError("Invalid interview ID format.")

    interview = interviews_col.find_one({"_id": obj_id})
    if not interview:
        raise ValueError("Interview not found.")

    suggestions = interview.get("suggested_questions") or []
    found = False
    for s in suggestions:
        if s.get("id") == suggestion_id:
            s["status"] = "skipped"
            found = True
            break

    if not found:
        raise ValueError(f"Suggested question '{suggestion_id}' not found.")

    now = datetime.now(timezone.utc)
    interviews_col.update_one(
        {"_id": obj_id},
        {"$set": {
            "suggested_questions": suggestions,
            "updated_at": now
        }}
    )

    # Check remaining active suggestions
    remaining = [s for s in suggestions if s.get("status") == "suggested"]
    if len(remaining) < 2:
        return generate_suggested_questions(interview_id, force_refresh=True)

    return remaining
