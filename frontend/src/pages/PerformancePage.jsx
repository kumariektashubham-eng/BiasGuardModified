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
  ScatterChart, 
  Scatter, 
  ReferenceLine,
  ZAxis
} from 'recharts';
import { 
  Target, 
  TrendingUp, 
  CheckCircle2, 
  Scale, 
  BarChart3, 
  Layers, 
  RefreshCw,
  Award,
  Cpu
} from 'lucide-react';
import { performanceApi } from '../services/api';
import { Badge } from '../components/common/Badge';

export const PerformancePage = () => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPerformance();
  }, []);

  const loadPerformance = async () => {
    setLoading(true);
    try {
      const res = await performanceApi.getDashboard();
      setMetrics(res.data);
    } catch (err) {
      console.error("Performance metrics load error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        Calculating statistical performance metrics (MAE, RMSE, Accuracy)...
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm bg-[#0F172A] border border-slate-800 rounded-2xl">
        Performance metrics data unavailable.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Target className="w-6 h-6 text-indigo-400" />
            Model Performance & Calibration Dashboard
          </h1>
          <p className="text-xs text-slate-400">
            Statistical validation metrics comparing independent AI scoring against verified expert ground truth.
          </p>
        </div>

        <button
          onClick={loadPerformance}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors w-fit"
        >
          <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
          <span>Refresh Telemetry</span>
        </button>
      </div>

      {/* KPI Cards (MAE, RMSE, Accuracy, Precision/Recall, Consistency) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* MAE */}
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Mean Absolute Error (MAE)
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-indigo-400">{metrics.mean_absolute_error}</span>
            <span className="text-xs text-slate-500">pts</span>
          </div>
          <p className="text-[11px] text-emerald-400 mt-1">Target &lt; 1.5 pts</p>
        </div>

        {/* RMSE */}
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Root Mean Square Error
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white">{metrics.root_mean_squared_error}</span>
            <span className="text-xs text-slate-500">pts</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Variance penalty</p>
        </div>

        {/* Accuracy */}
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Classification Accuracy
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-400">{metrics.classification_accuracy}%</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Score class agreement</p>
        </div>

        {/* Precision & Recall */}
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Precision & Recall
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-indigo-300">{metrics.precision}%</span>
            <span className="text-xs text-slate-500">/ {metrics.recall}%</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">F1: {metrics.f1_score}%</p>
        </div>

        {/* Evaluation Consistency */}
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Evaluation Consistency
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-purple-400">{metrics.evaluation_consistency_score}%</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Rubric reproducibility</p>
        </div>
      </div>

      {/* Primary Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* AI vs Expert Scatter Comparison (7 Cols) */}
        <div className="lg:col-span-7 bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              AI Score vs Expert Ground Truth Calibration Plot
            </h3>
            <p className="text-xs text-slate-400">
              Evaluations clustered along the diagonal reference line indicate ideal score parity.
            </p>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis 
                  type="number" 
                  dataKey="expert_score" 
                  name="Expert Score" 
                  unit="/10" 
                  domain={[0, 10]} 
                  stroke="#64748B" 
                  fontSize={11} 
                />
                <YAxis 
                  type="number" 
                  dataKey="ai_score" 
                  name="AI Score" 
                  unit="/10" 
                  domain={[0, 10]} 
                  stroke="#64748B" 
                  fontSize={11} 
                />
                <ZAxis range={[60, 60]} />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }} 
                  contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#1E293B', borderRadius: '12px', fontSize: '12px' }} 
                />
                <ReferenceLine x={5} stroke="#334155" strokeDasharray="3 3" />
                <ReferenceLine y={5} stroke="#334155" strokeDasharray="3 3" />
                <Scatter name="Evaluations" data={metrics.ai_vs_expert_comparisons} fill="#6366F1" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Confusion Matrix Heatmap (5 Cols) */}
        <div className="lg:col-span-5 bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Evaluation Confusion Matrix
            </h3>
            <p className="text-xs text-slate-400">
              Agreement on Correct (≥7.5), Partial (5.0-7.4), and Incorrect (&lt;5.0)
            </p>
          </div>

          <div className="pt-2">
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="text-[10px] text-slate-500 font-bold p-2 text-right">Expert \ AI</div>
              <div className="text-[10px] text-indigo-400 font-bold p-2 bg-slate-900 rounded">Correct</div>
              <div className="text-[10px] text-indigo-400 font-bold p-2 bg-slate-900 rounded">Partial</div>
              <div className="text-[10px] text-indigo-400 font-bold p-2 bg-slate-900 rounded">Incorrect</div>

              {metrics.confusion_matrix?.matrix?.map((row, rIdx) => {
                const rowLabels = ["Correct", "Partial", "Incorrect"];
                return (
                  <React.Fragment key={rIdx}>
                    <div className="text-[10px] text-slate-400 font-bold p-2 text-right flex items-center justify-end">
                      {rowLabels[rIdx]}
                    </div>
                    {row.map((cell, cIdx) => {
                      const isDiagonal = rIdx === cIdx;
                      return (
                        <div
                          key={cIdx}
                          className={`p-3 rounded-lg font-mono font-bold text-sm ${
                            isDiagonal 
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                              : cell > 0 
                                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' 
                                : 'bg-slate-900/60 text-slate-500 border border-slate-800'
                          }`}
                        >
                          {cell}
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-4 text-center">
              Diagonal cells indicate perfect categorization agreement.
            </p>
          </div>
        </div>
      </div>

      {/* Domain-Wise Performance Bar Chart */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Domain-Specific Calibration: MAE and Accuracy Matrix
          </h3>
          <p className="text-xs text-slate-400">
            Performance breakdown across technical domains (DSA, Python, Java, SQL, DBMS, OS)
          </p>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={metrics.domain_breakdown} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="domain" stroke="#64748B" fontSize={11} />
              <YAxis stroke="#64748B" fontSize={11} domain={[0, 100]} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#1E293B', borderRadius: '12px', fontSize: '12px' }} 
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="accuracy" name="Classification Accuracy (%)" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="consistency" name="Consistency Score (%)" fill="#6366F1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model Version History Table */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800/80">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Model Version Calibration History
          </h3>
          <p className="text-xs text-slate-400">Benchmark progression across fine-tuned checkpoints</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800/80">
              <tr>
                <th className="px-5 py-3.5">Model Version / Checkpoint</th>
                <th className="px-5 py-3.5">Foundation Architecture</th>
                <th className="px-5 py-3.5">MAE (pts)</th>
                <th className="px-5 py-3.5">Accuracy (%)</th>
                <th className="px-5 py-3.5">Deployment Status</th>
                <th className="px-5 py-3.5 text-right">Release Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {metrics.model_version_history?.map((m, idx) => (
                <tr key={idx} className="hover:bg-slate-850/40 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-white">{m.version}</td>
                  <td className="px-5 py-3.5 font-mono text-indigo-400">{m.base_model}</td>
                  <td className="px-5 py-3.5 font-mono text-emerald-400">{m.mae} pts</td>
                  <td className="px-5 py-3.5 font-mono text-slate-200">{m.accuracy}%</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={m.status === 'active_production' ? 'emerald' : 'primary'} size="xs">
                      {m.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right text-slate-500">{m.release_date || '2026-11'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
