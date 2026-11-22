import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ShieldCheck, 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  PhoneOff, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  HelpCircle, 
  Sparkles, 
  Volume2, 
  RefreshCw,
  Info,
  ChevronLeft,
  ChevronRight,
  Send,
  FileText,
  Check,
  Save,
  XCircle,
  Radio,
  Lock
} from 'lucide-react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { interviewsApi, livekitApi } from '../services/api';
import { VoiceAnswerRecorder } from '../components/voice/VoiceAnswerRecorder';
import { AudioPlayer } from '../components/voice/AudioPlayer';
import { formatApiError } from '../utils/errorFormatter';

export const CandidateInterviewRoom = () => {
  const { token } = useParams();

  // Lifecycle states: 'loading' | 'invalid' | 'consent' | 'declined' | 'in_call' | 'completed'
  const [phase, setPhase] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorType, setErrorType] = useState('generic'); // 'generic' | 'not_found' | 'expired' | 'completed'
  const [interviewData, setInterviewData] = useState(null);

  // Consent & Acceptance States
  const [acceptingConsent, setAcceptingConsent] = useState(false);
  const [decliningInvite, setDecliningInvite] = useState(false);

  // Active Pushed Question & Answering State
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [submittedPreview, setSubmittedPreview] = useState('');
  const [answerMode, setAnswerMode] = useState('voice'); // 'voice' | 'text'
  const [typedAnswer, setTypedAnswer] = useState('');
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [uploadErrorNotice, setUploadErrorNotice] = useState('');
  const [remoteTrigger, setRemoteTrigger] = useState(null);
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [submittingFinal, setSubmittingFinal] = useState(false);

  // Device & Stream States
  const [hasCamera, setHasCamera] = useState(true);
  const [hasMic, setHasMic] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);

  // LiveKit Connection States
  const [room, setRoom] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [livekitError, setLivekitError] = useState('');
  const [interviewerConnected, setInterviewerConnected] = useState(false);
  const [interviewerHasVideo, setInterviewerHasVideo] = useState(false);

  // Video element references
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const roomRef = useRef(null);
  const localStreamRef = useRef(null);

  // Activity State Sync (reports idle, viewing, typing, recording to interviewer live view)
  const sendActivityState = async (state) => {
    if (!token) return;
    try {
      await interviewsApi.sendCandidateState(token, {
        state,
        question_id: currentQuestion?.id || null
      });
    } catch (e) {
      // Non-blocking background sync
    }
  };

  // Sync state on question change
  useEffect(() => {
    if (phase === 'in_call' && token && currentQuestion) {
      sendActivityState('viewing');
    }
  }, [phase, currentQuestion?.id, token]);

  // Sync typing state debounced
  useEffect(() => {
    if (phase !== 'in_call' || !token || answerMode !== 'text') return;
    if (typedAnswer.trim()) {
      sendActivityState('typing');
      const timeout = setTimeout(() => {
        sendActivityState('viewing');
      }, 3500);
      return () => clearTimeout(timeout);
    }
  }, [typedAnswer, answerMode, phase, token]);

  // 1. Validate Invitation Token on Mount
  useEffect(() => {
    validateInvitation();
    return () => {
      cleanupStreams();
    };
  }, [token]);

  const validateInvitation = async () => {
    if (!token) {
      setErrorMessage('No invitation token found in link.');
      setErrorType('not_found');
      setPhase('invalid');
      return;
    }
    try {
      setPhase('loading');
      const res = await interviewsApi.getInvitation(token);
      if (res.data?.candidate_token) {
        localStorage.setItem('biasguard_candidate_token', res.data.candidate_token);
      }
      setInterviewData(res.data);

      if (res.data.status === 'completed' || res.data.invitation_status === 'completed') {
        setPhase('completed');
      } else if (res.data.status === 'declined' || res.data.invitation_status === 'declined') {
        setPhase('declined');
      } else if (res.data.invitation_status === 'accepted' && res.data.consent_recorded_at) {
        // Candidate previously consented: proceed to join room
        if (res.data.current_question) {
          setCurrentQuestion(res.data.current_question);
        }
        setPhase('in_call');
        startLocalPreview();
        joinInterviewCall();
      } else {
        // Clean Consent Screen: no media accessed or recorded yet
        setPhase('consent');
      }
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      if (status === 409) {
        setPhase('completed');
        setErrorMessage(detail || 'This technical interview has already been completed.');
      } else if (status === 410) {
        setErrorType('expired');
        setErrorMessage(detail || 'This interview invitation has expired. Please contact your interviewer for a new link.');
        setPhase('invalid');
      } else if (status === 404) {
        setErrorType('not_found');
        setErrorMessage(detail || 'Interview invitation not found. Please verify the link or request a new invitation.');
        setPhase('invalid');
      } else {
        setErrorType('generic');
        setErrorMessage(formatApiError(err, 'Invalid or expired interview link.'));
        setPhase('invalid');
      }
    }
  };

  // 2. Candidate Accepts Consent: start media and join LiveKit
  const handleAcceptConsent = async () => {
    setAcceptingConsent(true);
    try {
      await interviewsApi.acceptInvitation(token);
      setPhase('in_call');
      await startLocalPreview();
      await joinInterviewCall();
    } catch (err) {
      console.error('Accept invitation notice:', err);
      // Fallback: proceed to in-call room
      setPhase('in_call');
      await startLocalPreview();
      await joinInterviewCall();
    } finally {
      setAcceptingConsent(false);
    }
  };

  // 3. Candidate Declines Invitation: record refusal and record nothing
  const handleDeclineInvitation = async () => {
    setDecliningInvite(true);
    try {
      await interviewsApi.declineInvitation(token);
    } catch (err) {
      console.warn('Decline invitation notice:', err);
    } finally {
      cleanupStreams();
      setPhase('declined');
      setDecliningInvite(false);
    }
  };

  // 4. Local Camera & Mic Preview (Only called after Accept)
  const startLocalPreview = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setupAudioMeter(stream);
    } catch (err) {
      console.warn('Could not access full media devices:', err);
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audioOnly;
        setLocalStream(audioOnly);
        setHasCamera(false);
        setCameraEnabled(false);
        setupAudioMeter(audioOnly);
      } catch (audioErr) {
        setHasMic(false);
        setMicEnabled(false);
      }
    }
  };

  const setupAudioMeter = (stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (e) {
      console.warn('Audio analyser setup notice:', e);
    }
  };

  const cleanupStreams = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    } else if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    } else if (room) {
      room.disconnect();
    }
  };

  const toggleCamera = () => {
    if (!localStream) return;
    const vTracks = localStream.getVideoTracks();
    if (vTracks.length > 0) {
      const next = !cameraEnabled;
      vTracks[0].enabled = next;
      setCameraEnabled(next);
      if (room) {
        room.localParticipant.setCameraEnabled(next);
      }
    }
  };

  const toggleMic = () => {
    if (!localStream) return;
    const aTracks = localStream.getAudioTracks();
    if (aTracks.length > 0) {
      const next = !micEnabled;
      aTracks[0].enabled = next;
      setMicEnabled(next);
      if (room) {
        room.localParticipant.setMicrophoneEnabled(next);
      }
    }
  };

  // 5. Connect to LiveKit Room
  const joinInterviewCall = async () => {
    setConnecting(true);
    setLivekitError('');
    try {
      await interviewsApi.startInvitation(token).catch(() => {});

      const tokenRes = await livekitApi.getCandidateToken(token);
      const { url, token: lkToken } = tokenRes.data;

      const lkRoom = new Room({
        adaptiveStream: true,
        dynacast: true
      });

      // Handle Remote Tracks (Interviewer)
      lkRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        setInterviewerConnected(true);
        if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
          setInterviewerHasVideo(true);
        } else if (track.kind === Track.Kind.Audio && remoteAudioRef.current) {
          track.attach(remoteAudioRef.current);
        }
      });

      lkRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
        if (track.kind === Track.Kind.Video) {
          setInterviewerHasVideo(false);
        }
      });

      lkRoom.on(RoomEvent.ParticipantConnected, () => {
        setInterviewerConnected(true);
      });

      lkRoom.on(RoomEvent.ParticipantDisconnected, () => {
        setInterviewerConnected(false);
        setInterviewerHasVideo(false);
      });

      lkRoom.on(RoomEvent.Disconnected, () => {
        setConnected(false);
      });

      // Data messages from interviewer (e.g. question pushed, interview ended, remote recording triggers)
      lkRoom.on(RoomEvent.DataReceived, (payload) => {
        try {
          const str = new TextDecoder().decode(payload);
          const data = JSON.parse(str);
          if (data.type === 'QUESTION_SENT' || data.type === 'question_pushed') {
            const pushedQ = {
              id: data.question_id || data.question?.id,
              question_text: data.question_text || data.question?.question_text,
              domain: data.domain || data.question?.domain,
              difficulty: data.difficulty || data.question?.difficulty,
              index: (data.question_index !== undefined ? data.question_index + 1 : data.index) || 1,
              total: data.total || data.total_questions || interviewData?.total_questions || 1
            };
            setCurrentQuestion(pushedQ);
            setIsAnswerSubmitted(false);
            setSubmittedPreview('');
            setTypedAnswer('');
            setSaveNotice('');
            setUploadErrorNotice('');
            setRemoteTrigger(null);
          } else if (data.type === 'START_RECORDING_REQUESTED' || data.type === 'ANSWER_RECORDING_STARTED') {
            setRemoteTrigger('start');
          } else if (data.type === 'STOP_RECORDING_REQUESTED') {
            setRemoteTrigger('stop');
          } else if (data.type === 'INTERVIEW_ENDED' || data.type === 'interview_ended') {
            cleanupStreams();
            setPhase('completed');
          }
        } catch (e) {
          console.warn('Data packet parse notice:', e);
        }
      });

      await lkRoom.connect(url, lkToken);

      // Publish local camera and mic
      if (cameraEnabled) {
        await lkRoom.localParticipant.setCameraEnabled(true).catch(() => {});
      }
      if (micEnabled) {
        await lkRoom.localParticipant.setMicrophoneEnabled(true).catch(() => {});
      }

      roomRef.current = lkRoom;
      setRoom(lkRoom);
      setConnected(true);

      // Check if interviewer is already in the room
      if (lkRoom.remoteParticipants.size > 0) {
        setInterviewerConnected(true);
        lkRoom.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub) => {
            if (pub.track && pub.isSubscribed) {
              if (pub.kind === Track.Kind.Video && remoteVideoRef.current) {
                pub.track.attach(remoteVideoRef.current);
                setInterviewerHasVideo(true);
              }
              if (pub.kind === Track.Kind.Audio && remoteAudioRef.current) {
                pub.track.attach(remoteAudioRef.current);
              }
            }
          });
        });
      }
      setLivekitError('');
    } catch (err) {
      console.warn('LiveKit candidate connection notice:', err);
      setConnected(false);
      setLivekitError('Live call could not connect. Check LiveKit settings.');
    } finally {
      setConnecting(false);
    }
  };

  const leaveCall = () => {
    cleanupStreams();
    setPhase('completed');
  };

  // Broadcast recording started to interviewer
  const handleRecordingStarted = () => {
    sendActivityState('recording');
    if (room && connected) {
      try {
        const packet = JSON.stringify({
          type: 'ANSWER_RECORDING_STARTED',
          interview_id: interviewData?.interview_id,
          candidate_id: interviewData?.candidate_id,
          question_id: currentQuestion?.id,
          question_index: (currentQuestion?.index || 1) - 1,
          timestamp: new Date().toISOString()
        });
        room.localParticipant.publishData(new TextEncoder().encode(packet), { reliable: true });
      } catch (e) {}
    }
  };

  // 6. Voice Recording Completion Handler
  const handleVoiceRecordingComplete = async (uploadResult) => {
    if (!currentQuestion) return;

    try {
      await interviewsApi.submitCandidateAnswer(token, {
        question_id: currentQuestion.id,
        candidate_answer: uploadResult.transcription || '',
        transcription: uploadResult.transcription || '',
        submission_mode: 'voice_recorded',
        audio_url: uploadResult.audioUrl,
        recording_duration: uploadResult.duration
      });

      // Broadcast ANSWER_SUBMITTED to interviewer via LiveKit
      if (room && connected) {
        try {
          const packet = JSON.stringify({
            type: 'ANSWER_SUBMITTED',
            interview_id: interviewData?.interview_id,
            candidate_id: interviewData?.candidate_id,
            candidate_name: interviewData?.candidate_name || 'Candidate',
            question_id: currentQuestion.id,
            question_index: (currentQuestion.index || 1) - 1,
            submission_mode: 'voice_recorded',
            transcription: uploadResult.transcription || '',
            audio_url: uploadResult.audioUrl,
            recording_duration: uploadResult.duration,
            timestamp: new Date().toISOString()
          });
          room.localParticipant.publishData(new TextEncoder().encode(packet), { reliable: true });
        } catch (e) {
          console.warn('LiveKit data emit notice:', e);
        }
      }

      setIsAnswerSubmitted(true);
      setSubmittedPreview(uploadResult.transcription || 'Voice response recorded and submitted.');
      setSaveNotice('Answer Submitted Successfully. Your interviewer has received your response. Please wait for the next question.');
      setUploadErrorNotice('');
    } catch (err) {
      console.error('Failed to submit voice answer:', err);
      setSaveNotice('Notice: Recording uploaded, but answer sync reported an issue.');
    }
  };

  const handleVoiceRecordingFailed = (errMsg) => {
    setUploadErrorNotice(errMsg || 'Failed to upload answer recording.');
    if (room && connected) {
      try {
        const packet = JSON.stringify({
          type: 'ANSWER_UPLOAD_FAILED',
          interview_id: interviewData?.interview_id,
          candidate_id: interviewData?.candidate_id,
          question_id: currentQuestion?.id,
          question_index: (currentQuestion?.index || 1) - 1,
          error: errMsg,
          timestamp: new Date().toISOString()
        });
        room.localParticipant.publishData(new TextEncoder().encode(packet), { reliable: true });
      } catch (e) {}
    }
  };

  // 7. Typed Answer Submission Handler
  const handleSaveTypedAnswer = async () => {
    if (!currentQuestion || !typedAnswer.trim()) return;

    setSavingAnswer(true);
    try {
      await interviewsApi.submitCandidateAnswer(token, {
        question_id: currentQuestion.id,
        candidate_answer: typedAnswer.trim(),
        submission_mode: 'typed'
      });

      // Broadcast ANSWER_SUBMITTED to interviewer via LiveKit
      if (room && connected) {
        try {
          const packet = JSON.stringify({
            type: 'ANSWER_SUBMITTED',
            interview_id: interviewData?.interview_id,
            candidate_id: interviewData?.candidate_id,
            candidate_name: interviewData?.candidate_name || 'Candidate',
            question_id: currentQuestion.id,
            question_index: (currentQuestion.index || 1) - 1,
            submission_mode: 'typed',
            candidate_answer: typedAnswer.trim(),
            timestamp: new Date().toISOString()
          });
          room.localParticipant.publishData(new TextEncoder().encode(packet), { reliable: true });
        } catch (e) {
          console.warn('LiveKit data emit notice:', e);
        }
      }

      setIsAnswerSubmitted(true);
      setSubmittedPreview(typedAnswer.trim());
      setSaveNotice('Answer Submitted Successfully. Your interviewer has received your response. Please wait for the next question.');
      setUploadErrorNotice('');
    } catch (err) {
      console.error('Failed to save typed answer:', err);
      setSaveNotice('Failed to save answer: ' + formatApiError(err));
    } finally {
      setSavingAnswer(false);
    }
  };

  // 8. Complete Interview Session
  const handleCompleteInterview = async () => {
    setSubmittingFinal(true);
    try {
      await interviewsApi.completeCandidateInterview(token);
    } catch (err) {
      console.warn('Complete interview notice:', err);
    } finally {
      cleanupStreams();
      setPhase('completed');
      setSubmittingFinal(false);
      setShowConfirmFinish(false);
    }
  };

  // 9. Real-Time Polling for Pushed Questions & Status Updates (2.5s)
  useEffect(() => {
    if (phase !== 'in_call' || !token) return;

    const interval = setInterval(async () => {
      try {
        const res = await interviewsApi.getInvitation(token);
        if (res.data.status === 'completed' || res.data.session_state === 'completed') {
          cleanupStreams();
          setPhase('completed');
        } else if (res.data.status === 'declined' || res.data.session_state === 'declined') {
          cleanupStreams();
          setPhase('declined');
        } else if (res.data.current_question) {
          const newQ = res.data.current_question;
          // Check if interviewer pushed a new question
          if (!currentQuestion || newQ.id !== currentQuestion.id) {
            setCurrentQuestion(newQ);
            setIsAnswerSubmitted(false);
            setSubmittedPreview('');
            setTypedAnswer('');
          }
        }
      } catch (e) {
        // Polling network notice
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [phase, token, currentQuestion]);

  // Re-attach local stream if element mounts in in_call phase
  useEffect(() => {
    if (phase === 'in_call' && localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [phase, localStream]);

  // =========================================================================
  // VIEW: 1. Loading
  // =========================================================================
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white">
        <div className="w-16 h-16 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin mb-4" />
        <h2 className="text-xl font-bold">Connecting to BiasGuard AI Session...</h2>
        <p className="text-slate-400 text-sm mt-1">Verifying your secure invitation token</p>
      </div>
    );
  }

  // =========================================================================
  // VIEW: 2. Invalid or Expired Token
  // =========================================================================
  if (phase === 'invalid') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-slate-100">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-500/30">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {errorType === 'expired' 
              ? 'Invitation Expired' 
              : errorType === 'not_found' 
              ? 'Invitation Not Found' 
              : 'Invitation Unavailable'}
          </h2>
          <p className="text-slate-300 text-sm mb-6 leading-relaxed">
            {errorMessage || 'This interview invitation link is either invalid, has expired, or has already been used.'}
          </p>
          <div className="bg-slate-900/80 rounded-xl p-4 text-xs text-slate-400 mb-6 text-left border border-slate-700/60">
            <div className="font-semibold text-slate-300 mb-1">What can I do?</div>
            <ul className="list-disc pl-4 space-y-1">
              <li>Contact your interviewer or hiring team to request a new invitation link.</li>
              <li>Double-check that the complete URL was opened from your email invitation.</li>
            </ul>
          </div>
          <a
            href="/"
            className="inline-block w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Return to Homepage
          </a>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: 3. Declined Screen (Candidate Refused Consent)
  // =========================================================================
  if (phase === 'declined') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl space-y-4">
          <div className="w-16 h-16 bg-rose-500/15 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/30">
            <XCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white">Interview Invitation Declined</h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            You have declined this technical interview invitation. No audio or video has been or will be recorded.
          </p>
          <div className="bg-slate-800/60 rounded-xl p-3.5 text-xs text-slate-400 text-left border border-slate-700/50">
            If you declined by mistake, please contact your interviewer or hiring coordinator to reissue an invitation.
          </div>
          <p className="text-xs text-slate-500 pt-2">
            You may now safely close this browser tab.
          </p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: 4. Clean Consent Screen (Nothing is recorded before Accept)
  // =========================================================================
  if (phase === 'consent') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-8">
        {/* Top Navbar */}
        <header className="max-w-4xl mx-auto w-full flex items-center justify-between py-3 border-b border-slate-800/80 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-white tracking-tight">BiasGuard AI</span>
              <span className="text-xs text-slate-400 ml-2 hidden sm:inline">• Candidate Check-In</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Invitation Verified
          </div>
        </header>

        {/* Consent Card */}
        <main className="max-w-xl mx-auto w-full my-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-indigo-400 tracking-wider uppercase">
                Technical Interview Invitation
              </span>
              <h1 className="text-2xl font-bold text-white">
                {interviewData?.title || 'Online Technical Assessment'}
              </h1>
            </div>

            {/* Candidate & Role Info */}
            <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800/80 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Candidate:</span>
                <span className="font-semibold text-white">{interviewData?.candidate_name || 'Guest'}</span>
              </div>
              {interviewData?.candidate_role && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Target Role:</span>
                  <span className="font-medium text-slate-200">{interviewData.candidate_role}</span>
                </div>
              )}
              {interviewData?.domains?.length > 0 && (
                <div className="flex justify-between items-center pt-1 border-t border-slate-800/60">
                  <span className="text-slate-400">Evaluation Domains:</span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {interviewData.domains.map((d) => (
                      <span key={d} className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded-md font-medium">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Privacy & Recording Consent Notice */}
            <div className="bg-indigo-950/20 border border-indigo-500/30 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-indigo-300 text-sm font-bold">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Recording & Privacy Consent</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                <strong>Audio and video will be recorded</strong> during this technical assessment for double-blind, objective evaluation. Answers are transcribed and evaluated independently by AI in the background to prevent cognitive bias.
              </p>
              <p className="text-[11px] text-slate-400">
                Nothing is recorded or published before you click Accept.
              </p>
            </div>

            {/* Accept & Decline Buttons */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleAcceptConsent}
                disabled={acceptingConsent || decliningInvite}
                className="w-full py-3.5 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {acceptingConsent ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Connecting to Session...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Accept & Start Interview
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDeclineInvitation}
                disabled={acceptingConsent || decliningInvite}
                className="w-full py-3 px-6 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 border border-slate-700/80 text-slate-400 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {decliningInvite ? (
                  'Recording Decline...'
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    Decline Invitation
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-slate-500 text-center">
              By accepting, you confirm you are the intended candidate and agree to video/audio assessment recording.
            </p>
          </div>
        </main>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-500 py-2">
          BiasGuard AI • Independent Double-Blind Technical Evaluation Platform
        </footer>
      </div>
    );
  }

  // =========================================================================
  // VIEW: 5. Active In-Call Video Room & Pushed Question Console
  // =========================================================================
  if (phase === 'in_call') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-sm sm:text-base text-white">
                {interviewData?.title || 'Technical Interview'}
              </span>
              <span className="text-xs text-slate-400 ml-2 hidden md:inline">
                Candidate: {interviewData?.candidate_name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${
              interviewerConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}>
              <span className={`w-2 h-2 rounded-full ${interviewerConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {interviewerConnected ? 'Interviewer Connected' : 'Waiting for Interviewer...'}
            </div>
          </div>
        </header>

        {/* Main Split: Left Video Call / Right Question Answering */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 p-3 sm:p-4 gap-3 overflow-hidden">
          {/* Left: Video Stream Container (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-3 h-full">
            {livekitError && !connected && (
              <div className="bg-rose-500/15 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{livekitError}</span>
                </div>
                <button
                  type="button"
                  onClick={joinInterviewCall}
                  disabled={connecting}
                  className="px-2.5 py-1 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-white font-semibold flex items-center gap-1 border border-rose-500/40 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${connecting ? 'animate-spin' : ''}`} /> Retry
                </button>
              </div>
            )}
            <div className="relative flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center">
              {/* Remote Interviewer Video */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`w-full h-full object-cover ${interviewerHasVideo ? 'block' : 'hidden'}`}
              />
              <audio ref={remoteAudioRef} autoPlay />

              {!interviewerHasVideo && (
                <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mb-3 text-indigo-400">
                    <Radio className="w-8 h-8 animate-pulse" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    {interviewerConnected
                      ? 'Interviewer Connected (Audio Call)'
                      : livekitError
                        ? 'Live Call Standby'
                        : 'Waiting for Interviewer to Join'}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mb-2">
                    {interviewerConnected
                      ? 'You can hear each other. Your camera and microphone are broadcasting.'
                      : livekitError
                        ? 'Live call could not connect. Check LiveKit settings. You can still answer questions and submit responses below.'
                        : 'The interviewer will join the room shortly. Your devices are ready.'}
                  </p>
                  {!interviewerConnected && livekitError && (
                    <button
                      type="button"
                      onClick={joinInterviewCall}
                      disabled={connecting}
                      className="mt-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${connecting ? 'animate-spin' : ''}`} /> Retry Live Call
                    </button>
                  )}
                </div>
              )}

              {/* Remote Badge */}
              <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-medium text-slate-300 border border-slate-800">
                Interviewer {interviewerConnected ? '(Online)' : '(Connecting)'}
              </div>

              {/* Local Candidate Video PiP (Picture-in-Picture) */}
              <div className="absolute bottom-4 right-4 w-36 sm:w-48 aspect-video bg-slate-950 border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
                {cameraEnabled ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 text-xs">
                    <VideoOff className="w-5 h-5 mb-1" />
                    Camera Off
                  </div>
                )}
                <div className="absolute bottom-1 left-1 bg-slate-900/90 text-[10px] text-slate-300 px-1.5 py-0.5 rounded">
                  You ({micEnabled ? 'Mic On' : 'Muted'})
                </div>
              </div>
            </div>

            {/* Device Bar */}
            <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl shrink-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    micEnabled ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-rose-500 text-white'
                  }`}
                >
                  {micEnabled ? <Mic className="w-3.5 h-3.5 text-emerald-400" /> : <MicOff className="w-3.5 h-3.5" />}
                  <span>{micEnabled ? 'Mute Mic' : 'Unmute Mic'}</span>
                </button>

                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    cameraEnabled ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-rose-500 text-white'
                  }`}
                >
                  {cameraEnabled ? <Video className="w-3.5 h-3.5 text-emerald-400" /> : <VideoOff className="w-3.5 h-3.5" />}
                  <span>{cameraEnabled ? 'Turn Off Camera' : 'Turn On Camera'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={leaveCall}
                className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-rose-500/30 transition-all cursor-pointer"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>Leave Call</span>
              </button>
            </div>
          </div>

          {/* Right: Pushed Question Display & Candidate Controlled Answering (5 cols) */}
          <div className="lg:col-span-5 flex flex-col h-full overflow-hidden">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col h-full shadow-xl overflow-hidden">
              {currentQuestion ? (
                /* STATE A: QUESTION PUSHED */
                <div className="flex-1 flex flex-col overflow-hidden space-y-4">
                  {/* Question Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                        <HelpCircle className="w-3.5 h-3.5" />
                        Question {currentQuestion.index} of {currentQuestion.total || 1}
                      </span>
                      {currentQuestion.domain && (
                        <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[11px] font-semibold">
                          {currentQuestion.domain}
                        </span>
                      )}
                    </div>
                    {currentQuestion.difficulty && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        {currentQuestion.difficulty}
                      </span>
                    )}
                  </div>

                  {/* Question Text */}
                  <div className="shrink-0">
                    <h3 className="text-base font-bold text-white leading-relaxed">
                      {currentQuestion.question_text}
                    </h3>
                  </div>

                  {/* If answer has been submitted for this question: show submitted state */}
                  {isAnswerSubmitted ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center space-y-4 animate-in fade-in">
                      <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40 shadow-lg shadow-emerald-500/20">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <div className="space-y-1.5 max-w-md mx-auto">
                        <h4 className="text-lg font-bold text-white tracking-tight">Answer Submitted Successfully</h4>
                        <p className="text-xs text-emerald-300 font-medium leading-relaxed">
                          Your interviewer has received your response. Please wait for the next question.
                        </p>
                      </div>

                      <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 shadow-inner">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="font-semibold text-emerald-300">Live Call Connected • Waiting for Next Question</span>
                      </div>

                      {submittedPreview && (
                        <div className="w-full p-3.5 bg-slate-950/80 border border-slate-800/80 rounded-xl text-left text-xs text-slate-300 max-h-36 overflow-y-auto">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
                            Your Submitted Response:
                          </span>
                          <p className="italic font-mono text-[11px] text-slate-200 whitespace-pre-wrap">
                            "{submittedPreview}"
                          </p>
                        </div>
                      )}

                      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 font-mono">
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                        <span>AI evaluating independently in background (double-blind sealed)</span>
                      </div>
                    </div>
                  ) : (
                    /* CANDIDATE ANSWERING CONTROLS (Timer + Red Stop button strictly controlled by candidate) */
                    <div className="flex-1 flex flex-col overflow-y-auto space-y-3 pr-1">
                      {uploadErrorNotice && (
                        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
                          <span>{uploadErrorNotice}</span>
                          <button
                            type="button"
                            onClick={() => setUploadErrorNotice('')}
                            className="text-xs text-white underline font-semibold ml-2 cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}

                      {/* Mode Tabs */}
                      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setAnswerMode('voice')}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                            answerMode === 'voice'
                              ? 'bg-indigo-600 text-white shadow'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          <Mic className="w-3.5 h-3.5" />
                          Voice Recording
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnswerMode('text')}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                            answerMode === 'text'
                              ? 'bg-indigo-600 text-white shadow'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Written Answer
                        </button>
                      </div>

                      {answerMode === 'voice' ? (
                        <div className="space-y-3">
                          <VoiceAnswerRecorder
                            interviewId={interviewData?.interview_id}
                            questionId={currentQuestion?.id}
                            domain={currentQuestion?.domain || 'DSA'}
                            questionText={currentQuestion?.question_text || ''}
                            invitationToken={token}
                            onRecordingStart={handleRecordingStarted}
                            onRecordingComplete={handleVoiceRecordingComplete}
                            onUploadFailed={handleVoiceRecordingFailed}
                            remoteTrigger={remoteTrigger}
                            onStateChange={(st) => sendActivityState(st === 'recording' ? 'recording' : 'viewing')}
                          />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <textarea
                            rows={6}
                            value={typedAnswer}
                            onChange={(e) => setTypedAnswer(e.target.value)}
                            placeholder="Type your technical answer, approach, complexity, and trade-offs..."
                            className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none font-mono"
                          />
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={handleSaveTypedAnswer}
                              disabled={savingAnswer || !typedAnswer.trim()}
                              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-all cursor-pointer"
                            >
                              <Save className="w-3.5 h-3.5" />
                              {savingAnswer ? 'Submitting...' : 'Submit Written Answer'}
                            </button>
                          </div>
                        </div>
                      )}

                      {saveNotice && (
                        <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs text-center">
                          {saveNotice}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bottom Finish Option */}
                  <div className="pt-3 border-t border-slate-800 shrink-0 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      BiasGuard AI • Candidate Double-Blind View
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowConfirmFinish(true)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                    >
                      Finish & Submit Session
                    </button>
                  </div>
                </div>
              ) : (
                /* STATE B: WAITING FOR INTERVIEWER TO PUSH QUESTION */
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Clock className="w-8 h-8 animate-pulse" />
                  </div>
                  <div className="space-y-1.5 max-w-sm">
                    <h3 className="text-base font-bold text-white">Waiting for Question</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      The interviewer will send the question to your screen when ready. Please ensure your microphone and camera are active.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Live Call Connected</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Confirm Finish Modal */}
          {showConfirmFinish && (
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center space-y-4">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">Complete Technical Assessment?</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Are you ready to finalize and complete your interview session? Once submitted, your answers will be locked for independent evaluation.
                </p>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirmFinish(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                  >
                    Continue Session
                  </button>
                  <button
                    type="button"
                    onClick={handleCompleteInterview}
                    disabled={submittingFinal}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    {submittingFinal ? 'Submitting...' : 'Yes, Complete Interview'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: 6. Interview Session Completed
  // =========================================================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl space-y-4">
        <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white">Interview Completed</h2>
        <p className="text-slate-300 text-sm leading-relaxed">
          Thank you, <strong className="text-white">{interviewData?.candidate_name || 'Candidate'}</strong>! Your technical interview session has finished.
        </p>

        <div className="bg-slate-800/80 rounded-2xl p-4 text-xs text-slate-300 text-left border border-slate-700/60 space-y-2">
          <div className="font-semibold text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            What happens next?
          </div>
          <p className="text-slate-400">
            BiasGuard AI will complete the independent double-blind evaluation and generate a comprehensive comparative report for the hiring team.
          </p>
        </div>

        <p className="text-xs text-slate-500 pt-2">
          You may now safely close this browser tab.
        </p>
      </div>
    </div>
  );
};

export default CandidateInterviewRoom;