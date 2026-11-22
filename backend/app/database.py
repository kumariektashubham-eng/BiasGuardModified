import re
import logging
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import OperationFailure, ServerSelectionTimeoutError, ConfigurationError
from bson import ObjectId
from fastapi import HTTPException, status
from app.config import settings

logger = logging.getLogger("biasguard.database")

def get_sanitized_uri(uri: str) -> str:
    """Masks username and credentials from MongoDB URI for safe logging, diagnostics, and status reporting."""
    if not uri:
        return ""
    # If username:password is present, mask both
    if re.search(r"://[^:]+:[^@]+@", uri):
        return re.sub(r"://([^:]+):([^@]+)@", r"://***:****@", uri)
    # Otherwise mask password only if present
    return re.sub(r":([^@/]+)@", r":****@", uri)

def diagnose_connection_error(e: Exception, uri: str) -> str:
    """Analyzes connection exception to give clear, actionable root cause without leaking credentials."""
    if "<db_password>" in uri:
        return (
            "Authentication placeholder detected: The connection string in backend/.env still contains '<db_password>'. "
            "Please replace '<db_password>' with your actual MongoDB Atlas database user password."
        )
    
    err_str = str(e)
    if isinstance(e, OperationFailure):
        if e.code == 18 or "auth" in err_str.lower() or "authentication failed" in err_str.lower():
            return "Authentication failed: Invalid database username or password for MongoDB Atlas cluster."
        return f"Database operation failure: {get_sanitized_uri(err_str)}"

    if isinstance(e, ServerSelectionTimeoutError):
        return (
            "Network connection timeout: Unable to reach MongoDB cluster within timeout. "
            "Please verify that: 1) Your current IP address is added to the MongoDB Atlas IP Access List (Atlas -> Network Access -> Add IP Address / Allow Access from Anywhere), "
            "and 2) Outbound TLS port 27017 is not blocked by a local firewall or proxy."
        )

    if isinstance(e, ConfigurationError) or "dns" in err_str.lower():
        return f"Configuration / DNS error: Unable to resolve MongoDB cluster SRV records: {get_sanitized_uri(err_str)}"

    return f"Connection error: {get_sanitized_uri(err_str)}"

class Database:
    client: MongoClient = None
    db = None

db_instance = Database()
_last_logged_diag: str = None
_last_check_time: float = 0.0

def init_db() -> bool:
    """
    Initializes MongoDB client, verifies connection with a ping, and creates indexes.
    Handles connection errors gracefully without crashing the application process.
    Returns True if connected successfully, False otherwise.
    """
    global _last_logged_diag
    target_db_name = settings.effective_db_name
    active_uri = settings.clean_mongodb_uri
    sanitized_uri = get_sanitized_uri(active_uri)

    if "<db_password>" in active_uri:
        diag = (
            "Authentication placeholder detected: The connection string in backend/.env still contains '<db_password>'. "
            "Please replace '<db_password>' with your actual MongoDB Atlas database user password."
        )
        db_instance.client = None
        db_instance.db = None
        if _last_logged_diag != diag:
            logger.warning(
                f"MongoDB connection notice: {diag} "
                f"The backend server will remain online in resilient mode."
            )
            _last_logged_diag = diag
        return False

    try:
        db_instance.client = MongoClient(
            active_uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            retryWrites=True
        )
        # Verify connection with standard MongoDB ping command
        db_instance.client.admin.command("ping")
        db_instance.db = db_instance.client[target_db_name]
        logger.info(f"MongoDB connected successfully! Cluster: {sanitized_uri}, database: {target_db_name}")
        _last_logged_diag = None
        
        # Create indexes
        create_indexes()
        return True
    except Exception as e:
        diag = diagnose_connection_error(e, active_uri)
        db_instance.client = None
        db_instance.db = None
        if _last_logged_diag != diag:
            logger.warning(
                f"MongoDB connection notice: {diag} "
                f"The backend server will remain online in resilient mode."
            )
            _last_logged_diag = diag
        return False

