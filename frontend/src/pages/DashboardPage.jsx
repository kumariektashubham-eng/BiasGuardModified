import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  PlusCircle, 
  Layers, 
  CheckCircle2, 
  Clock, 
  Users, 
  ArrowRight, 
  ChevronRight,
  ShieldCheck
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
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-green-50 text-[#2F855A] border border-green-200">
          <CheckCircle2 className="w-3 h-3" /> Completed
        </span>
      );
    }
    if (evalQ > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <Clock className="w-3 h-3" /> In Progress
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
        Pending
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Welcome Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Dual-Track Technical Evaluation · Monitor interview sessions, candidate speech transcripts, and rubric calibrations.
          </p>
        </div>

        <Link
          to="/interviews/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded bg-[#2F855A] hover:bg-[#276749] text-white font-semibold text-xs tracking-wide transition-colors shadow-sm self-start sm:self-auto cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>+ Schedule Interview</span>
        </Link>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Interviews */}
        <div className="p-5 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
              Total Interviews
            </span>
            <span className="text-3xl font-extrabold text-gray-900">{totalInterviews}</span>
            <span className="text-xs text-gray-500 block mt-1">Conducted & scheduled</span>
          </div>
          <div className="w-10 h-10 rounded bg-green-50 border border-green-200 flex items-center justify-center text-[#2F855A]">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Completed Interviews */}
        <div className="p-5 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
              Completed Interviews
            </span>
            <span className="text-3xl font-extrabold text-[#2F855A]">{completedInterviews}</span>
            <span className="text-xs text-gray-500 block mt-1">Evaluations finished</span>
          </div>
          <div className="w-10 h-10 rounded bg-green-50 border border-green-200 flex items-center justify-center text-[#2F855A]">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Pending Evaluations */}
        <div className="p-5 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
              Pending Evaluations
            </span>
            <span className="text-3xl font-extrabold text-gray-700">{pendingEvaluations}</span>
            <span className="text-xs text-gray-500 block mt-1">Awaiting scoring</span>
          </div>
          <div className="w-10 h-10 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Total Candidates */}
        <div className="p-5 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
              Total Candidates
            </span>
            <span className="text-3xl font-extrabold text-gray-900">{totalCandidates}</span>
            <span className="text-xs text-gray-500 block mt-1">Registered candidate profiles</span>
          </div>
          <div className="w-10 h-10 rounded bg-green-50 border border-green-200 flex items-center justify-center text-[#2F855A]">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-500 text-sm bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="w-7 h-7 border-2 border-[#2F855A] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          Loading application dashboard...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Recent Interviews */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Recent Interviews</h2>
                <p className="text-xs text-gray-500 mt-0.5">Latest interview sessions and evaluation states</p>
              </div>
              <Link 
                to="/interviews" 
                className="text-xs font-semibold text-[#2F855A] hover:text-[#276749] flex items-center gap-1 transition-colors"
              >
                <span>View All Interviews</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentInterviews.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-xs">
                No interview sessions recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-700 uppercase font-bold text-[11px] border-b border-gray-200">
                    <tr>
                      <th className="px-5 py-3">Interview Title</th>
                      <th className="px-5 py-3">Candidate</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentInterviews.map((item) => {
                      const dateStr = item.created_at
                        ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Recent';

                      return (
                        <tr key={item.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-5 py-3.5">
                            <Link 
                              to={`/interviews/${item.id}/evaluate`}
                              className="font-semibold text-gray-900 hover:text-[#2F855A] transition-colors block"
                            >
                              {item.title}
                            </Link>
                            <span className="text-[11px] text-gray-500">{item.candidate_role || 'Software Engineer'}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <Link 
                              to={`/candidates/${item.candidate_id}`}
                              className="text-[#2F855A] hover:underline font-medium"
                            >
                              {item.candidate_name || 'Candidate'}
                            </Link>
                          </td>
                          <td className="px-5 py-3.5 text-gray-500">
                            {dateStr}
                          </td>
                          <td className="px-5 py-3.5">
                            {getStatusBadge(item)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <Link
                              to={`/interviews/${item.id}/evaluate`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-green-50 hover:bg-[#2F855A] text-[#2F855A] hover:text-white text-xs font-semibold border border-green-200 transition-colors"
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
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col justify-between">
              <div>
                <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Recent Candidates</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Registered candidate profiles</p>
                  </div>
                  <Link 
                    to="/candidates" 
                    className="text-xs font-semibold text-[#2F855A] hover:text-[#276749] flex items-center gap-1 transition-colors"
                  >
                    <span>View All</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {recentCandidates.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-xs">
                    No candidates registered yet.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {recentCandidates.map((cand) => (
                      <div 
                        key={cand.id} 
                        className="p-4 flex items-center justify-between gap-3 hover:bg-gray-50/70 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded bg-green-50 border border-green-200 text-[#2F855A] font-bold flex items-center justify-center text-xs shrink-0">
                            {cand.name?.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold text-xs text-gray-900 truncate">{cand.name}</h4>
                            <p className="text-[11px] text-gray-500 truncate">{cand.target_role || 'Engineering Candidate'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[11px] text-gray-500 hidden sm:inline">
                            {cand.experience_years ? `${cand.experience_years}y exp` : 'Active'}
                          </span>
                          <Link
                            to={`/candidates/${cand.id}`}
                            className="text-xs font-semibold text-[#2F855A] hover:underline"
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
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col justify-between">
              <div>
                <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Latest Evaluation Reports</h2>
                    <p className="text-xs text-gray-500 mt-0.5">AI benchmark scores & variance calibration</p>
                  </div>
                  <Link 
                    to="/reports" 
                    className="text-xs font-semibold text-[#2F855A] hover:text-[#276749] flex items-center gap-1 transition-colors"
                  >
                    <span>View All</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {recentReports.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-xs">
                    No evaluation reports generated yet.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {recentReports.map((rep) => {
                      const hasDiscrepancy = (rep.discrepancy_count || 0) > 0;
                      return (
                        <div 
                          key={rep.id} 
                          className="p-4 flex items-center justify-between gap-3 hover:bg-gray-50/70 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-gray-900 truncate">
                                {rep.candidate_name || 'Candidate'}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                                hasDiscrepancy 
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                                  : 'bg-green-50 text-[#2F855A] border border-green-200'
                              }`}>
                                {hasDiscrepancy ? 'Review Recommended' : 'Calibrated'}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 truncate mt-0.5">
                              {rep.interview_title}
                            </p>
                          </div>

                          <div className="flex items-center gap-4 shrink-0 text-right">
                            <div>
                              <span className="text-[10px] text-gray-400 block">AI Score</span>
                              <span className="text-xs font-bold text-[#2F855A]">
                                {rep.average_ai_score !== null ? `${rep.average_ai_score}/10` : 'Pending'}
                              </span>
                            </div>

                            <Link
                              to={`/reports/${rep.interview_id || rep.id}`}
                              className="px-3 py-1.5 rounded bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium border border-gray-300 transition-colors"
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
