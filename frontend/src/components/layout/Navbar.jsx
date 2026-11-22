import React, { useState, useEffect } from 'react';
import { Menu, RefreshCw, Terminal, CheckCircle2 } from 'lucide-react';
import { settingsApi, seedApi } from '../../services/api';

export const Navbar = ({ onOpenSidebar }) => {
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
    if (window.confirm("Reload benchmark test cases? This populates sample DSA & Python interview records.")) {
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
    <header className="sticky top-0 z-20 h-14 bg-white border-b border-gray-200 px-4 sm:px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="lg:hidden p-1.5 text-gray-600 hover:text-gray-900 rounded hover:bg-gray-100"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Technical Engine Status Pill */}
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded bg-gray-100 border border-gray-200 text-xs font-mono text-gray-700">
          <span className="h-2 w-2 rounded-full bg-[#2F855A]"></span>
          <span className="text-gray-500">Evaluation Engine:</span>
          <span className="font-semibold text-gray-900">
            {engineStatus.mock_ai_mode ? 'Domain Semantic NLP' : `OpenAI (${engineStatus.model})`}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleQuickSeed}
          disabled={isSeeding}
          title="Reload Test Records"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-300 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#2F855A] ${isSeeding ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">{isSeeding ? 'Populating...' : 'Reset Test Data'}</span>
        </button>

        <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">
          BIT Mesra (MO-2026)
        </span>
      </div>
    </header>
  );
};
