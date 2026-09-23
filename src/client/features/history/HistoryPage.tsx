import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlameIcon, HistoryIcon } from 'lucide-react';

import type { ActivityEvent } from '@shared/types.ts';
import { deriveEvidence } from '@shared/progress.ts';
import { localISO } from '@shared/planner.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/states';
import {
  CourseDot,
  CourseTag,
  EvidenceChip,
  formatDate,
  formatMinutes,
  formatRelative,
} from '@/components/domain';
import {
  useActiveCourses,
  useActivity,
  useAllAttempts,
  useAllTopics,
  useCourseMap,
  useStreak,
} from '@/store/selectors';
import { cn } from '@/lib/utils';

type KindFilter = 'all' | ActivityEvent['kind'];

/**
 * Everything the student has done, across every course.
 *
 * ── What this counts, and what it refuses to ──────────────────────────────
 *
 * Completed attempts and tutor sessions with real exchanges. Not page visits,
 * not generated sets, not saved configurations. The rule lives in
 * `activityEvents` so the streak, this list and the home page cannot disagree
 * about what "studied" means.
 *
 * ── Why there is no overall score ─────────────────────────────────────────
 *
 * The per-course breakdown counts topics at each evidence level and shows marks
 * where marks exist, and stops there. A single "mastery" figure across two
 * courses would have to average a self-rated flashcard against an unaided exam
 * answer, and the whole point of keeping those apart is that they are not the
 * same kind of claim. Marks, self-rated recall and time spent stay in separate
 * columns for the same reason.
 */
