import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRightIcon,
  CalendarClockIcon,
  ClockIcon,
  InfoIcon,
  ListTreeIcon,
  SettingsIcon,
  SparklesIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import type { CheckInMood } from '@shared/types.ts';
import {
  PLAN_EXPLANATION,
  todaysCheckIn,
  upcomingAssessments,
} from '@shared/progress.ts';
import { localISO, trimDay } from '@shared/planner.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DueChip,
  EvidenceChip,
  EvidenceMeter,
  formatMinutes,
  formatRelative,
  formatTimeOfDay,
} from '@/components/domain';
import { useAppState, useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import {
  useAssessments,
  useAvailability,
  useEvidence,
  usePlan,
  useRecentAttempts,
  useReviews,
  useSessions,
  useTopicMap,
  useTopics,
} from '@/store/selectors';
import { newId } from '@/lib/id';

/**
 * A course's overview: what to do in this course, and why.
 *
 * ── How this differs from Home ────────────────────────────────────────────
 *
 * Home answers "what am I doing today" across every course. This answers
 * "where am I in this course" — its topics, its evidence, its deadlines, its
 * recent work. The overlap is deliberately small: the suggestion list here is
 * the global plan *filtered to this course*, not a second ranking, so the two
 * screens cannot recommend different things.
 *
 * ── The check-in ──────────────────────────────────────────────────────────
 *
 * A check-in changes what is suggested, and — this is the part the brief
 * specifically asks for — it now connects to the **planner** rather than
 * producing a private schedule of its own. Saying you have 20 minutes today
 * shows which of today's planned sessions fit in 20 minutes and which are being
 * set aside, from the real planner sessions, rather than inventing a parallel
 * plan the calendar knows nothing about.
 */

const MOODS: { value: CheckInMood; label: string; blurb: string }[] = [
  {
    value: 'on-track',
    label: 'On track',
    blurb: 'No change to the ordinary ranking.',
  },
  {
    value: 'less-time',
    label: 'Short of time today',
    blurb: 'Shows what fits in the time you have, from what you already planned.',
  },
  {
    value: 'struggling',
    label: 'Struggling with something',
    blurb: 'Moves that topic to the top and switches it from testing to teaching.',
  },
  {
    value: 'confident',
    label: 'Feeling on top of it',
    blurb: 'Moves timed rehearsal up.',
  },
];

function CheckInCard() {
  const course = useCourse();
  const { checkIns } = useAppState();
  const { dispatch } = useStore();
  const topics = useTopics();
  const availability = useAvailability();
  const sessions = useSessions();
  const today = localISO(new Date());

  const existing = todaysCheckIn(checkIns);
  const [mood, setMood] = useState<CheckInMood>(existing?.mood ?? 'on-track');
  const [topicId, setTopicId] = useState(existing?.topicId ?? '');
  const [minutes, setMinutes] = useState(
    String(existing?.minutesToday ?? availability.sessionMinutes),
  );
  const [note, setNote] = useState(existing?.note ?? '');

  const submit = () => {
    dispatch({
      type: 'add-check-in',
      checkIn: {
        id: newId('check'),
        mood,
        at: new Date().toISOString(),
        courseId: course.id,
        ...(mood === 'struggling' && topicId ? { topicId } : {}),
        ...(mood === 'less-time' ? { minutesToday: Number(minutes) || 20 } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
    });
    toast.success('Check-in saved', {
      description: 'Today’s suggestions have changed to match.',
    });
  };

  /*
   * The short-time case reads the planner rather than replacing it. `trimDay`
   * keeps as much of today's real schedule as fits the reduced budget and names
   * what it is setting aside, which is what "connect to the planner" means in
   * practice: one schedule, less of it, and the student can see which part.
   */
  const trimmed =
    existing?.mood === 'less-time' && existing.minutesToday !== undefined
      ? trimDay(sessions, today, existing.minutesToday)
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-tight text-sm">
          <SparklesIcon className="size-4" aria-hidden />
          How is today going?
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-base">
        <div className="grid gap-tight sm:grid-cols-2">
          {MOODS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMood(option.value)}
              aria-pressed={mood === option.value}
              className={`focus-visible:ring-ring flex flex-col gap-hairline rounded-lg border p-snug text-left outline-none transition-colors focus-visible:ring-2 ${
                mood === option.value
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-accent/50'
              }`}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-muted-foreground text-xs leading-relaxed">
                {option.blurb}
              </span>
            </button>
          ))}
        </div>

        {mood === 'struggling' && topics.length > 0 && (
          <div className="flex flex-col gap-tight">
            <Label htmlFor="checkin-topic">Which topic?</Label>
            <Select
              id="checkin-topic"
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
            >
              <option value="">Choose a topic</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </Select>
          </div>
        )}

        {mood === 'less-time' && (
          <div className="flex flex-col gap-tight">
            <Label htmlFor="checkin-minutes">Minutes you have today</Label>
            <Select
              id="checkin-minutes"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-40"
            >
              {['10', '15', '20', '30', '45'].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-tight">
          <Label htmlFor="checkin-note">Anything else? (optional)</Label>
          <Textarea
            id="checkin-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>

        <Button onClick={submit} className="self-start">
          {existing ? 'Update today’s check-in' : 'Save check-in'}
        </Button>

        {trimmed && (
          <div className="flex flex-col gap-tight rounded-lg border p-snug">
            <p className="text-sm font-medium">
              In {existing?.minutesToday} minutes, from what you planned
            </p>
            {trimmed.keep.length === 0 ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                Nothing you planned for today fits in that time. The short suggestions
                below are the alternative.
              </p>
            ) : (
              trimmed.keep.map((session) => (
                <Link
                  key={session.id}
                  to={`/planner?session=${session.id}`}
                  className="hover:bg-accent/50 focus-visible:ring-ring flex items-center gap-tight rounded-md px-1 py-0.5 text-xs outline-none focus-visible:ring-2"
                >
                  <span className="min-w-0 flex-1 truncate">{session.title}</span>
                  <span className="font-mono tabular-nums">
                    {formatMinutes(session.durationMinutes)}
                  </span>
                </Link>
              ))
            )}
            {trimmed.defer.length > 0 && (
              <p className="text-muted-foreground text-xs leading-relaxed">
                Setting aside {trimmed.defer.length}{' '}
                {trimmed.defer.length === 1 ? 'session' : 'sessions'}:{' '}
                {trimmed.defer.map((s) => s.title).join(', ')}. Move{' '}
                {trimmed.defer.length === 1 ? 'it' : 'them'} in the planner rather than
                losing {trimmed.defer.length === 1 ? 'it' : 'them'}.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function OverviewPage() {
  const course = useCourse();
  const path = useCoursePath();
  const plan = usePlan();
  const reviews = useReviews();
  const evidence = useEvidence();
  const topics = useTopics();
  const topicMap = useTopicMap();
  const recent = useRecentAttempts(4);
  const assessments = useAssessments();
  const sessions = useSessions();
  const today = localISO(new Date());

  /* This course's slice of the one global ranking — never a second ranking. */
  const coursePlan = plan.filter((s) => s.courseId === course.id);
  const upcoming = upcomingAssessments(assessments);
  const next = upcoming[0];
  const todaysSessions = sessions.filter(
    (s) => s.date === today && s.status === 'planned',
  );

  if (topics.length === 0) {
    return (
      <Page className="py-page">
        <PageHeader
          title={course.name}
          description={course.description || course.goal}
          actions={
            <Button variant="outline" asChild>
              <Link to={path('/settings')}>
                <SettingsIcon />
                Settings
              </Link>
            </Button>
          }
        />
        <EmptyState
          icon={<ListTreeIcon />}
          title="This course has no topics yet"
          description="Topics are what everything else points at: materials, practice, assessments and your progress. Paste a syllabus, read a text file, or build a week-by-week outline yourself."
          action={
            <Button asChild>
              <Link to={path('/syllabus')}>Set up the outline</Link>
            </Button>
          }
        />
      </Page>
    );
  }

  return (
    <Page className="py-page">
      <PageHeader
        title={course.name}
        description={course.goal || course.description}
        actions={
          <div className="flex items-center gap-tight">
            <Button variant="outline" asChild>
              <Link to={path('/syllabus')}>
                <ListTreeIcon />
                Topics
              </Link>
            </Button>
            <Button variant="ghost" size="icon-sm" asChild aria-label="Course settings">
              <Link to={path('/settings')}>
                <SettingsIcon />
              </Link>
            </Button>
          </div>
        }
      />

      {/* ── Deadlines for this course ─────────────────────────────────── */}
      <div className="grid gap-tight sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-hairline">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <CalendarClockIcon className="size-3.5" aria-hidden />
              Next assessment
            </span>
            {next ? (
              <>
                <Link
                  to={path(`/exams/assessment/${next.id}`)}
                  className="focus-visible:ring-ring rounded text-sm font-medium outline-none hover:underline focus-visible:ring-2"
                >
                  {next.title}
                </Link>
                <span className="flex items-center gap-tight">
                  <DueChip date={next.date} />
                  {next.time && (
                    <span className="text-muted-foreground text-xs">{next.time}</span>
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="text-sm">None recorded</span>
                <Link
                  to={path('/exams/assessment')}
                  className="text-muted-foreground text-xs underline"
                >
                  Add one
                </Link>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-hairline">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <ClockIcon className="size-3.5" aria-hidden />
              Planned today
            </span>
            <span className="font-mono text-2xl tabular-nums">
              {todaysSessions.length}
            </span>
            <span className="text-muted-foreground text-xs leading-relaxed">
              {todaysSessions.length > 0
                ? `${formatMinutes(
                    todaysSessions.reduce((sum, s) => sum + s.durationMinutes, 0),
                  )} for this course. `
                : 'Nothing scheduled for this course today. '}
              <Link to="/planner" className="underline">
                Planner
              </Link>
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-hairline">
            <span className="text-muted-foreground text-xs">Due for review</span>
            <span className="font-mono text-2xl tabular-nums">{reviews.length}</span>
            <span className="text-muted-foreground text-xs leading-relaxed">
              Topics untouched for three days or more.
            </span>
          </CardContent>
        </Card>
      </div>

      {todaysSessions.length > 0 && (
        <Section title="Planned for today in this course">
          <div className="flex flex-col gap-tight">
            {todaysSessions.map((session) => (
              <Link
                key={session.id}
                to={`/planner?session=${session.id}`}
                className="hover:bg-accent/50 focus-visible:ring-ring flex flex-wrap items-center gap-snug rounded-lg border p-snug outline-none transition-colors focus-visible:ring-2"
              >
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {formatTimeOfDay(session.startMinutes)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{session.title}</span>
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {formatMinutes(session.durationMinutes)}
                </span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* ── Suggestions, this course's share ──────────────────────────── */}
      <Section
        title="Suggested next"
        actions={
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="How these are ordered">
                <InfoIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="max-w-sm text-sm leading-relaxed">
              {PLAN_EXPLANATION}
            </PopoverContent>
          </Popover>
        }
      >
        {coursePlan.length === 0 ? (
          <EmptyState
            title="Nothing outstanding here"
            description="Nothing in this course is due for review or short of evidence. Your other courses may have work waiting."
            action={
              <Button variant="outline" asChild>
                <Link to="/">See everything</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-tight md:grid-cols-2">
            {coursePlan.map((suggestion) => (
              <Link
                key={suggestion.id}
                to={suggestion.to}
                className="hover:bg-accent/50 focus-visible:ring-ring flex flex-col gap-tight rounded-lg border p-gutter outline-none transition-colors focus-visible:ring-2"
              >
                <span className="flex items-center gap-tight">
                  <Badge variant="secondary" className="font-normal capitalize">
                    {suggestion.kind}
                  </Badge>
                  <span className="flex-1" />
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    {formatMinutes(suggestion.minutes)}
                  </span>
                </span>
                <span className="text-sm font-medium">{suggestion.title}</span>
                <span className="text-muted-foreground text-xs leading-relaxed">
                  {suggestion.reason}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <CheckInCard />

      {/* ── Topics and evidence ───────────────────────────────────────── */}
      <Section
        title="Topics"
        description="Evidence levels are described rather than scored, and every one can be opened to see the attempts behind it."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to={path('/progress')}>
              All progress
              <ArrowRightIcon />
            </Link>
          </Button>
        }
      >
        <div className="flex flex-col gap-tight">
          {topics.map((topic) => {
            const topicEvidence = evidence.get(topic.id);
            return (
              <Link
                key={topic.id}
                to={path(`/progress/topic/${topic.id}`)}
                className="hover:bg-accent/50 focus-visible:ring-ring flex flex-wrap items-center gap-snug rounded-lg border p-snug outline-none transition-colors focus-visible:ring-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{topic.title}</span>
                  {topic.module && (
                    <span className="text-muted-foreground text-xs">{topic.module}</span>
                  )}
                </span>
                {topic.priority === 'high' && (
                  <Badge variant="secondary" className="font-normal">
                    High priority
                  </Badge>
                )}
                {topicEvidence && (
                  <>
                    <EvidenceMeter
                      level={topicEvidence.level}
                      label={topic.title}
                      className="w-24"
                    />
                    <EvidenceChip level={topicEvidence.level} />
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </Section>

      {/* ── Recent work in this course ────────────────────────────────── */}
      {recent.length > 0 && (
        <Section
          title="Recent work"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/history">
                Full history
                <ArrowRightIcon />
              </Link>
            </Button>
          }
        >
          <Card>
            <CardContent className="flex flex-col gap-tight">
              {recent.map((attempt) => (
                <Link
                  key={attempt.id}
                  to={path(
                    attempt.kind === 'exam'
                      ? `/exams/results/${attempt.id}`
                      : `/practice/results/${attempt.id}`,
                  )}
                  className="hover:bg-accent/50 focus-visible:ring-ring -mx-snug flex flex-wrap items-center gap-snug rounded-md px-snug py-1.5 outline-none focus-visible:ring-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{attempt.title}</span>
                  <Badge variant="secondary" className="font-normal">
                    {attempt.mode === 'exam'
                      ? 'Exam conditions'
                      : attempt.mode === 'self-rated'
                        ? 'Self-rated'
                        : 'Practice'}
                  </Badge>
                  {attempt.marksAvailable > 0 && (
                    <span className="font-mono text-xs tabular-nums">
                      {attempt.marksAwarded}/{attempt.marksAvailable}
                    </span>
                  )}
                  <Separator orientation="vertical" className="h-3" />
                  <span className="text-muted-foreground text-xs">
                    {formatRelative(attempt.completedAt!)}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </Section>
      )}

      {topicMap.size > 0 && reviews.length > 0 && (
        <Section
          title="Due for review"
          description="Worked on, then left for three days or more. The rule is that simple, and it is stated rather than dressed up as a forgetting curve."
        >
          <div className="flex flex-col gap-tight">
            {reviews.map((review) => {
              const topic = topicMap.get(review.topicId);
              if (!topic) return null;
              return (
                <Link
                  key={review.topicId}
                  to={path(`/practice/new?topic=${review.topicId}&activity=flashcards`)}
                  className="hover:bg-accent/50 focus-visible:ring-ring flex flex-wrap items-center gap-snug rounded-lg border p-snug outline-none transition-colors focus-visible:ring-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{topic.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {review.daysSince} days ago
                  </span>
                </Link>
              );
            })}
          </div>
        </Section>
      )}
    </Page>
  );
}
