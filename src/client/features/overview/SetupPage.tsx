import { useNavigate } from 'react-router-dom';

import { Page, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useStore } from '@/store/store';

/**
 * The first-run choice: the sample courses, or an empty workspace.
 *
 * ── What used to be here ──────────────────────────────────────────────────
 *
 * This file also held a course setup form — name, exam date, daily study
 * minutes and a topic editor. All four have moved to the objects that own them
 * now that Rawi holds several courses:
 *
 *   the course itself   → `/courses/new`, which asks for a name and little else
 *   topics              → the syllabus screen, which can also read a syllabus
 *   the exam date       → planned assessments, which a course can have several of
 *   daily minutes       → the planner's availability, which is one budget across
 *                         every course rather than a number per course
 *
 * What is left is genuinely a welcome screen, and it is a route of its own
 * outside the shell because it is the one screen shown before there is a
 * workspace to navigate.
 */
export function WelcomePage() {
  const { state, dispatch, resetDemo } = useStore();
  const navigate = useNavigate();

  if (state.onboarded) return <Page width="prose" className="py-page"><PageHeader title="Your workspace is ready to open" description="Your courses and saved work are kept on this device. Manage replacement from Courses or Workspace data." /><Button onClick={() => navigate('/')}>Continue to workspace</Button></Page>;
  return (
    <Page width="prose" className="py-page">
      <PageHeader
        title="Welcome to Rawi"
        description="A study workspace for the courses you are taking: reading, tutoring, practice and exam rehearsal, planned across all of them."
      />

      <p className="text-sm">Local mode stores work in this browser. <a href="/online" className="underline">Use an online account</a> for saved courses, materials, practice, exams and planning.</p>
      <div className="flex flex-col gap-snug">
        <Card>
          <CardContent className="flex flex-col gap-snug">
            <span className="font-medium">Explore the seeded courses</span>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Two fictional courses, a reading-heavy history survey and a
              problem-based statistics course, with readings, authored question
              banks, four planned assessments between them and a fortnight of seeded
              study history. Enough for the planner, progress and recurring mistakes
              to have something real to show.
            </p>
            <Button
              className="self-start"
              onClick={() => {
                resetDemo();
                navigate('/');
              }}
            >
              Open the sample courses
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-snug">
            <span className="font-medium">Start with your own</span>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Add a course, paste its syllabus or build a week-by-week outline, and
              record the dates it actually has. Paste your readings into Materials and
              the AI tutor can teach from them, and practice questions can be generated
              from them. Nothing unrelated is attached to your topics.
            </p>
            <Button
              variant="outline"
              className="self-start"
              onClick={() => {
                dispatch({ type: 'start-fresh' });
                navigate('/courses/new');
              }}
            >
              Start from scratch
            </Button>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
