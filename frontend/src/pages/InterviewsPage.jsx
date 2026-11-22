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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Interviews</h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Manage interview sessions, evaluate candidate recordings, and monitor AI assessment scores.
          </p>
        </div>

        <Link
          to="/interviews/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded bg-[#2F855A] hover:bg-[#276749] text-white font-semibold text-xs tracking-wide transition-colors shadow-sm self-start sm:self-auto cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>+ New Interview</span>
        </Link>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-xs font-semibold px-4 py-3 rounded-lg shadow-xl flex items-center gap-2">
          <Check className="w-4 h-4 text-[#2F855A]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Metrics Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-lg bg-white border border-gray-200 shadow-sm">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
            Total Interviews
          </span>
          <span className="text-2xl font-extrabold text-gray-900">{totalCount}</span>
        </div>
        <div className="p-4 rounded-lg bg-white border border-gray-200 shadow-sm">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
            Completed
          </span>
          <span className="text-2xl font-extrabold text-[#2F855A]">{completedCount}</span>
        </div>
        <div className="p-4 rounded-lg bg-white border border-gray-200 shadow-sm">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
            In Progress
          </span>
          <span className="text-2xl font-extrabold text-blue-600">{inProgressCount}</span>
        </div>
        <div className="p-4 rounded-lg bg-white border border-gray-200 shadow-sm">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
            Pending Evaluation
          </span>
          <span className="text-2xl font-extrabold text-gray-600">{pendingCount}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by interview title, candidate name, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded border border-gray-300 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#2F855A] focus:border-[#2F855A] transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2 px-3 rounded border border-gray-300 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-[#2F855A] transition-colors"
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
            className="py-2 px-3 rounded border border-gray-300 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-[#2F855A] transition-colors"
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
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-gray-500 text-sm">
            <div className="w-7 h-7 border-2 border-[#2F855A] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Loading interview sessions...
          </div>
        ) : filteredInterviews.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm space-y-3">
            <Layers className="w-8 h-8 text-gray-400 mx-auto" />
            <p>No interviews found matching your filter criteria.</p>
            <Link
              to="/interviews/new"
              className="inline-flex items-center gap-1.5 text-xs text-[#2F855A] hover:underline font-semibold"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Create a new interview
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-700 uppercase font-bold text-[11px] border-b border-gray-200">
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
              <tbody className="divide-y divide-gray-100">
                {filteredInterviews.map((item) => {
                  const totalQ = item.total_questions || item.questions?.length || 0;
                  const evalQ = item.evaluated_questions || 0;
                  const isCompleted = evalQ > 0 && evalQ >= totalQ;
                  const hasDiscrepancy = (item.discrepancy_count || 0) > 0;
                  const dateStr = item.created_at 
                    ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Recent';

                  return (
                    <tr key={item.id} className="hover:bg-gray-50/70 transition-colors">
                      {/* Interview & Candidate */}
                      <td className="px-5 py-4">
                        <Link 
                          to={`/interviews/${item.id}/evaluate`}
                          className="font-bold text-sm text-gray-900 hover:text-[#2F855A] transition-colors block"
                        >
                          {item.title}
                        </Link>
                        <div className="flex items-center gap-2 mt-1">
                          <Link 
                            to={`/candidates/${item.candidate_id}`}
                            className="text-xs text-[#2F855A] hover:underline flex items-center gap-1 font-medium"
                          >
                            <User className="w-3 h-3" />
                            <span>{item.candidate_name || 'Candidate'}</span>
                          </Link>
                          <span className="text-gray-300">•</span>
                          <span className="text-[11px] text-gray-500">{item.candidate_role || 'Candidate'}</span>
                        </div>
                      </td>

                      {/* Domains */}
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {item.domains?.map((d) => (
                            <span 
                              key={d} 
                              className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 text-[10px] font-mono"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-5 py-4 text-gray-500">
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>{dateStr}</span>
                        </div>
                      </td>

                      {/* Progress */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className={`h-1.5 rounded-full ${isCompleted ? 'bg-[#2F855A]' : 'bg-blue-600'}`}
                              style={{ width: `${totalQ > 0 ? (evalQ / totalQ) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-gray-600 font-mono text-[11px]">
                            {evalQ}/{totalQ}
                          </span>
                        </div>
                      </td>

                      {/* Scores */}
                      <td className="px-5 py-4">
                        {item.average_ai_score !== null && item.average_interviewer_score !== null ? (
                          <div className="flex items-center gap-1.5 text-xs font-semibold">
                            <span className="text-[#2F855A]" title="AI Score">
                              AI: {item.average_ai_score}
                            </span>
                            <span className="text-gray-400">/</span>
                            <span className="text-gray-700" title="Interviewer Score">
                              Human: {item.average_interviewer_score}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">Pending scoring</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        {item.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-green-50 text-[#2F855A] border border-green-200">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                          </span>
                        ) : item.status === 'active' || item.status === 'in_progress' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                            Active
                          </span>
                        ) : item.status === 'paused' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3" /> Paused
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                            Not Started
                          </span>
                        )}
                        {hasDiscrepancy && (
                          <span className="block mt-1 text-[10px] text-amber-700 font-mono font-medium">
                            Review Flag ({item.discrepancy_count})
                          </span>
                        )}
                      </td>

                      {/* Candidate Invitation Status */}
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          {item.invitation?.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-[#2F855A] border border-green-200">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Completed
                            </span>
                          ) : item.invitation?.status === 'started' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> In Session
                            </span>
                          ) : item.invitation?.status === 'accepted' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              Accepted
                            </span>
                          ) : (item.invitation?.email_status === 'failed' || item.email_status === 'failed') ? (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200 cursor-help" 
                              title={item.invitation?.email_error || item.email_error || 'Email dispatch failed'}
                            >
                              <AlertCircle className="w-2.5 h-2.5" /> Email Failed
                            </span>
                          ) : (item.invitation?.email_status === 'skipped' || item.email_status === 'skipped') ? (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 cursor-help" 
                              title={item.invitation?.email_error || item.email_error || 'Email skipped (no address)'}
                            >
                              <AlertCircle className="w-2.5 h-2.5" /> Email Skipped
                            </span>
                          ) : (item.invitation?.email_status === 'sent' || item.invitation?.status === 'sent' || item.email_status === 'sent') ? (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200"
                              title={`Sent at: ${item.invitation?.email_sent_at || item.email_sent_at || 'Recently'}`}
                            >
                              <Mail className="w-2.5 h-2.5" /> Invite Sent
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                              Pending
                            </span>
                          )}

                          {item.candidate_email ? (
                            <div className="text-[10px] text-gray-500 truncate max-w-[140px]" title={item.candidate_email}>
                              {item.candidate_email}
                            </div>
                          ) : (
                            <div className="text-[10px] text-amber-600/80 italic">
                              No email on file
                            </div>
                          )}

                          {(item.invitation?.email_error || item.email_error) && (
                            <div 
                              className="text-[10px] text-red-600 truncate max-w-[140px] font-mono" 
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
                            className="px-2.5 py-1.5 rounded bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium border border-gray-300 transition-colors flex items-center gap-1 cursor-pointer"
                            title="Copy Candidate Invitation Link"
                          >
                            {copySuccessId === item.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-[#2F855A]" />
                                <span className="text-[11px] text-[#2F855A] font-semibold">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-gray-500" />
                                <span className="text-[11px]">Copy Link</span>
                              </>
                            )}
                          </button>

                          {/* Resend Email Button */}
                          <button
                            type="button"
                            onClick={() => handleResendInvite(item)}
                            disabled={sendingInviteId === item.id}
                            className="p-1.5 rounded bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-300 transition-colors disabled:opacity-50 cursor-pointer"
                            title="Resend Invitation Email"
                          >
                            <Send className={`w-3.5 h-3.5 ${sendingInviteId === item.id ? 'animate-spin' : ''}`} />
                          </button>

                          <Link
                            to={`/interviews/${item.id}/live`}
                            className="px-2.5 py-1.5 rounded bg-green-50 hover:bg-[#2F855A] text-[#2F855A] hover:text-white font-semibold text-xs border border-green-200 transition-all flex items-center gap-1"
                            title="Join Live Interview Room"
                          >
                            <Radio className="w-3.5 h-3.5" />
                            <span>Join Live</span>
                          </Link>

                          <Link
                            to={`/interviews/${item.id}/evaluate`}
                            className="px-2.5 py-1.5 rounded bg-gray-800 hover:bg-gray-900 text-white font-semibold text-xs transition-colors"
                          >
                            Conduct
                          </Link>

                          {evalQ > 0 && (
                            <Link
                              to={`/reports/${item.id}`}
                              className="px-2.5 py-1.5 rounded bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium border border-gray-300 transition-colors"
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
