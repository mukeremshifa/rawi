import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CheckIcon,
  ClockIcon,
  FlagIcon,
  LightbulbIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import type { AnswerValue, ExamRun } from '@shared/types.ts';
import { hasContent, toQuestionAttempt } from '@shared/marking.ts';

import { Prose } from '@/components/Prose';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { MEDIA_WIDE, useMediaQuery } from '@/components/layout';
import { FORMAT_LABEL, formatClock } from '@/components/domain';
import { useAppState, useStore } from '@/store/store';
import { useMaterials, useQuestionMap } from '@/store/selectors';
import { QuestionView } from '@/features/practice/QuestionView';
import { QuestionFeedback } from '@/features/practice/QuestionFeedback';
import { finishRun, sectionAnsweredCount, sectionDeadline } from './engine';
import { cn } from '@/lib/utils';

/**
 * Sitting an exam.
 *
 * ── The priority order on screen ──────────────────────────────────────────
 *
 * The brief lists what the environment must prioritise, and the layout follows
 * it literally: time remaining and marks in a fixed bar that never scrolls
 * away, instructions at the top of each section, the question and its answer
 * entry in the generous middle, and navigation plus flags in a map that is a
 * rail on desktop and a sheet on mobile.
 *
 * ── Answer preservation ───────────────────────────────────────────────────
 *
 * Every answer lives on the run, in the store, keyed by question id. Navigation
 * changes an index and nothing else. This is why moving between questions
 * cannot lose an answer: there is nowhere for it to be lost *to* — the input is
 * controlled by the run, and the run is persisted on every change.
 *
 * ── Expiry ────────────────────────────────────────────────────────────────
 *
 * One interval ticks a clock. When a whole-paper deadline passes the paper is
 * submitted exactly as it stands. When a *section* deadline passes, that
 * section is closed and the run advances to the next — and if it was the last,
 * the paper submits. Both paths end in the same results state, which is what
 * the brief asks for: a timed finish and a manual finish must not produce two
 * different kinds of outcome.
 */

const TICK_MS = 500;

