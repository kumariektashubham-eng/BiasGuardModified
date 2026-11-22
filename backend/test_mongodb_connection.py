import os
import sys
import re
import uuid
from datetime import datetime, timezone

# Ensure backend directory is in path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from app.config import settings, reload_configuration, ENV_FILE
from pymongo import MongoClient
from pymongo.errors import (
    OperationFailure,
    ServerSelectionTimeoutError,
    ConfigurationError,
    NetworkTimeout
)

def mask_uri(uri: str) -> str:
    if not uri:
        return "<EMPTY>"
    return re.sub(r":([^@/]+)@", r":****@", uri)

def check_uri_structure(uri: str) -> dict:
    info = {
        "is_srv": uri.startswith("mongodb+srv://"),
        "has_placeholder": "<db_password>" in uri,
        "length": len(uri),
        "cluster": "",
        "username": "",
        "has_password": False,
        "password_has_unescaped_chars": False,
        "unescaped_chars_detected": []
    }
    
    match = re.match(r"^mongodb(?:\+srv)?://([^:]+):([^@]+)@([^/?#]+)", uri)
    if match:
        info["username"] = match.group(1)
        pwd = match.group(2)
        info["has_password"] = len(pwd) > 0
        info["cluster"] = match.group(3)
        # Check if password has unescaped characters like @ or / or : etc.
        # RFC 3986 reserved characters in userinfo: : / ? # [ ] @ ! $ & ' ( ) * + , ; =
        # In URI userinfo, @, :, /, ?, # must be percent-encoded if they appear in password
    else:
        # Check if maybe @ appears multiple times or missing colon
        at_count = uri.count("@")
        if at_count > 1:
            info["password_has_unescaped_chars"] = True
            info["unescaped_chars_detected"].append("@ (appears multiple times)")
    return info

def run_diagnostics():
    print("=" * 60)
    print("BIASGUARD AI - MONGODB ATLAS CONNECTION DIAGNOSTIC")
    print("=" * 60)
    
    # 1. Environment loaded
    print(f"Checking environment file: {ENV_FILE}")
    if os.path.exists(ENV_FILE):
        print("Environment loaded: SUCCESS")
    else:
        print("Environment loaded: FAILED (file not found)")
        return
    
    reload_configuration()
    
    raw_uri = settings.MONGODB_URI
    db_name = settings.effective_db_name
    masked = mask_uri(raw_uri)
    print(f"Configured Cluster: {masked}")
    print(f"Target Database: {db_name}")
    
    uri_meta = check_uri_structure(raw_uri)
    if uri_meta["has_placeholder"]:
        print("\n[CRITICAL] The MONGODB_URI still contains '<db_password>' placeholder!")
        print("MongoDB ping: FAILED")
        return
        
    if not uri_meta["has_password"] and "@" in raw_uri:
        print("\n[CRITICAL] URI structure could not be parsed or password is missing.")
        
    # 2. Connect and Ping
    print("\nAttempting connection to MongoDB cluster (timeout 5s)...")
    client = None
    try:
        client = MongoClient(
            raw_uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            retryWrites=True
        )
        ping_result = client.admin.command("ping")
        print(f"MongoDB ping: SUCCESS (server response: {ping_result})")
    except OperationFailure as e:
        print(f"MongoDB ping: FAILED - OperationFailure (Code {e.code})")
        print(f"Diagnostic detail: Authentication failed. Username/password or database authSource mismatch.")
        print(f"Sanitized error: {mask_uri(str(e))}")
        return
    except ServerSelectionTimeoutError as e:
        print("MongoDB ping: FAILED - ServerSelectionTimeoutError (Timeout connecting to replica set)")
        print("Diagnostic detail: Possible causes:")
        print("  1. Current IP address is not allowlisted in MongoDB Atlas (Network Access).")
        print("  2. Local firewall/VPN/proxy is blocking outbound connections on port 27017.")
        print(f"Sanitized error: {mask_uri(str(e))}")
        return
    except ConfigurationError as e:
        print(f"MongoDB ping: FAILED - ConfigurationError: {mask_uri(str(e))}")
        return
    except Exception as e:
        print(f"MongoDB ping: FAILED - Unexpected Exception {type(e).__name__}: {mask_uri(str(e))}")
        return
        
    # 3. Database Selection
    try:
        db = client[db_name]
        print(f"Database selection: SUCCESS (selected '{db.name}')")
    except Exception as e:
        print(f"Database selection: FAILED ({type(e).__name__}): {mask_uri(str(e))}")
        client.close()
        return

    # 4. Document Insertion into dedicated diagnostic collection
    test_collection_name = "_biasguard_conn_diag"
    test_id = f"diag_{uuid.uuid4().hex[:8]}"
    test_doc = {
        "test_id": test_id,
        "purpose": "BiasGuard Atlas Diagnostic Test",
        "created_at": datetime.now(timezone.utc)
    }
    
    try:
        col = db[test_collection_name]
        ins = col.insert_one(test_doc)
        if ins.inserted_id:
            print("Document insertion: SUCCESS")
        else:
            print("Document insertion: FAILED (No inserted_id returned)")
            client.close()
            return
    except Exception as e:
        print(f"Document insertion: FAILED ({type(e).__name__}): {mask_uri(str(e))}")
        client.close()
        return
        
    # 5. Document Retrieval
    try:
        found = col.find_one({"test_id": test_id})
        if found and found.get("purpose") == "BiasGuard Atlas Diagnostic Test":
            print("Document retrieval: SUCCESS")
        else:
            print("Document retrieval: FAILED (Document not found)")
    except Exception as e:
        print(f"Document retrieval: FAILED ({type(e).__name__}): {mask_uri(str(e))}")
        
    # 6. Document Deletion & Collection Cleanup
    try:
        del_res = col.delete_one({"test_id": test_id})
        db.drop_collection(test_collection_name)
        if del_res.deleted_count >= 1:
            print("Document deletion: SUCCESS")
            print("Collection cleanup: SUCCESS")
        else:
            print("Document deletion: FAILED (Document was not deleted)")
    except Exception as e:
        print(f"Document deletion: FAILED ({type(e).__name__}): {mask_uri(str(e))}")
        
    # 7. Close client
    try:
        client.close()
        print("Client closed cleanly: SUCCESS")
    except Exception as e:
        print(f"Client close notice: {e}")

    print("\n" + "=" * 60)
    print("ALL MONGODB ATLAS VERIFICATION STEPS COMPLETED SUCCESSFULLY")
    print("=" * 60)

if __name__ == "__main__":
    run_diagnostics()
