import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  CheckCircle2, 
  AlertTriangle, 
  Filter, 
  Search, 
  Sparkles, 
  Scale, 
  User, 
  ArrowRight,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { feedbackApi } from '../services/api';
import { Badge } from '../components/common/Badge';

export const FeedbackPage = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadFeedback();
  }, [statusFilter]);

  const loadFeedback = async () => {
    setLoading(true);
    try {
      const p = statusFilter !== 'ALL' ? { status: statusFilter } : {};
      const res = await feedbackApi.list(p);
      const data = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setFeedbacks(data);
    } catch (err) {
      console.error("Failed to load feedback", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredFeedbacks = feedbacks.filter(f => {
    return (
      f.question_text?.toLowerCase().includes(search.toLowerCase()) ||
      f.candidate_name?.toLowerCase().includes(search.toLowerCase()) ||
      f.domain?.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-indigo-400" />
            Human Expert Feedback & Calibration Audit
          </h1>
          <p className="text-xs text-slate-400">
            Audit expert corrections, preserve immutable evaluation history, and feed verified rubrics back into model prompts.
          </p>
        </div>

        <button
          onClick={loadFeedback}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors w-fit"
        >
          <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
          <span>Refresh Feedbacks</span>
        </button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Total Expert Reviews
          </span>
          <span className="text-2xl font-black text-white">{feedbacks.length}</span>
          <p className="text-[11px] text-slate-400 mt-0.5">Human-in-the-loop audit records</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Promoted to Training Dataset
          </span>
          <span className="text-2xl font-black text-emerald-400">
            {feedbacks.filter(f => f.promoted_to_dataset).length}
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5">Ground-truth training examples created</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Alternative Paradigms Verified
          </span>
          <span className="text-2xl font-black text-purple-400">
            {feedbacks.filter(f => f.is_alternative_approach).length}
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5">Non-canonical valid solutions defended</p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {["ALL", "approved", "pending"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                statusFilter === st 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {st} Reviews
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search candidate, question..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-56 sm:w-64"
          />
        </div>
      </div>

      {/* Feedback Feed Cards */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          Loading expert feedback history...
        </div>
      ) : filteredFeedbacks.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-sm bg-[#0F172A] border border-slate-800 rounded-2xl">
          No human feedback records found. Submit an expert review from an interview evaluation session to see it here.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredFeedbacks.map((item) => (
            <div key={item.id} className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-4 hover:border-slate-700 transition-colors">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="primary" size="xs">{item.domain}</Badge>
                  <span className="text-xs font-bold text-white">{item.candidate_name}</span>
                  {item.is_alternative_approach && (
                    <Badge variant="purple" size="xs">Alternative Approach Defended</Badge>
                  )}
                  {item.promoted_to_dataset && (
                    <Badge variant="emerald" size="xs">In Training Dataset</Badge>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Reviewed by <strong>{item.reviewed_by}</strong></span>
                  <span>•</span>
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Question & Answer */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-200">{item.question_text}</p>
                <p className="text-[11px] font-mono text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800 line-clamp-3">
                  "{item.candidate_answer}"
                </p>
              </div>

              {/* Side-by-Side: Original AI Prediction vs Expert Correction */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* Original AI */}
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Original AI Assessment
                    </span>
                    <span className="font-black text-slate-200">{item.original_ai_score} / 10</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed italic">
                    "{item.original_ai_explanation}"
                  </p>
                </div>

                {/* Expert Corrected */}
                <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                      Expert Calibrated Assessment
                    </span>
                    <span className="font-black text-indigo-400 text-sm">{item.expert_score} / 10</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
                    "{item.expert_explanation}"
                  </p>
                </div>
              </div>

              {/* Verified Concepts Tags */}
              {item.expert_correct_concepts?.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-semibold mr-1">Verified Rubric Concepts:</span>
                  {item.expert_correct_concepts.map((c, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      ✓ {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
