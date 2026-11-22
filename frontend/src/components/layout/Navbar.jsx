import React, { useState, useEffect } from 'react';
import { Menu, Sun, Moon, Sparkles, RefreshCw, Database } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { settingsApi, seedApi } from '../../services/api';
import { Badge } from '../common/Badge';

export const Navbar = ({ onOpenSidebar }) => {
  const { isDark, toggleTheme } = useTheme();
  const [engineStatus, setEngineStatus] = useState({ mock_ai_mode: true, model: 'Semantic Engine' });
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await settingsApi.get();
        setEngineStatus({
          mock_ai_mode: res.data.mock_ai_mode,
          model: res.data.mock_ai_mode ? 'Semantic Engine' : res.data.openai_model
        });
      } catch (e) {
        // quiet fallback
      }
    };
    fetchStatus();
  }, []);

  const handleQuickSeed = async () => {
    if (window.confirm("Reload demonstration scenarios? This will reset demo candidate cases with real-world bias detection flags.")) {
      setIsSeeding(true);
      try {
        await seedApi.seed();
        window.location.reload();
      } catch (e) {
        alert("Failed to seed: " + e.message);
      } finally {
        setIsSeeding(false);
      }
    }
  };

  return (
    <header className="sticky top-0 z-20 h-16 bg-[#0B0F19]/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="lg:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Engine Live Status Pill */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-slate-400">AI Evaluation:</span>
          <span className="font-medium text-slate-200">
            {engineStatus.mock_ai_mode ? 'Domain Semantic NLP' : `OpenAI (${engineStatus.model})`}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Reset / Demo seed button */}
        <button
          onClick={handleQuickSeed}
          disabled={isSeeding}
          title="Reload Demo Data"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin text-purple-400' : ''}`} />
          <span className="hidden md:inline">{isSeeding ? 'Seeding...' : 'Reload Demo Data'}</span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="p-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800/60 transition-colors"
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-purple-400" />}
        </button>
      </div>
    </header>
  );
};
