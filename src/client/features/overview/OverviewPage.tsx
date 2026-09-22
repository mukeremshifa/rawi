import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRightIcon,
  CalendarClockIcon,
  ClockIcon,
  InfoIcon,
  RotateCcwIcon,
  SettingsIcon,
  SparklesIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import type { CheckInMood } from '@shared/types.ts';
import {
  PLAN_EXPLANATION,
  daysUntilExam,
  minutesToday,
  todaysCheckIn,
} from '@shared/progress.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  EvidenceChip,
  EvidenceMeter,
  formatMinutes,
  formatRelative,
} from '@/components/domain';
import { useAppState, useStore } from '@/store/store';
import {
  useEvidence,
  usePlan,
  useRecentAttempts,
  useReviews,
  useTopicMap,
  useTopics,
} from '@/store/selectors';
import { newId } from '@/lib/id';

/**
 * The overview: what to do today, and why.
 *
 * ── The organising idea ───────────────────────────────────────────────────
 *
 * Every suggestion carries its reason on the card rather than behind a tooltip.
 * The brief asks for visible reasons, and a reason a student has to hover to
 * find is a reason they will not read — which matters here because the reason
 * is the only thing distinguishing a study plan from a list of buttons.
 *
 * The check-in sits directly beside the plan for the same reason: its whole
 * purpose is to change what the plan says, and that relationship is only
 * legible if the cause and the effect are on the same screen.
 */

const MOOD_OPTIONS: { value: CheckInMood; label: string; blurb: string }[] = [
  {
    value: 'on-track',
    label: 'About as usual',
    blurb: 'Keep the plan as it is.',
  },
  {
    value: 'less-time',
    label: 'I have less time today',
    blurb: 'Shorter activities move to the front.',
  },
  {
    value: 'struggling',
    label: 'Something is not landing',
    blurb: 'Swaps testing for an explanation on the topic you name.',
  },
  {
    value: 'confident',
    label: 'Feeling on top of it',
    blurb: 'Moves timed exam practice up.',
  },
];