def ping_database() -> tuple[bool, str]:
    """
    Executes a standard MongoDB ping command against the cluster.
    Returns (is_connected: bool, message: str) with diagnostic details if failed.
    """
    active_uri = settings.clean_mongodb_uri
    if "<db_password>" in active_uri:
        return False, (
            "Authentication placeholder detected: The connection string in backend/.env still contains '<db_password>'. "
            "Please replace '<db_password>' with your actual MongoDB Atlas database user password."
        )

    if db_instance.client is None or db_instance.db is None:
        try:
            connected = init_db()
            if not connected:
                return False, _last_logged_diag or f"Could not connect to MongoDB at {get_sanitized_uri(active_uri)}"
        except Exception as e:
            return False, diagnose_connection_error(e, active_uri)

    if db_instance.client:
        try:
            db_instance.client.admin.command("ping")
            return True, "MongoDB connected successfully!"
        except Exception as e:
            return False, diagnose_connection_error(e, active_uri)

    return False, f"Not connected to MongoDB at {get_sanitized_uri(active_uri)}"

def check_db_connection() -> tuple[bool, str]:
    """
    Safely probes database connection without throwing exceptions.
    Returns (is_connected: bool, detail_message: str).
    Caches recent failure diagnostic for 4 seconds to avoid blocking HTTP probes.
    """
    global _last_check_time
    import time
    active_uri = settings.clean_mongodb_uri

    if db_instance.client is not None and db_instance.db is not None:
        try:
            db_instance.client.admin.command("ping")
            return True, "Connected"
        except Exception as e:
            return False, diagnose_connection_error(e, active_uri)

    now = time.time()
    if (now - _last_check_time) < 4.0 and _last_logged_diag:
        return False, _last_logged_diag

    _last_check_time = now
    return ping_database()

def close_db():
    """
    Gracefully closes the MongoDB client connection on application shutdown.
    """
    if db_instance.client is not None:
        try:
            db_instance.client.close()
            logger.info("MongoDB client connection closed cleanly.")
        except Exception as e:
            logger.warning(f"Notice while closing MongoDB connection: {e}")
        finally:
            db_instance.client = None
            db_instance.db = None

def get_database():
    """
    Retrieves active database instance. Attempts lazy reconnection if disconnected.
    Raises HTTPException 503 only when a route requires the database and MongoDB is unreachable.
    """
    if db_instance.db is None:
        init_db()
        if db_instance.db is None:
            diag = diagnose_connection_error(Exception("Connection unavailable"), settings.clean_mongodb_uri)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Database service temporarily unavailable: {diag}"
            )
    return db_instance.db

def execute_database_crud_verification(test_collection_name: str = "_atlas_connectivity_test") -> dict:
    """
    Executes a complete, non-destructive CRUD test using a dedicated temporary collection.
    Verifies ping, document insertion, retrieval, update, and deletion against the active database.
    """
    import uuid
    from datetime import datetime, timezone

    results = {
        "ping_successful": False,
        "insert_successful": False,
        "read_successful": False,
        "update_successful": False,
        "delete_successful": False,
        "cleanup_successful": False,
        "database_name": settings.effective_db_name,
        "details": ""
    }

    test_id = f"test_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    try:
        db = get_database()
        col = db[test_collection_name]
        results["database_name"] = db.name

        # 1. Ping
        db.client.admin.command("ping")
        results["ping_successful"] = True

        # 2. Insert
        insert_doc = {
            "test_id": test_id,
            "purpose": "BiasGuard Atlas Verification",
            "status": "pending",
            "created_at": now
        }
        ins_res = col.insert_one(insert_doc)
        results["insert_successful"] = bool(ins_res.inserted_id)

        # 3. Read
        read_doc = col.find_one({"test_id": test_id})
        results["read_successful"] = bool(read_doc and read_doc.get("purpose") == "BiasGuard Atlas Verification")

        # 4. Update
        up_res = col.update_one(
            {"test_id": test_id},
            {"$set": {"status": "verified", "updated_at": datetime.now(timezone.utc)}}
        )
        updated_doc = col.find_one({"test_id": test_id})
        results["update_successful"] = bool(up_res.modified_count == 1 and updated_doc.get("status") == "verified")

        # 5. Delete
        del_res = col.delete_one({"test_id": test_id})
        remaining = col.find_one({"test_id": test_id})
        results["delete_successful"] = bool(del_res.deleted_count == 1 and remaining is None)

        # 6. Cleanup collection
        db.drop_collection(test_collection_name)
        results["cleanup_successful"] = True
        results["details"] = "All database operations (Ping, Insert, Read, Update, Delete) completed successfully on MongoDB Atlas."

    except Exception as e:
        results["details"] = f"Operation failed: {diagnose_connection_error(e, settings.MONGODB_URI)}"
        try:
            col.delete_many({"test_id": test_id})
            db.drop_collection(test_collection_name)
        except Exception:
            pass

    return results

