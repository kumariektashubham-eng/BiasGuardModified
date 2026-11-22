import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  PlusCircle, 
  Layers, 
  CheckCircle2, 
  Clock, 
  Users, 
  FileText, 
  ArrowRight, 
  Calendar,
  ChevronRight,
  User,
  AlertTriangle
} from 'lucide-react';
import { interviewsApi, candidatesApi, reportsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const DashboardPage = () => {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [intRes, candRes, repRes] = await Promise.all([
        interviewsApi.list().catch(() => ({ data: [] })),
        candidatesApi.list().catch(() => ({ data: [] })),
        reportsApi.list().catch(() => ({ data: [] }))
      ]);
      setInterviews(intRes.data || []);
      setCandidates(candRes.data || []);
      setReports(repRes.data || []);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Metrics computation from real database state
  const totalInterviews = interviews.length;
  const completedInterviews = interviews.filter(
    (i) => i.status === 'completed' || (i.evaluated_questions > 0 && i.evaluated_questions >= (i.total_questions || 1))
  ).length;
  const pendingEvaluations = interviews.filter(
    (i) => (i.evaluated_questions || 0) === 0
  ).length;
  const totalCandidates = candidates.length;

  // Recent subsets
  const recentInterviews = interviews.slice(0, 5);
  const recentCandidates = candidates.slice(0, 5);
  const recentReports = reports.slice(0, 5);

  const getStatusBadge = (item) => {
    const totalQ = item.total_questions || item.questions?.length || 0;
    const evalQ = item.evaluated_questions || 0;
    const isCompleted = evalQ > 0 && evalQ >= totalQ;

    if (isCompleted) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" /> Completed
        </span>
      );
    }
    if (evalQ > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">
          <Clock className="w-3 h-3" /> In Progress
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
        Pending
      </span>
    );
  };

  return (
    <div className="space-y-8">
      {/* Welcome Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Welcome back, {user?.name?.split(' ')[0] || 'Interviewer'}. Monitor candidate interviews, voice responses, and AI evaluations.
          </p>
        </div>

        <Link
          to="/interviews/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2F855A] hover:bg-[#276749] text-white font-semibold text-xs tracking-wide transition-all shadow-sm active:scale-[0.99] self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>+ New Interview</span>
        </Link>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Interviews */}
        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Total Interviews
            </span>
            <span className="text-3xl font-bold text-white">{totalInterviews}</span>
            <span className="text-xs text-slate-400 block mt-1">Scheduled & conducted</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Completed Interviews */}
        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Completed Interviews
            </span>
            <span className="text-3xl font-bold text-emerald-400">{completedInterviews}</span>
            <span className="text-xs text-slate-400 block mt-1">Evaluations finished</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Pending Evaluations */}
        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Pending Evaluations
            </span>
            <span className="text-3xl font-bold text-slate-300">{pendingEvaluations}</span>
            <span className="text-xs text-slate-400 block mt-1">Awaiting scoring</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Total Candidates */}
        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Total Candidates
            </span>
            <span className="text-3xl font-bold text-white">{totalCandidates}</span>
            <span className="text-xs text-slate-400 block mt-1">Active profiles</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          Loading application dashboard...
        </div>
      ) : (
        <div className="space-y-8">
          {/* Section 1: Recent Interviews */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Recent Interviews</h2>
                <p className="text-xs text-slate-400 mt-0.5">Latest interview sessions and evaluation states</p>
              </div>
              <Link 
                to="/interviews" 
                className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
              >
                <span>View All Interviews</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentInterviews.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No interview sessions recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/60 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800/80">
                    <tr>
                      <th className="px-5 py-3">Interview Name</th>
                      <th className="px-5 py-3">Candidate</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {recentInterviews.map((item) => {
                      const dateStr = item.created_at
                        ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Recent';

                      return (
                        <tr key={item.id} className="hover:bg-slate-850/40 transition-colors">
                          <td className="px-5 py-3.5">
                            <Link 
                              to={`/interviews/${item.id}/evaluate`}
                              className="font-semibold text-slate-200 hover:text-purple-400 transition-colors block"
                            >
                              {item.title}
                            </Link>
                            <span className="text-[11px] text-slate-400">{item.candidate_role || 'Software Engineer'}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <Link 
                              to={`/candidates/${item.candidate_id}`}
                              className="text-purple-400 hover:underline font-medium"
                            >
                              {item.candidate_name || 'Candidate'}
                            </Link>
                          </td>
                          <td className="px-5 py-3.5 text-slate-400">
                            {dateStr}
                          </td>
                          <td className="px-5 py-3.5">
                            {getStatusBadge(item)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <Link
                              to={`/interviews/${item.id}/evaluate`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600/15 hover:bg-purple-600 text-purple-300 hover:text-white text-xs font-semibold border border-purple-500/30 transition-all"
                            >
                              <span>Evaluate</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 2-Column Grid: Recent Candidates & Latest Evaluation Reports */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Section 2: Recent Candidates */}
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between">
              <div>
                <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-white">Recent Candidates</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Profiles and target positions</p>
                  </div>
                  <Link 
                    to="/candidates" 
                    className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
                  >
                    <span>View All</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {recentCandidates.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No candidates registered yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/60">
                    {recentCandidates.map((cand) => (
                      <div 
                        key={cand.id} 
                        className="p-4 flex items-center justify-between gap-3 hover:bg-slate-850/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold flex items-center justify-center text-xs shrink-0">
                            {cand.name?.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold text-xs text-white truncate">{cand.name}</h4>
                            <p className="text-[11px] text-slate-400 truncate">{cand.target_role || 'Engineering Candidate'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[11px] text-slate-400 hidden sm:inline">
                            {cand.experience_years ? `${cand.experience_years}y exp` : 'Active'}
                          </span>
                          <Link
                            to={`/candidates/${cand.id}`}
                            className="text-xs font-semibold text-purple-400 hover:text-purple-300 hover:underline"
                          >
                            View Profile
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Latest Evaluation Reports */}
            <div className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between">
              <div>
                <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-white">Latest Evaluation Reports</h2>
                    <p className="text-xs text-slate-400 mt-0.5">AI scores and fairness calibration summaries</p>
                  </div>
                  <Link 
                    to="/reports" 
                    className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
                  >
                    <span>View All</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {recentReports.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No evaluation reports generated yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/60">
                    {recentReports.map((rep) => {
                      const hasDiscrepancy = (rep.discrepancy_count || 0) > 0;
                      return (
                        <div 
                          key={rep.id} 
                          className="p-4 flex items-center justify-between gap-3 hover:bg-slate-850/40 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-white truncate">
                                {rep.candidate_name || 'Candidate'}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                hasDiscrepancy 
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              }`}>
                                {hasDiscrepancy ? 'Review Recommended' : 'Calibrated'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {rep.interview_title}
                            </p>
                          </div>

                          <div className="flex items-center gap-4 shrink-0 text-right">
                            <div>
                              <span className="text-[10px] text-slate-400 block">AI Score</span>
                              <span className="text-xs font-bold text-purple-400">
                                {rep.average_ai_score !== null ? `${rep.average_ai_score}/10` : 'Pending'}
                              </span>
                            </div>

                            <Link
                              to={`/reports/${rep.interview_id || rep.id}`}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium border border-slate-700 transition-colors"
                            >
                              View Report
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
