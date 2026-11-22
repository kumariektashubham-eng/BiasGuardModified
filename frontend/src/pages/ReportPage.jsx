import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  Printer,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Scale,
  Sparkles,
  Brain,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Mic,
  Headphones,
  Check,
  AlertTriangle
} from 'lucide-react';
import { reportsApi, voiceApi } from '../services/api';
import { AudioPlayer } from '../components/voice/AudioPlayer';
import { formatApiError } from '../utils/errorFormatter';

export const ReportPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [reportsList, setReportsList] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      loadSingleReport(id);
    } else {
      loadAllReports();
    }
  }, [id]);

  const loadSingleReport = async (reportId) => {
    setLoading(true);
    setError('');
    try {
      const res = await reportsApi.get(reportId);
      setSelectedReport(res.data);
    } catch (err) {
      setError('Report not found: ' + formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const loadAllReports = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await reportsApi.list();
      setReportsList(res.data || []);
      if (res.data?.length > 0) {
        // Automatically open the first report if no specific ID provided
        loadSingleReport(res.data[0].interview_id || res.data[0].id);
      }
    } catch (err) {
      setError('Failed to load reports: ' + formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        Loading Evaluation Report...
      </div>
    );
  }

  // Reports Directory if none selected
  if (!selectedReport) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Evaluation Reports</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Comprehensive AI technical evaluations, score comparisons, and neutral peer review audits.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {reportsList.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm bg-[#0F172A] border border-slate-800 rounded-2xl">
            No evaluation reports available yet. Complete an interview evaluation to generate a report.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reportsList.map((rep) => {
              const hasDiscrepancy = (rep.discrepancy_count || 0) > 0;

              return (
                <div
                  key={rep.id}
                  onClick={() => navigate(`/reports/${rep.interview_id || rep.id}`)}
                  className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800 hover:border-purple-500/50 cursor-pointer transition-all flex flex-col justify-between space-y-4 shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-purple-400">{rep.candidate_name}</span>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium ${hasDiscrepancy
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        }`}>
                        {hasDiscrepancy ? 'Review Recommended' : 'Calibrated'}
                      </span>
                    </div>
                    <h3 className="font-bold text-sm text-white">{rep.interview_title}</h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{rep.executive_summary}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <span>Evaluated: {rep.evaluated_questions}/{rep.total_questions} Questions</span>
                    <span className="text-purple-400 font-semibold flex items-center gap-1">
                      Open Report <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const r = selectedReport;
  const hasDiscrepancy = (r.discrepancy_count || 0) > 0;
  const scoreDelta = r.average_interviewer_score !== null && r.average_ai_score !== null
    ? (r.average_interviewer_score - r.average_ai_score).toFixed(1)
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 print:p-0 print:m-0">
      {/* Action Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 no-print">
        <button
          onClick={() => navigate('/reports')}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All Reports
        </button>

        <div className="flex items-center gap-3">
          <Link
            to={`/interviews/${r.interview_id}/evaluate`}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            Open Evaluation Session
          </Link>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all shadow-lg shadow-purple-600/25"
          >
            <Printer className="w-4 h-4" />
            <span>Export / Print</span>
          </button>
        </div>
      </div>

      {/* Main Report Document Container */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-xl space-y-8 print:border-none print:bg-white print:text-black print:p-0">

        {/* Document Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 border-b border-slate-800 print:border-slate-300 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center text-white">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="font-bold text-xs tracking-tight text-white print:text-black uppercase">
                BiasGuard AI • Evaluation Report
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white print:text-black tracking-tight">
              {r.interview_title}
            </h1>
            <p className="text-xs text-slate-400 print:text-slate-600">
              Candidate: <strong className="text-slate-200 print:text-black">{r.candidate_name}</strong> ({r.candidate_role}) • Interviewer: <strong className="text-slate-200 print:text-black">{r.interviewer_name}</strong>
            </p>
          </div>

          <div className="text-left sm:text-right space-y-1.5 shrink-0">
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${hasDiscrepancy
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              }`}>
              {hasDiscrepancy ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Review Recommended</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Calibrated Evaluation</span>
                </>
              )}
            </span>
            <p className="text-[11px] text-slate-400 print:text-slate-600">
              Report Date: {new Date(r.updated_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Score Comparison Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Interviewer Score */}
          <div className="p-4 rounded-xl bg-slate-900/80 print:bg-slate-100 border border-slate-800 print:border-slate-300 text-center">
            <span className="text-[10px] font-semibold text-slate-400 print:text-slate-600 uppercase tracking-wider block mb-1">
              Interviewer Score
            </span>
            <span className="text-2xl font-bold text-slate-200 print:text-black">
              {r.average_interviewer_score ?? 'N/A'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">/ 10.0</span>
          </div>

          {/* AI Technical Benchmark */}
          <div className="p-4 rounded-xl bg-purple-500/10 print:bg-purple-50 border border-purple-500/30 print:border-purple-200 text-center">
            <span className="text-[10px] font-semibold text-purple-400 print:text-purple-700 uppercase tracking-wider block mb-1">
              AI Technical Benchmark
            </span>
            <span className="text-2xl font-bold text-purple-400 print:text-purple-700">
              {r.average_ai_score ?? 'N/A'}
            </span>
            <span className="text-[10px] text-purple-400/80 block mt-0.5">/ 10.0</span>
          </div>

          {/* Score Delta */}
          <div className="p-4 rounded-xl bg-slate-900/80 print:bg-slate-100 border border-slate-800 print:border-slate-300 text-center">
            <span className="text-[10px] font-semibold text-slate-400 print:text-slate-600 uppercase tracking-wider block mb-1">
              Score Difference
            </span>
            <span className={`text-2xl font-bold ${scoreDelta !== null && Math.abs(parseFloat(scoreDelta)) >= 2.5
                ? 'text-amber-400'
                : 'text-emerald-400'
              }`}>
              {scoreDelta !== null ? `${scoreDelta > 0 ? '+' : ''}${scoreDelta}` : '0.0'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">variance</span>
          </div>

          {/* Review Signals */}
          <div className="p-4 rounded-xl bg-slate-900/80 print:bg-slate-100 border border-slate-800 print:border-slate-300 text-center">
            <span className="text-[10px] font-semibold text-slate-400 print:text-slate-600 uppercase tracking-wider block mb-1">
              Review Signals
            </span>
            <span className={`text-2xl font-bold ${hasDiscrepancy ? 'text-amber-400' : 'text-emerald-400'}`}>
              {r.discrepancy_count || 0}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">questions flagged</span>
          </div>
        </div>

        {/* Informational Banner: Discrepancy as Signal for Human Review */}
        {hasDiscrepancy && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-amber-300 block mb-0.5">
                Signal for Neutral Human Peer Review
              </span>
              <p className="text-slate-300 leading-relaxed">
                A divergence between human and AI scoring was observed on {r.discrepancy_count} question{r.discrepancy_count > 1 ? 's' : ''}.
                This is a neutral signal for second-opinion review to ensure all valid technical approaches and alternative solutions were fairly recognized.
              </p>
            </div>
          </div>
        )}

        {/* Executive Summary */}
        <div className="p-5 rounded-2xl bg-slate-900/60 print:bg-slate-50 border border-slate-800 print:border-slate-300 space-y-2">
          <h3 className="text-xs font-bold text-slate-200 print:text-black uppercase tracking-wider flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            Executive Assessment Summary
          </h3>
          <p className="text-xs text-slate-300 print:text-slate-800 leading-relaxed">
            {r.executive_summary}
          </p>
        </div>

        {/* Hiring Recommendations */}
        {r.recommendations?.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-300 print:text-black uppercase tracking-wider">
              Hiring Panel Recommendations:
            </h3>
            <ul className="space-y-1.5">
              {r.recommendations.map((rec, i) => (
                <li key={i} className="text-xs text-slate-300 print:text-slate-800 flex items-start gap-2 bg-slate-900/40 print:bg-slate-50 p-2.5 rounded-xl border border-slate-800/80 print:border-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Detailed Question Evaluations */}
        <div className="space-y-6 pt-4 border-t border-slate-800 print:border-slate-300">
          <h2 className="text-sm font-bold text-white print:text-black uppercase tracking-wider">
            Detailed Technical Evaluations ({r.evaluations?.length || 0} Questions)
          </h2>

          <div className="space-y-6">
            {r.evaluations?.map((ev, idx) => {
              const hasDisc = ev.discrepancy?.detected;

              return (
                <div
                  key={ev.id || idx}
                  className={`p-6 rounded-2xl border space-y-4 ${hasDisc
                      ? 'bg-amber-500/5 print:bg-amber-50/40 border-amber-500/30'
                      : 'bg-slate-900/50 print:bg-slate-50 border-slate-800 print:border-slate-300'
                    }`}
                >
                  {/* Question Header & Scores */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 print:border-slate-200 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-purple-400">Question #{idx + 1}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono border border-slate-700">
                        {ev.domain}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-400">
                        Human Score: <strong className="text-white print:text-black">{ev.interviewer_score ?? 'N/A'}</strong>
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className="text-purple-400 font-bold">
                        AI Score: {ev.ai_evaluation?.technical_score}/10
                      </span>
                      {hasDisc && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          Variance Signal
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Question Text */}
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Technical Question:
                    </span>
                    <p className="text-sm font-semibold text-white print:text-black">
                      {ev.question_text}
                    </p>
                  </div>

                  {/* Candidate Voice Answer (Primary Evidence) */}
                  <div className="p-3.5 rounded-xl bg-slate-950/80 print:bg-slate-100 border border-slate-800 print:border-slate-300 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 print:text-slate-600 flex items-center gap-1.5 font-bold">
                        <Headphones className="w-3.5 h-3.5 text-purple-400" />
                        Candidate Spoken Response (Primary Evidence)
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                        <Mic className="w-3 h-3" />
                        <span>Voice Recording</span>
                      </span>
                    </div>

                    {/* Audio Player */}
                    {(ev.audio_url || ev.audio_id) ? (
                      <div className="pt-1 print:hidden">
                        <AudioPlayer
                          audioUrl={ev.audio_url || voiceApi.getAudioUrl(ev.audio_id)}
                          title={`Audio Response - ${ev.domain}`}
                          duration={ev.recording_duration}
                          compact={true}
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">Audio recording attached to interview archive.</p>
                    )}

                    {/* Collapsible Transcript (Secondary) */}
                    {ev.candidate_answer && (
                      <details className="pt-1 border-t border-slate-800/60">
                        <summary className="text-[10px] font-mono text-slate-400 hover:text-slate-300 cursor-pointer select-none">
                          View Speech-to-Text Transcript (Secondary Reference)
                        </summary>
                        <p className="text-xs text-slate-300 print:text-slate-900 font-mono leading-relaxed mt-1.5 p-2 rounded bg-slate-900/60 border border-slate-800/80">
                          "{ev.candidate_answer}"
                        </p>
                      </details>
                    )}
                  </div>

                  {/* Interviewer Stated Notes */}
                  {ev.interviewer_notes && (
                    <div className="text-xs text-slate-400 bg-slate-900/80 print:bg-slate-100 p-2.5 rounded-xl border border-slate-800 print:border-slate-200">
                      <span className="font-semibold text-slate-300 print:text-slate-900">Interviewer Notes: </span>
                      "{ev.interviewer_notes}"
                    </div>
                  )}

                  {/* Variance Signal Detail if detected */}
                  {hasDisc && (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                      <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                        Variance Signal Analysis
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {ev.discrepancy.evidence}
                      </p>
                    </div>
                  )}

                  {/* Concept Breakdown & Technical Correctness */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                    {/* Strengths / Correct Concepts */}
                    {ev.ai_evaluation?.correct_concepts?.length > 0 && (
                      <div className="p-3 rounded-xl bg-emerald-500/5 print:bg-emerald-50 border border-emerald-500/20">
                        <span className="text-[11px] font-bold text-emerald-400 print:text-emerald-800 block mb-1">
                          ✓ Identified Strengths & Concepts ({ev.ai_evaluation.correct_concepts.length})
                        </span>
                        <ul className="space-y-1 text-slate-300 print:text-slate-800 text-[11px]">
                          {ev.ai_evaluation.correct_concepts.map((c, i) => (
                            <li key={i}>• {c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Valid Alternative Approaches */}
                    {ev.ai_evaluation?.alternative_valid_approaches?.length > 0 && (
                      <div className="p-3 rounded-xl bg-purple-500/5 print:bg-purple-50 border border-purple-500/20">
                        <span className="text-[11px] font-bold text-purple-400 print:text-purple-800 block mb-1">
                          ★ Valid Alternative Approach Recognized
                        </span>
                        <ul className="space-y-1 text-slate-300 print:text-slate-800 text-[11px]">
                          {ev.ai_evaluation.alternative_valid_approaches.map((a, i) => (
                            <li key={i}>• {a}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Areas Requiring Improvement / Missing Concepts */}
                    {ev.ai_evaluation?.missing_concepts?.length > 0 && (
                      <div className="p-3 rounded-xl bg-amber-500/5 print:bg-amber-50 border border-amber-500/20">
                        <span className="text-[11px] font-bold text-amber-400 print:text-amber-800 block mb-1">
                          ⚠ Areas for Improvement
                        </span>
                        <ul className="space-y-1 text-slate-300 print:text-slate-800 text-[11px]">
                          {ev.ai_evaluation.missing_concepts.map((m, i) => (
                            <li key={i}>• {m}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* AI Technical Explanation */}
                    <div className="p-3 rounded-xl bg-slate-900 print:bg-slate-100 border border-slate-800 print:border-slate-200">
                      <span className="text-[11px] font-bold text-slate-400 print:text-slate-700 block mb-1">
                        Technical Correctness Explanation
                      </span>
                      <p className="text-slate-300 print:text-slate-800 text-[11px] leading-relaxed">
                        {ev.ai_evaluation?.explanation}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
