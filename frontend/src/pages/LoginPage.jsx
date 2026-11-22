import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ShieldCheck, Lock, Mail, User, ArrowRight, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatApiError } from '../utils/errorFormatter';

export const LoginPage = () => {
  const [searchParams] = useSearchParams();
  const [isRegister, setIsRegister] = useState(searchParams.get('tab') === 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('interviewer');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        if (!name.trim()) throw new Error('Full name is required.');
        await register({ name, email, password, role });
      } else {
        await login(email, password);
      }
      navigate('/dashboard');
    } catch (err) {
      setError(formatApiError(err, 'Authentication failed. Please verify credentials.'));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (demoEmail, demoPw) => {
    setError('');
    setLoading(true);
    try {
      await login(demoEmail, demoPw);
      navigate('/dashboard');
    } catch (err) {
      setError('Quick login failed: ' + formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-4 selection:bg-green-100 selection:text-green-800">
      {/* Brand Header */}
      <Link to="/" className="mb-6 flex flex-col items-center text-center group">
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="w-10 h-10 rounded bg-[#2F855A] flex items-center justify-center text-white font-bold text-sm shadow-sm group-hover:bg-[#276749] transition-colors">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-2xl tracking-tight text-gray-900">
            BiasGuard <span className="text-[#2F855A]">AI</span>
          </span>
        </div>
        <p className="text-xs text-gray-600 font-medium">Dual-Track Technical Interview Evaluation & Calibration</p>
        <p className="text-[11px] text-gray-500 font-mono mt-0.5">Birla Institute of Technology, Mesra · MO-2026</p>
      </Link>

      {/* Main Authentication Card */}
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-lg p-6 sm:p-8 shadow-sm">
        {/* Quick Demo Logins Box */}
        <div className="mb-6 p-4 rounded border border-green-200 bg-green-50/60">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-[#2F855A]" />
              <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                Quick Demo Access (1-Click)
              </span>
            </div>
            <span className="text-[10px] bg-green-100 text-[#2F855A] font-semibold px-1.5 py-0.5 rounded">
              Pre-seeded
            </span>
          </div>
          <p className="text-[11px] text-gray-600 mb-3">
            Click an authorized role below to sign in instantly with benchmark privileges:
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickLogin('interviewer@biasguard.ai', 'password123')}
              className="py-2.5 px-3 rounded bg-[#2F855A] hover:bg-[#276749] text-white text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-98"
            >
              <span>Interviewer</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-80" />
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickLogin('admin@biasguard.ai', 'admin123')}
              className="py-2.5 px-3 rounded bg-gray-800 hover:bg-gray-900 text-white text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-98"
            >
              <span>Administrator</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-80" />
            </button>
          </div>
        </div>

        {/* Auth Toggle Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            type="button"
            onClick={() => { setIsRegister(false); setError(''); }}
            className={`flex-1 pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${
              !isRegister ? 'border-[#2F855A] text-[#2F855A]' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setError(''); }}
            className={`flex-1 pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${
              isRegister ? 'border-[#2F855A] text-[#2F855A]' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Register Evaluator
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-xs leading-relaxed">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Rivera"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-[#2F855A] focus:border-[#2F855A] transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                placeholder="name@organization.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-[#2F855A] focus:border-[#2F855A] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-[#2F855A] focus:border-[#2F855A] transition-colors"
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                Platform Role
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('interviewer')}
                  className={`p-2.5 rounded text-xs font-semibold border text-center transition-all cursor-pointer ${
                    role === 'interviewer'
                      ? 'bg-green-50 border-[#2F855A] text-[#2F855A]'
                      : 'bg-white border-gray-300 text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Technical Interviewer
                </button>
                <button
                  type="button"
                  onClick={() => setRole('admin')}
                  className={`p-2.5 rounded text-xs font-semibold border text-center transition-all cursor-pointer ${
                    role === 'admin'
                      ? 'bg-green-50 border-[#2F855A] text-[#2F855A]'
                      : 'bg-white border-gray-300 text-gray-600 hover:text-gray-900'
                  }`}
                >
                  System Administrator
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded bg-[#2F855A] hover:bg-[#276749] text-white font-semibold text-sm transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span>{isRegister ? 'Register Authorized Evaluator' : 'Sign In to Portal'}</span>
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] text-gray-500">
          Independent Dual-Track Scoring & Cryptographic Transcript Audit Protocol
        </p>
      </div>

      <div className="mt-6 text-center text-xs text-gray-500">
        Birla Institute of Technology, Mesra · Off-Campus Jaipur
      </div>
    </div>
  );
};
