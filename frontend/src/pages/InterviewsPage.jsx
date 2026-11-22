import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  PlusCircle, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Mic, 
  FileText, 
  User, 
  ChevronRight, 
  Calendar,
  Layers,
  ArrowRight,
  Copy,
  Check,
  Mail,
  Send,
  ExternalLink,
  Radio
} from 'lucide-react';
import { interviewsApi } from '../services/api';
import { Badge } from '../components/common/Badge';

export const InterviewsPage = () => {
  const navigate = useNavigate();
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [copySuccessId, setCopySuccessId] = useState(null);
  const [sendingInviteId, setSendingInviteId] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    loadInterviews();
  }, []);

  const loadInterviews = async () => {
    try {
      const res = await interviewsApi.list();
      setInterviews(res.data || []);
    } catch (err) {
      console.error("Failed to load interviews:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInviteLink = async (interview) => {
    let url = interview.invitation?.invite_url;
    if (!url && interview.invitation?.raw_token) {
      url = `${window.location.origin}/interview-room/${interview.invitation.raw_token}`;
    }
    if (!url) {
      try {
        const res = await interviewsApi.sendInvite(interview.id);
        url = res.data?.invite_url || `${window.location.origin}/interview-room/${res.data?.raw_token}`;
        loadInterviews();
      } catch (e) {
        setToastMessage('Failed to generate invitation link.');
        setTimeout(() => setToastMessage(''), 3000);
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopySuccessId(interview.id);
      setToastMessage('Invitation link copied to clipboard!');
      setTimeout(() => setCopySuccessId(null), 2500);
      setTimeout(() => setToastMessage(''), 3000);
    } catch (e) {
      setToastMessage(`Link: ${url}`);
      setTimeout(() => setToastMessage(''), 5000);
    }
  };

  const handleResendInvite = async (interview) => {
    setSendingInviteId(interview.id);
    let targetEmail = (interview.candidate_email || '').trim();
    if (!targetEmail) {
      const entered = window.prompt(`Enter email address for candidate '${interview.candidate_name || 'Candidate'}':`);
      if (!entered || !entered.trim()) {
        setSendingInviteId(null);
        return;
      }
      targetEmail = entered.trim();
    }

    try {
      const res = await interviewsApi.sendInvite(interview.id, { candidate_email: targetEmail });
      const email = res.data?.candidate_email || targetEmail;
      if (res.data?.email_status === 'failed') {
        const errDetail = res.data?.email_error || 'SMTP delivery failed';
        setToastMessage(`Email delivery failed: ${errDetail}. Fallback link: ${res.data?.invite_url}`);
      } else {
        setToastMessage(`Invitation email dispatched to ${email}!`);
      }
      setTimeout(() => setToastMessage(''), 5000);
      loadInterviews();
    } catch (e) {
      const errMsg = e.response?.data?.detail || e.userMessage || 'Failed to dispatch invitation email.';
      setToastMessage(`Email error: ${errMsg}`);
      setTimeout(() => setToastMessage(''), 5000);
      loadInterviews();
    } finally {
      setSendingInviteId(null);
    }
  };

  const filteredInterviews = interviews.filter((item) => {
    const matchesSearch = 
      (item.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.candidate_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.candidate_role || '').toLowerCase().includes(searchTerm.toLowerCase());

    const itemStatus = item.status || (item.evaluated_questions > 0 ? 'active' : 'not_started');
    const matchesStatus = 
      statusFilter === 'ALL' || 
      (statusFilter === 'completed' && itemStatus === 'completed') ||
      (statusFilter === 'active' && (itemStatus === 'active' || itemStatus === 'in_progress')) ||
      (statusFilter === 'paused' && itemStatus === 'paused') ||
      (statusFilter === 'not_started' && itemStatus === 'not_started');

    const matchesDomain = 
      domainFilter === 'ALL' || 
      (item.domains && item.domains.includes(domainFilter));

    return matchesSearch && matchesStatus && matchesDomain;
  });

  const totalCount = interviews.length;
  const completedCount = interviews.filter(i => i.status === 'completed').length;
  const inProgressCount = interviews.filter(i => i.status === 'active' || i.status === 'in_progress' || i.status === 'paused').length;
  const pendingCount = interviews.filter(i => !i.status || i.status === 'not_started').length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Interviews</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage interview sessions, evaluate candidate recordings, and monitor AI assessment scores.
          </p>
        </div>

        <Link
          to="/interviews/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-all shadow-lg shadow-purple-600/25 active:scale-[0.99] self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>+ New Interview</span>
        </Link>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-indigo-600 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-emerald-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Metrics Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Total Interviews
          </span>
          <span className="text-2xl font-bold text-white">{totalCount}</span>
        </div>
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Completed
          </span>
          <span className="text-2xl font-bold text-emerald-400">{completedCount}</span>
        </div>
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            In Progress
          </span>
          <span className="text-2xl font-bold text-purple-400">{inProgressCount}</span>
        </div>
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Pending Evaluation
          </span>
          <span className="text-2xl font-bold text-slate-300">{pendingCount}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by interview title, candidate name, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2 px-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
          >
            <option value="ALL">All Statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="not_started">Not Started</option>
          </select>

          {/* Domain Filter */}
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="py-2 px-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
          >
            <option value="ALL">All Domains</option>
            <option value="DSA">DSA</option>
            <option value="Python">Python</option>
            <option value="Java">Java</option>
            <option value="SQL">SQL</option>
            <option value="DBMS">DBMS</option>
            <option value="Operating Systems">Operating Systems</option>
          </select>
        </div>
      </div>

      {/* Interviews Table / Cards */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Loading interview sessions...
          </div>
        ) : filteredInterviews.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm space-y-3">
            <Layers className="w-8 h-8 text-slate-600 mx-auto" />
            <p>No interviews found matching your filter criteria.</p>
            <Link
              to="/interviews/new"
              className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 font-semibold"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Create a new interview
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/70 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Interview & Candidate</th>
                  <th className="px-5 py-3.5">Domains</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Progress</th>
                  <th className="px-5 py-3.5">AI vs Human Score</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Candidate Invitation</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredInterviews.map((item) => {
                  const totalQ = item.total_questions || item.questions?.length || 0;
                  const evalQ = item.evaluated_questions || 0;
                  const isCompleted = evalQ > 0 && evalQ >= totalQ;
                  const hasDiscrepancy = (item.discrepancy_count || 0) > 0;
                  const dateStr = item.created_at 
                    ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Recent';

                  return (
                    <tr key={item.id} className="hover:bg-slate-850/40 transition-colors">
                      {/* Interview & Candidate */}
                      <td className="px-5 py-4">
                        <Link 
                          to={`/interviews/${item.id}/evaluate`}
                          className="font-bold text-sm text-slate-100 hover:text-purple-400 transition-colors block"
                        >
                          {item.title}
                        </Link>
                        <div className="flex items-center gap-2 mt-1">
                          <Link 
                            to={`/candidates/${item.candidate_id}`}
                            className="text-xs text-purple-400 hover:underline flex items-center gap-1"
                          >
                            <User className="w-3 h-3" />
                            <span>{item.candidate_name || 'Candidate'}</span>
                          </Link>
                          <span className="text-slate-600">•</span>
                          <span className="text-[11px] text-slate-400">{item.candidate_role || 'Candidate'}</span>
                        </div>
                      </td>

                      {/* Domains */}
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {item.domains?.map((d) => (
                            <span 
                              key={d} 
                              className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 text-[10px] font-mono"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-5 py-4 text-slate-400">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span>{dateStr}</span>
                        </div>
                      </td>

                      {/* Progress */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className={`h-1.5 rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-purple-500'}`}
                              style={{ width: `${totalQ > 0 ? (evalQ / totalQ) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-slate-300 font-mono text-[11px]">
                            {evalQ}/{totalQ}
                          </span>
                        </div>
                      </td>

                      {/* Scores */}
                      <td className="px-5 py-4">
                        {item.average_ai_score !== null && item.average_interviewer_score !== null ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-semibold text-purple-400" title="AI Score">
                              AI: {item.average_ai_score}
                            </span>
                            <span className="text-slate-500">/</span>
                            <span className="text-slate-300" title="Interviewer Score">
                              Human: {item.average_interviewer_score}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[11px]">Pending scoring</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        {item.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                          </span>
                        ) : item.status === 'active' || item.status === 'in_progress' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Active
                          </span>
                        ) : item.status === 'paused' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" /> Paused
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            Not Started
                          </span>
                        )}
                        {hasDiscrepancy && (
                          <span className="block mt-1 text-[10px] text-amber-400 font-mono">
                            Review Flag ({item.discrepancy_count})
                          </span>
                        )}
                      </td>

                      {/* Candidate Invitation Status */}
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          {item.invitation?.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Completed
                            </span>
                          ) : item.invitation?.status === 'started' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" /> In Session
                            </span>
                          ) : item.invitation?.status === 'accepted' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              Accepted
                            </span>
                          ) : (item.invitation?.email_status === 'failed' || item.email_status === 'failed') ? (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 cursor-help" 
                              title={item.invitation?.email_error || item.email_error || 'Email dispatch failed'}
                            >
                              <AlertCircle className="w-2.5 h-2.5" /> Email Failed
                            </span>
                          ) : (item.invitation?.email_status === 'skipped' || item.email_status === 'skipped') ? (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-help" 
                              title={item.invitation?.email_error || item.email_error || 'Email skipped (no address)'}
                            >
                              <AlertCircle className="w-2.5 h-2.5" /> Email Skipped
                            </span>
                          ) : (item.invitation?.email_status === 'sent' || item.invitation?.status === 'sent' || item.email_status === 'sent') ? (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              title={`Sent at: ${item.invitation?.email_sent_at || item.email_sent_at || 'Recently'}`}
                            >
                              <Mail className="w-2.5 h-2.5" /> Invite Sent
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                              Pending
                            </span>
                          )}

                          {item.candidate_email ? (
                            <div className="text-[10px] text-slate-400 truncate max-w-[140px]" title={item.candidate_email}>
                              {item.candidate_email}
                            </div>
                          ) : (
                            <div className="text-[10px] text-amber-500/80 italic">
                              No email on file
                            </div>
                          )}

                          {(item.invitation?.email_error || item.email_error) && (
                            <div 
                              className="text-[10px] text-rose-400 truncate max-w-[140px] font-mono" 
                              title={item.invitation?.email_error || item.email_error}
                            >
                              {item.invitation?.email_error || item.email_error}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Copy Link Button */}
                          <button
                            type="button"
                            onClick={() => handleCopyInviteLink(item)}
                            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium border border-slate-700 transition-colors flex items-center gap-1"
                            title="Copy Candidate Invitation Link"
                          >
                            {copySuccessId === item.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-[11px] text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-[11px]">Copy Link</span>
                              </>
                            )}
                          </button>

                          {/* Resend Email Button */}
                          <button
                            type="button"
                            onClick={() => handleResendInvite(item)}
                            disabled={sendingInviteId === item.id}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors disabled:opacity-50"
                            title="Resend Invitation Email"
                          >
                            <Send className={`w-3.5 h-3.5 ${sendingInviteId === item.id ? 'animate-spin' : ''}`} />
                          </button>

                          <Link
                            to={`/interviews/${item.id}/live`}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white font-semibold text-xs border border-emerald-500/30 transition-all flex items-center gap-1"
                            title="Join Live Interview Room (Real-time Audio & Evidence)"
                          >
                            <Radio className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Join Live</span>
                          </Link>

                          <Link
                            to={`/interviews/${item.id}/evaluate`}
                            className="px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white font-semibold text-xs border border-purple-500/30 transition-all"
                          >
                            Conduct
                          </Link>

                          {evalQ > 0 && (
                            <Link
                              to={`/reports/${item.id}`}
                              className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
                              title="View Evaluation Report"
                            >
                              Report
                            </Link>
                          )}
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
    </div>
  );
};
