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
      <div className="p-12 text-center text-gray-500 text-sm">
        <div className="w-8 h-8 border-2 border-[#2F855A] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        Loading Evaluation Report...
      </div>
    );
  }

  // Reports Directory if none selected
  if (!selectedReport) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Evaluation Reports</h1>
            <p className="text-xs text-gray-500 mt-1">
              Comprehensive AI technical evaluations, score comparisons, and neutral peer review audits.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        {reportsList.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm bg-white border border-gray-200 rounded-lg shadow-sm">
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
                  className="p-5 rounded-lg bg-white border border-gray-200 shadow-sm hover:border-[#2F855A] cursor-pointer transition-all flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-[#2F855A]">{rep.candidate_name}</span>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium ${
                        hasDiscrepancy
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {hasDiscrepancy ? 'Review Recommended' : 'Calibrated'}
                      </span>
                    </div>
                    <h3 className="font-bold text-sm text-gray-900">{rep.interview_title}</h3>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{rep.executive_summary}</p>
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                    <span>Evaluated: {rep.evaluated_questions}/{rep.total_questions} Questions</span>
                    <span className="text-[#2F855A] font-semibold flex items-center gap-1">
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
    <div className="max-w-4xl mx-auto space-y-6 print:p-0 print:m-0">
      {/* Action Header */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4 no-print">
        <button
          onClick={() => navigate('/reports')}
          className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 font-semibold transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All Reports
        </button>

        <div className="flex items-center gap-2.5">
          <Link
            to={`/interviews/${r.interview_id}/evaluate`}
            className="px-3.5 py-2 rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold border border-gray-300 shadow-sm transition-colors"
          >
            Open Evaluation Session
          </Link>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2F855A] hover:bg-[#276749] text-white text-xs font-bold transition-all shadow-sm active:scale-[0.99]"
          >
            <Printer className="w-4 h-4" />
            <span>Export / Print</span>
          </button>
        </div>
      </div>

      {/* Main Report Document Container */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 sm:p-10 shadow-sm space-y-8 print:border-none print:p-0">

        {/* Document Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 border-b border-gray-200 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center text-[#2F855A]">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="font-bold text-xs tracking-tight text-gray-600 uppercase">
                BiasGuard AI • Evaluation Report
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              {r.interview_title}
            </h1>
            <p className="text-xs text-gray-500">
              Candidate: <strong className="text-gray-900 font-semibold">{r.candidate_name}</strong> ({r.candidate_role}) • Interviewer: <strong className="text-gray-900 font-semibold">{r.interviewer_name}</strong>
            </p>
          </div>

          <div className="text-left sm:text-right space-y-1.5 shrink-0">
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
              hasDiscrepancy
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
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
            <p className="text-[11px] text-gray-500">
              Report Date: {new Date(r.updated_at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Score Comparison Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Interviewer Score */}
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-center">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
              Interviewer Score
            </span>
            <span className="text-2xl font-bold text-gray-900">
              {r.average_interviewer_score ?? 'N/A'}
            </span>
            <span className="text-[10px] text-gray-500 block mt-0.5">/ 10.0</span>
          </div>

          {/* AI Technical Benchmark */}
          <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-center">
            <span className="text-[10px] font-bold text-[#2F855A] uppercase tracking-wider block mb-1">
              AI Technical Benchmark
            </span>
            <span className="text-2xl font-bold text-[#2F855A]">
              {r.average_ai_score ?? 'N/A'}
            </span>
            <span className="text-[10px] text-[#2F855A]/80 block mt-0.5">/ 10.0</span>
          </div>

          {/* Score Delta */}
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-center">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
              Score Difference
            </span>
            <span className={`text-2xl font-bold ${
              scoreDelta !== null && Math.abs(parseFloat(scoreDelta)) >= 2.5
                ? 'text-amber-600'
                : 'text-emerald-600'
            }`}>
              {scoreDelta !== null ? `${scoreDelta > 0 ? '+' : ''}${scoreDelta}` : '0.0'}
            </span>
            <span className="text-[10px] text-gray-500 block mt-0.5">variance</span>
          </div>

          {/* Review Signals */}
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-center">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
              Review Signals
            </span>
            <span className={`text-2xl font-bold ${hasDiscrepancy ? 'text-amber-600' : 'text-emerald-600'}`}>
              {r.discrepancy_count || 0}
            </span>
            <span className="text-[10px] text-gray-500 block mt-0.5">questions flagged</span>
          </div>
        </div>

        {/* Informational Banner: Discrepancy as Signal for Human Review */}
        {hasDiscrepancy && (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-amber-800 block mb-0.5">
                Signal for Neutral Human Peer Review
              </span>
              <p className="text-amber-700 leading-relaxed">
                A divergence between human and AI scoring was observed on {r.discrepancy_count} question{r.discrepancy_count > 1 ? 's' : ''}.
                This is a neutral signal for second-opinion review to ensure all valid technical approaches and alternative solutions were fairly recognized.
              </p>
            </div>
          </div>
        )}

        {/* Executive Summary */}
        <div className="p-5 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#2F855A]" />
            Executive Assessment Summary
          </h3>
          <p className="text-xs text-gray-700 leading-relaxed">
            {r.executive_summary}
          </p>
        </div>

        {/* Hiring Recommendations */}
        {r.recommendations?.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              Hiring Panel Recommendations:
            </h3>
            <ul className="space-y-1.5">
              {r.recommendations.map((rec, i) => (
                <li key={i} className="text-xs text-gray-700 flex items-start gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                  <CheckCircle2 className="w-4 h-4 text-[#2F855A] shrink-0 mt-0.5" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Detailed Question Evaluations */}
        <div className="space-y-6 pt-4 border-t border-gray-200">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
            Detailed Technical Evaluations ({r.evaluations?.length || 0} Questions)
          </h2>

          <div className="space-y-6">
            {r.evaluations?.map((ev, idx) => {
              const hasDisc = ev.discrepancy?.detected;

              return (
                <div
                  key={ev.id || idx}
                  className={`p-6 rounded-lg border space-y-4 ${
                    hasDisc
                      ? 'bg-amber-50/30 border-amber-200'
                      : 'bg-gray-50/60 border-gray-200'
                  }`}
                >
                  {/* Question Header & Scores */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#2F855A]">Question #{idx + 1}</span>
                      <span className="px-2 py-0.5 rounded bg-white text-gray-700 text-[10px] font-mono border border-gray-300">
                        {ev.domain}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-600">
                        Human Score: <strong className="text-gray-900">{ev.interviewer_score ?? 'N/A'}</strong>
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="text-[#2F855A] font-bold">
                        AI Score: {ev.ai_evaluation?.technical_score}/10
                      </span>
                      {hasDisc && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-300">
                          Variance Signal
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Question Text */}
                  <div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                      Technical Question:
                    </span>
                    <p className="text-sm font-semibold text-gray-900">
                      {ev.question_text}
                    </p>
                  </div>

                  {/* Candidate Voice Answer (Primary Evidence) */}
                  <div className="p-3.5 rounded-lg bg-white border border-gray-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-gray-600 flex items-center gap-1.5 font-bold">
                        <Headphones className="w-3.5 h-3.5 text-[#2F855A]" />
                        Candidate Spoken Response (Primary Evidence)
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#2F855A] bg-green-50 px-2 py-0.5 rounded border border-green-200">
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
                      <p className="text-xs text-gray-400 italic">Audio recording attached to interview archive.</p>
                    )}

                    {/* Collapsible Transcript (Secondary) */}
                    {ev.candidate_answer && (
                      <details className="pt-1 border-t border-gray-100">
                        <summary className="text-[10px] font-mono text-gray-500 hover:text-gray-700 cursor-pointer select-none">
                          View Speech-to-Text Transcript (Secondary Reference)
                        </summary>
                        <p className="text-xs text-gray-700 font-mono leading-relaxed mt-1.5 p-2.5 rounded bg-gray-50 border border-gray-200">
                          "{ev.candidate_answer}"
                        </p>
                      </details>
                    )}
                  </div>

                  {/* Interviewer Stated Notes */}
                  {ev.interviewer_notes && (
                    <div className="text-xs text-gray-600 bg-white p-2.5 rounded-lg border border-gray-200">
                      <span className="font-semibold text-gray-800">Interviewer Notes: </span>
                      "{ev.interviewer_notes}"
                    </div>
                  )}

                  {/* Variance Signal Detail if detected */}
                  {hasDisc && (
                    <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
                      <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        Variance Signal Analysis
                      </span>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        {ev.discrepancy.evidence}
                      </p>
                    </div>
                  )}

                  {/* Concept Breakdown & Technical Correctness */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                    {/* Strengths / Correct Concepts */}
                    {ev.ai_evaluation?.correct_concepts?.length > 0 && (
                      <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200">
                        <span className="text-[11px] font-bold text-emerald-800 block mb-1">
                          ✓ Identified Strengths & Concepts ({ev.ai_evaluation.correct_concepts.length})
                        </span>
                        <ul className="space-y-1 text-emerald-900 text-[11px]">
                          {ev.ai_evaluation.correct_concepts.map((c, i) => (
                            <li key={i}>• {c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Valid Alternative Approaches */}
                    {ev.ai_evaluation?.alternative_valid_approaches?.length > 0 && (
                      <div className="p-3 rounded-lg bg-green-50/70 border border-green-200">
                        <span className="text-[11px] font-bold text-[#2F855A] block mb-1">
                          ★ Valid Alternative Approach Recognized
                        </span>
                        <ul className="space-y-1 text-gray-800 text-[11px]">
                          {ev.ai_evaluation.alternative_valid_approaches.map((a, i) => (
                            <li key={i}>• {a}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Areas Requiring Improvement / Missing Concepts */}
                    {ev.ai_evaluation?.missing_concepts?.length > 0 && (
                      <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200">
                        <span className="text-[11px] font-bold text-amber-800 block mb-1">
                          ⚠ Areas for Improvement
                        </span>
                        <ul className="space-y-1 text-amber-900 text-[11px]">
                          {ev.ai_evaluation.missing_concepts.map((m, i) => (
                            <li key={i}>• {m}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* AI Technical Explanation */}
                    <div className="p-3 rounded-lg bg-white border border-gray-200">
                      <span className="text-[11px] font-bold text-gray-600 block mb-1">
                        Technical Correctness Explanation
                      </span>
                      <p className="text-gray-700 text-[11px] leading-relaxed">
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
