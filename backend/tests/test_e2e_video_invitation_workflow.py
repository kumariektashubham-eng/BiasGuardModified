import pytest
from bson import ObjectId
from app.database import get_interviews_collection, get_candidates_collection
from app.services.email_service import generate_invitation_token, hash_token
from app.services.livekit_service import (
    generate_interviewer_livekit_token,
    generate_candidate_livekit_token,
    get_room_name
)

@pytest.mark.anyio
async def test_full_video_invitation_and_recording_lifecycle():
    interviews_col = get_interviews_collection()
    candidates_col = get_candidates_collection()

    # 1. Fetch or create candidate
    candidate = candidates_col.find_one({})
    if not candidate:
        cand_res = candidates_col.insert_one({
            "name": "Alex Chen",
            "email": "alex.chen@example.com",
            "target_role": "Full Stack Engineer",
            "experience_years": 4.0,
            "primary_skills": ["Python", "React", "LiveKit"]
        })
        candidate_id = str(cand_res.inserted_id)
        candidate_name = "Alex Chen"
        candidate_email = "alex.chen@example.com"
    else:
        candidate_id = str(candidate["_id"])
        candidate_name = candidate.get("name", "Alex Chen")
        candidate_email = candidate.get("email", "alex.chen@example.com")

    # 2. Generate secure token
    raw_token, token_hash, expires_at = generate_invitation_token(expiry_hours=48)
    invite_url = f"http://localhost:5173/interview-room/{raw_token}"

    # 3. Create interview with invitation
    int_doc = {
        "title": "Full Stack Live Technical Assessment",
        "candidate_id": candidate_id,
        "candidate_name": candidate_name,
        "candidate_email": candidate_email,
        "interviewer_id": "interviewer_demo_id",
        "interviewer_name": "Senior Staff Interviewer",
        "domains": ["Python", "React"],
        "status": "not_started",
        "questions": [
            {
                "id": "q_fs_01",
                "domain": "Python",
                "question_text": "Explain Python asyncio event loop internals and how WebRTC streaming integrates with async tasks.",
                "difficulty": "Hard",
                "expected_criteria": ["Event loop cycle", "Cooperative multitasking", "WebRTC non-blocking I/O"],
                "candidate_answer": "",
                "transcription": "",
                "evaluated": False
            }
        ],
        "current_question_index": 0,
        "invitation": {
            "token_hash": token_hash,
            "expires_at": expires_at,
            "status": "sent",
            "candidate_email": candidate_email,
            "invite_url": invite_url
        },
        "room_name": ""
    }
    insert_res = interviews_col.insert_one(int_doc)
    interview_id = str(insert_res.inserted_id)
    room_name = get_room_name(interview_id)
    interviews_col.update_one({"_id": insert_res.inserted_id}, {"$set": {"room_name": room_name}})

    # 4. Candidate validates invitation by raw_token
    computed_hash = hash_token(raw_token)
    matched_interview = interviews_col.find_one({"invitation.token_hash": computed_hash})
    assert matched_interview is not None
    assert str(matched_interview["_id"]) == interview_id
    assert matched_interview["invitation"]["status"] == "sent"

    # 5. LiveKit Tokens Generation for both participants
    interviewer_token = generate_interviewer_livekit_token(
        interview_id=interview_id,
        user_id="interviewer_demo_id",
        user_name="Senior Staff Interviewer"
    )
    assert len(interviewer_token) > 50

    candidate_token = generate_candidate_livekit_token(
        interview_id=interview_id,
        candidate_id=candidate_id,
        candidate_name=candidate_name
    )
    assert len(candidate_token) > 50

    # 6. Simulate candidate answer recording upload
    test_transcript = "In Python asyncio, the event loop schedules and executes coroutines using non-blocking socket selectors."
    interviews_col.update_one(
        {"_id": insert_res.inserted_id, "questions.id": "q_fs_01"},
        {"$set": {
            "questions.$.transcription": test_transcript,
            "questions.$.candidate_answer": test_transcript,
            "questions.$.audio_url": f"/api/voice/audio/test_audio_01",
            "questions.$.video_url": f"/api/voice/video/test_video_01",
            "questions.$.recording_type": "video",
            "questions.$.submission_mode": "video_recorded",
            "questions.$.speech_detected": True
        }}
    )

    # 7. Verify question now reflects answer and media links
    updated_int = interviews_col.find_one({"_id": insert_res.inserted_id})
    q0 = updated_int["questions"][0]
    assert q0["transcription"] == test_transcript
    assert q0["video_url"] == "/api/voice/video/test_video_01"
    assert q0["recording_type"] == "video"

    # 8. Clean up test record
    interviews_col.delete_one({"_id": insert_res.inserted_id})