export function HistoryPage() {
  const courses = useActiveCourses();
  const courseMap = useCourseMap();
  const activity = useActivity();
  const attempts = useAllAttempts();
  const topics = useAllTopics();
  const streak = useStreak();

  const [courseFilter, setCourseFilter] = useState<string | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');

  const filtered = useMemo(
    () =>
      activity.filter(
        (e) =>
          (courseFilter === 'all' || e.courseId === courseFilter) &&
          (kindFilter === 'all' || e.kind === kindFilter),
      ),
    [activity, courseFilter, kindFilter],
  );

  /** Grouped by local calendar day, which is the unit a streak counts in. */
  const byDay = useMemo(() => {
    const groups = new Map<string, ActivityEvent[]>();
    for (const event of filtered) {
      const day = localISO(event.at);
      groups.set(day, [...(groups.get(day) ?? []), event]);
    }
    return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const totalMinutes = filtered.reduce((sum, e) => sum + (e.minutes ?? 0), 0);

  return (
    <Page className="py-page">
      <PageHeader
        title="Progress & history"
        description="Every completed piece of work, across your courses, newest first."
      />

      {/* ── The three headline numbers, kept separate ──────────────────── */}
      <div className="grid gap-tight sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-hairline">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <FlameIcon className="size-3.5" aria-hidden />
              Current streak
            </span>
            <span className="font-mono text-2xl tabular-nums">{streak.current}</span>
            <span className="text-muted-foreground text-xs leading-relaxed">
              {streak.todayCounted
                ? 'Today already counts.'
                : streak.current > 0
                  ? 'Today has nothing in it yet.'
                  : 'Finish something to start one.'}{' '}
              Longest: {streak.longest}.
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-hairline">
            <span className="text-muted-foreground text-xs">Recorded activity</span>
            <span className="font-mono text-2xl tabular-nums">{filtered.length}</span>
            <span className="text-muted-foreground text-xs leading-relaxed">
              Completed attempts and tutor sessions. Opening a page or generating a set
              is not counted.
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-hairline">
            <span className="text-muted-foreground text-xs">Time on recorded work</span>
            <span className="font-mono text-2xl tabular-nums">
              {formatMinutes(totalMinutes)}
            </span>
            <span className="text-muted-foreground text-xs leading-relaxed">
              Measured between starting and finishing, capped at three hours per
              activity so an abandoned tab cannot inflate it.
            </span>
          </CardContent>
        </Card>
      </div>

      {/* ── Per course ─────────────────────────────────────────────────── */}
      <Section
        title="By course"
        description="Evidence levels come from the attempt log. They are described levels rather than percentages, because that is what this much activity can support."
      >
        <div className="grid gap-tight lg:grid-cols-2">
          {courses.map((course) => {
            const courseTopics = topics.filter((t) => t.courseId === course.id);
            const courseAttempts = attempts.filter(
              (a) => a.courseId === course.id && a.completedAt,
            );
            const courseEvents = activity.filter((e) => e.courseId === course.id);

            const levels = courseTopics.map(
              (t) => deriveEvidence(t.id, courseAttempts).level,
            );
            const counts = {
              retained: levels.filter((l) => l === 'retained').length,
              independent: levels.filter((l) => l === 'independent-once').length,
              practising: levels.filter((l) => l === 'practising').length,
              untouched: levels.filter((l) => l === 'not-checked').length,
            };

            const examAttempts = courseAttempts.filter((a) => a.kind === 'exam');
            const examMarks = examAttempts.reduce(
              (acc, a) => ({
                awarded: acc.awarded + a.marksAwarded,
                available: acc.available + a.marksAvailable,
              }),
              { awarded: 0, available: 0 },
            );
            const practiceAttempts = courseAttempts.filter(
              (a) => a.kind === 'practice' && a.mode === 'practice',
            );
            const selfRated = courseAttempts.filter((a) => a.mode === 'self-rated');

            return (
              <Card
                key={course.id}
                className="border-l-4"
                style={{ borderLeftColor: `var(--accent-${course.accent})` }}
              >
                <CardContent className="flex flex-col gap-base">
                  <Link
                    to={`/course/${course.id}/progress`}
                    className="focus-visible:ring-ring rounded text-sm font-medium outline-none hover:underline focus-visible:ring-2"
                  >
                    {course.name}
                  </Link>

                  <div className="flex flex-wrap gap-tight">
                    {counts.retained > 0 && (
                      <Badge variant="secondary" className="font-normal">
                        {counts.retained} held up on review
                      </Badge>
                    )}
                    {counts.independent > 0 && (
                      <Badge variant="secondary" className="font-normal">
                        {counts.independent} answered unaided
                      </Badge>
                    )}
                    {counts.practising > 0 && (
                      <Badge variant="secondary" className="font-normal">
                        {counts.practising} practising
                      </Badge>
                    )}
                    {counts.untouched > 0 && (
                      <Badge variant="outline" className="font-normal">
                        {counts.untouched} not checked
                      </Badge>
                    )}
                  </div>

                  {/*
                    Three separate statements, deliberately not combined. Exam
                    marks are independent evidence; practice marks were earned
                    with hints available; self-rated recall is the student's own
                    judgement. One number across all three would mean nothing.
                  */}
                  <div className="text-muted-foreground flex flex-col gap-hairline text-xs leading-relaxed">
                    <span>
                      {examAttempts.length > 0
                        ? `Under exam conditions: ${examMarks.awarded} of ${examMarks.available} marks across ${examAttempts.length} ${examAttempts.length === 1 ? 'paper' : 'papers'}.`
                        : 'No work under exam conditions yet.'}
                    </span>
                    <span>
                      {practiceAttempts.length > 0
                        ? `Practice, with hints available: ${practiceAttempts.length} ${practiceAttempts.length === 1 ? 'set' : 'sets'}.`
                        : 'No marked practice yet.'}
                    </span>
                    <span>
                      {selfRated.length > 0
                        ? `Self-rated recall: ${selfRated.length} flashcard ${selfRated.length === 1 ? 'round' : 'rounds'}, graded by you.`
                        : 'No self-rated recall yet.'}
                    </span>
                    <span>
                      {formatMinutes(
                        courseEvents.reduce((sum, e) => sum + (e.minutes ?? 0), 0),
                      )}{' '}
                      recorded on this course.
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <Section title="History">
        <div className="flex flex-wrap items-center gap-tight">
          <Button
            variant={courseFilter === 'all' ? 'secondary' : 'ghost'}
            size="xs"
            onClick={() => setCourseFilter('all')}
          >
            All courses
          </Button>
          {courses.map((course) => (
            <Button
              key={course.id}
              variant={courseFilter === course.id ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setCourseFilter(course.id)}
            >
              <CourseDot accent={course.accent} />
              <span className="max-w-32 truncate">{course.name}</span>
            </Button>
          ))}

          <Separator orientation="vertical" className="h-5" />

          {(['all', 'practice', 'exam', 'tutor'] as const).map((kind) => (
            <Button
              key={kind}
              variant={kindFilter === kind ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setKindFilter(kind)}
            >
              {kind === 'all'
                ? 'Everything'
                : kind === 'practice'
                  ? 'Practice'
                  : kind === 'exam'
                    ? 'Exams'
                    : 'Tutor'}
            </Button>
          ))}
        </div>

        {byDay.length === 0 ? (
          <EmptyState
            icon={<HistoryIcon />}
            title="Nothing here yet"
            description={
              activity.length === 0
                ? 'Finish a practice set, a tutor session or a rehearsal and it will appear here.'
                : 'Nothing matches these filters.'
            }
          />
        ) : (
          <div className="flex flex-col gap-base">
            {byDay.map(([day, events]) => (
              <div key={day} className="flex flex-col gap-tight">
                <div className="flex items-baseline gap-tight">
                  <h3 className="text-sm font-medium">
                    {formatDate(`${day}T12:00:00`)}
                  </h3>
                  <span className="text-muted-foreground text-xs">
                    {formatRelative(`${day}T12:00:00`)} ·{' '}
                    {events.length === 1 ? '1 activity' : `${events.length} activities`}
                  </span>
                </div>

                {events.map((event) => {
                  const course = courseMap.get(event.courseId);
                  const scored =
                    event.marksAvailable !== undefined && event.marksAvailable > 0;
                  return (
                    <Link
                      key={`${event.kind}-${event.id}`}
                      to={event.to ?? '#'}
                      className={cn(
                        'hover:bg-accent/50 focus-visible:ring-ring flex flex-wrap items-center gap-snug rounded-lg border border-l-4 p-snug outline-none transition-colors focus-visible:ring-2',
                      )}
                      style={
                        course
                          ? { borderLeftColor: `var(--accent-${course.accent})` }
                          : undefined
                      }
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{event.title}</span>
                        {course && (
                          <CourseTag name={course.name} accent={course.accent} />
                        )}
                      </span>

                      <Badge variant="secondary" className="font-normal">
                        {event.kind === 'exam'
                          ? 'Exam conditions'
                          : event.mode === 'self-rated'
                            ? 'Self-rated'
                            : event.kind === 'tutor'
                              ? 'Tutor'
                              : 'Practice'}
                      </Badge>

                      {scored && (
                        <span className="font-mono text-xs tabular-nums">
                          {event.marksAwarded}/{event.marksAvailable}
                        </span>
                      )}

                      {event.minutes !== undefined && event.minutes > 0 && (
                        <span className="text-muted-foreground font-mono text-xs tabular-nums">
                          {formatMinutes(event.minutes)}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Topics, across courses ─────────────────────────────────────── */}
      {courseFilter !== 'all' && (
        <Section
          title="Topics in this course"
          description="Open one to see every attempt behind its level."
        >
          <div className="flex flex-col gap-tight">
            {topics
              .filter((t) => t.courseId === courseFilter)
              .map((topic) => {
                const evidence = deriveEvidence(
                  topic.id,
                  attempts.filter((a) => a.courseId === courseFilter),
                );
                return (
                  <Link
                    key={topic.id}
                    to={`/course/${courseFilter}/progress/topic/${topic.id}`}
                    className="hover:bg-accent/50 focus-visible:ring-ring flex flex-wrap items-center gap-snug rounded-lg border p-snug outline-none transition-colors focus-visible:ring-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{topic.title}</span>
                    <EvidenceChip level={evidence.level} />
                  </Link>
                );
              })}
          </div>
        </Section>
      )}
    </Page>
  );
}
