import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  User, 
  Mail, 
  Briefcase, 
  Check, 
  ChevronDown, 
  Plus, 
  Users, 
  AlertCircle,
  Loader2,
  X
} from 'lucide-react';
import { candidatesApi } from '../../services/api';
import { formatApiError } from '../../utils/errorFormatter';

export const CandidateSelectDropdown = ({
  value,
  onChange,
  candidates: propCandidates = null,
  onRefresh = null,
  onOpenQuickAdd = null,
  disabled = false,
  error = ''
}) => {
  const [internalCandidates, setInternalCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Use provided candidates or fetch from API if not provided
  const candidatesList = propCandidates !== null ? propCandidates : internalCandidates;

  const loadCandidates = async () => {
    if (propCandidates !== null && onRefresh) {
      onRefresh();
      return;
    }
    setLoading(true);
    setFetchError('');
    try {
      const res = await candidatesApi.list();
      setInternalCandidates(res.data || []);
    } catch (err) {
      setFetchError(formatApiError(err, "Failed to load candidates"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (propCandidates === null) {
      loadCandidates();
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else if (!isOpen) {
      setSearchTerm('');
    }
  }, [isOpen]);

  // Deduplicate candidates by id
  const deduplicatedCandidates = React.useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const c of candidatesList || []) {
      const id = c.id || c._id;
      if (id && !seen.has(id)) {
        seen.add(id);
        result.push(c);
      }
    }
    return result;
  }, [candidatesList]);

  // Filter candidates by search term
  const filteredCandidates = React.useMemo(() => {
    if (!searchTerm.trim()) return deduplicatedCandidates;
    const term = searchTerm.toLowerCase().trim();
    return deduplicatedCandidates.filter(c => {
      const name = (c.name || '').toLowerCase();
      const email = (c.email || '').toLowerCase();
      const role = (c.target_role || '').toLowerCase();
      return name.includes(term) || email.includes(term) || role.includes(term);
    });
  }, [deduplicatedCandidates, searchTerm]);

  // Find currently selected candidate
  const selectedCandidate = deduplicatedCandidates.find(c => (c.id || c._id) === value);

  const handleSelect = (candidate) => {
    const id = candidate.id || candidate._id;
    onChange(id, candidate);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('', null);
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-900 border transition-all flex items-center justify-between gap-3 ${
          isOpen 
            ? 'border-purple-500 ring-2 ring-purple-500/20 shadow-lg' 
            : error 
              ? 'border-rose-500/60 hover:border-rose-500' 
              : 'border-slate-800 hover:border-slate-700'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="flex-1 min-w-0">
          {selectedCandidate ? (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 font-bold flex items-center justify-center text-xs shrink-0">
                {selectedCandidate.name?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white truncate block">
                    {selectedCandidate.name}
                  </span>
                  {selectedCandidate.target_role && (
                    <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 truncate hidden sm:inline-block">
                      {selectedCandidate.target_role}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 truncate mt-0.5">
                  <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="truncate">{selectedCandidate.email}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <User className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Select Candidate (search by name or email)...</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {selectedCandidate && !disabled && (
            <span
              onClick={handleClear}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${isOpen ? 'rotate-180 text-purple-400' : ''}`} />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-2 z-50 bg-[#0F172A] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-80">
          
          {/* Search Header */}
          <div className="p-3 border-b border-slate-800 bg-slate-900/80">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search by candidate name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* List Content */}
          <div className="overflow-y-auto flex-1 divide-y divide-slate-800/40 p-1">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                <span>Loading candidates from database...</span>
              </div>
            ) : fetchError ? (
              <div className="p-4 text-center space-y-2">
                <div className="text-xs text-rose-400 flex items-center justify-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  <span>{fetchError}</span>
                </div>
                <button
                  type="button"
                  onClick={loadCandidates}
                  className="text-xs text-purple-400 hover:underline font-semibold"
                >
                  Retry loading candidates
                </button>
              </div>
            ) : deduplicatedCandidates.length === 0 ? (
              /* No candidates in database */
              <div className="p-6 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center mx-auto text-slate-500">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-300">
                    No candidates available.
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Add a new candidate to continue with the interview.
                  </p>
                </div>
                {onOpenQuickAdd && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenQuickAdd();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all shadow-md shadow-purple-600/20"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add New Candidate</span>
                  </button>
                )}
              </div>
            ) : filteredCandidates.length === 0 ? (
              /* Search produced 0 results */
              <div className="p-6 text-center space-y-3">
                <p className="text-xs text-slate-400">
                  No candidates found matching "<span className="text-slate-200">{searchTerm}</span>"
                </p>
                {onOpenQuickAdd && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenQuickAdd(searchTerm);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-semibold transition-all"
                  >
                    <Plus className="w-3.5 h-3.5 text-purple-400" />
                    <span>Quick Add Candidate</span>
                  </button>
                )}
              </div>
            ) : (
              /* Candidate Items */
              filteredCandidates.map((cand) => {
                const candId = cand.id || cand._id;
                const isSelected = candId === value;
                return (
                  <button
                    key={candId}
                    type="button"
                    onClick={() => handleSelect(cand)}
                    className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-purple-600/20 border border-purple-500/40'
                        : 'hover:bg-slate-900 border border-transparent hover:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-8 h-8 rounded-lg font-bold flex items-center justify-center text-xs shrink-0 ${
                        isSelected 
                          ? 'bg-purple-600 text-white' 
                          : 'bg-slate-800 text-purple-400 border border-slate-700'
                      }`}>
                        {cand.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold truncate ${isSelected ? 'text-purple-300' : 'text-slate-200'}`}>
                            {cand.name}
                          </span>
                          {cand.target_role && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono truncate hidden sm:inline-block">
                              {cand.target_role}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 truncate mt-0.5">
                          <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="truncate">{cand.email}</span>
                          {cand.experience_years !== undefined && cand.experience_years > 0 && (
                            <>
                              <span className="text-slate-600">•</span>
                              <span className="text-slate-400">{cand.experience_years}y exp</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-purple-400 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Dropdown Footer */}
          <div className="p-2 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {filteredCandidates.length} of {deduplicatedCandidates.length} candidates
            </span>
            {onOpenQuickAdd && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenQuickAdd();
                }}
                className="text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 hover:underline"
              >
                <Plus className="w-3 h-3" />
                <span>Quick Add Candidate</span>
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  );
};
