import os
import wave
import struct
import tempfile
import pytest
from app.services.speech_validator import (
    validate_audio_file_silence,
    is_silence_or_hallucination,
    is_transcription_unclear,
    classify_recording_status
)
from app.services.ai_evaluator import evaluate_with_mock_engine, evaluate_with_openai
from app.models.evaluation import AIEvaluationOutput
from app.services.bias_detector import analyze_discrepancy


def create_test_wav(num_frames=8000, amplitude=0):
    """Generates an in-memory 16-bit mono 16kHz PCM WAV file with specified amplitude."""
    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    with wave.open(path, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        samples = [amplitude] * num_frames
        raw_data = struct.pack(f"<{num_frames}h", *samples)
        wf.writeframes(raw_data)
    return path


def test_silence_audio_file_probe():
    # 1. Pure silence WAV
    silent_path = create_test_wav(num_frames=16000, amplitude=0)
    try:
        size = os.path.getsize(silent_path)
        is_silent, reason = validate_audio_file_silence(silent_path, size, "audio/wav")
        assert is_silent is True
        assert "below audible speech threshold" in reason or "amplitude" in reason
    finally:
        if os.path.exists(silent_path):
            os.remove(silent_path)

    # 2. Spoken voice amplitude WAV (> 1000)
    speech_path = create_test_wav(num_frames=16000, amplitude=3500)
    try:
        size = os.path.getsize(speech_path)
        is_silent, reason = validate_audio_file_silence(speech_path, size, "audio/wav")
        assert is_silent is False
    finally:
        if os.path.exists(speech_path):
            os.remove(speech_path)

    # 3. Client VAD explicitly reported false
    dummy_path = create_test_wav(num_frames=16000, amplitude=3500)
    try:
        size = os.path.getsize(dummy_path)
        is_silent, reason = validate_audio_file_silence(dummy_path, size, "audio/wav", client_speech_detected=False)
        assert is_silent is True
        assert "browser voice monitor" in reason
    finally:
        if os.path.exists(dummy_path):
            os.remove(dummy_path)


def test_whisper_hallucination_detection():
    # Famous Whisper hallucinations produced on silence
    assert is_silence_or_hallucination("") is True
    assert is_silence_or_hallucination("   ") is True
    assert is_silence_or_hallucination("you") is True
    assert is_silence_or_hallucination(" you") is True
    assert is_silence_or_hallucination("you.") is True
    assert is_silence_or_hallucination("thank you.") is True
    assert is_silence_or_hallucination("Thank you for watching.") is True
    assert is_silence_or_hallucination("[silence]") is True
    assert is_silence_or_hallucination("...") is True
    assert is_silence_or_hallucination("bye-bye") is True

    # Real answer should NOT be flagged as hallucination
    assert is_silence_or_hallucination("In Java HashMap uses bucket chaining and converts to red-black tree") is False


def test_unclear_sound_detection():
    # Very short sound or noise under 3 words
    assert is_transcription_unclear("um") is True
    assert is_transcription_unclear("hello") is True
    assert is_transcription_unclear("yeah so") is True

    # Real answer with 3 or more words
    assert is_transcription_unclear("Dynamic programming memoization") is False
    assert is_transcription_unclear("Time complexity is O(N)") is False


def test_classify_recording_status():
    # Case A: Silence / Hallucination
    code, label, msg = classify_recording_status(" you", is_silent_audio=True)
    assert code == "no_speech_detected"
    assert label == "No Answer Detected"
    assert msg == "No speech detected. Please record your answer again."

    # Case B: Unclear / Short
    code, label, msg = classify_recording_status("um yeah")
    assert code == "transcription_unclear"
    assert label == "Transcription Unclear"
    assert msg == "Unable to understand the recorded answer. Please try again."

    # Case C: API Failure
    code, label, msg = classify_recording_status("", transcription_error="Groq API connection timeout")
    assert code == "transcription_failed"
    assert label == "Transcription Failed"
    assert msg == "Speech-to-text failed. Your original recording has been preserved. Please retry."

    # Case D: Completed Valid Answer
    code, label, msg = classify_recording_status(
        "A deadlock occurs when processes hold resources and wait for others forming circular wait."
    )
    assert code == "completed"
    assert label == "Completed"


def test_ai_evaluator_never_scores_silence():
    # Test 1: Complete silence / hallucination input
    result = evaluate_with_mock_engine(
        domain="DSA",
        question_text="Explain HashMap in Java",
        expected_criteria=["Bucket array", "Hash code", "Collision resolution"],
        candidate_answer=" you"
    )
    assert result["technical_score"] is None
    assert result["status"] == "no_speech_detected"
    assert result["status_label"] == "No Answer Detected"
    assert "No speech detected" in result["status_message"]
    # NEVER 4 or 0
    assert result["technical_score"] != 4.0
    assert result["technical_score"] != 0.0

    # Test 2: Empty answer
    result_empty = evaluate_with_mock_engine(
        domain="Python",
        question_text="What is the GIL?",
        expected_criteria=["Global Interpreter Lock", "CPython reference counting"],
        candidate_answer=""
    )
    assert result_empty["technical_score"] is None
    assert result_empty["status"] == "no_speech_detected"

    # Test 3: Unclear speech ("hello")
    result_unclear = evaluate_with_mock_engine(
        domain="Operating Systems",
        question_text="What is virtual memory?",
        expected_criteria=["Paging", "Page table", "TLB"],
        candidate_answer="hello"
    )
    assert result_unclear["technical_score"] is None
    assert result_unclear["status"] == "transcription_unclear"

    # Test 4: Genuine answer -> generates actual numeric score
    result_real = evaluate_with_mock_engine(
        domain="Java",
        question_text="Explain HashMap in Java 8 and equals/hashCode contract",
        expected_criteria=["Bucket array", "Red-black tree treeify", "equals and hashCode"],
        candidate_answer=(
            "In Java 8, HashMap uses an array of Node buckets. When collisions occur, keys are chained in a LinkedList. "
            "If a bucket reaches TREEIFY_THRESHOLD of 8 and table capacity is 64, it converts the list into a Red-Black Tree. "
            "Overriding equals without hashCode violates the contract."
        )
    )
    assert result_real["status"] == "completed"
    assert isinstance(result_real["technical_score"], float)
    assert result_real["technical_score"] >= 6.0


def test_bias_detector_handles_none_score():
    # Verify discrepancy detector safely handles None score without raising TypeError
    output = AIEvaluationOutput(
        technical_score=None,
        status="no_speech_detected",
        status_label="No Answer Detected",
        status_message="No speech detected. Please record your answer again.",
        correct_concepts=[],
        incorrect_concepts=[],
        missing_concepts=["No technical answer provided to evaluate."],
        alternative_valid_approaches=[],
        explanation="No speech detected. Please record your answer again.",
        potential_discrepancy=False,
        review_recommendation="Status: No Answer Detected."
    )
    disc = analyze_discrepancy(
        ai_eval=output,
        interviewer_score=7.0,
        interviewer_notes="Candidate did not say anything."
    )
    assert disc.detected is False
    assert disc.type == "NOT_EVALUATED"
    assert disc.score_delta == 0.0
    assert "not evaluated" in disc.evidence.lower()
