import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Depends
from fastapi.responses import FileResponse
from bson import ObjectId

from app.config import settings
from app.database import (
    get_audio_recordings_collection,
    get_interviews_collection,
    get_candidates_collection,
    get_evaluations_collection,
    serialize_doc
)
from app.services.auth_service import get_current_user, security, decode_token
from app.services.email_service import hash_token
from app.database import get_users_collection
from fastapi.security import HTTPAuthorizationCredentials
from app.services.transcription_service import (
    transcribe_audio_file, 
    estimate_audio_duration,
    is_audio_silent_or_empty
)
from app.services.speech_validator import (
    classify_recording_status,
    validate_audio_file_silence,
    is_silence_or_hallucination,
    is_transcription_unclear
)
from app.models.voice import (
    AudioUploadResponse,
    AudioMetadataResponse,
    TranscriptionUpdateRequest,
    VoiceEvaluationRequest
)
from app.routes.evaluations import evaluate_answer
from app.models.evaluation import EvaluationRequest

logger = logging.getLogger("biasguard.voice")

router = APIRouter(prefix="/voice", tags=["Voice & Speech-to-Text"])

ALLOWED_AUDIO_EXTENSIONS = {".webm", ".wav", ".mp3", ".ogg", ".m4a", ".mp4", ".aac"}
ALLOWED_MIME_PREFIXES = ("audio/", "video/webm")

async def get_audio_uploader(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    invitation_token: Optional[str] = Form(None)
) -> dict:
    """
    Authenticates audio upload request via either:
    1. Interviewer JWT Bearer token
    2. Candidate JWT Bearer token (scoped to interview)
    3. Invitation token in form field
    """
    if credentials:
        try:
            payload = decode_token(credentials.credentials)
            role = payload.get("role")
            if role == "candidate":
                return {
                    "role": "candidate",
                    "interview_id": payload.get("interview_id"),
                    "sub": payload.get("sub")
                }
            users = get_users_collection()
            user = users.find_one({"email": payload.get("sub")})
            if user:
                return {
                    "role": user.get("role", "interviewer"),
                    "user": serialize_doc(user),
                    "id": str(user["_id"])
                }
        except HTTPException:
            raise
        except Exception as e:
            logger.debug(f"Bearer check in voice upload: {e}")

    if invitation_token:
        token_hash = hash_token(invitation_token.strip())
        interview = get_interviews_collection().find_one({"invitation.token_hash": token_hash})
        if interview:
            return {
                "role": "candidate",
                "interview_id": str(interview["_id"]),
                "candidate_name": interview.get("candidate_name", "Candidate")
            }

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication or valid invitation token required to upload audio recordings."
    )

