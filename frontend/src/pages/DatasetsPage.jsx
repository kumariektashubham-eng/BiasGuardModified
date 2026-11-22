import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Upload, 
  Download, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Filter, 
  FileText, 
  Trash2, 
  Sparkles,
  ExternalLink,
  Check,
  X
} from 'lucide-react';
import { datasetsApi } from '../services/api';
import { Badge } from '../components/common/Badge';
import { formatApiError } from '../utils/errorFormatter';

const DOMAINS = ["ALL", "DSA", "Python", "Java", "SQL", "DBMS", "Operating Systems"];

export const DatasetsPage = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStats, setUploadStats] = useState(null);

  // New Item Form State
  const [newItem, setNewItem] = useState({
    domain: "DSA",
    question_text: "",
    candidate_answer: "",
    expert_score: 8.5,
    correctness_label: "correct",
    expert_explanation: "",
    expected_concepts: "Two-pointer pass; O(1) space",
    alternative_approaches: "Sorting approach",
    validated: true
  });

  useEffect(() => {
    loadDataset();
  }, [selectedDomain, search]);

  const loadDataset = async () => {
    setLoading(true);
    try {
      const res = await datasetsApi.list({ domain: selectedDomain, search });
      const data = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setItems(data);
    } catch (err) {
      console.error("Failed to load datasets", err);
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async (id) => {
    try {
      await datasetsApi.validate(id);
      loadDataset();
    } catch (err) {
      alert("Validation failed: " + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this training example from the dataset?")) {
      try {
        await datasetsApi.delete(id);
        loadDataset();
      } catch (err) {
        alert("Delete failed: " + err.message);
      }
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newItem,
        expert_score: parseFloat(newItem.expert_score),
        expected_concepts: newItem.expected_concepts.split(';').map(s => s.trim()).filter(Boolean),
        expected_criteria: newItem.expected_concepts.split(';').map(s => s.trim()).filter(Boolean),
        alternative_approaches: newItem.alternative_approaches ? newItem.alternative_approaches.split(';').map(s => s.trim()).filter(Boolean) : []
      };
      await datasetsApi.create(payload);
      setShowAddModal(false);
      loadDataset();
    } catch (err) {
      alert("Error creating dataset item: " + err.message);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadStats(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      let res;
      if (file.name.endsWith('.json')) {
        res = await datasetsApi.uploadJson(formData);
      } else if (file.name.endsWith('.csv')) {
        res = await datasetsApi.uploadCsv(formData);
      } else {
        alert("Please upload a .json or .csv file.");
        setUploading(false);
        return;
      }
      setUploadStats(res.data);
      loadDataset();
    } catch (err) {
      alert("Upload failed: " + formatApiError(err));
    } finally {
      setUploading(false);
    }
  };

  const validatedCount = items.filter(i => i.validated).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Database className="w-6 h-6 text-indigo-400" />
            Dataset Management & Ground Truth
          </h1>
          <p className="text-xs text-slate-400">
            Store, audit, and curate expert-validated question rubrics for RAG retrieval and model fine-tuning.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>Upload JSON / CSV</span>
          </button>

          <a
            href={datasetsApi.exportJsonlUrl('train', 0.2)}
            download
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export Training JSONL</span>
          </a>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-glow-brand"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Example</span>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Total Dataset Items
          </span>
          <span className="text-2xl font-black text-white">{items.length}</span>
          <p className="text-[11px] text-slate-400 mt-0.5">Across {DOMAINS.length - 1} domains</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Expert Validated Examples
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400">{validatedCount}</span>
            <span className="text-xs text-slate-400">({items.length ? Math.round((validatedCount / items.length) * 100) : 0}%)</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Approved for RAG & Fine-Tuning</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Vector Embeddings Active
          </span>
          <span className="text-2xl font-black text-indigo-400">Indexed</span>
          <p className="text-[11px] text-slate-400 mt-0.5">MongoDB Vector Search Ready</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Domain Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {DOMAINS.map(d => (
            <button
              key={d}
              onClick={() => setSelectedDomain(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedDomain === d 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search questions or answers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-56 sm:w-64"
          />
        </div>
      </div>

      {/* Dataset Items Table */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Loading training dataset...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            No training examples found in this category.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800/80">
                <tr>
                  <th className="px-5 py-3.5">Domain</th>
                  <th className="px-5 py-3.5">Question & Answer Sample</th>
                  <th className="px-5 py-3.5">Expert Score</th>
                  <th className="px-5 py-3.5">Correctness</th>
                  <th className="px-5 py-3.5">Validation</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-850/40 transition-colors">
                    <td className="px-5 py-4 align-top">
                      <Badge variant="primary" size="xs">{item.domain}</Badge>
                    </td>

                    <td className="px-5 py-4 max-w-md">
                      <p className="font-semibold text-slate-200 text-xs mb-1 line-clamp-1">{item.question_text}</p>
                      <p className="text-[11px] text-slate-400 font-mono line-clamp-2 bg-slate-950 p-1.5 rounded border border-slate-800">
                        "{item.candidate_answer}"
                      </p>
                      {item.expected_concepts?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {item.expected_concepts.slice(0, 3).map((c, i) => (
                            <span key={i} className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4 align-top">
                      <span className="text-sm font-black text-indigo-400">{item.expert_score}</span>
                      <span className="text-[10px] text-slate-400"> / 10</span>
                    </td>

                    <td className="px-5 py-4 align-top">
                      <Badge 
                        variant={
                          item.correctness_label === 'correct' ? 'emerald' :
                          item.correctness_label === 'alternative_valid_approach' ? 'purple' :
                          item.correctness_label === 'partially_correct' ? 'amber' : 'rose'
                        } 
                        size="xs"
                      >
                        {item.correctness_label}
                      </Badge>
                    </td>

                    <td className="px-5 py-4 align-top">
                      {item.validated ? (
                        <span className="inline-flex items-center text-[11px] font-semibold text-emerald-400 gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                        </span>
                      ) : (
                        <button
                          onClick={() => handleValidate(item.id)}
                          className="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-semibold transition-colors"
                        >
                          Approve
                        </button>
                      )}
                    </td>

                    <td className="px-5 py-4 text-right align-top">
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                        title="Delete Example"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-400" /> Upload Dataset File
              </h3>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Upload a <strong>JSON</strong> or <strong>CSV</strong> file containing technical interview questions, candidate answers, and expert scores.
            </p>

            <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-6 text-center cursor-pointer transition-colors relative">
              <input
                type="file"
                accept=".json,.csv"
                onChange={handleFileUpload}
                disabled={uploading}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Upload className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-200">
                {uploading ? "Ingesting & indexing dataset..." : "Click or drag & drop .json / .csv here"}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">Sample files included in repository data/ folder</p>
            </div>

            {uploadStats && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs space-y-1">
                <p className="font-bold">✓ Successfully Imported {uploadStats.successfully_imported} Examples!</p>
                <p className="text-[11px] text-emerald-400">Total parsed: {uploadStats.total_parsed}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Add Training Example</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Domain</label>
                <select
                  value={newItem.domain}
                  onChange={(e) => setNewItem({ ...newItem, domain: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
                >
                  {DOMAINS.filter(d => d !== 'ALL').map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Technical Question</label>
                <textarea
                  rows={2}
                  required
                  value={newItem.question_text}
                  onChange={(e) => setNewItem({ ...newItem, question_text: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Candidate Answer</label>
                <textarea
                  rows={3}
                  required
                  value={newItem.candidate_answer}
                  onChange={(e) => setNewItem({ ...newItem, candidate_answer: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Expert Score (0-10)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="10"
                    value={newItem.expert_score}
                    onChange={(e) => setNewItem({ ...newItem, expert_score: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Correctness Label</label>
                  <select
                    value={newItem.correctness_label}
                    onChange={(e) => setNewItem({ ...newItem, correctness_label: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
                  >
                    <option value="correct">correct</option>
                    <option value="alternative_valid_approach">alternative_valid_approach</option>
                    <option value="partially_correct">partially_correct</option>
                    <option value="incorrect">incorrect</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Expected Concepts (Semicolon separated)</label>
                <input
                  type="text"
                  value={newItem.expected_concepts}
                  onChange={(e) => setNewItem({ ...newItem, expected_concepts: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Expert Technical Explanation</label>
                <textarea
                  rows={2}
                  required
                  value={newItem.expert_explanation}
                  onChange={(e) => setNewItem({ ...newItem, expert_explanation: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  Save Training Example
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
