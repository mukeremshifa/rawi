import { Link, Navigate, Route, Routes } from 'react-router-dom';

import { Page, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/features/shell/AppShell';
import { OverviewPage } from '@/features/overview/OverviewPage';
import { SetupPage, WelcomePage } from '@/features/overview/SetupPage';
import { MaterialsPage } from '@/features/materials/MaterialsPage';
import { MaterialPage } from '@/features/materials/MaterialPage';
import { TutorHomePage } from '@/features/tutor/TutorHomePage';
import { TutorSessionPage } from '@/features/tutor/TutorSessionPage';
import { NewTutorSession } from '@/features/tutor/NewTutorSession';
import { PracticeHomePage } from '@/features/practice/PracticeHomePage';
import { PracticeSetupPage } from '@/features/practice/PracticeSetupPage';
import { PracticeRunPage } from '@/features/practice/PracticeRunPage';
import { AttemptResultsPage } from '@/features/practice/AttemptResultsPage';
import { ExamsHomePage } from '@/features/exam/ExamsHomePage';
import { ExamBuilderPage } from '@/features/exam/ExamBuilderPage';
import { ExamRunPage } from '@/features/exam/ExamRunPage';
import { ExamResultsPage } from '@/features/exam/ExamResultsPage';
import { ProgressPage } from '@/features/progress/ProgressPage';
import { TopicProgressPage } from '@/features/progress/TopicProgressPage';

/**
 * The route table.
 *
 * **What you are looking at lives in the URL.** Every screen can be bookmarked
 * and reloaded into the same state, which matters more here than it looks: the
 * store persists to `localStorage`, so a reload genuinely restores the session
 * rather than merely re-rendering a shell.
 *
 * Two routes deliberately do not carry their subject in the path:
 *
 *   /exams/run    there is one active exam at a time, and it lives on the
 *                 store. Putting a run id in the URL would invite two tabs to
 *                 sit the same paper and write over each other's answers.
 *   /tutor/new    a session-creating route that immediately redirects to the
 *                 created session's id, so the back button does not land on a
 *                 route whose only effect is to create another session.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/welcome" element={<WelcomePage />} />

      <Route element={<AppShell />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/setup" element={<SetupPage />} />

        <Route path="/materials" element={<MaterialsPage />} />
        <Route path="/materials/:materialId" element={<MaterialPage />} />

        <Route path="/tutor" element={<TutorHomePage />} />
        <Route path="/tutor/new" element={<NewTutorSession />} />
        <Route path="/tutor/:sessionId" element={<TutorSessionPage />} />

        <Route path="/practice" element={<PracticeHomePage />} />
        <Route path="/practice/new" element={<PracticeSetupPage />} />
        <Route path="/practice/run/:attemptId" element={<PracticeRunPage />} />
        <Route path="/practice/results/:attemptId" element={<AttemptResultsPage />} />

        <Route path="/exams" element={<ExamsHomePage />} />
        <Route path="/exams/build" element={<ExamBuilderPage />} />
        <Route path="/exams/build/:configId" element={<ExamBuilderPage />} />
        <Route path="/exams/run" element={<ExamRunPage />} />
        <Route path="/exams/results/:attemptId" element={<ExamResultsPage />} />

        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/progress/topic/:topicId" element={<TopicProgressPage />} />
      </Route>

      {/* A real 404 rather than a redirect to the root. Silently sending a
          mistyped URL home hides the mistake and loses the address someone was
          trying to reach. */}
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function NotFoundPage() {
  return (
    <Page width="prose" className="py-page">
      <PageHeader
        title="Not here"
        description="That address does not point at anything in Rawi. It may have been deleted, or the link may be wrong."
      />
      <Button asChild className="self-start">
        <Link to="/">Back to your overview</Link>
      </Button>
    </Page>
  );
}

export { Navigate };
