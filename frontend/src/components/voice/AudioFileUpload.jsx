import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileAudio,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  RefreshCw
} from 'lucide-react';
import { AudioPlayer } from './AudioPlayer';
import { voiceApi } from '../../services/api';
import { formatApiError } from '../../utils/errorFormatter';

const MAX_FILE_SIZE_MB = 25;

export const AudioFileUpload = ({
  interviewId,
  questionId,
  domain = "DSA",
  questionText = "",
  onTranscriptionComplete
}) => {
  const [file, setFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [editedTranscript, setEditedTranscript] = useState('');
  const [uploadedAudioId, setUploadedAudioId] = useState(null);
  const [duration, setDuration] = useState(null);
  const [engineUsed, setEngineUsed] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (selectedFile) => {
    setError('');
    setConfirmed(false);
    if (!selectedFile) return;

    if (selectedFile.size === 0) {
      setError("Selected audio file is empty (0 bytes). Please choose a valid audio recording.");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`Audio file exceeds maximum size limit of ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }

    setFile(selectedFile);
    const localUrl = URL.createObjectURL(selectedFile);
    setAudioUrl(localUrl);

    // Automatically upload & transcribe
    uploadAndTranscribe(selectedFile);
  };

  const uploadAndTranscribe = async (audioFile) => {
    const targetFile = audioFile || file;
    if (!targetFile) return;

    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', targetFile);
      formData.append('interview_id', interviewId || 'temp_interview');
      formData.append('question_id', questionId || 'temp_question');
      formData.append('domain', domain || 'DSA');
      formData.append('question_text', questionText || '');
      formData.append('submission_mode', 'audio_upload');

      const res = await voiceApi.uploadAudio(formData);

      if (!res.data.transcription || !res.data.transcription.trim()) {
        throw new Error("Audio upload succeeded but no recognizable speech was transcribed. Please check your audio.");
      }

      setUploadedAudioId(res.data.id);
      setTranscription(res.data.transcription);
      setEditedTranscript(res.data.transcription);
      setDuration(res.data.duration_seconds);
      setEngineUsed(res.data.engine_used || 'OpenAI Whisper');
    } catch (err) {
      console.error("Audio upload error:", err);
      const errMsg = formatApiError(err, "Audio transcription failed. Please retry.");
      setError(errMsg);
      setTranscription('');
      setEditedTranscript('');
    } finally {
      setUploading(false);
    }
  };

  const handleRetryTranscription = () => {
    if (uploadedAudioId) {
      setUploading(true);
      setError('');
      const formData = new FormData();
      formData.append('domain', domain || 'DSA');
      formData.append('question_text', questionText || '');

      voiceApi.retranscribe(uploadedAudioId, formData)
        .then(res => {
          setTranscription(res.data.transcription);
          setEditedTranscript(res.data.transcription);
          setEngineUsed(res.data.engine_used || 'OpenAI Whisper');
        })
        .catch(err => {
          uploadAndTranscribe(file);
        })
        .finally(() => setUploading(false));
    } else if (file) {
      uploadAndTranscribe(file);
    }
  };

  const handleConfirmAnswer = async () => {
    if (!editedTranscript.trim()) {
      alert("Please ensure the answer transcript is not empty before confirming.");
      return;
    }

    if (uploadedAudioId && editedTranscript !== transcription) {
      try {
        await voiceApi.updateTranscript(uploadedAudioId, editedTranscript);
      } catch (e) {
        console.warn("Could not save edited transcript:", e);
      }
    }

    setConfirmed(true);
    if (onTranscriptionComplete) {
      onTranscriptionComplete({
        text: editedTranscript,
        audioId: uploadedAudioId,
        audioUrl: uploadedAudioId ? voiceApi.getAudioUrl(uploadedAudioId) : audioUrl,
        duration: duration,
        submissionMode: 'audio_upload'
      });
    }
  };

  const handleReset = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setFile(null);
    setAudioUrl(null);
    setTranscription('');
    setEditedTranscript('');
    setUploadedAudioId(null);
    setError('');
    setConfirmed(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {file && (
              <button
                type="button"
                onClick={handleRetryTranscription}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${uploading ? 'animate-spin' : ''}`} />
                <span>Retry Transcription</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Choose Another
            </button>
          </div>
        </div>
      )}

      {!file && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="p-8 rounded-2xl bg-slate-900/60 border-2 border-dashed border-slate-800 hover:border-indigo-500/50 cursor-pointer text-center space-y-3 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.webm,.wav,.mp3,.ogg,.m4a,.aac"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files[0])}
          />
          <div className="w-14 h-14 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400">
            <UploadCloud className="w-7 h-7" />
          </div>
          <div>
            <span className="text-xs font-bold text-white block">Click to upload recorded audio file</span>
            <span className="text-[11px] text-slate-400">Supported formats: WebM, WAV, MP3, M4A, OGG (Max 25 MB)</span>
          </div>
        </div>
      )}

      {file && (
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <FileAudio className="w-4 h-4 text-indigo-400" />
              <span className="truncate max-w-xs">{file.name}</span>
              <span className="text-slate-500 text-[10px]">({Math.round(file.size / 1024)} KB)</span>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Choose different file</span>
            </button>
          </div>

          {audioUrl && (
            <AudioPlayer
              audioUrl={uploadedAudioId ? voiceApi.getAudioUrl(uploadedAudioId) : audioUrl}
              title={`Uploaded Audio: ${file.name}`}
              duration={duration}
            />
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Speech-to-Text Transcription</span>
                {engineUsed && (
                  <span className="text-[10px] text-slate-400 font-normal">({engineUsed})</span>
                )}
              </label>

              {uploading && (
                <div className="flex items-center gap-1.5 text-[11px] text-indigo-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Transcribing with OpenAI Whisper...</span>
                </div>
              )}
            </div>

            <textarea
              rows={4}
              value={editedTranscript}
              onChange={(e) => setEditedTranscript(e.target.value)}
              disabled={uploading}
              placeholder={uploading ? "Transcribing speech..." : "Candidate's speech transcription will appear here. You may edit or clarify details..."}
              className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 font-normal leading-relaxed"
            />

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>💡 Review technical terms, code snippets, or terminology before final confirmation.</span>
              <span>{editedTranscript.length} chars • {editedTranscript.split(/\s+/).filter(Boolean).length} words</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-slate-800">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRetryTranscription}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                title="Retry transcription"
              >
                <RefreshCw className={`w-3 h-3 ${uploading ? 'animate-spin' : ''}`} />
                <span>Retry</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAnswer}
                disabled={uploading || !editedTranscript.trim()}
                className={`inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${confirmed
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/25 disabled:opacity-40'
                  }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{confirmed ? 'Answer Selected & Confirmed' : 'Use Transcribed Answer'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