@router.post("/upload", response_model=AudioUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_audio_and_transcribe(
    file: UploadFile = File(...),
    interview_id: str = Form(...),
    question_id: str = Form(...),
    candidate_id: Optional[str] = Form(None),
    domain: Optional[str] = Form("DSA"),
    question_text: Optional[str] = Form(""),
    submission_mode: Optional[str] = Form("voice_recorded"),
    client_speech_detected: Optional[bool] = Form(None),
    invitation_token: Optional[str] = Form(None),
    uploader: dict = Depends(get_audio_uploader)
):
    """
    Uploads audio file using FormData, validates format and size, stores on filesystem,
    runs speech detection and Whisper transcription, and registers metadata in MongoDB.
    Always preserves original audio recording even when silent or transcription fails.
    Supports uploads by interviewers and invited candidates.
    """
    if uploader.get("role") == "candidate":
        cand_int_id = uploader.get("interview_id")
        if cand_int_id and cand_int_id != interview_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Candidate token does not match the specified interview session."
            )
    # 1. Validate file extension and MIME type
    original_filename = file.filename or "recording.webm"
    _, ext = os.path.splitext(original_filename.lower())
    if not ext:
        ext = ".webm"
        
    mime_type = file.content_type or ""
    is_valid_ext = ext in ALLOWED_AUDIO_EXTENSIONS
    is_valid_mime = any(mime_type.lower().startswith(p) for p in ALLOWED_MIME_PREFIXES)

    if not is_valid_ext and not is_valid_mime:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format '{ext or mime_type}'. Allowed formats: WebM, WAV, MP3, OGG, M4A."
        )

    # 2. Read and enforce file size limits
    os.makedirs(settings.AUDIO_UPLOAD_DIR, exist_ok=True)
    try:
        content = await file.read()
    except Exception as e:
        logger.error(f"Error reading uploaded file: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to read audio stream.")

    file_size = len(content)

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded audio file is empty (0 bytes). Please verify microphone permissions and record again."
        )

    if file_size < 120:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio recording is too brief or contains no sound data. Please record an answer of at least 2-3 seconds."
        )

    if file_size > settings.MAX_AUDIO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Audio file exceeds maximum size limit of {settings.MAX_AUDIO_SIZE_BYTES // (1024 * 1024)} MB."
        )

    # 3. Save original audio to filesystem (always preserved)
    safe_filename = f"{interview_id}_{question_id}_{uuid.uuid4().hex[:8]}{ext}"
    saved_path = os.path.join(settings.AUDIO_UPLOAD_DIR, safe_filename)

    try:
        with open(saved_path, "wb") as f:
            f.write(content)
    except Exception as e:
        logger.error(f"Failed to save audio file to disk: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Server failed to store audio recording.")

    # 4. Estimate duration
    content_type = mime_type or ("audio/webm" if ext == ".webm" else "audio/wav")
    duration = estimate_audio_duration(saved_path, file_size, content_type)

    # 5. Voice Activity Detection & Silence Analysis
    is_silent, silence_reason = validate_audio_file_silence(
        saved_path, file_size, content_type, client_speech_detected
    )

    # 6. Transcribe via Groq / OpenAI Whisper (skip API call if audio is silent)
    audio_col = get_audio_recordings_collection()
    now = datetime.now(timezone.utc)
    transcript = ""
    engine_used = ""
    transcription_error = None

    if is_silent:
        transcription_error = silence_reason or "No speech detected. Please record your answer again."
        engine_used = "Voice Activity Detector"
    else:
        try:
            transcript, engine_used = transcribe_audio_file(
                file_path=saved_path,
                domain=domain,
                question_text=question_text,
                client_speech_detected=client_speech_detected
            )
        except ValueError as ve:
            logger.warning(f"Audio transcription validation warning: {ve}")
            transcription_error = str(ve)
        except Exception as e:
            logger.error(f"Transcription backend error: {e}", exc_info=True)
            transcription_error = str(e)

    # 7. Classify into lifecycle status: Case A, B, C, or D
    status_code, status_label, status_message = classify_recording_status(
        transcript=transcript,
        transcription_error=transcription_error,
        is_silent_audio=is_silent,
        silence_reason=silence_reason
    )

    speech_detected = (status_code == "completed")
    clean_transcript = transcript if speech_detected else ""

    # 8. Save metadata to MongoDB audio_recordings collection (preserve audio permanently)
    audio_record = {
        "interview_id": interview_id,
        "question_id": question_id,
        "candidate_id": candidate_id,
        "filename": safe_filename,
        "original_filename": original_filename,
        "filepath": saved_path,
        "file_size": file_size,
        "content_type": content_type,
        "duration_seconds": duration,
        "transcription": clean_transcript,
        "edited_transcript": clean_transcript,
        "submission_mode": submission_mode or "voice_recorded",
        "engine_used": engine_used or "None",
        "speech_detected": speech_detected,
        "status": status_code,
        "status_label": status_label,
        "status_message": status_message,
        "error": transcription_error,
        "uploaded_by": "Candidate" if uploader.get("role") == "candidate" else (uploader.get("user", {}).get("name") or "User"),
        "created_at": now,
        "updated_at": now
    }
    
    res = audio_col.insert_one(audio_record)
    audio_id = str(res.inserted_id)

    # 9. Immediately sync question in interviews collection
    interviews_col = get_interviews_collection()
    try:
        int_obj = interviews_col.find_one({"_id": ObjectId(interview_id)})
        if int_obj:
            updated_questions = []
            for q in int_obj.get("questions", []):
                if q.get("id") == question_id:
                    is_video_rec = ext in (".mp4", ".webm", ".mkv") or (mime_type and mime_type.startswith("video/"))
                    q["audio_id"] = audio_id
                    q["audio_url"] = f"/api/voice/audio/{audio_id}"
                    if is_video_rec:
                        q["video_id"] = audio_id
                        q["video_url"] = f"/api/voice/video/{audio_id}"
                        q["recording_type"] = "video"
                    else:
                        q["recording_type"] = "audio"
                    q["recording_duration"] = duration
                    q["transcription"] = clean_transcript
                    q["candidate_answer"] = clean_transcript
                    q["submission_mode"] = submission_mode or ("video_recorded" if is_video_rec else "voice_recorded")
                    q["speech_detected"] = speech_detected
                    q["audio_status"] = status_code
                    q["audio_status_label"] = status_label
                    q["audio_status_message"] = status_message
                updated_questions.append(q)
            interviews_col.update_one(
                {"_id": ObjectId(interview_id)},
                {"$set": {
                    "questions": updated_questions,
                    "updated_at": now
                }}
            )
    except Exception as e:
        logger.warning(f"Failed to link audio recording to interview question: {e}")

    # If audio is silent or contains no speech data, alert the client with 400
    if is_silent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=silence_reason or "No audible speech detected. Please check your microphone and speak clearly."
        )

    # Immediately trigger independent background AI evaluation for this question
    if speech_detected:
        try:
            from app.routes.evaluations import run_independent_ai_evaluation
            run_independent_ai_evaluation(
                interview_id=interview_id,
                question_id=question_id,
                candidate_answer=clean_transcript,
                domain=domain or "DSA",
                question_text=question_text or "",
                audio_id=audio_id,
                recording_duration=duration,
                submission_mode=submission_mode or "voice_recorded"
            )
        except Exception as eval_err:
            logger.warning(f"Background AI evaluation trigger notice: {eval_err}")

    return AudioUploadResponse(
        id=audio_id,
        interview_id=interview_id,
        question_id=question_id,
        candidate_id=candidate_id,
        filename=safe_filename,
        file_size=file_size,
        content_type=content_type,
        duration_seconds=duration,
        transcription=clean_transcript,
        audio_url=f"/api/voice/audio/{audio_id}",
        submission_mode=submission_mode or "voice_recorded",
        speech_detected=speech_detected,
        status=status_code,
        status_label=status_label,
        status_message=status_message,
        created_at=now
    )

