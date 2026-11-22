from fastapi import APIRouter
from datetime import datetime, timezone, timedelta
from app.database import (
    get_users_collection,
    get_candidates_collection,
    get_interviews_collection,
    get_evaluations_collection,
    get_reports_collection,
    get_training_datasets_collection,
    get_evaluation_feedbacks_collection,
    get_audio_recordings_collection
)
from app.services.auth_service import hash_password
from app.routes.evaluations import sync_interview_report
from app.config import settings
import os

router = APIRouter(prefix="/seed", tags=["Seed Data"])

@router.post("")
async def seed_database():
    """Seeds rich, realistic demonstration data illustrating bias detection scenarios."""
    users_col = get_users_collection()
    candidates_col = get_candidates_collection()
    interviews_col = get_interviews_collection()
    evaluations_col = get_evaluations_collection()
    reports_col = get_reports_collection()

    # Clear existing data
    users_col.delete_many({})
    candidates_col.delete_many({})
    interviews_col.delete_many({})
    evaluations_col.delete_many({})
    reports_col.delete_many({})

    now = datetime.now(timezone.utc)

    # 1. Seed Users
    interviewer_pw = hash_password("password123")
    admin_pw = hash_password("admin123")

    user_interviewer = {
        "name": "Sarah Jenkins",
        "email": "interviewer@biasguard.ai",
        "password_hash": interviewer_pw,
        "role": "interviewer",
        "created_at": now - timedelta(days=30)
    }
    user_admin = {
        "name": "David Chen (VP Eng)",
        "email": "admin@biasguard.ai",
        "password_hash": admin_pw,
        "role": "admin",
        "created_at": now - timedelta(days=60)
    }

    res_int = users_col.insert_one(user_interviewer)
    res_adm = users_col.insert_one(user_admin)
    interviewer_id = str(res_int.inserted_id)

    # 2. Seed Candidates
    candidates = [
        {
            "name": "Arjun Patel",
            "email": "arjun.patel@example.com",
            "phone": "+1 415-555-0142",
            "experience_years": 4.5,
            "target_role": "Senior Full-Stack Engineer",
            "primary_skills": ["Python", "DSA", "SQL", "FastAPI", "React"],
            "resume_summary": "4+ years building high-throughput microservices and distributed transaction pipelines.",
            "notes": "Strong algorithmic foundations, self-taught in distributed systems.",
            "created_at": now - timedelta(days=14)
        },
        {
            "name": "Elena Rostova",
            "email": "elena.rostova@example.com",
            "phone": "+1 206-555-0188",
            "experience_years": 6.0,
            "target_role": "Backend Systems Architect",
            "primary_skills": ["Java", "Operating Systems", "DBMS", "Kafka", "PostgreSQL"],
            "resume_summary": "Extensive experience in low-latency banking engines, JVM internals, and concurrency.",
            "notes": "Calm, concise communicator. Does not use verbose marketing buzzwords.",
            "created_at": now - timedelta(days=10)
        },
        {
            "name": "Marcus Vance",
            "email": "marcus.vance@example.com",
            "phone": "+1 512-555-0199",
            "experience_years": 3.0,
            "target_role": "Data Engineer / SQL Specialist",
            "primary_skills": ["SQL", "DBMS", "Python", "Snowflake", "dbt"],
            "resume_summary": "Data pipeline builder with focus on relational normalization and window analytics.",
            "notes": "Very confident, charismatic speaker.",
            "created_at": now - timedelta(days=7)
        }
    ]

    c_ids = []
    for c in candidates:
        r = candidates_col.insert_one(c)
        c_ids.append(str(r.inserted_id))

    # Create a seed audio recording for demonstration
    audio_col = get_audio_recordings_collection()
    audio_col.delete_many({})
    os.makedirs(settings.AUDIO_UPLOAD_DIR, exist_ok=True)
    demo_audio_name = "seed_spoken_dsa_01.wav"
    demo_audio_path = os.path.join(settings.AUDIO_UPLOAD_DIR, demo_audio_name)
    demo_wav_bytes = bytes([
        0x52, 0x49, 0x46, 0x46,  # "RIFF"
        0x24, 0x00, 0x00, 0x00,  # size 36
        0x57, 0x41, 0x56, 0x45,  # "WAVE"
        0x66, 0x6d, 0x74, 0x20,  # "fmt "
        0x10, 0x00, 0x00, 0x00,  # 16 bytes format chunk
        0x01, 0x00,              # PCM
        0x01, 0x00,              # mono
        0x44, 0xac, 0x00, 0x00,  # 44100 Hz
        0x88, 0x58, 0x01, 0x00,  # byte rate
        0x02, 0x00,              # block align
        0x10, 0x00,              # 16 bits
        0x64, 0x61, 0x74, 0x61,  # "data"
        0x00, 0x00, 0x00, 0x00   # 0 bytes
    ])
    with open(demo_audio_path, "wb") as f:
        f.write(demo_wav_bytes)

    seed_audio_doc = {
        "interview_id": "seed_interview_1",
        "question_id": "q_dsa_01",
        "candidate_id": c_ids[0],
        "filename": demo_audio_name,
        "original_filename": "candidate_spoken_dsa_answer.wav",
        "filepath": demo_audio_path,
        "file_size": len(demo_wav_bytes),
        "content_type": "audio/wav",
        "duration_seconds": 38.5,
        "transcription": "In our production memory-constrained embedded system, allocating an auxiliary hash map of size O(N) isn't always acceptable. If we sort the array in O(n log n) or if the data stream arrives ordered, we can place a left pointer at 0 and a right pointer at n-1. If sum is less than target, advance left; if greater, decrement right. This guarantees O(1) auxiliary space without hash collisions or heap overhead.",
        "edited_transcript": "In our production memory-constrained embedded system, allocating an auxiliary hash map of size O(N) isn't always acceptable. If we sort the array in O(n log n) or if the data stream arrives ordered, we can place a left pointer at 0 and a right pointer at n-1. If sum is less than target, advance left; if greater, decrement right. This guarantees O(1) auxiliary space without hash collisions or heap overhead.",
        "submission_mode": "voice_recorded",
        "engine_used": "OpenAI Whisper (whisper-1)",
        "uploaded_by": "Arjun Patel (Spoken Live)",
        "created_at": now - timedelta(days=5),
        "updated_at": now - timedelta(days=5)
    }
    audio_res = audio_col.insert_one(seed_audio_doc)
    seed_audio_id = str(audio_res.inserted_id)

    # 3. Seed Interview 1: Demonstrates OVERLOOKED ALTERNATIVE APPROACH & STRICT KEYWORD BIAS
    int1_q1_id = "q_dsa_01"
    int1_q2_id = "q_py_01"
    interview1 = {
        "title": "Technical Round - Arjun Patel (Full-Stack)",
        "candidate_id": c_ids[0],
        "candidate_name": candidates[0]["name"],
        "candidate_role": candidates[0]["target_role"],
        "interviewer_id": interviewer_id,
        "interviewer_name": "Sarah Jenkins",
        "domains": ["DSA", "Python"],
        "status": "completed",
        "questions": [
            {
                "id": int1_q1_id,
                "domain": "DSA",
                "question_text": "Given an array of integers and an integer target, how would you find indices of two numbers that sum up to target? Compare the time and space complexity of different approaches.",
                "difficulty": "Medium",
                "expected_criteria": [
                    "Hash Map O(n) time and O(n) auxiliary space",
                    "Two-pointer approach on sorted array O(n log n) with O(1) space",
                    "Brute force O(n^2) baseline",
                    "Edge cases and single-pass optimization"
                ],
                "sample_answer": "Store complements in hash table for linear time, or sort and use two pointers if memory is restricted.",
                "candidate_answer": "In our production memory-constrained embedded system, allocating an auxiliary hash map of size O(N) isn't always acceptable. If we sort the array in O(n log n) or if the data stream arrives ordered, we can place a left pointer at 0 and a right pointer at n-1. If sum is less than target, advance left; if greater, decrement right. This guarantees O(1) auxiliary space without hash collisions or heap overhead.",
                "interviewer_score": 3.5,
                "interviewer_notes": "Candidate didn't write the standard HashMap solution. Insisted on using two pointers which requires sorting. Not the answer I was looking for.",
                "submission_mode": "voice_recorded",
                "audio_id": seed_audio_id,
                "audio_url": f"/api/voice/audio/{seed_audio_id}",
                "recording_duration": 38.5,
                "evaluated": True
            },
            {
                "id": int1_q2_id,
                "domain": "Python",
                "question_text": "Explain Python's Global Interpreter Lock (GIL). What problem does it solve in CPython, and how do you achieve true CPU parallelism?",
                "difficulty": "Medium",
                "expected_criteria": [
                    "CPython reference counting memory management",
                    "Mutually exclusive thread execution on CPU cores",
                    "I/O-bound thread release",
                    "Multiprocessing or Cython for multi-core parallelism"
                ],
                "sample_answer": "GIL ensures only one thread executes Python bytecode at a time to protect reference counting. Use multiprocessing for CPU tasks.",
                "candidate_answer": "The GIL is a mutex in the default CPython runtime that prevents multiple native threads from executing bytecode simultaneously. It exists because Python manages memory by tracking how many variables point to an object, and without the lock, concurrent thread mutations could corrupt memory. For I/O operations like HTTP calls it yields, but for heavy CPU calculations you must spin up separate OS processes via multiprocessing or use subinterpreters.",
                "interviewer_score": 4.5,
                "interviewer_notes": "Mentioned mutex but didn't use the specific term 'reference counting' in the first two sentences. Answer seemed too casual.",
                "evaluated": True
            }
        ],
        "created_at": now - timedelta(days=5),
        "updated_at": now - timedelta(days=5)
    }

    res_int1 = interviews_col.insert_one(interview1)
    int1_id = str(res_int1.inserted_id)

    # Evaluations for Interview 1
    eval1_q1 = {
        "interview_id": int1_id,
        "question_id": int1_q1_id,
        "candidate_id": c_ids[0],
        "candidate_name": candidates[0]["name"],
        "domain": "DSA",
        "question_text": interview1["questions"][0]["question_text"],
        "expected_criteria": interview1["questions"][0]["expected_criteria"],
        "candidate_answer": interview1["questions"][0]["candidate_answer"],
        "interviewer_score": 3.5,
        "interviewer_notes": interview1["questions"][0]["interviewer_notes"],
        "submission_mode": "voice_recorded",
        "audio_id": seed_audio_id,
        "audio_url": f"/api/voice/audio/{seed_audio_id}",
        "recording_duration": 38.5,
        "ai_evaluation": {
            "technical_score": 8.6,
            "correct_concepts": [
                "Two-pointer directional traversal on sorted data",
                "Accurate O(n log n) time and strict O(1) auxiliary space complexity trade-off",
                "Memory-constrained engineering justification for avoiding O(n) hash table allocations",
                "Correct pointer advancement logic (left++ vs right--)"
            ],
            "incorrect_concepts": [],
            "missing_concepts": [
                "Mentioning index restoration if original indices are required after sorting"
            ],
            "alternative_valid_approaches": [
                "Hash Map single-pass O(N) time with O(N) space auxiliary lookup"
            ],
            "explanation": "Candidate demonstrated advanced algorithmic maturity by justifying the Two-Pointer paradigm over Hash Maps based on real-world memory constraints. The algorithmic correctness and complexity analysis are fully sound.",
            "potential_discrepancy": True,
            "review_recommendation": "High Discrepancy Flag: Candidate's alternative two-pointer solution is mathematically and algorithmically valid. Interviewer penalization appears to stem from rigid adherence to a single expected solution template."
        },
        "discrepancy": {
            "detected": True,
            "type": "UNDER_EVALUATED_ALTERNATIVE",
            "severity": "HIGH",
            "score_delta": -5.1,
            "evidence": "Candidate proposed a valid alternative engineering solution (Two-pointer technique O(1) space), yielding an AI technical correctness score of 8.6/10. However, the interviewer assigned 3.5/10. The evaluation penalized non-canonical yet viable problem-solving.",
            "bias_category": "Alternative Approach Overlooked"
        },
        "evaluated_at": now - timedelta(days=5),
        "evaluated_by": "BiasGuard AI Engine",
        "model_used": "BiasGuard AI Evaluator (gpt-4o-mini)"
    }
    evaluations_col.insert_one(eval1_q1)

    eval1_q2 = {
        "interview_id": int1_id,
        "question_id": int1_q2_id,
        "candidate_id": c_ids[0],
        "candidate_name": candidates[0]["name"],
        "domain": "Python",
        "question_text": interview1["questions"][1]["question_text"],
        "expected_criteria": interview1["questions"][1]["expected_criteria"],
        "candidate_answer": interview1["questions"][1]["candidate_answer"],
        "interviewer_score": 4.5,
        "interviewer_notes": interview1["questions"][1]["interviewer_notes"],
        "ai_evaluation": {
            "technical_score": 8.4,
            "correct_concepts": [
                "CPython bytecode execution mutex mechanics",
                "Memory corruption prevention through tracking object pointers (reference counting mechanism accurately described in plain English)",
                "I/O operation GIL release behavior",
                "Multiprocessing and subinterpreters for true multi-core parallel scaling"
            ],
            "incorrect_concepts": [],
            "missing_concepts": [
                "Cython or nogil compile-time release mechanisms"
            ],
            "alternative_valid_approaches": [
                "C-extension native thread release"
            ],
            "explanation": "Candidate provided a clear and technically accurate explanation of the GIL and concurrency limitations. Although they described reference counting functionally rather than with the exact jargon token immediately, the conceptual mechanism was 100% correct.",
            "potential_discrepancy": True,
            "review_recommendation": "Flagged: Candidate scored 8.4/10 on technical merits, while interviewer assigned 4.5/10 (Difference: 3.9 pts). Indication of strict keyword/terminology bias."
        },
        "discrepancy": {
            "detected": True,
            "type": "KEYWORD_PENALTY_BIAS",
            "severity": "HIGH",
            "score_delta": -3.9,
            "evidence": "Candidate response demonstrated verified technical understanding (4 valid concepts identified), earning an objective technical score of 8.4/10. Interviewer scored this 4.5/10 due to phrasing preference.",
            "bias_category": "Strict Keyword / Terminology Bias"
        },
        "evaluated_at": now - timedelta(days=5),
        "evaluated_by": "BiasGuard AI Engine",
        "model_used": "BiasGuard AI Evaluator (gpt-4o-mini)"
    }
    evaluations_col.insert_one(eval1_q2)
    sync_interview_report(int1_id)

    # 4. Seed Interview 2: Demonstrates CALIBRATED & CONSISTENT EVALUATION
    int2_q1_id = "q_java_01"
    int2_q2_id = "q_os_01"
    interview2 = {
        "title": "Systems Architecture Round - Elena Rostova",
        "candidate_id": c_ids[1],
        "candidate_name": candidates[1]["name"],
        "candidate_role": candidates[1]["target_role"],
        "interviewer_id": interviewer_id,
        "interviewer_name": "Sarah Jenkins",
        "domains": ["Java", "Operating Systems"],
        "status": "completed",
        "questions": [
            {
                "id": int2_q1_id,
                "domain": "Java",
                "question_text": "Explain the internal working of HashMap in Java. How does it handle hash collisions in Java 8+, and why is overriding hashCode() mandatory when overriding equals()?",
                "difficulty": "Hard",
                "expected_criteria": [
                    "Array of Node/Entry buckets with bitwise hash indexing",
                    "Collision resolution with LinkedList transforming to Red-Black Tree (TREEIFY_THRESHOLD = 8)",
                    "equals() and hashCode() contract: equal objects must have identical hash codes",
                    "Load factor and rehashing"
                ],
                "sample_answer": "Buckets use linked list until 8 elements then treeify. HashCode must match so same bucket is located before equals check.",
                "candidate_answer": "In Java 8, HashMap is an array of Node buckets. Key hash code is spread and masked to find the bucket index. When collisions occur, items form a linked list. Once a single bucket reaches TREEIFY_THRESHOLD (8 items) and table capacity >= 64, it transforms into a Red-Black Tree (TreeNode) improving search from O(n) to O(log n). If you override equals() without hashCode(), two logically equal objects land in different buckets, so get() returns null.",
                "interviewer_score": 9.0,
                "interviewer_notes": "Thorough, structured explanation covering treeification threshold, red-black tree O(log n), and bucket indexing.",
                "evaluated": True
            },
            {
                "id": int2_q2_id,
                "domain": "Operating Systems",
                "question_text": "What is Deadlock in operating systems? State the four Coffman conditions, and explain how to prevent or detect deadlocks.",
                "difficulty": "Hard",
                "expected_criteria": [
                    "Mutual Exclusion, Hold and Wait, No Preemption, Circular Wait",
                    "Resource Allocation Graph (RAG) cycle detection",
                    "Banker's Algorithm safe vs unsafe state avoidance",
                    "Order-based resource acquisition"
                ],
                "sample_answer": "Deadlock requires Coffman conditions. Prevent by strictly ordering lock acquisition to break circular wait.",
                "candidate_answer": "Deadlock occurs when processes are permanently blocked waiting for resources held by each other. It requires 4 Coffman conditions: Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait. You can eliminate deadlock entirely by imposing a strict global ordering on lock acquisition (e.g., always acquire Lock A before Lock B), which breaks the circular wait condition. For detection, operating systems maintain a Resource Allocation Graph and run cycle-finding algorithms.",
                "interviewer_score": 9.5,
                "interviewer_notes": "Flawless grasp of concurrency fundamentals and lock ordering strategies.",
                "evaluated": True
            }
        ],
        "created_at": now - timedelta(days=3),
        "updated_at": now - timedelta(days=3)
    }

    res_int2 = interviews_col.insert_one(interview2)
    int2_id = str(res_int2.inserted_id)

    eval2_q1 = {
        "interview_id": int2_id,
        "question_id": int2_q1_id,
        "candidate_id": c_ids[1],
        "candidate_name": candidates[1]["name"],
        "domain": "Java",
        "question_text": interview2["questions"][0]["question_text"],
        "expected_criteria": interview2["questions"][0]["expected_criteria"],
        "candidate_answer": interview2["questions"][0]["candidate_answer"],
        "interviewer_score": 9.0,
        "interviewer_notes": interview2["questions"][0]["interviewer_notes"],
        "ai_evaluation": {
            "technical_score": 9.4,
            "correct_concepts": [
                "Node bucket array index calculation",
                "Treeify threshold (8) and table minimum capacity (64) conditions",
                "Red-Black Tree O(log n) worst-case collision lookup guarantee",
                "equals() and hashCode() bucket targeting contract"
            ],
            "incorrect_concepts": [],
            "missing_concepts": [
                "UNTREEIFY_THRESHOLD (6) down-scaling"
            ],
            "alternative_valid_approaches": [
                "ConcurrentHashMap segmented or CAS-based striping"
            ],
            "explanation": "Mastery-level explanation demonstrating deep command of Java collection internals and data structure mechanics.",
            "potential_discrepancy": False,
            "review_recommendation": "Interviewer assessment is well-calibrated and fully supported by technical evidence."
        },
        "discrepancy": {
            "detected": False,
            "type": "CALIBRATED_CONSISTENT",
            "severity": "LOW",
            "score_delta": -0.4,
            "evidence": "Interviewer score (9.0/10) is consistent with the independent technical evaluation (9.4/10) within variance tolerance.",
            "bias_category": "Calibrated & Consistent"
        },
        "evaluated_at": now - timedelta(days=3),
        "evaluated_by": "BiasGuard AI Engine",
        "model_used": "BiasGuard AI Evaluator (gpt-4o-mini)"
    }
    evaluations_col.insert_one(eval2_q1)

    eval2_q2 = {
        "interview_id": int2_id,
        "question_id": int2_q2_id,
        "candidate_id": c_ids[1],
        "candidate_name": candidates[1]["name"],
        "domain": "Operating Systems",
        "question_text": interview2["questions"][1]["question_text"],
        "expected_criteria": interview2["questions"][1]["expected_criteria"],
        "candidate_answer": interview2["questions"][1]["candidate_answer"],
        "interviewer_score": 9.5,
        "interviewer_notes": interview2["questions"][1]["interviewer_notes"],
        "ai_evaluation": {
            "technical_score": 9.2,
            "correct_concepts": [
                "Complete list of all 4 Coffman conditions",
                "Resource Allocation Graph (RAG) cycle detection",
                "Global lock hierarchy order breaking circular wait",
                "Process blocking definition"
            ],
            "incorrect_concepts": [],
            "missing_concepts": [
                "Banker's Algorithm matrix calculation"
            ],
            "alternative_valid_approaches": [
                "Timeout-based lock acquisition (tryLock) with rollback"
            ],
            "explanation": "Excellent command of operating systems synchronization and resource deadlocks.",
            "potential_discrepancy": False,
            "review_recommendation": "Accurately evaluated. No bias or discrepancy identified."
        },
        "discrepancy": {
            "detected": False,
            "type": "CALIBRATED_CONSISTENT",
            "severity": "LOW",
            "score_delta": 0.3,
            "evidence": "Interviewer score (9.5/10) closely matches technical score (9.2/10).",
            "bias_category": "Calibrated & Consistent"
        },
        "evaluated_at": now - timedelta(days=3),
        "evaluated_by": "BiasGuard AI Engine",
        "model_used": "BiasGuard AI Evaluator (gpt-4o-mini)"
    }
    evaluations_col.insert_one(eval2_q2)
    sync_interview_report(int2_id)

    # 5. Seed Interview 3: Demonstrates GRADE INFLATION / HALO EFFECT
    int3_q1_id = "q_db_01"
    interview3 = {
        "title": "Data Architecture Round - Marcus Vance",
        "candidate_id": c_ids[2],
        "candidate_name": candidates[2]["name"],
        "candidate_role": candidates[2]["target_role"],
        "interviewer_id": interviewer_id,
        "interviewer_name": "Sarah Jenkins",
        "domains": ["DBMS", "SQL"],
        "status": "completed",
        "questions": [
            {
                "id": int3_q1_id,
                "domain": "DBMS",
                "question_text": "What is Database Normalization? Walk through 1NF, 2NF, 3NF, and BCNF with examples, and discuss scenarios where de-normalization is preferred.",
                "difficulty": "Hard",
                "expected_criteria": [
                    "1NF: Atomic values",
                    "2NF: No partial dependency on composite key",
                    "3NF: No transitive dependencies",
                    "BCNF: Determinant must be super key",
                    "De-normalization for read performance in OLAP"
                ],
                "sample_answer": "1NF is atomic columns. 2NF removes partial key dependencies. 3NF removes transitive dependencies. De-normalize for data warehouses.",
                "candidate_answer": "Normalization is basically making sure data isn't repeated. In 1NF you don't put commas in cells. In 2NF you make sure tables have good primary keys. In 3NF you connect tables with foreign keys so data is clean. You de-normalize when you want things to be fast in reporting.",
                "interviewer_score": 8.5,
                "interviewer_notes": "Marcus has fantastic presence, spoke with immense confidence, and graduated from a top university. Great hire.",
                "evaluated": True
            }
        ],
        "created_at": now - timedelta(days=1),
        "updated_at": now - timedelta(days=1)
    }

    res_int3 = interviews_col.insert_one(interview3)
    int3_id = str(res_int3.inserted_id)

    eval3_q1 = {
        "interview_id": int3_id,
        "question_id": int3_q1_id,
        "candidate_id": c_ids[2],
        "candidate_name": candidates[2]["name"],
        "domain": "DBMS",
        "question_text": interview3["questions"][0]["question_text"],
        "expected_criteria": interview3["questions"][0]["expected_criteria"],
        "candidate_answer": interview3["questions"][0]["candidate_answer"],
        "interviewer_score": 8.5,
        "interviewer_notes": interview3["questions"][0]["interviewer_notes"],
        "ai_evaluation": {
            "technical_score": 4.6,
            "correct_concepts": [
                "Atomic data values (1NF high-level intuition)",
                "Read-optimization rationale for de-normalization"
            ],
            "incorrect_concepts": [
                "Equating 3NF simply to foreign key connections rather than transitive functional dependency elimination (X -> Y, Y -> Z)"
            ],
            "missing_concepts": [
                "Formal definition of functional dependencies",
                "2NF partial functional dependency elimination requirement",
                "Boyce-Codd Normal Form (BCNF) condition where every determinant is a super key",
                "Concrete normalization schema example"
            ],
            "alternative_valid_approaches": [],
            "explanation": "Candidate exhibited surface-level, colloquial familiarity with database normalization but lacked formal computer science rigor. Omitted functional dependency definitions, composite key nuances, and BCNF entirely.",
            "potential_discrepancy": True,
            "review_recommendation": "Flagged for Grade Inflation / Positive Halo Effect: Candidate scored only 4.6/10 on technical substance, yet interviewer assigned 8.5/10 with notes emphasizing soft traits ('confidence', 'top university') over technical criteria."
        },
        "discrepancy": {
            "detected": True,
            "type": "GRADE_INFLATION",
            "severity": "HIGH",
            "score_delta": 3.9,
            "evidence": "Interviewer assigned 8.5/10 despite notable gaps in candidate's technical response (AI Technical Score: 4.6/10, with 4 missing core concepts). Potential positive halo effect or relaxed technical evaluation.",
            "bias_category": "Lenient Calibration / Halo Effect"
        },
        "evaluated_at": now - timedelta(days=1),
        "evaluated_by": "BiasGuard AI Engine",
        "model_used": "BiasGuard AI Evaluator (gpt-4o-mini)"
    }
    evaluations_col.insert_one(eval3_q1)
    sync_interview_report(int3_id)

    # 6. Seed Training Datasets (Expert Ground Truth)
    ds_col = get_training_datasets_collection()
    ds_col.delete_many({})
    
    training_examples = [
        {
            "question_text": "Given an array of integers and an integer target, how would you find indices of two numbers that sum up to target?",
            "domain": "DSA",
            "expected_concepts": ["Two-pointer pass", "O(1) auxiliary space", "Sorting trade-off"],
            "expected_criteria": ["Hash map lookup", "Two pointer pass", "O(1) space"],
            "candidate_answer": "In our memory-constrained embedded system, allocating an auxiliary hash map of O(N) isn't acceptable. By sorting the array in O(n log n), we can use a two-pointer pass (left/right) to achieve strict O(1) space complexity.",
            "expert_score": 8.5,
            "correctness_label": "alternative_valid_approach",
            "expert_explanation": "Valid engineering trade-off choosing O(1) space over O(n) hash table. Fully mathematically sound.",
            "alternative_approaches": ["Two-pointer pass on sorted array"],
            "validated": True,
            "source": "curated_expert",
            "created_at": now - timedelta(days=20),
            "updated_at": now - timedelta(days=20)
        },
        {
            "question_text": "Given an array of integers and an integer target, how would you find indices of two numbers that sum up to target?",
            "domain": "DSA",
            "expected_concepts": ["Single-pass hash map", "Complement calculation", "O(n) time", "O(n) space"],
            "expected_criteria": ["Hash map lookup", "O(1) space", "Linear time"],
            "candidate_answer": "We iterate through the array once and store each number and its index in a hash map. For each number x, we check if target - x is already in the map. This achieves O(n) time and O(n) space.",
            "expert_score": 9.5,
            "correctness_label": "correct",
            "expert_explanation": "Canonical optimal solution with clear Big-O analysis.",
            "alternative_approaches": ["Sorting with two pointers"],
            "validated": True,
            "source": "curated_expert",
            "created_at": now - timedelta(days=19),
            "updated_at": now - timedelta(days=19)
        },
        {
            "question_text": "Explain Python's Global Interpreter Lock (GIL) and CPU parallelism.",
            "domain": "Python",
            "expected_concepts": ["CPython mutex", "Reference counting protection", "Multiprocessing for CPU bound", "GIL release on I/O"],
            "expected_criteria": ["Reference counting", "Mutex", "Multiprocessing"],
            "candidate_answer": "The GIL is a mutex in CPython that prevents multiple native threads from executing bytecode at once to protect reference counting. For heavy CPU work, you must spawn separate processes via multiprocessing.",
            "expert_score": 8.8,
            "correctness_label": "correct",
            "expert_explanation": "Clear, technically accurate explanation of memory management and concurrency.",
            "alternative_approaches": ["Subinterpreters", "Cython C-extensions"],
            "validated": True,
            "source": "curated_expert",
            "created_at": now - timedelta(days=18),
            "updated_at": now - timedelta(days=18)
        },
        {
            "question_text": "Explain Java HashMap collision handling and the equals/hashCode contract.",
            "domain": "Java",
            "expected_concepts": ["Array of Node buckets", "Treeify threshold 8", "Red-black tree O(log n)", "equals and hashCode contract"],
            "expected_criteria": ["Treeification", "Red-black tree", "equals/hashCode"],
            "candidate_answer": "In Java 8, buckets are arrays of Nodes. On collision, linked lists form, which treeify into Red-Black Trees at 8 elements (O(log n)). Overriding equals() without hashCode() breaks the contract and get() fails to locate the bucket.",
            "expert_score": 9.5,
            "correctness_label": "correct",
            "expert_explanation": "Comprehensive mastery of JVM internals, treeification conditions, and collection contracts.",
            "alternative_approaches": ["ConcurrentHashMap CAS-striping"],
            "validated": True,
            "source": "curated_expert",
            "created_at": now - timedelta(days=17),
            "updated_at": now - timedelta(days=17)
        },
        {
            "question_text": "Write a query to retrieve the second highest salary from an Employee table without using LIMIT or TOP.",
            "domain": "SQL",
            "expected_concepts": ["WHERE salary < subquery", "MAX aggregation", "NULL handling"],
            "expected_criteria": ["MAX subquery", "DENSE_RANK()", "NULL handling"],
            "candidate_answer": "SELECT MAX(salary) FROM Employee WHERE salary < (SELECT MAX(salary) FROM Employee); Handles ties correctly and yields NULL if fewer than two distinct salaries exist.",
            "expert_score": 9.0,
            "correctness_label": "correct",
            "expert_explanation": "Standard ANSI-SQL compatible query handling edge cases gracefully.",
            "alternative_approaches": ["DENSE_RANK() OVER (ORDER BY salary DESC)"],
            "validated": True,
            "source": "curated_expert",
            "created_at": now - timedelta(days=16),
            "updated_at": now - timedelta(days=16)
        },
        {
            "question_text": "What is Database Normalization? Walk through 1NF, 2NF, 3NF, and BCNF with examples.",
            "domain": "DBMS",
            "expected_concepts": ["Atomic attributes", "Partial dependency removal", "Transitive dependency elimination", "Super key determinant BCNF"],
            "expected_criteria": ["1NF atomic", "2NF partial", "3NF transitive", "BCNF super key"],
            "candidate_answer": "Normalization is basically making sure data isn't repeated. In 1NF you don't put commas in cells. In 2NF you make sure tables have primary keys. In 3NF you connect tables with foreign keys so data is clean.",
            "expert_score": 4.5,
            "correctness_label": "incorrect",
            "expert_explanation": "Colloquial description lacking formal functional dependency rigor. Confuses 3NF with foreign keys.",
            "alternative_approaches": [],
            "validated": True,
            "source": "curated_expert",
            "created_at": now - timedelta(days=15),
            "updated_at": now - timedelta(days=15)
        },
        {
            "question_text": "What is Deadlock in operating systems? State the four Coffman conditions.",
            "domain": "Operating Systems",
            "expected_concepts": ["Mutual Exclusion", "Hold and Wait", "No Preemption", "Circular Wait", "Lock ordering prevention"],
            "expected_criteria": ["Mutual Exclusion", "Hold and wait", "Circular wait", "Lock hierarchy"],
            "candidate_answer": "Deadlock requires 4 Coffman conditions: Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait. You can eliminate deadlock entirely by imposing a strict global ordering on lock acquisition to break circular wait.",
            "expert_score": 9.5,
            "correctness_label": "correct",
            "expert_explanation": "Precise formulation of Coffman conditions and global lock ordering prevention strategy.",
            "alternative_approaches": ["Banker's Algorithm avoidance", "tryLock timeouts with rollback"],
            "validated": True,
            "source": "curated_expert",
            "created_at": now - timedelta(days=14),
            "updated_at": now - timedelta(days=14)
        }
    ]
    ds_col.insert_many(training_examples)

    # 7. Seed Initial Human Feedback Entry
    fb_col = get_evaluation_feedbacks_collection()
    fb_col.delete_many({})
    initial_feedback = {
        "evaluation_id": str(eval1_q1["_id"]),
        "interview_id": int1_id,
        "question_id": int1_q1_id,
        "candidate_name": candidates[0]["name"],
        "domain": "DSA",
        "question_text": interview1["questions"][0]["question_text"],
        "candidate_answer": interview1["questions"][0]["candidate_answer"],
        "original_ai_score": 8.6,
        "original_ai_explanation": "Candidate demonstrated advanced algorithmic maturity by justifying the Two-Pointer paradigm.",
        "original_ai_concepts": {
            "correct_concepts": ["Two-pointer directional traversal", "O(1) space constraint"],
            "alternative_valid_approaches": ["Two-pointer pass on sorted array"]
        },
        "expert_score": 8.8,
        "expert_explanation": "Candidate correctly defended a viable alternative paradigm. The interviewer was overly rigid in demanding hash map.",
        "expert_correct_concepts": ["Two-pointer pass", "O(1) auxiliary space", "Sorting trade-off"],
        "expert_missing_concepts": ["Original index tracking caveat"],
        "expert_incorrect_concepts": [],
        "is_alternative_approach": True,
        "alternative_approach_name": "Two-pointer pass with bounded O(1) space",
        "feedback_notes": "Confirmed as calibration benchmark. Approved for prompt & dataset continuous training.",
        "reviewed_by": "David Chen (VP Eng)",
        "status": "approved",
        "promoted_to_dataset": True,
        "created_at": now - timedelta(days=4),
        "updated_at": now - timedelta(days=4)
    }
    fb_col.insert_one(initial_feedback)

    # 8. Seed Reference Embeddings
    from app.services.rag_service import seed_default_rag_references
    seed_default_rag_references()

    return {
        "status": "success",
        "message": "Database successfully seeded with interviews, candidates, AI evaluations, training dataset, and RAG vector store!",
        "seeded_users": [
            {"email": "interviewer@biasguard.ai", "role": "interviewer", "password": "password123"},
            {"email": "admin@biasguard.ai", "role": "admin", "password": "admin123"}
        ],
        "interviews_count": 3,
        "candidates_count": 3,
        "training_examples_count": len(training_examples),
        "feedbacks_count": 1
    }