def create_indexes():
    db = db_instance.db
    if db is None:
        return
    try:
        # Unique email for users
        db.users.create_index([("email", ASCENDING)], unique=True)
        # Candidates index by email
        db.candidates.create_index([("email", ASCENDING)])
        # Interviews index by candidate_id and created_at
        db.interviews.create_index([("candidate_id", ASCENDING)])
        db.interviews.create_index([("created_at", DESCENDING)])
        # Evaluations index by interview_id
        db.evaluations.create_index([("interview_id", ASCENDING)])
        # Reports index by interview_id
        db.reports.create_index([("interview_id", ASCENDING)])
        
        # Training Pipeline Indexes
        db.training_datasets.create_index([("domain", ASCENDING)])
        db.training_datasets.create_index([("validated", ASCENDING)])
        db.training_datasets.create_index([("created_at", DESCENDING)])
        
        db.reference_embeddings.create_index([("domain", ASCENDING)])
        
        db.evaluation_feedbacks.create_index([("evaluation_id", ASCENDING)])
        db.evaluation_feedbacks.create_index([("status", ASCENDING)])
        
        db.fine_tuning_jobs.create_index([("created_at", DESCENDING)])
        db.fairness_test_runs.create_index([("created_at", DESCENDING)])
        
        # Audio Recordings Indexes
        db.audio_recordings.create_index([("interview_id", ASCENDING)])
        db.audio_recordings.create_index([("question_id", ASCENDING)])
        db.audio_recordings.create_index([("created_at", DESCENDING)])

        # Score Audit Trail Indexes
        db.score_audits.create_index([("interview_id", ASCENDING)])
        db.score_audits.create_index([("question_id", ASCENDING)])
        db.score_audits.create_index([("timestamp", DESCENDING)])

        logger.info("MongoDB indexes verified/created including AI training pipeline and score audits.")
    except Exception as e:
        logger.warning(f"Error creating indexes: {e}")

def get_users_collection():
    return get_database()["users"]

def get_candidates_collection():
    return get_database()["candidates"]

def get_interviews_collection():
    return get_database()["interviews"]

def get_evaluations_collection():
    return get_database()["evaluations"]

def get_reports_collection():
    return get_database()["reports"]

def get_app_settings_collection():
    return get_database()["app_settings"]

# AI Training & Continuous Improvement Collections
def get_training_datasets_collection():
    return get_database()["training_datasets"]

def get_reference_embeddings_collection():
    return get_database()["reference_embeddings"]

def get_evaluation_feedbacks_collection():
    return get_database()["evaluation_feedbacks"]

def get_fine_tuning_jobs_collection():
    return get_database()["fine_tuning_jobs"]

def get_fairness_test_runs_collection():
    return get_database()["fairness_test_runs"]

def get_audio_recordings_collection():
    return get_database()["audio_recordings"]

def get_score_audits_collection():
    return get_database()["score_audits"]

def serialize_doc(doc):
    """Converts MongoDB BSON document to JSON-serializable dict with id string."""
    if not doc:
        return None
    doc_copy = dict(doc)
    if "_id" in doc_copy:
        doc_copy["id"] = str(doc_copy.pop("_id"))
    for k, v in list(doc_copy.items()):
        if isinstance(v, ObjectId):
            doc_copy[k] = str(v)
        elif isinstance(v, list):
            doc_copy[k] = [serialize_doc(item) if isinstance(item, dict) else str(item) if isinstance(item, ObjectId) else item for item in v]
        elif isinstance(v, dict):
            doc_copy[k] = serialize_doc(v)
    return doc_copy
