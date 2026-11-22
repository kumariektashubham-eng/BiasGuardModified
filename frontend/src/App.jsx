import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { InterviewsPage } from './pages/InterviewsPage';
import { CreateInterviewPage } from './pages/CreateInterviewPage';
import { InterviewEvaluationPage } from './pages/InterviewEvaluationPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { CandidateDetailsPage } from './pages/CandidateDetailsPage';
import { ReportPage } from './pages/ReportPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';

// AI Training & Continuous Improvement Pages
import { DatasetsPage } from './pages/DatasetsPage';
import { FeedbackPage } from './pages/FeedbackPage';
import { TrainingPage } from './pages/TrainingPage';
import { PerformancePage } from './pages/PerformancePage';
import { FairnessPage } from './pages/FairnessPage';
import { CandidateInterviewRoom } from './pages/CandidateInterviewRoom';
import { InterviewerLivePage } from './pages/InterviewerLivePage';

// BiasGuard AI Main App Root (HMR Verified)
function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public Pages */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/interview-room/:token" element={<CandidateInterviewRoom />} />
        <Route path="/candidate-room/:token" element={<CandidateInterviewRoom />} />

        {/* Authenticated Application Layout */}
        <Route element={<AppLayout />}>
          {/* Core Evaluation Routes */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/interviews" element={<InterviewsPage />} />
          <Route path="/interviews/new" element={<CreateInterviewPage />} />
          <Route path="/interviews/:id/live" element={<InterviewerLivePage />} />
          <Route path="/interviews/:id/evaluate" element={<InterviewEvaluationPage />} />
          <Route path="/interviews/:id/candidate-room" element={<InterviewEvaluationPage />} />
          <Route path="/candidates" element={<CandidatesPage />} />
          <Route path="/candidates/:id" element={<CandidateDetailsPage />} />
          <Route path="/reports" element={<ReportPage />} />
          <Route path="/reports/:id" element={<ReportPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* AI Training & Continuous Improvement Routes */}
          <Route path="/datasets" element={<DatasetsPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/performance" element={<PerformancePage />} />
          <Route path="/fairness" element={<FairnessPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
