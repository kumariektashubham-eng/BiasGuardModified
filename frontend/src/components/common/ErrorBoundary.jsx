import React from 'react';
import { AlertTriangle, RefreshCw, Home, ChevronDown } from 'lucide-react';
import { formatApiError } from '../../utils/errorFormatter';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[BiasGuard AI Error Boundary caught component error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleSoftRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleHardReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleGoDashboard = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = formatApiError(this.state.error, 'An unexpected render error occurred in this view.');
      const stack = this.state.errorInfo?.componentStack || this.state.error?.stack || '';

      return (
        <div className="min-h-screen bg-[#0A0E1A] text-slate-100 flex items-center justify-center p-6 selection:bg-indigo-500/30">
          <div className="max-w-xl w-full bg-[#0F172A] border border-rose-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex items-center gap-3.5 text-rose-400">
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">Component Render Notice</h2>
                <p className="text-xs text-slate-400">BiasGuard AI Error Boundary caught an unhandled exception.</p>
              </div>
            </div>

            {/* Formatted Safe Error Message */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs text-rose-300 leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
              {errorMsg}
            </div>

            {/* Expandable Technical Diagnostics for Development */}
            {stack && (
              <details className="text-xs text-slate-400 bg-slate-950/60 rounded-xl p-3 border border-slate-800/80">
                <summary className="cursor-pointer font-medium text-slate-300 flex items-center gap-1.5 select-none hover:text-white">
                  <span>Technical Diagnostics & Stack Trace</span>
                </summary>
                <pre className="mt-2 text-[11px] font-mono text-slate-400 overflow-x-auto p-2 bg-slate-900 rounded-lg max-h-48 overflow-y-auto">
                  {stack}
                </pre>
              </details>
            )}

            <p className="text-xs text-slate-400 leading-relaxed">
              You can retry rendering the component, navigate back to the dashboard, or reload the page.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={this.handleSoftRetry}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-glow-brand cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try Again
              </button>

              <button
                type="button"
                onClick={this.handleHardReload}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload Page
              </button>

              <button
                type="button"
                onClick={this.handleGoDashboard}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
