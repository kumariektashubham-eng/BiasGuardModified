import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Mic,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Headphones,
  AlertCircle,
  ShieldCheck,
  Pause,
  Clock,
  Sparkles,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { interviewsApi, voiceApi, evaluationsApi } from '../services/api';
import { formatApiError } from '../utils/errorFormatter';
import { Badge } from '../components/common/Badge';
import { VoiceAnswerRecorder } from '../components/voice/VoiceAnswerRecorder';

export const CandidateVoiceRoomPage = () => {
  const { id: interviewId } = useParams();
  const navigate = useNavigate();

  const [interview, setInterview] = useState(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Audio Answer State
  const [currentAudio, setCurrentAudio] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Background polling to stay in sync with interviewer actions
  const pollingRef = useRef(null);

  useEffect(() => {
    loadInterview(true);

    // Poll interview state every 4 seconds to sync status and dynamic questions
    pollingRef.current = setInterval(() => {
      loadInterview(false);
    }, 4000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [interviewId]);

  const loadInterview = async (initial = false) => {
    try {
      const res = await interviewsApi.get(interviewId);
      const data = res.data;
      setInterview(data);

      if (initial && data.questions?.length > 0) {
        const initialIdx = data.current_question_index || 0;
        const validIdx = Math.min(initialIdx, data.questions.length - 1);
        setActiveQuestionIndex(validIdx);
        populateQuestion(data.questions[validIdx]);
      }
    } catch (err) {
      if (initial) {
        setError("Unable to load interview room: " + formatApiError(err));
      }
    } finally {
      if (initial) setLoading(false);
    }
  };

  const populateQuestion = (q) => {
    if (q && (q.audio_id || q.audio_url)) {
      setCurrentAudio({
        audioId: q.audio_id,
        audioUrl: q.audio_url,
        duration: q.recording_duration || 0,
        submissionMode: 'voice_recorded'
      });
    } else {
      setCurrentAudio(null);
    }
    setSubmitSuccess(false);
  };

  const switchQuestion = (idx) => {
    if (!interview?.questions || idx < 0 || idx >= interview.questions.length) return;
    setActiveQuestionIndex(idx);
    populateQuestion(interview.questions[idx]);
  };

  const activeQuestion = interview?.questions?.[activeQuestionIndex];

  const handleRecordingComplete = ({ audioId, audioUrl, duration, status, statusLabel, statusMessage, speechDetected }) => {
    setCurrentAudio({
      audioId,
      audioUrl,
      duration,
      submissionMode: 'voice_recorded',
      status: status || 'ready',
      statusLabel: statusLabel || 'Completed',
      statusMessage: statusMessage || null,
      speechDetected: speechDetected !== false
    });
  };

  const handleClearRecording = () => {
    setCurrentAudio(null);
    setSubmitSuccess(false);
  };

  const handleSubmitSpokenAnswer = async () => {
    if (!currentAudio?.audioId) {
      alert("Please record your spoken answer using the microphone before submitting.");
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payload = {
        interview_id: interviewId,
        question_id: activeQuestion.id,
        question_text: activeQuestion.question_text,
        domain: activeQuestion.domain,
        expected_criteria: activeQuestion.expected_criteria || [],
        candidate_answer: "", // Auto-resolved internally by backend from audio_id
        submission_mode: 'voice_recorded',
        audio_id: currentAudio.audioId,
        audio_url: currentAudio.audioUrl,
        recording_duration: currentAudio.duration || null,
        interviewer_score: activeQuestion.interviewer_score !== undefined ? activeQuestion.interviewer_score : 7.0,
        interviewer_notes: activeQuestion.interviewer_notes || "Spoken response recorded in candidate voice room."
      };

      const res = await evaluationsApi.evaluate(payload);
      const evalData = res.data;
      const isEvaluated = evalData.ai_evaluation?.technical_score !== null && evalData.ai_evaluation?.technical_score !== undefined;

      // Refresh interview state
      const updated = await interviewsApi.get(interviewId);
      setInterview(updated.data);

      if (isEvaluated) {
        setSubmitSuccess(true);
        // Auto advance to next question after 1.5s if one exists
        setTimeout(() => {
          if (activeQuestionIndex < (updated.data.questions?.length || 1) - 1) {
            switchQuestion(activeQuestionIndex + 1);
          }
        }, 1500);
      } else {
        // Answer was not evaluated due to silence or unclear speech
        setSubmitSuccess(false);
        const warningMsg = evalData.ai_evaluation?.status_message || evalData.status_message || "No speech detected in your recording. Please record your answer again.";
        setError(warningMsg);
      }

    } catch (err) {
      setError("Answer submission error: " + formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        Connecting to Candidate Voice Interview Room...
      </div>
    );
  }

  if (!interview) {
    return (
      <div className="p-16 text-center text-slate-400 text-sm">
        Interview session not found. <Link to="/dashboard" className="text-purple-400 underline">Return to Dashboard</Link>
      </div>
    );
  }

  const isSessionPaused = interview.status === 'paused';
  const isSessionCompleted = interview.status === 'completed';
  const totalQuestions = interview.questions?.length || 0;
  const isLastQuestion = activeQuestionIndex >= totalQuestions - 1;
  const isCurrentQuestionAnswered = Boolean(currentAudio?.audioId || activeQuestion?.audio_id || activeQuestion?.evaluated);
  const allQuestionsAnswered = totalQuestions > 0 && interview.questions.every(q => q.evaluated || q.audio_id);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <button
            onClick={() => navigate(`/interviews/${interviewId}/evaluate`)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Evaluator Workspace
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Candidate Voice Interview Room
            </h1>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${isSessionCompleted
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : isSessionPaused
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                : 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
              }`}>
              {isSessionCompleted ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Completed</span>
                </>
              ) : isSessionPaused ? (
                <>
                  <Pause className="w-3 h-3 text-amber-400" />
                  <span>Interview Paused</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  <span>Active Session</span>
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Candidate: <span className="text-slate-200 font-semibold">{interview.candidate_name}</span> •
            Target Position: <span className="text-slate-300 font-medium">{interview.candidate_role || 'Engineering Candidate'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/reports/${interviewId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
          >
            <FileText className="w-3.5 h-3.5 text-purple-400" />
            <span>Audit Report</span>
          </Link>
        </div>
      </div>

      {/* Paused Banner */}
      {isSessionPaused && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-3">
          <Pause className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <span className="font-bold block">Interview Session Paused by Interviewer</span>
            <span className="text-slate-300">
              The interviewer has temporarily paused this session. Please stay on this screen; your progress and answered recordings remain safe.
            </span>
          </div>
        </div>
      )}

      {/* Concluded Banner */}
      {isSessionCompleted && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold block">Interview Session Concluded</span>
              <span className="text-slate-300">
                This interview has been officially ended by the interviewer. All voice recordings and technical evaluations are saved.
              </span>
            </div>
          </div>
          <Link
            to={`/reports/${interviewId}`}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
          >
            View Evaluation Report
          </Link>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Question Progress Tracker Bar */}
      <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          {interview.questions?.map((q, idx) => {
            const isCurrent = idx === activeQuestionIndex;
            const isDone = q.evaluated || q.audio_id || (isCurrent && currentAudio?.audioId);
            return (
              <button
                key={q.id || idx}
                onClick={() => switchQuestion(idx)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${isCurrent
                  ? 'bg-purple-600 text-white shadow-md'
                  : isDone
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
              >
                {isDone && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                <span>Question {idx + 1}</span>
              </button>
            );
          })}
        </div>

        <div className="text-[11px] font-mono text-slate-400 shrink-0">
          Question {activeQuestionIndex + 1} of {totalQuestions}
        </div>
      </div>

      {/* Active Question Card */}
      {activeQuestion ? (
        <div className="p-6 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 text-xs font-semibold">
                {activeQuestion.domain}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-xs">
                Difficulty: {activeQuestion.difficulty || 'Medium'}
              </span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Question #{activeQuestionIndex + 1}
            </span>
          </div>

          <h2 className="text-lg font-bold text-white leading-relaxed">
            {activeQuestion.question_text}
          </h2>

          {/* Expected Criteria Checklist */}
          {activeQuestion.expected_criteria?.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Evaluation Rubric & Focus Concepts:
              </span>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {activeQuestion.expected_criteria.map((c, i) => (
                  <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="p-12 text-center text-slate-400 text-xs bg-[#0F172A] border border-slate-800 rounded-2xl">
          No questions currently loaded in this interview session.
        </div>
      )}

      {/* Audio-First Voice Answer Recorder */}
      {activeQuestion && (
        <div className="p-6 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Mic className="w-4 h-4 text-purple-400" />
              <span>Voice Technical Response</span>
            </label>
            <span className="text-[11px] text-slate-400 font-mono">Audio-First Speech Evaluation</span>
          </div>

          <VoiceAnswerRecorder
            interviewId={interviewId}
            questionId={activeQuestion?.id}
            domain={activeQuestion?.domain}
            questionText={activeQuestion?.question_text}
            existingAudio={currentAudio}
            onRecordingComplete={handleRecordingComplete}
            onClearRecording={handleClearRecording}
          />
        </div>
      )}

      {/* Submit Success Notification */}
      {submitSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-bold">Voice answer recorded, securely saved, and submitted for AI evaluation!</span>
          </div>
          {!isLastQuestion && (
            <span className="text-[11px] text-emerald-400/80 font-mono">Advancing to Question {activeQuestionIndex + 2}...</span>
          )}
        </div>
      )}

      {/* Standby Card When All Questions are Answered (Continuous Waiting) */}
      {allQuestionsAnswered && (
        <div className="p-5 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-white block">
              All Current Questions Completed
            </span>
            <p className="text-slate-300 leading-relaxed">
              You have submitted answers for all questions asked so far. Please stay on this screen while your interviewer reviews your responses or presents the next technical question. The session remains active until concluded by the interviewer.
            </p>
          </div>
        </div>
      )}

      {/* Question Navigation & Submission Bar */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-800">
        <button
          type="button"
          onClick={() => switchQuestion(activeQuestionIndex - 1)}
          disabled={activeQuestionIndex === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous Question</span>
        </button>

        <div className="flex items-center gap-3">
          {/* Submit Voice Answer Button (Always voice submit, never ends session automatically) */}
          <button
            type="button"
            onClick={handleSubmitSpokenAnswer}
            disabled={submitting || !isCurrentQuestionAnswered}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Submitting & Transcribing...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Submit Voice Answer</span>
              </>
            )}
          </button>

          {!isLastQuestion && (
            <button
              type="button"
              onClick={() => switchQuestion(activeQuestionIndex + 1)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-800 transition-colors"
            >
              <span>Next Question</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
