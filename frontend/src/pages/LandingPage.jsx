import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  ShieldCheck, 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Cpu, 
  Brain, 
  Scale, 
  BarChart, 
  Terminal,
  Zap,
  Lock
} from 'lucide-react';
import { Badge } from '../components/common/Badge';

export const LandingPage = () => {
  const [activeTab, setActiveTab] = useState(0);

  const demoScenarios = [
    {
      title: "Overlooked Alternative Approach",
      domain: "DSA / Algorithms",
      question: "Find two numbers in an array that sum to target. What is the trade-off?",
      candidateAnswer: "In our memory-constrained embedded system, allocating an auxiliary hash map of O(N) isn't acceptable. By sorting the array in O(n log n), we can use a two-pointer pass (left/right) to achieve strict O(1) space complexity.",
      interviewerScore: 3.5,
      interviewerNote: "Candidate didn't use the standard Hash Map approach as asked. Minus points.",
      aiScore: 8.6,
      biasFlag: "Alternative Approach Overlooked (High Severity)",
      aiInsight: "Candidate demonstrated algorithmic maturity by justifying Two-Pointers based on strict O(1) memory constraints. The interviewer penalized valid engineering problem-solving."
    },
    {
      title: "Strict Keyword / Fluency Bias",
      domain: "Python Core",
      question: "Explain Python's Global Interpreter Lock (GIL) and CPU parallelism.",
      candidateAnswer: "The GIL is a mutex in CPython that prevents multiple native threads from executing bytecode at once. It exists because Python manages memory by tracking how many variables point to an object. For heavy CPU work, you must spawn separate processes via multiprocessing.",
      interviewerScore: 4.5,
      interviewerNote: "Too casual. Didn't say 'reference counting' in their opening sentence.",
      aiScore: 8.4,
      biasFlag: "Strict Keyword / Phrasing Bias (High Severity)",
      aiInsight: "Candidate correctly described the reference counting mechanism functionally. Scoring them down for stylistic phrasing constitutes keyword penalty bias."
    },
    {
      title: "Calibrated Parity",
      domain: "Java Internals",
      question: "Explain Java HashMap collision handling and the equals/hashCode contract.",
      candidateAnswer: "In Java 8, buckets are arrays of Nodes. On collision, linked lists form, which treeify into Red-Black Trees at 8 elements (O(log n)). Overriding equals() without hashCode() breaks the contract and get() fails to locate the bucket.",
      interviewerScore: 9.0,
      interviewerNote: "Very solid explanation of treeification threshold and bucket hashing.",
      aiScore: 9.4,
      biasFlag: "Calibrated & Consistent",
      aiInsight: "Both interviewer and AI evaluations align within standard calibration variance (delta: -0.4)."
    }
  ];

  const currentScenario = demoScenarios[activeTab];

  return (
    <div className="min-h-screen bg-[#080C15] text-slate-100 flex flex-col selection:bg-indigo-500/30">
      {/* Top Navigation */}
      <nav className="border-b border-slate-800/80 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-glow-brand">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">BiasGuard <span className="text-indigo-400">AI</span></span>
        </div>
        <div className="flex items-center gap-4">
          <Link 
            to="/login" 
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Sign In
          </Link>
          <Link 
            to="/login?tab=register" 
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-glow-brand"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative px-6 pt-16 pb-20 max-w-7xl mx-auto w-full flex flex-col items-center text-center">
        {/* Glow backdrop */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-indigo-500/10 blur-[120px] pointer-events-none rounded-full"></div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium mb-6">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Next-Gen Technical Interview Calibration & Evidence Engine</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-4xl leading-[1.15]">
          Eliminate Interviewer Bias. <br />
          <span className="bg-gradient-to-r from-indigo-400 via-violet-300 to-indigo-200 bg-clip-text text-transparent">
            Protect Engineering Talent.
          </span>
        </h1>

        <p className="mt-6 text-lg text-slate-400 max-w-2xl leading-relaxed">
          BiasGuard AI independently analyzes candidate responses during technical interviews. It identifies when technically correct or valid alternative answers are unfairly evaluated due to interviewer bias, inconsistent standards, or rigid keyword expectations.
        </p>

        <div className="mt-8 flex flex-wrap gap-4 justify-center">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all shadow-glow-brand hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>Launch Evaluation Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/login"
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-sm border border-slate-800 transition-colors"
          >
            <span>Try 1-Click Demo Scenarios</span>
          </Link>
        </div>

        {/* Live Interactive Simulation Widget */}
        <div className="mt-16 w-full max-w-4xl text-left bg-[#0E1526] border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-3">
            <div>
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Live Detection Benchmark</p>
              <h3 className="text-lg font-bold text-white">Compare Interviewer Judgement vs AI Technical Ground Truth</h3>
            </div>
            {/* Scenario Tabs */}
            <div className="flex gap-2">
              {demoScenarios.map((sc, idx) => (
                <button
                  key={sc.title}
                  onClick={() => setActiveTab(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === idx 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Scenario {idx + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Candidate Submission & Question */}
            <div className="lg:col-span-7 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge variant="primary">{currentScenario.domain}</Badge>
                  <span className="text-xs text-slate-400">{currentScenario.title}</span>
                </div>
                <p className="text-sm font-semibold text-slate-200">{currentScenario.question}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Candidate's Submitted Answer</p>
                <p className="text-xs text-slate-300 leading-relaxed font-mono">
                  "{currentScenario.candidateAnswer}"
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800/80">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-400">Interviewer Assigned Score:</span>
                  <span className="font-bold text-rose-400">{currentScenario.interviewerScore} / 10</span>
                </div>
                <p className="text-xs text-slate-400 italic">"{currentScenario.interviewerNote}"</p>
              </div>
            </div>

            {/* Right: BiasGuard AI Evaluation Result */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-white">BiasGuard AI Assessment</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400">AI Score: </span>
                    <span className="text-base font-black text-indigo-400">{currentScenario.aiScore} / 10</span>
                  </div>
                </div>

                {/* Bias Flag Pill */}
                <div className={`p-2.5 rounded-lg text-xs font-semibold mb-3 flex items-start gap-2 ${
                  currentScenario.biasFlag.includes("Consistent") 
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                }`}>
                  {currentScenario.biasFlag.includes("Consistent") ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <span>{currentScenario.biasFlag}</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {currentScenario.aiInsight}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Neutral human review flag</span>
                <Link to="/login" className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
                  Run Full Audit <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Pillars */}
      <section className="px-6 py-16 max-w-7xl mx-auto w-full border-t border-slate-800/80">
        <div className="text-center mb-12">
          <Badge variant="purple">Architecture & Intelligence</Badge>
          <h2 className="text-3xl font-bold text-white mt-3">Engineered for Technical Rigor</h2>
          <p className="text-slate-400 text-sm mt-2 max-w-xl mx-auto">
            Traditional scoring tools look for exact vocabulary. BiasGuard AI evaluates abstract computer science mechanics and solution trade-offs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white text-base mb-2">Technical Correctness First</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Never penalizes candidates for writing style, communication pauses, or lack of buzzwords when their algorithmic mechanics and computational complexity are sound.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-violet-500/40 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center mb-4">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white text-base mb-2">Alternative Approach Detection</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Detects valid engineering alternatives (e.g. Iterative vs Recursive, Two-Pointer vs Hash Map, Normalization vs De-normalization) overlooked by strict interviewers.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/40 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4">
              <Scale className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white text-base mb-2">Discrepancy Flags</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Surfaces evidence-based discrepancies without accusatory language, providing hiring managers with actionable calibration audit logs.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
              <BarChart className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white text-base mb-2">Explainable AI Reports</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Every score is accompanied by an itemized concept breakdown: verified strengths, factual errors, missing edge cases, and calibration recommendations.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/80 py-8 px-6 text-center text-xs text-slate-400">
        <p>© 2026 BiasGuard AI. Built for unbiased, evidence-based technical talent evaluation.</p>
      </footer>
    </div>
  );
};