@router.post("/retranscribe/{audio_id}", response_model=AudioUploadResponse)
async def retranscribe_existing_audio(
    audio_id: str,
    domain: Optional[str] = Form("DSA"),
    question_text: Optional[str] = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """
    Retries speech-to-text transcription on an existing audio recording without requiring re-recording.
    """
    audio_col = get_audio_recordings_collection()
    try:
        obj_id = ObjectId(audio_id)
        doc = audio_col.find_one({"_id": obj_id})
    except Exception:
        doc = audio_col.find_one({"filename": audio_id})

    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio recording not found.")

    filepath = doc.get("filepath")
    if not filepath or not os.path.isfile(filepath):
        alt_path = os.path.join(settings.AUDIO_UPLOAD_DIR, doc.get("filename", ""))
        if os.path.isfile(alt_path):
            filepath = alt_path
        else:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found on disk.")

    file_size = os.path.getsize(filepath)
    content_type = doc.get("content_type", "audio/webm")

    is_silent, silence_reason = validate_audio_file_silence(filepath, file_size, content_type)
    transcript = ""
    engine_used = ""
    transcription_error = None

    if is_silent:
        transcription_error = silence_reason or "No speech detected. Please record your answer again."
        engine_used = "Voice Activity Detector"
    else:
        try:
            transcript, engine_used = transcribe_audio_file(
                file_path=filepath,
                domain=domain or doc.get("domain", "DSA"),
                question_text=question_text or doc.get("question_text", "")
            )
        except Exception as e:
            logger.error(f"Retranscription failure: {e}")
            transcription_error = str(e)

    status_code, status_label, status_message = classify_recording_status(
        transcript=transcript,
        transcription_error=transcription_error,
        is_silent_audio=is_silent,
        silence_reason=silence_reason
    )

    speech_detected = (status_code == "completed")
    clean_transcript = transcript if speech_detected else ""
    now = datetime.now(timezone.utc)

    audio_col.update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "transcription": clean_transcript,
            "edited_transcript": clean_transcript,
            "engine_used": engine_used,
            "speech_detected": speech_detected,
            "status": status_code,
            "status_label": status_label,
            "status_message": status_message,
            "error": transcription_error,
            "updated_at": now
        }}
    )

    # Sync to interview question
    int_id = doc.get("interview_id")
    q_id = doc.get("question_id")
    if int_id and q_id:
        interviews_col = get_interviews_collection()
        try:
            int_obj = interviews_col.find_one({"_id": ObjectId(int_id)})
            if int_obj:
                updated_questions = []
                for q in int_obj.get("questions", []):
                    if q.get("id") == q_id:
                        q["transcription"] = clean_transcript
                        q["candidate_answer"] = clean_transcript
                        q["speech_detected"] = speech_detected
                        q["audio_status"] = status_code
                        q["audio_status_label"] = status_label
                        q["audio_status_message"] = status_message
                    updated_questions.append(q)
                interviews_col.update_one(
                    {"_id": ObjectId(int_id)},
                    {"$set": {"questions": updated_questions, "updated_at": now}}
                )
        except Exception as e:
            logger.warning(f"Failed to sync retranscription to interview: {e}")

    # Immediately update background AI evaluation
    if int_id and q_id and speech_detected:
        try:
            from app.routes.evaluations import run_independent_ai_evaluation
            run_independent_ai_evaluation(
                interview_id=int_id,
                question_id=q_id,
                candidate_answer=clean_transcript,
                domain=domain or doc.get("domain", "DSA"),
                question_text=question_text or doc.get("question_text", ""),
                audio_id=str(doc["_id"]),
                recording_duration=doc.get("duration_seconds", 0.0),
                submission_mode=doc.get("submission_mode", "voice_recorded")
            )
        except Exception as eval_err:
            logger.warning(f"Background AI evaluation trigger notice on retranscription: {eval_err}")

    return AudioUploadResponse(
        id=str(doc["_id"]),
        interview_id=doc.get("interview_id", ""),
        question_id=doc.get("question_id", ""),
        candidate_id=doc.get("candidate_id"),
        filename=doc.get("filename", ""),
        file_size=file_size,
        content_type=content_type,
        duration_seconds=doc.get("duration_seconds", 0.0),
        transcription=clean_transcript,
        audio_url=f"/api/voice/audio/{str(doc['_id'])}",
        submission_mode=doc.get("submission_mode", "voice_recorded"),
        speech_detected=speech_detected,
        status=status_code,
        status_label=status_label,
        status_message=status_message,
        created_at=doc.get("created_at", now)
    )

