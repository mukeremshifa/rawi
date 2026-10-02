import { useDraftState } from '@/store/drafts';
import { Input } from '@/components/ui/input';
import { RecordLibrary } from '@/components/RecordLibrary';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangleIcon,
  CalendarPlusIcon,
  CopyIcon,
  GraduationCapIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { toast } from '@/lib/toast';

import type { ExamConfig } from '@shared/types.ts';
import { pastAssessments, upcomingAssessments } from '@shared/progress.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ASSESSMENT_LABEL, DueChip, formatRelative } from '@/components/domain';
import { useAppState, useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import {
  useAssessments,
  useExamConfigs,
  useQuestions,
  useAttempts,
} from '@/store/selectors';
import { buildRun, validateConfig } from './engine';
import { cn } from '@/lib/utils';

/**
 * The exams page: presets, saved papers, an active paper, and history.
 *
 * ── An active exam takes over the page ────────────────────────────────────
 *
 * There is one active run at a time, and when one exists it is the first thing
 * on this screen with everything else pushed below. Starting a second paper
 * while one is open would discard the first silently, so that path is closed:
 * the student either resumes or abandons, and abandoning is confirmed.
 *
 * ── Saved configs are re-validated on render ──────────────────────────────
 *
 * A config saved last week may have become impossible since — a topic removed
 * in setup, a material deleted. Running `validateConfig` here means the start
 * button is disabled with the reason shown, rather than failing at launch.
 */

function ConfigCard({
  config,
  onStart,
  onDelete,
  highlighted,
}: {
  config: ExamConfig;
  onStart: () => void;
  onDelete?: () => void;
  /** True when the planner sent the student here to sit this one. */
  highlighted?: boolean;
}) {
  const pool = useQuestions();
  const path = useCoursePath();
  const validation = validateConfig(config, pool);
  const blocked = validation.problems.length > 0;
  const questions = config.sections.reduce((sum, s) => sum + s.count, 0);

  return (
    <Card
      className={cn(
        blocked && 'border-destructive/40',
        highlighted && 'ring-ring border-primary ring-2',
      )}
    >
      <CardContent className="flex flex-col gap-snug">
        <div className="flex flex-wrap items-start justify-between gap-tight">
          <div className="flex min-w-0 flex-col gap-hairline">
            <span className="font-medium">{config.name}</span>
            <span className="text-muted-foreground flex flex-wrap items-center gap-tight text-xs">
              <span className="font-mono tabular-nums">
                {config.sections.length}{' '}
                {config.sections.length === 1 ? 'section' : 'sections'}
              </span>
              <Separator orientation="vertical" className="h-3" />
              <span className="font-mono tabular-nums">{questions} questions</span>
              <Separator orientation="vertical" className="h-3" />
              <span>
                {config.timing === 'untimed'
                  ? 'untimed'
                  : config.timing === 'overall'
                    ? `${config.totalMinutes} min`
                    : `${config.sections.reduce((s, x) => s + x.minutes, 0)} min across sections`}
              </span>
              <Separator orientation="vertical" className="h-3" />
              <span>{config.book === 'open' ? 'open book' : 'closed book'}</span>
            </span>
          </div>
          {config.preset && (
            <Badge variant="secondary" className="shrink-0 font-normal">
              Preset
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-hairline">
          {config.navigation === 'sequential' && (
            <Badge variant="outline" className="font-normal">
              Sequential
            </Badge>
          )}
          {config.lockSectionsOnFinish && (
            <Badge variant="outline" className="font-normal">
              Finishing a section locks it
            </Badge>
          )}
          {config.extraTimePercent > 0 && (
            <Badge variant="outline" className="font-normal">
              +{config.extraTimePercent}% time
            </Badge>
          )}
        </div>

        {blocked && (
          <p className="text-destructive flex items-start gap-tight text-xs leading-relaxed">
            <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
            {validation.problems[0]}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-tight pt-tight">
          <Button size="sm" onClick={onStart} disabled={blocked || !!config.archived}>
            <PlayIcon />
            {highlighted ? 'Start this rehearsal' : 'Start'}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={path(`/exams/build/${config.id}`)}>
              <CopyIcon />
              {config.preset ? 'Customise' : 'Edit'}
            </Link>
          </Button>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${config.name}`}
              onClick={onDelete}
            >
              <Trash2Icon />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ExamsHomePage() {
  const state = useAppState();
  const { dispatch } = useStore();
  const navigate = useNavigate();
  const course = useCourse();
  const path = useCoursePath();
  const pool = useQuestions();
  const configs = useExamConfigs();
  const allAssessments = useAssessments();
  const [assessmentQuery, setAssessmentQuery] = useDraftState(`assessments:${course.id}:query`, '');
  const assessments = allAssessments.filter(a => `${a.title} ${a.notes ?? ''}`.toLowerCase().includes(assessmentQuery.toLowerCase()));
  const history = useAttempts().filter((a) => a.kind === 'exam');
  const [abandoning, setAbandoning] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [params] = useSearchParams();

  /*
   * A planner launch names the configuration it meant and the session it came
   * from. Both used to be dropped on arrival, so the student landed on a list
   * of every rehearsal with no indication which one they had just clicked, and
   * completing one finished no planner session. They are now read here and
   * carried into the run.
   */
  const launchConfigId = params.get('config') ?? undefined;
  const launchSessionId = params.get('session') ?? undefined;
  const launchAssessmentId = params.get('assessment') ?? undefined;
  const launchConfig = configs.find((c) => c.id === launchConfigId && !c.archived);

  const start = (config: ExamConfig) => {
    if (config.archived || course.archived) return;
    if (state.activeExam) {
      toast.error('An exam is already open', {
        description: 'Resume or abandon it before starting another.',
      });
      return;
    }
    /* The planner context applies only to the configuration it named. Starting
       a different paper from this page is unrelated work and must not inherit
       the link, or it would complete a session it has nothing to do with. */
    const fromPlanner = config.id === launchConfigId;
    const run = buildRun(config, pool, {
      ...(fromPlanner && launchSessionId ? { plannedSessionId: launchSessionId } : {}),
      ...(fromPlanner && launchAssessmentId
        ? { assessmentId: launchAssessmentId }
        : {}),
    });
    if (!run) {
      toast.error('Cannot start this exam', {
        description: 'No questions match its configuration.',
      });
      return;
    }
    dispatch({ type: 'set-active-exam', run });
    navigate(path('/exams/run'));
  };

  const presets = configs.filter((c) => c.preset && !c.archived);
  const custom = configs.filter((c) => !c.preset && !c.archived);
  const upcoming = upcomingAssessments(assessments);
  const past = pastAssessments(assessments);

  return (
    <Page>
      <PageHeader
        title="Exams"
        description="Your real assessment dates, and the rehearsals you build to prepare for them."
        actions={
          <div className="flex flex-wrap items-center gap-tight">
            <Button variant="outline" asChild>
              <Link to={path('/exams/assessment')}>
                <CalendarPlusIcon />
                Add an assessment
              </Link>
            </Button>
            <Button asChild>
              <Link to={path('/exams/build')}>
                <PlusIcon />
                Build a rehearsal
              </Link>
            </Button>
          </div>
        }
      />

      {/* Says which rehearsal was meant, rather than leaving the student to
          guess which of several the planner sent them to. */}
      {launchConfigId && !launchConfig && <Alert><AlertTitle>Rehearsal configuration unavailable</AlertTitle><AlertDescription>It may have been deleted or belong to another course. Choose a saved configuration below or edit the planner target.</AlertDescription></Alert>}
      {!pool.length && <Alert><AlertTitle>Prepare questions before rehearsing</AlertTitle><AlertDescription>This course has no question bank. Add readable material and generate supported practice questions.<Button variant="outline" size="sm" asChild><Link to={path('/practice/new')}>Prepare practice questions</Link></Button></AlertDescription></Alert>}
      <Input aria-label="Search assessment titles" placeholder="Search assessments" value={assessmentQuery} onChange={e => setAssessmentQuery(e.target.value)} />{assessmentQuery && <Button variant="ghost" onClick={() => setAssessmentQuery('')}>Clear assessment search</Button>}
      {launchConfig && !state.activeExam && (
        <Alert>
          <AlertTitle>Ready to sit {launchConfig.name}</AlertTitle>
          <AlertDescription>
            <span className="flex flex-col gap-snug">
              <span>
                Your planner opened this one. Starting it from here records the
                result against that planned session, once.
              </span>
              <span className="flex flex-wrap gap-tight">
                <Button size="sm" onClick={() => start(launchConfig)}>
                  Start {launchConfig.name}
                </Button>
              </span>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {state.activeExam && (
        <Alert>
          <AlertTitle>You have an exam in progress</AlertTitle>
          <AlertDescription className="flex flex-col gap-snug">
            <span>
              {state.activeExam.configSnapshot.name}, started{' '}
              {formatRelative(state.activeExam.startedAt)}. Your answers are
              saved on this device.
              {state.activeExam.configSnapshot.timing !== 'untimed' &&
                ' Its timer has been running since you started it.'}
            </span>
            <span className="flex flex-wrap gap-tight">
              <Button size="sm" asChild>
                <Link to={`/course/${state.activeExam.courseId}/exams/run`}>Resume</Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAbandoning(true)}
              >
                Abandon it
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Planned assessments: the real milestones ─────────────── */}
      <Section
        title="Planned assessments"
        description={`Real dates in ${course.name}: a quiz, a midterm, a final. These drive countdowns and the planner, and the rehearsals below are how you prepare for them.`}
      >
        {upcoming.length === 0 && past.length === 0 ? (
          <EmptyState
            icon={<CalendarPlusIcon />}
            title="No assessments recorded"
            description="Add the dates this course actually has and the planner will work back from them, prioritising whatever each one covers."
            action={
              <Button asChild>
                <Link to={path('/exams/assessment')}>
                  <CalendarPlusIcon />
                  Add an assessment
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-tight">
            {upcoming.map((assessment) => (
              <Link
                key={assessment.id}
                to={path(`/exams/assessment/${assessment.id}`)}
                className="hover:bg-accent/50 focus-visible:ring-ring flex flex-wrap items-center gap-snug rounded-lg border p-snug outline-none transition-colors focus-visible:ring-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {assessment.title}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {ASSESSMENT_LABEL[assessment.type]}
                    {assessment.time && ` · ${assessment.time}`}
                    {assessment.durationMinutes !== undefined &&
                      ` · ${assessment.durationMinutes} min`}
                    {assessment.topicIds.length > 0
                      ? ` · covers ${assessment.topicIds.length} topics`
                      : ' · whole course'}
                    {assessment.weightPercent !== undefined &&
                      ` · ${assessment.weightPercent}%`}
                  </span>
                </span>
                <DueChip date={assessment.date} />
              </Link>
            ))}

            {past.length > 0 && (
              <>
                <p className="text-muted-foreground pt-tight text-xs">
                  Past assessments, kept and readable, but no longer driving
                  countdowns.
                </p>
                {past.map((assessment) => (
                  <Link
                    key={assessment.id}
                    to={path(`/exams/assessment/${assessment.id}`)}
                    className="hover:bg-accent/50 focus-visible:ring-ring flex flex-wrap items-center gap-snug rounded-lg border border-dashed p-snug opacity-75 outline-none transition-colors focus-visible:ring-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {assessment.title}
                    </span>
                    <DueChip date={assessment.date} />
                  </Link>
                ))}
              </>
            )}
          </div>
        )}
      </Section>

      <Section
        title="Rehearsal presets"
        description="Ready-made papers to practise under exam conditions. Nothing is marked until you submit the whole paper. Customise one to keep your own version."
      >
        <div className="grid gap-snug lg:grid-cols-2">
          {presets.map((config) => (
            <ConfigCard
              key={config.id}
              config={config}
              highlighted={config.id === launchConfigId}
              onStart={() => start(config)}
            />
          ))}
        </div>
      </Section>

      {custom.length > 0 && (
        <Section title="Your rehearsal papers">
          <div className="grid gap-snug lg:grid-cols-2">
            {custom.map((config) => (
              <ConfigCard
                key={config.id}
                config={config}
                highlighted={config.id === launchConfigId}
                onStart={() => start(config)}
                onDelete={state.activeExam?.configId === config.id ? undefined : () => setDeleting(config.id)}
              />
            ))}
          </div>
        </Section>
      )}

      <RecordLibrary kind="exam" />

      <Section
        title="Rehearsal attempts"
        description="Every run you have sat. These are your own practice under exam conditions, not the assessments themselves."
      >
        {history.length === 0 ? (
          <EmptyState
            icon={<GraduationCapIcon />}
            title="No exams taken yet"
            description="Prepare a question bank, then build a rehearsal paper. Saved results will appear here." action={<Button variant="outline" asChild><Link to={path('/practice/new')}>Prepare practice questions</Link></Button>}
          />
        ) : (
          <ul className="flex flex-col gap-tight">
            {history.map((attempt) => (
              <li key={attempt.id}>
                <Link
                  to={path(`/exams/results/${attempt.id}`)}
                  className="hover:bg-accent/50 focus-visible:ring-ring flex items-center justify-between gap-tight rounded-md border p-snug outline-none transition-colors focus-visible:ring-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{attempt.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatRelative(attempt.completedAt ?? attempt.startedAt)} ·{' '}
                      {attempt.questions.length} questions
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    {attempt.marksAwarded}/{attempt.marksAvailable}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ConfirmDialog
        open={abandoning}
        onOpenChange={setAbandoning}
        title="Abandon this exam?"
        description="The paper and every answer on it are discarded. Nothing is recorded in your progress."
        confirmLabel="Abandon"
        onConfirm={() => {
          dispatch({ type: 'set-active-exam', run: null });
          setAbandoning(false);
          toast.success('Exam abandoned');
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this paper?"
        description="The configuration is removed. Results from papers already taken are kept."
        onConfirm={() => {
          if (deleting) dispatch({ type: 'remove-exam-config', configId: deleting });
          setDeleting(null);
          toast.success('Paper deleted');
        }}
      />
    </Page>
  );
}
