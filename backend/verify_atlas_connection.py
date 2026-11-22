import sys
import os

# Add parent directory to sys.path so app imports cleanly
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.config import settings, reload_configuration
from app.database import (
    get_sanitized_uri,
    ping_database,
    execute_database_crud_verification,
    close_db
)

def run_verification():
    print("=" * 70)
    print("      BiasGuard AI - MongoDB Atlas Connection Verification")
    print("=" * 70)

    # Reload from backend/.env
    reload_configuration()
    sanitized_uri = get_sanitized_uri(settings.MONGODB_URI)
    db_name = settings.effective_db_name

    print(f"Target Database : {db_name}")
    print(f"Target Cluster  : {sanitized_uri}")
    print("-" * 70)

    if "<db_password>" in settings.MONGODB_URI:
        print("\n[ACTION REQUIRED] Password placeholder detected!")
        print("  The connection string in 'backend/.env' still contains '<db_password>'.")
        print("  Please open 'backend/.env' in your editor and replace '<db_password>'")
        print("  with your actual MongoDB Atlas database password.")
        print("\n  Format:")
        print("  MONGODB_URI=mongodb+srv://kumariektashubham_db_user:<YOUR_ACTUAL_PASSWORD>@cluster0.mz2fcwx.mongodb.net/")
        print("=" * 70)
        return False

    print("Executing MongoDB Atlas ping command...")
    connected, msg = ping_database()

    if not connected:
        print("\n[FAILED] MongoDB Ping Failed!")
        print(f"  Reason: {msg}")
        print("\nTroubleshooting Atlas Checklist:")
        print("  1. Network Access: Ensure your current IP is added in Atlas (Network Access -> Add IP Address).")
        print("  2. Database Access: Ensure user 'kumariektashubham_db_user' has readWriteAnyDatabase or readWrite@biasguard.")
        print("  3. Password: Ensure special characters in password are URL-encoded if necessary.")
        print("=" * 70)
        return False

    print("\nMongoDB connected successfully!\n")
    print("Testing CRUD operations on dedicated test collection '_atlas_connectivity_test'...")
    crud_results = execute_database_crud_verification("_atlas_connectivity_test")

    print(f"  - Server Ping Check    : {'[PASSED]' if crud_results['ping_successful'] else '[FAILED]'}")
    print(f"  - Document Insertion   : {'[PASSED]' if crud_results['insert_successful'] else '[FAILED]'}")
    print(f"  - Document Retrieval   : {'[PASSED]' if crud_results['read_successful'] else '[FAILED]'}")
    print(f"  - Document Update      : {'[PASSED]' if crud_results['update_successful'] else '[FAILED]'}")
    print(f"  - Document Deletion    : {'[PASSED]' if crud_results['delete_successful'] else '[FAILED]'}")
    print(f"  - Collection Cleanup   : {'[PASSED]' if crud_results['cleanup_successful'] else '[FAILED]'}")

    all_passed = all([
        crud_results["ping_successful"],
        crud_results["insert_successful"],
        crud_results["read_successful"],
        crud_results["update_successful"],
        crud_results["delete_successful"],
        crud_results["cleanup_successful"]
    ])

    print("-" * 70)
    if all_passed:
        print("[SUCCESS] All database read/write/update/delete operations verified on Atlas!")
    else:
        print(f"[WARNING] CRUD verification partial: {crud_results['details']}")

    print("=" * 70)
    close_db()
    return all_passed

if __name__ == "__main__":
    success = run_verification()
    sys.exit(0 if success else 1)
