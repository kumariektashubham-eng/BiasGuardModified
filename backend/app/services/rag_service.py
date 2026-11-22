import math
import hashlib
import re
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from openai import OpenAI
from app.config import settings
from app.database import get_reference_embeddings_collection, serialize_doc

logger = logging.getLogger("biasguard.rag_service")

# Dimension for offline semantic vector representation
OFFLINE_EMBEDDING_DIM = 256

def generate_embedding(text: str) -> List[float]:
    """
    Generates vector embeddings for a given text.
    Uses OpenAI text-embedding-3-small if API key is active.
    Falls back to deterministic normalized semantic term-frequency n-gram vector for offline mode.
    """
    clean_text = text.strip()
    if not clean_text:
        return [0.0] * OFFLINE_EMBEDDING_DIM

    api_key = settings.OPENAI_API_KEY
    if api_key and "your-" not in api_key and not settings.MOCK_AI_MODE:
        try:
            client = OpenAI(api_key=api_key)
            response = client.embeddings.create(
                model=settings.EMBEDDING_MODEL,
                input=clean_text[:8000]
            )
            return response.data[0].embedding
        except Exception as e:
            logger.warning(f"OpenAI embedding call failed: {e}. Falling back to deterministic semantic vectorizer.")

    # High-quality deterministic semantic vectorizer
    return _generate_offline_semantic_vector(clean_text)

