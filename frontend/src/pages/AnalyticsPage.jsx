import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend, 
  PieChart, 
  Pie, 
  Cell,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts';
import { 
  BarChart3, 
  Layers, 
  Users, 
  TrendingUp, 
  AlertTriangle, 
  Search, 
  Filter, 
  RefreshCw,
  Scale
} from 'lucide-react';
import { analyticsApi, interviewsApi } from '../services/api';
import { Badge } from '../components/common/Badge';

const COLORS = ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#8B5CF6', '#06B6D4'];

export const AnalyticsPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [tableFilter, setTableFilter] = useState('ALL');

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const res = await analyticsApi.getDashboard();
      setData(res.data);
    } catch (err) {
      setError('Failed to fetch analytics: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        Synthesizing Evaluation Analytics & Calibration Metrics...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm bg-[#0F172A] border border-slate-800 rounded-2xl">
        Analytics data unavailable.
      </div>
    );
  }

  const filteredHistory = (data.score_comparison_pairs || []).filter((p) => {
    const matchesSearch = p.candidate.toLowerCase().includes(tableSearch.toLowerCase()) ||
                          p.domain.toLowerCase().includes(tableSearch.toLowerCase());
    const matchesFilter = tableFilter === 'ALL' || 
                          (tableFilter === 'DISCREPANCY' && p.has_discrepancy) ||
                          (tableFilter === 'CALIBRATED' && !p.has_discrepancy);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-400" />
            Evaluation Analytics & Bias Telemetry
          </h1>
          <p className="text-xs text-slate-400">
            System-wide calibration tracking, score divergence patterns, and domain benchmarking.
          </p>
        </div>

        <button
          onClick={loadAnalytics}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors w-fit"
        >
          <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
          <span>Refresh Analytics</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Total Evaluations
          </span>
          <span className="text-3xl font-black text-white">{data.total_evaluations}</span>
          <p className="text-xs text-slate-400 mt-1">Across {data.total_interviews} interview rounds</p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Average AI Technical Score
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-indigo-400">{data.average_ai_score}</span>
            <span className="text-xs text-slate-400">/ 10.0</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Interviewer avg: {data.average_interviewer_score}</p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Potential Discrepancies
          </span>
          <span className="text-3xl font-black text-amber-400">{data.discrepancy_count}</span>
          <p className="text-xs text-slate-400 mt-1">{data.discrepancy_rate}% of all evaluated answers</p>
        </div>

        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Candidates Audited
          </span>
          <span className="text-3xl font-black text-emerald-400">{data.total_candidates}</span>
          <p className="text-xs text-slate-400 mt-1">100% independent evaluation coverage</p>
        </div>
      </div>

      {/* Primary Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Domain Wise Performance Bar Chart (7 Cols) */}
        <div className="lg:col-span-7 bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Domain-Wise Score Comparison: Interviewer vs AI
            </h3>
            <p className="text-xs text-slate-400">
              Evaluates parity across Java, Python, DSA, DBMS, SQL, and OS
            </p>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.domain_analytics} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="domain" stroke="#64748B" fontSize={11} angle={-15} textAnchor="end" />
                <YAxis stroke="#64748B" fontSize={11} domain={[0, 10]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#1E293B', borderRadius: '12px', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="avg_interviewer_score" name="Interviewer Score" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avg_ai_score" name="AI Technical Score" fill="#6366F1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Discrepancy Breakdown Donut Chart (5 Cols) */}
        <div className="lg:col-span-5 bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Discrepancy Category Breakdown
            </h3>
            <p className="text-xs text-slate-400">
              Distribution of detected potential evaluation review flags
            </p>
          </div>

          <div className="h-72 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.discrepancy_categories}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                  innerRadius={50}
                  paddingAngle={5}
                >
                  {data.discrepancy_categories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#1E293B', borderRadius: '12px', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Score Distribution Brackets Chart */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Score Distribution Calibration: Interviewer vs AI
          </h3>
          <p className="text-xs text-slate-400">
            Compares score clustering across brackets (0-3.9, 4.0-6.4, 6.5-8.4, 8.5-10.0)
          </p>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.score_distribution} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="range" stroke="#64748B" fontSize={12} />
              <YAxis stroke="#64748B" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#1E293B', borderRadius: '12px', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="interviewer" name="Interviewer Scores Count" fill="#64748B" radius={[4, 4, 0, 0]} />
              <Bar dataKey="ai" name="AI Scores Count" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Interview Evaluation History Audit Table */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Evaluation History Audit Log
            </h3>
            <p className="text-xs text-slate-400">Pairwise records of candidate answer scores and detected flags</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search candidate, domain..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-48"
              />
            </div>

            <select
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="py-1.5 px-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Evaluations</option>
              <option value="DISCREPANCY">Discrepancies Flagged</option>
              <option value="CALIBRATED">Calibrated Parity</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800/80">
              <tr>
                <th className="px-5 py-3.5">Candidate</th>
                <th className="px-5 py-3.5">Domain</th>
                <th className="px-5 py-3.5">Interviewer Score</th>
                <th className="px-5 py-3.5">AI Technical Score</th>
                <th className="px-5 py-3.5">Score Variance (Δ)</th>
                <th className="px-5 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredHistory.map((item, idx) => (
                <tr key={item.id || idx} className="hover:bg-slate-850/40 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-slate-200">{item.candidate}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant="primary" size="xs">{item.domain}</Badge>
                  </td>
                  <td className="px-5 py-3.5 font-bold text-slate-300">{item.interviewer_score} / 10</td>
                  <td className="px-5 py-3.5 font-bold text-indigo-400">{item.ai_score} / 10</td>
                  <td className="px-5 py-3.5 font-mono">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      Math.abs(item.delta) >= 2.5 
                        ? 'bg-rose-500/10 text-rose-400' 
                        : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {item.delta > 0 ? `+${item.delta}` : item.delta}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {item.has_discrepancy ? (
                      <Badge variant="rose" size="xs">Flagged for Review</Badge>
                    ) : (
                      <Badge variant="emerald" size="xs">Calibrated</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
