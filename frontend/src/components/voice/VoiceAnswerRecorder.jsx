import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  Square, 
  Pause, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Headphones,
  ShieldCheck,
  RefreshCw,
  Volume2
} from 'lucide-react';
import { AudioWaveformVisualizer } from './AudioWaveformVisualizer';
import { AudioPlayer } from './AudioPlayer';
import { voiceApi } from '../../services/api';
import { formatApiError } from '../../utils/errorFormatter';

const MAX_DURATION_SECONDS = 300; // 5 minutes limit per question

export const VoiceAnswerRecorder = ({
  interviewId,
  questionId,
  domain = "DSA",
  questionText = "",
  onRecordingComplete,
  onUploadFailed = null,
  onRecordingStart = null,
  existingAudio = null,
  onClearRecording,
  invitationToken = null,
  onStateChange = null,
  remoteTrigger = null
}) => {
  const [recordingState, setRecordingState] = useState('idle'); // 'idle' | 'recording' | 'paused' | 'stopped'
  const [duration, setDuration] = useState(0);
  const [permissionError, setPermissionError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioBlobUrl, setAudioBlobUrl] = useState(existingAudio?.audioUrl || null);
  const [audioMimeType, setAudioMimeType] = useState('audio/webm');
  const [uploading, setUploading] = useState(false);
  const [uploadedAudioId, setUploadedAudioId] = useState(existingAudio?.audioId || null);
  const [recordingStatus, setRecordingStatus] = useState(existingAudio?.status || 'ready');
  const [recordingStatusLabel, setRecordingStatusLabel] = useState(existingAudio?.statusLabel || 'Completed');
  const [recordingStatusMessage, setRecordingStatusMessage] = useState(existingAudio?.statusMessage || null);
  const [speechDetected, setSpeechDetected] = useState(existingAudio?.speechDetected !== false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const streamRef = useRef(null);
  const speechDetectedRef = useRef(false);
  const audioContextRef = useRef(null);

  // Sync with existing audio if question changes
  useEffect(() => {
    if (existingAudio?.audioUrl) {
      setAudioBlobUrl(existingAudio.audioUrl);
      setUploadedAudioId(existingAudio.audioId || null);
      setDuration(existingAudio.duration || 0);
      setRecordingStatus(existingAudio.status || 'ready');
      setRecordingStatusLabel(existingAudio.statusLabel || 'Completed');
      setRecordingStatusMessage(existingAudio.statusMessage || null);
      setSpeechDetected(existingAudio.speechDetected !== false);
      setRecordingState('stopped');
    } else if (!audioBlob) {
      setAudioBlobUrl(null);
      setUploadedAudioId(null);
      setDuration(0);
      setRecordingStatus('ready');
      setRecordingStatusLabel('Completed');
      setRecordingStatusMessage(null);
      setSpeechDetected(true);
      setRecordingState('idle');
    }
  }, [existingAudio, questionId]);

  useEffect(() => {
    if (typeof onStateChange === 'function') {
      onStateChange(recordingState);
    }
  }, [recordingState, onStateChange]);

  // Support remote recording triggers from interviewer
  useEffect(() => {
    if (!remoteTrigger) return;
    if (remoteTrigger === 'start' && recordingState === 'idle') {
      startRecording();
    } else if (remoteTrigger === 'stop' && (recordingState === 'recording' || recordingState === 'paused')) {
      stopRecording();
    }
  }, [remoteTrigger]);

  // Clean up timer and media streams on unmount
  useEffect(() => {
    return () => {
      clearInterval(timerIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioBlobUrl && audioBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioBlobUrl);
      }
    };
  }, []);

  const getSupportedMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
      'audio/aac',
      'audio/wav'
    ];
    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return '';
  };

  const startRecording = async () => {
    setPermissionError('');
    setUploadError('');
    audioChunksRef.current = [];
    speechDetectedRef.current = false;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser does not support audio recording. Please use modern Chrome, Firefox, or Edge.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;

      // Web Audio API Voice Activity Detector
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const checkAudioLevel = () => {
            if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            if (avg > 10) {
              speechDetectedRef.current = true;
            }
            requestAnimationFrame(checkAudioLevel);
          };
          requestAnimationFrame(checkAudioLevel);
        }
      } catch (vadErr) {
        console.warn("Client VAD initialization warning:", vadErr);
      }

      const mimeType = getSupportedMimeType();
      setAudioMimeType(mimeType || 'audio/webm');
      const options = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const mime = mimeType || 'audio/webm';
        if (audioChunksRef.current.length === 0) {
          setUploadError("No audio was recorded. Please check your microphone and speak again.");
          setRecordingState('idle');
          return;
        }

        const blob = new Blob(audioChunksRef.current, { type: mime });
        if (blob.size < 200) {
          setUploadError("Recording was too short or empty. Please speak your answer for at least 2-3 seconds.");
          setRecordingState('idle');
          return;
        }

        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioBlobUrl(url);

        // Upload to server and transcribe in the background internally
        handleUploadRecording(blob, mime);

        // Stop hardware tracks to release microphone immediately
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
        }
      };

      recorder.start(200); // 200ms timeslice to ensure continuous chunk collection
      setRecordingState('recording');
      setDuration(0);
      if (typeof onRecordingStart === 'function') {
        onRecordingStart();
      }

      // Start duration timer
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev + 1 >= MAX_DURATION_SECONDS) {
            stopRecording();
            return MAX_DURATION_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.error("Microphone access error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionError("Microphone permission was denied. Please allow microphone access in your browser address bar.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPermissionError("No microphone hardware was detected. Please connect a working microphone.");
      } else {
        setPermissionError(`Microphone Error: ${err.message || 'Unable to access audio input.'}`);
      }
      setRecordingState('idle');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.requestData();
          mediaRecorderRef.current.pause();
        }
      } catch (e) {
        console.warn("Pause flush error:", e);
      }
      setRecordingState('paused');
      clearInterval(timerIntervalRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'paused') {
      try {
        if (mediaRecorderRef.current.state === 'paused') {
          mediaRecorderRef.current.resume();
        }
      } catch (e) {
        console.warn("Resume error:", e);
      }
      setRecordingState('recording');
      timerIntervalRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev + 1 >= MAX_DURATION_SECONDS) {
            stopRecording();
            return MAX_DURATION_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && (recordingState === 'recording' || recordingState === 'paused')) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.requestData();
          mediaRecorderRef.current.stop();
        }
      } catch (e) {
        console.warn("Stop flush error:", e);
      }
      setRecordingState('stopped');
      clearInterval(timerIntervalRef.current);
    }
  };

  const resetForReRecording = () => {
    clearInterval(timerIntervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (audioBlobUrl && audioBlobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioBlobUrl);
    }
    setRecordingState('idle');
    setDuration(0);
    setAudioBlob(null);
    setAudioBlobUrl(null);
    setUploadedAudioId(null);
    setUploadError('');
    if (onClearRecording) {
      onClearRecording();
    }
  };

  const handleUploadRecording = async (blob, mimeType) => {
    const activeBlob = blob || audioBlob;
    const activeMime = mimeType || audioMimeType;
    if (!activeBlob) return;

    setUploading(true);
    setUploadError('');

    try {
      let ext = 'webm';
      if (activeMime.includes('wav')) ext = 'wav';
      else if (activeMime.includes('ogg')) ext = 'ogg';
      else if (activeMime.includes('mp4') || activeMime.includes('aac')) ext = 'm4a';

      const file = new File([activeBlob], `spoken_answer_${Date.now()}.${ext}`, { type: activeMime });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('interview_id', interviewId || 'temp_interview');
      formData.append('question_id', questionId || 'temp_question');
      formData.append('domain', domain || 'DSA');
      formData.append('question_text', questionText || '');
      formData.append('submission_mode', 'voice_recorded');
      formData.append('client_speech_detected', speechDetectedRef.current ? 'true' : 'false');
      if (invitationToken) {
        formData.append('invitation_token', invitationToken);
      }

      const res = await voiceApi.uploadAudio(formData);
      const data = res.data;
      
      setUploadedAudioId(data.id);
      setRecordingStatus(data.status || 'ready');
      setRecordingStatusLabel(data.status_label || 'Completed');
      setRecordingStatusMessage(data.status_message || null);
      setSpeechDetected(data.speech_detected !== false);
      
      // Notify parent that the voice answer is securely saved & ready for evaluation
      if (onRecordingComplete) {
        onRecordingComplete({
          audioId: data.id,
          audioUrl: voiceApi.getAudioUrl(data.id),
          duration: data.duration_seconds || duration,
          submissionMode: 'voice_recorded',
          status: data.status,
          statusLabel: data.status_label,
          statusMessage: data.status_message,
          speechDetected: data.speech_detected
        });
      }
    } catch (err) {
      console.error("Audio upload error:", err);
      const errMsg = formatApiError(err, "Failed to save audio recording. Please retry.");
      setUploadError(errMsg);
      if (typeof onUploadFailed === 'function') {
        onUploadFailed(errMsg);
      }
    } finally {
      setUploading(false);
    }
  };

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-4">
      {/* Microphone Permission Error */}
      {permissionError && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block">Microphone Access Required:</span>
            <span>{permissionError}</span>
          </div>
        </div>
      )}

      {/* Upload / Server Error */}
      {uploadError && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{uploadError}</span>
          </div>
          {audioBlob && (
            <button
              type="button"
              onClick={() => handleUploadRecording(audioBlob, audioMimeType)}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry Save
            </button>
          )}
        </div>
      )}

      {/* STATE 1: IDLE (No recording in progress or completed yet) */}
      {recordingState === 'idle' && !audioBlobUrl && (
        <div className="p-8 rounded-2xl bg-[#0B1120] border-2 border-dashed border-indigo-500/30 text-center space-y-4">
          <div className="relative inline-block">
            <button
              type="button"
              onClick={startRecording}
              className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white flex items-center justify-center shadow-xl shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95 mx-auto group"
            >
              <Mic className="w-9 h-9 group-hover:scale-110 transition-transform" />
            </button>
          </div>

          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-sm font-bold text-white tracking-wide">
              Click Microphone to Speak Your Answer
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Answer aloud in spoken English or Hinglish. Explain your thought process, data structures, and algorithmic complexity.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Evaluates technical depth only • Maximum 5 minutes</span>
          </div>
        </div>
      )}

      {/* STATE 2: LIVE RECORDING / PAUSED */}
      {(recordingState === 'recording' || recordingState === 'paused') && (
        <div className="p-6 rounded-2xl bg-[#0B1120] border border-indigo-500/40 space-y-5 shadow-2xl animate-in fade-in">
          {/* Header Status & Live Timer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3.5 w-3.5">
                {recordingState === 'recording' ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-400"></span>
                )}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                {recordingState === 'recording' ? 'Recording Spoken Answer...' : 'Recording Paused'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs">
              <span className="text-indigo-400 font-bold">{formatTimer(duration)}</span>
              <span className="text-slate-500">/ 05:00</span>
            </div>
          </div>

          {/* Real-time Frequency Waveform */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
            <AudioWaveformVisualizer 
              stream={streamRef.current} 
              isRecording={recordingState === 'recording'} 
            />
          </div>

          {/* Recording Control Buttons */}
          <div className="flex items-center justify-center gap-3 pt-2">
            {recordingState === 'recording' ? (
              <button
                type="button"
                onClick={pauseRecording}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-amber-500/30 transition-all active:scale-95 shadow-md"
              >
                <Pause className="w-4 h-4 fill-amber-300" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={resumeRecording}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all active:scale-95 shadow-md"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Resume</span>
              </button>
            )}

            <button
              type="button"
              onClick={stopRecording}
              disabled={uploading}
              className="flex items-center gap-2.5 px-7 py-3 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-rose-600 hover:from-rose-500 hover:to-rose-400 text-white font-black text-xs uppercase tracking-wider transition-all active:scale-95 shadow-xl shadow-rose-600/40 cursor-pointer disabled:opacity-50"
              title="Stop speaking and submit your answer to the interviewer"
            >
              <Square className="w-4 h-4 fill-white" />
              <span>STOP & SUBMIT ANSWER</span>
            </button>
          </div>
        </div>
      )}

      {/* STATE 3: STOPPED & RECORDED (Audio Playback & Re-record) */}
      {(recordingState === 'stopped' || (audioBlobUrl && recordingState === 'idle')) && (
        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-4 shadow-xl animate-in fade-in">
          {/* Header Status */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2 text-xs font-semibold">
              {speechDetected && (recordingStatus === 'ready' || recordingStatus === 'completed') ? (
                <>
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span className="text-emerald-400">Voice Answer Recorded & Saved</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span className="text-amber-400">{recordingStatusLabel || "No Speech Detected"}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {uploading && (
                <span className="flex items-center gap-1.5 text-xs text-indigo-400 font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Encrypting & Saving to Secure Storage...</span>
                </span>
              )}
              {duration > 0 && (
                <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  Length: {formatTimer(duration)}
                </span>
              )}
            </div>
          </div>

          {/* Silence / Unclear Sound / STT Error Alert Banner */}
          {(!speechDetected || (recordingStatus !== 'ready' && recordingStatus !== 'completed')) && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  {recordingStatusLabel || "No Answer Detected"}
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Not Evaluated
                </span>
              </div>
              <p className="text-slate-300 text-xs leading-relaxed">
                {recordingStatusMessage || "No speech detected. Please record your answer again."}
              </p>
            </div>
          )}

          {/* Primary Audio Player for Candidate to Listen to Their Answer */}
          {audioBlobUrl && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-medium text-slate-300">
                  <Headphones className="w-3.5 h-3.5 text-indigo-400" />
                  Listen to Your Recorded Response:
                </span>
                <span className="text-[11px] text-slate-500">Audio playback preview</span>
              </div>
              <AudioPlayer 
                audioUrl={audioBlobUrl} 
                title="Your Spoken Answer" 
                duration={duration} 
              />
            </div>
          )}

          {/* Re-record Option */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ready for independent technical evaluation</span>
            </div>

            <button
              type="button"
              onClick={resetForReRecording}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all hover:text-white"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Re-record Answer</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
