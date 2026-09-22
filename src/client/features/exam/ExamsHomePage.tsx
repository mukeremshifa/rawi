import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangleIcon,
  CopyIcon,
  GraduationCapIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { toast } from 'sonner';

import type { ExamConfig } from '@shared/types.ts';
import { daysUntilExam } from '@shared/progress.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatRelative } from '@/components/domain';
import { useAppState, useStore } from '@/store/store';
import { useQuestions, useRecentAttempts } from '@/store/selectors';
import { buildRun, validateConfig } from './engine';

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
}: {
  config: ExamConfig;
  onStart: () => void;
  onDelete?: () => void;
}) {
  const pool = useQuestions();
  const validation = validateConfig(config, pool);
  const blocked = validation.problems.length > 0;
  const questions = config.sections.reduce((sum, s) => sum + s.count, 0);

  return (
    <Card className={blocked ? 'border-destructive/40' : undefined}>
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
          {config.feedback === 'per-section' && (
            <Badge variant="outline" className="font-normal">
              Feedback per section
            </Badge>
          )}
          {config.extraTimePercent > 0 && (
            <Badge variant="outline" className="font-normal">
              +{config.extraTimePercent}% time
            </Badge>
          )}
          {config.tutorAllowed && (
            <Badge variant="outline" className="font-normal">
              Tutor assistance
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
          <Button size="sm" onClick={onStart} disabled={blocked}>
            <PlayIcon />
            Start
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/exams/build/${config.id}`}>
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
  const pool = useQuestions();
  const history = useRecentAttempts().filter((a) => a.kind === 'exam');
  const [abandoning, setAbandoning] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const start = (config: ExamConfig) => {
    if (state.activeExam) {
      toast.error('An exam is already open', {
        description: 'Resume or abandon it before starting another.',
      });
      return;
    }
    const run = buildRun(config, pool);
    if (!run) {
      toast.error('Cannot start this exam', {
        description: 'No questions match its configuration.',
      });
      return;
    }
    dispatch({ type: 'set-active-exam', run });
    navigate('/exams/run');
  };

  const presets = state.examConfigs.filter((c) => c.preset);
  const custom = state.examConfigs.filter((c) => !c.preset);
  const daysLeft = state.course ? daysUntilExam(state.course) : null;

  return (
    <Page>
      <PageHeader
        title="Exams"
        description="Timed rehearsal under conditions you set. Results count as independent evidence."
        actions={
          <Button asChild>
            <Link to="/exams/build">
              <PlusIcon />
              Build an exam
            </Link>
          </Button>
        }
      />

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
                <Link to="/exams/run">Resume</Link>
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

      {daysLeft !== null && daysLeft <= 14 && (
        <p className="text-muted-foreground text-sm">
          {daysLeft === 0
            ? 'Your exam is today.'
            : `${daysLeft} day${daysLeft === 1 ? '' : 's'} until your exam. Timed practice is worth more than more reading at this point.`}
        </p>
      )}

      <Section
        title="Presets"
        description="Ready-made papers. Customise one to keep your own version."
      >
        <div className="grid gap-snug lg:grid-cols-2">
          {presets.map((config) => (
            <ConfigCard
              key={config.id}
              config={config}
              onStart={() => start(config)}
            />
          ))}
        </div>
      </Section>

      {custom.length > 0 && (
        <Section title="Your papers">
          <div className="grid gap-snug lg:grid-cols-2">
            {custom.map((config) => (
              <ConfigCard
                key={config.id}
                config={config}
                onStart={() => start(config)}
                onDelete={() => setDeleting(config.id)}
              />
            ))}
          </div>
        </Section>
      )}

      <Section title="Past papers">
        {history.length === 0 ? (
          <EmptyState
            icon={<GraduationCapIcon />}
            title="No exams taken yet"
            description="Start with the fifteen-minute quick check. Set its duration to one or two minutes if you want to see how the timer behaves."
          />
        ) : (
          <ul className="flex flex-col gap-tight">
            {history.map((attempt) => (
              <li key={attempt.id}>
                <Link
                  to={`/exams/results/${attempt.id}`}
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
