import os
import re
import secrets
import hashlib
import logging
import smtplib
import email.utils
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Tuple
from bson import ObjectId
import httpx

from app.config import settings

logger = logging.getLogger("biasguard.email")

def validate_candidate_email(email_str: str) -> bool:
    """Validates that a recipient email address is well-formed."""
    if not email_str or not isinstance(email_str, str):
        return False
    email_clean = email_str.strip()
    if len(email_clean) < 5 or "@" not in email_clean or "." not in email_clean:
        return False
    pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    return bool(re.match(pattern, email_clean))

def generate_invitation_token(expiry_hours: Optional[int] = None) -> Tuple[str, str, datetime]:
    """
    Generates a high-entropy cryptographically secure raw token and its SHA-256 hash.
    The raw token is transmitted to the candidate in the link.
    The hash is securely stored in MongoDB.
    """
    if expiry_hours is None:
        expiry_hours = settings.INVITATION_EXPIRY_HOURS or 48

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=expiry_hours)
    return raw_token, token_hash, expires_at

def hash_token(raw_token: str) -> str:
    """Computes SHA-256 hash of a raw invitation token."""
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()

def is_token_expired(expires_at: Optional[datetime]) -> bool:
    """Checks whether an invitation token has expired."""
    if not expires_at:
        return False
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) > expires_at

def build_email_template(
    candidate_name: str,
    interview_title: str,
    domains: list,
    invite_url: str,
    expires_at: datetime,
    interviewer_name: Optional[str] = "The Hiring Team"
) -> Tuple[str, str]:
    """
    Constructs clean, professional HTML and plain-text email templates.
    """
    domains_str = ", ".join(domains) if domains else "General Technical"
    expiry_str = expires_at.strftime("%B %d, %Y at %I:%M %p UTC")
    interviewer = interviewer_name.strip() if interviewer_name else "The Hiring Team"

    plain_text = f"""Hello {candidate_name},

{interviewer} has invited you to participate in a live technical interview for {interview_title} on BiasGuard AI.

Interview Details:
- Role / Topic: {interview_title}
- Interviewer: {interviewer}
- Technical Domains: {domains_str}
- Invitation Valid Until: {expiry_str}

To start your interview, please open the following secure link:
{invite_url}

Instructions & System Requirements:
1. Allow microphone and camera access when prompted by your browser.
2. Recommended browsers: Google Chrome or Microsoft Edge.
3. Please find a quiet room with a reliable, stable internet connection.

No account creation or password required. You can join directly from your browser.

About BiasGuard AI:
This technical interview is evaluated with BiasGuard AI, ensuring an objective, merit-based assessment free from human cognitive biases.

Best regards,
{interviewer} & The BiasGuard AI Team
"""

    domains_badges_html = "".join([
        f'<span style="display:inline-block;background-color:#EEF2FF;color:#4F46E5;font-weight:600;font-size:12px;padding:4px 10px;border-radius:12px;margin:2px 4px 2px 0;">{d}</span>'
        for d in domains
    ]) or '<span style="color:#6B7280;font-size:13px;">General Technical</span>'

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Technical Interview Invitation</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#1F2937;background-color:#F9FAFB;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -1px rgba(0,0,0,0.06);border:1px solid #E5E7EB;">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg, #1E293B 0%, #0F172A 100%);color:#FFFFFF;padding:32px 28px;text-align:center;">
      <div style="display:inline-block;padding:8px 14px;background:rgba(255,255,255,0.1);border-radius:8px;margin-bottom:12px;">
        <span style="font-size:16px;font-weight:700;color:#818CF8;letter-spacing:1px;">[BiasGuard AI]</span>
      </div>
      <h1 style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px;">BiasGuard AI</h1>
      <p style="margin:4px 0 0 0;color:#94A3B8;font-size:14px;letter-spacing:0.5px;text-transform:uppercase;">Technical Interview Invitation</p>
    </div>

    <!-- Body -->
    <div style="padding:32px 28px;">
      <h2 style="font-size:18px;font-weight:600;color:#111827;margin-top:0;">Hello {candidate_name},</h2>
      <p style="color:#4B5563;font-size:15px;margin-bottom:20px;">
        <strong style="color:#111827;">{interviewer}</strong> has invited you to participate in a live online technical interview for <strong style="color:#111827;">{interview_title}</strong>.
      </p>

      <!-- Interview Card -->
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin-bottom:24px;">
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Target Role / Title</div>
          <div style="font-size:16px;font-weight:600;color:#0F172A;margin-top:2px;">{interview_title}</div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Interviewer</div>
          <div style="font-size:14px;font-weight:500;color:#0F172A;margin-top:2px;">{interviewer}</div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Technical Domains</div>
          <div style="margin-top:4px;">{domains_badges_html}</div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Invitation Valid Until</div>
          <div style="font-size:13px;color:#0F172A;margin-top:2px;font-weight:500;">{expiry_str}</div>
        </div>
      </div>

      <!-- Action Button -->
      <div style="text-align:center;margin:32px 0;">
        <a href="{invite_url}" style="background-color:#4F46E5;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:16px;padding:14px 36px;border-radius:8px;display:inline-block;box-shadow:0 4px 6px -1px rgba(79,70,229,0.3);">
          Join Technical Interview / Start Interview
        </a>
      </div>

      <!-- Raw Link Underneath -->
      <div style="background:#F3F4F6;border-radius:6px;padding:12px;font-size:12px;color:#6B7280;word-break:break-all;margin-bottom:24px;">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="{invite_url}" style="color:#4F46E5;">{invite_url}</a>
      </div>

      <p style="font-size:13px;color:#6B7280;text-align:center;margin-bottom:28px;">
        No account creation or permanent password required. You can join directly from your browser.
      </p>

      <!-- Checklist -->
      <div style="border-top:1px solid #E5E7EB;padding-top:20px;margin-bottom:20px;">
        <h3 style="font-size:14px;font-weight:600;color:#374151;margin-bottom:8px;">Before joining, please ensure:</h3>
        <ul style="margin:0;padding-left:20px;color:#4B5563;font-size:13px;line-height:1.7;">
          <li>Allow microphone and camera access when prompted by your browser.</li>
          <li>Recommended browsers: <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.</li>
          <li>Find a quiet room with a reliable, stable internet connection.</li>
        </ul>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:20px 28px;text-align:center;font-size:12px;color:#9CA3AF;">
      <p style="margin:0;">
        <strong>BiasGuard AI</strong> protects candidates and interviewers by conducting objective, double-blind evaluations.
      </p>
      <p style="margin:4px 0 0 0;">
        (c) {datetime.now(timezone.utc).year} BiasGuard AI. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
