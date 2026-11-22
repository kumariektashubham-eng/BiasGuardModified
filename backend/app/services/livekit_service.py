import os
import logging
import calendar
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Tuple
import jwt
from livekit.api import AccessToken, VideoGrants
from app.config import settings

logger = logging.getLogger("biasguard.livekit")

def get_clean_livekit_credentials() -> Tuple[str, str, str]:
    """
    Retrieves sanitized LiveKit credentials with whitespace and quotes stripped.
    Ensures URL uses the WebSocket scheme (wss:// or ws://).
    Never logs or exposes secret values.
    """
    raw_url = os.environ.get("LIVEKIT_URL") or settings.LIVEKIT_URL or ""
    raw_key = os.environ.get("LIVEKIT_API_KEY") or settings.LIVEKIT_API_KEY or ""
    raw_secret = os.environ.get("LIVEKIT_API_SECRET") or settings.LIVEKIT_API_SECRET or ""

    url = raw_url.strip().strip("\"'").strip()
    key = raw_key.strip().strip("\"'").strip()
    secret = raw_secret.strip().strip("\"'").strip()

    # Normalize protocol scheme to WebSocket
    if url.startswith("http://"):
        url = "ws://" + url[7:]
    elif url.startswith("https://"):
        url = "wss://" + url[8:]
    elif url and not url.startswith("wss://") and not url.startswith("ws://"):
        url = "wss://" + url

    return url, key, secret

def get_room_name(interview_id: str) -> str:
    """Standardizes room name format for an interview session."""
    clean_id = (interview_id or "").strip()
    if clean_id.startswith("interview_"):
        clean_id = clean_id[len("interview_"):]
    return f"interview_{clean_id}"

def generate_interviewer_livekit_token(
    interview_id: str,
    user_id: str,
    user_name: str = "Interviewer",
    ttl_hours: int = 2
) -> str:
    """
    Generates a secure LiveKit JWT access token for the interviewer.
    Grants publishing, subscribing, and room administration permissions.
    Incorporates clock-skew protection (backdated nbf) to avoid clock-skew rejections.
    """
    url, api_key, api_secret = get_clean_livekit_credentials()
    if not api_key:
        api_key = "devkey"
    if not api_secret:
        api_secret = "secret_key_biasguard_livekit_video_2026"

    room = get_room_name(interview_id)
    clean_uid = user_id.strip() if user_id else "interviewer"
    identity = f"interviewer_{clean_uid}"

    token = (
        AccessToken(api_key, api_secret)
        .with_identity(identity)
        .with_name(user_name or "Interviewer")
        .with_ttl(timedelta(hours=ttl_hours))
        .with_grants(
            VideoGrants(
                room_join=True,
                room=room,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
                room_admin=True,
                room_record=True
            )
        )
    )

    # Apply backward skew offset (60 seconds) to nbf to guard against client/server clock drifts
    jwt_claims = token.claims.asdict()
    now_ts = calendar.timegm(datetime.now(timezone.utc).utctimetuple())
    jwt_claims.update({
        "sub": identity,
        "iss": api_key,
        "nbf": now_ts - 60,
        "exp": now_ts + int(timedelta(hours=ttl_hours).total_seconds())
    })
    return jwt.encode(jwt_claims, api_secret, algorithm="HS256")

def generate_candidate_livekit_token(
    interview_id: str,
    candidate_id: str,
    candidate_name: str = "Candidate",
    ttl_hours: int = 2
) -> str:
    """
    Generates a secure LiveKit JWT access token for the guest candidate.
    Grants publishing (camera/mic) and subscribing, without room administration permissions.
    Incorporates clock-skew protection (backdated nbf) to avoid clock-skew rejections.
    """
    url, api_key, api_secret = get_clean_livekit_credentials()
    if not api_key:
        api_key = "devkey"
    if not api_secret:
        api_secret = "secret_key_biasguard_livekit_video_2026"

    room = get_room_name(interview_id)
    clean_cid = candidate_id.strip() if candidate_id else "guest"
    identity = f"candidate_{clean_cid}"

    token = (
        AccessToken(api_key, api_secret)
        .with_identity(identity)
        .with_name(candidate_name or "Candidate")
        .with_ttl(timedelta(hours=ttl_hours))
        .with_grants(
            VideoGrants(
                room_join=True,
                room=room,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
                room_admin=False
            )
        )
    )

    # Apply backward skew offset (60 seconds) to nbf to guard against client/server clock drifts
    jwt_claims = token.claims.asdict()
    now_ts = calendar.timegm(datetime.now(timezone.utc).utctimetuple())
    jwt_claims.update({
        "sub": identity,
        "iss": api_key,
        "nbf": now_ts - 60,
        "exp": now_ts + int(timedelta(hours=ttl_hours).total_seconds())
    })
    return jwt.encode(jwt_claims, api_secret, algorithm="HS256")

