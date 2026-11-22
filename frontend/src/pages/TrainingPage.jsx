import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  GitBranch, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Clock, 
  FileCode, 
  Sliders, 
  RefreshCw,
  Sparkles,
  Download
} from 'lucide-react';
import { trainingApi, datasetsApi } from '../services/api';
import { Badge } from '../components/common/Badge';
import { formatApiError } from '../utils/errorFormatter';

export const TrainingPage = () => {
  const [prepData, setPrepData] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [valSplit, setValSplit] = useState(0.2);
  const [baseModel, setBaseModel] = useState("gpt-4o-mini-2024-07-18");
  const [epochs, setEpochs] = useState(3);
  const [activeTab, setActiveTab] = useState("pipeline"); // pipeline vs jsonl

  useEffect(() => {
    loadPipelineData();
  }, [valSplit]);

  const loadPipelineData = async () => {
    try {
      const [prepRes, jobsRes] = await Promise.all([
        trainingApi.prepare({ validation_split: valSplit, require_validated_only: false }),
        trainingApi.getJobs()
      ]);
      setPrepData(prepRes.data);
      setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : []);
    } catch (err) {
      console.error("Training data load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchFineTune = async () => {
    if (!window.confirm(`Initiate calibration and fine-tuning on ${prepData?.train_count || 0} training examples with base model ${baseModel}?`)) {
      return;
    }
    setSubmitting(true);
    try {
      await trainingApi.fineTune({
        base_model: baseModel,
        validation_split: valSplit,
        hyperparameters: { n_epochs: parseInt(epochs) },
        job_label: "biasguard-calibration"
      });
      alert("Fine-Tuning job launched & registered successfully!");
      loadPipelineData();
    } catch (err) {
      alert("Fine-tuning launch failed: " + formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        Inspecting dataset readiness and fine-tuning registry...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Cpu className="w-6 h-6 text-indigo-400" />
            Model Training & Fine-Tuning Pipeline
          </h1>
          <p className="text-xs text-slate-400">
            Preprocess expert-reviewed datasets, generate standard Chat Completion JSONL, and fine-tune calibrated models.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={datasetsApi.exportJsonlUrl('train', valSplit)}
            download
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>Download train.jsonl</span>
          </a>

          <button
            onClick={loadPipelineData}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Refresh Status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dataset Validation & Readiness Audit */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            Dataset Preprocessing & Readiness Audit
          </h2>
          <Badge variant={prepData?.is_ready_for_fine_tuning ? 'emerald' : 'amber'} size="xs">
            {prepData?.is_ready_for_fine_tuning ? 'Ready for Training' : 'Awaiting More Examples'}
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Eligible Ground Truth
            </span>
            <span className="text-2xl font-black text-white">{prepData?.total_eligible_examples || 0}</span>
            <span className="text-[10px] text-slate-500 block">examples</span>
          </div>

          <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-center">
            <span className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider block mb-1">
              Train Partition
            </span>
            <span className="text-2xl font-black text-indigo-400">{prepData?.train_count || 0}</span>
            <span className="text-[10px] text-slate-500 block">({Math.round((1 - valSplit) * 100)}%)</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Validation Partition
            </span>
            <span className="text-2xl font-black text-slate-300">{prepData?.validation_count || 0}</span>
            <span className="text-[10px] text-slate-500 block">({Math.round(valSplit * 100)}%)</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Avg Answer Length
            </span>
            <span className="text-2xl font-black text-slate-300">{prepData?.avg_answer_length_chars || 0}</span>
            <span className="text-[10px] text-slate-500 block">chars / answer</span>
          </div>
        </div>

        {/* Domain Distribution Chips */}
        {prepData?.domains_distribution && (
          <div className="pt-2">
            <span className="text-xs font-semibold text-slate-300 block mb-2">Domain Balance in Training Set:</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(prepData.domains_distribution).map(([dom, count]) => (
                <div key={dom} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs flex items-center gap-2">
                  <span className="text-indigo-400 font-semibold">{dom}</span>
                  <span className="text-slate-400 font-mono text-[11px]">{count} examples</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Validation Warnings */}
        {prepData?.validation_warnings?.length > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
            <span className="font-bold block flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Training Advisory:
            </span>
            {prepData.validation_warnings.map((w, i) => (
              <p key={i} className="text-[11px] leading-relaxed">{w}</p>
            ))}
          </div>
        )}
      </div>

      {/* Main Split: Job Launcher & JSONL Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Fine-Tuning Execution Panel (5 Cols) */}
        <div className="lg:col-span-5 bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Launch Fine-Tuning Job
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-300 mb-1 font-medium">Base Foundation Model</label>
              <select
                value={baseModel}
                onChange={(e) => setBaseModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
              >
                <option value="gpt-4o-mini-2024-07-18">gpt-4o-mini-2024-07-18 (Recommended)</option>
                <option value="gpt-4o-2024-08-06">gpt-4o-2024-08-06</option>
                <option value="gpt-3.5-turbo-0125">gpt-3.5-turbo-0125</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-300 font-medium">Validation Split Ratio</span>
                <span className="text-indigo-400 font-mono">{Math.round(valSplit * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.4"
                step="0.05"
                value={valSplit}
                onChange={(e) => setValSplit(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-300 font-medium">Training Epochs</span>
                <span className="text-indigo-400 font-mono">{epochs} Epochs</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={epochs}
                onChange={(e) => setEpochs(parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
              Fine-tuning adjusts model weights to prioritize abstract computational mechanics over stylistic fluency, eliminating keyword bias.
            </div>

            <button
              onClick={handleLaunchFineTune}
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs transition-all shadow-glow-brand flex items-center justify-center gap-2 mt-2"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Initiating Fine-Tuning...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Execute Model Calibration Job</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* JSONL Formatted Preview (7 Cols) */}
        <div className="lg:col-span-7 bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Chat Completion JSONL Preview
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">OpenAI Fine-Tuning Spec</span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 max-h-72 overflow-y-auto">
            {prepData?.jsonl_preview?.length > 0 ? (
              <pre className="text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">
                {JSON.stringify(prepData.jsonl_preview[0], null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-slate-500 italic p-4 text-center">
                Add and validate training examples to see formatted JSONL preview.
              </p>
            )}
          </div>
          <p className="text-[10px] text-slate-500">
            Each example formats system prompts, domain rubrics, candidate answers, and calibrated JSON schema responses.
          </p>
        </div>
      </div>

      {/* Model Versions & Fine-Tuning Jobs Registry */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Model Registry & Fine-Tuning History ({jobs.length})
            </h3>
            <p className="text-xs text-slate-400">Tracked calibration experiments and deployed model versions</p>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            No fine-tuning jobs recorded yet. Launch your first calibration job above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800/80">
                <tr>
                  <th className="px-5 py-3.5">Job ID</th>
                  <th className="px-5 py-3.5">Calibrated Model Name</th>
                  <th className="px-5 py-3.5">Base Model</th>
                  <th className="px-5 py-3.5">Dataset Size</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Loss / Metrics</th>
                  <th className="px-5 py-3.5 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-850/40 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-indigo-400">{j.job_id}</td>
                    <td className="px-5 py-3.5 font-bold text-white">{j.fine_tuned_model || 'In Progress'}</td>
                    <td className="px-5 py-3.5 text-slate-400">{j.base_model}</td>
                    <td className="px-5 py-3.5 text-slate-300">{j.training_examples_count} train / {j.validation_examples_count} val</td>
                    <td className="px-5 py-3.5">
                      <Badge variant={j.status === 'succeeded' ? 'emerald' : 'amber'} size="xs">
                        {j.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-slate-300">
                      {j.metrics?.final_val_loss ? `Val Loss: ${j.metrics.final_val_loss}` : 'Calibrating'}
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-500">
                      {new Date(j.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
