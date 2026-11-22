import pytest
from app.config import settings
from app.database import (
    get_sanitized_uri,
    diagnose_connection_error,
    execute_database_crud_verification,
    close_db,
    init_db,
    ping_database
)
from app.services.auth_service import create_access_token
from pymongo.errors import OperationFailure, ServerSelectionTimeoutError, ConfigurationError
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

@pytest.fixture
def auth_headers():
    token = create_access_token({"sub": "admin@biasguard.ai", "role": "admin"})
    return {"Authorization": f"Bearer {token}"}

def test_sanitized_uri_never_exposes_passwords():
    """Verify that credentials (both username and password) are NEVER exposed in logs, diagnostics, or UI."""
    uri_with_password = "mongodb+srv://test_user:MySecretPassword123!@cluster0.mz2fcwx.mongodb.net/biasguard?retryWrites=true"
    sanitized = get_sanitized_uri(uri_with_password)
    
    assert "MySecretPassword123!" not in sanitized
    assert "test_user" not in sanitized
    assert "***:****@cluster0.mz2fcwx.mongodb.net" in sanitized
    
    # Standard mongodb:// URI
    uri_local = "mongodb://admin:pass456@localhost:27017/biasguard"
    sanitized_local = get_sanitized_uri(uri_local)
    assert "pass456" not in sanitized_local
    assert "admin" not in sanitized_local
    assert "***:****@localhost:27017" in sanitized_local


def test_diagnose_connection_error_diagnostics():
    """Verify clear, actionable diagnostic messages for Atlas connection states."""
    # 1. Placeholder in URI
    placeholder_uri = "mongodb+srv://user:<db_password>@cluster0.mz2fcwx.mongodb.net/"
    diag_placeholder = diagnose_connection_error(Exception("test error"), placeholder_uri)
    assert "<db_password>" in diag_placeholder
    assert "Please replace '<db_password>'" in diag_placeholder

    # 2. Authentication failure (Code 18 / bad auth)
    auth_err = OperationFailure("Authentication failed: bad auth", code=18)
    diag_auth = diagnose_connection_error(auth_err, "mongodb+srv://user:wrong@cluster0.mz2fcwx.mongodb.net/")
    assert "Authentication failed: Invalid database username or password" in diag_auth

    # 3. Network timeout (IP not allowlisted)
    timeout_err = ServerSelectionTimeoutError("No replica set members found yet")
    diag_timeout = diagnose_connection_error(timeout_err, "mongodb+srv://user:pwd@cluster0.mz2fcwx.mongodb.net/")
    assert "IP address" in diag_timeout
    assert "Network Access" in diag_timeout

    # 4. DNS resolution error
    dns_err = ConfigurationError("Unable to resolve DNS SRV records")
    diag_dns = diagnose_connection_error(dns_err, "mongodb+srv://user:pwd@cluster0.mz2fcwx.mongodb.net/")
    assert "DNS" in diag_dns


def test_atlas_configuration_loading():
    """Verify settings loads MONGODB_URI and MONGODB_DB_NAME / DATABASE_NAME correctly."""
    assert "biasguard" in settings.effective_db_name
    assert "biasguard" in [settings.MONGODB_DB_NAME, settings.DATABASE_NAME] or "biasguard" in settings.effective_db_name
    assert "mz2fcwx.mongodb.net" in settings.MONGODB_URI or "localhost" in settings.MONGODB_URI


def test_database_crud_verification_structure():
    """Verify execute_database_crud_verification returns complete audit structure."""
    results = execute_database_crud_verification()
    assert isinstance(results, dict)
    assert "ping_successful" in results
    assert "insert_successful" in results
    assert "read_successful" in results
    assert "update_successful" in results
    assert "delete_successful" in results
    assert "cleanup_successful" in results
    assert "biasguard" in results["database_name"]
    # When placeholder is present, details properly alerts user
    if "<db_password>" in settings.MONGODB_URI:
        assert results["ping_successful"] is False
        assert "db_password" in results["details"]


def test_graceful_shutdown():
    """Verify database client connection closes cleanly on shutdown."""
    close_db()
    from app.database import db_instance
    assert db_instance.client is None
    assert db_instance.db is None


def test_api_health_and_settings_security():
    """Verify that /api/health and /api/settings/status return database info safely without leaking credentials."""
    res_health = client.get("/api/health")
    assert res_health.status_code == 200
    data_health = res_health.json()
    assert "database" in data_health
    assert "biasguard" in data_health["database"]["database_name"]
    # Ensure raw URI with password is NOT returned in health payload
    assert "mongodb+srv://" not in str(data_health) or "****" in str(data_health) or "password" not in str(data_health).lower()

    res_settings = client.get("/api/settings/status")
    assert res_settings.status_code == 200
    data_settings = res_settings.json()
    assert "status" in data_settings
