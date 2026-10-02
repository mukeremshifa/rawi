import { Select } from '@/components/ui/select';
import { useDraftState } from '@/store/drafts';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarDaysIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  ExternalLinkIcon,
  ListIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  SkipForwardIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';
import { toast } from '@/lib/toast';

import type { PlanProposal, PlannedSession } from '@shared/types.ts';
import {
  addDays,
  localISO,
  planWeek,
  proposalIsStale,
  replacedByPlan,
  weekDates,
  weekStart,
} from '@shared/planner.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/states';
import {
  ACTIVITY_LABEL,
  CourseDot,
  CourseTag,
  DueChip,
  formatDayShort,
  formatMinutes,
  formatTimeOfDay,
} from '@/components/domain';
import { useAppState, useStore } from '@/store/store';
import {
  useActiveCourses,
  useAllAssessments,
  useAllSessions,
  useAvailability,
  useCourseMap,
  useOverdueSessions,
} from '@/store/selectors';
import { SessionDialog } from './SessionDialog';
import { cn } from '@/lib/utils';

/**
 * The planner: one week, two views of the same sessions.
 *
 * ── Why week and day are views and not two planners ───────────────────────
 *
 * Both render `sessions` filtered by date. There is no separate day model, no
 * second copy of a session and nothing that can be true in one view and false
 * in the other — which is the failure mode the brief is guarding against when
 * it asks that the two agree.
 *
 * ── What "Plan my week" does and does not touch ───────────────────────────
 *
 * It proposes. Nothing is written until the student presses Apply, and the
 * proposal states its own cost first: how many generated sessions it would
 * replace, how much of the week's availability it would use, and — the part
 * that matters most — what it could not fit. Work that does not fit is listed
 * rather than dropped, because a plan that silently omits the hardest topic is
 * worse than one that admits it ran out of Tuesday.
 *
 * Completed sessions, skipped sessions, past sessions and anything the student
 * has edited are never replaced. See `planWeek` for the rule.
 */