function CheckInCard() {
  const { course, checkIns } = useAppState();
  const { dispatch } = useStore();
  const topics = useTopics();

  const existing = todaysCheckIn(checkIns);
  const [mood, setMood] = useState<CheckInMood>(existing?.mood ?? 'on-track');
  const [topicId, setTopicId] = useState(existing?.topicId ?? '');
  const [minutes, setMinutes] = useState(
    String(existing?.minutesToday ?? course?.dailyMinutes ?? 45),
  );
  const [note, setNote] = useState(existing?.note ?? '');

  if (!course) return null;

  const submit = () => {
    dispatch({
      type: 'add-check-in',
      checkIn: {
        id: newId('check'),
        mood,
        ...(mood === 'struggling' && topicId ? { topicId } : {}),
        ...(mood === 'less-time' ? { minutesToday: Number(minutes) || 15 } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        at: new Date().toISOString(),
      },
    });
    toast.success('Check-in saved', {
      description: 'Today’s suggestions have been reordered.',
    });
  };

  const selected = MOOD_OPTIONS.find((o) => o.value === mood);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-tight">
          <SparklesIcon className="size-4" aria-hidden />
          Check in
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-base">
        <p className="text-muted-foreground text-sm leading-relaxed">
          {existing
            ? 'You checked in earlier today. Changing this updates the plan again.'
            : 'How is today going? This changes what gets suggested, not just the time estimate.'}
        </p>

        <div className="flex flex-col gap-tight">
          <Label htmlFor="checkin-mood">Today</Label>
          <Select
            id="checkin-mood"
            value={mood}
            onChange={(e) => setMood(e.target.value as CheckInMood)}
          >
            {MOOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {selected && (
            <p className="text-muted-foreground text-xs">{selected.blurb}</p>
          )}
        </div>

        {mood === 'struggling' && (
          <div className="flex flex-col gap-tight">
            <Label htmlFor="checkin-topic">Which topic?</Label>
            <Select
              id="checkin-topic"
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
            >
              <option value="">Choose a topic…</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </div>
        )}

        {mood === 'less-time' && (
          <div className="flex flex-col gap-tight">
            <Label htmlFor="checkin-minutes">Minutes available today</Label>
            <Select
              id="checkin-minutes"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            >
              {['10', '15', '20', '30'].map((m) => (
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
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Kept blanking on the comparison structure…"
          />
        </div>

        <Button
          onClick={submit}
          disabled={mood === 'struggling' && !topicId}
          className="self-start"
        >
          {existing ? 'Update check-in' : 'Save check-in'}
        </Button>
      </CardContent>
    </Card>
  );
}

export function OverviewPage() {
  const state = useAppState();
  const { resetDemo } = useStore();
  const navigate = useNavigate();
  const plan = usePlan();
  const reviews = useReviews();
  const evidence = useEvidence();
  const topics = useTopics();
  const topicMap = useTopicMap();
  const recent = useRecentAttempts(4);

  if (!state.course) {
    return (
      <Page width="prose" className="py-page">
        <PageHeader
          title="Set up your course"
          description="Rawi needs to know what you are studying and when the exam is before it can suggest anything."
        />
        <Button onClick={() => navigate('/setup')} className="self-start">
          Start setup
        </Button>
      </Page>
    );
  }

  const course = state.course;
  const days = daysUntilExam(course);
  const available = minutesToday(course, state.checkIns);
  const checkIn = todaysCheckIn(state.checkIns);

  return (
    <Page>
      <PageHeader
        title={course.name}
        description={course.goal}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/setup">
                <SettingsIcon />
                Course settings
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetDemo();
                toast.success('Demo reset', {
                  description: 'Local data has been cleared and reseeded.',
                });
              }}
            >
              <RotateCcwIcon />
              Reset demo
            </Button>
          </>
        }
      />

      {/* The three numbers a student wants without navigating. */}
      <div className="grid gap-base sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-snug">
            <CalendarClockIcon className="text-muted-foreground size-5" aria-hidden />
            <div className="flex flex-col">
              <span className="font-mono text-xl tabular-nums">
                {days === 0 ? 'Today' : days}
              </span>
              <span className="text-muted-foreground text-xs">
                {days === 0 ? 'Exam is today' : `days until the exam`}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-snug">
            <ClockIcon className="text-muted-foreground size-5" aria-hidden />
            <div className="flex flex-col">
              <span className="font-mono text-xl tabular-nums">
                {formatMinutes(available)}
              </span>
              <span className="text-muted-foreground text-xs">
                {checkIn?.minutesToday !== undefined
                  ? 'available today, from your check-in'
                  : 'your usual daily time'}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-snug">
            <RotateCcwIcon className="text-muted-foreground size-5" aria-hidden />
            <div className="flex flex-col">
              <span className="font-mono text-xl tabular-nums">{reviews.length}</span>
              <span className="text-muted-foreground text-xs">
                {reviews.length === 1 ? 'topic due for review' : 'topics due for review'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-section lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-section">
          <Section
            title="Suggested today"
            description={`Ordered for the ${formatMinutes(available)} you have.`}
            actions={
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <InfoIcon />
                    How this is ordered
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="max-w-sm text-sm leading-relaxed">
                  {PLAN_EXPLANATION}
                </PopoverContent>
              </Popover>
            }
          >
            {plan.length === 0 ? (
              <EmptyState
                icon={<SparklesIcon />}
                title="Nothing to suggest yet"
                description="Add a reading or start a tutor session, and the plan will have something to work from."
                action={
                  <Button asChild>
                    <Link to="/materials">Go to materials</Link>
                  </Button>
                }
              />
            ) : (
              <ol className="flex flex-col gap-snug">
                {plan.map((suggestion, index) => (
                  <li key={suggestion.id}>
                    <Card
                      className={
                        index === 0 ? 'border-primary/40 bg-primary/[0.03]' : undefined
                      }
                    >
                      <CardContent className="flex flex-wrap items-start justify-between gap-base">
                        <div className="flex min-w-0 flex-col gap-tight">
                          <div className="flex flex-wrap items-center gap-tight">
                            {index === 0 && <Badge>Start here</Badge>}
                            <span className="font-medium">{suggestion.title}</span>
                          </div>
                          <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
                            {suggestion.reason}
                          </p>
                          <span className="text-muted-foreground font-mono text-xs tabular-nums">
                            about {suggestion.minutes} min
                          </span>
                        </div>
                        <Button
                          variant={index === 0 ? 'default' : 'outline'}
                          size="sm"
                          asChild
                        >
                          <Link to={suggestion.to}>
                            Start
                            <ArrowRightIcon />
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section
            title="Topics"
            description="Evidence is a description of what your attempts show, not a score."
            actions={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/progress">See progress</Link>
              </Button>
            }
          >
            <div className="grid gap-snug sm:grid-cols-2">
              {topics.map((topic) => {
                const ev = evidence.get(topic.id);
                return (
                  <Link
                    key={topic.id}
                    to={`/progress/topic/${topic.id}`}
                    className="hover:bg-accent/50 focus-visible:ring-ring flex flex-col gap-snug rounded-lg border p-gutter outline-none transition-colors focus-visible:ring-2"
                  >
                    <div className="flex items-start justify-between gap-tight">
                      <span className="font-medium">{topic.title}</span>
                      {topic.priority === 'high' && (
                        <Badge variant="outline" className="shrink-0">
                          High priority
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                      {topic.summary}
                    </p>
                    <EvidenceMeter
                      level={ev?.level ?? 'not-checked'}
                      label={topic.title}
                    />
                    <EvidenceChip level={ev?.level ?? 'not-checked'} />
                  </Link>
                );
              })}
            </div>
          </Section>
        </div>

        <div className="flex flex-col gap-section">
          <CheckInCard />

          <Section title="Recent work">
            {recent.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing recorded yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-tight">
                {recent.map((attempt) => (
                  <li key={attempt.id}>
                    <Link
                      to={
                        attempt.kind === 'exam'
                          ? `/exams/results/${attempt.id}`
                          : `/practice/results/${attempt.id}`
                      }
                      className="hover:bg-accent/50 focus-visible:ring-ring flex flex-col gap-hairline rounded-md border p-snug outline-none transition-colors focus-visible:ring-2"
                    >
                      <span className="truncate text-sm font-medium">
                        {attempt.title}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-tight text-xs">
                        <span className="font-mono tabular-nums">
                          {attempt.marksAwarded}/{attempt.marksAvailable}
                        </span>
                        <Separator orientation="vertical" className="h-3" />
                        <span>{formatRelative(attempt.completedAt ?? attempt.startedAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {reviews.length > 0 && (
            <Section
              title="Due for review"
              description="Flagged after three days without work on a topic."
            >
              <ul className="flex flex-col gap-tight">
                {reviews.map((review) => {
                  const topic = topicMap.get(review.topicId);
                  if (!topic) return null;
                  return (
                    <li
                      key={review.topicId}
                      className="flex items-center justify-between gap-tight rounded-md border p-snug"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm">{topic.title}</span>
                        <span className="text-muted-foreground font-mono text-xs tabular-nums">
                          {review.daysSince} days ago
                        </span>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to={`/practice/new?topic=${topic.id}&activity=flashcards`}
                        >
                          Review
                        </Link>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </Page>
  );
}
