import os
import sys
import smtplib
import email.utils
from email.mime.text import MIMEText
from pathlib import Path

# Locate backend/.env
script_dir = Path(__file__).resolve().parent
backend_dir = script_dir.parent
env_file = backend_dir / ".env"

if env_file.exists():
    with open(env_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'\"")
                if k not in os.environ:
                    os.environ[k] = v

email_provider = os.environ.get("EMAIL_PROVIDER", "").strip().lower()
smtp_host = os.environ.get("SMTP_HOST", "").strip()
smtp_port_raw = os.environ.get("SMTP_PORT", "587").strip()
smtp_user = os.environ.get("SMTP_USER", "").strip()
smtp_password = os.environ.get("SMTP_PASSWORD", "")
email_from = os.environ.get("EMAIL_FROM", "").strip()
frontend_base_url = os.environ.get("FRONTEND_BASE_URL", "").strip()
invitation_expiry_hours = os.environ.get("INVITATION_EXPIRY_HOURS", "").strip()

try:
    smtp_port = int(smtp_port_raw)
except ValueError:
    smtp_port = 587

# Print configuration status (WITHOUT printing any secret values)
print("=== SMTP Configuration Status ===")
print(f"EMAIL_PROVIDER set: {bool(email_provider)} ({email_provider if email_provider else 'not set'})")
print(f"SMTP_HOST set: {bool(smtp_host)}")
print(f"SMTP_PORT set: {bool(smtp_port_raw)} ({smtp_port})")
print(f"SMTP_USER set: {bool(smtp_user)}")
print(f"SMTP_PASSWORD set: {bool(smtp_password)} (length: {len(smtp_password)})")
print(f"EMAIL_FROM set: {bool(email_from)}")
print(f"FRONTEND_BASE_URL set: {bool(frontend_base_url)}")
print(f"INVITATION_EXPIRY_HOURS set: {bool(invitation_expiry_hours)}")
print("=================================")

if not smtp_host or not smtp_user or not smtp_password:
    print(f"EXCEPTION: ValueError: Incomplete SMTP credentials (host={bool(smtp_host)}, user={bool(smtp_user)}, pass_len={len(smtp_password)})")
    sys.exit(1)

try:
    msg = MIMEText("This is a BiasGuard AI SMTP diagnostic test email to verify credentials and STARTTLS connectivity.")
    parsed_from = email.utils.parseaddr(email_from)
    from_addr = parsed_from[1] if parsed_from[1] else smtp_user
    msg["From"] = email_from if email_from else f"BiasGuard AI <{smtp_user}>"
    msg["To"] = smtp_user
    msg["Subject"] = "BiasGuard AI - SMTP Connection Test"
    msg["Date"] = email.utils.formatdate(localtime=True)

    with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
        server.ehlo()
        if server.has_extn("STARTTLS"):
            server.starttls()
            server.ehlo()
        server.login(smtp_user, smtp_password)
        server.sendmail(from_addr, [smtp_user], msg.as_string())

    print("SUCCESS")
    sys.exit(0)
except Exception as e:
    err_type = type(e).__name__
    raw_msg = str(e)
    # Mask password if it appears anywhere in exception message
    if smtp_password and smtp_password in raw_msg:
        raw_msg = raw_msg.replace(smtp_password, "********")
    print(f"EXCEPTION: {err_type}: {raw_msg}")
    sys.exit(1)
