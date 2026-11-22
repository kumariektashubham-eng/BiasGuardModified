import axios from 'axios';
import { formatApiError } from '../utils/errorFormatter';

export { formatApiError };

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Authorization header if token exists
// Route-aware: separates candidate-scoped token from interviewer-scoped token
api.interceptors.request.use((config) => {
  const isCandidateUrl = config.url && (
    config.url.includes('/invitation') || 
    config.url.includes('/livekit/token/candidate')
  );
  const isCandidateRoute = typeof window !== 'undefined' && (
    window.location.pathname.startsWith('/interview-room/') || 
    window.location.pathname.startsWith('/candidate-room/')
  );
  const isCandidateScope = isCandidateUrl || isCandidateRoute;

  if (isCandidateScope) {
    const candidateToken = localStorage.getItem('biasguard_candidate_token');
    if (candidateToken) {
      config.headers.Authorization = `Bearer ${candidateToken}`;
    } else {
      delete config.headers.Authorization;
    }
  } else {
    const token = localStorage.getItem('biasguard_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      const candidateToken = localStorage.getItem('biasguard_candidate_token');
      if (candidateToken) {
        config.headers.Authorization = `Bearer ${candidateToken}`;
      } else {
        delete config.headers.Authorization;
      }
    }
  }

  // If sending FormData, delete Content-Type so browser sets correct boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Intercept responses: format errors into human-readable strings and handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error) {
      error.userMessage = formatApiError(error);
    }
    if (error.response && error.response.status === 401) {
      if (window.location.pathname !== '/login' && window.location.pathname !== '/' && !window.location.pathname.startsWith('/interview-room/')) {
        localStorage.removeItem('biasguard_token');
        localStorage.removeItem('biasguard_user');
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
};

export const candidatesApi = {
  list: (search) => api.get('/candidates', { params: { search } }),
  get: (id) => api.get(`/candidates/${id}`),
  create: (data) => api.post('/candidates', data),
  update: (id, data) => api.put(`/candidates/${id}`, data),
  delete: (id) => api.delete(`/candidates/${id}`),
};

export const interviewsApi = {
  list: (params) => api.get('/interviews', { params }),
  get: (id) => api.get(`/interviews/${id}`),
  create: (data) => api.post('/interviews', data),
  update: (id, data) => api.put(`/interviews/${id}`, data),
  delete: (id) => api.delete(`/interviews/${id}`),
  getTemplates: () => api.get('/interviews/templates/questions'),
  start: (id) => api.post(`/interviews/${id}/start`),
  pause: (id) => api.post(`/interviews/${id}/pause`),
  resume: (id) => api.post(`/interviews/${id}/resume`),
  end: (id) => api.post(`/interviews/${id}/end`),
  addQuestion: (id, data) => api.post(`/interviews/${id}/questions`, data),
  generateQuestion: (id, domain) => api.post(`/interviews/${id}/generate-question`, { domain }),
  setActiveQuestion: (id, index) => api.put(`/interviews/${id}/active-question`, { index }),
  getSuggestedQuestions: (id, params) => api.get(`/interviews/${id}/suggested-questions`, { params }),
  generateSuggestedQuestions: (id, data) => api.post(`/interviews/${id}/suggested-questions`, data),
  askSuggestedQuestion: (id, suggestionId) => api.post(`/interviews/${id}/suggested-questions/${suggestionId}/ask`),
  skipSuggestedQuestion: (id, suggestionId) => api.post(`/interviews/${id}/suggested-questions/${suggestionId}/skip`),
  sendInvite: (id, data = {}) => api.post(`/interviews/${id}/invite`, data),
  getInvitation: (token) => api.get(`/interviews/invitation/${token}`),
  acceptInvitation: (token) => api.post(`/interviews/invitation/${token}/accept`),
  declineInvitation: (token) => api.post(`/interviews/invitation/${token}/decline`),
  startInvitation: (token) => api.post(`/interviews/invitation/${token}/start`),
  submitCandidateAnswer: (token, data) => api.post(`/interviews/invitation/${token}/answer`, data),
  completeCandidateInterview: (token) => api.post(`/interviews/invitation/${token}/complete`),
  sendCandidateState: (token, data) => api.post(`/interviews/invitation/${token}/state`, data),
  sendQuestion: (id, data) => api.post(`/interviews/${id}/send-question`, data),
  nextQuestion: (id, data = {}) => api.post(`/interviews/${id}/next-question`, data),
  remoteRecordingControl: (id, data) => api.post(`/interviews/${id}/recording-control`, data),
  getLiveStatus: (interviewId) => api.get(`/interviews/${interviewId}/live-status`),
  getLiveStreamUrl: (interviewId, token) => `/api/interviews/${interviewId}/live-stream?token=${encodeURIComponent(token || '')}`,
};

export const evaluationsApi = {
  evaluate: (data) => api.post('/evaluations/evaluate', data),
  saveHumanScore: (data) => api.post('/evaluations/human-score', data),
  get: (id) => api.get(`/evaluations/${id}`),
  getByInterview: (interviewId) => api.get(`/evaluations/interview/${interviewId}`),
  getAuditTrail: (interviewId) => api.get(`/evaluations/audit-trail/${interviewId}`),
};

export const reportsApi = {
  list: () => api.get('/reports'),
  get: (idOrInterviewId) => api.get(`/reports/${idOrInterviewId}`),
};

export const analyticsApi = {
  getDashboard: () => api.get('/analytics/dashboard'),
};

export const settingsApi = {
  get: () => api.get('/settings'),
  getStatus: () => api.get('/settings/status'),
  update: (data) => api.post('/settings', data),
  testAI: () => api.post('/settings/test-ai'),
  testGroq: () => api.post('/settings/test-groq'),
};

export const seedApi = {
  seed: () => api.post('/seed'),
};

// =========================================================================
// AI Training & Continuous Improvement Pipeline API
// =========================================================================

export const datasetsApi = {
  list: (params) => api.get('/datasets', { params }),
  get: (id) => api.get(`/datasets/${id}`),
  create: (data) => api.post('/datasets', data),
  update: (id, data) => api.put(`/datasets/${id}`, data),
  delete: (id) => api.delete(`/datasets/${id}`),
  validate: (id) => api.post(`/datasets/validate/${id}`),
  uploadJson: (formData) => api.post('/datasets/upload/json', formData),
  uploadCsv: (formData) => api.post('/datasets/upload/csv', formData),
  exportJsonlUrl: (split = 'train', valSplit = 0.2) =>
    `/api/datasets/export/jsonl?split=${split}&validation_split=${valSplit}`,
};

export const feedbackApi = {
  list: (params) => api.get('/feedback', { params }),
  get: (id) => api.get(`/feedback/${id}`),
  submit: (data) => api.post('/feedback', data),
  updateStatus: (id, data) => api.put(`/feedback/${id}/status`, data),
};

export const trainingApi = {
  prepare: (data) => api.post('/training/prepare', data),
  fineTune: (data) => api.post('/training/fine-tune', data),
  getJobs: () => api.get('/training/jobs'),
  getJob: (jobId) => api.get(`/training/jobs/${jobId}`),
};

export const performanceApi = {
  getDashboard: () => api.get('/performance/dashboard'),
};

export const fairnessApi = {
  getBenchmark: () => api.get('/fairness/benchmark'),
  runSuite: () => api.post('/fairness/run'),
};

export const ragApi = {
  getReferences: (domain) => api.get('/rag/references', { params: { domain } }),
  query: (data) => api.post('/rag/query', data),
  seed: () => api.post('/rag/seed'),
};

export const voiceApi = {
  uploadAudio: (formData) => api.post('/voice/upload', formData),
  retranscribe: (audioId, formData) => api.post(`/voice/retranscribe/${audioId}`, formData),
  getAudioUrl: (audioId) => `/api/voice/audio/${audioId}`,
  getVideoUrl: (videoId) => `/api/voice/video/${videoId}`,
  getMetadata: (audioId) => api.get(`/voice/${audioId}`),
  getInterviewRecordings: (interviewId) => api.get(`/voice/interview/${interviewId}`),
  getTakes: (interviewId, questionId) => api.get(`/voice/takes/${interviewId}/${questionId}`),
  updateTranscript: (audioId, editedTranscript) => api.put(`/voice/${audioId}/transcription`, { edited_transcript: editedTranscript }),
  evaluateVoice: (data) => api.post('/voice/evaluate', data),
};

export const livekitApi = {
  getStatus: () => api.get('/livekit/status'),
  getInterviewerToken: (interviewId) => api.post('/livekit/token/interviewer', { interview_id: interviewId }),
  getCandidateToken: (invitationToken) => api.post('/livekit/token/candidate', { invitation_token: invitationToken }),
};

export default api;
