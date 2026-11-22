import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ShieldCheck, 
  Brain, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  ArrowLeft, 
  ChevronRight, 
  ChevronDown,
  Headphones, 
  Mic, 
  History, 
  Clock, 
  User, 
  Check, 
  MessageSquare, 
  X,
  Volume2,
  FileAudio,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  Loader2,
  Play,
  Pause,
  Square,
  Plus,
  HelpCircle,
  Zap,
  RotateCcw,
  UploadCloud,
  Lock,
  Unlock,
  Save,
  Send
} from 'lucide-react';
import { interviewsApi, evaluationsApi, feedbackApi, voiceApi } from '../services/api';
import { Badge } from '../components/common/Badge';
import { VoiceAnswerRecorder } from '../components/voice/VoiceAnswerRecorder';
import { AudioPlayer } from '../components/voice/AudioPlayer';
import { AudioFileUpload } from '../components/voice/AudioFileUpload';
import { VideoInterviewPanel } from '../components/video/VideoInterviewPanel';
import { formatApiError } from '../utils/errorFormatter';

export const InterviewEvaluationPage = () => {
  const { id: interviewId } = useParams();
  const navigate = useNavigate();

  const [interview, setInterview] = useState(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState('');

  // Audio & Answer Transcripts State
  const [currentAudio, setCurrentAudio] = useState(null);
  const [recordingTakes, setRecordingTakes] = useState([]);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [retranscribing, setRetranscribing] = useState(false);
  const [retranscribeError, setRetranscribeError] = useState('');
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  // Interviewer Assessment State
  const [interviewerScore, setInterviewerScore] = useState(7.0);
  const [interviewerNotes, setInterviewerNotes] = useState('');
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [auditTrail, setAuditTrail] = useState([]);

  // Session Management State
  const [sessionActionLoading, setSessionActionLoading] = useState('');
  const [showEndModal, setShowEndModal] = useState(false);
  const [showAddQuestionModal, setShowAddQuestionModal] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [newQuestionData, setNewQuestionData] = useState({
    domain: 'DSA',
    question_text: '',
    difficulty: 'Medium',
    expected_criteria: ''
  });

  // AI Suggested Questions State
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [askingSuggestionId, setAskingSuggestionId] = useState('');
  const [suggestionError, setSuggestionError] = useState('');

  // Audio Recording Mode State
  const [audioInputMode, setAudioInputMode] = useState('record'); // 'record' | 'upload'
  const [savingScore, setSavingScore] = useState(false);
  const [scoreSavedSuccess, setScoreSavedSuccess] = useState(false);
  const [aiBackgroundEvaluating, setAiBackgroundEvaluating] = useState(false);

  // Expert Feedback Modal State
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [fbScore, setFbScore] = useState(8.5);
  const [fbExplanation, setFbExplanation] = useState('');
  const [fbConcepts, setFbConcepts] = useState('');
  const [fbIsAlt, setFbIsAlt] = useState(false);
  const [fbAltName, setFbAltName] = useState('');
  const [fbNotes, setFbNotes] = useState('');
  const [fbSubmitting, setFbSubmitting] = useState(false);
  const [fbSuccess, setFbSuccess] = useState(false);

  useEffect(() => {
    loadInterview();
  }, [interviewId]);

  const loadInterview = async (targetIndex = null) => {
    try {
      const [intRes, auditRes, sugRes] = await Promise.all([
        interviewsApi.get(interviewId),
        evaluationsApi.getAuditTrail(interviewId).catch(() => ({ data: [] })),
        interviewsApi.getSuggestedQuestions(interviewId).catch(() => ({ data: { suggested_questions: [] } }))
      ]);
      const intData = intRes.data;
      setInterview(intData);
      setAuditTrail(auditRes.data || []);
      if (sugRes.data?.suggested_questions?.length > 0) {
        setSuggestedQuestions(sugRes.data.suggested_questions);
      } else if (intData.suggested_questions?.length > 0) {
        setSuggestedQuestions(intData.suggested_questions);
      }

      const qList = intData.questions || [];
      if (qList.length > 0) {
        let indexToLoad = 0;
        if (targetIndex !== null && targetIndex >= 0 && targetIndex < qList.length) {
          indexToLoad = targetIndex;
        } else if (intData.current_question_index !== undefined && intData.current_question_index < qList.length) {
          indexToLoad = intData.current_question_index;
        }
        setActiveQuestionIndex(indexToLoad);
        populateQuestionState(qList[indexToLoad], intData);
      }
    } catch (err) {
      setError("Failed to load interview session: " + formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const loadSuggestions = async (force = false) => {
    setLoadingSuggestions(true);
    setSuggestionError('');
    try {
      const res = await interviewsApi.getSuggestedQuestions(interviewId, { force_refresh: force });
      setSuggestedQuestions(res.data?.suggested_questions || []);
    } catch (err) {
      console.warn("Could not load suggested questions:", err);
      setSuggestionError("Failed to load suggestions: " + formatApiError(err));
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleAskSuggestion = async (suggestionId) => {
    setAskingSuggestionId(suggestionId);
    setSuggestionError('');
    try {
      const res = await interviewsApi.askSuggestedQuestion(interviewId, suggestionId);
      setInterview(res.data);
      const newQuestions = res.data.questions || [];
      const newIdx = res.data.current_question_index !== undefined ? res.data.current_question_index : newQuestions.length - 1;
      await switchQuestion(newIdx);
      setSuggestedQuestions(prev => prev.filter(s => s.id !== suggestionId));
    } catch (err) {
      setSuggestionError("Failed to ask question: " + formatApiError(err));
    } finally {
      setAskingSuggestionId('');
    }
  };

  const handleSkipSuggestion = async (suggestionId) => {
    try {
      const res = await interviewsApi.skipSuggestedQuestion(interviewId, suggestionId);
      setSuggestedQuestions(res.data?.suggested_questions || []);
    } catch (err) {
      setSuggestedQuestions(prev => prev.filter(s => s.id !== suggestionId));
    }
  };

  const populateQuestionState = async (q, intDoc = interview) => {
    if (!q) return;
    setInterviewerScore(q.interviewer_score !== null && q.interviewer_score !== undefined ? q.interviewer_score : 7.0);
    setInterviewerNotes(q.interviewer_notes || '');
    setShowRecorder(false);
    setShowTranscript(false);
    setRetranscribeError('');

    let transcriptText = q.transcription || q.candidate_answer || '';

    // Load attached audio if present
    if (q.audio_id || q.audio_url) {
      setCurrentAudio({
        audioId: q.audio_id,
        audioUrl: q.audio_url,
        duration: q.recording_duration || 0,
        submissionMode: 'voice_recorded',
        transcription: transcriptText
      });
    } else {
      setCurrentAudio(null);
    }

    // Load historical recording takes for this question
    try {
      const takesRes = await voiceApi.getTakes(interviewId, q.id);
      setRecordingTakes(takesRes.data || []);
      if (takesRes.data?.length > 0) {
        const matchingTake = q.audio_id ? takesRes.data.find(t => t.id === q.audio_id) : takesRes.data[0];
        const takeToUse = matchingTake || takesRes.data[0];
        if (!transcriptText && takeToUse.transcription) {
          transcriptText = takeToUse.transcription;
        }
        if (!q.audio_id) {
          setCurrentAudio({
            audioId: takeToUse.id,
            audioUrl: takeToUse.audio_url,
            duration: takeToUse.duration_seconds || 0,
            submissionMode: 'voice_recorded',
            transcription: takeToUse.transcription || transcriptText,
            status: takeToUse.status,
            error: takeToUse.error
          });
        } else {
          setCurrentAudio(prev => prev ? {
            ...prev,
            transcription: prev.transcription || takeToUse.transcription || transcriptText,
            status: takeToUse.status,
            error: takeToUse.error
          } : null);
        }
      }
    } catch (e) {
      setRecordingTakes([]);
    }

    // Load evaluation if existing
    if (q.evaluation_id) {
      try {
        const evRes = await evaluationsApi.get(q.evaluation_id);
        setEvaluationResult(evRes.data);
        if (evRes.data.candidate_answer && !transcriptText) {
          transcriptText = evRes.data.candidate_answer;
        }
        setCurrentAudio(prev => {
          if (!prev && (evRes.data.audio_id || evRes.data.audio_url)) {
            return {
              audioId: evRes.data.audio_id,
              audioUrl: evRes.data.audio_url,
              duration: evRes.data.recording_duration || 0,
              submissionMode: 'voice_recorded',
              transcription: evRes.data.candidate_answer || transcriptText
            };
          }
          if (prev) {
            return {
              ...prev,
              transcription: prev.transcription || evRes.data.candidate_answer || transcriptText
            };
          }
          return null;
        });
      } catch (e) {
        setEvaluationResult(null);
      }
    } else {
      setEvaluationResult(null);
    }
  };

  const switchQuestion = async (index) => {
    if (!interview?.questions || index < 0 || index >= interview.questions.length) return;
    setActiveQuestionIndex(index);
    populateQuestionState(interview.questions[index]);

    // Sync active question to backend so candidate room aligns
    try {
      await interviewsApi.setActiveQuestion(interviewId, index);
    } catch (e) {
      // Non-blocking
    }
  };

  const activeQuestion = interview?.questions?.[activeQuestionIndex];

  // Session Control Actions
  const handleStartInterview = async () => {
    setSessionActionLoading('start');
    setError('');
    try {
      const res = await interviewsApi.start(interviewId);
      setInterview(res.data);
    } catch (err) {
      setError("Failed to start interview: " + formatApiError(err));
    } finally {
      setSessionActionLoading('');
    }
  };

  const handlePauseInterview = async () => {
    setSessionActionLoading('pause');
    setError('');
    try {
      const res = await interviewsApi.pause(interviewId);
      setInterview(res.data);
    } catch (err) {
      setError("Failed to pause interview: " + formatApiError(err));
    } finally {
      setSessionActionLoading('');
    }
  };

  const handleResumeInterview = async () => {
    setSessionActionLoading('resume');
    setError('');
    try {
      const res = await interviewsApi.resume(interviewId);
      setInterview(res.data);
    } catch (err) {
      setError("Failed to resume interview: " + formatApiError(err));
    } finally {
      setSessionActionLoading('');
    }
  };

  const handleEndInterview = async () => {
    setSessionActionLoading('end');
    setError('');
    try {
      const res = await interviewsApi.end(interviewId);
      setInterview(res.data);
      setShowEndModal(false);
      await loadInterview(activeQuestionIndex);
    } catch (err) {
      setError("Failed to end interview: " + formatApiError(err));
      setShowEndModal(false);
    } finally {
      setSessionActionLoading('');
    }
  };

  const handleSaveHumanScore = async () => {
    if (!activeQuestion) return;
    setSavingScore(true);
    setError('');
    try {
      const res = await evaluationsApi.saveHumanScore({
        interview_id: interviewId,
        question_id: activeQuestion.id,
        interviewer_score: parseFloat(interviewerScore),
        interviewer_notes: interviewerNotes
      });
      setScoreSavedSuccess(true);
      setTimeout(() => setScoreSavedSuccess(false), 3500);

      setInterview(prev => {
        if (!prev) return prev;
        const qList = [...(prev.questions || [])];
        if (qList[activeQuestionIndex]) {
          qList[activeQuestionIndex] = {
            ...qList[activeQuestionIndex],
            interviewer_score: parseFloat(interviewerScore),
            interviewer_notes: interviewerNotes,
            human_evaluated: true
          };
        }
        return { ...prev, questions: qList };
      });

      if (res.data?.score_audit_trail) {
        setAuditTrail(res.data.score_audit_trail);
      }
    } catch (err) {
      setError("Failed to save human score: " + formatApiError(err));
    } finally {
      setSavingScore(false);
    }
  };

  const handleGenerateQuestion = async () => {
    setSessionActionLoading('generate');
    setError('');
    setShowAddMenu(false);
    try {
      const domain = activeQuestion?.domain || (interview?.domains?.[0] || 'DSA');
      const res = await interviewsApi.generateQuestion(interviewId, domain);
      setInterview(res.data);
      const newIdx = res.data.questions.length - 1;
      await switchQuestion(newIdx);
    } catch (err) {
      setError("Failed to generate question: " + formatApiError(err));
    } finally {
      setSessionActionLoading('');
    }
  };

  const handleAddCustomQuestion = async (e) => {
    e.preventDefault();
    if (!newQuestionData.question_text.trim()) {
      alert("Question text is required.");
      return;
    }
    setSessionActionLoading('add_question');
    setError('');
    try {
      const criteriaList = newQuestionData.expected_criteria
        ? newQuestionData.expected_criteria.split(/[;\n]/).map(c => c.trim()).filter(Boolean)
        : [];

      const payload = {
        domain: newQuestionData.domain || 'DSA',
        question_text: newQuestionData.question_text.trim(),
        difficulty: newQuestionData.difficulty || 'Medium',
        expected_criteria: criteriaList
      };

      const res = await interviewsApi.addQuestion(interviewId, payload);
      setInterview(res.data);
      setShowAddQuestionModal(false);
      setNewQuestionData({
        domain: interview?.domains?.[0] || 'DSA',
        question_text: '',
        difficulty: 'Medium',
        expected_criteria: ''
      });
      const newIdx = res.data.questions.length - 1;
      await switchQuestion(newIdx);
    } catch (err) {
      setError("Failed to add question: " + formatApiError(err));
    } finally {
      setSessionActionLoading('');
    }
  };

  const handleRecordingComplete = ({ audioId, audioUrl, duration }) => {
    setCurrentAudio({
      audioId,
      audioUrl,
      duration,
      submissionMode: 'voice_recorded'
    });
    setShowRecorder(false);
    loadInterview(activeQuestionIndex);
    voiceApi.getTakes(interviewId, activeQuestion.id)
      .then(res => {
        setRecordingTakes(res.data || []);
        if (res.data?.[0]?.transcription) {
          setCurrentAudio(prev => ({
            ...prev,
            transcription: res.data[0].transcription
          }));
        }
      })
      .catch(() => {});
  };

  const handleRetranscribe = async () => {
    if (!currentAudio?.audioId) return;
    setRetranscribing(true);
    setRetranscribeError('');
    try {
      const formData = new FormData();
      formData.append('domain', activeQuestion?.domain || 'DSA');
      formData.append('question_text', activeQuestion?.question_text || '');
      const res = await voiceApi.retranscribe(currentAudio.audioId, formData);
      const newTranscript = res.data.transcription;
      setCurrentAudio(prev => ({
        ...prev,
        transcription: newTranscript,
        status: 'ready',
        error: null
      }));
      setShowTranscript(true);
      loadInterview(activeQuestionIndex);
    } catch (err) {
      setRetranscribeError(formatApiError(err, "Retranscription failed."));
    } finally {
      setRetranscribing(false);
    }
  };

  const handleCopyTranscript = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  const handleRunEvaluation = async () => {
    if (!currentAudio?.audioId && !activeQuestion?.audio_id) {
      alert("No candidate voice recording found for this question. Please record audio before evaluating.");
      return;
    }
    setEvaluating(true);
    setError('');

    try {
      const payload = {
        interview_id: interviewId,
        question_id: activeQuestion.id,
        question_text: activeQuestion.question_text,
        domain: activeQuestion.domain,
        expected_criteria: activeQuestion.expected_criteria || [],
        candidate_answer: "", // Automatically resolved from audio_id by backend
        interviewer_score: parseFloat(interviewerScore),
        interviewer_notes: interviewerNotes,
        submission_mode: 'voice_recorded',
        audio_id: currentAudio?.audioId || activeQuestion.audio_id,
        audio_url: currentAudio?.audioUrl || activeQuestion.audio_url,
        recording_duration: currentAudio?.duration || activeQuestion.recording_duration || null
      };

      const res = await evaluationsApi.evaluate(payload);
      setEvaluationResult(res.data);

      const [updatedInt, updatedAudits] = await Promise.all([
        interviewsApi.get(interviewId),
        evaluationsApi.getAuditTrail(interviewId)
      ]);
      setInterview(updatedInt.data);
      setAuditTrail(updatedAudits.data || []);

    } catch (err) {
      setError("Evaluation failed: " + formatApiError(err));
    } finally {
      setEvaluating(false);
    }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!evaluationResult?.id) return;
    setFbSubmitting(true);
    try {
      const payload = {
        evaluation_id: evaluationResult.id,
        interview_id: interviewId,
        question_id: activeQuestion.id,
        candidate_id: interview.candidate_id,
        domain: activeQuestion.domain,
        corrected_score: parseFloat(fbScore),
        expert_explanation: fbExplanation,
        verified_concepts: fbConcepts.split(';').map(c => c.trim()).filter(Boolean),
        is_alternative_approach: fbIsAlt,
        alternative_approach_name: fbAltName,
        reviewer_notes: fbNotes,
      };
      await feedbackApi.submit(payload);
      setFbSuccess(true);
      setTimeout(() => {
        setShowFeedbackModal(false);
        setFbSuccess(false);
      }, 1500);
    } catch (err) {
      alert("Error submitting expert feedback: " + formatApiError(err));
    } finally {
      setFbSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        Loading Evaluator Workspace...
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

  const questionAudits = auditTrail.filter(a => a.question_id === activeQuestion?.id);
  const sessionStatus = interview.status || 'not_started';
  const totalQuestions = interview.questions?.length || 0;
  const evaluatedQuestions = interview.questions?.filter(q => q.evaluated)?.length || 0;
  const allCurrentQuestionsEvaluated = totalQuestions > 0 && evaluatedQuestions === totalQuestions;

  return (
    <div className="space-y-6">
      {/* Top Header: Candidate Details, Session Status & Interviewer Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <button 
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">{interview.title}</h1>
            
            {/* Session Status Badge */}
            {sessionStatus === 'active' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Active Session
              </span>
            )}
            {sessionStatus === 'paused' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <Pause className="w-3 h-3" />
                Paused
              </span>
            )}
            {sessionStatus === 'completed' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                <CheckCircle2 className="w-3 h-3" />
                Completed
              </span>
            )}
            {sessionStatus === 'not_started' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                <Clock className="w-3 h-3" />
                Not Started
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-1 font-mono">
            <span>Candidate: <strong className="text-slate-200">{interview.candidate_name}</strong></span>
            <span>•</span>
            <span>Role: <strong className="text-slate-300">{interview.candidate_role || 'Software Engineer'}</strong></span>
            <span>•</span>
            <span>Domains: <strong className="text-purple-400">{interview.domains?.join(', ')}</strong></span>
          </div>
        </div>

        {/* Top Control Action Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Start Button if not started */}
          {sessionStatus === 'not_started' && (
            <button
              onClick={handleStartInterview}
              disabled={Boolean(sessionActionLoading)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
            >
              {sessionActionLoading === 'start' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>Start Interview</span>
            </button>
          )}

          {/* Pause Button if active */}
          {sessionStatus === 'active' && (
            <button
              onClick={handlePauseInterview}
              disabled={Boolean(sessionActionLoading)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs font-semibold border border-amber-500/30 transition-all disabled:opacity-50"
              title="Pause the interview session temporarily"
            >
              {sessionActionLoading === 'pause' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <Pause className="w-3.5 h-3.5" />
              )}
              <span>Pause</span>
            </button>
          )}

          {/* Resume Button if paused */}
          {sessionStatus === 'paused' && (
            <button
              onClick={handleResumeInterview}
              disabled={Boolean(sessionActionLoading)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
            >
              {sessionActionLoading === 'resume' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>Resume Interview</span>
            </button>
          )}

          {/* Add Question Menu (Available when session is not completed) */}
          {sessionStatus !== 'completed' && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAddMenu(!showAddMenu)}
                disabled={Boolean(sessionActionLoading)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-bold border border-purple-500/30 transition-all"
              >
                <Plus className="w-4 h-4 text-purple-400" />
                <span>Add Question</span>
                <ChevronDown className="w-3 h-3 text-purple-400" />
              </button>

              {showAddMenu && (
                <div className="absolute right-0 mt-1.5 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    type="button"
                    onClick={handleGenerateQuestion}
                    disabled={sessionActionLoading === 'generate'}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:bg-purple-600/20 hover:text-purple-300 flex items-center gap-2 transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5 text-purple-400" />
                    <div>
                      <div>Generate Relevant Question</div>
                      <div className="text-[10px] text-slate-400 font-normal">Auto-selected from domain rubric</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAddMenu(false);
                      setNewQuestionData(prev => ({
                        ...prev,
                        domain: activeQuestion?.domain || (interview.domains?.[0] || 'DSA')
                      }));
                      setShowAddQuestionModal(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:bg-purple-600/20 hover:text-purple-300 flex items-center gap-2 transition-colors mt-0.5"
                  >
                    <Plus className="w-3.5 h-3.5 text-purple-400" />
                    <div>
                      <div>Custom Question</div>
                      <div className="text-[10px] text-slate-400 font-normal">Add your own technical prompt</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* End Interview Button (Available when active or paused) */}
          {(sessionStatus === 'active' || sessionStatus === 'paused') && (
            <button
              onClick={() => setShowEndModal(true)}
              disabled={Boolean(sessionActionLoading)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs font-bold border border-rose-500/30 transition-all disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5" />
              <span>End Interview</span>
            </button>
          )}

          {/* Full Audit Report Link */}
          <Link
            to={`/reports/${interviewId}`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-800 transition-all"
          >
            <FileText className="w-3.5 h-3.5 text-purple-400" />
            <span>Audit Report</span>
          </Link>
        </div>
      </div>

      {/* Continuous Session Banner: When all current questions are completed */}
      {allCurrentQuestionsEvaluated && sessionStatus !== 'completed' && (
        <div className="p-4 rounded-xl bg-purple-900/20 border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <p className="font-bold text-white">
                All {totalQuestions} current questions have been evaluated! The interview remains active.
              </p>
              <p className="text-slate-400 text-[11px] mt-0.5">
                The session will continue until you explicitly end it. You can generate another question or end the interview.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleGenerateQuestion}
              disabled={Boolean(sessionActionLoading)}
              className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Generate Next Question</span>
            </button>
            <button
              onClick={() => setShowEndModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
              <span>End Interview</span>
            </button>
          </div>
        </div>
      )}

      {/* Question Progress Navigation Bar with Quick + Add Button */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {interview.questions?.map((q, idx) => {
          const isCurrent = idx === activeQuestionIndex;
          const isEvaluated = q.evaluated;
          const hasAudio = Boolean(q.audio_id || (isCurrent && currentAudio?.audioId));
          return (
            <button
              key={q.id || idx}
              onClick={() => switchQuestion(idx)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 border ${
                isCurrent
                  ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-600/20'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>Question {idx + 1}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                isCurrent ? 'bg-purple-700 text-white' : 'bg-slate-800 text-slate-400'
              }`}>
                {q.domain}
              </span>
              {hasAudio && (
                <Headphones className={`w-3.5 h-3.5 ${isCurrent ? 'text-white' : 'text-purple-400'}`} />
              )}
              {isEvaluated && (
                <Check className={`w-3.5 h-3.5 ${isCurrent ? 'text-white' : 'text-emerald-400'}`} />
              )}
            </button>
          );
        })}

        {/* Quick Add Pill in Navigation Strip */}
        {sessionStatus !== 'completed' && (
          <button
            type="button"
            onClick={handleGenerateQuestion}
            disabled={Boolean(sessionActionLoading)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900/60 hover:bg-purple-900/30 text-purple-400 border border-dashed border-purple-500/40 hover:border-purple-500 transition-all shrink-0"
            title="Generate and append an additional question"
          >
            {sessionActionLoading === 'generate' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>Generate Next Question</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Integrated Live Video & Question Answer Recording Panel */}
      <VideoInterviewPanel
        interviewId={interviewId}
        interview={interview}
        activeQuestion={activeQuestion}
        activeQuestionIndex={activeQuestionIndex}
        onNextQuestion={(nextIdx) => switchQuestion(nextIdx)}
        onQuestionChanged={(idx) => switchQuestion(idx)}
        onReloadInterview={() => loadInterview(activeQuestionIndex)}
        onAnswerRecorded={(uploadResult) => {
          handleRecordingComplete({
            audioId: uploadResult.audio_id,
            audioUrl: uploadResult.audio_url,
            duration: uploadResult.duration_seconds
          });
          if (uploadResult.transcription) {
            setCurrentAudio(prev => ({
              ...prev,
              transcription: uploadResult.transcription,
              audioId: uploadResult.audio_id,
              audioUrl: uploadResult.audio_url,
              duration: uploadResult.duration_seconds,
              submissionMode: uploadResult.submission_mode || 'voice_recorded'
            }));
            setShowTranscript(true);
          }
          loadInterview(activeQuestionIndex);
        }}
        onError={(msg) => setError(msg)}
      />

      {/* Main Split Layout: Left Column (Audio & Assessment) | Right Column (AI Evaluation Audit) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (7 Cols): Question Details, Candidate Audio Response, Interviewer Assessment */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Active Question Card */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="primary" size="sm">{activeQuestion?.domain}</Badge>
                <Badge variant="default" size="xs">Difficulty: {activeQuestion?.difficulty || 'Medium'}</Badge>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Question {activeQuestionIndex + 1} of {interview.questions?.length}
              </span>
            </div>

            <h2 className="text-base font-semibold text-white leading-snug">
              {activeQuestion?.question_text}
            </h2>

            {/* Expected Criteria Checklist */}
            {activeQuestion?.expected_criteria?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-800/80">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                  Expected Rubric & Benchmark Criteria:
                </span>
                <ul className="space-y-1">
                  {activeQuestion.expected_criteria.map((crit, cIdx) => (
                    <li key={cIdx} className="text-xs text-slate-300 flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0"></span>
                      <span>{crit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Active Question Push & Next Question Controls */}
            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!activeQuestion) return;
                  try {
                    await interviewsApi.sendQuestion(interviewId, {
                      question_id: activeQuestion.id,
                      question_index: activeQuestionIndex
                    });
                    loadInterview(activeQuestionIndex);
                  } catch (e) {
                    setError("Failed to send question: " + formatApiError(e));
                  }
                }}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/30 cursor-pointer"
                title="Send active question to candidate room in real-time"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Question to Candidate</span>
              </button>

              {activeQuestionIndex < (interview?.questions?.length || 0) - 1 && (
                <button
                  type="button"
                  onClick={() => switchQuestion(activeQuestionIndex + 1)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs flex items-center gap-1 border border-slate-700 cursor-pointer"
                >
                  <span>Next Question</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Answer Transcripts Section (Audio-First Technical Evaluation) */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileAudio className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Answer Transcripts
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  Groq Whisper-large-v3
                </span>
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Audio-First Review
                </span>
              </div>
            </div>

            {/* If an audio recording exists: Display primary AudioPlayer & Answer Transcripts Controls */}
            {currentAudio?.audioUrl ? (
              <div className="space-y-4">
                {/* 1. Original Candidate Audio Player */}
                <div className="p-4 rounded-xl bg-slate-900 border border-purple-500/30 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 text-purple-400" />
                      Original Candidate Recording
                    </span>
                    {currentAudio.duration > 0 && (
                      <span className="font-mono text-slate-400">
                        Duration: {Math.floor(currentAudio.duration / 60)}:{(Math.floor(currentAudio.duration % 60)).toString().padStart(2, '0')}
                      </span>
                    )}
                  </div>

                  <AudioPlayer 
                    audioUrl={currentAudio.audioUrl} 
                    title={`${interview.candidate_name} - Q${activeQuestionIndex + 1}`} 
                    duration={currentAudio.duration}
                  />
                </div>

                {/* Historical Takes / Re-recordings Picker */}
                {recordingTakes.length > 1 && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="flex items-center gap-1 font-semibold text-slate-300">
                        <History className="w-3.5 h-3.5 text-purple-400" />
                        Candidate Recording Takes ({recordingTakes.length}):
                      </span>
                      <span>Chronological takes preserved</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recordingTakes.map((take, tIdx) => {
                        const isCurrentTake = take.id === currentAudio.audioId;
                        return (
                          <button
                            key={take.id}
                            type="button"
                            onClick={() => setCurrentAudio({
                              audioId: take.id,
                              audioUrl: take.audio_url,
                              duration: take.duration_seconds || 0,
                              submissionMode: 'voice_recorded',
                              transcription: take.transcription || currentAudio.transcription,
                              status: take.status,
                              error: take.error
                            })}
                            className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 ${
                              isCurrentTake
                                ? 'bg-purple-600 text-white font-bold'
                                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                            }`}
                          >
                            <FileAudio className="w-3 h-3" />
                            <span>Take {recordingTakes.length - tIdx}</span>
                            <span className="text-[10px] opacity-70">({Math.round(take.duration_seconds || 0)}s)</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Answer Transcripts Action Bar & View Transcript Button */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowTranscript(!showTranscript)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${
                        showTranscript
                          ? 'bg-purple-600 text-white border border-purple-400'
                          : 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 hover:text-white'
                      }`}
                    >
                      {showTranscript ? (
                        <>
                          <EyeOff className="w-4 h-4 text-white" />
                          <span>Hide Transcript</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4 text-purple-400" />
                          <span>View Transcript</span>
                        </>
                      )}
                    </button>

                    {currentAudio?.transcription ? (
                      <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Ready ({currentAudio.transcription.split(/\s+/).filter(Boolean).length} words)</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 animate-pulse" />
                        <span>Transcript Pending</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRetranscribe}
                      disabled={retranscribing}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium border border-slate-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      title="Re-run Speech-to-Text transcription"
                    >
                      {retranscribing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                          <span>Transcribing...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 text-purple-400" />
                          <span>Retry Transcription</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Retranscription Error Alert */}
                {retranscribeError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{retranscribeError}</span>
                  </div>
                )}

                {/* 3. Automatically Generated Transcript Reader */}
                {showTranscript && (
                  <div className="p-4 rounded-xl bg-slate-950 border border-purple-500/40 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-purple-400" />
                          <h4 className="text-xs font-bold text-white tracking-wide">
                            Automatically Generated Speech-to-Text Transcript
                          </h4>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Transcribed with technical vocabulary context priming.
                        </p>
                      </div>

                      {currentAudio?.transcription && (
                        <button
                          type="button"
                          onClick={() => handleCopyTranscript(currentAudio.transcription)}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono border border-slate-800 transition-colors flex items-center gap-1.5"
                        >
                          {copiedTranscript ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>Copy Text</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {currentAudio?.transcription ? (
                      <div className="p-3.5 rounded-lg bg-slate-900/90 text-slate-200 text-xs sm:text-sm font-sans leading-relaxed border border-slate-800/80 max-h-72 overflow-y-auto whitespace-pre-wrap selection:bg-purple-600 selection:text-white">
                        {currentAudio.transcription}
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-slate-900/50 border border-dashed border-slate-800 text-center space-y-2">
                        <p className="text-xs text-slate-400">
                          No text transcript available yet for this recording.
                        </p>
                        <button
                          type="button"
                          onClick={handleRetranscribe}
                          disabled={retranscribing}
                          className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Generate Transcript Now</span>
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                      <span>Compare against the audio player above to check for nuances</span>
                      <span>Evaluated internally by AI engine</span>
                    </div>
                  </div>
                )}

                {/* Option to record another take or upload different audio */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const nextShow = !showRecorder || audioInputMode !== 'record';
                        setAudioInputMode('record');
                        setShowRecorder(nextShow);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-purple-300 hover:text-purple-200 border border-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>{showRecorder && audioInputMode === 'record' ? 'Hide Microphone' : 'Record Another Take'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const nextShow = !showRecorder || audioInputMode !== 'upload';
                        setAudioInputMode('upload');
                        setShowRecorder(nextShow);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>{showRecorder && audioInputMode === 'upload' ? 'Hide Uploader' : 'Upload Alternative Audio'}</span>
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-500 font-mono">
                    All takes preserved
                  </span>
                </div>

                {showRecorder && (
                  <div className="pt-2 border-t border-slate-800/50">
                    {audioInputMode === 'record' ? (
                      <VoiceAnswerRecorder 
                        interviewId={interviewId}
                        questionId={activeQuestion?.id}
                        domain={activeQuestion?.domain}
                        questionText={activeQuestion?.question_text}
                        onRecordingComplete={handleRecordingComplete}
                      />
                    ) : (
                      <AudioFileUpload
                        interviewId={interviewId}
                        questionId={activeQuestion?.id}
                        domain={activeQuestion?.domain}
                        questionText={activeQuestion?.question_text}
                        onTranscriptionComplete={(result) => {
                          setCurrentAudio({
                            audioId: result.id,
                            audioUrl: result.audio_url,
                            duration: result.duration_seconds || 0,
                            submissionMode: 'audio_upload',
                            transcription: result.transcription
                          });
                          setShowRecorder(false);
                          loadInterview(activeQuestionIndex);
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* No recording yet: Direct Interviewer Recording Controls */
              <div className="space-y-4">
                {/* Mode Selector Tabs: Live Microphone vs Upload File */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAudioInputMode('record')}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                        audioInputMode === 'record'
                          ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>Live Candidate Microphone</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAudioInputMode('upload')}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                        audioInputMode === 'upload'
                          ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Upload Remote Audio File</span>
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono">
                    {audioInputMode === 'record' ? 'Record candidate in-person / call' : 'Upload pre-recorded audio (.wav, .mp3, .webm)'}
                  </span>
                </div>

                {/* Live Microphone Recorder */}
                {audioInputMode === 'record' && (
                  <VoiceAnswerRecorder 
                    interviewId={interviewId}
                    questionId={activeQuestion?.id}
                    domain={activeQuestion?.domain}
                    questionText={activeQuestion?.question_text}
                    onRecordingComplete={handleRecordingComplete}
                  />
                )}

                {/* Upload Audio File */}
                {audioInputMode === 'upload' && (
                  <AudioFileUpload
                    interviewId={interviewId}
                    questionId={activeQuestion?.id}
                    domain={activeQuestion?.domain}
                    questionText={activeQuestion?.question_text}
                    onTranscriptionComplete={(result) => {
                      setCurrentAudio({
                        audioId: result.id,
                        audioUrl: result.audio_url,
                        duration: result.duration_seconds || 0,
                        submissionMode: 'audio_upload',
                        transcription: result.transcription
                      });
                      loadInterview(activeQuestionIndex);
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {/* Interviewer Independent Assessment Form */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Interviewer's Independent Assessment
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {activeQuestion?.interviewer_score !== null && activeQuestion?.interviewer_score !== undefined ? (
                  <Badge variant="emerald" size="xs">
                    Score Saved: {activeQuestion.interviewer_score} / 10
                  </Badge>
                ) : (
                  <Badge variant="amber" size="xs">
                    Pending Human Score
                  </Badge>
                )}
              </div>
            </div>

            {/* Scoring Rubric Reference Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 pb-1">
              <div className={`p-2 rounded-lg border text-center transition-all ${
                interviewerScore <= 3.5 ? 'bg-rose-500/10 border-rose-500/40 text-rose-300' : 'bg-slate-900/60 border-slate-800 text-slate-400'
              }`}>
                <div className="font-bold text-[11px]">1.0 - 3.5</div>
                <div className="text-[10px] mt-0.5">Unsatisfactory</div>
              </div>
              <div className={`p-2 rounded-lg border text-center transition-all ${
                interviewerScore > 3.5 && interviewerScore <= 6.5 ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' : 'bg-slate-900/60 border-slate-800 text-slate-400'
              }`}>
                <div className="font-bold text-[11px]">4.0 - 6.5</div>
                <div className="text-[10px] mt-0.5">Average</div>
              </div>
              <div className={`p-2 rounded-lg border text-center transition-all ${
                interviewerScore > 6.5 && interviewerScore <= 8.5 ? 'bg-purple-500/10 border-purple-500/40 text-purple-300' : 'bg-slate-900/60 border-slate-800 text-slate-400'
              }`}>
                <div className="font-bold text-[11px]">7.0 - 8.5</div>
                <div className="text-[10px] mt-0.5">Proficient</div>
              </div>
              <div className={`p-2 rounded-lg border text-center transition-all ${
                interviewerScore > 8.5 ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-slate-900/60 border-slate-800 text-slate-400'
              }`}>
                <div className="font-bold text-[11px]">9.0 - 10.0</div>
                <div className="text-[10px] mt-0.5">Exceptional</div>
              </div>
            </div>

            {/* Score Slider & Numeric Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Assign Independent Score:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={interviewerScore}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) setInterviewerScore(Math.min(10, Math.max(0, val)));
                    }}
                    className="w-16 px-2 py-1 text-center font-black text-purple-400 bg-slate-950 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-purple-500"
                  />
                  <span className="text-xs text-slate-500">/ 10</span>
                </div>
              </div>

              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={interviewerScore}
                onChange={(e) => setInterviewerScore(parseFloat(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
              />
            </div>

            {/* Interviewer Notes */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Interviewer's Observations & Technical Justification:
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Candidate gave an accurate explanation of memory mechanics; properly analyzed trade-offs..."
                value={interviewerNotes}
                onChange={(e) => setInterviewerNotes(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            {/* Save Human Score Button */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleSaveHumanScore}
                disabled={savingScore}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-600/25 active:scale-[0.99] disabled:opacity-50"
              >
                {savingScore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving Human Score & Logging Audit...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 text-purple-200" />
                    <span>
                      {activeQuestion?.interviewer_score !== null && activeQuestion?.interviewer_score !== undefined
                        ? 'Update Human Score'
                        : 'Save Human Score'}
                    </span>
                  </>
                )}
              </button>

              {scoreSavedSuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Human score of {interviewerScore}/10 successfully saved to audit log!</span>
                </div>
              )}

              <p className="text-[11px] text-slate-500 text-center font-mono">
                Pure independent evaluation • AI scores remain sealed until interview completion
              </p>
            </div>
          </div>

          {/* Interviewer Score Change Audit Trail */}
          {questionAudits.length > 0 && (
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Score Modification Audit Trail ({questionAudits.length})
                  </h3>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Immutable Log</span>
              </div>

              <div className="space-y-2">
                {questionAudits.map((a, i) => (
                  <div key={a.id || i} className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">
                        {a.modified_by || 'Interviewer'}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(a.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-400">Score Assigned:</span>
                      {a.previous_score !== null && a.previous_score !== undefined ? (
                        <>
                          <span className="line-through text-slate-500">{a.previous_score}</span>
                          <span className="text-slate-400">→</span>
                        </>
                      ) : null}
                      <span className="font-bold text-purple-400">{a.new_score} / 10</span>
                    </div>
                    {a.new_notes && (
                      <p className="text-[11px] text-slate-400 italic">"{a.new_notes}"</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Right Column (5 Cols): Independent AI Assessment & Follow-up Suggestions */}
        <div className="lg:col-span-5 space-y-4">
          
          {sessionStatus !== 'completed' ? (
            /* ACTIVE SESSION: AI Evaluation is SEALED to ensure zero human anchoring */
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    AI Technical Assessment
                  </h3>
                </div>
                <Badge variant="purple" size="xs">
                  <span className="flex items-center gap-1">
                    <Lock className="w-3 h-3 text-purple-300" />
                    Sealed During Interview
                  </span>
                </Badge>
              </div>

              {!currentAudio?.audioId && !activeQuestion?.audio_id && !activeQuestion?.candidate_answer ? (
                <div className="p-6 rounded-xl bg-slate-900/60 border border-dashed border-slate-800 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                    <Mic className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-bold text-white">Awaiting Spoken Response</h4>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    Record the candidate's answer on the left. BiasGuard AI will independently evaluate it in the background as soon as speech is transcribed.
                  </p>
                </div>
              ) : aiBackgroundEvaluating ? (
                <div className="p-6 rounded-xl bg-purple-900/10 border border-purple-500/30 text-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-400 mx-auto" />
                  <div>
                    <h4 className="text-xs font-bold text-white">Evaluating in Background...</h4>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Analyzing technical correctness (40%), conceptual understanding (30%), completeness (20%), and reasoning (10%).
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">AI Evaluation Complete & Sealed</h4>
                      <p className="text-[10px] text-purple-300/80 font-mono">
                        Pure Double-Blind Independent Assessment
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    BiasGuard AI has independently analyzed this candidate answer against technical rubrics and standard benchmarks without viewing your score.
                  </p>

                  <div className="space-y-1.5 pt-1 text-[11px] text-slate-300 font-sans border-t border-purple-500/20">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Transcribed via Groq Whisper-large-v3</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>4-part weighted scoring rubric computed independently</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Verified concepts & alternative approaches cataloged</span>
                    </div>
                    <div className="flex items-center gap-2 text-purple-300 font-medium">
                      <Lock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>AI scores & analysis remain locked until you end the interview</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Human anchoring prevention</span>
                    <span className="text-emerald-400 font-mono font-semibold">Active</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* COMPLETED SESSION: AI Evaluation is UNSEALED */
            evaluationResult ? (
              evaluationResult.ai_evaluation?.technical_score === null || evaluationResult.ai_evaluation?.technical_score === undefined ? (
                /* Case A / B / C: Not Evaluated State (Silence, Unclear Sound, or Transcription Failure) */
                <div className="bg-[#0F172A] border border-amber-500/30 rounded-2xl p-5 space-y-5 shadow-xl animate-in fade-in duration-300">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-amber-400" />
                      <span className="text-sm font-bold text-white">AI Technical Assessment</span>
                    </div>
                    <Badge variant="amber" size="xs">
                      {evaluationResult.ai_evaluation?.status_label || evaluationResult.status_label || "No Answer Detected"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
                      <span className="text-[11px] font-semibold text-slate-400 block mb-1">Interviewer Score</span>
                      <span className="text-2xl font-black text-slate-200">
                        {evaluationResult.interviewer_score ?? 'N/A'}
                      </span>
                      <span className="text-[10px] text-slate-400 block">/ 10</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center flex flex-col justify-center items-center">
                      <span className="text-[11px] font-semibold text-amber-300 block mb-1">AI Technical Score</span>
                      <span className="text-lg font-black text-amber-400">
                        Not Evaluated
                      </span>
                      <span className="text-[10px] text-amber-400/70 block mt-0.5">No numerical score assigned</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                    <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{evaluationResult.ai_evaluation?.status_label || evaluationResult.status_label || "No Answer Detected"}</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {evaluationResult.ai_evaluation?.status_message || evaluationResult.ai_evaluation?.explanation || "No speech detected. Please record your answer again."}
                    </p>
                  </div>
                </div>
              ) : (
              <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl animate-in fade-in duration-300">
                
                {/* Header & Discrepancy Badge */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-400" />
                    <div>
                      <span className="text-sm font-bold text-white block">AI Evaluation Audit</span>
                      <span className="text-[10px] text-emerald-400 font-mono">Unsealed • Complete Analysis</span>
                    </div>
                  </div>
                  <Badge variant={evaluationResult.discrepancy?.detected ? 'rose' : 'emerald'} size="xs">
                    {evaluationResult.discrepancy?.bias_category || 'Calibrated'}
                  </Badge>
                </div>

                {/* Side-by-side Score Comparison */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1">Interviewer Score</span>
                    <span className="text-2xl font-black text-slate-200">
                      {evaluationResult.interviewer_score ?? 'N/A'}
                    </span>
                    <span className="text-[10px] text-slate-400 block">/ 10</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-center">
                    <span className="text-[11px] font-semibold text-purple-300 block mb-1">AI Technical Score</span>
                    <span className="text-2xl font-black text-purple-400">
                      {evaluationResult.ai_evaluation?.technical_score}
                    </span>
                    <span className="text-[10px] text-slate-400 block">/ 10</span>
                  </div>
                </div>

                {/* 4-Part Weighted Rubric Breakdown */}
                {evaluationResult.ai_evaluation?.score_breakdown && (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Rubric Scoring Breakdown (10.0 Scale):
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400">Correctness (40%)</div>
                        <div className="font-bold text-slate-200 mt-0.5">
                          {evaluationResult.ai_evaluation.score_breakdown.technical_correctness ?? 'N/A'} / 4.0
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400">Understanding (30%)</div>
                        <div className="font-bold text-slate-200 mt-0.5">
                          {evaluationResult.ai_evaluation.score_breakdown.conceptual_understanding ?? 'N/A'} / 3.0
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400">Completeness (20%)</div>
                        <div className="font-bold text-slate-200 mt-0.5">
                          {evaluationResult.ai_evaluation.score_breakdown.completeness ?? 'N/A'} / 2.0
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400">Reasoning (10%)</div>
                        <div className="font-bold text-slate-200 mt-0.5">
                          {evaluationResult.ai_evaluation.score_breakdown.reasoning ?? 'N/A'} / 1.0
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Discrepancy / Bias Alert Banner */}
                {evaluationResult.discrepancy?.detected ? (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                    <div className="flex items-center gap-2 text-rose-300 text-xs font-bold">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Discrepancy Flag: {evaluationResult.discrepancy.bias_category}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {evaluationResult.discrepancy.evidence}
                    </p>
                    <div className="text-[11px] font-mono text-rose-400">
                      Score Delta: {evaluationResult.discrepancy.score_delta > 0 ? `+${evaluationResult.discrepancy.score_delta}` : evaluationResult.discrepancy.score_delta} pts ({evaluationResult.discrepancy.severity} Severity)
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-emerald-300 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Calibrated Evaluation: Interviewer assessment is consistent with technical evidence.</span>
                  </div>
                )}

                {/* Supporting Transcript Evidence */}
                {evaluationResult.ai_evaluation?.evidence && (
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">
                      Supporting Transcript Evidence:
                    </span>
                    <p className="text-xs text-slate-300 italic font-mono">
                      {evaluationResult.ai_evaluation.evidence}
                    </p>
                  </div>
                )}

                {/* Technical Concepts Extracted from Audio */}
                <div className="space-y-3 pt-2">
                  {/* Correct Concepts */}
                  {evaluationResult.ai_evaluation?.correct_concepts?.length > 0 && (
                    <div>
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block mb-1.5">
                        ✓ Verified Spoken Concepts ({evaluationResult.ai_evaluation.correct_concepts.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {evaluationResult.ai_evaluation.correct_concepts.map((c, i) => (
                          <span key={i} className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alternative Valid Approaches */}
                  {evaluationResult.ai_evaluation?.alternative_valid_approaches?.length > 0 && (
                    <div>
                      <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block mb-1.5">
                        ★ Recognized Alternative Approaches
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {evaluationResult.ai_evaluation.alternative_valid_approaches.map((a, i) => (
                          <span key={i} className="text-xs px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Missing Concepts */}
                  {evaluationResult.ai_evaluation?.missing_concepts?.length > 0 && (
                    <div>
                      <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block mb-1.5">
                        ⚠ Omissions / Missing Concepts
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {evaluationResult.ai_evaluation.missing_concepts.map((m, i) => (
                          <span key={i} className="text-xs px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Inaccurate Statements */}
                  {evaluationResult.ai_evaluation?.incorrect_concepts?.length > 0 && (
                    <div>
                      <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider block mb-1.5">
                        ✗ Inaccurate Technical Statements
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {evaluationResult.ai_evaluation.incorrect_concepts.map((ic, i) => (
                          <span key={i} className="text-xs px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20">
                            {ic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Technical Explanation */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Technical Explanation
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {evaluationResult.ai_evaluation?.explanation}
                  </p>
                </div>

                {/* Recommendation */}
                <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 text-xs text-purple-300">
                  <span className="font-bold block mb-0.5">Recommendation:</span>
                  {evaluationResult.ai_evaluation?.review_recommendation}
                </div>

                {/* Expert Feedback Modal Trigger */}
                <button
                  type="button"
                  onClick={() => {
                    setFbScore(evaluationResult.ai_evaluation?.technical_score || 8.0);
                    setFbExplanation(evaluationResult.ai_evaluation?.explanation || "");
                    setFbConcepts((evaluationResult.ai_evaluation?.correct_concepts || []).join("; "));
                    setFbIsAlt(evaluationResult.ai_evaluation?.alternative_valid_approaches?.length > 0);
                    setFbAltName(evaluationResult.ai_evaluation?.alternative_valid_approaches?.[0] || "");
                    setShowFeedbackModal(true);
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                  <span>Submit Human Expert Feedback & Calibration</span>
                </button>

                {/* Report link button */}
                <Link
                  to={`/reports/${interviewId}`}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-purple-600/20"
                >
                  <FileText className="w-4 h-4" />
                  <span>View Full Executive Audit Report</span>
                </Link>
              </div>
              )
            ) : (
              /* Completed but not evaluated placeholder */
              <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-8 text-center space-y-4 shadow-xl">
                <Brain className="w-10 h-10 text-purple-400 mx-auto" />
                <div>
                  <h3 className="text-sm font-bold text-white">Interview Concluded</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    This question had no submitted answer. Check the executive report for comprehensive candidate results.
                  </p>
                </div>
                <Link
                  to={`/reports/${interviewId}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>View Full Report</span>
                </Link>
              </div>
            )
          )}

          {/* AI-Suggested Questions Panel */}
          {(() => {
            const activeSuggestions = (suggestedQuestions || []).filter(s => s.status !== 'asked' && s.status !== 'skipped');
            return (
              <div className="bg-[#0F172A] border border-purple-500/30 rounded-2xl p-5 space-y-4 shadow-xl">
                {/* Panel Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                          AI-Suggested Questions
                        </h3>
                        {activeSuggestions.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            {activeSuggestions.length} Available
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Contextual follow-ups based on candidate's answers & role
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => loadSuggestions(true)}
                    disabled={loadingSuggestions}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-all text-xs flex items-center gap-1.5 disabled:opacity-50"
                    title="Generate fresh AI suggestions"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${loadingSuggestions ? 'animate-spin' : ''}`} />
                    <span className="text-[11px] font-medium">{loadingSuggestions ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                </div>

                {suggestionError && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-2">
                    <span>{suggestionError}</span>
                    <button 
                      type="button" 
                      onClick={() => setSuggestionError('')}
                      className="text-amber-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Suggestions List */}
                {loadingSuggestions ? (
                  <div className="p-8 text-center space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-400 mx-auto" />
                    <p className="text-xs text-slate-400">Analyzing interview context & generating technical follow-ups...</p>
                  </div>
                ) : activeSuggestions.length > 0 ? (
                  <div className="space-y-3">
                    {activeSuggestions.map((sug) => {
                      const difficultyColor = 
                        sug.difficulty === 'Easy' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : sug.difficulty === 'Hard'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30';

                      const isAsking = askingSuggestionId === sug.id;

                      return (
                        <div
                          key={sug.id}
                          className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 hover:border-purple-500/40 transition-all space-y-2.5 group"
                        >
                          {/* Badges & Actions */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-semibold">
                                {sug.domain || 'General'}
                              </span>
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${difficultyColor}`}>
                                {sug.difficulty || 'Medium'}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSkipSuggestion(sug.id)}
                                className="px-2 py-1 rounded-lg text-[11px] text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
                                title="Skip this question"
                              >
                                Skip
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAskSuggestion(sug.id)}
                                disabled={Boolean(askingSuggestionId) || sessionStatus === 'completed'}
                                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-purple-600/20 active:scale-[0.98]"
                              >
                                {isAsking ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Adding...</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Ask Question</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Question Text */}
                          <p className="text-xs sm:text-sm font-semibold text-white leading-snug">
                            {sug.question_text}
                          </p>

                          {/* Follow-up Reason / Rationale */}
                          {sug.follow_up_reason && (
                            <p className="text-[11px] text-purple-300/80 italic flex items-center gap-1">
                              <span>↳ {sug.follow_up_reason}</span>
                            </p>
                          )}

                          {/* Expected Criteria Preview */}
                          {sug.expected_criteria?.length > 0 && (
                            <div className="pt-1.5 border-t border-slate-800/60">
                              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1">
                                Rubric Criteria:
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {sug.expected_criteria.slice(0, 3).map((crit, cIdx) => (
                                  <span key={cIdx} className="text-[10px] px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800/80">
                                    • {crit}
                                  </span>
                                ))}
                                {sug.expected_criteria.length > 3 && (
                                  <span className="text-[10px] px-1.5 py-0.5 text-slate-500 font-mono">
                                    +{sug.expected_criteria.length - 3} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 rounded-xl bg-slate-900/50 border border-dashed border-slate-800 text-center space-y-2">
                    <p className="text-xs text-slate-400">
                      No active suggestions right now. Generate new contextual questions tailored to this candidate.
                    </p>
                    <button
                      type="button"
                      onClick={() => loadSuggestions(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate AI Suggestions</span>
                    </button>
                  </div>
                )}

                {/* Panel Footer Controls */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setNewQuestionData(prev => ({
                        ...prev,
                        domain: activeQuestion?.domain || (interview?.domains?.[0] || 'DSA')
                      }));
                      setShowAddQuestionModal(true);
                    }}
                    className="text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Custom Question</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => loadSuggestions(true)}
                    disabled={loadingSuggestions}
                    className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 text-[11px]"
                  >
                    <RefreshCw className="w-3 h-3 text-purple-400" />
                    <span>Refresh Suggestions</span>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

      </div>

      {/* End Interview Confirmation Modal */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">End Interview Session</h3>
                <p className="text-xs text-slate-400">Confirm conclusion of technical assessment</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to end this interview? All submitted answers and recordings will be saved.
            </p>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div>Total Questions Evaluated: <strong className="text-white">{evaluatedQuestions} of {totalQuestions}</strong></div>
              <div>Candidate: <strong className="text-white">{interview.candidate_name}</strong></div>
              <div>Status will transition to: <strong className="text-emerald-400">Completed</strong></div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                disabled={sessionActionLoading === 'end'}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEndInterview}
                disabled={sessionActionLoading === 'end'}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-lg shadow-rose-600/20"
              >
                {sessionActionLoading === 'end' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Ending Session...</span>
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    <span>End Interview</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Add Question Modal */}
      {showAddQuestionModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Add Custom Interview Question
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setShowAddQuestionModal(false)} 
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomQuestion} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">Domain / Category</label>
                <select
                  value={newQuestionData.domain}
                  onChange={(e) => setNewQuestionData({ ...newQuestionData, domain: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                >
                  <option value="DSA">DSA</option>
                  <option value="System Design">System Design</option>
                  <option value="Backend">Backend</option>
                  <option value="Frontend">Frontend</option>
                  <option value="Database">Database</option>
                  <option value="Behavioral">Behavioral</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Difficulty Level</label>
                <select
                  value={newQuestionData.difficulty}
                  onChange={(e) => setNewQuestionData({ ...newQuestionData, difficulty: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Question Text (Required)</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. How does the Raft consensus algorithm handle leader election and split votes?"
                  value={newQuestionData.question_text}
                  onChange={(e) => setNewQuestionData({ ...newQuestionData, question_text: e.target.value })}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">
                  Expected Rubric Criteria (One per line or semicolon separated)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Heartbeats and election timeouts&#10;Term counter increments&#10;Majority voting quorum"
                  value={newQuestionData.expected_criteria}
                  onChange={(e) => setNewQuestionData({ ...newQuestionData, expected_criteria: e.target.value })}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddQuestionModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sessionActionLoading === 'add_question'}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center gap-1.5"
                >
                  {sessionActionLoading === 'add_question' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Question to Session</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Human Expert Calibration Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Human Expert Calibration Review
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setShowFeedbackModal(false)} 
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {fbSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Expert review recorded & promoted to RAG vector knowledge base!</span>
              </div>
            )}

            <form onSubmit={handleFeedbackSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">Expert Calibrated Score (0 - 10)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={fbScore}
                    onChange={(e) => setFbScore(parseFloat(e.target.value))}
                    className="flex-1 accent-purple-500 cursor-pointer"
                  />
                  <span className="font-black text-purple-400 text-base w-12 text-right">{fbScore}/10</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Expert Technical Explanation / Correction</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Provide definitive ground truth rationale for why this spoken answer deserves this score..."
                  value={fbExplanation}
                  onChange={(e) => setFbExplanation(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Verified Correct Concepts (Semicolon separated)</label>
                <input
                  type="text"
                  placeholder="e.g. Two-pointer pass; O(1) auxiliary space"
                  value={fbConcepts}
                  onChange={(e) => setFbConcepts(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fbIsAlt}
                    onChange={(e) => setFbIsAlt(e.target.checked)}
                    className="accent-purple-500 rounded"
                  />
                  <span className="text-slate-200 font-semibold text-[11px]">
                    Defend Valid Alternative Approach (Not in original canonical rubric)
                  </span>
                </label>

                {fbIsAlt && (
                  <input
                    type="text"
                    placeholder="Name the alternative paradigm (e.g. Two-Pointer O(1) space)"
                    value={fbAltName}
                    onChange={(e) => setFbAltName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-[11px]"
                  />
                )}
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-800">
                <span className="text-[10px] text-slate-400">
                  Feeds into RAG vector retrieval & model training
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFeedbackModal(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={fbSubmitting}
                    className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold"
                  >
                    {fbSubmitting ? 'Submitting...' : 'Save & Promote to Ground Truth'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