@router.get("/audio/{audio_id}")
async def stream_audio(audio_id: str):
    """
    Streams audio recording by audio ID with HTTP Range support for browser scrubbing.
    """
    audio_col = get_audio_recordings_collection()
    try:
        obj_id = ObjectId(audio_id)
        doc = audio_col.find_one({"_id": obj_id})
    except Exception:
        doc = audio_col.find_one({"filename": audio_id})

    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio recording not found.")

    filepath = doc.get("filepath")
    if not filepath or not os.path.isfile(filepath):
        alt_path = os.path.join(settings.AUDIO_UPLOAD_DIR, doc.get("filename", ""))
        if os.path.isfile(alt_path):
            filepath = alt_path
        else:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found on disk.")

    media_type = doc.get("content_type", "audio/webm")
    filename = doc.get("filename", "recording.webm")

    return FileResponse(
        path=filepath,
        media_type=media_type,
        filename=filename,
        headers={"Accept-Ranges": "bytes"}
    )

@router.get("/video/{video_id}")
async def stream_video(video_id: str):
    """
    Streams recorded candidate video answer with HTTP Range support for scrubbing.
    """
    audio_col = get_audio_recordings_collection()
    try:
        obj_id = ObjectId(video_id)
        doc = audio_col.find_one({"_id": obj_id})
    except Exception:
        doc = audio_col.find_one({"filename": video_id})

    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video recording not found.")

    filepath = doc.get("filepath")
    if not filepath or not os.path.isfile(filepath):
        alt_path = os.path.join(settings.AUDIO_UPLOAD_DIR, doc.get("filename", ""))
        if os.path.isfile(alt_path):
            filepath = alt_path
        else:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video file not found on disk.")

    media_type = doc.get("content_type", "video/webm")
    if not media_type.startswith("video/"):
        media_type = "video/webm"
    filename = doc.get("filename", "recording.webm")

    return FileResponse(
        path=filepath,
        media_type=media_type,
        filename=filename,
        headers={"Accept-Ranges": "bytes"}
    )

