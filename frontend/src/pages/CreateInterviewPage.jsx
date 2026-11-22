import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Trash2,
  BookOpen,
  Check,
  ChevronRight,
  Sparkles,
  UserPlus,
  Layers,
  HelpCircle,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2
} from 'lucide-react';
import { interviewsApi, candidatesApi } from '../services/api';
import { Badge } from '../components/common/Badge';
import { CandidateSelectDropdown } from '../components/candidates/CandidateSelectDropdown';
import { formatApiError } from '../utils/errorFormatter';

const AVAILABLE_DOMAINS = ["Java", "Python", "DSA", "DBMS", "SQL", "Operating Systems"];

export const CreateInterviewPage = () => {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successToast, setSuccessToast] = useState('');

  // Form State
  const [title, setTitle] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [selectedDomains, setSelectedDomains] = useState(["DSA", "Python"]);
  const [questions, setQuestions] = useState([]);
  const [sendInvitation, setSendInvitation] = useState(true);

  // Quick Create Candidate Modal / Inline Form
  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [newCandName, setNewCandName] = useState('');
  const [newCandEmail, setNewCandEmail] = useState('');
  const [newCandRole, setNewCandRole] = useState('Senior Software Engineer');
  const [newCandExp, setNewCandExp] = useState(3.5);
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [quickAddError, setQuickAddError] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [candsRes, tempRes] = await Promise.all([
        candidatesApi.list(),
        interviewsApi.getTemplates()
      ]);
      const candList = candsRes.data || [];
      setCandidates(candList);
      setTemplates(tempRes.data || []);
      if (candList.length > 0 && !candidateId) {
        setCandidateId(candList[0].id);
        setTitle(`Technical Interview - ${candList[0].name}`);
      }
    } catch (err) {
      console.error("Failed to fetch initial data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDomainToggle = (domain) => {
    if (selectedDomains.includes(domain)) {
      setSelectedDomains(selectedDomains.filter(d => d !== domain));
    } else {
      setSelectedDomains([...selectedDomains, domain]);
    }
  };

  const handleCandidateChange = (id, candObj = null) => {
    setCandidateId(id);
    if (id) {
      const cand = candObj || candidates.find(c => (c.id || c._id) === id);
      if (cand && (!title || title.startsWith('Technical Interview'))) {
        setTitle(`Technical Interview - ${cand.name}`);
      }
    }
  };

  const handleCreateCandidate = async (e) => {
    e.preventDefault();
    const name = newCandName.trim();
    const email = newCandEmail.trim().toLowerCase();

    if (!name) {
      setQuickAddError("Candidate full name is required.");
      return;
    }
    if (!email || !email.includes('@')) {
      setQuickAddError("A valid email address is required.");
      return;
    }

    setQuickAddLoading(true);
    setQuickAddError('');

    try {
      const res = await candidatesApi.create({
        name,
        email,
        target_role: newCandRole.trim() || 'Software Engineer',
        experience_years: parseFloat(newCandExp) || 0,
        primary_skills: selectedDomains
      });

      const newCand = res.data;

      // Update candidate list ensuring no duplicates
      setCandidates(prev => {
        const filtered = prev.filter(c => (c.id || c._id) !== newCand.id);
        return [newCand, ...filtered];
      });

      // Auto-select the newly added candidate
      setCandidateId(newCand.id);

      // Update title if not custom-edited
      if (!title || title.startsWith('Technical Interview')) {
        setTitle(`Technical Interview - ${newCand.name}`);
      }

      // Reset form and close
      setNewCandName('');
      setNewCandEmail('');
      setShowNewCandidate(false);

      // Toast notification
      setSuccessToast(`Candidate '${newCand.name}' saved to database and selected.`);
      setTimeout(() => setSuccessToast(''), 4500);

    } catch (err) {
      setQuickAddError(formatApiError(err, "Error creating candidate."));
    } finally {
      setQuickAddLoading(false);
    }
  };

  const addCustomQuestion = () => {
    setQuestions([
      ...questions,
      {
        domain: selectedDomains[0] || "General",
        question_text: "",
        difficulty: "Medium",
        expected_criteria: ["Time & Space complexity analysis", "Edge case handling"],
        sample_answer: ""
      }
    ]);
  };

  const importTemplate = (tmpl) => {
    setQuestions([
      ...questions,
      {
        domain: tmpl.domain,
        question_text: tmpl.question_text,
        difficulty: tmpl.difficulty,
        expected_criteria: [...tmpl.expected_criteria],
        sample_answer: ""
      }
    ]);
  };

  const removeQuestion = (idx) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx, field, value) => {
    const updated = [...questions];
    updated[idx][field] = value;
    setQuestions(updated);
  };

  const addCriteria = (qIdx, critText) => {
    if (!critText.trim()) return;
    const updated = [...questions];
    updated[qIdx].expected_criteria = [...(updated[qIdx].expected_criteria || []), critText.trim()];
    setQuestions(updated);
  };

  const removeCriteria = (qIdx, cIdx) => {
    const updated = [...questions];
    updated[qIdx].expected_criteria = updated[qIdx].expected_criteria.filter((_, i) => i !== cIdx);
    setQuestions(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!candidateId) {
      setError('Please select or create a candidate.');
      return;
    }
    if (questions.length === 0) {
      setError('Please add at least one technical question to evaluate.');
      return;
    }
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].question_text.trim()) {
        setError(`Question #${i + 1} is empty. Please enter the question text.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await interviewsApi.create({
        title: title.trim() || 'Technical Interview Session',
        candidate_id: candidateId,
        domains: selectedDomains,
        questions: questions,
        send_invitation: sendInvitation
      });
      // Redirect straight to Evaluation page to conduct the continuous interview!
      navigate(`/interviews/${res.data.id}/evaluate`);
    } catch (err) {
      setError(formatApiError(err, 'Failed to create interview.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-white tracking-tight">Create Technical Interview</h1>
          <p className="text-xs text-slate-400">Configure candidate, domain criteria, and questions for independent evaluation.</p>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successToast && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast('')} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Step 1: Candidate Selection */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs">1</span>
              Candidate Information
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowNewCandidate(!showNewCandidate);
                setQuickAddError('');
              }}
              className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {showNewCandidate ? 'Cancel Quick Add' : '+ Quick Add New Candidate'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Select Candidate <span className="text-purple-400">*</span>
              </label>

              {/* Database-Driven Searchable Candidate Select Dropdown */}
              <CandidateSelectDropdown
                value={candidateId}
                onChange={handleCandidateChange}
                candidates={candidates}
                onRefresh={fetchInitialData}
                onOpenQuickAdd={(prefillName) => {
                  setShowNewCandidate(true);
                  if (prefillName) setNewCandName(prefillName);
                  setQuickAddError('');
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Interview Session Title <span className="text-purple-400">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Technical Round 1 - Distributed Systems"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
          </div>

          {/* Email Invitation Option */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={sendInvitation}
                onChange={(e) => setSendInvitation(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-purple-500"
              />
              <span>
                Dispatch email invitation with secure LiveKit video interview link to candidate upon creation
              </span>
            </label>
            <span className="text-[11px] text-purple-400 font-semibold bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
              LiveKit Video Invite
            </span>
          </div>

          {/* Quick Add Candidate Card */}
          {showNewCandidate && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-purple-500/30 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-bold text-purple-300">Quick Add Candidate to Database</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewCandidate(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {quickAddError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>{quickAddError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Maya Lin"
                    value={newCandName}
                    onChange={(e) => setNewCandName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. maya.lin@example.com"
                    value={newCandEmail}
                    onChange={(e) => setNewCandEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Target Role</label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Backend Engineer"
                    value={newCandRole}
                    onChange={(e) => setNewCandRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Years of Experience</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="e.g. 4.5"
                    value={newCandExp}
                    onChange={(e) => setNewCandExp(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCandidate(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateCandidate}
                  disabled={quickAddLoading}
                  className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-600/20"
                >
                  {quickAddLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to MongoDB...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save & Auto-Select</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Technical Domains */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs">2</span>
            Technical Domains
          </h2>
          <p className="text-xs text-slate-400">Select the subject areas covered in this technical assessment.</p>

          <div className="flex flex-wrap gap-2.5">
            {AVAILABLE_DOMAINS.map((domain) => {
              const active = selectedDomains.includes(domain);
              return (
                <button
                  type="button"
                  key={domain}
                  onClick={() => handleDomainToggle(domain)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${active
                    ? 'bg-purple-600 text-white border-purple-500 shadow-glow-brand'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                >
                  {domain}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 3: Question Builder & Library */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs">3</span>
                Interview Questions & Criteria ({questions.length})
              </h2>
              <p className="text-xs text-slate-400">Add questions with objective evaluation criteria and expected trade-offs.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addCustomQuestion}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Custom Question
              </button>
            </div>
          </div>

          {/* Quick Library Imports */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold text-slate-200">1-Click Curated Benchmark Questions</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
              {templates.map((tmpl, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => importTemplate(tmpl)}
                  className="text-left p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-purple-500/40 transition-colors text-xs space-y-1 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                      {tmpl.domain}
                    </span>
                    <span className="text-[10px] text-slate-500 group-hover:text-purple-300">
                      + Add
                    </span>
                  </div>
                  <p className="text-slate-300 line-clamp-2 leading-relaxed text-[11px]">
                    {tmpl.question_text}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Configured Questions List */}
          {questions.length === 0 ? (
            <div className="p-8 border border-dashed border-slate-800 rounded-xl text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-slate-900 text-slate-500 flex items-center justify-center mx-auto">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-300">No questions added yet</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Select a question from the curated library above or add a custom question.</p>
              </div>
              <button
                type="button"
                onClick={addCustomQuestion}
                className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-semibold transition-all inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Question</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {questions.map((q, qIdx) => (
                <div key={qIdx} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-white">Question #{qIdx + 1}</span>
                      <select
                        value={q.domain}
                        onChange={(e) => updateQuestion(qIdx, 'domain', e.target.value)}
                        className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-300"
                      >
                        {AVAILABLE_DOMAINS.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      <select
                        value={q.difficulty}
                        onChange={(e) => updateQuestion(qIdx, 'difficulty', e.target.value)}
                        className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-300"
                      >
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeQuestion(qIdx)}
                      className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                      title="Remove question"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Question Text</label>
                    <textarea
                      rows={2}
                      value={q.question_text}
                      onChange={(e) => updateQuestion(qIdx, 'question_text', e.target.value)}
                      placeholder="Enter the exact technical question..."
                      className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  {/* Rubric Criteria Tags */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] text-slate-400">Benchmark Criteria ({q.expected_criteria?.length || 0})</label>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {q.expected_criteria?.map((crit, cIdx) => (
                        <span key={cIdx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[11px]">
                          <span>{crit}</span>
                          <button
                            type="button"
                            onClick={() => removeCriteria(qIdx, cIdx)}
                            className="text-purple-400 hover:text-white"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Add Criteria Input */}
                    <input
                      type="text"
                      placeholder="Type a benchmark criteria and press Enter..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCriteria(qIdx, e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit Action Bar */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-6">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition-colors"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs transition-all shadow-lg shadow-purple-600/30 flex items-center gap-2 active:scale-95 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating Interview...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Create & Begin Technical Interview</span>
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
};
