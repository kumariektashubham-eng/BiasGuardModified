import pytest
import jwt
import calendar
from datetime import datetime, timezone
from bson import ObjectId

from app.services.livekit_service import (
    generate_interviewer_livekit_token,
    generate_candidate_livekit_token,
    get_livekit_connection_info,
    check_livekit_service_status,
    get_room_name,
    get_clean_livekit_credentials,
    verify_livekit_config
)
from app.routes.livekit_route import resolve_interview_document

def test_room_name_formatting():
    # Tests standard, prefixed, and stripped IDs
    assert get_room_name("6b0228e65bef4f2056afb731") == "interview_6b0228e65bef4f2056afb731"
    assert get_room_name("interview_6b0228e65bef4f2056afb731") == "interview_6b0228e65bef4f2056afb731"
    assert get_room_name("  afb731  ") == "interview_afb731"

def test_credential_sanitization(monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "  https://example.livekit.cloud/  ")
    monkeypatch.setenv("LIVEKIT_API_KEY", "  \"API_test_key_123\"  ")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "  'secret_value_xyz'  ")

    url, key, secret = get_clean_livekit_credentials()
    assert url.startswith("wss://")
    assert key == "API_test_key_123"
    assert secret == "secret_value_xyz"

def test_interviewer_livekit_token_claims():
    interview_id = "6b0228e65bef4f2056afb731"
    token_str = generate_interviewer_livekit_token(
        interview_id=interview_id,
        user_id="user_admin",
        user_name="Lead Interviewer",
        ttl_hours=2
    )
    assert isinstance(token_str, str)
    assert len(token_str) > 50

    claims = jwt.decode(token_str, options={"verify_signature": False})
    now_ts = calendar.timegm(datetime.now(timezone.utc).utctimetuple())

    assert claims["sub"] == "interviewer_user_admin"
    assert claims["name"] == "Lead Interviewer"
    assert "video" in claims
    assert claims["video"]["room"] == f"interview_{interview_id}"
    assert claims["video"]["roomJoin"] is True
    assert claims["video"]["canPublish"] is True
    assert claims["video"]["canSubscribe"] is True
    assert claims["video"]["canPublishData"] is True
    assert claims["video"]["roomAdmin"] is True
    assert claims["video"]["roomRecord"] is True

    # Clock skew resistance: nbf should be backdated (nbf <= now)
    assert claims["nbf"] <= now_ts
    assert now_ts - claims["nbf"] >= 50  # Roughly 60s backdated
    # TTL should be approximately 2 hours ahead
    assert claims["exp"] - now_ts >= 7100

def test_candidate_livekit_token_claims():
    interview_id = "6b0228e65bef4f2056afb731"
    token_str = generate_candidate_livekit_token(
        interview_id=interview_id,
        candidate_id="cand_456",
        candidate_name="Jane Doe",
        ttl_hours=2
    )
    assert isinstance(token_str, str)
    assert len(token_str) > 50

    claims = jwt.decode(token_str, options={"verify_signature": False})
    now_ts = calendar.timegm(datetime.now(timezone.utc).utctimetuple())

    assert claims["sub"] == "candidate_cand_456"
    assert claims["name"] == "Jane Doe"
    assert "video" in claims
    assert claims["video"]["room"] == f"interview_{interview_id}"
    assert claims["video"]["roomJoin"] is True
    assert claims["video"]["canPublish"] is True
    assert claims["video"]["canSubscribe"] is True
    assert claims["video"]["canPublishData"] is True
    assert claims["video"].get("roomAdmin", False) is False

    # Clock skew resistance
    assert claims["nbf"] <= now_ts
    assert now_ts - claims["nbf"] >= 50
    assert claims["exp"] - now_ts >= 7100

def test_interviewer_and_candidate_share_identical_room():
    interview_id = "6b0228e65bef4f2056afb731"
    tok_int = generate_interviewer_livekit_token(interview_id, "interviewer1")
    tok_cand = generate_candidate_livekit_token(interview_id, "candidate1")

    claims_int = jwt.decode(tok_int, options={"verify_signature": False})
    claims_cand = jwt.decode(tok_cand, options={"verify_signature": False})

    # Crucial guarantee: exact same room name so both participants meet in the same room
    assert claims_int["video"]["room"] == claims_cand["video"]["room"]
    assert claims_int["video"]["room"] == "interview_6b0228e65bef4f2056afb731"
    # Identities must be distinct
    assert claims_int["sub"] != claims_cand["sub"]

def test_verify_livekit_config_detects_placeholders(monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "wss://example.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_KEY", "devkey")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "secret_key_biasguard_livekit_video_2026")

    res = verify_livekit_config()
    assert len(res["warnings"]) >= 2
    assert any("LIVEKIT_API_KEY" in w for w in res["warnings"])
    assert any("LIVEKIT_API_SECRET" in w for w in res["warnings"])

def test_verify_livekit_config_detects_swapped_credentials(monkeypatch):
    # Simulated swapped credentials: key is long, secret starts with API
    monkeypatch.setenv("LIVEKIT_URL", "wss://example.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_KEY", "very_long_secret_string_that_is_in_the_key_field_here_123456789")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "API_key_in_secret_slot")

    res = verify_livekit_config()
    assert any("swapped" in w for w in res["warnings"])

def test_verify_livekit_config_detects_missing_wss(monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "http://insecure-domain.com")
    monkeypatch.setenv("LIVEKIT_API_KEY", "API123456789")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "valid_secret_key_long_enough_123456789")

    # get_clean_livekit_credentials converts http to ws://, which is not wss://
    res = verify_livekit_config()
    assert any("wss://" in w for w in res["warnings"])

def test_resolve_interview_document_by_objectid_and_suffix():
    class MockCollection:
        def __init__(self):
            self.docs = [
                {"_id": ObjectId("6b0228e65bef4f2056afb731"), "title": "Target Interview"}
            ]

        def find_one(self, query):
            for doc in self.docs:
                if "_id" in query and query["_id"] == doc["_id"]:
                    return doc
            return None

        def find(self, query, projection):
            return [{"_id": d["_id"]} for d in self.docs]

    col = MockCollection()

    # 1. By full 24-char ObjectId
    d1 = resolve_interview_document("6b0228e65bef4f2056afb731", col)
    assert d1 is not None
    assert str(d1["_id"]) == "6b0228e65bef4f2056afb731"

    # 2. By interview_ prefixed ObjectId
    d2 = resolve_interview_document("interview_6b0228e65bef4f2056afb731", col)
    assert d2 is not None
    assert str(d2["_id"]) == "6b0228e65bef4f2056afb731"

    # 3. By 6-char hex suffix
    d3 = resolve_interview_document("afb731", col)
    assert d3 is not None
    assert str(d3["_id"]) == "6b0228e65bef4f2056afb731"

    # 4. Non-existent returns None
    d4 = resolve_interview_document("nonexistent999", col)
    assert d4 is None
