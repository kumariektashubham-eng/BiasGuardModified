import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ShieldCheck, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Radio, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  User, 
  FileText, 
  Sparkles, 
  ChevronRight, 
  ArrowLeft, 
  Save, 
  PhoneOff, 
  RefreshCw, 
  Check, 
  Lock, 
  Award, 
  HelpCircle,
  Eye,
  Sliders,
  AlertTriangle,
  RotateCcw,
  Send,
  Video,
  VideoOff,
  Bell,
  Square,
  Plus,
  Lightbulb
} from 'lucide-react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { interviewsApi, evaluationsApi, livekitApi } from '../services/api';
import { AudioPlayer } from '../components/voice/AudioPlayer';
import { formatApiError } from '../utils/errorFormatter';

export const InterviewerLivePage = () => {
  const { id: interviewId } = useParams();
  const navigate = useNavigate();

  // Interview & Live Status State
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);

  // Question Push State
  const [sendingQuestion, setSendingQuestion] = useState(false);
  const [advancingQuestion, setAdvancingQuestion] = useState(false);
  const [pushedQuestionId, setPushedQuestionId] = useState(null);
  const [pushSuccessNotice, setPushSuccessNotice] = useState('');

  // AI Suggested & Custom Questions State
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestionsPanel, setShowSuggestionsPanel] = useState(false);
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [customQuestionText, setCustomQuestionText] = useState('');
  const [customQuestionDomain, setCustomQuestionDomain] = useState('DSA');
  const [customQuestionDifficulty, setCustomQuestionDifficulty] = useState('Medium');
  const [addingCustom, setAddingCustom] = useState(false);

  // Live Answer Notification Banner
  const [answerNotification, setAnswerNotification] = useState(null);

  // Human Scoring State for Active Question
  const [humanScore, setHumanScore] = useState(7.0);
  const [interviewerNotes, setInterviewerNotes] = useState('');
  const [savingScore, setSavingScore] = useState(false);
  const [scoreSaveSuccess, setScoreSaveSuccess] = useState(false);
  const [scoreError, setScoreError] = useState('');

  // End Interview Session Modal
  const [showEndModal, setShowEndModal] = useState(false);
  const [endingSession, setEndingSession] = useState(false);

  // LiveKit Call State
  const [lkRoom, setLkRoom] = useState(null);
  const [callConnected, setCallConnected] = useState(false);
  const [candidateSpeaking, setCandidateSpeaking] = useState(false);
  const [candidateHasVideo, setCandidateHasVideo] = useState(false);
  const [interviewerMicEnabled, setInterviewerMicEnabled] = useState(false);
  const [incomingVolume, setIncomingVolume] = useState(1.0); // 0.0 to 1.0
  const [incomingMuted, setIncomingMuted] = useState(false);
  const [livekitError, setLivekitError] = useState('');
  const [livekitConnecting, setLivekitConnecting] = useState(false);

  // Media element references
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const sseRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // 1. Initial Load of Interview Live Status
  useEffect(() => {
    loadLiveStatus();
    startRealtimeSync();

    return () => {
      stopRealtimeSync();
      disconnectLivekit();
    };
  }, [interviewId]);

  // Synchronize score input and pushed question state when active question changes
  useEffect(() => {
    if (!liveData?.questions) return;
    const activeQ = liveData.questions[activeQuestionIdx];
    if (activeQ) {
      if (activeQ.interviewer_score !== undefined && activeQ.interviewer_score !== null) {
        setHumanScore(activeQ.interviewer_score);
      } else {
        setHumanScore(7.0);
      }
      setInterviewerNotes(activeQ.interviewer_notes || '');
      setScoreSaveSuccess(false);
      setScoreError('');

      if (liveData.pushed_question_id === activeQ.id) {
        setPushedQuestionId(activeQ.id);
      }
    }
  }, [activeQuestionIdx, liveData?.questions, liveData?.pushed_question_id]);

  // Handle remote incoming audio volume
  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = incomingMuted ? 0 : incomingVolume;
    }
  }, [incomingVolume, incomingMuted]);

  const loadLiveStatus = async () => {
    try {
      const res = await interviewsApi.getLiveStatus(interviewId);
      setLiveData(res.data);

      if (res.data.pushed_question_id) {
        setPushedQuestionId(res.data.pushed_question_id);
      }

      // Check if candidate recently submitted an answer
      if (res.data.session_state === 'answer_saved' && res.data.last_answered_question_id) {
        const answeredQIdx = (res.data.questions || []).findIndex(
          (q) => q.id === res.data.last_answered_question_id
        );
        if (answeredQIdx >= 0) {
          setAnswerNotification({
            type: 'success',
            candidate_name: res.data.candidate_name || 'Candidate',
            question_id: res.data.last_answered_question_id,
            question_index: answeredQIdx + 1,
            upload_status: 'Uploaded & Transcribed',
            answer_status: 'Answer Received',
            time: new Date()
          });
        }
      }

      // Connect to LiveKit if configured and not yet connected
      if (res.data?.livekit_configured && !callConnected && !livekitConnecting && !lkRoom) {
        connectToLivekit();
      }
    } catch (err) {
      console.error('Failed to load live status:', err);
      setError(formatApiError(err, 'Failed to fetch interview live status.'));
    } finally {
      setLoading(false);
    }
  };

  // 2. Real-Time Sync: SSE with 2-second Polling Fallback
  const startRealtimeSync = () => {
    const token = localStorage.getItem('biasguard_token');
    const streamUrl = interviewsApi.getLiveStreamUrl(interviewId, token);

    try {
      const es = new EventSource(streamUrl);
      sseRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.interview_id) {
            setLiveData((prev) => {
              if (!prev) return data;
              return {
                ...prev,
                ...data,
                candidate_presence: data.candidate_presence || prev.candidate_presence,
                candidate_activity: data.candidate_activity || prev.candidate_activity,
                questions: data.questions || prev.questions,
                status: data.status || prev.status,
                pushed_question_id: data.pushed_question_id || prev.pushed_question_id,
                session_state: data.session_state || prev.session_state
              };
            });

            if (data.session_state === 'answer_saved' && data.last_answered_question_id) {
              const answeredIdx = (data.questions || []).findIndex(q => q.id === data.last_answered_question_id);
              if (answeredIdx >= 0) {
                setAnswerNotification({
                  question_id: data.last_answered_question_id,
                  question_index: answeredIdx + 1,
                  text: `Candidate has answered Question ${answeredIdx + 1}`,
                  time: new Date()
                });
              }
            }
          }
        } catch (e) {
          console.warn('SSE parse warning:', e);
        }
      };

      es.onerror = () => {
        if (sseRef.current) {
          sseRef.current.close();
          sseRef.current = null;
        }
        if (!pollIntervalRef.current) {
          pollIntervalRef.current = setInterval(loadLiveStatus, 2000);
        }
      };
    } catch (e) {
      pollIntervalRef.current = setInterval(loadLiveStatus, 2000);
    }
  };

  const stopRealtimeSync = () => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // 3. LiveKit Audio & Video Setup
  const connectToLivekit = async () => {
    setLivekitConnecting(true);
    setLivekitError('');
    try {
      const res = await livekitApi.getInterviewerToken(interviewId);
      const { url, token } = res.data;

      const room = new Room({
        adaptiveStream: true,
        dynacast: true
      });

      // Handle Remote Candidate Tracks (Both Audio and Video)
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio && remoteAudioRef.current) {
          track.attach(remoteAudioRef.current);
          setCandidateSpeaking(true);
        } else if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
          setCandidateHasVideo(true);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach();
          setCandidateSpeaking(false);
        } else if (track.kind === Track.Kind.Video) {
          track.detach();
          setCandidateHasVideo(false);
        }
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const candidateActive = speakers.some(s => s.identity !== room.localParticipant.identity);
        setCandidateSpeaking(candidateActive);
      });

      room.on(RoomEvent.Disconnected, () => {
        setCallConnected(false);
        setCandidateHasVideo(false);
      });

      // Listen for LiveKit Data Messages from Candidate (e.g. ANSWER_SUBMITTED, ANSWER_UPLOAD_FAILED, ANSWER_RECORDING_STARTED)
      room.on(RoomEvent.DataReceived, (payload) => {
        try {
          const str = new TextDecoder().decode(payload);
          const data = JSON.parse(str);
          if (data.type === 'ANSWER_SUBMITTED' || data.type === 'answer_submitted') {
            const qIdx = data.question_index !== undefined ? data.question_index + 1 : (activeQuestionIdx + 1);
            const candName = data.candidate_name || liveData?.candidate_name || 'Candidate';
            setAnswerNotification({
              type: 'success',
              candidate_name: candName,
              question_id: data.question_id,
              question_index: qIdx,
              submission_mode: data.submission_mode || 'voice_recorded',
              upload_status: 'Uploaded & Transcribed',
              answer_status: 'Answer Received',
              time: new Date()
            });
            loadLiveStatus(); // Refresh questions, audio recordings, and transcripts immediately
          } else if (data.type === 'ANSWER_UPLOAD_FAILED') {
            const qIdx = data.question_index !== undefined ? data.question_index + 1 : (activeQuestionIdx + 1);
            setAnswerNotification({
              type: 'error',
              candidate_name: data.candidate_name || liveData?.candidate_name || 'Candidate',
              question_id: data.question_id,
              question_index: qIdx,
              upload_status: 'Upload Failed',
              answer_status: 'Upload Failed - Retry Pending',
              error: data.error || 'Recording upload failed',
              time: new Date()
            });
          } else if (data.type === 'ANSWER_RECORDING_STARTED') {
            setLiveData(prev => prev ? {
              ...prev,
              candidate_activity: { state: 'recording', question_id: data.question_id, updated_at: new Date().toISOString() }
            } : prev);
          }
        } catch (e) {
          console.warn('LiveKit data packet parse notice:', e);
        }
      });

      await room.connect(url, token);

      // Check existing remote candidate tracks
      room.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((pub) => {
          if (pub.track && pub.isSubscribed) {
            if (pub.kind === Track.Kind.Audio && remoteAudioRef.current) {
              pub.track.attach(remoteAudioRef.current);
            }
            if (pub.kind === Track.Kind.Video && remoteVideoRef.current) {
              pub.track.attach(remoteVideoRef.current);
              setCandidateHasVideo(true);
            }
          }
        });
      });

      setLkRoom(room);
      setCallConnected(true);
      setLivekitError('');
    } catch (err) {
      console.warn('LiveKit interviewer connection notice:', err);
      setLivekitError('Live call could not connect. Check LiveKit settings.');
      setCallConnected(false);
    } finally {
      setLivekitConnecting(false);
    }
  };

  const disconnectLivekit = () => {
    if (lkRoom) {
      lkRoom.disconnect();
      setLkRoom(null);
    }
    setCallConnected(false);
  };

  const toggleInterviewerMic = async () => {
    if (!lkRoom) return;
    try {
      const nextState = !interviewerMicEnabled;
      await lkRoom.localParticipant.setMicrophoneEnabled(nextState);
      setInterviewerMicEnabled(nextState);
    } catch (e) {
      console.warn('Failed to toggle interviewer microphone:', e);
    }
  };

  // 4. Send Question to Candidate (Real-time Question Push)
  const handleSendQuestion = async (customQ = null) => {
    const questions = liveData?.questions || [];
    const targetQ = customQ || questions[activeQuestionIdx];
    if (!targetQ) return;

    setSendingQuestion(true);
    setPushSuccessNotice('');

    try {
      await interviewsApi.sendQuestion(interviewId, {
        question_id: targetQ.id,
        question_index: activeQuestionIdx
      });

      // Broadcast QUESTION_SENT event via LiveKit data channel for sub-second delivery
      if (lkRoom && callConnected) {
        try {
          const packet = JSON.stringify({
            type: 'QUESTION_SENT',
            interview_id: interviewId,
            question_id: targetQ.id,
            question_index: activeQuestionIdx,
            question_text: targetQ.question_text,
            domain: targetQ.domain,
            difficulty: targetQ.difficulty,
            total: questions.length,
            timestamp: new Date().toISOString()
          });
          lkRoom.localParticipant.publishData(new TextEncoder().encode(packet), { reliable: true });
        } catch (e) {
          console.warn('Notice publishing LiveKit question data:', e);
        }
      }

      setPushedQuestionId(targetQ.id);
      setPushSuccessNotice(`Question ${activeQuestionIdx + 1} sent to candidate screen!`);
      setTimeout(() => setPushSuccessNotice(''), 4000);

      // Dismiss prior answer notification for earlier question
      setAnswerNotification(null);

      // Update local state
      setLiveData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pushed_question_id: targetQ.id,
          session_state: 'question_sent',
          current_question_index: activeQuestionIdx
        };
      });
    } catch (err) {
      console.error('Failed to send question:', err);
      alert(formatApiError(err, 'Failed to send question to candidate.'));
    } finally {
      setSendingQuestion(false);
    }
  };

  // Remote recording controls (Interviewer prompts candidate recording start/stop)
  const handleRemoteRecordingControl = async (action) => {
    const questions = liveData?.questions || [];
    const activeQ = questions[activeQuestionIdx];
    if (!activeQ) return;

    try {
      if (lkRoom && callConnected) {
        const eventType = action === 'start' ? 'START_RECORDING_REQUESTED' : 'STOP_RECORDING_REQUESTED';
        const packet = JSON.stringify({
          type: eventType,
          interview_id: interviewId,
          question_id: activeQ.id,
          timestamp: new Date().toISOString()
        });
        lkRoom.localParticipant.publishData(new TextEncoder().encode(packet), { reliable: true });
      }

      await interviewsApi.remoteRecordingControl(interviewId, {
        action,
        question_id: activeQ.id
      });

      setLiveData(prev => prev ? {
        ...prev,
        candidate_activity: {
          state: action === 'start' ? 'recording' : 'idle',
          question_id: activeQ.id,
          updated_at: new Date().toISOString()
        }
      } : prev);
    } catch (err) {
      console.warn('Remote recording control notice:', err);
    }
  };

  // 5. Manual Next Question Progression (Interviewer Only)
  const handleNextQuestion = async () => {
    const questions = liveData?.questions || [];
    if (activeQuestionIdx >= questions.length - 1) return;

    setAdvancingQuestion(true);
    const nextIdx = activeQuestionIdx + 1;
    const nextQ = questions[nextIdx];

    try {
      const res = await interviewsApi.nextQuestion(interviewId, {
        target_index: nextIdx,
        question_id: nextQ?.id
      });

      const updatedQ = res.data.question || nextQ;

      // Broadcast QUESTION_SENT via LiveKit for instant candidate screen refresh
      if (lkRoom && callConnected) {
        try {
          const packet = JSON.stringify({
            type: 'QUESTION_SENT',
            interview_id: interviewId,
            question_id: updatedQ.id,
            question_index: nextIdx,
            question_text: updatedQ.question_text,
            domain: updatedQ.domain,
            difficulty: updatedQ.difficulty,
            total: questions.length,
            timestamp: new Date().toISOString()
          });
          lkRoom.localParticipant.publishData(new TextEncoder().encode(packet), { reliable: true });
        } catch (e) {
          console.warn('Notice publishing LiveKit next-question data:', e);
        }
      }

      setActiveQuestionIdx(nextIdx);
      setPushedQuestionId(updatedQ.id);
      setPushSuccessNotice(`Question ${nextIdx + 1} sent to candidate screen!`);
      setTimeout(() => setPushSuccessNotice(''), 4000);
      setAnswerNotification(null);

      loadLiveStatus();
    } catch (err) {
      console.error('Failed to advance question:', err);
      // Fallback navigation
      setActiveQuestionIdx(nextIdx);
    } finally {
      setAdvancingQuestion(false);
    }
  };

  // AI Suggested & Custom Questions Handlers
  const loadSuggestedQuestions = async (force = false) => {
    setLoadingSuggestions(true);
    try {
      const res = await interviewsApi.getSuggestedQuestions(interviewId, { force_refresh: force });
      setSuggestedQuestions(res.data?.suggested_questions || []);
    } catch (e) {
      console.warn("Could not load suggested questions:", e);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleAskSuggestedQuestion = async (suggestionId) => {
    try {
      const res = await interviewsApi.askSuggestedQuestion(interviewId, suggestionId);
      const updatedList = res.data?.questions || [];
      const newIdx = updatedList.length - 1;
      const newQ = updatedList[newIdx];

      setLiveData(prev => prev ? { ...prev, questions: updatedList } : prev);
      setActiveQuestionIdx(newIdx);

      if (newQ && lkRoom && callConnected) {
        const packet = JSON.stringify({
          type: 'QUESTION_SENT',
          interview_id: interviewId,
          question_id: newQ.id,
          question_index: newIdx,
          question_text: newQ.question_text,
          domain: newQ.domain,
          difficulty: newQ.difficulty,
          total: updatedList.length,
          timestamp: new Date().toISOString()
        });
        lkRoom.localParticipant.publishData(new TextEncoder().encode(packet), { reliable: true });
      }

      setPushedQuestionId(newQ?.id);
      setPushSuccessNotice(`Suggested question sent to candidate screen!`);
      setTimeout(() => setPushSuccessNotice(''), 4000);

      loadLiveStatus();
      loadSuggestedQuestions();
    } catch (err) {
      alert(formatApiError(err, 'Failed to ask suggested question.'));
    }
  };

  const handleSkipSuggestedQuestion = async (suggestionId) => {
    try {
      const res = await interviewsApi.skipSuggestedQuestion(interviewId, suggestionId);
      setSuggestedQuestions(res.data?.suggested_questions || []);
    } catch (err) {
      console.warn("Failed to skip suggested question:", err);
    }
  };

  const handleAddCustomQuestion = async () => {
    if (!customQuestionText.trim()) return;
    setAddingCustom(true);
    try {
      const res = await interviewsApi.nextQuestion(interviewId, {
        custom_question: {
          question_text: customQuestionText.trim(),
          domain: customQuestionDomain,
          difficulty: customQuestionDifficulty
        }
      });
      const newQ = res.data.question;
      setShowAddCustomModal(false);
      setCustomQuestionText('');

      if (newQ && lkRoom && callConnected) {
        const packet = JSON.stringify({
          type: 'QUESTION_SENT',
          interview_id: interviewId,
          question_id: newQ.id,
          question_index: res.data.current_question_index,
          question_text: newQ.question_text,
          domain: newQ.domain,
          difficulty: newQ.difficulty,
          total: newQ.total,
          timestamp: new Date().toISOString()
        });
        lkRoom.localParticipant.publishData(new TextEncoder().encode(packet), { reliable: true });
      }

      setPushedQuestionId(newQ?.id);
      setActiveQuestionIdx(res.data.current_question_index);
      setPushSuccessNotice(`Custom question sent to candidate screen!`);
      setTimeout(() => setPushSuccessNotice(''), 4000);
      loadLiveStatus();
    } catch (err) {
      alert(formatApiError(err, 'Failed to add custom question.'));
    } finally {
      setAddingCustom(false);
    }
  };

  // 6. Save Human Score for Active Question
  const handleSaveScore = async () => {
    const questions = liveData?.questions || [];
    const activeQ = questions[activeQuestionIdx];
    if (!activeQ) return;

    setSavingScore(true);
    setScoreError('');
    setScoreSaveSuccess(false);

    try {
      await evaluationsApi.saveHumanScore({
        interview_id: interviewId,
        question_id: activeQ.id,
        interviewer_score: parseFloat(humanScore),
        interviewer_notes: interviewerNotes
      });

      setScoreSaveSuccess(true);
      setTimeout(() => setScoreSaveSuccess(false), 3000);

      // Optimistically update local questions
      setLiveData((prev) => {
        if (!prev) return prev;
        const updatedQuestions = (prev.questions || []).map((q, idx) => {
          if (idx === activeQuestionIdx || q.id === activeQ.id) {
            return {
              ...q,
              interviewer_score: parseFloat(humanScore),
              interviewer_notes: interviewerNotes,
              evaluated: true
            };
          }
          return q;
        });
        return { ...prev, questions: updatedQuestions };
      });
    } catch (err) {
      console.error('Failed to save score:', err);
      setScoreError(formatApiError(err, 'Failed to save human score.'));
    } finally {
      setSavingScore(false);
    }
  };

  // 7. End Interview Session
  const handleEndInterview = async () => {
    setEndingSession(true);
    try {
      // Broadcast interview_ended via LiveKit before closing
      if (lkRoom && callConnected) {
        try {
          const packet = JSON.stringify({ type: 'interview_ended' });
          lkRoom.localParticipant.publishData(new TextEncoder().encode(packet), { reliable: true });
        } catch (e) {}
      }

      await interviewsApi.end(interviewId);
      setShowEndModal(false);
      disconnectLivekit();
      navigate(`/reports/${interviewId}`);
    } catch (err) {
      console.error('Failed to end interview:', err);
      alert(formatApiError(err, 'Failed to end interview session.'));
    } finally {
      setEndingSession(false);
    }
  };

  // Helper: Presence Badge Renderer
  const renderPresenceBadge = () => {
    const presence = liveData?.candidate_status || liveData?.candidate_presence || 'invited';
    const sessionState = liveData?.session_state;

    if (sessionState === 'declined' || liveData?.status === 'declined') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
          <AlertCircle className="w-3.5 h-3.5" />
          Candidate Declined Invitation
        </span>
      );
    }

    switch (presence) {
      case 'in_session':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Candidate In Session (Live)
          </span>
        );
      case 'joined':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            Candidate Joined Room (Ready)
          </span>
        );
      case 'finished':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Interview Finished
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
            <Clock className="w-3.5 h-3.5" />
            Candidate Invited (Awaiting Join)
          </span>
        );
    }
  };

  // Helper: Activity Banner Renderer
  const renderActivityBanner = () => {
    const activity = liveData?.candidate_activity;
    const state = activity?.state || 'idle';
    const questions = liveData?.questions || [];
    const targetQIdx = questions.findIndex(q => q.id === activity?.question_id);
    const qLabel = targetQIdx >= 0 ? `Q${targetQIdx + 1}` : 'question';

    if (state === 'recording') {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold animate-pulse">
          <Mic className="w-4 h-4 text-rose-400" />
          <span>Candidate is recording audio response for {qLabel}...</span>
        </div>
      );
    }
    if (state === 'typing') {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
          <FileText className="w-4 h-4 text-indigo-400 animate-bounce" />
          <span>Candidate is typing answer for {qLabel}...</span>
        </div>
      );
    }
    if (state === 'answer_submitted') {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Candidate has submitted answer for {qLabel}</span>
        </div>
      );
    }
    if (state === 'viewing') {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs">
          <Eye className="w-3.5 h-3.5 text-slate-400" />
          <span>Candidate is viewing {qLabel}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
        <span>Candidate state: idle</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <h2 className="text-base font-semibold text-white">Connecting to Interview Live Room...</h2>
        <p className="text-xs text-slate-500 mt-1">Establishing real-time data link and live media channels</p>
      </div>
    );
  }

  if (error || !liveData) {
    return (
      <div className="max-w-lg mx-auto p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-4 my-8">
        <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
        <h3 className="text-lg font-bold text-white">Live Monitoring Unavailable</h3>
        <p className="text-xs text-slate-400">{error || 'Interview session not found.'}</p>
        <Link
          to="/interviews"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Interviews
        </Link>
      </div>
    );
  }

  const questions = liveData.questions || [];
  const activeQ = questions[activeQuestionIdx];
  const isInterviewFinished = liveData.status === 'completed' || liveData.candidate_status === 'finished';
  const isDeclined = liveData.session_state === 'declined' || liveData.status === 'declined';
  const isCurrentQPushed = activeQ && (pushedQuestionId === activeQ.id || liveData.pushed_question_id === activeQ.id);

  return (
    <div className="space-y-4">
      {/* Hidden audio element for receiving candidate live voice */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* Top Header / Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link to="/interviews" className="hover:text-indigo-400 transition-colors">Interviews</Link>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className="text-slate-200">{liveData.title}</span>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className="text-indigo-400 font-semibold">Live Room</span>
          </div>

          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">{liveData.title}</h1>
            {renderPresenceBadge()}
          </div>

          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
            <div className="flex items-center gap-1 text-slate-300">
              <User className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-semibold text-white">{liveData.candidate_name || 'Candidate'}</span>
              {liveData.candidate_role && (
                <span className="text-slate-400">({liveData.candidate_role})</span>
              )}
            </div>
            {liveData.domains?.map((d) => (
              <span key={d} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-indigo-300">
                {d}
              </span>
            ))}
          </div>
        </div>

        {/* Live Actions */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          {isInterviewFinished ? (
            <Link
              to={`/reports/${interviewId}`}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-600/30"
            >
              <Award className="w-4 h-4" /> View Evaluation Report
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setShowEndModal(true)}
              className="px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 border border-rose-500/30 text-rose-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <PhoneOff className="w-3.5 h-3.5" /> End Interview
            </button>
          )}

          <Link
            to={`/interviews/${interviewId}/evaluate`}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
          >
            Conduct Console
          </Link>
        </div>
      </div>

      {/* Candidate Declined Alert Banner */}
      {isDeclined && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <strong className="block text-sm font-bold text-white mb-0.5">
              Candidate Has Declined Invitation
            </strong>
            <span>
              The candidate chose not to proceed with this technical assessment. No audio or video has been or will be recorded.
            </span>
          </div>
        </div>
      )}

      {/* Real-time Candidate Answer Notification Banner */}
      {answerNotification && (
        <div className={`p-4 rounded-2xl text-xs flex items-center justify-between shadow-xl animate-in fade-in ${
          answerNotification.type === 'error'
            ? 'bg-rose-500/15 border border-rose-500/40 text-rose-300'
            : 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              answerNotification.type === 'error' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}>
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            <div>
              <strong className="block text-sm font-bold text-white">
                {answerNotification.type === 'error'
                  ? `Candidate Audio Upload Failed for Question ${answerNotification.question_index}`
                  : `Candidate Answer Submitted: ${answerNotification.candidate_name || 'Candidate'} has submitted the answer to Question ${answerNotification.question_index}.`}
              </strong>
              <div className="flex flex-wrap items-center gap-2.5 mt-1 text-[11px] text-slate-300">
                <span>Candidate: <strong className="text-white font-semibold">{answerNotification.candidate_name || 'Candidate'}</strong></span>
                <span>•</span>
                <span>Question: <strong className="text-white font-semibold">Question {answerNotification.question_index}</strong></span>
                <span>•</span>
                <span>Time: <strong className="text-white font-semibold">{answerNotification.time ? answerNotification.time.toLocaleTimeString() : new Date().toLocaleTimeString()}</strong></span>
                <span>•</span>
                <span>Upload Status: <strong className={answerNotification.type === 'error' ? 'text-rose-400' : 'text-indigo-300'}>{answerNotification.upload_status || 'Uploaded'}</strong></span>
                <span>•</span>
                <span>Answer Status: <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  answerNotification.type === 'error' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}>{answerNotification.answer_status || 'Answer Received'}</span></span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAnswerNotification(null)}
            className="text-slate-400 hover:text-white text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800/80 ml-3 shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Live Call Control & Audio Bar */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-3.5 flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
        {/* Left: Real-time Activity Indicator */}
        <div className="w-full md:w-auto">
          {renderActivityBanner()}
        </div>

        {/* Right: LiveKit Call Controls */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {callConnected ? (
            <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5">
              {/* Candidate Audio & Video Indicator */}
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                <Radio className={`w-4 h-4 ${candidateSpeaking ? 'animate-pulse text-emerald-300' : 'text-emerald-500'}`} />
                <span>Call Connected</span>
              </div>

              {/* Volume Slider & Mute Toggle */}
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
                <button
                  type="button"
                  onClick={() => setIncomingMuted(!incomingMuted)}
                  className="text-slate-400 hover:text-white transition-colors"
                  title={incomingMuted ? "Unmute Candidate Audio" : "Mute Candidate Audio"}
                >
                  {incomingMuted || incomingVolume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-slate-300" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={incomingMuted ? 0 : incomingVolume}
                  onChange={(e) => {
                    setIncomingVolume(parseFloat(e.target.value));
                    if (incomingMuted) setIncomingMuted(false);
                  }}
                  className="w-16 accent-indigo-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  title="Candidate Voice Volume"
                />
              </div>

              {/* Interviewer Speak-Back Microphone */}
              <div className="pl-2 border-l border-slate-800">
                <button
                  type="button"
                  onClick={toggleInterviewerMic}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    interviewerMicEnabled
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                  title={interviewerMicEnabled ? "Mute your microphone" : "Speak to candidate"}
                >
                  {interviewerMicEnabled ? (
                    <>
                      <Mic className="w-3.5 h-3.5 animate-pulse" />
                      <span>Speaking</span>
                    </>
                  ) : (
                    <>
                      <MicOff className="w-3.5 h-3.5 text-slate-400" />
                      <span>Mic Off</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              {livekitError ? (
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>{livekitError}</span>
                  <button
                    type="button"
                    onClick={connectToLivekit}
                    disabled={livekitConnecting}
                    className="ml-1 px-2 py-0.5 rounded bg-rose-600/40 hover:bg-rose-600/60 text-white font-semibold flex items-center gap-1 border border-rose-500/40 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${livekitConnecting ? 'animate-spin' : ''}`} /> Retry
                  </button>
                </div>
              ) : (
                <span className="text-slate-500">
                  {livekitConnecting ? 'Connecting call...' : 'Live call standby'}
                </span>
              )}
              {!livekitConnecting && !livekitError && (
                <button
                  type="button"
                  onClick={connectToLivekit}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" /> Connect Call
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Left Column (Live Video & Question Console) / Right Column (Candidate Answers & Scoring) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Live Video + Question Navigator & Push Console (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Candidate Live Stream Feed Container */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Video className="w-4 h-4 text-indigo-400" />
                <span>Candidate Live Feed ({liveData.candidate_name || 'Candidate'})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${callConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className="text-[11px] text-slate-400">
                  {callConnected ? (candidateHasVideo ? 'Video + Audio Live' : 'Audio Live') : 'Standby'}
                </span>
              </div>
            </div>

            <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`w-full h-full object-cover ${candidateHasVideo ? 'block' : 'hidden'}`}
              />

              {!candidateHasVideo && (
                <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
                  <div className="w-14 h-14 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mb-2 text-indigo-400">
                    <User className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-semibold text-white">
                    {callConnected ? 'Live Audio Channel Active' : 'Waiting for Candidate Stream'}
                  </h4>
                  <p className="text-[11px] text-slate-500 max-w-xs mt-0.5">
                    {callConnected 
                      ? 'Candidate voice is connected. Camera will show when enabled.'
                      : 'Video and audio will stream automatically when candidate enters room.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Question Selector Tabs */}
          {questions.length > 0 && (
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-2 overflow-x-auto scrollbar-thin">
              <div className="flex items-center gap-2 overflow-x-auto">
                {questions.map((q, idx) => {
                  const isSelected = idx === activeQuestionIdx;
                  const isAnswered = q.is_answered || Boolean(q.candidate_answer || q.transcription);
                  const isScored = q.interviewer_score !== null && q.interviewer_score !== undefined;
                  const isPushed = (pushedQuestionId === q.id || liveData.pushed_question_id === q.id);

                  return (
                    <button
                      key={q.id || idx}
                      type="button"
                      onClick={() => {
                        setActiveQuestionIdx(idx);
                        setPushSuccessNotice('');
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                          : isScored
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : isAnswered
                          ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                          : isPushed
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      <span>Q{idx + 1}</span>
                      {isScored ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : isAnswered ? (
                        <Check className="w-3.5 h-3.5 text-purple-400" />
                      ) : isPushed ? (
                        <Send className="w-3 h-3 text-amber-400" />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {/* Extra Question Tools */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddCustomModal(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-semibold border border-slate-700 flex items-center gap-1 cursor-pointer"
                  title="Add custom question to interview"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Custom Q</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !showSuggestionsPanel;
                    setShowSuggestionsPanel(next);
                    if (next && suggestedQuestions.length === 0) {
                      loadSuggestedQuestions();
                    }
                  }}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    showSuggestionsPanel
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                  }`}
                  title="AI follow-up questions"
                >
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                  <span>AI Suggestions</span>
                  {suggestedQuestions.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500 text-white font-mono">
                      {suggestedQuestions.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* AI Suggested Questions Expandable Drawer */}
          {showSuggestionsPanel && (
            <div className="bg-[#0F172A] border border-indigo-500/30 rounded-2xl p-4 space-y-3 shadow-lg animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    AI Suggested Follow-Up Questions
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadSuggestedQuestions(true)}
                    disabled={loadingSuggestions}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold border border-slate-700 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingSuggestions ? 'animate-spin' : ''}`} />
                    <span>Generate More</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSuggestionsPanel(false)}
                    className="text-slate-500 hover:text-slate-300 text-xs px-2"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {loadingSuggestions ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-indigo-400" />
                  <span>Analyzing candidate answers and formulating suggested technical questions...</span>
                </div>
              ) : suggestedQuestions.length > 0 ? (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {suggestedQuestions.map((sug) => (
                    <div
                      key={sug.id}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 space-y-2 text-xs transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold">
                            {sug.domain || 'Technical'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                            {sug.difficulty || 'Medium'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSkipSuggestedQuestion(sug.id)}
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px]"
                          >
                            Skip
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAskSuggestedQuestion(sug.id)}
                            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] flex items-center gap-1 shadow cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            <span>Send Question</span>
                          </button>
                        </div>
                      </div>
                      <p className="text-slate-200 text-xs leading-relaxed font-medium">
                        {sug.question_text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">
                  <span>No suggested questions available. Click Generate More to query AI suggestions.</span>
                </div>
              )}
            </div>
          )}

          {/* Active Question Display & Push Controls */}
          {activeQ ? (
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-5 shadow-sm">
              {/* Question Header & Action Buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" />
                    Question {activeQuestionIdx + 1} of {questions.length}
                  </span>
                  {activeQ.domain && (
                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[11px] font-semibold">
                      {activeQ.domain}
                    </span>
                  )}
                  {activeQ.difficulty && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900 text-slate-300 border border-slate-800">
                      {activeQ.difficulty}
                    </span>
                  )}
                </div>

                {/* Send Question, Remote Recording, Next Question Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {isCurrentQPushed ? (
                    <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      Question Sent
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendQuestion()}
                      disabled={sendingQuestion}
                      className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {sendingQuestion ? 'Sending...' : 'Send Question'}
                    </button>
                  )}

                  {/* Remote Recording Controls: Start / Stop Recording for Candidate */}
                  {liveData?.candidate_activity?.state === 'recording' ? (
                    <button
                      type="button"
                      onClick={() => handleRemoteRecordingControl('stop')}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/30 transition-all cursor-pointer animate-pulse"
                      title="Remote control: stop candidate's audio recording"
                    >
                      <Square className="w-3.5 h-3.5 fill-white" />
                      Stop Answer Recording
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRemoteRecordingControl('start')}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                      title="Remote control: trigger candidate's microphone to start answer recording"
                    >
                      <Mic className="w-3.5 h-3.5 text-rose-400" />
                      Start Answer Recording
                    </button>
                  )}

                  {/* Manual Next Question Button */}
                  {activeQuestionIdx < questions.length - 1 && (
                    <button
                      type="button"
                      onClick={handleNextQuestion}
                      disabled={advancingQuestion}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
                        (activeQ?.is_answered || Boolean(activeQ?.candidate_answer || activeQ?.transcription))
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 ring-2 ring-emerald-400/50 animate-pulse'
                          : 'bg-indigo-600/80 hover:bg-indigo-600 text-white shadow-indigo-600/20'
                      }`}
                      title={activeQ?.is_answered ? "Candidate answer received. Click to advance to next question." : "Advance to next question"}
                    >
                      <span>{advancingQuestion ? 'Advancing...' : 'Next Question'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {pushSuccessNotice && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{pushSuccessNotice}</span>
                </div>
              )}

              {/* Question Text */}
              <div>
                <h3 className="text-base font-semibold text-white leading-relaxed">
                  {activeQ.question_text}
                </h3>
              </div>

              {/* CONFIDENTIAL INTERVIEWER RUBRIC / EXPECTED CRITERIA */}
              {activeQ.expected_criteria && activeQ.expected_criteria.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-900/90 border border-indigo-500/30 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 uppercase tracking-wide">
                    <Lock className="w-3.5 h-3.5" />
                    Confidential Evaluation Rubric & Expected Concepts
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Visible only to interviewer. Never shown to candidate.
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-slate-300">
                    {Array.isArray(activeQ.expected_criteria) ? (
                      activeQ.expected_criteria.map((c, i) => (
                        <li key={i} className="leading-snug">{c}</li>
                      ))
                    ) : (
                      <li>{String(activeQ.expected_criteria)}</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
              No questions found for this interview.
            </div>
          )}
        </div>

        {/* Right Column: Live Candidate Answer Stream & Independent Human Scoring (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Candidate Response Card */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Candidate Answer Status</h3>
              </div>
              <div className="flex items-center gap-2">
                {activeQ?.is_answered || Boolean(activeQ?.candidate_answer || activeQ?.transcription) ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Answer Received
                  </span>
                ) : liveData?.candidate_activity?.state === 'recording' ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1 animate-pulse">
                    <Mic className="w-3 h-3" />
                    Recording in Progress
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Awaiting Response
                  </span>
                )}
                {activeQ?.question_state && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 border border-slate-800 text-slate-400">
                    {activeQ.question_state}
                  </span>
                )}
              </div>
            </div>

            {/* Answer Content */}
            <div className="space-y-3">
              {activeQ?.candidate_answer || activeQ?.transcription ? (
                <div className="space-y-3">
                  {/* Spoken Voice Recording Player (if audio available) */}
                  {activeQ.audio_url && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Voice Answer Recording:
                      </span>
                      <AudioPlayer
                        audioUrl={activeQ.audio_url}
                        title={`Candidate Spoken Answer (Q${activeQuestionIdx + 1})`}
                        compact={true}
                      />
                    </div>
                  )}

                  {/* Transcript or Typed Answer Text */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      {activeQ.audio_url ? 'Groq Whisper Transcription:' : 'Written Candidate Response:'}
                    </span>
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 leading-relaxed font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {activeQ.candidate_answer || activeQ.transcription}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2 border border-dashed border-slate-800 rounded-xl">
                  <Clock className="w-8 h-8 text-slate-600 animate-pulse" />
                  <p className="text-xs font-semibold text-slate-300">
                    Candidate has not submitted an answer for Question {activeQuestionIdx + 1} yet.
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Responses will appear here instantly as soon as recorded and saved.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* INDEPENDENT HUMAN SCORING CONSOLE */}
          {activeQ && (
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-sm font-bold text-white">Independent Human Evaluation</h4>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <span>Score:</span>
                  <span className="text-base font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                    {humanScore.toFixed(1)} / 10
                  </span>
                </div>
              </div>

              {/* Slider */}
              <div className="space-y-1">
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={humanScore}
                  onChange={(e) => setHumanScore(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>1.0 (Unsatisfactory)</span>
                  <span>5.0 (Adequate)</span>
                  <span>7.5 (Competent)</span>
                  <span>10.0 (Exceptional)</span>
                </div>
              </div>

              {/* Interviewer Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Interviewer Notes & Observations:
                </label>
                <textarea
                  rows={3}
                  value={interviewerNotes}
                  onChange={(e) => setInterviewerNotes(e.target.value)}
                  placeholder="Record your notes on problem solving structure, code clarity, trade-offs..."
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                />
              </div>

              {scoreError && (
                <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                  {scoreError}
                </div>
              )}

              {scoreSaveSuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Human score logged successfully!
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>AI scores sealed to prevent bias</span>
                </div>

                <button
                  type="button"
                  onClick={handleSaveScore}
                  disabled={savingScore}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {savingScore ? 'Saving Score...' : 'Save Human Score'}
                </button>
              </div>
            </div>
          )}

          {/* AI Blind Evaluation Status Notice */}
          <div className="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-indigo-300">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>BiasGuard AI Blind Evaluation Pipeline</span>
            </div>
            <p className="text-slate-400 leading-snug">
              AI evaluates candidate responses independently in the background. Scores and discrepancy reports remain sealed until the session is completed to preserve objective human judgment.
            </p>
          </div>
        </div>
      </div>

      {/* Modal: Add Custom Question */}
      {showAddCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Add Custom Question</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomModal(false)}
                className="text-slate-500 hover:text-slate-300 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Question Text:
                </label>
                <textarea
                  rows={4}
                  value={customQuestionText}
                  onChange={(e) => setCustomQuestionText(e.target.value)}
                  placeholder="Enter the technical question to send to the candidate..."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Domain:</label>
                  <select
                    value={customQuestionDomain}
                    onChange={(e) => setCustomQuestionDomain(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="DSA">DSA</option>
                    <option value="System Design">System Design</option>
                    <option value="Java">Java</option>
                    <option value="Python">Python</option>
                    <option value="React">React</option>
                    <option value="Database">Database</option>
                    <option value="Behavioral">Behavioral</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Difficulty:</label>
                  <select
                    value={customQuestionDifficulty}
                    onChange={(e) => setCustomQuestionDifficulty(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddCustomModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomQuestion}
                disabled={addingCustom || !customQuestionText.trim()}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{addingCustom ? 'Sending...' : 'Send to Candidate'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: End Interview Session */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto">
              <PhoneOff className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white">End Interview Session?</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Ending the interview will finalize candidate responses, conclude the live room, and unseal the complete comparative report contrasting human and AI evaluation scores.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEndInterview}
                disabled={endingSession}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                {endingSession ? 'Ending Session...' : 'Yes, End Interview'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterviewerLivePage;