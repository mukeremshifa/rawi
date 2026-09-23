import { Link } from 'react-router-dom';
import { InfoIcon, TrendingUpIcon } from 'lucide-react';

import { EVIDENCE_DETAIL, EVIDENCE_LABEL } from '@shared/progress.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  EvidenceChip,
  EvidenceMeter,
  Stat,
  formatRelative,
} from '@/components/domain';
import {
  useEvidence,
  useRecentAttempts,
  useRecurringMistakes,
  useReviews,
  useTopicMap,
  useTopics,
} from '@/store/selectors';
import { useAppState } from '@/store/store';
import { useCoursePath } from '@/store/course-context';

/**
 * Progress: what the attempt log actually shows.
 *
 * ── The claim this page is careful not to make ────────────────────────────
 *
 * It never says how much you know. Every figure here is a count of things that
 * happened — attempts, unaided correct answers, days since last worked — and
 * the evidence level is a sentence describing those counts rather than a score
 * derived from them. The brief asks for exactly this restraint, and the
 * mechanism that enforces it is that `TopicEvidence` has no number field to
 * render even if a future screen wanted one.
 *
 * ── Inspectability ────────────────────────────────────────────────────────
 *
 * Every indicator opens. The topic detail page lists the counts behind the
 * level and links every contributing attempt, so "why does it say that?" has an
 * answer three clicks deep rather than none.
 */
export function ProgressPage() {
  const path = useCoursePath();
  const { attempts, tutorSessions } = useAppState();
  const topics = useTopics();
  const topicMap = useTopicMap();
  const evidence = useEvidence();
  const reviews = useReviews();
  const mistakes = useRecurringMistakes();
  const recent = useRecentAttempts(8);

  const examAttempts = attempts.filter((a) => a.kind === 'exam' && a.completedAt);
  const practiceAttempts = attempts.filter(
    (a) => a.kind === 'practice' && a.completedAt,
  );
  const selfRated = practiceAttempts.filter((a) => a.mode === 'self-rated');
  const withHelp = practiceAttempts.filter((a) => a.mode === 'practice');

  const independentCorrect = [...evidence.values()].reduce(
    (sum, e) => sum + e.independentCorrect,
    0,
  );
  const independentTotal = [...evidence.values()].reduce(
    (sum, e) => sum + e.independent,
    0,
  );

  if (attempts.length === 0) {
    return (
      <Page>
        <PageHeader
          title="Progress"
          description="What your attempts show, and what they do not."
        />
        <EmptyState
          icon={<TrendingUpIcon />}
          title="Nothing recorded yet"
          description="Progress is computed from what you actually do. Take a practice set or an exam and this page will have something honest to say."
          action={
            <div className="flex flex-wrap justify-center gap-tight">
              <Button asChild>
                <Link to={path('/practice/new')}>Start practice</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to={path('/exams')}>Take an exam</Link>
              </Button>
            </div>
          }
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Progress"
        description="Counts of what you have done, not an estimate of what you know."
      />

      <Alert>
        <InfoIcon />
        <AlertTitle>How to read this</AlertTitle>
        <AlertDescription>
          Three kinds of work are counted separately, because they show different
          things. <strong>Self-rated recall</strong> is your own judgement of a
          flashcard. <strong>Practice with help</strong> allowed hints.{' '}
          <strong>Exam answers</strong> were unaided and under conditions. Only
          the last can produce the stronger evidence levels.
        </AlertDescription>
      </Alert>

      <div className="grid gap-base sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent>
            <Stat value={examAttempts.length} label="exam attempts" />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Stat
              value={`${independentCorrect}/${independentTotal}`}
              label="unaided exam answers correct"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Stat value={withHelp.length} label="practice sets with help" />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Stat value={selfRated.length} label="self-rated card rounds" />
          </CardContent>
        </Card>
      </div>

      <Section
        title="Topics"
        description="Open any topic to see exactly which attempts produced its level."
      >
        <ul className="flex flex-col gap-snug">
          {topics.map((topic) => {
            const ev = evidence.get(topic.id);
            const level = ev?.level ?? 'not-checked';
            const due = reviews.find((r) => r.topicId === topic.id);
            return (
              <li key={topic.id}>
                <Link
                  to={path(`/progress/topic/${topic.id}`)}
                  className="hover:bg-accent/50 focus-visible:ring-ring flex flex-col gap-snug rounded-lg border p-gutter outline-none transition-colors focus-visible:ring-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-tight">
                    <div className="flex min-w-0 flex-col gap-hairline">
                      <span className="font-medium">{topic.title}</span>
                      <span className="text-muted-foreground text-xs leading-relaxed">
                        {EVIDENCE_DETAIL[level]}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-hairline">
                      <EvidenceChip level={level} />
                      {due && (
                        <span className="text-muted-foreground font-mono text-xs tabular-nums">
                          {due.daysSince}d since
                        </span>
                      )}
                    </div>
                  </div>

                  <EvidenceMeter level={level} label={topic.title} />

                  {ev && (
                    <span className="text-muted-foreground flex flex-wrap items-center gap-tight text-xs">
                      <span className="font-mono tabular-nums">
                        {ev.independent} exam
                      </span>
                      <Separator orientation="vertical" className="h-3" />
                      <span className="font-mono tabular-nums">
                        {ev.practised} practice
                      </span>
                      <Separator orientation="vertical" className="h-3" />
                      <span className="font-mono tabular-nums">
                        {ev.selfRated} self-rated
                      </span>
                      {ev.lastWorkedAt && (
                        <>
                          <Separator orientation="vertical" className="h-3" />
                          <span>last {formatRelative(ev.lastWorkedAt)}</span>
                        </>
                      )}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      {mistakes.length > 0 && (
        <Section
          title="Recurring mistakes"
          description="Questions answered wrong on two or more separate attempts."
        >
          <ul className="flex flex-col gap-tight">
            {mistakes.map((mistake) => (
              <li key={mistake.questionId}>
                <Card>
                  <CardContent className="flex flex-wrap items-start justify-between gap-base">
                    <div className="flex min-w-0 flex-col gap-hairline">
                      <span className="line-clamp-2 text-sm leading-relaxed">
                        {mistake.prompt}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-tight text-xs">
                        <Link
                          to={path(`/progress/topic/${mistake.topicId}`)}
                          className="underline-offset-4 hover:underline"
                        >
                          {topicMap.get(mistake.topicId)?.title}
                        </Link>
                        <Separator orientation="vertical" className="h-3" />
                        <span className="font-mono tabular-nums">
                          {mistake.times} times
                        </span>
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-tight">
                      <Button size="sm" variant="outline" asChild>
                        <Link
                          to={path(`/practice/new?questions=${mistake.questionId}&retry=${mistake.lastAttemptId}`)}
                        >
                          Retry
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {tutorSessions.length > 0 && (
        <Section title="Tutor sessions">
          <ul className="flex flex-col gap-tight">
            {tutorSessions
              .slice()
              .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
              .slice(0, 5)
              .map((session) => (
                <li key={session.id}>
                  <Link
                    to={path(`/tutor/${session.id}`)}
                    className="hover:bg-accent/50 focus-visible:ring-ring flex items-center justify-between gap-tight rounded-md border p-snug outline-none transition-colors focus-visible:ring-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">
                        {topicMap.get(session.topicId)?.title ?? 'Session'}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {session.messages.filter((m) => m.role === 'student').length}{' '}
                        of your turns · {formatRelative(session.updatedAt)}
                      </span>
                    </div>
                    <Badge variant="secondary" className="shrink-0 font-normal">
                      {session.endedAt ? 'Ended' : 'Open'}
                    </Badge>
                  </Link>
                </li>
              ))}
          </ul>
        </Section>
      )}

      <Section title="All activity">
        <ul className="flex flex-col gap-tight">
          {recent.map((attempt) => (
            <li key={attempt.id}>
              <Link
                to={
                  attempt.kind === 'exam'
                    ? `/exams/results/${attempt.id}`
                    : `/practice/results/${attempt.id}`
                }
                className="hover:bg-accent/50 focus-visible:ring-ring flex items-center justify-between gap-tight rounded-md border p-snug outline-none transition-colors focus-visible:ring-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{attempt.title}</span>
                  <span className="text-muted-foreground flex items-center gap-tight text-xs">
                    <Badge variant="secondary" className="font-normal">
                      {attempt.mode === 'exam'
                        ? 'Unaided'
                        : attempt.mode === 'self-rated'
                          ? 'Self-rated'
                          : 'With help'}
                    </Badge>
                    <span>
                      {formatRelative(attempt.completedAt ?? attempt.startedAt)}
                    </span>
                  </span>
                </div>
                <span className="shrink-0 font-mono text-sm tabular-nums">
                  {attempt.marksAwarded}/{attempt.marksAvailable}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="What the levels mean">
        <ul className="flex flex-col gap-tight">
          {(
            ['not-checked', 'practising', 'independent-once', 'retained'] as const
          ).map((level) => (
            <li
              key={level}
              className="flex flex-col gap-hairline rounded-lg border p-snug"
            >
              <EvidenceChip level={level} />
              <span className="text-muted-foreground text-xs leading-relaxed">
                {EVIDENCE_DETAIL[level]}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs leading-relaxed">
          “{EVIDENCE_LABEL.retained}” needs two correct unaided answers to{' '}
          <em>different</em> questions on <em>different</em> days. Answering the
          same question twice shows you remember that question.
        </p>
      </Section>
    </Page>
  );
}