@router.get("/interview/{interview_id}", response_model=List[AudioMetadataResponse])
async def get_interview_recordings(
    interview_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Retrieves all voice recordings associated with an interview."""
    audio_col = get_audio_recordings_collection()
    cursor = audio_col.find({"interview_id": interview_id}).sort("created_at", 1)
    results = []
    for doc in cursor:
        d = serialize_doc(doc)
        d["audio_url"] = f"/api/voice/audio/{d['id']}"
        results.append(AudioMetadataResponse(**d))
    return results

@router.get("/{audio_id}", response_model=AudioMetadataResponse)
async def get_audio_metadata(
    audio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Retrieves metadata and transcript for a specific audio recording."""
    audio_col = get_audio_recordings_collection()
    try:
        obj_id = ObjectId(audio_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid audio ID format.")
        
    doc = audio_col.find_one({"_id": obj_id})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio recording not found.")
        
    d = serialize_doc(doc)
    d["audio_url"] = f"/api/voice/audio/{d['id']}"
    return AudioMetadataResponse(**d)

@router.put("/{audio_id}/transcription", response_model=AudioMetadataResponse)
async def update_transcription(
    audio_id: str,
    update_req: TranscriptionUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Allows candidates or interviewers to correct transcription typos before submission."""
    audio_col = get_audio_recordings_collection()
    try:
        obj_id = ObjectId(audio_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid audio ID format.")

    now = datetime.now(timezone.utc)
    res = audio_col.find_one_and_update(
        {"_id": obj_id},
        {"$set": {
            "edited_transcript": update_req.edited_transcript,
            "updated_at": now
        }},
        return_document=True
    )
    if not res:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio recording not found.")

    d = serialize_doc(res)
    d["audio_url"] = f"/api/voice/audio/{d['id']}"
    return AudioMetadataResponse(**d)

@router.post("/evaluate")
async def evaluate_voice_answer(
    req: VoiceEvaluationRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Submits a transcribed voice answer to the AI evaluation engine, linking the audio file.
    """
    audio_col = get_audio_recordings_collection()
    audio_doc = None
    try:
        obj_id = ObjectId(req.audio_id)
        audio_doc = audio_col.find_one({"_id": obj_id})
        if audio_doc:
            audio_col.update_one(
                {"_id": obj_id},
                {"$set": {"edited_transcript": req.final_answer, "status": "submitted"}}
            )
    except Exception as e:
        logger.warning(f"Voice evaluation audio link warning: {e}")

    eval_req = EvaluationRequest(
        interview_id=req.interview_id,
        question_id=req.question_id,
        question_text=req.question_text,
        domain=req.domain,
        expected_criteria=req.expected_criteria,
        candidate_answer=req.final_answer,
        interviewer_score=req.interviewer_score,
        interviewer_notes=req.interviewer_notes,
        submission_mode=req.submission_mode or "voice_recorded",
        audio_id=req.audio_id,
        audio_url=f"/api/voice/audio/{req.audio_id}",
        recording_duration=audio_doc.get("duration_seconds") if audio_doc else None,
        original_transcript=audio_doc.get("transcription") if audio_doc else None
    )

    eval_result = await evaluate_answer(eval_req=eval_req, current_user=current_user)
    return eval_result

@router.get("/takes/{interview_id}/{question_id}")
async def get_recording_takes(
    interview_id: str,
    question_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Returns all historical recording takes for a given question in reverse chronological order.
    Preserves audit history of all candidate attempts without ever overwriting audio.
    """
    audio_col = get_audio_recordings_collection()
    takes = list(audio_col.find({
        "interview_id": interview_id,
        "question_id": question_id
    }).sort("created_at", -1))
    
    result = []
    for t in takes:
        d = serialize_doc(t)
        d["audio_url"] = f"/api/voice/audio/{d['id']}"
        result.append(d)
    return result
