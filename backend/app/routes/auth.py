from fastapi import APIRouter, HTTPException, status, Depends
from datetime import datetime, timezone
from app.models.user import UserCreate, UserLogin, UserResponse, Token
from app.services.auth_service import hash_password, verify_password, create_access_token, get_current_user
from app.database import get_users_collection, serialize_doc
from bson import ObjectId

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate):
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
    new_user["_id"] = result.inserted_id
    serialized = serialize_doc(new_user)
    
    token = create_access_token({"sub": user_in.email.lower(), "role": new_user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": serialized
    }

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    users = get_users_collection()
    user = users.find_one({"email": credentials.email.lower()})
    if not user or not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password."
        )
    
    token = create_access_token({"sub": user["email"], "role": user.get("role", "interviewer")})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": serialize_doc(user)
    }

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user
