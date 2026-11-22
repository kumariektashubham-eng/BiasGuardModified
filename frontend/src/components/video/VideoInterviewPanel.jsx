import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Radio,
  Copy,
  Check,
  Mail,
  Users,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Volume2,
  VolumeX,
  ExternalLink,
  Send,
  ChevronRight,
  Sparkles,
  Bell,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { livekitApi, interviewsApi, formatApiError } from '../../services/api';

export const VideoInterviewPanel = ({
  interviewId,
  interview,
  activeQuestion,
  activeQuestionIndex = 0,
  onAnswerRecorded,
  onNextQuestion,
  onQuestionChanged,
  onError,
  onReloadInterview
}) => {
  // Connection states
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [candidateConnected, setCandidateConnected] = useState(false);
  const [candidateHasVideo, setCandidateHasVideo] = useState(false);
  const [candidateSpeaking, setCandidateSpeaking] = useState(false);
  const [candidateName, setCandidateName] = useState(interview?.candidate_name || 'Candidate');
  const [candidateActivity, setCandidateActivity] = useState('idle'); // 'idle' | 'viewing' | 'typing' | 'recording' | 'submitted'
  const [room, setRoom] = useState(null);

  // Local media controls (Interviewer)
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const [incomingVolume, setIncomingVolume] = useState(1.0);
  const [incomingMuted, setIncomingMuted] = useState(false);

  // Question pushing & progression states
  const [sendingQuestion, setSendingQuestion] = useState(false);
  const [pushedQuestionId, setPushedQuestionId] = useState(interview?.pushed_question_id || null);
  const [pushNotice, setPushNotice] = useState('');
  const [advancingQuestion, setAdvancingQuestion] = useState(false);

  // Real-time Candidate Answer Notification
  const [answerNotification, setAnswerNotification] = useState(null);

  // Invitation link states
  const [copiedLink, setCopiedLink] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState('');

  // Refs for bulletproof cleanup and media streaming
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const roomRef = useRef(null);
  const localStreamRef = useRef(null);

  // 1. Synchronize candidate name & pushed question ID when interview prop changes
  useEffect(() => {
    if (interview?.candidate_name) {
      setCandidateName(interview.candidate_name);
    }
    if (interview?.pushed_question_id) {
      setPushedQuestionId(interview.pushed_question_id);
    }
  }, [interview?.candidate_name, interview?.pushed_question_id]);

  // Handle incoming remote audio volume
  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = incomingMuted ? 0 : incomingVolume;
    }
  }, [incomingVolume, incomingMuted]);

  // 2. Connect to LiveKit Room as Interviewer (Safe against StrictMode duplicate mount)
  useEffect(() => {
    if (!interviewId) return;

    let isCancelled = false;

    const connectLiveKit = async () => {
      // Clean up previous room if any
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }

      setConnecting(true);
      setConnectionError('');

      try {
        const res = await livekitApi.getInterviewerToken(interviewId);
        if (isCancelled) return;

        const { url, token } = res.data;

        const lkRoom = new Room({
          adaptiveStream: true,
          dynacast: true
        });

        // Remote Participant Connected
        lkRoom.on(RoomEvent.ParticipantConnected, (participant) => {
          if (isCancelled) return;
          setCandidateConnected(true);
          if (participant.name) setCandidateName(participant.name);
        });

        // Remote Participant Disconnected
        lkRoom.on(RoomEvent.ParticipantDisconnected, () => {
          if (isCancelled) return;
          setCandidateConnected(false);
          setCandidateHasVideo(false);
          setCandidateSpeaking(false);
        });

        // Track Subscriptions (Candidate Video and Audio)
        lkRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          if (isCancelled) return;
          setCandidateConnected(true);
          if (participant.name) setCandidateName(participant.name);

          if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
            track.attach(remoteVideoRef.current);
            setCandidateHasVideo(true);
          } else if (track.kind === Track.Kind.Audio && remoteAudioRef.current) {
            track.attach(remoteAudioRef.current);
          }
        });

        // Track Unsubscribed
        lkRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach();
          if (track.kind === Track.Kind.Video) {
            setCandidateHasVideo(false);
          }
        });

        // Active Speakers
        lkRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          if (isCancelled) return;
          const candidateActive = speakers.some(
            (s) => s.identity !== lkRoom.localParticipant?.identity
          );
          setCandidateSpeaking(candidateActive);
        });

        // LiveKit Room Disconnected
        lkRoom.on(RoomEvent.Disconnected, () => {
          if (isCancelled) return;
          setConnected(false);
          setCandidateConnected(false);
          setCandidateHasVideo(false);
        });

        // Data Messages from Candidate (e.g. ANSWER_SUBMITTED, ANSWER_RECORDING_STARTED, state_updated)
        lkRoom.on(RoomEvent.DataReceived, (payload) => {
          if (isCancelled) return;
          try {
            const str = new TextDecoder().decode(payload);
            const data = JSON.parse(str);

            if (data.type === 'ANSWER_SUBMITTED' || data.type === 'answer_submitted') {
              const qIdx =
                data.question_index !== undefined
                  ? data.question_index + 1
                  : activeQuestionIndex + 1;
              const candName =
                data.candidate_name || interview?.candidate_name || 'Candidate';

              setAnswerNotification({
                type: 'success',
                candidate_name: candName,
                question_id: data.question_id,
                question_index: qIdx,
                submission_mode: data.submission_mode || 'voice_recorded',
                transcription: data.transcription || data.candidate_answer || '',
                audio_url: data.audio_url || '',
                time: new Date()
              });

              setCandidateActivity('submitted');

              if (onAnswerRecorded) {
                onAnswerRecorded({
                  audio_id: data.audio_id,
                  audio_url: data.audio_url,
                  transcription: data.transcription || data.candidate_answer,
                  duration_seconds: data.recording_duration,
                  submission_mode: data.submission_mode || 'voice_recorded',
                  question_id: data.question_id
                });
              }

              if (onReloadInterview) {
                onReloadInterview();
              }
            } else if (data.type === 'ANSWER_RECORDING_STARTED') {
              setCandidateActivity('recording');
            } else if (data.type === 'ANSWER_UPLOAD_FAILED') {
              setAnswerNotification({
                type: 'error',
                candidate_name: data.candidate_name || interview?.candidate_name || 'Candidate',
                question_id: data.question_id,
                question_index:
                  data.question_index !== undefined
                    ? data.question_index + 1
                    : activeQuestionIndex + 1,
                error: data.error || 'Recording upload failed',
                time: new Date()
              });
            } else if (data.type === 'state_updated') {
              setCandidateActivity(data.state || 'idle');
            }
          } catch (e) {
            console.warn('LiveKit data packet parse notice:', e);
          }
        });

        await lkRoom.connect(url, token);
        if (isCancelled) {
          lkRoom.disconnect();
          return;
        }

        roomRef.current = lkRoom;
        setRoom(lkRoom);
        setConnected(true);

        // Check if candidate is already in room
        if (lkRoom.remoteParticipants.size > 0) {
          setCandidateConnected(true);
          lkRoom.remoteParticipants.forEach((p) => {
            if (p.name) setCandidateName(p.name);
            p.trackPublications.forEach((pub) => {
              if (pub.track && pub.isSubscribed) {
                if (pub.kind === Track.Kind.Video && remoteVideoRef.current) {
                  pub.track.attach(remoteVideoRef.current);
                  setCandidateHasVideo(true);
                }
                if (pub.kind === Track.Kind.Audio && remoteAudioRef.current) {
                  pub.track.attach(remoteAudioRef.current);
                }
              }
            });
          });
        }

        // Acquire local interviewer media stream for self preview and broadcasting
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true
          });
          if (isCancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          localStreamRef.current = stream;
          setLocalStream(stream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          await lkRoom.localParticipant.setCameraEnabled(cameraEnabled).catch(() => { });
          await lkRoom.localParticipant.setMicrophoneEnabled(micEnabled).catch(() => { });
        } catch (mediaErr) {
          console.warn('Interviewer local media access notice:', mediaErr);
          // Try audio only
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (isCancelled) {
              audioStream.getTracks().forEach((t) => t.stop());
              return;
            }
            localStreamRef.current = audioStream;
            setLocalStream(audioStream);
            setCameraEnabled(false);
            await lkRoom.localParticipant.setMicrophoneEnabled(micEnabled).catch(() => { });
          } catch (audioErr) {
            setCameraEnabled(false);
            setMicEnabled(false);
          }
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to connect interviewer to LiveKit room:', err);
          setConnectionError('Live call could not connect. Check LiveKit settings.');
          setConnected(false);
          if (onError) onError('Live call could not connect. Check LiveKit settings.');
        }
      } finally {
        if (!isCancelled) {
          setConnecting(false);
        }
      }
    };

    connectLiveKit();

    return () => {
      isCancelled = true;
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    };
  }, [interviewId, retryCount]);

  // 3. Send Question to Candidate Screen (Manual Progression)
  const handleSendQuestion = async () => {
    if (!activeQuestion) return;
    setSendingQuestion(true);
    setPushNotice('');

    try {
      await interviewsApi.sendQuestion(interviewId, {
        question_id: activeQuestion.id,
        question_index: activeQuestionIndex
      });

      // Broadcast QUESTION_SENT via LiveKit data channel for instant delivery
      if (roomRef.current && connected) {
        try {
          const packet = JSON.stringify({
            type: 'QUESTION_SENT',
            interview_id: interviewId,
            question_id: activeQuestion.id,
            question_index: activeQuestionIndex,
            question_text: activeQuestion.question_text,
            domain: activeQuestion.domain,
            difficulty: activeQuestion.difficulty,
            total: (interview?.questions || []).length,
            timestamp: new Date().toISOString()
          });
          roomRef.current.localParticipant.publishData(new TextEncoder().encode(packet), {
            reliable: true
          });
        } catch (e) {
          console.warn('LiveKit question publish notice:', e);
        }
      }

      setPushedQuestionId(activeQuestion.id);
      setPushNotice(`Question ${activeQuestionIndex + 1} sent to candidate screen!`);
      setTimeout(() => setPushNotice(''), 4000);
      setAnswerNotification(null);
    } catch (err) {
      console.error('Failed to send question to candidate:', err);
      const msg = formatApiError(err, 'Failed to send question to candidate.');
      setPushNotice(`Error: ${msg}`);
      if (onError) onError(msg);
    } finally {
      setSendingQuestion(false);
    }
  };

  // 4. Manual Next Question Advance (Interviewer Controlled)
  const handleNextQuestionClick = async () => {
    const questions = interview?.questions || [];
    if (activeQuestionIndex >= questions.length - 1) return;

    setAdvancingQuestion(true);
    const nextIdx = activeQuestionIndex + 1;
    const nextQ = questions[nextIdx];

    try {
      await interviewsApi.nextQuestion(interviewId, {
        target_index: nextIdx,
        question_id: nextQ?.id
      });

      // Broadcast QUESTION_SENT for the next question via LiveKit
      if (roomRef.current && connected && nextQ) {
        try {
          const packet = JSON.stringify({
            type: 'QUESTION_SENT',
            interview_id: interviewId,
            question_id: nextQ.id,
            question_index: nextIdx,
            question_text: nextQ.question_text,
            domain: nextQ.domain,
            difficulty: nextQ.difficulty,
            total: questions.length,
            timestamp: new Date().toISOString()
          });
          roomRef.current.localParticipant.publishData(new TextEncoder().encode(packet), {
            reliable: true
          });
        } catch (e) {
          console.warn('Notice publishing next question via LiveKit:', e);
        }
      }

      setPushedQuestionId(nextQ?.id);
      setPushNotice(`Advanced to Question ${nextIdx + 1} & broadcast to candidate!`);
      setTimeout(() => setPushNotice(''), 4000);
      setAnswerNotification(null);

      if (onNextQuestion) {
        onNextQuestion(nextIdx);
      } else if (onQuestionChanged) {
        onQuestionChanged(nextIdx);
      }
    } catch (err) {
      console.error('Failed to advance to next question:', err);
      if (onNextQuestion) onNextQuestion(nextIdx);
    } finally {
      setAdvancingQuestion(false);
    }
  };

  // 5. Media Control Toggles
  const toggleLocalMic = async () => {
    const nextState = !micEnabled;
    setMicEnabled(nextState);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = nextState;
      });
    }
    if (roomRef.current) {
      await roomRef.current.localParticipant.setMicrophoneEnabled(nextState).catch(() => { });
    }
  };

  const toggleLocalCamera = async () => {
    const nextState = !cameraEnabled;
    setCameraEnabled(nextState);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = nextState;
      });
    }
    if (roomRef.current) {
      await roomRef.current.localParticipant.setCameraEnabled(nextState).catch(() => { });
    }
  };

  // 6. Invitation Link Copy & Email Dispatch
  const handleCopyLink = async () => {
    try {
      let inviteUrl = '';
      if (interview?.invitation?.raw_token) {
        inviteUrl = `${window.location.origin}/interview-room/${interview.invitation.raw_token}`;
      } else {
        const res = await interviewsApi.sendInvite(interviewId, {
          candidate_email: interview?.candidate_email
        });
        inviteUrl = res.data?.invite_url || `${window.location.origin}/interview-room/${res.data?.raw_token}`;
      }

      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (err) {
      console.error('Failed to copy invitation link:', err);
      alert('Could not copy invitation link. Please verify interview status.');
    }
  };

  const handleSendEmailInvite = async () => {
    let targetEmail = (interview?.candidate_email || '').trim();
    if (!targetEmail) {
      const entered = window.prompt(
        `Enter candidate email address for '${interview?.candidate_name || 'Candidate'}':`
      );
      if (!entered || !entered.trim()) return;
      targetEmail = entered.trim();
    }

    setSendingInvite(true);
    setInviteSuccessMsg('');
    try {
      const res = await interviewsApi.sendInvite(interviewId, { candidate_email: targetEmail });
      const email = res.data?.candidate_email || targetEmail;
      setInviteSuccessMsg(`Invitation email successfully dispatched to ${email}!`);
      setTimeout(() => setInviteSuccessMsg(''), 5000);
      if (onReloadInterview) onReloadInterview();
    } catch (err) {
      const msg = formatApiError(err, 'Failed to dispatch invitation email.');
      alert(msg);
    } finally {
      setSendingInvite(false);
    }
  };

  const isCurrentQPushed =
    activeQuestion &&
    (pushedQuestionId === activeQuestion.id || interview?.pushed_question_id === activeQuestion.id);

  const totalQuestions = (interview?.questions || []).length;
  const hasNextQuestion = activeQuestionIndex < totalQuestions - 1;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mb-6">
      {/* Hidden audio element for candidate live voice */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* Top Header / Call Status Bar */}
      <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Live Video Call
          </span>
          <span className="text-xs text-slate-400">
            • Room: interview_{interviewId.slice(-6)}
          </span>
          {connecting && (
            <span className="text-xs text-indigo-400 flex items-center gap-1 font-medium">
              <RefreshCw className="w-3 h-3 animate-spin" /> Connecting...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {/* Candidate Presence Indicator */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${candidateConnected
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${candidateConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
            />
            {candidateConnected ? (
              <span className="flex items-center gap-1">
                <span>{candidateName} Joined</span>
                {candidateSpeaking && (
                  <span className="text-[10px] text-emerald-400 font-mono font-bold animate-pulse">
                    (Speaking)
                  </span>
                )}
              </span>
            ) : (
              'Candidate Not Yet in Call'
            )}
          </div>

          {/* Invitation Copy & Send Actions */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors cursor-pointer"
              title="Copy candidate invitation link"
            >
              {copiedLink ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copiedLink ? 'Link Copied!' : 'Copy Guest Link'}
            </button>

            <button
              type="button"
              onClick={handleSendEmailInvite}
              disabled={sendingInvite}
              className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-medium rounded-lg border border-indigo-500/30 transition-colors cursor-pointer"
              title="Send invitation email to candidate"
            >
              {sendingInvite ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Mail className="w-3.5 h-3.5" />
              )}
              {sendingInvite ? 'Sending...' : 'Email Invite'}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation & Error Notices */}
      {inviteSuccessMsg && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{inviteSuccessMsg}</span>
        </div>
      )}

      {connectionError && (
        <div className="bg-rose-500/10 border-b border-rose-500/20 px-4 py-2 text-xs text-rose-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{connectionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setRetryCount((c) => c + 1)}
            disabled={connecting}
            className="px-2.5 py-1 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-white font-semibold flex items-center gap-1 border border-rose-500/40 cursor-pointer text-xs"
          >
            <RefreshCw className={`w-3 h-3 ${connecting ? 'animate-spin' : ''}`} /> Retry
          </button>
        </div>
      )}

      {/* Real-time Candidate Answer Notification Banner */}
      {answerNotification && (
        <div
          className={`p-4 border-b flex items-center justify-between text-xs animate-in fade-in ${answerNotification.type === 'error'
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${answerNotification.type === 'error'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-emerald-500/20 text-emerald-400'
                }`}
            >
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            <div>
              <strong className="block text-sm font-bold text-white">
                {answerNotification.type === 'error'
                  ? `Candidate Audio Upload Failed for Question ${answerNotification.question_index}`
                  : `Candidate Answer Submitted: ${answerNotification.candidate_name} has submitted Question ${answerNotification.question_index}.`}
              </strong>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-300">
                <span>Audio uploaded & transcribed with Groq Whisper</span>
                <span>•</span>
                <span>
                  {answerNotification.time
                    ? answerNotification.time.toLocaleTimeString()
                    : new Date().toLocaleTimeString()}
                </span>
                <span>•</span>
                <span className="text-emerald-400 font-semibold">Ready for Review & Scoring</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAnswerNotification(null)}
            className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Video Call Grid */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Candidate Remote Video Stream (Primary - 8 cols) */}
        <div className="lg:col-span-8 flex flex-col">
          <div className="relative aspect-video w-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-inner flex items-center justify-center">
            {/* Candidate Remote Video Element */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover ${candidateConnected && candidateHasVideo ? 'block' : 'hidden'
                }`}
            />

            {/* Candidate Connected with Audio Only */}
            {candidateConnected && !candidateHasVideo && (
              <div className="flex flex-col items-center justify-center text-center p-6 text-slate-300">
                <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mb-2.5 text-indigo-400">
                  <Users className="w-8 h-8" />
                </div>
                <h4 className="text-base font-bold text-white">{candidateName} Connected</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Candidate voice is streaming live via LiveKit. Video camera is standby/audio-only.
                </p>
                {candidateSpeaking && (
                  <span className="mt-2.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold animate-pulse">
                    Speaking Live
                  </span>
                )}
              </div>
            )}

            {/* Candidate Not In Call Placeholder */}
            {!candidateConnected && (
              <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-2.5 text-indigo-400">
                  <Users className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">Candidate Not Yet in Call</h4>
                <p className="text-xs text-slate-400 max-w-sm mb-3.5">
                  Share the guest invitation link with the candidate or click "Email Invite" above.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedLink ? 'Link Copied!' : 'Copy Guest Link'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSendEmailInvite}
                    disabled={sendingInvite}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Email Candidate</span>
                  </button>
                </div>
              </div>
            )}

            {/* Candidate Overlay Label */}
            <div className="absolute top-2.5 left-2.5 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-semibold text-slate-200 border border-slate-800 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${candidateConnected ? 'bg-emerald-400' : 'bg-slate-600'
                  }`}
              />
              <span>Candidate: {candidateName}</span>
            </div>

            {/* Candidate Activity State Badge */}
            {candidateConnected && candidateActivity !== 'idle' && (
              <div className="absolute bottom-2.5 left-2.5 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-300 border border-slate-800 flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-indigo-400 animate-spin" />
                <span>
                  {candidateActivity === 'recording'
                    ? 'Candidate is Recording Answer...'
                    : candidateActivity === 'typing'
                      ? 'Candidate is Typing Answer...'
                      : candidateActivity === 'submitted'
                        ? 'Answer Submitted'
                        : 'Candidate is Viewing Question'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Interviewer Self-View & Progression Controls (4 cols) */}
        <div className="lg:col-span-4 flex flex-col justify-between gap-3">
          {/* Self Preview */}
          <div className="relative aspect-video w-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-inner flex items-center justify-center">
            {cameraEnabled && localStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-500 text-xs">
                <VideoOff className="w-6 h-6 mb-1 text-slate-600" />
                <span>Interviewer Camera Off</span>
              </div>
            )}

            <div className="absolute bottom-2 left-2 bg-slate-900/80 px-2 py-0.5 rounded text-[10px] text-slate-300">
              You (Interviewer)
            </div>

            {/* Self Media Controls */}
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              <button
                type="button"
                onClick={toggleLocalMic}
                className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer ${micEnabled
                    ? 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
                    : 'bg-rose-500 text-white'
                  }`}
                title={micEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
              >
                {micEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={toggleLocalCamera}
                className={`p-1.5 rounded-md text-xs transition-colors cursor-pointer ${cameraEnabled
                    ? 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
                    : 'bg-rose-500 text-white'
                  }`}
                title={cameraEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
              >
                {cameraEnabled ? (
                  <Video className="w-3.5 h-3.5" />
                ) : (
                  <VideoOff className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Active Question & Question Progression Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between flex-1 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Radio
                    className={`w-3.5 h-3.5 ${isCurrentQPushed ? 'text-emerald-400' : 'text-indigo-400'
                      }`}
                  />
                  <span>
                    Question {activeQuestionIndex + 1} of {totalQuestions}
                  </span>
                </span>

                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-semibold ${isCurrentQPushed
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                >
                  {isCurrentQPushed ? 'Live on Candidate Screen' : 'Ready to Send'}
                </span>
              </div>

              <p className="text-xs text-slate-200 line-clamp-3 leading-relaxed font-medium">
                {activeQuestion?.question_text || 'No question selected.'}
              </p>
            </div>

            {/* Action Buttons: Send Question & Next Question */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendQuestion}
                  disabled={sendingQuestion}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer ${isCurrentQPushed
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                    }`}
                  title="Broadcast this question to candidate room in real-time"
                >
                  {sendingQuestion ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>{isCurrentQPushed ? 'Re-Send Question' : 'Send Question'}</span>
                </button>

                {hasNextQuestion && (
                  <button
                    type="button"
                    onClick={handleNextQuestionClick}
                    disabled={advancingQuestion}
                    className="py-2 px-3 rounded-xl bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/30 text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title="Advance to next question"
                  >
                    {advancingQuestion ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    <span>Next Q</span>
                  </button>
                )}
              </div>

              {pushNotice && (
                <div className="text-[11px] text-emerald-400 text-center font-medium py-0.5">
                  {pushNotice}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
