import React, { useState, useEffect } from 'react';
import { 
  Scale, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Sparkles, 
  Info,
  ChevronDown,
  ChevronUp,
  ShieldCheck
} from 'lucide-react';
import { fairnessApi } from '../services/api';
import { Badge } from '../components/common/Badge';
import { formatApiError } from '../utils/errorFormatter';

export const FairnessPage = () => {
  const [benchmark, setBenchmark] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedCases, setExpandedCases] = useState({});

  useEffect(() => {
    loadBenchmark();
  }, []);

  const loadBenchmark = async () => {
    setLoading(true);
    try {
      const res = await fairnessApi.getBenchmark();
      setBenchmark(res.data);
      // Auto-expand first test case
      if (res.data?.test_results?.length > 0) {
        setExpandedCases({ [res.data.test_results[0].test_id]: true });
      }
    } catch (err) {
      console.error("Failed to load fairness benchmark:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunSuite = async () => {
    setRunning(true);
    try {
      const res = await fairnessApi.runSuite();
      setBenchmark(res.data);
      alert("Fairness & Stylistic Invariance Audit completed successfully!");
    } catch (err) {
      alert("Failed to run fairness audit: " + formatApiError(err));
    } finally {
      setRunning(false);
    }
  };

  const toggleCase = (testId) => {
    setExpandedCases(prev => ({ ...prev, [testId]: !prev[testId] }));
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        Evaluating stylistic variance across technical answer formulations...
      </div>
    );
  }

  if (!benchmark) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm bg-[#0F172A] border border-slate-800 rounded-2xl">
        Fairness test suite unavailable.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Scale className="w-6 h-6 text-indigo-400" />
            Fairness Testing & Stylistic Invariance Suite
          </h1>
          <p className="text-xs text-slate-400">
            Audit whether candidate answers are scored purely on technical substance rather than academic vocabulary, casual tone, or non-native phrasing.
          </p>
        </div>

        <button
          onClick={handleRunSuite}
          disabled={running}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold transition-all shadow-glow-brand"
        >
          {running ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Executing Parity Benchmarks...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>Run Automated Fairness Audit Suite</span>
            </>
          )}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Fairness Compliance Rate
          </span>
          <span className="text-2xl font-black text-emerald-400">
            {benchmark.fairness_compliance_rate}%
          </span>
          <p className="text-[11px] text-slate-400 mt-1">Passing stylistic threshold</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Average Score Variance
          </span>
          <span className="text-2xl font-black text-indigo-400">
            {benchmark.average_variance} pts
          </span>
          <p className="text-[11px] text-slate-400 mt-1">Between semantic equivalents</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Max Observed Drift
          </span>
          <span className={`text-2xl font-black ${benchmark.max_observed_variance > 1.5 ? 'text-amber-400' : 'text-slate-200'}`}>
            {benchmark.max_observed_variance} pts
          </span>
          <p className="text-[11px] text-slate-400 mt-1">Across 4 styles & paradigms</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Discrepancy Flags
          </span>
          <span className={`text-2xl font-black ${benchmark.flagged_discrepancy_count > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {benchmark.flagged_discrepancy_count}
          </span>
          <p className="text-[11px] text-slate-400 mt-1">Flags for human review</p>
        </div>
      </div>

      {/* Summary Banner */}
      <div className="p-5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-2">
        <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold">
          <ShieldCheck className="w-4 h-4 text-indigo-400" />
          <span>Fairness Audit Verdict: {benchmark.run_name}</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          {benchmark.summary_verdict}
        </p>
      </div>

      {/* Test Cases Accordion List */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Audited Test Cases & Stylistic Parity Results ({benchmark.test_results?.length || 0})
        </h3>

        {benchmark.test_results?.map((tc) => {
          const isExpanded = expandedCases[tc.test_id];
          return (
            <div key={tc.test_id} className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-hidden transition-all">
              {/* Case Header */}
              <div 
                onClick={() => toggleCase(tc.test_id)}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-850/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="primary" size="xs">{tc.domain}</Badge>
                  <div>
                    <h4 className="text-sm font-bold text-white">{tc.question_text}</h4>
                    <span className="text-xs text-slate-400">Baseline Canonical Score: {tc.baseline_score}/10</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant={tc.is_fair ? 'emerald' : 'amber'} size="xs">
                    {tc.is_fair ? `Pass (Δ ${tc.max_variance} pts)` : `Flagged (Δ ${tc.max_variance} pts)`}
                  </Badge>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>

              {/* Expanded Case Details */}
              {isExpanded && (
                <div className="px-5 pb-5 pt-1 border-t border-slate-800/80 space-y-4">
                  {/* Baseline reference */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Baseline Canonical Formulation (Standard Technical)
                    </span>
                    <p className="text-slate-300 font-mono text-[11px]">"{tc.baseline_answer}"</p>
                  </div>

                  {/* Stylistic Variations Table */}
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-300 block">
                      Stylistic Variations & Alternative Paradigms Tested:
                    </span>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {tc.variations?.map((v, vIdx) => (
                        <div 
                          key={vIdx}
                          className={`p-4 rounded-xl border text-xs space-y-2 ${
                            v.flagged_discrepancy 
                              ? 'bg-rose-500/5 border-rose-500/30' 
                              : 'bg-slate-900/60 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-200">{v.style_label}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-indigo-400">{v.ai_score}/10</span>
                              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                                Math.abs(v.score_delta_from_baseline) >= 1.5 
                                  ? 'bg-rose-500/10 text-rose-400 font-bold' 
                                  : 'bg-emerald-500/10 text-emerald-400'
                              }`}>
                                Δ {v.score_delta_from_baseline > 0 ? `+${v.score_delta_from_baseline}` : v.score_delta_from_baseline}
                              </span>
                            </div>
                          </div>

                          <p className="text-[11px] font-mono text-slate-400 bg-slate-950 p-2 rounded border border-slate-800 leading-relaxed line-clamp-3">
                            "{v.answer_text}"
                          </p>

                          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                            <span>Concepts verified: {v.identified_concepts_count}</span>
                            {v.flagged_discrepancy ? (
                              <span className="text-rose-400 font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Potential Stylistic Bias Flag
                              </span>
                            ) : (
                              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Invariant
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
