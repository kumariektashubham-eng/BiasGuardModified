import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Calendar,
  ArrowLeft,
  PlusCircle,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Award,
  Layers,
  Mic,
  Headphones,
  ChevronRight
} from 'lucide-react';
import { candidatesApi, voiceApi } from '../services/api';
import { formatApiError } from '../utils/errorFormatter';
import { Badge } from '../components/common/Badge';
import { AudioPlayer } from '../components/voice/AudioPlayer';

export const CandidateDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCandidate = async () => {
      try {
        const res = await candidatesApi.get(id);
        setCandidate(res.data);
      } catch (err) {
        setError('Failed to load candidate: ' + formatApiError(err));
      } finally {
        setLoading(false);
      }
    };
    fetchCandidate();
  }, [id]);

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        Loading candidate profile...
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm">
        Candidate not found. <Link to="/candidates" className="text-purple-400 underline">Back to Candidates</Link>
      </div>
    );
  }

  const evaluationsWithAudio = candidate.evaluations || [];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Top Header */}
      <div>
        <button
          onClick={() => navigate('/candidates')}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-2 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Candidates List
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-purple-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-purple-600/25">
              {candidate.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">{candidate.name}</h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium">
                  {candidate.target_role || 'Candidate'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {candidate.experience_years} years experience • {candidate.email}
              </p>
            </div>
          </div>

          <Link
            to="/interviews/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs tracking-wide transition-all shadow-lg shadow-purple-600/25 active:scale-[0.99] self-start sm:self-auto"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Schedule New Interview</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Total Interviews
          </span>
          <span className="text-3xl font-bold text-white">{candidate.interviews_count || 0}</span>
          <p className="text-xs text-slate-400 mt-1">Recorded sessions</p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Average Technical Score
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-purple-400">{candidate.average_score || 0}</span>
            <span className="text-xs text-slate-400">/ 10</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">AI independent technical benchmark</p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Evaluations Audited
          </span>
          <span className="text-3xl font-bold text-emerald-400">
            {candidate.evaluations?.length || 0}
          </span>
          <p className="text-xs text-slate-400 mt-1">Total questions evaluated</p>
        </div>
      </div>

      {/* Profile Details & Skills */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Candidate Profile</h3>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Email</span>
              <span className="text-slate-200 font-medium">{candidate.email}</span>
            </div>
            {candidate.phone && (
              <div>
                <span className="text-slate-400 block mb-0.5">Phone</span>
                <span className="text-slate-200 font-medium">{candidate.phone}</span>
              </div>
            )}
            <div>
              <span className="text-slate-400 block mb-0.5">Target Role</span>
              <span className="text-slate-200 font-medium">{candidate.target_role}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Primary Technical Domains</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {candidate.primary_skills?.map((skill, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 text-[10px] font-mono"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
            {candidate.resume_summary && (
              <div>
                <span className="text-slate-400 block mb-0.5">Resume Summary</span>
                <p className="text-slate-300 leading-relaxed italic bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  "{candidate.resume_summary}"
                </p>
              </div>
            )}
            {candidate.notes && (
              <div>
                <span className="text-slate-400 block mb-0.5">Interviewer Notes</span>
                <p className="text-slate-300 leading-relaxed bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  {candidate.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Interview History */}
        <div className="md:col-span-2 bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Interview History</h3>

          {candidate.interviews?.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-xl">
              No interviews conducted for this candidate yet.
            </div>
          ) : (
            <div className="space-y-3">
              {candidate.interviews?.map((intItem) => (
                <div key={intItem.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-colors">
                  <div>
                    <h4 className="font-semibold text-sm text-white">{intItem.title}</h4>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {intItem.domains?.map(d => (
                        <span key={d} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                          {d}
                        </span>
                      ))}
                      <span className="text-[11px] text-slate-400">
                        {intItem.questions?.length || 0} Questions
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      to={`/interviews/${intItem.id}/evaluate`}
                      className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white text-xs font-semibold border border-purple-500/30 transition-all"
                    >
                      Evaluate
                    </Link>
                    <Link
                      to={`/reports/${intItem.id}`}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
                    >
                      Report
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Candidate Voice Recordings & Evaluation History */}
      {evaluationsWithAudio.length > 0 && (
        <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Headphones className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Candidate Spoken Responses & Evaluation Results
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              {evaluationsWithAudio.length} recorded answers
            </span>
          </div>

          <div className="space-y-4">
            {evaluationsWithAudio.map((ev, idx) => (
              <div
                key={ev.id || idx}
                className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-purple-400">Question #{idx + 1}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono border border-slate-700">
                      {ev.domain}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-400">
                      AI Score: <strong className="text-purple-400">{ev.ai_evaluation?.technical_score ?? 'N/A'}/10</strong>
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-400">
                      Interviewer Score: <strong className="text-white">{ev.interviewer_score ?? 'N/A'}</strong>
                    </span>
                  </div>
                </div>

                <p className="text-xs font-semibold text-slate-200">
                  {ev.question_text}
                </p>

                {/* Audio Player if recording attached */}
                {(ev.audio_url || ev.audio_id) && (
                  <div className="pt-1">
                    <AudioPlayer
                      audioUrl={ev.audio_url || voiceApi.getAudioUrl(ev.audio_id)}
                      title={`Recording - ${ev.domain}`}
                      duration={ev.recording_duration}
                      compact={true}
                    />
                  </div>
                )}

                {/* Collapsible Transcript */}
                {ev.candidate_answer && (
                  <details className="text-xs text-slate-400">
                    <summary className="cursor-pointer text-[11px] font-mono text-purple-400/90 hover:text-purple-300 select-none">
                      View Speech-to-Text Transcript
                    </summary>
                    <p className="mt-1.5 p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-slate-300 leading-relaxed text-[11px]">
                      "{ev.candidate_answer}"
                    </p>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
