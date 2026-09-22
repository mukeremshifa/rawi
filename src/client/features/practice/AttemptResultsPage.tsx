import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  DumbbellIcon,
  MessageSquareIcon,
  RotateCcwIcon,
} from 'lucide-react';

import type { Attempt } from '@shared/types.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Meter } from '@/components/Meter';
import {
  FORMAT_LABEL,
  OutcomeBadge,
  Stat,
  formatRelative,
} from '@/components/domain';
import { useAttempt, useQuestionMap, useTopicMap } from '@/store/selectors';
import { hasScript } from '@/features/tutor/engine';
import { QuestionFeedback } from './QuestionFeedback';
import { NotFoundPage } from '@/routes';

/**
 * The results of a practice attempt.
 *
 * ── Why this is also reachable for exams' per-question review ─────────────
 *
 * It is not — exams get their own results page, because an exam has sections,
 * a configuration to report, and a topic-gap analysis that a six-question
 * flashcard round does not need. What the two *share* is `QuestionFeedback`,
 * which is the part a student actually reads. Sharing the component and not the
 * page is the right seam: the framing differs, the marked answer does not.
 *
 * ── The next actions ──────────────────────────────────────────────────────
 *
 * Every results screen in this prototype ends with somewhere to go, and the
 * options are derived from what went wrong rather than being a fixed row of
 * buttons. Nothing wrong: practise the next topic. Something wrong: retry those
 * questions, or take them to the tutor.
 */

/** Topics where this attempt lost marks, worst first. */
function weakestTopics(attempt: Attempt): { topicId: string; lost: number }[] {
  const byTopic = new Map<string, { lost: number; available: number }>();
  for (const qa of attempt.questions) {
    const current = byTopic.get(qa.topicId) ?? { lost: 0, available: 0 };
    current.lost += qa.marksAvailable - qa.marksAwarded;
    current.available += qa.marksAvailable;
    byTopic.set(qa.topicId, current);
  }
  return [...byTopic.entries()]
    .filter(([, v]) => v.lost > 0)
    .map(([topicId, v]) => ({ topicId, lost: v.lost }))
    .sort((a, b) => b.lost - a.lost);
}

export function AttemptResultsPage() {
  const { attemptId } = useParams();
  const attempt = useAttempt(attemptId);
  const questionMap = useQuestionMap();
  const topicMap = useTopicMap();

  if (!attempt) return <NotFoundPage />;

  const wrong = attempt.questions.filter((qa) => qa.outcome !== 'correct');
  const weak = weakestTopics(attempt);
  const fraction =
    attempt.marksAvailable > 0 ? attempt.marksAwarded / attempt.marksAvailable : 0;

  return (
    <Page className="max-w-3xl pb-page">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/practice">
            <ArrowLeftIcon />
            Practice
          </Link>
        </Button>
      </div>

      <PageHeader
        title={attempt.title}
        description={`Recorded ${formatRelative(attempt.completedAt ?? attempt.startedAt)}. This has been added to your progress.`}
      />

      <Card>
        <CardContent className="flex flex-col gap-base">
          <div className="flex flex-wrap items-end gap-section">
            <Stat
              value={`${attempt.marksAwarded}/${attempt.marksAvailable}`}
              label="marks"
            />
            <Stat
              value={attempt.questions.filter((q) => q.outcome === 'correct').length}
              label="fully correct"
            />
            <Stat value={wrong.length} label="to revisit" />
            {attempt.mode === 'self-rated' && (
              <div className="flex flex-col gap-hairline">
                <span className="text-sm font-medium">Self-rated</span>
                <span className="text-muted-foreground max-w-56 text-xs leading-relaxed">
                  You graded your own recall. Counted separately from unaided
                  exam answers.
                </span>
              </div>
            )}
          </div>
          <Meter
            value={fraction}
            tone={fraction >= 0.8 ? 'retained' : fraction >= 0.5 ? 'independent' : 'practicing'}
            label={`${attempt.marksAwarded} of ${attempt.marksAvailable} marks`}
          />
        </CardContent>
      </Card>

      {/* Next actions, derived from what actually happened. */}
      <Section title="What next">
        <div className="flex flex-wrap gap-tight">
          {wrong.length > 0 && (
            <Button asChild>
              <Link
                to={`/practice/new?retry=${attempt.id}&questions=${wrong
                  .map((qa) => qa.questionId)
                  .join(',')}`}
              >
                <RotateCcwIcon />
                Retry the {wrong.length} you missed
              </Link>
            </Button>
          )}
          {weak[0] && hasScript(weak[0].topicId) && (
            <Button variant="outline" asChild>
              <Link to={`/tutor/new?topic=${weak[0].topicId}&attempt=${attempt.id}`}>
                <MessageSquareIcon />
                Work on {topicMap.get(weak[0].topicId)?.title} with the tutor
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to="/practice/new">
              <DumbbellIcon />
              New practice set
            </Link>
          </Button>
          {wrong.length === 0 && (
            <Button variant="outline" asChild>
              <Link to="/exams">Try it under exam conditions</Link>
            </Button>
          )}
        </div>

        {weak.length > 0 && (
          <p className="text-muted-foreground text-sm leading-relaxed">
            Most marks lost on{' '}
            {weak
              .slice(0, 2)
              .map((w) => topicMap.get(w.topicId)?.title)
              .filter(Boolean)
              .join(' and ')}
            .
          </p>
        )}
      </Section>

      <Section title="Every question">
        <ol className="flex flex-col gap-base">
          {attempt.questions.map((qa, index) => {
            const question = questionMap.get(qa.questionId);
            if (!question) return null;
            return (
              <li key={`${qa.questionId}-${index}`}>
                <Card>
                  <CardContent className="flex flex-col gap-snug">
                    <div className="flex flex-wrap items-center gap-tight">
                      <span className="text-muted-foreground font-mono text-xs tabular-nums">
                        {index + 1}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {FORMAT_LABEL[question.format]}
                      </span>
                      <Separator orientation="vertical" className="h-3" />
                      <span className="text-muted-foreground text-xs">
                        {topicMap.get(qa.topicId)?.title}
                      </span>
                      <div className="flex-1" />
                      <OutcomeBadge outcome={qa.outcome} />
                    </div>

                    <p className="text-sm font-medium leading-relaxed">
                      {question.prompt}
                    </p>

                    <QuestionFeedback
                      question={question}
                      attempt={qa}
                      {...(hasScript(qa.topicId)
                        ? {
                            discussTo: `/tutor/new?topic=${qa.topicId}&question=${qa.questionId}&attempt=${attempt.id}`,
                          }
                        : {})}
                    />
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      </Section>
    </Page>
  );
}
