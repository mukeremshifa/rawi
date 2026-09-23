import { Link } from 'react-router-dom';
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  FlameIcon,
  PlusIcon,
  SparklesIcon,
} from 'lucide-react';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/states';
import {
  ACTIVITY_LABEL,
  CourseDot,
  CourseTag,
  DueChip,
  formatMinutes,
  formatRelative,
  formatTimeOfDay,
} from '@/components/domain';
import { PLAN_EXPLANATION } from '@shared/progress.ts';
import { localISO } from '@shared/planner.ts';
import {
  useActiveCourses,
  useActivity,
  useCourseMap,
  useOverdueSessions,
  usePlan,
  useSessionsOn,
  useStreak,
  useUpcomingAssessments,
} from '@/store/selectors';
import { RestoreNotice } from '@/features/courses/RestoreNotice';
import { cn } from '@/lib/utils';

/**
 * Home: the student's day, across every course.
 *
 * ── What belongs here and what belongs in a course ────────────────────────
 *
 * This screen answers "what am I doing today" and nothing else. It does not
 * duplicate a course's overview — no topic lists, no evidence ramps, no
 * materials — because the moment it starts summarising a course it becomes a
 * second, competing version of that course's own overview that will drift from
 * it.
 *
 * What it shows instead is the four things that genuinely span courses: what is
 * planned for today, what is coming up and when, what has been done recently,
 * and the streak. Each one links into the course that owns it.
 *
 * ── Why today's sessions come before the suggestions ──────────────────────
 *
 * A student who has planned their week has already answered the question this
 * screen asks. Putting the app's suggestions above their own plan would be the
 * app arguing with them. The suggestion list is still there, below, and it
 * *includes* today's planned sessions at the top of its own ranking — so the
 * two agree by construction rather than by coincidence.
 */
