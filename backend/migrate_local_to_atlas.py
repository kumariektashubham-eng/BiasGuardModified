import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pymongo import MongoClient
from app.config import settings, reload_configuration
from app.database import get_sanitized_uri, ping_database, close_db

def migrate():
    reload_configuration()
    print("=" * 70)
    print("      BiasGuard AI - Local to Atlas Database Migration")
    print("=" * 70)

    # 1. Connect to Local MongoDB
    try:
        local_client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=2000)
        local_db = local_client["biasguard_db"]
        local_collections = local_db.list_collection_names()
        print(f"[OK] Connected to local MongoDB (biasguard_db). Collections found: {len(local_collections)}")
    except Exception as e:
        print(f"[ERROR] Could not connect to local MongoDB: {e}")
        return False

    # 2. Check Atlas Connection
    connected, msg = ping_database()
    if not connected:
        print(f"[ERROR] Cannot migrate to Atlas yet: {msg}")
        return False

    atlas_db_name = settings.effective_db_name
    atlas_client = MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=5000)
    atlas_db = atlas_client[atlas_db_name]
    print(f"[OK] Connected to MongoDB Atlas! Target database: '{atlas_db_name}'")
    print("-" * 70)

    migrated_counts = {}
    for col_name in local_collections:
        if col_name.startswith("system."):
            continue
        docs = list(local_db[col_name].find({}))
        if not docs:
            continue
        
        # Upsert documents by _id into Atlas
        count = 0
        for doc in docs:
            atlas_db[col_name].replace_one({"_id": doc["_id"]}, doc, upsert=True)
            count += 1
        migrated_counts[col_name] = count
        print(f"  * {col_name:25} -> {count} documents migrated to Atlas")

    print("-" * 70)
    print(f"[SUCCESS] All existing data successfully migrated to MongoDB Atlas database '{atlas_db_name}'!")
    print("You can now refresh MongoDB Atlas -> Data Explorer to see your database and collections.")
    print("=" * 70)
    local_client.close()
    atlas_client.close()
    return True

if __name__ == "__main__":
    success = migrate()
    sys.exit(0 if success else 1)
