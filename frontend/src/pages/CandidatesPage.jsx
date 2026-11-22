import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  PlusCircle,
  Mail,
  User,
  Layers,
  CheckCircle2,
  Clock,
  ChevronRight,
  Briefcase,
  MoreVertical,
  Edit3,
  Trash2,
  Eye,
  AlertTriangle,
  X,
  Save,
  Check,
  AlertCircle,
  UserPlus,
  Loader2
} from 'lucide-react';
import { candidatesApi, interviewsApi } from '../services/api';
import { formatApiError } from '../utils/errorFormatter';

const AVAILABLE_DOMAINS = ["DSA", "Python", "Java", "SQL", "DBMS", "Operating Systems"];

export const CandidatesPage = () => {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Notification state
  const [notification, setNotification] = useState(null);

  // Active three-dot action menu
  const [activeMenuId, setActiveMenuId] = useState(null);

  // Add Candidate Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    phone: '',
    target_role: 'Senior Software Engineer',
    experience_years: 3.0,
    primary_skills: ['DSA', 'Python'],
    resume_summary: '',
    notes: ''
  });
  const [addError, setAddError] = useState('');
  const [addingCandidate, setAddingCandidate] = useState(false);

  // Edit Modal State
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    target_role: '',
    experience_years: 0,
    primary_skills: [],
    resume_summary: '',
    notes: ''
  });
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete Modal State
  const [deletingCandidate, setDeletingCandidate] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Close dropdown menu when clicking outside
  const menuRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    loadData();
  }, [search]);

  const loadData = async () => {
    try {
      const [candRes, intRes] = await Promise.all([
        candidatesApi.list(search),
        interviewsApi.list().catch(() => ({ data: [] }))
      ]);
      setCandidates(candRes.data || []);
      setInterviews(intRes.data || []);
    } catch (err) {
      console.error("Failed to load candidates data:", err);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Helper to find latest interview for a candidate
  const getCandidateInterviewInfo = (candId) => {
    const candidateInterviews = interviews.filter(i => i.candidate_id === candId);
    if (candidateInterviews.length === 0) {
      return {
        interviewTitle: 'No interview scheduled',
        interviewId: null,
        interviewStatus: 'Not Started',
        evaluationStatus: 'Pending',
        isCompleted: false
      };
    }
    const latest = candidateInterviews[0];
    const totalQ = latest.total_questions || latest.questions?.length || 0;
    const evalQ = latest.evaluated_questions || 0;
    const isCompleted = evalQ > 0 && evalQ >= totalQ;

    return {
      interviewTitle: latest.title,
      interviewId: latest.id,
      interviewStatus: isCompleted ? 'Completed' : evalQ > 0 ? 'In Progress' : 'Pending',
      evaluationStatus: latest.average_ai_score !== null
        ? `Score: ${latest.average_ai_score}/10`
        : evalQ > 0 ? 'In Progress' : 'Pending',
      isCompleted
    };
  };

  // -------------------------------------------------------------------------
  // Add Candidate Handlers
  // -------------------------------------------------------------------------
  const handleToggleAddSkill = (skill) => {
    setAddForm(prev => {
      const skills = prev.primary_skills || [];
      if (skills.includes(skill)) {
        return { ...prev, primary_skills: skills.filter(s => s !== skill) };
      } else {
        return { ...prev, primary_skills: [...skills, skill] };
      }
    });
  };

  const handleSaveAdd = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim()) {
      setAddError("Candidate name is required.");
      return;
    }
    if (!addForm.email.trim() || !addForm.email.includes('@')) {
      setAddError("A valid email address is required.");
      return;
    }
    if (!addForm.target_role.trim()) {
      setAddError("Target role is required.");
      return;
    }

    setAddingCandidate(true);
    setAddError('');

    try {
      const payload = {
        name: addForm.name.trim(),
        email: addForm.email.trim().toLowerCase(),
        phone: addForm.phone.trim(),
        target_role: addForm.target_role.trim(),
        experience_years: parseFloat(addForm.experience_years) || 0,
        primary_skills: addForm.primary_skills,
        resume_summary: addForm.resume_summary.trim(),
        notes: addForm.notes.trim()
      };

      const res = await candidatesApi.create(payload);
      showNotification('success', `Candidate '${res.data.name}' saved to database successfully.`);
      setShowAddModal(false);
      setAddForm({
        name: '',
        email: '',
        phone: '',
        target_role: 'Senior Software Engineer',
        experience_years: 3.0,
        primary_skills: ['DSA', 'Python'],
        resume_summary: '',
        notes: ''
      });
      await loadData();
    } catch (err) {
      setAddError(formatApiError(err, "Failed to create candidate."));
    } finally {
      setAddingCandidate(false);
    }
  };

  // -------------------------------------------------------------------------
  // Edit Candidate Handlers
  // -------------------------------------------------------------------------
  const handleOpenEdit = (cand) => {
    setActiveMenuId(null);
    setEditingCandidate(cand);
    setEditError('');
    setEditForm({
      name: cand.name || '',
      email: cand.email || '',
      phone: cand.phone || '',
      target_role: cand.target_role || '',
      experience_years: cand.experience_years !== undefined ? cand.experience_years : 0,
      primary_skills: cand.primary_skills || [],
      resume_summary: cand.resume_summary || '',
      notes: cand.notes || ''
    });
  };

  const handleToggleSkill = (skill) => {
    setEditForm(prev => {
      const skills = prev.primary_skills || [];
      if (skills.includes(skill)) {
        return { ...prev, primary_skills: skills.filter(s => s !== skill) };
      } else {
        return { ...prev, primary_skills: [...skills, skill] };
      }
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim()) {
      setEditError("Candidate name is required.");
      return;
    }
    if (!editForm.email.trim() || !editForm.email.includes('@')) {
      setEditError("A valid email address is required.");
      return;
    }
    if (!editForm.target_role.trim()) {
      setEditError("Target role is required.");
      return;
    }

    setSavingEdit(true);
    setEditError('');

    try {
      const payload = {
        name: editForm.name.trim(),
        email: editForm.email.trim().toLowerCase(),
        phone: editForm.phone.trim(),
        target_role: editForm.target_role.trim(),
        experience_years: parseFloat(editForm.experience_years) || 0,
        primary_skills: editForm.primary_skills,
        resume_summary: editForm.resume_summary.trim(),
        notes: editForm.notes.trim()
      };

      await candidatesApi.update(editingCandidate.id, payload);
      showNotification('success', `Candidate '${payload.name}' updated successfully.`);
      setEditingCandidate(null);
      await loadData();
    } catch (err) {
      setEditError(formatApiError(err, "Failed to update candidate."));
    } finally {
      setSavingEdit(false);
    }
  };

  // -------------------------------------------------------------------------
  // Delete Candidate Handlers
  // -------------------------------------------------------------------------
  const handleOpenDelete = (cand) => {
    setActiveMenuId(null);
    setDeletingCandidate(cand);
    setDeleteError('');
  };

  const handleConfirmDelete = async () => {
    if (!deletingCandidate) return;
    setDeleting(true);
    setDeleteError('');

    try {
      const res = await candidatesApi.delete(deletingCandidate.id);
      const msg = res.data?.message || `Candidate '${deletingCandidate.name}' and associated records were deleted.`;
      showNotification('success', msg);
      setDeletingCandidate(null);
      await loadData();
    } catch (err) {
      setDeleteError(formatApiError(err, "Failed to delete candidate."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {notification && (
        <div className={`p-4 rounded-xl flex items-center justify-between text-xs font-medium transition-all ${notification.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
            : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
          }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="p-1 hover:bg-slate-850 rounded text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Candidates</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Profiles, associated interview sessions, and technical performance benchmarks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setShowAddModal(true);
              setAddError('');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs tracking-wide transition-all shadow-lg shadow-purple-600/25 active:scale-[0.99]"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Add Candidate</span>
          </button>

          <Link
            to="/interviews/new"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs tracking-wide transition-all"
          >
            <PlusCircle className="w-4 h-4 text-purple-400" />
            <span>+ New Interview</span>
          </Link>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search candidate by name, role, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>
        <span className="text-xs text-slate-400">
          Showing <strong className="text-slate-200">{candidates.length}</strong> candidates
        </span>
      </div>

      {/* Candidates Table */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-visible shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Loading candidates...
          </div>
        ) : candidates.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm space-y-3">
            <Users className="w-8 h-8 text-slate-600 mx-auto" />
            <p>No candidates found matching your criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[320px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/70 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Candidate</th>
                  <th className="px-5 py-3.5">Target Role</th>
                  <th className="px-5 py-3.5">Associated Interview</th>
                  <th className="px-5 py-3.5">Interview Status</th>
                  <th className="px-5 py-3.5">Evaluation Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {candidates.map((cand) => {
                  const info = getCandidateInterviewInfo(cand.id);
                  const isMenuOpen = activeMenuId === cand.id;

                  return (
                    <tr key={cand.id} className="hover:bg-slate-850/40 transition-colors">
                      {/* Candidate Name & Email */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold flex items-center justify-center text-xs shrink-0">
                            {cand.name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <Link
                              to={`/candidates/${cand.id}`}
                              className="font-bold text-sm text-slate-100 hover:text-purple-400 transition-colors block"
                            >
                              {cand.name}
                            </Link>
                            <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 text-slate-500" />
                              {cand.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Target Role */}
                      <td className="px-5 py-4">
                        <span className="text-slate-200 font-medium">{cand.target_role || 'Software Engineer'}</span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {cand.experience_years ? `${cand.experience_years} yrs exp` : 'Standard'}
                        </span>
                      </td>

                      {/* Associated Interview */}
                      <td className="px-5 py-4">
                        {info.interviewId ? (
                          <Link
                            to={`/interviews/${info.interviewId}/evaluate`}
                            className="text-purple-400 hover:underline font-medium block truncate max-w-xs"
                          >
                            {info.interviewTitle}
                          </Link>
                        ) : (
                          <span className="text-slate-500 italic">No interview yet</span>
                        )}
                      </td>

                      {/* Interview Status */}
                      <td className="px-5 py-4">
                        {info.interviewStatus === 'Completed' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                          </span>
                        ) : info.interviewStatus === 'In Progress' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            <Clock className="w-3 h-3" /> In Progress
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            {info.interviewStatus}
                          </span>
                        )}
                      </td>

                      {/* Evaluation Status */}
                      <td className="px-5 py-4">
                        <div className="text-slate-300">
                          {cand.average_score > 0 ? (
                            <span className="font-semibold text-purple-400">
                              AI Avg: {cand.average_score}/10
                            </span>
                          ) : (
                            <span className="text-slate-500 italic text-[11px]">
                              {info.evaluationStatus}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Three-Dot Action Menu */}
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-2 justify-end">
                          {/* Direct Quick Link to Profile */}
                          <Link
                            to={`/candidates/${cand.id}`}
                            className="hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
                          >
                            <span>Profile</span>
                            <ChevronRight className="w-3 h-3 text-slate-400" />
                          </Link>

                          {/* Action Menu (⋮) */}
                          <div className="relative inline-block text-left" ref={isMenuOpen ? menuRef : null}>
                            <button
                              onClick={() => setActiveMenuId(isMenuOpen ? null : cand.id)}
                              className={`p-1.5 rounded-lg border transition-all ${isMenuOpen
                                  ? 'bg-purple-600/20 text-purple-300 border-purple-500/50'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:text-white'
                                }`}
                              title="Candidate Options"
                              aria-label="Candidate Options"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {/* Dropdown Menu */}
                            {isMenuOpen && (
                              <div className="absolute right-0 mt-1 w-44 rounded-xl bg-[#0B0F19] border border-slate-700/80 shadow-2xl z-40 py-1.5 divide-y divide-slate-800/80 animate-in fade-in zoom-in-95 duration-100">
                                <div className="py-1">
                                  <button
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      navigate(`/candidates/${cand.id}`);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                                    <span>View Profile</span>
                                  </button>

                                  <button
                                    onClick={() => handleOpenEdit(cand)}
                                    className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-purple-600/15 hover:text-purple-300 flex items-center gap-2.5 transition-colors"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-purple-400" />
                                    <span>Edit Candidate</span>
                                  </button>
                                </div>

                                <div className="py-1">
                                  <button
                                    onClick={() => handleOpenDelete(cand)}
                                    className="w-full text-left px-3.5 py-2 text-xs text-rose-400 hover:bg-rose-500/10 flex items-center gap-2.5 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                    <span>Delete Candidate</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* Add Candidate Modal                                                   */}
      {/* ===================================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Add New Candidate</h3>
                  <p className="text-xs text-slate-400">Save candidate profile to database for technical interview evaluations</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveAdd} className="p-5 space-y-4">
              {addError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{addError}</span>
                </div>
              )}

              {/* Full Name & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Full Name <span className="text-purple-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={addForm.name}
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="e.g. Maya Lin"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Email Address <span className="text-purple-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="e.g. maya.lin@example.com"
                  />
                </div>
              </div>

              {/* Phone & Target Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={addForm.phone}
                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="e.g. +1 555-0192"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Target Job Role <span className="text-purple-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={addForm.target_role}
                    onChange={(e) => setAddForm({ ...addForm, target_role: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="e.g. Senior Backend Engineer"
                  />
                </div>
              </div>

              {/* Experience Years */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Years of Professional Experience
                </label>
                <input
                  type="number"
                  min="0"
                  max="40"
                  step="0.5"
                  value={addForm.experience_years}
                  onChange={(e) => setAddForm({ ...addForm, experience_years: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Primary Technical Domains */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Primary Technical Domains
                </label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {AVAILABLE_DOMAINS.map((domain) => {
                    const isSelected = addForm.primary_skills?.includes(domain);
                    return (
                      <button
                        key={domain}
                        type="button"
                        onClick={() => handleToggleAddSkill(domain)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${isSelected
                            ? 'bg-purple-600 text-white border border-purple-500 shadow-sm'
                            : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                          }`}
                      >
                        {domain} {isSelected && '✓'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Resume Summary */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Resume Summary / Background
                </label>
                <textarea
                  rows="2"
                  value={addForm.resume_summary}
                  onChange={(e) => setAddForm({ ...addForm, resume_summary: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="Candidate highlights, key tech stack, background..."
                />
              </div>

              {/* Form Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={addingCandidate}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingCandidate}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-lg shadow-purple-600/25 active:scale-[0.99] disabled:opacity-50"
                >
                  {addingCandidate ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to Database...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Candidate</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* Edit Candidate Modal                                                  */}
      {/* ===================================================================== */}
      {editingCandidate && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Edit Candidate Profile</h3>
                  <p className="text-xs text-slate-400">Update candidate details in database</p>
                </div>
              </div>
              <button
                onClick={() => setEditingCandidate(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 flex-1">
              {editError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Name & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Candidate Full Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="e.g. John Doe"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Email Address <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="candidate@example.com"
                  />
                </div>
              </div>

              {/* Phone & Target Role */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="+1 555-0199"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Target Role <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.target_role}
                    onChange={(e) => setEditForm({ ...editForm, target_role: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="e.g. Senior Software Engineer"
                  />
                </div>
              </div>

              {/* Experience Years */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Years of Experience
                </label>
                <input
                  type="number"
                  min="0"
                  max="40"
                  step="0.5"
                  value={editForm.experience_years}
                  onChange={(e) => setEditForm({ ...editForm, experience_years: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Primary Technical Domains */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Primary Technical Domains
                </label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {AVAILABLE_DOMAINS.map((domain) => {
                    const isSelected = editForm.primary_skills?.includes(domain);
                    return (
                      <button
                        key={domain}
                        type="button"
                        onClick={() => handleToggleSkill(domain)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${isSelected
                            ? 'bg-purple-600 text-white border border-purple-500 shadow-sm'
                            : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                          }`}
                      >
                        {domain} {isSelected && '✓'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Resume Summary */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Resume Summary / Background
                </label>
                <textarea
                  rows="2"
                  value={editForm.resume_summary}
                  onChange={(e) => setEditForm({ ...editForm, resume_summary: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="Candidate highlights, key tech stack, background..."
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Interviewer / Recruiter Notes
                </label>
                <textarea
                  rows="2"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="Internal assessment notes or interview scheduling details..."
                />
              </div>

              {/* Form Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingCandidate(null)}
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-lg shadow-purple-600/25 active:scale-[0.99]"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingEdit ? 'Saving Changes...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* Delete Candidate Confirmation Modal                                   */}
      {/* ===================================================================== */}
      {deletingCandidate && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-rose-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">Delete Candidate?</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Are you sure you want to permanently delete candidate <strong className="text-white">{deletingCandidate.name}</strong> ({deletingCandidate.email})?
                </p>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 bg-slate-900/80 p-3 rounded-xl border border-slate-800 leading-relaxed">
              This will remove the candidate's profile, recorded voice answers, and evaluation reports. Shared question templates and other candidates' data will remain intact.
            </p>

            {deleteError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {deleteError}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingCandidate(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-lg shadow-rose-600/20 active:scale-[0.99]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
