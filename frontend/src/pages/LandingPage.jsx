import React from 'react';
import { Link } from 'react-router-dom';
import { 
  CheckCircle, 
  ArrowRight, 
  Terminal, 
  FileText, 
  Shield, 
  Code, 
  Database,
  Award,
  Users
} from 'lucide-react';

export const LandingPage = () => {
  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#212529] flex flex-col font-sans">
      {/* GeeksforGeeks / University Style Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-[#2F855A] flex items-center justify-center text-white font-bold text-lg">
              BG
            </div>
            <div>
              <span className="font-bold text-lg text-[#1e3a29] tracking-tight">BiasGuard Portal</span>
              <span className="hidden sm:inline-block ml-2 text-xs text-gray-500 font-mono border-l border-gray-300 pl-2">
                BIT Mesra Minor Project
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Link 
              to="/login"
              className="px-4 py-2 text-sm font-semibold text-[#2F855A] hover:bg-green-50 rounded border border-[#2F855A] transition-colors"
            >
              Sign In
            </Link>
            <Link 
              to="/dashboard"
              className="px-4 py-2 text-sm font-semibold text-white bg-[#2F855A] hover:bg-[#276749] rounded transition-colors"
            >
              Open Workspace
            </Link>
          </div>
        </div>
      </header>

      {/* Main Body Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full">
        {/* Banner Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 mb-8 shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <span className="inline-block bg-green-100 text-[#2F855A] text-xs font-bold px-2.5 py-1 rounded mb-3">
                DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight leading-snug">
                Dual-Track Technical Interview Evaluation & Calibration System
              </h1>
              <p className="mt-3 text-sm sm:text-base text-gray-600 leading-relaxed">
                BiasGuard records and transcribes candidate verbal explanations during technical DSA interviews. 
                It compares the human panelist's score with an independent NLP rubric benchmark to prevent subjective marking bias and candidate anchoring.
              </p>
            </div>
            
            <div className="flex flex-col gap-2 w-full md:w-auto">
              <Link
                to="/dashboard"
                className="w-full text-center px-5 py-2.5 bg-[#2F855A] hover:bg-[#276749] text-white font-semibold text-sm rounded shadow-sm transition-colors"
              >
                Go to Evaluator Dashboard →
              </Link>
              <Link
                to="/login"
                className="w-full text-center px-5 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                1-Click Demo Logins
              </Link>
            </div>
          </div>
        </div>

        {/* Technical Modules Grid */}
        <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#2F855A]" />
          Platform Modules & Functional Overview
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:border-[#2F855A] transition-colors">
            <div className="flex items-center gap-2.5 text-[#2F855A] font-bold text-sm mb-2">
              <Code className="w-5 h-5" />
              1. Live Interview Capture
            </div>
            <p className="text-xs text-gray-600 leading-normal">
              Candidate joins with a secure 32-byte token. Audio is captured via browser Web Audio API, while interviewer pushes questions in real time.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:border-[#2F855A] transition-colors">
            <div className="flex items-center gap-2.5 text-[#2F855A] font-bold text-sm mb-2">
              <Database className="w-5 h-5" />
              2. Double-Blind Sealing
            </div>
            <p className="text-xs text-gray-600 leading-normal">
              Groq Whisper transcribes speech into text. Semantic NLP grades technical concepts and locks scores in MongoDB until human submission.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:border-[#2F855A] transition-colors">
            <div className="flex items-center gap-2.5 text-[#2F855A] font-bold text-sm mb-2">
              <Award className="w-5 h-5" />
              3. Variance Calibration
            </div>
            <p className="text-xs text-gray-600 leading-normal">
              System calculates Δ = S_ai - S_human. Any discrepancy ≥ 2.5 points triggers a calibration flag for HOD/panel review.
            </p>
          </div>
        </div>

        {/* Real Sample Calibration Cases Table (GFG Documentation Style) */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-8">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">
              Benchmark Verification Cases (Campus Recruitment Dataset)
            </h3>
            <span className="text-xs text-gray-500 font-mono">Sample Size: N=40</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-gray-100/70 text-gray-600 font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5">Domain</th>
                  <th className="px-4 py-2.5">Question Topic</th>
                  <th className="px-4 py-2.5">Human Mark</th>
                  <th className="px-4 py-2.5">AI Mark</th>
                  <th className="px-4 py-2.5">Delta</th>
                  <th className="px-4 py-2.5">Calibration Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-sans font-medium text-gray-900">DSA</td>
                  <td className="px-4 py-3 font-sans">Two Sum (In-place Two-Pointer)</td>
                  <td className="px-4 py-3 text-red-600 font-bold">3.5 / 10</td>
                  <td className="px-4 py-3 text-green-700 font-bold">8.6 / 10</td>
                  <td className="px-4 py-3 text-orange-600 font-bold">+5.1</td>
                  <td className="px-4 py-3 font-sans"><span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-[11px] font-semibold">Flagged: Overlooked Alt</span></td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-sans font-medium text-gray-900">Python</td>
                  <td className="px-4 py-3 font-sans">GIL & Thread Concurrency</td>
                  <td className="px-4 py-3 text-red-600 font-bold">4.5 / 10</td>
                  <td className="px-4 py-3 text-green-700 font-bold">8.4 / 10</td>
                  <td className="px-4 py-3 text-orange-600 font-bold">+3.9</td>
                  <td className="px-4 py-3 font-sans"><span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-[11px] font-semibold">Flagged: Phrasing Penalty</span></td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-sans font-medium text-gray-900">Java</td>
                  <td className="px-4 py-3 font-sans">HashMap Collision & Treeify</td>
                  <td className="px-4 py-3 text-green-700 font-bold">9.0 / 10</td>
                  <td className="px-4 py-3 text-green-700 font-bold">9.4 / 10</td>
                  <td className="px-4 py-3 text-gray-600 font-bold">-0.4</td>
                  <td className="px-4 py-3 font-sans"><span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-[11px] font-semibold">Normal Variance</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Academic Project Credits Footer */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-xs text-gray-500 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <span className="font-semibold text-gray-700">Project Guide:</span> Dr. Pankaj Gupta, Assistant Professor, Dept. of CSE
          </div>
          <div>
            <span className="font-semibold text-gray-700">Team:</span> Dipraa Arora | Kumari Ekta Shubham | Pinky Jain
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-500">
        Birla Institute of Technology, Mesra — Off-Campus Jaipur | Session: Monsoon 2026 (MO-2026)
      </footer>
    </div>
  );
};
