import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Settings,
  Key,
  Cpu,
  Sliders,
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Save,
  HelpCircle,
  Mic,
  Volume2,
  BarChart3,
  MessageSquare,
  Target,
  Scale,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { settingsApi, seedApi } from '../services/api';
import { Badge } from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { formatApiError } from '../utils/errorFormatter';

export const SettingsPage = () => {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testingGroq, setTestingGroq] = useState(false);
  const [groqTestResult, setGroqTestResult] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form states
  const [apiKey, setApiKey] = useState('');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [transcriptionProvider, setTranscriptionProvider] = useState('groq');
  const [model, setModel] = useState('gpt-4o-mini');
  const [mockMode, setMockMode] = useState(true);
  const [threshold, setThreshold] = useState(2.5);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await settingsApi.get();
      setSettings(res.data);
      setModel(res.data.openai_model || 'gpt-4o-mini');
      setMockMode(res.data.mock_ai_mode ?? true);
      setThreshold(res.data.bias_score_delta_threshold ?? 2.5);
      setTranscriptionProvider(res.data.transcription_provider || 'groq');
    } catch (err) {
      console.error("Error loading system settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const payload = {
        openai_model: model,
        mock_ai_mode: mockMode,
        bias_score_delta_threshold: parseFloat(threshold),
        transcription_provider: transcriptionProvider
      };
      if (apiKey.trim()) {
        payload.openai_api_key = apiKey.trim();
      }
      if (groqApiKey.trim()) {
        payload.groq_api_key = groqApiKey.trim();
      }
      await settingsApi.update(payload);
      setSaveSuccess(true);
      setApiKey('');
      setGroqApiKey('');
      await loadSettings();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert("Failed to save settings: " + formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleTestAI = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await settingsApi.testAI();
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ status: 'error', message: formatApiError(err) });
    } finally {
      setTesting(false);
    }
  };

  const handleTestGroq = async () => {
    setTestingGroq(true);
    setGroqTestResult(null);
    try {
      const res = await settingsApi.testGroq();
      setGroqTestResult(res.data);
    } catch (err) {
      setGroqTestResult({ status: 'error', message: err.message });
    } finally {
      setTestingGroq(false);
    }
  };

  const handleReloadDemo = async () => {
    if (window.confirm("Reload default demonstration scenarios? This will refresh demo candidate cases with real-world bias flags.")) {
      try {
        await seedApi.seed();
        alert("Demonstration scenarios successfully reloaded!");
      } catch (err) {
        alert("Error re-seeding: " + err.message);
      }
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        Loading system configuration...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-400" />
          System & AI Engine Settings
        </h1>
        <p className="text-xs text-slate-400">
          Configure Groq Speech-to-Text transcription, OpenAI evaluation, bias sensitivity thresholds, and offline modes.
        </p>
      </div>

      {saveSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Settings successfully saved and applied to the BiasGuard engine.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Groq Speech-to-Text Configuration */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Mic className="w-4 h-4 text-emerald-400" />
              Groq Speech-to-Text (Candidate Voice Transcription)
            </h2>
            <Badge variant={settings?.has_groq_key ? 'emerald' : 'amber'} size="xs">
              {settings?.has_groq_key ? `Groq Active (${settings?.groq_model || 'whisper-large-v3'})` : 'Missing Groq API Key'}
            </Badge>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Groq accelerates candidate voice answer transcription using the ultra-fast <strong>whisper-large-v3</strong> model with sub-second latency. The original candidate audio file is securely preserved on disk and linked in MongoDB for interview replay.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Groq API Key {settings?.masked_groq_key && `(Current: ${settings.masked_groq_key})`}
              </label>
              <input
                type="password"
                placeholder="gsk_..."
                value={groqApiKey}
                onChange={(e) => setGroqApiKey(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Active Speech-to-Text Provider</label>
              <select
                value={transcriptionProvider}
                onChange={(e) => setTranscriptionProvider(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="groq">Groq (whisper-large-v3) - High-speed transcription [Recommended]</option>
                <option value="openai">OpenAI (whisper-1) - Standard fallback</option>
              </select>
            </div>
          </div>

          {/* Groq Connection Test Button & Output */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleTestGroq}
              disabled={testingGroq}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>{testingGroq ? 'Testing Groq API...' : 'Test Groq Speech-to-Text'}</span>
            </button>

            {groqTestResult && (
              <span className={`text-xs ${groqTestResult.status === 'connected' ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                {groqTestResult.message}
              </span>
            )}
          </div>
        </div>

        {/* OpenAI Configuration */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-400" />
              OpenAI API Integration (AI Technical Evaluation & RAG)
            </h2>
            <Badge variant={settings?.has_openai_key ? 'emerald' : 'amber'} size="xs">
              {settings?.has_openai_key ? 'API Key Configured' : 'Offline Semantic Mode Active'}
            </Badge>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Provide an OpenAI API key for live GPT-4o evaluation. If left empty, BiasGuard runs in
            <strong> Domain-Aware Offline Semantic Mode</strong>, using internal natural language heuristics, concept extraction, and complexity checkers without incurring external API costs.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              OpenAI API Key {settings?.masked_api_key && `(Current: ${settings.masked_api_key})`}
            </label>
            <input
              type="password"
              placeholder="sk-proj-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-xs font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">AI Model Selection</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="gpt-4o-mini">gpt-4o-mini (Recommended for Speed & Cost)</option>
                <option value="gpt-4o">gpt-4o (Deep Architectural Analysis)</option>
                <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Evaluation Execution Mode</label>
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setMockMode(!mockMode)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${mockMode
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                >
                  {mockMode ? '✓ Mock / Offline Semantic NLP' : 'Live OpenAI Calls'}
                </button>
                <span className="text-[11px] text-slate-400">
                  {mockMode ? 'Safe for college & hackathon demos' : 'Requires active OpenAI quota'}
                </span>
              </div>
            </div>
          </div>

          {/* Connection Test Button & Output */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleTestAI}
              disabled={testing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>{testing ? 'Testing Connection...' : 'Test AI Engine Connection'}</span>
            </button>

            {testResult && (
              <span className={`text-xs ${testResult.status === 'connected' ? 'text-emerald-400' : 'text-slate-300'
                }`}>
                {testResult.message}
              </span>
            )}
          </div>
        </div>

        {/* Bias Detection Calibration Threshold */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              Bias Sensitivity Threshold
            </h2>
            <span className="text-sm font-black text-indigo-400">{threshold} pts</span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Sets the minimum score divergence (|Interviewer Score - AI Technical Score|) required to flag an evaluation as a potential discrepancy. Default is <strong>2.5 points</strong>.
          </p>

          <input
            type="range"
            min="1.0"
            max="4.5"
            step="0.5"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-full accent-indigo-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>1.0 pt (Ultra Sensitive)</span>
            <span>2.5 pts (Standard Calibration)</span>
            <span>4.5 pts (Conservative)</span>
          </div>
        </div>

        {/* Database & Infrastructure */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              Database & Environment Health
            </h2>
            <Badge variant="emerald" size="xs">Connected & Active</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Database Cluster</span>
              <span className="text-slate-200 font-mono font-medium">{settings?.mongodb_uri_masked}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Database Name</span>
              <span className="text-slate-200 font-mono font-medium">{settings?.database_name}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">Demo Scenario Reset:</span>
            <button
              type="button"
              onClick={handleReloadDemo}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
            >
              Reset & Reload Demonstration Scenarios
            </button>
          </div>
        </div>

        {/* Save Bar */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/25 active:scale-[0.99]"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save System Settings'}</span>
          </button>
        </div>
      </form>

      {/* Advanced AI Administration (Administrator Only - Low Visual Emphasis) */}
      {isAdmin && (
        <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                Advanced AI Administration & Calibration
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Administrator tools for RAG datasets, model fine-tuning, fairness audit testing, and platform telemetry.
              </p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono border border-purple-500/20">
              Admin Area
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Link
              to="/datasets"
              className="p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5">
                <Database className="w-4 h-4 text-slate-400 group-hover:text-purple-400" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">Dataset Management</h4>
                  <p className="text-[10px] text-slate-400">RAG reference corpora</p>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400" />
            </Link>

            <Link
              to="/feedback"
              className="p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-4 h-4 text-slate-400 group-hover:text-purple-400" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">Human Feedback</h4>
                  <p className="text-[10px] text-slate-400">Interviewer review submissions</p>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400" />
            </Link>

            <Link
              to="/training"
              className="p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5">
                <Cpu className="w-4 h-4 text-slate-400 group-hover:text-purple-400" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">Model Training</h4>
                  <p className="text-[10px] text-slate-400">Fine-tuning pipelines</p>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400" />
            </Link>

            <Link
              to="/performance"
              className="p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5">
                <Target className="w-4 h-4 text-slate-400 group-hover:text-purple-400" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">Model Performance</h4>
                  <p className="text-[10px] text-slate-400">Evaluation accuracy & latency</p>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400" />
            </Link>

            <Link
              to="/fairness"
              className="p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5">
                <Scale className="w-4 h-4 text-slate-400 group-hover:text-purple-400" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">Fairness Testing</h4>
                  <p className="text-[10px] text-slate-400">Bias audit benchmark suite</p>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400" />
            </Link>

            <Link
              to="/analytics"
              className="p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-slate-400 group-hover:text-purple-400" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">Analytics & Insights</h4>
                  <p className="text-[10px] text-slate-400">Aggregated system metrics</p>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