export function PlannerPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { dispatch } = useStore();
  const state = useAppState();
  const courses = useActiveCourses();
  const courseMap = useCourseMap();
  const sessions = useAllSessions();
  const assessments = useAllAssessments();
  const availability = useAvailability();
  const overdue = useOverdueSessions();

  const today = localISO(new Date());
  const [monday, setMonday] = useDraftState('planner:week', () => params.get('week') ?? weekStart(today));
  const [courseFilter, setCourseFilter] = useDraftState<string | 'all'>('planner:course', params.get('course') ?? 'all');
  const [editing, setEditing] = useState<PlannedSession | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState<string | undefined>(undefined);
  const [proposal, setProposal] = useState<PlanProposal | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [removing, setRemoving] = useState<PlannedSession | undefined>(undefined);
  const [showAllUnscheduled, setShowAllUnscheduled] = useState(false);

  const [activityFilter, setActivityFilter] = useDraftState('planner:activity', 'all');
  const [statusFilter, setStatusFilter] = useDraftState('planner:status', 'all');
  const dates = weekDates(monday);

  /** A session id in the URL opens its day and highlights it. */
  const focusId = params.get('session') ?? undefined;
  const focused = sessions.find((s) => s.id === focusId);

  const visible = useMemo(
    () =>
      sessions.filter(
        (s) =>
          dates.includes(s.date) &&
          (courseFilter === 'all' || s.courseId === courseFilter) && (activityFilter === 'all' || s.activity === activityFilter) && (statusFilter === 'all' || s.status === statusFilter),
      ),
    [sessions, dates, courseFilter, activityFilter, statusFilter],
  );

  const weekAssessments = useMemo(
    () =>
      assessments
        .filter(
          (a) =>
            dates.includes(a.date) &&
            (courseFilter === 'all' || a.courseId === courseFilter),
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [assessments, dates, courseFilter],
  );

  const generate = () => {
    if (!availability.windows.some(w => w.endMinutes - w.startMinutes >= availability.sessionMinutes) && !availability.exceptions.some(e => dates.includes(e.date) && e.windows.some(w => w.endMinutes - w.startMinutes >= availability.sessionMinutes))) {
      navigate(`/planner/availability?return=${encodeURIComponent(`/planner?week=${monday}&course=${courseFilter}`)}`); return;
    }
    const result = planWeek(
      {
        courses: courseFilter === 'all' ? courses : courses.filter(c => c.id === courseFilter),
        topics: state.topics,
        attempts: state.attempts,
        assessments: state.assessments,
        availability,
        sessions,
        questions: state.questions,
        materials: state.materials,
        weekStart: monday,
        today,
      },
      {},
    );
    setProposal(result);
    setShowAllUnscheduled(false);
    if (result.sessions.length === 0 && result.unscheduled.length === 0) {
      toast.info('Nothing to plan', {
        description:
          'Every topic with work outstanding is already scheduled this week, or there is no availability left.',
      });
    }
  };

  const apply = () => {
    if (!proposal) return;

    /*
     * A proposal describes the week as it was when it was generated. If
     * availability, an assessment or a commitment changed in between, applying
     * it would write over the thing that just changed. So the proposal is
     * re-checked here and refused rather than allowed to win silently.
     */
    const stale = proposalIsStale(proposal, {
      sessions,
      assessments: state.assessments,
      availability,
      today,
    });
    if (stale.length > 0) {
      setProposal(null);
      toast.error('This plan is out of date', {
        description: `${stale[0]!.message} Your week changed after the plan was generated, so nothing was applied. Generate it again to plan around what is there now.`,
      });
      return;
    }

    // Remove what this plan supersedes, then write the new sessions. Both in
    // the same interaction, so the week never briefly holds both.
    for (const old of replacedByPlan(sessions, proposal, today)) {
      dispatch({ type: 'remove-session', sessionId: old.id });
    }
    dispatch({ type: 'save-sessions', sessions: proposal.sessions });
    toast.success('Week planned', {
      description: `${proposal.sessions.length} ${
        proposal.sessions.length === 1 ? 'session' : 'sessions'
      } added. Edit or move any of them, and once you do they stop being regenerated.`,
    });
    setProposal(null);
  };

  const complete = (session: PlannedSession) => {
    dispatch({
      type: 'save-session',
      session: {
        ...session,
        status: 'completed',
        completedAt: new Date().toISOString(),
      },
    });
    toast.success('Marked done', {
      description: 'Counted as study for today. It contributes to your streak once.',
    });
  };

  const skip = (session: PlannedSession) => {
    dispatch({ type: 'save-session', session: { ...session, status: 'skipped' } });
  };

  const moveTo = (session: PlannedSession, date: string) => {
    dispatch({
      type: 'save-session',
      session: { ...session, date, status: 'planned', locked: true },
    });
    toast.success('Rescheduled', { description: `Moved to ${formatDayShort(date)}.` });
  };

  const openNew = (date?: string) => {
    setEditing(undefined);
    setDialogDate(date);
    setDialogOpen(true);
  };

  const openEdit = (session: PlannedSession) => {
    setEditing(session);
    setDialogDate(undefined);
    setDialogOpen(true);
  };

  /** What a session's link opens, as a route. */
  const linkFor = (session: PlannedSession): string | null => {
    const base = `/course/${session.courseId}`;
    const course = state.courses.find(c => c.id === session.courseId);
    if (!course || course.archived) return null;
    const exam = state.activeExam; if (exam?.plannedSessionId === session.id) return `${base}/exams/run`;
    const run = state.practiceRuns.find(r => r.plannedSessionId === session.id); if (run) return `${base}/practice/run/${run.id}`;
    const tutor = state.tutorSessions.find(s => s.plannedSessionId === session.id && !s.endedAt && !s.archived); if (tutor) return `${base}/tutor/${tutor.id}`;
    if (session.link?.kind === 'material' && !state.materials.some(m => m.id === (session.link as { materialId: string }).materialId && m.courseId === session.courseId && !m.archived)) return null;
    if (session.link?.kind === 'practice-set' && !state.savedPractice.some(s => s.id === (session.link as { setId: string }).setId && s.courseId === session.courseId && !s.archived)) return null;
    if (session.link?.kind === 'exam-config' && !state.examConfigs.some(c => c.id === (session.link as { configId: string }).configId && c.courseId === session.courseId && !c.archived)) return null;
    if (session.link?.kind === 'tutor' && !state.topics.some(t => t.id === (session.link as { topicId: string }).topicId && t.courseId === session.courseId)) return null;
    if (session.link?.kind === 'mistake-review' && !state.attempts.some(a => a.id === (session.link as { attemptId: string }).attemptId && a.courseId === session.courseId)) return null;

    /*
     * A rehearsal with no saved configuration still needs somewhere to go.
     *
     * Generated rehearsal sessions name an assessment rather than one specific
     * exam configuration, because which paper to sit is the student's choice.
     * Sending them to the exam area with that assessment named is a real
     * action; leaving the session with no Open button was the alternative, and
     * an urgent-looking entry you cannot click is worse than no entry.
     */
    if (!session.link && session.activity === 'exam') {
      return `${base}/exams?session=${session.id}${
        session.assessmentId ? `&assessment=${session.assessmentId}` : ''
      }`;
    }

    if (!session.link) return null;
    switch (session.link.kind) {
      case 'mistake-review':
        return `${base}/practice/new?retry=${session.link.attemptId}&questions=${session.link.questionIds.join(',')}&session=${session.id}`;
      case 'material':
        return `${base}/materials/${session.link.materialId}?session=${session.id}`;
      case 'practice-set':
        return `${base}/practice/set/${session.link.setId}?session=${session.id}`;
      case 'exam-config':
        return `${base}/exams?config=${session.link.configId}&session=${session.id}${
          session.assessmentId ? `&assessment=${session.assessmentId}` : ''
        }`;
      case 'tutor':
        return `${base}/tutor/new?topic=${session.link.topicId}&session=${session.id}`;
      case 'practice-new':
        return `${base}/practice/new?topic=${session.link.topicIds.join(',')}&activity=${
          session.link.activity
        }&session=${session.id}`;
    }
  };

  /**
   * A session as it appears in a weekly column.
   *
   * ── Why this is a different component and not a `compact` flag ────────────
   *
   * A seventh of a desktop width is about 150px. The day-list row carries a
   * course tag, a reason, a badge row and six buttons, and none of that fits:
   * at that width the title wrapped into its neighbours and the actions
   * overflowed the column. So the weekly card shows only what identifies the
   * session, and the whole card is the control that opens it. Everything else
   * stays one click away in the day view or the edit dialog, which is reachable
   * from here by keyboard and by touch.
   *
   * The title truncates to one line and carries its full text in `title`, so
   * nothing is lost, and the status shows as a dot rather than a badge because
   * a badge is most of a column.
   */
  const WeekCard = ({ session }: { session: PlannedSession }) => {
    const course = courseMap.get(session.courseId);
    const done = session.status === 'completed';
    const skipped = session.status === 'skipped';
    const isFocused = session.id === focusId;
    const isOverdue = session.status === 'planned' && session.date < today;

    return (
      <button
        type="button"
        onClick={() => openEdit(session)}
        title={`${session.title} · ${formatTimeOfDay(session.startMinutes)} · ${
          course?.name ?? ''
        }`}
        className={cn(
          'hover:bg-accent/50 focus-visible:ring-ring flex w-full min-w-0 flex-col gap-hairline rounded-md border border-l-4 p-tight text-left outline-none transition-colors focus-visible:ring-2',
          done && 'bg-muted/40',
          skipped && 'opacity-60',
          isOverdue && 'border-dashed',
          isFocused && 'ring-ring ring-2',
        )}
        style={
          course ? { borderLeftColor: `var(--accent-${course.accent})` } : undefined
        }
      >
        <span className="flex items-center gap-hairline">
          <span className="text-muted-foreground font-mono text-[0.7rem] tabular-nums">
            {formatTimeOfDay(session.startMinutes)}
          </span>
          <span className="flex-1" />
          {done && <CheckIcon className="text-muted-foreground size-3 shrink-0" aria-hidden />}
          {skipped && (
            <SkipForwardIcon className="text-muted-foreground size-3 shrink-0" aria-hidden />
          )}
        </span>
        <span
          className={cn(
            'w-full truncate text-xs leading-snug',
            done && 'line-through',
          )}
        >
          {session.title}
        </span>
        <span className="flex min-w-0 items-center gap-hairline">
          {course && <CourseDot accent={course.accent} />}
          <span className="text-muted-foreground truncate text-[0.7rem]">
            {ACTIVITY_LABEL[session.activity]} · {formatMinutes(session.durationMinutes)}
          </span>
        </span>
        <span className="sr-only">
          {done
            ? 'Completed.'
            : skipped
              ? 'Skipped.'
              : isOverdue
                ? 'Missed.'
                : 'Planned.'}{' '}
          Opens the edit dialog for this session.
        </span>
      </button>
    );
  };

  const SessionRow = ({ session }: { session: PlannedSession }) => {
    const course = courseMap.get(session.courseId);
    const done = session.status === 'completed';
    const skipped = session.status === 'skipped';
    const to = linkFor(session);
    const isFocused = session.id === focusId;
    const isOverdue = session.status === 'planned' && session.date < today;

    return (
      <div
        className={cn(
          'flex flex-col gap-tight rounded-lg border border-l-4 p-snug transition-colors',
          done && 'bg-muted/40',
          skipped && 'opacity-60',
          isOverdue && 'border-dashed',
          isFocused && 'ring-ring ring-2',
        )}
        style={course ? { borderLeftColor: `var(--accent-${course.accent})` } : undefined}
      >
        <div className="flex flex-wrap items-center gap-tight">
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {formatTimeOfDay(session.startMinutes)}
          </span>
          <span
            className={cn('min-w-0 flex-1 text-sm', done && 'line-through')}
            title={session.title}
          >
            {session.title}
          </span>
          <Badge variant="secondary" className="font-normal">
            {ACTIVITY_LABEL[session.activity]}
          </Badge>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {formatMinutes(session.durationMinutes)}
          </span>
        </div>

        {course && (
          <CourseTag
            name={course.name}
            accent={course.accent}
            className="text-muted-foreground"
          />
        )}

        {!to && session.link && <p className="text-sm text-muted-foreground">This target is missing or archived. Restore it from its library or edit this session to choose another target.<Button size="xs" variant="outline" onClick={() => openEdit(session)}>Repair target</Button>{course?.archived && <Button size="xs" variant="outline" asChild><Link to={`/course/${course.id}/settings`}>Restore course</Link></Button>}</p>}
        {session.reason && (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {session.reason}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-tight">
          {done && (
            <Badge variant="secondary" className="font-normal">
              <CheckIcon className="size-3" />
              Done
            </Badge>
          )}
          {skipped && (
            <Badge variant="outline" className="font-normal">
              Skipped
            </Badge>
          )}
          {isOverdue && (
            <Badge variant="outline" className="font-normal">
              Missed
            </Badge>
          )}
          {session.generated && !session.locked && (
            <Badge variant="outline" className="font-normal">
              Suggested
            </Badge>
          )}

          <div className="flex-1" />

          {to && session.status === 'planned' && (
            <Button size="xs" asChild>
              <Link to={to}>
                <ExternalLinkIcon />
                Open
              </Link>
            </Button>
          )}
          {session.status === 'planned' && (
            <>
              <Button size="xs" variant="ghost" onClick={() => complete(session)}>
                <CheckIcon />
                Done
              </Button>
              <Button size="xs" variant="ghost" onClick={() => skip(session)}>
                <SkipForwardIcon />
                Skip
              </Button>
            </>
          )}
          {isOverdue && (
            <Button size="xs" variant="ghost" onClick={() => moveTo(session, today)}>
              Move to today
            </Button>
          )}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => openEdit(session)}
            aria-label={`Edit ${session.title}`}
          >
            <PencilIcon />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setRemoving(session)}
            aria-label={`Remove ${session.title}`}
            className="text-destructive"
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Page className="py-page">
      <PageHeader
        title="Planner"
        description="Your study week, across every course. Availability and sessions are yours, and the plan is a suggestion you can edit."
        actions={
          <div className="flex flex-wrap items-center gap-tight">
            <Button variant="outline" asChild>
              <Link to="/planner/availability">
                <SettingsIcon />
                Availability
              </Link>
            </Button>
            <Button variant="outline" onClick={generate}>
              <SparklesIcon />
              Plan my week
            </Button>
            <Button onClick={() => openNew(today)}>
              <PlusIcon />
              Add session
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2"><Select aria-label="Planner activity" value={activityFilter} onChange={e => setActivityFilter(e.target.value)}><option value="all">All activities</option>{['read', 'tutor', 'practice', 'flashcards', 'exam', 'review', 'other'].map(a => <option key={a}>{a}</option>)}</Select><Select aria-label="Planner status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="planned">Planned</option><option value="completed">Completed</option><option value="skipped">Skipped</option></Select><Button variant="ghost" onClick={() => { setActivityFilter('all'); setStatusFilter('all'); setCourseFilter('all'); }}>Clear filters</Button><Button variant="outline" onClick={() => { setMonday(weekStart(today)); setParams({}); }}>Today</Button></div>
      {/* ── Week navigation and filter ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-tight">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setMonday(addDays(monday, -7))}
          aria-label="Previous week"
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setMonday(addDays(monday, 7))}
          aria-label="Next week"
        >
          <ChevronRightIcon />
        </Button>
        <span className="text-sm font-medium">
          {formatDayShort(monday)} – {formatDayShort(addDays(monday, 6))}
        </span>
        {monday !== weekStart(today) && (
          <Button variant="ghost" size="sm" onClick={() => setMonday(weekStart(today))}>
            This week
          </Button>
        )}

        <div className="flex-1" />

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
        </div>
      </div>

      {focused && (
        <Alert>
          <AlertTitle>{focused.title}</AlertTitle>
          <AlertDescription>
            <span className="flex flex-col gap-snug">
              <span>
                {formatDayShort(focused.date)} at {formatTimeOfDay(focused.startMinutes)},{' '}
                {formatMinutes(focused.durationMinutes)}.{' '}
                {focused.reason ?? 'From your planner.'}
              </span>
              <span className="flex flex-wrap gap-tight">
                {linkFor(focused) && focused.status === 'planned' && (
                  <Button size="sm" asChild>
                    <Link to={linkFor(focused)!}>Open it</Link>
                  </Button>
                )}
                {!linkFor(focused) && focused.link && focused.status === 'planned' && (
                  <>
                    <span>This target is missing or archived.</span>
                    <Button size="sm" variant="outline" onClick={() => openEdit(focused)}>Repair target</Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    params.delete('session');
                    setParams(params, { replace: true });
                  }}
                >
                  Dismiss
                </Button>
              </span>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* ── The proposal ──────────────────────────────────────────────── */}
      {proposal && (
        <Section
          title="Proposed week"
          description="Nothing has changed yet. Review it, then apply or discard."
        >
          <Card className="border-primary/40">
            <CardContent className="flex flex-col gap-base">
              <div className="text-muted-foreground flex flex-wrap items-center gap-tight text-xs">
                <span className="font-mono tabular-nums">
                  {formatMinutes(proposal.minutesPlanned)} planned
                </span>
                <Separator orientation="vertical" className="h-3" />
                <span className="font-mono tabular-nums">
                  {formatMinutes(proposal.minutesAvailable)} free this week
                </span>
                <Separator orientation="vertical" className="h-3" />
                <span>
                  {proposal.sessions.length}{' '}
                  {proposal.sessions.length === 1 ? 'session' : 'sessions'} proposed
                </span>
              </div>

              {proposal.notes.map((note, i) => (
                <p key={i} className="text-muted-foreground text-xs leading-relaxed">
                  {note}
                </p>
              ))}

              {proposal.sessions.length > 0 && (
                <div className="flex flex-col gap-tight">
                  {proposal.sessions.map((session) => {
                    const course = courseMap.get(session.courseId);
                    return (
                      <div
                        key={session.id}
                        className="flex flex-col gap-hairline rounded-lg border border-l-4 p-snug"
                        style={
                          course
                            ? { borderLeftColor: `var(--accent-${course.accent})` }
                            : undefined
                        }
                      >
                        <div className="flex flex-wrap items-center gap-tight">
                          <span className="text-muted-foreground font-mono text-xs tabular-nums">
                            {formatDayShort(session.date)}{' '}
                            {formatTimeOfDay(session.startMinutes)}
                          </span>
                          <span className="min-w-0 flex-1 text-sm">{session.title}</span>
                          <span className="text-muted-foreground font-mono text-xs tabular-nums">
                            {formatMinutes(session.durationMinutes)}
                          </span>
                        </div>
                        {course && (
                          <CourseTag name={course.name} accent={course.accent} />
                        )}
        {session.reason && (
                          <p className="text-muted-foreground text-xs leading-relaxed">
                            {session.reason}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* The shortfall, stated rather than hidden. */}
              {proposal.unscheduled.length > 0 && (
                <Alert>
                  <ClockIcon />
                  <AlertTitle>
                    {proposal.unscheduled.length}{' '}
                    {proposal.unscheduled.length === 1 ? 'thing' : 'things'} did not fit
                  </AlertTitle>
                  <AlertDescription>
                    <span className="flex flex-col gap-hairline">
                      {(showAllUnscheduled
                        ? proposal.unscheduled
                        : proposal.unscheduled.slice(0, 5)
                      ).map((work, i) => {
                        const course = courseMap.get(work.courseId);
                        return (
                          <span key={i} className="text-xs">
                            <strong>{work.title}</strong>
                            {course && ` (${course.name})`}: {work.reason}
                          </span>
                        );
                      })}
                      {proposal.unscheduled.length > 5 && (
                        <Button
                          variant="ghost"
                          size="xs"
                          className="self-start"
                          onClick={() => setShowAllUnscheduled((v) => !v)}
                        >
                          {showAllUnscheduled
                            ? 'Show fewer'
                            : `Show the other ${proposal.unscheduled.length - 5}`}
                        </Button>
                      )}
                      <span className="text-xs">
                        Add availability, shorten your sessions, or accept that this week
                        does not hold everything.
                      </span>
                    </span>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap items-center gap-tight">
                <Button
                  onClick={() => {
                    const replaced = replacedByPlan(sessions, proposal, today);
                    if (replaced.length > 0) setConfirmApply(true);
                    else apply();
                  }}
                  disabled={proposal.sessions.length === 0}
                >
                  <CheckIcon />
                  Apply this plan
                </Button>
                <Button variant="ghost" onClick={() => setProposal(null)}>
                  Discard
                </Button>
              </div>
            </CardContent>
          </Card>
        </Section>
      )}

      {/* ── Assessments this week ─────────────────────────────────────── */}
      {weekAssessments.length > 0 && (
        <Section title="Assessments this week">
          <div className="flex flex-col gap-tight">
            {weekAssessments.map((assessment) => {
              const course = courseMap.get(assessment.courseId);
              return (
                <Link
                  key={assessment.id}
                  to={`/course/${assessment.courseId}/exams/assessment/${assessment.id}`}
                  className="hover:bg-accent/50 focus-visible:ring-ring flex flex-wrap items-center gap-snug rounded-lg border p-snug outline-none transition-colors focus-visible:ring-2"
                >
                  {course && <CourseDot accent={course.accent} />}
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {assessment.title}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {formatDayShort(assessment.date)}
                    {assessment.time && ` · ${assessment.time}`}
                  </span>
                  <DueChip date={assessment.date} />
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      {overdue.length > 0 && (
        <Alert>
          <AlertTitle>
            {overdue.length} missed {overdue.length === 1 ? 'session' : 'sessions'}
          </AlertTitle>
          <AlertDescription>
            Planned in the past and never marked done or skipped. Move them into this
            week, mark them done if you did the work offline, or skip them.
          </AlertDescription>
        </Alert>
      )}

      {/* ── The two views ─────────────────────────────────────────────── */}
      <Tabs defaultValue="week">
        <TabsList>
          <TabsTrigger value="week">
            <CalendarDaysIcon />
            Week
          </TabsTrigger>
          <TabsTrigger value="day">
            <ListIcon />
            Day by day
          </TabsTrigger>
        </TabsList>

        {/* The week grid. Seven columns on desktop, stacked on mobile — the
            same sessions either way. */}
        <TabsContent value="week" className="pt-base">
          {/* One intentional horizontal scroller. Columns keep a readable
              minimum width rather than shrinking their text, so a crowded
              Thursday scrolls into view instead of squeezing every day. */}
          <div className="-mx-gutter overflow-x-auto px-gutter pb-tight md:mx-0 md:px-0">
            <div className="grid grid-cols-1 gap-tight md:w-full md:min-w-[45rem] md:grid-cols-7">
            {dates.map((date) => {
              const days = visible
                .filter((s) => s.date === date)
                .sort((a, b) => a.startMinutes - b.startMinutes);
              const isToday = date === today;
              return (
                <div
                  key={date}
                  className={cn(
                    'flex min-h-32 flex-col gap-tight rounded-lg border p-snug',
                    isToday && 'border-primary bg-primary/5',
                  )}
                >
                  <div className="flex items-center justify-between gap-tight">
                    <span
                      className={cn(
                        'text-xs font-medium',
                        isToday ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {formatDayShort(date)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openNew(date)}
                      aria-label={`Add a session on ${formatDayShort(date)}`}
                    >
                      <PlusIcon />
                    </Button>
                  </div>

                  {days.length === 0 ? (
                    <span className="text-muted-foreground text-xs">
                      {availabilityNote(date, availability)}
                    </span>
                  ) : (
                    days.map((session) => (
                      <WeekCard key={session.id} session={session} />
                    ))
                  )}
                </div>
              );
            })}
            </div>
          </div>
        </TabsContent>

        {/* The day list — the same sessions, with room for their reasons. */}
        <TabsContent value="day" className="flex flex-col gap-base pt-base">
          {dates.map((date) => {
            const days = visible
              .filter((s) => s.date === date)
              .sort((a, b) => a.startMinutes - b.startMinutes);
            return (
              <Section
                key={date}
                title={
                  <span className="flex items-center gap-tight">
                    {formatDayShort(date)}
                    {date === today && (
                      <Badge variant="secondary" className="font-normal">
                        Today
                      </Badge>
                    )}
                  </span>
                }
                description={availabilityNote(date, availability)}
                actions={
                  <Button variant="ghost" size="xs" onClick={() => openNew(date)}>
                    <PlusIcon />
                    Add
                  </Button>
                }
              >
                {days.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nothing planned.</p>
                ) : (
                  <div className="flex flex-col gap-tight">
                    {days.map((session) => (
                      <SessionRow key={session.id} session={session} />
                    ))}
                  </div>
                )}
              </Section>
            );
          })}
        </TabsContent>
      </Tabs>

      {visible.length === 0 && !proposal && (
        <EmptyState
          icon={<CalendarDaysIcon />}
          title="Nothing planned this week"
          description="Add a session yourself, or let Rawi propose a week from your deadlines, your availability and what your progress shows."
          action={
            <div className="flex flex-wrap items-center justify-center gap-tight">
              <Button onClick={generate}>
                <SparklesIcon />
                Plan my week
              </Button>
              <Button variant="outline" onClick={() => openNew(today)}>
                <PlusIcon />
                Add a session
              </Button>
            </div>
          }
        />
      )}

      <SessionDialog key={editing?.id ?? `new:${dialogDate ?? today}:${courseFilter}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        {...(editing ? { session: editing } : {})}
        {...(dialogDate ? { defaultDate: dialogDate } : {})}
        {...(courseFilter !== 'all' ? { defaultCourseId: courseFilter } : {})}
      />

      <ConfirmDialog
        open={confirmApply}
        onOpenChange={setConfirmApply}
        title="Replace the earlier suggestions?"
        description={
          proposal
            ? `This adds ${proposal.sessions.length} ${
                proposal.sessions.length === 1 ? 'session' : 'sessions'
              } and removes ${replacedByPlan(sessions, proposal, today).length} that Rawi suggested earlier and you have not touched. Sessions you added or edited yourself, and anything already done or skipped, are kept exactly as they are.`
            : ''
        }
        confirmLabel="Apply the plan"
        onConfirm={() => {
          setConfirmApply(false);
          apply();
        }}
      />

      <ConfirmDialog
        open={removing !== undefined}
        onOpenChange={(open) => !open && setRemoving(undefined)}
        title={removing ? `Remove “${removing.title}”?` : ''}
        description="The session is removed from your planner. Any work you have already recorded stays in your history."
        confirmLabel="Remove session"
        onConfirm={() => {
          if (removing) dispatch({ type: 'remove-session', sessionId: removing.id });
          setRemoving(undefined);
        }}
      />
    </Page>
  );
}

/** A one-line description of a day's availability, for an empty column. */
function availabilityNote(
  date: string,
  availability: ReturnType<typeof useAvailability>,
): string {
  const exception = availability.exceptions.find((e) => e.date === date);
  if (exception) {
    return exception.windows.length === 0
      ? exception.note ?? 'Not available'
      : `${exception.note ?? 'Changed for this day'}`;
  }
  const day = new Date(`${date}T12:00:00`).getDay();
  const windows = availability.windows.filter((w) => w.day === day);
  if (windows.length === 0) return 'No study time set';
  const total = windows.reduce((sum, w) => sum + (w.endMinutes - w.startMinutes), 0);
  return `${formatMinutes(total)} free`;
}