"""
    return plain_text, html_content

async def send_interview_invitation(
    candidate_name: str,
    candidate_email: str,
    interview_title: str,
    domains: list,
    raw_token: str,
    interview_id: str,
    interviewer_name: Optional[str] = "The Hiring Team"
) -> Dict[str, Any]:
    """
    Sends the candidate an email invitation using the configured provider.
    Supports 'smtp', 'resend', or 'console' (local log fallback).
    Always returns delivery metadata and invite_url, and stores status in MongoDB.
    Logs every send attempt with recipient domain only (never full username or credentials).
    """
    from app.database import get_interviews_collection

    invite_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/interview-room/{raw_token}"
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.INVITATION_EXPIRY_HOURS)
    interviewer = (interviewer_name or "The Hiring Team").strip()
    provider = (settings.EMAIL_PROVIDER or "console").lower()
    recipient_domain = candidate_email.split("@")[-1].strip().lower() if candidate_email and "@" in candidate_email else "unknown"

    # 1. Validate email address
    if not validate_candidate_email(candidate_email):
        err_msg = f"Invalid candidate email address: '{candidate_email}'"
        logger.error(
            f"[EMAIL SEND FAILURE] interview_id={interview_id}, "
            f"recipient_domain=@{recipient_domain}, provider={provider}, "
            f"error_type=ValidationError: {err_msg}"
        )
        
        # Record failure in MongoDB
        try:
            get_interviews_collection().update_one(
                {"_id": ObjectId(interview_id)},
                {"$set": {
                    "invitation.email_status": "failed",
                    "invitation.email_error": err_msg,
                    "invitation.email_sent_at": None,
                    "invitation.status": "failed",
                    "email_status": "failed",
                    "email_error": err_msg,
                    "email_sent_at": None,
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
        except Exception:
            pass

        return {
            "status": "failed",
            "provider": provider,
            "recipient": candidate_email,
            "recipient_domain": recipient_domain,
            "invite_url": invite_url,
            "error": err_msg
        }

    logger.info(
        f"[EMAIL SEND ATTEMPT] interview_id={interview_id}, "
        f"recipient_domain=@{recipient_domain}, provider={provider}"
    )

    plain_text, html_content = build_email_template(
        candidate_name=candidate_name,
        interview_title=interview_title,
        interviewer_name=interviewer,
        domains=domains,
        invite_url=invite_url,
        expires_at=expires_at
    )

    delivery_status = "sent"
    delivery_error = None
    provider_response = {}

    # 2. Resend API Provider
    if provider == "resend" and settings.RESEND_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "from": settings.EMAIL_FROM,
                        "to": [candidate_email],
                        "subject": f"Technical Interview Invitation: {interview_title} - BiasGuard AI",
                        "html": html_content,
                        "text": plain_text
                    }
                )
                if res.status_code in (200, 201):
                    provider_response = res.json()
                    delivery_status = "sent"
                    logger.info(
                        f"[EMAIL SEND SUCCESS] interview_id={interview_id}, "
                        f"recipient_domain=@{recipient_domain}, provider=resend"
                    )
                else:
                    delivery_status = "failed"
                    delivery_error = f"Resend API error {res.status_code}: {res.text}"
                    logger.error(
                        f"[EMAIL SEND FAILURE] interview_id={interview_id}, "
                        f"recipient_domain=@{recipient_domain}, provider=resend, "
                        f"error_type=ApiError: {delivery_error}"
                    )
        except Exception as e:
            delivery_status = "failed"
            delivery_error = f"Resend dispatch error: {str(e)}"
            logger.error(
                f"[EMAIL SEND FAILURE] interview_id={interview_id}, "
                f"recipient_domain=@{recipient_domain}, provider=resend, "
                f"error_type={type(e).__name__}: {delivery_error}"
            )

    # 3. SMTP Provider (with STARTTLS on port 587)
    elif provider == "smtp":
        if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
            delivery_status = "failed"
            delivery_error = "Incomplete SMTP configuration: SMTP_HOST, SMTP_USER, or SMTP_PASSWORD is not set."
            logger.error(
                f"[EMAIL SEND FAILURE] interview_id={interview_id}, "
                f"recipient_domain=@{recipient_domain}, provider=smtp, "
                f"error_type=ConfigurationError: {delivery_error}"
            )
        else:
            try:
                parsed_from = email.utils.parseaddr(settings.EMAIL_FROM)
                envelope_from = parsed_from[1] or settings.SMTP_USER
                display_from = settings.EMAIL_FROM if parsed_from[1] else f"BiasGuard AI <{settings.SMTP_USER}>"

                msg = MIMEMultipart("alternative")
                msg["Subject"] = f"Technical Interview Invitation: {interview_title} - BiasGuard AI"
                msg["From"] = display_from
                msg["To"] = candidate_email
                msg["Date"] = email.utils.formatdate(localtime=True)

                part1 = MIMEText(plain_text, "plain")
                part2 = MIMEText(html_content, "html")
                msg.attach(part1)
                msg.attach(part2)

                smtp_port = int(settings.SMTP_PORT or 587)
                with smtplib.SMTP(settings.SMTP_HOST, smtp_port, timeout=15) as server:
                    server.ehlo()
                    if server.has_extn("STARTTLS"):
                        server.starttls()
                        server.ehlo()
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                    server.sendmail(envelope_from, [candidate_email], msg.as_string())

                delivery_status = "sent"
                logger.info(
                    f"[EMAIL SEND SUCCESS] interview_id={interview_id}, "
                    f"recipient_domain=@{recipient_domain}, provider=smtp"
                )
            except Exception as e:
                delivery_status = "failed"
                # Sanitize error to ensure password is never leaked in logs
                raw_err = str(e)
                clean_err = re.sub(r":([^@/]+)@", r":****@", raw_err)
                if settings.SMTP_PASSWORD and settings.SMTP_PASSWORD in clean_err:
                    clean_err = clean_err.replace(settings.SMTP_PASSWORD, "********")
                delivery_error = clean_err
                logger.error(
                    f"[EMAIL SEND FAILURE] interview_id={interview_id}, "
                    f"recipient_domain=@{recipient_domain}, provider=smtp, "
                    f"error_type={type(e).__name__}: {delivery_error}"
                )

    # 4. Console mode fallback
    else:
        provider = "console"
        delivery_status = "sent_console"
        logger.info(
            f"[EMAIL SEND SUCCESS] interview_id={interview_id}, "
            f"recipient_domain=@{recipient_domain}, provider=console (invitation link printed to console)"
        )

    # Record delivery status in MongoDB
    now = datetime.now(timezone.utc)
    try:
        is_successful = delivery_status in ("sent", "sent_console")
        get_interviews_collection().update_one(
            {"_id": ObjectId(interview_id)},
            {"$set": {
                "invitation.email_status": delivery_status,
                "invitation.email_error": delivery_error,
                "invitation.email_sent_at": now if is_successful else None,
                "invitation.status": "sent" if is_successful else "failed",
                "email_status": delivery_status,
                "email_error": delivery_error,
                "email_sent_at": now if is_successful else None,
                "updated_at": now
            }}
        )
    except Exception as db_e:
        logger.warning(f"Notice while updating interview email status: {db_e}")

    # Log invitation status using plain ASCII text (no emojis).
    # Security Rule: Only log full invitation link when EMAIL_PROVIDER is console or debug mode is enabled.
    is_console = (provider == "console")
    is_debug = bool(getattr(settings, "DEBUG", False) or os.environ.get("DEBUG", "").lower() in ("1", "true", "yes"))

    try:
        if is_console or is_debug:
            logger.info(
                f"[INVITATION LINK]: {invite_url} | "
                f"Recipient: {candidate_name} <{candidate_email}> | "
                f"Interview: {interview_title} (ID: {interview_id}) | "
                f"Delivery Status: {delivery_status} | "
                f"Valid Until: {expires_at.isoformat()}"
            )
        else:
            logger.info(
                f"[INVITATION DISPATCHED]: interview_id={interview_id}, "
                f"recipient_domain=@{recipient_domain}, provider={provider}, "
                f"status={delivery_status}, valid_until={expires_at.isoformat()}"
            )
    except Exception:
        # Guarantee that a logging/encoding error can never break the request
        pass

    return {
        "status": delivery_status,
        "error": delivery_error,
        "provider": provider,
        "recipient": candidate_email,
        "recipient_domain": recipient_domain,
        "invite_url": invite_url,
        "expires_at": expires_at.isoformat(),
        "provider_response": provider_response
    }
