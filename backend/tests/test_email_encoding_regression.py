import io
import sys
import os
import logging
import pytest
from unittest.mock import patch, MagicMock
from bson import ObjectId

from app.utils.logging_config import SafeStreamHandler, safe_print, configure_safe_logging
from app.services.email_service import (
    send_interview_invitation,
    build_email_template,
    validate_candidate_email
)
from app.config import settings

def test_safe_stream_handler_catches_unicode_encode_error():
    """
    Verifies SafeStreamHandler catches UnicodeEncodeError on strict cp1252 streams
    and logs an ASCII-safe fallback message without raising an exception.
    """
    buffer = io.BytesIO()
    # Create a stream explicitly encoded as cp1252 with strict error handling
    cp1252_stream = io.TextIOWrapper(buffer, encoding="cp1252", errors="strict")

    handler = SafeStreamHandler(cp1252_stream)
    formatter = logging.Formatter("%(levelname)s: %(message)s")
    handler.setFormatter(formatter)

    test_logger = logging.getLogger("test.cp1252.safety")
    test_logger.setLevel(logging.INFO)
    test_logger.handlers = [handler]
    test_logger.propagate = False

    # Log message containing emojis and Unicode characters not representable in cp1252
    problematic_message = "Test banner: \U0001f4e7 [EMAIL] Candidate René – 日本語 and 🛡️ security check"

    # Must NOT raise UnicodeEncodeError
    try:
        test_logger.info(problematic_message)
        cp1252_stream.flush()
    except UnicodeEncodeError as e:
        pytest.fail(f"SafeStreamHandler raised UnicodeEncodeError: {e}")

    output_bytes = buffer.getvalue()
    assert len(output_bytes) > 0
    # Decodes cleanly as cp1252
    decoded_output = output_bytes.decode("cp1252")
    assert "INFO:" in decoded_output
    assert "Candidate Ren" in decoded_output

def test_safe_print_catches_unicode_encode_error(monkeypatch):
    """
    Verifies safe_print catches UnicodeEncodeError on strict cp1252 stdout.
    """
    buffer = io.BytesIO()
    strict_cp1252 = io.TextIOWrapper(buffer, encoding="cp1252", errors="strict")
    monkeypatch.setattr(sys, "stdout", strict_cp1252)

    # Must NOT raise UnicodeEncodeError
    try:
        safe_print("Printing banner with emoji \U0001f4e7 and symbol \u2265")
    except UnicodeEncodeError as e:
        pytest.fail(f"safe_print raised UnicodeEncodeError: {e}")

@pytest.mark.anyio
async def test_send_invitation_non_ascii_cp1252_stream(monkeypatch):
    """
    Regression Test: Calling send_interview_invitation with non-ASCII candidate name,
    en-dash title, and emojis under a strict cp1252 logging stream must complete
    cleanly without raising UnicodeEncodeError.
    """
    buffer = io.BytesIO()
    cp1252_stream = io.TextIOWrapper(buffer, encoding="cp1252", errors="strict")

    # Attach SafeStreamHandler on email logger to cp1252 stream
    email_logger = logging.getLogger("biasguard.email")
    safe_handler = SafeStreamHandler(cp1252_stream)
    safe_handler.setFormatter(logging.Formatter("%(message)s"))
    old_handlers = email_logger.handlers
    email_logger.handlers = [safe_handler]
    email_logger.propagate = False

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "console")
    monkeypatch.setattr(settings, "FRONTEND_BASE_URL", "http://127.0.0.1:5173")
    monkeypatch.setattr(settings, "INVITATION_EXPIRY_HOURS", 48)

    # Mock database update
    mock_interviews_col = MagicMock()
    monkeypatch.setattr("app.database.get_interviews_collection", lambda: mock_interviews_col)

    try:
        result = await send_interview_invitation(
            candidate_name="René François \U0001f4e7",
            candidate_email="rene.francois@example.com",
            interview_title="Staff Distributed Systems Architect – Reliability ≥99.9%",
            domains=["Distributed Systems", "Cloud"],
            raw_token="secure_test_raw_token_xyz_1234567890",
            interview_id=str(ObjectId()),
            interviewer_name="Élise Moreau"
        )
        assert result["status"] == "sent_console"
        assert result["recipient"] == "rene.francois@example.com"
        assert "invite_url" in result
    except UnicodeEncodeError as e:
        pytest.fail(f"send_interview_invitation crashed with UnicodeEncodeError: {e}")
    finally:
        email_logger.handlers = old_handlers

@pytest.mark.anyio
async def test_invitation_link_privacy_under_smtp(monkeypatch):
    """
    Verifies that when EMAIL_PROVIDER=smtp and debug mode is off,
    the full invitation token or link is NOT logged into application logs.
    """
    log_records = []

    class CapturingHandler(logging.Handler):
        def emit(self, record):
            log_records.append(self.format(record))

    email_logger = logging.getLogger("biasguard.email")
    email_logger.setLevel(logging.INFO)
    capturing_handler = CapturingHandler()
    old_handlers = email_logger.handlers
    email_logger.handlers = [capturing_handler]
    email_logger.propagate = False

    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "smtp")
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_USER", "mailer@example.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "secret_pass_12345")
    monkeypatch.setattr(settings, "EMAIL_FROM", "BiasGuard <mailer@example.com>")
    monkeypatch.setattr(settings, "FRONTEND_BASE_URL", "http://127.0.0.1:5173")
    monkeypatch.setattr(settings, "DEBUG", False)
    monkeypatch.delenv("DEBUG", raising=False)

    mock_interviews_col = MagicMock()
    monkeypatch.setattr("app.database.get_interviews_collection", lambda: mock_interviews_col)

    raw_token = "confidential_raw_token_secret_9988776655"
    fake_interview_id = str(ObjectId())

    # Mock smtplib.SMTP
    with patch("smtplib.SMTP") as mock_smtp_cls:
        mock_server = MagicMock()
        mock_smtp_cls.return_value.__enter__.return_value = mock_server

        result = await send_interview_invitation(
            candidate_name="Jane Doe",
            candidate_email="jane.doe@techcorp.com",
            interview_title="Lead Backend Engineer",
            domains=["Python"],
            raw_token=raw_token,
            interview_id=fake_interview_id,
            interviewer_name="Lead Interviewer"
        )
        assert result["status"] == "sent"

    email_logger.handlers = old_handlers

    # Check that confidential raw token is NEVER printed or logged
    full_log_text = " ".join(log_records)
    assert raw_token not in full_log_text
    assert "secret_pass_12345" not in full_log_text
    assert f"interview-room/{raw_token}" not in full_log_text
    assert "[INVITATION DISPATCHED]" in full_log_text
    assert fake_interview_id in full_log_text

def test_build_email_template_ascii_cleanliness():
    """
    Verifies build_email_template generates HTML and text without unescaped emojis or en-dashes.
    """
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    plain, html = build_email_template(
        candidate_name="Arjun Patel",
        interview_title="Senior Infrastructure Engineer",
        domains=["Kubernetes", "Linux"],
        invite_url="http://127.0.0.1:5173/interview-room/sample_token",
        expires_at=now,
        interviewer_name="Staff Engineer"
    )

    # Check no emojis in template
    assert "\U0001f4e7" not in plain
    assert "\U0001f4e7" not in html
    assert "\U0001f6e1" not in plain  # shield emoji
    assert "\U0001f6e1" not in html
    assert "\u23f3" not in plain      # hourglass emoji
    assert "\u23f3" not in html
    assert "–" not in plain           # en-dash
    assert "–" not in html
