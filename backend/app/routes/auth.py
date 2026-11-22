from fastapi import APIRouter, HTTPException, status, Depends, Request
from datetime import datetime, timezone
import time
from collections import defaultdict
from app.models.user import UserCreate, UserLogin, UserResponse, Token
from app.services.auth_service import hash_password, verify_password, create_access_token, get_current_user
from app.database import get_users_collection, serialize_doc
from bson import ObjectId

router = APIRouter(prefix="/auth", tags=["Authentication"])

# In-memory rate limiting tracking per IP
_failed_login_attempts = defaultdict(list)
_registration_attempts = defaultdict(list)
MAX_LOGIN_ATTEMPTS = 10
LOGIN_WINDOW_SECONDS = 300  # 5 minutes
MAX_REG_ATTEMPTS = 5
REG_WINDOW_SECONDS = 300

def _check_rate_limit(attempts_dict: dict, key: str, max_attempts: int, window_seconds: int, error_msg: str):
    now = time.time()
    valid_window_start = now - window_seconds
    attempts = [t for t in attempts_dict[key] if t > valid_window_start]
    attempts_dict[key] = attempts
    if len(attempts) >= max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=error_msg
        )

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(
        _registration_attempts, 
        client_ip, 
        MAX_REG_ATTEMPTS, 
        REG_WINDOW_SECONDS, 
        "Too many registration attempts. Please wait 5 minutes before trying again."
    )
    
    users = get_users_collection()
    existing = users.find_one({"email": user_in.email.lower()})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists."
        )
    
    hashed = hash_password(user_in.password)
    now = datetime.now(timezone.utc)
    new_user = {
        "name": user_in.name,
        "email": user_in.email.lower(),
        "password_hash": hashed,
        "role": user_in.role if user_in.role in ["interviewer", "admin"] else "interviewer",
        "created_at": now
    }
    
    result = users.insert_one(new_user)
    _registration_attempts[client_ip].append(time.time())
    new_user["_id"] = result.inserted_id
    serialized = serialize_doc(new_user)
    
    token = create_access_token({"sub": user_in.email.lower(), "role": new_user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": serialized
    }

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}:{credentials.email.lower()}"
    _check_rate_limit(
        _failed_login_attempts, 
        rate_key, 
        MAX_LOGIN_ATTEMPTS, 
        LOGIN_WINDOW_SECONDS, 
        "Too many failed login attempts. Please wait 5 minutes."
    )

    users = get_users_collection()
    user = users.find_one({"email": credentials.email.lower()})
    if not user or not verify_password(credentials.password, user.get("password_hash", "")):
        _failed_login_attempts[rate_key].append(time.time())
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password."
        )
    
    # Reset failed attempts on successful login
    if rate_key in _failed_login_attempts:
        _failed_login_attempts.pop(rate_key, None)

    token = create_access_token({"sub": user["email"], "role": user.get("role", "interviewer")})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": serialize_doc(user)
    }

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user
