import pytest
from datetime import datetime, timedelta, timezone
from app.services.email_service import (
    generate_invitation_token,
    hash_token,
    is_token_expired,
    build_email_template,
    send_interview_invitation
)

def test_invitation_token_generation_and_hashing():
    raw_token, token_hash, expires_at = generate_invitation_token(expiry_hours=24)
    assert len(raw_token) >= 32
    assert len(token_hash) == 64  # SHA-256 is 64 hex characters
    assert hash_token(raw_token) == token_hash
    assert expires_at > datetime.now(timezone.utc)
    assert not is_token_expired(expires_at)

def test_token_expiration_detection():
    past_time = datetime.now(timezone.utc) - timedelta(hours=2)
    assert is_token_expired(past_time) is True

    future_time = datetime.now(timezone.utc) + timedelta(hours=2)
    assert is_token_expired(future_time) is False

def test_email_template_generation():
    raw_token, _, expires_at = generate_invitation_token()
    invite_url = f"http://localhost:5173/interview-room/{raw_token}"
    plain_text, html_content = build_email_template(
        candidate_name="Alice Johnson",
        interview_title="Senior Java Engineer",
        domains=["Java", "Spring Boot", "DSA"],
        invite_url=invite_url,
        expires_at=expires_at
    )
    assert "Alice Johnson" in plain_text
    assert "Senior Java Engineer" in plain_text
    assert invite_url in plain_text
    assert "Java" in html_content
    assert "Spring Boot" in html_content
    assert "Join Technical Interview" in html_content

@pytest.mark.anyio
async def test_send_invitation_console_mode():
    raw_token, _, _ = generate_invitation_token()
    result = await send_interview_invitation(
        candidate_name="Bob Smith",
        candidate_email="bob.smith@example.com",
        interview_title="Python Systems Architect",
        domains=["Python", "Distributed Systems"],
        raw_token=raw_token,
        interview_id="test_interview_123"
    )
    assert result["status"] in ("sent_console", "sent", "logged_fallback")
    assert result["recipient"] == "bob.smith@example.com"
    assert raw_token in result["invite_url"]
