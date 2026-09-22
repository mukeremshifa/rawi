import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  DumbbellIcon,
  GraduationCapIcon,
  MessageSquareIcon,
  RotateCcwIcon,
} from 'lucide-react';

import type { Attempt } from '@shared/types.ts';
import { SIMULATED_MARKING_NOTICE } from '@shared/marking.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Meter } from '@/components/Meter';
import {
  FORMAT_LABEL,
  OutcomeBadge,
  SimulatedNotice,
  Stat,
  formatRelative,
} from '@/components/domain';
import { useAppState } from '@/store/store';
import { useAttempt, useQuestionMap, useTopicMap } from '@/store/selectors';
import { QuestionFeedback } from '@/features/practice/QuestionFeedback';
import { hasScript } from '@/features/tutor/engine';
import { NotFoundPage } from '@/routes';

/**
 * Exam results and review.
 *
 * ── Why the gap analysis comes before the questions ───────────────────────
 *
 * A student who has just finished a paper wants to know what to do, and a
 * per-question walkthrough answers that only after twenty minutes of reading.
 * So the topic gaps and the three targeted actions sit at the top, and the
 * full review is below for when they want it.
 *
 * The actions are computed from the attempt — the worst topic gets the tutor
 * link, the wrong questions get a retry set, and a fresh paper is always
 * available. That is the "results → remediation" hop the brief's connected
 * journey depends on.
 */

interface TopicGap {
  topicId: string;
  awarded: number;
  available: number;
  wrong: number;
}

function topicGaps(attempt: Attempt): TopicGap[] {
  const byTopic = new Map<string, TopicGap>();
  for (const qa of attempt.questions) {
    const current =
      byTopic.get(qa.topicId) ??
      { topicId: qa.topicId, awarded: 0, available: 0, wrong: 0 };
    current.awarded += qa.marksAwarded;
    current.available += qa.marksAvailable;
    if (qa.outcome !== 'correct') current.wrong += 1;
    byTopic.set(qa.topicId, current);
  }
  return [...byTopic.values()].sort(
    (a, b) => a.awarded / a.available - b.awarded / b.available,
  );
}

export function ExamResultsPage() {
  const { attemptId } = useParams();
  const attempt = useAttempt(attemptId);
  const { examConfigs } = useAppState();
  const questionMap = useQuestionMap();
  const topicMap = useTopicMap();

  if (!attempt) return <NotFoundPage />;

  const config = examConfigs.find((c) => c.id === attempt.examConfigId);
  const gaps = topicGaps(attempt);
  const wrong = attempt.questions.filter((qa) => qa.outcome !== 'correct');
  const fraction =
    attempt.marksAvailable > 0 ? attempt.marksAwarded / attempt.marksAvailable : 0;
  const worst = gaps[0];
  const hasWritten = attempt.questions.some(
    (qa) =>
      qa.format === 'essay' ||
      qa.format === 'written-recall' ||
      qa.format === 'source-analysis',
  );

  return (
    <Page className="max-w-3xl pb-page">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/exams">
            <ArrowLeftIcon />
            Exams
          </Link>
        </Button>
      </div>

      <PageHeader
        title={attempt.title}
        description={
          attempt.finish === 'expired'
            ? `Time expired ${formatRelative(attempt.completedAt ?? attempt.startedAt).toLowerCase()} and the paper was submitted as it stood. Answered under exam conditions, so this counts as independent evidence.`
            : `Submitted ${formatRelative(attempt.completedAt ?? attempt.startedAt).toLowerCase()}. Answered under exam conditions, so this counts as independent evidence.`
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-base">
          <div className="flex flex-wrap items-end gap-section">
            <Stat
              value={`${attempt.marksAwarded}/${attempt.marksAvailable}`}
              label="marks"
            />
            <Stat value={`${Math.round(fraction * 100)}%`} label="of the paper" />
            <Stat
              value={attempt.questions.filter((q) => q.outcome === 'correct').length}
              label={`of ${attempt.questions.length} fully correct`}
            />
          </div>
          <Meter
            value={fraction}
            tone={fraction >= 0.7 ? 'retained' : fraction >= 0.45 ? 'independent' : 'practicing'}
            label={`${attempt.marksAwarded} of ${attempt.marksAvailable} marks`}
          />
          {config && (
            <p className="text-muted-foreground text-xs">
              {config.sections.length}{' '}
              {config.sections.length === 1 ? 'section' : 'sections'} ·{' '}
              {config.timing === 'untimed'
                ? 'untimed'
                : config.timing === 'overall'
                  ? `${config.totalMinutes} minutes`
                  : 'timed per section'}{' '}
              · {config.book === 'open' ? 'open book' : 'closed book'} ·{' '}
              {config.navigation === 'free' ? 'free navigation' : 'sequential'}
            </p>
          )}
        </CardContent>
      </Card>

      <Section
        title="Where the marks went"
        description="By topic, weakest first."
      >
        <ul className="flex flex-col gap-snug">
          {gaps.map((gap) => {
            const topic = topicMap.get(gap.topicId);
            const share = gap.available > 0 ? gap.awarded / gap.available : 0;
            return (
              <li key={gap.topicId} className="flex flex-col gap-tight">
                <div className="flex flex-wrap items-baseline justify-between gap-tight">
                  <Link
                    to={`/progress/topic/${gap.topicId}`}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {topic?.title ?? gap.topicId}
                  </Link>
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    {gap.awarded}/{gap.available}
                    {gap.wrong > 0 && ` · ${gap.wrong} wrong`}
                  </span>
                </div>
                <Meter
                  value={share}
                  tone={share >= 0.7 ? 'retained' : share >= 0.45 ? 'independent' : 'practicing'}
                  label={`${topic?.title}: ${gap.awarded} of ${gap.available} marks`}
                />
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="What to do about it">
        <div className="flex flex-wrap gap-tight">
          {worst && hasScript(worst.topicId) && (
            <Button asChild>
              <Link to={`/tutor/new?topic=${worst.topicId}&attempt=${attempt.id}`}>
                <MessageSquareIcon />
                Work through {topicMap.get(worst.topicId)?.title}
              </Link>
            </Button>
          )}
          {wrong.length > 0 && (
            <Button variant="outline" asChild>
              <Link
                to={`/practice/new?retry=${attempt.id}&questions=${wrong
                  .map((qa) => qa.questionId)
                  .join(',')}`}
              >
                <RotateCcwIcon />
                Practise the {wrong.length} you missed
              </Link>
            </Button>
          )}
          {worst && (
            <Button variant="outline" asChild>
              <Link to={`/practice/new?topic=${worst.topicId}`}>
                <DumbbellIcon />
                Targeted practice
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to="/exams">
              <GraduationCapIcon />
              Sit another paper
            </Link>
          </Button>
        </div>

        {worst && (
          <p className="text-muted-foreground text-sm leading-relaxed">
            {topicMap.get(worst.topicId)?.title} cost you the most —{' '}
            {worst.available - worst.awarded} marks. That is where the next hour
            is worth most.
          </p>
        )}
      </Section>

      {hasWritten && (
        <SimulatedNotice tone="block">{SIMULATED_MARKING_NOTICE}</SimulatedNotice>
      )}

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
                      <Badge variant="secondary" className="font-normal">
                        {FORMAT_LABEL[question.format]}
                      </Badge>
                      <Separator orientation="vertical" className="h-3" />
                      <Link
                        to={`/progress/topic/${qa.topicId}`}
                        className="text-muted-foreground text-xs underline-offset-4 hover:underline"
                      >
                        {topicMap.get(qa.topicId)?.title}
                      </Link>
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