def _generate_offline_semantic_vector(text: str) -> List[float]:
    """
    Generates a normalized 256-dimensional semantic vector using hashed token frequencies and character n-grams.
    Produces stable cosine similarity representations for technical text.
    """
    vec = [0.0] * OFFLINE_EMBEDDING_DIM
    words = re.findall(r'\b\w+\b', text.lower())
    
    for i, word in enumerate(words):
        # Unigram hashing
        h = int(hashlib.md5(word.encode('utf-8')).hexdigest(), 16)
        idx = h % OFFLINE_EMBEDDING_DIM
        weight = 1.0 + (0.5 if len(word) > 4 else 0.0)
        vec[idx] += weight

        # Bigram hashing for contextual phrases
        if i < len(words) - 1:
            bigram = f"{word}_{words[i+1]}"
            h2 = int(hashlib.sha256(bigram.encode('utf-8')).hexdigest(), 16)
            idx2 = h2 % OFFLINE_EMBEDDING_DIM
            vec[idx2] += 1.5

    # L2 Normalization to unit length
    magnitude = math.sqrt(sum(v * v for v in vec))
    if magnitude > 0:
        vec = [round(v / magnitude, 6) for v in vec]
    return vec

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Computes cosine similarity between two unit vectors."""
    if not v1 or not v2:
        return 0.0
    dim = min(len(v1), len(v2))
    dot = sum(v1[i] * v2[i] for i in range(dim))
    return max(0.0, min(1.0, float(dot)))

def index_reference_answer(
    domain: str,
    title: str,
    reference_text: str,
    key_concepts: List[str],
    dataset_id: Optional[str] = None,
    source: str = "curated_reference"
) -> Dict[str, Any]:
    """
    Stores a reference answer and its vector embedding in MongoDB.
    """
    col = get_reference_embeddings_collection()
    embedding = generate_embedding(f"{domain} {title}: {reference_text} Concepts: {' '.join(key_concepts)}")
    
    doc = {
        "domain": domain,
        "title": title,
        "reference_text": reference_text,
        "key_concepts": key_concepts,
        "embedding": embedding,
        "embedding_dim": len(embedding),
        "dataset_id": dataset_id,
        "source": source,
        "created_at": datetime.now(timezone.utc)
    }
    
    # Check if duplicate title exists in domain
    existing = col.find_one({"domain": domain, "title": title})
    if existing:
        col.update_one({"_id": existing["_id"]}, {"$set": doc})
        doc["_id"] = existing["_id"]
    else:
        res = col.insert_one(doc)
        doc["_id"] = res.inserted_id
        
    return serialize_doc(doc)

def retrieve_relevant_references(
    candidate_answer: str,
    domain: Optional[str] = None,
    top_k: int = 3
) -> List[Dict[str, Any]]:
    """
    Retrieves the most semantically relevant reference answers for a candidate answer.
    Supports native MongoDB Atlas Vector Search ($vectorSearch) when configured,
    and falls back seamlessly to in-memory cosine similarity search on local MongoDB.
    """
    col = get_reference_embeddings_collection()
    if col.count_documents({}) == 0:
        seed_default_rag_references()

    query_embedding = generate_embedding(candidate_answer)
    
    # Attempt Atlas Vector Search aggregation stage first
    if settings.OPENAI_API_KEY and not settings.MOCK_AI_MODE:
        try:
            pipeline = [
                {
                    "$vectorSearch": {
                        "index": settings.ATLAS_VECTOR_SEARCH_INDEX,
                        "path": "embedding",
                        "queryVector": query_embedding,
                        "numCandidates": 20,
                        "limit": top_k
                    }
                }
            ]
            if domain:
                pipeline[0]["$vectorSearch"]["filter"] = {"domain": domain}
            results = list(col.aggregate(pipeline))
            if results:
                return [serialize_doc(r) for r in results]
        except Exception as e:
            logger.info(f"Atlas Vector Search pipeline unavailable or index pending ({e}). Falling back to local vector similarity.")

    # Local / in-memory cosine similarity retrieval
    filter_q = {"domain": domain} if domain else {}
    candidates = list(col.find(filter_q))
    if not candidates and domain:
        # Fallback to search across all domains
        candidates = list(col.find({}))
        
    scored = []
    for doc in candidates:
        emb = doc.get("embedding", [])
        score = cosine_similarity(query_embedding, emb)
        scored.append((score, doc))
        
    scored.sort(key=lambda x: x[0], reverse=True)
    top_results = []
    for score, doc in scored[:top_k]:
        serialized = serialize_doc(doc)
        serialized["similarity_score"] = round(score, 3)
        top_results.append(serialized)
        
    return top_results

def seed_default_rag_references():
    """Seeds rich, expert-approved reference answers and alternative paradigms into the vector store."""
    col = get_reference_embeddings_collection()
    if col.count_documents({}) > 0:
        return

    defaults = [
        {
            "domain": "DSA",
            "title": "Two Sum: Memory-Constrained Two-Pointer Paradigm",
            "reference_text": "When heap allocations or auxiliary O(N) memory are restricted, sorting the array in O(n log n) and running a two-pointer pass inward from both boundaries achieves strict O(1) auxiliary space without hash collisions.",
            "key_concepts": ["Two-pointer pass", "O(1) auxiliary space", "Sorting trade-off", "Bounded memory"]
        },
        {
            "domain": "DSA",
            "title": "Two Sum: Canonical Linear Hash Map Lookup",
            "reference_text": "A single-pass hash map maintains seen values and their indices. For each element x, checking if target - x exists provides average O(1) lookup and O(n) overall time with O(n) space trade-off.",
            "key_concepts": ["Hash map lookup", "O(n) time complexity", "O(n) space complexity", "Complement calculation"]
        },
        {
            "domain": "Python",
            "title": "Python GIL & Concurrency Execution Model",
            "reference_text": "The CPython Global Interpreter Lock protects reference counting memory management from concurrent mutation race conditions. CPU-bound concurrency requires multiprocessing or subinterpreters; I/O operations release the GIL.",
            "key_concepts": ["Reference counting", "Mutex lock", "Multiprocessing for CPU bound", "GIL release on I/O"]
        },
        {
            "domain": "Java",
            "title": "Java HashMap Collision Handling & Treeification",
            "reference_text": "In Java 8+, hash collisions in bucket arrays are stored in linked lists until TREEIFY_THRESHOLD (8 items) is reached with table capacity >= 64, transforming into Red-Black Trees for O(log n) worst-case search. Overriding equals() without hashCode() violates the hash bucket contract.",
            "key_concepts": ["Red-Black Tree conversion", "TREEIFY_THRESHOLD = 8", "equals() and hashCode() contract", "Bucket indexing"]
        },
        {
            "domain": "SQL",
            "title": "Second Highest Salary: Subquery vs Window Function",
            "reference_text": "Standard dialect-neutral retrieval uses WHERE salary < (SELECT MAX(salary) FROM Employee) or analytical DENSE_RANK() OVER (ORDER BY salary DESC). Handles ties and returns NULL cleanly if fewer than two distinct salaries exist.",
            "key_concepts": ["DENSE_RANK()", "Correlated subquery", "NULL handling", "Ties resolution"]
        },
        {
            "domain": "DBMS",
            "title": "Database Normalization (1NF through BCNF) & OLAP De-normalization",
            "reference_text": "1NF mandates atomic values. 2NF eliminates partial functional dependencies on composite keys. 3NF removes transitive dependencies (X -> Y, Y -> Z). BCNF requires every determinant to be a super key. De-normalization is deliberately applied in read-heavy analytics/OLAP to avoid expensive JOIN operations.",
            "key_concepts": ["Functional dependencies", "Composite keys", "Super keys", "Transitive dependencies", "OLAP de-normalization trade-off"]
        },
        {
            "domain": "Operating Systems",
            "title": "Coffman Deadlock Conditions & Prevention via Lock Ordering",
            "reference_text": "Deadlock requires four Coffman conditions: Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait. Strict global hierarchical lock ordering breaks circular wait entirely. Operating systems detect cycles via Resource Allocation Graphs.",
            "key_concepts": ["Mutual Exclusion", "Hold and Wait", "Circular Wait", "Lock hierarchy ordering", "Resource Allocation Graph"]
        }
    ]

    for item in defaults:
        index_reference_answer(
            domain=item["domain"],
            title=item["title"],
            reference_text=item["reference_text"],
            key_concepts=item["key_concepts"]
        )
    logger.info(f"Seeded {len(defaults)} reference answers into MongoDB vector collection.")