export function HomePage() {
  const courses = useActiveCourses();
  const courseMap = useCourseMap();
  const today = localISO(new Date());
  const todaysSessions = useSessionsOn(today);
  const overdue = useOverdueSessions();
  const upcoming = useUpcomingAssessments(4);
  const plan = usePlan();
  const activity = useActivity();
  const streak = useStreak();

  if (courses.length === 0) {
    return (
      <Page className="py-page">
        <RestoreNotice />
        <PageHeader
          title="Rawi"
          description="A study workspace for the courses you are taking."
        />
        <EmptyState
          icon={<SparklesIcon />}
          title="No courses yet"
          description="Add a course and Rawi can start planning around its topics and deadlines. You can paste a syllabus or build the outline yourself."
          action={
            <Button asChild>
              <Link to="/courses/new">
                <PlusIcon />
                Add your first course
              </Link>
            </Button>
          }
        />
      </Page>
    );
  }

  const remaining = todaysSessions.filter((s) => s.status === 'planned');
  const doneToday = todaysSessions.filter((s) => s.status === 'completed');
  const plannedMinutes = remaining.reduce((sum, s) => sum + s.durationMinutes, 0);

  return (
    <Page className="py-page">
      <RestoreNotice />

      <PageHeader
        title="Today"
        description={
          remaining.length > 0
            ? `${remaining.length} ${
                remaining.length === 1 ? 'session' : 'sessions'
              } planned, about ${formatMinutes(plannedMinutes)} in total.`
            : 'Nothing scheduled for today. The suggestions below come from your progress and deadlines.'
        }
        actions={
          <div className="flex items-center gap-tight">
            <div className="flex items-center gap-1.5 rounded-md border px-snug py-1.5">
              <FlameIcon
                className={cn(
                  'size-4',
                  streak.current > 0 ? 'text-warning-foreground' : 'text-muted-foreground',
                )}
                aria-hidden
              />
              <span className="font-mono text-sm tabular-nums">{streak.current}</span>
              <span className="text-muted-foreground text-xs">
                day{streak.current === 1 ? '' : 's'}
              </span>
            </div>
            <Button variant="outline" asChild>
              <Link to="/planner">
                <CalendarDaysIcon />
                Planner
              </Link>
            </Button>
          </div>
        }
      />

      {/* ── Today's planned work ──────────────────────────────────────── */}
      {todaysSessions.length > 0 && (
        <Section
          title="Your plan for today"
          description="From the planner. Completing the linked activity ticks the session off."
        >
          <div className="flex flex-col gap-tight">
            {todaysSessions.map((session) => {
              const course = courseMap.get(session.courseId);
              const done = session.status !== 'planned';
              return (
                <Link
                  key={session.id}
                  to={`/planner?session=${session.id}`}
                  className={cn(
                    'hover:bg-accent/50 focus-visible:ring-ring flex flex-wrap items-center gap-snug rounded-lg border border-l-4 p-snug outline-none transition-colors focus-visible:ring-2',
                    course && `border-l-[var(--accent-${course.accent})]`,
                    done && 'opacity-60',
                  )}
                >
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    {formatTimeOfDay(session.startMinutes)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-sm',
                        done && 'line-through',
                      )}
                    >
                      {session.title}
                    </span>
                    {course && (
                      <CourseTag
                        name={course.name}
                        accent={course.accent}
                        className="text-muted-foreground"
                      />
                    )}
                  </span>
                  <Badge variant="secondary" className="font-normal">
                    {ACTIVITY_LABEL[session.activity]}
                  </Badge>
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    {formatMinutes(session.durationMinutes)}
                  </span>
                  {session.status === 'completed' && (
                    <Badge variant="secondary" className="font-normal">
                      Done
                    </Badge>
                  )}
                  {session.status === 'skipped' && (
                    <Badge variant="outline" className="font-normal">
                      Skipped
                    </Badge>
                  )}
                </Link>
              );
            })}
          </div>
          {doneToday.length > 0 && (
            <p className="text-muted-foreground text-xs">
              {doneToday.length} of {todaysSessions.length} done today.
            </p>
          )}
        </Section>
      )}

      {overdue.length > 0 && (
        <Section
          title={`Missed (${overdue.length})`}
          description="Planned but not marked done or skipped. Move them into this week or let them go."
        >
          <div className="flex flex-col gap-tight">
            {overdue.slice(0, 4).map((session) => {
              const course = courseMap.get(session.courseId);
              return (
                <Link
                  key={session.id}
                  to={`/planner?session=${session.id}`}
                  className="hover:bg-accent/50 focus-visible:ring-ring flex flex-wrap items-center gap-snug rounded-lg border border-dashed p-snug outline-none transition-colors focus-visible:ring-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{session.title}</span>
                  {course && <CourseTag name={course.name} accent={course.accent} />}
                  <span className="text-muted-foreground text-xs">
                    {formatRelative(`${session.date}T12:00:00`)}
                  </span>
                </Link>
              );
            })}
          </div>
          {overdue.length > 4 && (
            <Button variant="ghost" size="sm" asChild className="self-start">
              <Link to="/planner">See all {overdue.length} in the planner</Link>
            </Button>
          )}
        </Section>
      )}

      {/* ── What Rawi suggests ────────────────────────────────────────── */}
      <Section
        title="Suggested next"
        description={PLAN_EXPLANATION}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/planner">
              Plan the week
              <ArrowRightIcon />
            </Link>
          </Button>
        }
      >
        {plan.length === 0 ? (
          <EmptyState
            title="Nothing to suggest yet"
            description="Once you have worked on something, the suggestions here will be based on it."
          />
        ) : (
          <div className="grid gap-tight md:grid-cols-2">
            {plan.map((suggestion) => {
              const course = courseMap.get(suggestion.courseId);
              return (
                <Link
                  key={suggestion.id}
                  to={suggestion.to}
                  className="hover:bg-accent/50 focus-visible:ring-ring flex flex-col gap-tight rounded-lg border p-gutter outline-none transition-colors focus-visible:ring-2"
                >
                  <span className="flex items-center gap-tight">
                    {course && (
                      <CourseTag name={course.name} accent={course.accent} />
                    )}
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
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Deadlines ─────────────────────────────────────────────────── */}
      <Section
        title="Coming up"
        description="Planned assessments across your courses, soonest first."
      >
        {upcoming.length === 0 ? (
          <EmptyState
            title="No assessments recorded"
            description="Add the dates your courses actually have, and the planner will work back from them."
            action={
              <Button variant="outline" asChild>
                <Link to="/courses">Go to your courses</Link>
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-tight">
            {upcoming.map((assessment) => {
              const course = courseMap.get(assessment.courseId);
              return (
                <Link
                  key={assessment.id}
                  to={`/course/${assessment.courseId}/exams/assessment/${assessment.id}`}
                  className="hover:bg-accent/50 focus-visible:ring-ring flex flex-wrap items-center gap-snug rounded-lg border p-snug outline-none transition-colors focus-visible:ring-2"
                >
                  {course && <CourseDot accent={course.accent} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{assessment.title}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {course?.name}
                      {assessment.topicIds.length > 0 &&
                        ` · ${assessment.topicIds.length} topics`}
                      {assessment.weightPercent !== undefined &&
                        ` · ${assessment.weightPercent}% of the grade`}
                    </span>
                  </span>
                  <DueChip date={assessment.date} />
                </Link>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Courses ───────────────────────────────────────────────────── */}
      <Section
        title="Your courses"
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/courses/new">
              <PlusIcon />
              Add
            </Link>
          </Button>
        }
      >
        <div className="grid gap-tight sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              to={`/course/${course.id}`}
              className="hover:bg-accent/50 focus-visible:ring-ring flex flex-col gap-tight rounded-lg border border-l-4 p-gutter outline-none transition-colors focus-visible:ring-2"
              style={{ borderLeftColor: `var(--accent-${course.accent})` }}
            >
              <span className="text-sm font-medium">{course.name}</span>
              {course.goal && (
                <span className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                  {course.goal}
                </span>
              )}
            </Link>
          ))}
        </div>
      </Section>

      {/* ── Recent activity ───────────────────────────────────────────── */}
      <Section
        title="Recent activity"
        description="Completed work only — opening a page or generating a set does not appear here, and does not count toward your streak."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/history">
              All history
              <ArrowRightIcon />
            </Link>
          </Button>
        }
      >
        {activity.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            description="Finish a practice set, a tutor session or a rehearsal and it will show up here."
          />
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-tight">
              {activity.slice(0, 6).map((event) => {
                const course = courseMap.get(event.courseId);
                return (
                  <Link
                    key={`${event.kind}-${event.id}`}
                    to={event.to ?? '/history'}
                    className="hover:bg-accent/50 focus-visible:ring-ring -mx-snug flex flex-wrap items-center gap-snug rounded-md px-snug py-1.5 outline-none focus-visible:ring-2"
                  >
                    {course && <CourseDot accent={course.accent} />}
                    <span className="min-w-0 flex-1 truncate text-sm">{event.title}</span>
                    {event.marksAvailable !== undefined &&
                      event.marksAvailable > 0 && (
                        <span className="text-muted-foreground font-mono text-xs tabular-nums">
                          {event.marksAwarded}/{event.marksAvailable}
                        </span>
                      )}
                    <Separator orientation="vertical" className="h-3" />
                    <span className="text-muted-foreground text-xs">
                      {formatRelative(event.at)}
                    </span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}
      </Section>
    </Page>
  );
}
