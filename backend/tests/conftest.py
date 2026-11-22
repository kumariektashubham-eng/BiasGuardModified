import pytest
import asyncio
from app.config import settings
from app.database import init_db, close_db, get_users_collection
from app.routes.seed import seed_database

@pytest.fixture(scope="session", autouse=True)
def configure_test_database():
    """
    Ensures test suite runs against local test database if MONGODB_URI
    contains the '<db_password>' Atlas template placeholder.
    """
    orig_uri = settings.MONGODB_URI
    orig_db = settings.DATABASE_NAME
    orig_mdb = settings.MONGODB_DB_NAME

    # Always route automated test runs to local MongoDB to ensure fast, isolated, offline execution
    settings.MONGODB_URI = "mongodb://localhost:27017"
    settings.DATABASE_NAME = "biasguard_db"
    settings.MONGODB_DB_NAME = "biasguard_db"
    init_db()
    users_col = get_users_collection()
    if users_col.count_documents({}) == 0:
        asyncio.run(seed_database())

    yield

    settings.MONGODB_URI = orig_uri
    settings.DATABASE_NAME = orig_db
    settings.MONGODB_DB_NAME = orig_mdb
    close_db()