export function ExamRunPage() {
  const { activeExam } = useAppState();
  const { dispatch } = useStore();
  const navigate = useNavigate();
  const questionMap = useQuestionMap();
  const materials = useMaterials();
  const wide = useMediaQuery(MEDIA_WIDE);

  const [now, setNow] = useState(() => Date.now());
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [hinted, setHinted] = useState<Set<string>>(new Set());
  /** Guards against the expiry effect firing twice before the state settles. */
  const finishing = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const config = activeExam?.configSnapshot;
  const section = config?.sections[activeExam?.currentSectionIndex ?? 0];

  const update = useCallback(
    (patch: Partial<ExamRun>) => {
      if (!activeExam) return;
      dispatch({ type: 'set-active-exam', run: { ...activeExam, ...patch } });
    },
    [activeExam, dispatch],
  );

  const submit = useCallback(
    (finish: 'manual' | 'expired') => {
      if (!activeExam || finishing.current) return;
      finishing.current = true;

      const attempt = finishRun(activeExam, questionMap, finish, hinted);
      dispatch({ type: 'record-attempt', attempt });
      dispatch({ type: 'set-active-exam', run: null });

      toast[finish === 'expired' ? 'warning' : 'success'](
        finish === 'expired' ? 'Time expired — paper submitted' : 'Paper submitted',
        {
          description: `${attempt.marksAwarded} of ${attempt.marksAvailable} marks.`,
        },
      );
      navigate(`/exams/results/${attempt.id}`, { replace: true });
    },
    [activeExam, questionMap, hinted, dispatch, navigate],
  );

  /** Closes the current section and moves on, or submits if it was the last. */
  const closeSection = useCallback(
    (reason: 'submitted' | 'expired') => {
      if (!activeExam || !config || !section) return;
      const nextIndex = activeExam.currentSectionIndex + 1;
      const outcome = {
        sectionId: section.id,
        ended: reason,
        endedAt: new Date().toISOString(),
      };

      if (nextIndex >= config.sections.length) {
        update({ sectionOutcomes: [...activeExam.sectionOutcomes, outcome] });
        // The run in the store is one render behind, so finish from a merged
        // copy rather than waiting for the dispatch to land.
        const merged: ExamRun = {
          ...activeExam,
          sectionOutcomes: [...activeExam.sectionOutcomes, outcome],
        };
        finishing.current = true;
        const attempt = finishRun(
          merged,
          questionMap,
          reason === 'expired' ? 'expired' : 'manual',
          hinted,
        );
        dispatch({ type: 'record-attempt', attempt });
        dispatch({ type: 'set-active-exam', run: null });
        toast[reason === 'expired' ? 'warning' : 'success'](
          reason === 'expired'
            ? 'Final section expired — paper submitted'
            : 'Paper submitted',
          { description: `${attempt.marksAwarded} of ${attempt.marksAvailable} marks.` },
        );
        navigate(`/exams/results/${attempt.id}`, { replace: true });
        return;
      }

      const deadline = sectionDeadline(config, nextIndex);
      update({
        currentSectionIndex: nextIndex,
        currentQuestionIndex: 0,
        sectionOutcomes: [...activeExam.sectionOutcomes, outcome],
        lockedSectionIds:
          config.feedback === 'per-section'
            ? [...activeExam.lockedSectionIds, section.id]
            : activeExam.lockedSectionIds,
        ...(deadline ? { sectionDeadlineAt: deadline } : {}),
      });

      if (reason === 'expired') {
        toast.warning(`Time up on ${section.title}`, {
          description:
            config.feedback === 'per-section'
              ? 'Its answers are locked. Feedback is below.'
              : 'Moving to the next section.',
        });
      }
    },
    [activeExam, config, section, update, questionMap, hinted, dispatch, navigate],
  );

  /* The expiry watcher. One effect, both kinds of deadline. */
  useEffect(() => {
    if (!activeExam || finishing.current) return;

    if (activeExam.deadlineAt && now >= new Date(activeExam.deadlineAt).getTime()) {
      submit('expired');
      return;
    }
    if (
      activeExam.sectionDeadlineAt &&
      now >= new Date(activeExam.sectionDeadlineAt).getTime()
    ) {
      closeSection('expired');
    }
  }, [now, activeExam, submit, closeSection]);

  /*
   * The "no active exam" guard.
   *
   * ── Why `finishing` is part of the condition ──────────────────────────────
   *
   * Submitting clears the active run and then navigates to the results. Those
   * are two steps, and between them this component re-renders with no run — so
   * a guard that only checks `activeExam` fires its redirect first and the
   * student lands on the exams list instead of their results. The timed-expiry
   * path hit this every time, which is exactly the path where seeing the
   * results matters most.
   *
   * `finishing` is set synchronously before either dispatch, so it is already
   * true on that intermediate render and the guard stands down and lets the
   * pending navigation win.
   */
  if (finishing.current) return null;

  if (!activeExam || !config || !section) {
    return <Navigate to="/exams" replace />;
  }

  const questionIds = activeExam.sectionQuestions[section.id] ?? [];
  const questionId = questionIds[activeExam.currentQuestionIndex];
  const question = questionId ? questionMap.get(questionId) : undefined;
  const sectionLocked = activeExam.lockedSectionIds.includes(section.id);

  const deadline = activeExam.sectionDeadlineAt ?? activeExam.deadlineAt;
  const remaining = deadline ? new Date(deadline).getTime() - now : null;
  const urgent = remaining !== null && remaining < 60_000;

  const totalMarks = config.sections.reduce(
    (sum, s) =>
      sum +
      (activeExam.sectionQuestions[s.id] ?? []).reduce(
        (m, id) => m + (questionMap.get(id)?.marks ?? 0),
        0,
      ),
    0,
  );

  const answeredInSection = sectionAnsweredCount(activeExam, section.id);
  const lastQuestion = activeExam.currentQuestionIndex === questionIds.length - 1;
  const lastSection = activeExam.currentSectionIndex === config.sections.length - 1;

  const setAnswer = (value: AnswerValue) => {
    if (!questionId || sectionLocked) return;
    update({ answers: { ...activeExam.answers, [questionId]: value } });
  };

  const goTo = (index: number) => {
    if (config.navigation === 'sequential' && index < activeExam.currentQuestionIndex) {
      toast.info('Sequential paper', {
        description: 'This exam does not allow going back to earlier questions.',
      });
      return;
    }
    update({ currentQuestionIndex: index });
  };

  const toggleFlag = () => {
    if (!questionId) return;
    update({
      flagged: activeExam.flagged.includes(questionId)
        ? activeExam.flagged.filter((id) => id !== questionId)
        : [...activeExam.flagged, questionId],
    });
  };

  const unanswered = questionIds.filter(
    (id) => !hasContent(activeExam.answers[id]),
  ).length;

  const marked =
    sectionLocked && question && questionId
      ? toQuestionAttempt(
          question,
          activeExam.answers[questionId] ?? { kind: 'none' },
          hinted.has(questionId),
        )
      : null;

  const QuestionMap = (
    <div className="flex flex-col gap-section p-gutter">
      {config.sections.map((s, sIndex) => {
        const ids = activeExam.sectionQuestions[s.id] ?? [];
        const isCurrent = sIndex === activeExam.currentSectionIndex;
        const isPast = sIndex < activeExam.currentSectionIndex;
        return (
          <div key={s.id} className="flex flex-col gap-tight">
            <div className="flex items-center justify-between gap-tight">
              <span
                className={cn(
                  'text-sm font-medium',
                  !isCurrent && 'text-muted-foreground',
                )}
              >
                {s.title}
              </span>
              {isPast && (
                <Badge variant="secondary" className="font-normal">
                  {activeExam.lockedSectionIds.includes(s.id) ? 'Locked' : 'Done'}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-hairline">
              {ids.map((id, qIndex) => {
                const answered = hasContent(activeExam.answers[id]);
                const flagged = activeExam.flagged.includes(id);
                const active = isCurrent && qIndex === activeExam.currentQuestionIndex;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!isCurrent}
                    onClick={() => {
                      goTo(qIndex);
                      setMapOpen(false);
                    }}
                    aria-current={active ? 'true' : undefined}
                    aria-label={`${s.title}, question ${qIndex + 1}${
                      answered ? ', answered' : ', not answered'
                    }${flagged ? ', flagged' : ''}`}
                    className={cn(
                      'focus-visible:ring-ring relative size-8 rounded-md border font-mono text-xs tabular-nums outline-none transition-colors focus-visible:ring-2',
                      active && 'border-primary bg-primary text-primary-foreground',
                      !active && answered && 'bg-secondary',
                      !active && !answered && isCurrent && 'hover:bg-accent',
                      !isCurrent && 'opacity-50',
                    )}
                  >
                    {qIndex + 1}
                    {flagged && (
                      <span
                        className="bg-warning absolute -top-0.5 -right-0.5 size-2 rounded-full"
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {activeExam.flagged.length > 0 && (
        <div className="flex flex-col gap-tight">
          <span className="text-sm font-medium">
            Flagged ({activeExam.flagged.length})
          </span>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Marked to come back to. They are listed again before you submit.
          </p>
        </div>
      )}

      <div className="text-muted-foreground flex flex-col gap-hairline text-xs">
        <span>
          {config.book === 'open' ? 'Open book' : 'Closed book'} ·{' '}
          {config.navigation === 'free' ? 'free navigation' : 'sequential'}
        </span>
        <span>
          {config.feedback === 'per-section'
            ? 'Feedback after each section'
            : 'Feedback after submission'}
        </span>
        {config.extraTimePercent > 0 && (
          <span>Extra time: +{config.extraTimePercent}%</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The bar that never scrolls away. */}
        <div className="bg-background flex shrink-0 flex-wrap items-center gap-snug border-b px-gutter py-snug">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{config.name}</span>
            <span className="text-muted-foreground text-xs">
              {section.title} · question {activeExam.currentQuestionIndex + 1} of{' '}
              {questionIds.length}
            </span>
          </div>

          <div className="flex-1" />

          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {totalMarks} marks
          </span>

          {remaining !== null && (
            <div
              className={cn(
                'flex items-center gap-tight rounded-md border px-snug py-1',
                urgent && 'border-destructive text-destructive',
              )}
              role="timer"
              aria-live={urgent ? 'assertive' : 'off'}
            >
              <ClockIcon className="size-3.5" aria-hidden />
              <span className="font-mono text-sm tabular-nums">
                {formatClock(remaining)}
              </span>
              {config.timing === 'per-section' && (
                <span className="text-muted-foreground text-xs">this section</span>
              )}
            </div>
          )}

          {config.timing === 'untimed' && (
            <Badge variant="secondary" className="font-normal">
              Untimed
            </Badge>
          )}

          {config.book === 'open' && config.allowedMaterialIds.length > 0 && (
            <Sheet open={materialsOpen} onOpenChange={setMaterialsOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <BookOpenIcon />
                  Materials
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[28rem] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Allowed materials</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-section p-gutter">
                  {config.allowedMaterialIds.map((id) => {
                    const material = materials.find((m) => m.id === id);
                    if (!material) return null;
                    return (
                      <div key={id} className="flex flex-col gap-snug">
                        <h3 className="font-serif text-lg">{material.title}</h3>
                        {material.passages.map((passage) => (
                          <div key={passage.id} className="flex flex-col gap-tight">
                            <h4 className="text-sm font-medium">{passage.heading}</h4>
                            <Prose text={passage.text} size="compact" />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
          )}

          {!wide && (
            <Sheet open={mapOpen} onOpenChange={setMapOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  Questions
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 overflow-y-auto p-0">
                <SheetHeader className="border-b">
                  <SheetTitle>Paper</SheetTitle>
                </SheetHeader>
                {QuestionMap}
              </SheetContent>
            </Sheet>
          )}

          <Button size="sm" onClick={() => setConfirmSubmit(true)}>
            <CheckIcon />
            {lastSection ? 'Finish' : 'Submit section'}
          </Button>
        </div>

        <Progress
          value={
            ((activeExam.currentQuestionIndex + 1) / Math.max(1, questionIds.length)) * 100
          }
          className="h-1 rounded-none"
          aria-label="Position in this section"
        />

        {/* The reading and writing space. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-base px-gutter py-gutter">
            {activeExam.currentQuestionIndex === 0 && (
              <Alert>
                <AlertTitle>{section.title}</AlertTitle>
                <AlertDescription>{section.instructions}</AlertDescription>
              </Alert>
            )}

            {sectionLocked && (
              <Alert>
                <AlertTriangleIcon />
                <AlertTitle>This section is locked</AlertTitle>
                <AlertDescription>
                  Its feedback has been released, so the answers can no longer be
                  changed.
                </AlertDescription>
              </Alert>
            )}

            {question ? (
              <Card>
                <CardContent className="flex flex-col gap-base">
                  <div className="flex flex-wrap items-center gap-tight">
                    <span className="text-muted-foreground font-mono text-xs tabular-nums">
                      {activeExam.currentQuestionIndex + 1}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {FORMAT_LABEL[question.format]}
                    </span>
                    <Separator orientation="vertical" className="h-3" />
                    <span className="text-muted-foreground font-mono text-xs tabular-nums">
                      {question.marks} {question.marks === 1 ? 'mark' : 'marks'}
                    </span>
                    <div className="flex-1" />
                    {config.flaggingEnabled && !sectionLocked && (
                      <Button
                        variant={
                          questionId && activeExam.flagged.includes(questionId)
                            ? 'secondary'
                            : 'ghost'
                        }
                        size="sm"
                        onClick={toggleFlag}
                      >
                        <FlagIcon />
                        {questionId && activeExam.flagged.includes(questionId)
                          ? 'Flagged'
                          : 'Flag'}
                      </Button>
                    )}
                  </div>

                  <QuestionView
                    question={question}
                    answer={questionId ? activeExam.answers[questionId] : undefined}
                    onChange={setAnswer}
                    readOnly={sectionLocked}
                    hintsAllowed={config.tutorAllowed && !sectionLocked}
                    onHintUsed={() =>
                      questionId &&
                      setHinted((prev) => new Set(prev).add(questionId))
                    }
                  />

                  {config.tutorAllowed && !sectionLocked && (
                    <p className="text-muted-foreground flex items-start gap-tight text-xs">
                      <LightbulbIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
                      Tutor assistance is enabled for this paper. Taking a hint
                      records the answer as assisted rather than independent.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <p className="text-muted-foreground">This question is unavailable.</p>
            )}

            {sectionLocked && marked && question && (
              <Card>
                <CardContent>
                  <QuestionFeedback question={question} attempt={marked} />
                </CardContent>
              </Card>
            )}

            <div className="flex flex-wrap items-center gap-tight">
              <Button
                variant="outline"
                disabled={
                  activeExam.currentQuestionIndex === 0 ||
                  config.navigation === 'sequential'
                }
                onClick={() => goTo(activeExam.currentQuestionIndex - 1)}
              >
                <ArrowLeftIcon />
                Previous
              </Button>
              <Button
                disabled={lastQuestion}
                onClick={() => goTo(activeExam.currentQuestionIndex + 1)}
              >
                Next
                <ArrowRightIcon />
              </Button>
              <div className="flex-1" />
              {lastQuestion && (
                <Button variant="secondary" onClick={() => setConfirmSubmit(true)}>
                  {lastSection ? 'Finish the paper' : `Finish ${section.title}`}
                </Button>
              )}
            </div>

            {config.navigation === 'sequential' && (
              <p className="text-muted-foreground text-xs">
                This paper is sequential: once you move on you cannot return to
                an earlier question.
              </p>
            )}
          </div>
        </div>
      </div>

      {wide && (
        <aside className="w-72 shrink-0 overflow-y-auto border-l">{QuestionMap}</aside>
      )}

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title={lastSection ? 'Submit the paper?' : `Finish ${section.title}?`}
        description={
          <span className="flex flex-col gap-tight">
            <span>
              {answeredInSection} of {questionIds.length} answered in this
              section.
              {unanswered > 0 &&
                ` ${unanswered} ${unanswered === 1 ? 'question has' : 'questions have'} no answer and will score zero.`}
            </span>
            {activeExam.flagged.length > 0 && (
              <span>
                {activeExam.flagged.length}{' '}
                {activeExam.flagged.length === 1 ? 'question is' : 'questions are'}{' '}
                still flagged.
              </span>
            )}
            <span>
              {lastSection
                ? 'Submitting marks the whole paper and opens your results.'
                : config.feedback === 'per-section'
                  ? 'This section will be locked and its feedback released.'
                  : 'You will move to the next section and cannot return to this one.'}
            </span>
          </span>
        }
        confirmLabel={lastSection ? 'Submit paper' : 'Finish section'}
        onConfirm={() => {
          setConfirmSubmit(false);
          if (lastSection) submit('manual');
          else closeSection('submitted');
        }}
      />
    </div>
  );
}