def get_livekit_connection_info(interview_id: str, is_interviewer: bool, entity_id: str, name: str) -> Dict[str, Any]:
    """
    Bundles the WebSocket URL, room name, and signed JWT for client connection.
    """
    url, _, _ = get_clean_livekit_credentials()
    if is_interviewer:
        token = generate_interviewer_livekit_token(interview_id, entity_id, name)
    else:
        token = generate_candidate_livekit_token(interview_id, entity_id, name)
        
    return {
        "url": url,
        "room_name": get_room_name(interview_id),
        "token": token,
        "identity": f"{'interviewer' if is_interviewer else 'candidate'}_{entity_id}",
        "name": name
    }

def check_livekit_service_status() -> Dict[str, Any]:
    """Returns LiveKit configuration and connectivity diagnostic status."""
    url, key, secret = get_clean_livekit_credentials()
    has_url = bool(url)
    has_key = bool(key and key != "devkey")
    has_secret = bool(secret and "secret_key_biasguard" not in secret)
    
    return {
        "configured": has_url,
        "url": url,
        "is_production_ready": has_key and has_secret,
        "mode": "production" if (has_key and has_secret) else "development_local"
    }

def verify_livekit_config() -> Dict[str, Any]:
    """
    Backend startup self-check that creates and locally decodes a test token.
    Logs clear warnings by variable name only if:
      - LIVEKIT_URL lacks wss://
      - LIVEKIT_API_KEY / LIVEKIT_API_SECRET is empty or placeholder (devkey, contains change-me)
      - LIVEKIT_API_KEY and LIVEKIT_API_SECRET appear swapped
    NEVER logs or outputs actual secret values.
    """
    url, key, secret = get_clean_livekit_credentials()
    warnings = []

    # 1. LIVEKIT_URL checks
    if not url:
        warnings.append("LIVEKIT_URL is not configured in backend/.env.")
    elif not url.startswith("wss://"):
        warnings.append("LIVEKIT_URL does not start with 'wss://'. Secure WebSocket protocol required for LiveKit Cloud.")

    # 2. Key and Secret placeholder checks
    insecure_keys = {"devkey", "change-me", "your-api-key", "placeholder"}
    insecure_secrets = {"secret_key_biasguard_livekit_video_2026", "secret", "change-me", "your-api-secret", "placeholder"}

    if not key:
        warnings.append("LIVEKIT_API_KEY is empty.")
    elif key in insecure_keys or "change-me" in key.lower():
        warnings.append("LIVEKIT_API_KEY appears to be a default or placeholder value.")

    if not secret:
        warnings.append("LIVEKIT_API_SECRET is empty.")
    elif secret in insecure_secrets or "change-me" in secret.lower() or "biasguard_livekit" in secret.lower():
        warnings.append("LIVEKIT_API_SECRET appears to be a default or placeholder value.")

    # 3. Detect swapped credentials
    if key and secret:
        if len(key) > len(secret) or (secret.startswith("API") and not key.startswith("API")):
            warnings.append(
                "LIVEKIT_API_KEY and LIVEKIT_API_SECRET appear to be swapped. "
                "LIVEKIT_API_KEY typically starts with 'API' and is shorter than LIVEKIT_API_SECRET."
            )

    # 4. Token creation & local cryptographic signature verification test
    token_verified = False
    if key and secret:
        try:
            test_room = "verify_self_test_room"
            test_id = "test_participant_verify"
            test_token = (
                AccessToken(key, secret)
                .with_identity(test_id)
                .with_grants(VideoGrants(room_join=True, room=test_room, can_publish=True, can_subscribe=True))
            )
            jwt_claims = test_token.claims.asdict()
            now_ts = calendar.timegm(datetime.now(timezone.utc).utctimetuple())
            jwt_claims.update({
                "sub": test_id,
                "iss": key,
                "nbf": now_ts - 60,
                "exp": now_ts + 3600
            })
            encoded = jwt.encode(jwt_claims, secret, algorithm="HS256")
            decoded = jwt.decode(encoded, secret, algorithms=["HS256"])

            if (
                decoded.get("iss") == key
                and decoded.get("sub") == test_id
                and decoded.get("video", {}).get("room") == test_room
                and decoded.get("video", {}).get("roomJoin") is True
                and decoded.get("video", {}).get("canPublish") is True
                and decoded.get("video", {}).get("canSubscribe") is True
            ):
                token_verified = True
            else:
                warnings.append("Self-test token claims validation failed.")
        except Exception as e:
            warnings.append(f"Self-test token signature verification failed: {type(e).__name__}")

    for w in warnings:
        logger.warning(f"[LIVEKIT CONFIG] {w}")

    if not warnings and token_verified:
        logger.info("[LIVEKIT CONFIG] LiveKit configuration verified successfully (valid wss:// URL and local token verification passed).")

    return {
        "configured": bool(url and key and secret),
        "url_valid": url.startswith("wss://"),
        "token_verified": token_verified,
        "warnings": warnings,
        "mode": "production" if (not warnings and token_verified) else "development_degraded"
    }
