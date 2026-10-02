import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CheckIcon,
  ClockIcon,
  FlagIcon,
  LockIcon,
} from 'lucide-react';
import { toast } from '@/lib/toast';

import type { AnswerValue, ExamRun } from '@shared/types.ts';
import { hasContent } from '@shared/marking.ts';

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
import { useCourse } from '@/store/course-context';
import { useAllMaterials, useQuestionMap } from '@/store/selectors';
import { QuestionView } from '@/features/practice/QuestionView';
import {
  deadlineFor,
  enterSection,
  finishRun,
  locate,
  lockReason,
  paperExpired,
  sectionExpired,
  sectionLocked,
  summarisePaper,
} from './engine';
import { cn } from '@/lib/utils';

/**
 * Sitting an exam.
 *
 * ── Assessment conditions, and what that removes ──────────────────────────
 *
 * No hints, no tutor, no correctness indicators, no explanations, no marks —
 * nothing until the whole paper is submitted. That is not a UI decision made
 * here; it is a property of the data this screen has. The run holds answers and
 * flags and nothing that could reveal a result, and `finishRun` is the only
 * function in the feature that marks anything. There is no branch on this
 * screen that *could* show feedback, which is a stronger guarantee than a
 * conditional that happens to be false.
 *
 * ── Navigation ────────────────────────────────────────────────────────────
 *
 * Free navigation means free: between questions *and* between sections, in
 * both directions, for as long as those sections remain open. Moving to
 * another section is just moving — it does not finish anything, does not lock
 * anything and does not start anything the student did not ask to start. The
 * one thing entering a section does is start its clock, once, if the paper is
 * timed per section.
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
 * One interval ticks a clock. Deadlines are absolute timestamps stored on the
 * run, so a reload recomputes remaining time from the wall clock rather than
 * restarting anything — leaving the page for ten minutes costs ten minutes.
 * When the whole paper expires it is submitted exactly as it stands; when a
 * single section expires it locks and the student stays where they are.
 */

const TICK_MS = 500;

export function ExamRunPage() {
  const { activeExam } = useAppState();
  const { dispatch } = useStore();
  const course = useCourse();
  const navigate = useNavigate();
  const questionMap = useQuestionMap();
  const materials = useAllMaterials();
  const wide = useMediaQuery(MEDIA_WIDE);

  const [now, setNow] = useState(() => Date.now());
  const [confirmFinishSection, setConfirmFinishSection] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  /** Guards against the expiry effect firing twice before the state settles. */
  const finishing = useRef(false);
  /** Section ids we have already announced as expired, so the toast fires once. */
  const announced = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const config = activeExam?.configSnapshot;
  const sectionIndex = activeExam?.currentSectionIndex ?? 0;
  const section = config?.sections[sectionIndex];

  const update = useCallback(
    (patch: Partial<ExamRun>) => {
      if (!activeExam) return;
      dispatch({ type: 'set-active-exam', run: { ...activeExam, ...patch } });
    },
    [activeExam, dispatch],
  );

  /**
   * Submits the paper, once.
   *
   * Both the manual path and every expiry path come through here, so a timer
   * that fires while the confirm dialog is open cannot produce a second
   * attempt: `finishing` is set synchronously, and the store's `record-attempt`
   * is idempotent by id as a second line of defence.
   */
  const submit = useCallback(
    (finish: 'manual' | 'expired') => {
      if (!activeExam || finishing.current) return;
      finishing.current = true;

      const attempt = finishRun(activeExam, questionMap, finish);
      dispatch({ type: 'record-attempt', attempt });
      dispatch({ type: 'set-active-exam', run: null });

      toast[finish === 'expired' ? 'warning' : 'success'](
        finish === 'expired' ? 'Time expired, paper submitted' : 'Paper submitted',
        { description: 'Your marks and feedback are on the results page.' },
      );
      navigate(`/course/${course.id}/exams/results/${attempt.id}`, {
        replace: true,
        state: { justSubmitted: true },
      });
    },
    [activeExam, questionMap, dispatch, navigate, course.id],
  );

  /*
   * Starting a section's clock, on entry.
   *
   * In an effect rather than in the navigation handler because a *reload* onto
   * a section that has never been opened also has to start it — and because the
   * initial render of the run counts as entering section one.
   */
  useEffect(() => {
    if (!activeExam || finishing.current) return;
    const started = enterSection(activeExam, activeExam.currentSectionIndex);
    if (started !== activeExam) {
      dispatch({ type: 'set-active-exam', run: started });
    }
  }, [activeExam, dispatch]);

  /* The expiry watcher. One effect, both kinds of deadline. */
  useEffect(() => {
    if (!activeExam || finishing.current) return;

    if (paperExpired(activeExam, now)) {
      submit('expired');
      return;
    }

    /*
     * A section that has expired is locked by `sectionLocked` without any state
     * change, so nothing has to be written for the rules to hold. What is worth
     * doing is telling the student it happened — once — which is what the
     * `announced` set is for. It survives re-renders and does not survive a
     * reload, so a student returning to an already-expired paper gets the
     * banner rather than a stale toast.
     */
    for (const [index, s] of activeExam.configSnapshot.sections.entries()) {
      if (sectionExpired(activeExam, s.id, now) && !announced.current.has(s.id)) {
        announced.current.add(s.id);
        if (index === activeExam.currentSectionIndex) {
          toast.warning(`Time up on ${s.title}`, {
            description:
              'Its answers are fixed. Nothing is marked until you submit the whole paper.',
          });
        }
      }
    }
  }, [now, activeExam, submit]);

  const summary = useMemo(
    () => (activeExam ? summarisePaper(activeExam, now) : null),
    // `now` ticks twice a second; the summary only depends on it through the
    // lock state, which changes rarely. Recomputing a handful of counts at that
    // rate is cheaper than tracking which deadline is next.
    [activeExam, now],
  );

  /*
   * The "no active exam" guard.
   *
   * Submitting clears the active run and then navigates to the results. Those
   * are two steps, and between them this component re-renders with no run — so
   * a guard that only checks `activeExam` fires its redirect first and the
   * student lands on the exams list instead of their results. `finishing` is
   * set synchronously before either dispatch, so it is already true on that
   * intermediate render and the guard stands down.
   */
  if (finishing.current) return null;

  if (!activeExam || !config || !section || !summary) {
    return <Navigate to={`/course/${course.id}/exams`} replace />;
  }

  /*
   * An exam belonging to another course cannot be sat from this course's URL.
   * Redirecting to where it actually lives is better than either refusing or,
   * worse, rendering it here under the wrong course's navigation.
   */
  if (activeExam.courseId !== course.id) {
    return <Navigate to={`/course/${activeExam.courseId}/exams/run`} replace />;
  }

  const questionIds = activeExam.sectionQuestions[section.id] ?? [];
  const questionId = questionIds[activeExam.currentQuestionIndex];
  const question = questionId ? questionMap.get(questionId) : undefined;

  const locked = sectionLocked(activeExam, sectionIndex, now);
  const lockedBecause = lockReason(activeExam, sectionIndex, now);

  const deadline = deadlineFor(activeExam, section.id);
  const remaining = deadline ? new Date(deadline).getTime() - now : null;
  const urgent = remaining !== null && remaining > 0 && remaining < 60_000;

  const totalMarks = config.sections.reduce(
    (sum, s) =>
      sum +
      (activeExam.sectionQuestions[s.id] ?? []).reduce(
        (m, id) => m + (questionMap.get(id)?.marks ?? 0),
        0,
      ),
    0,
  );

  const lastQuestion = activeExam.currentQuestionIndex === questionIds.length - 1;
  const lastSection = sectionIndex === config.sections.length - 1;
  const openSections = config.sections.filter(
    (_, i) => !sectionLocked(activeExam, i, now),
  ).length;

  const setAnswer = (value: AnswerValue) => {
    if (!questionId || locked) return;
    update({ answers: { ...activeExam.answers, [questionId]: value } });
  };

  /** Moves within the current section. */
  const goTo = (index: number) => {
    if (config.navigation === 'sequential' && index < activeExam.currentQuestionIndex) {
      toast.info('Sequential paper', {
        description: 'This exam does not allow going back to earlier questions.',
      });
      return;
    }
    update({ currentQuestionIndex: index });
  };

  /**
   * Moves to another section.
   *
   * This is *only* a move. It does not finish the section being left, does not
   * lock it and does not mark anything — which is the behaviour the brief
   * specifically calls for, and the opposite of what the previous build did.
   */
  const goToSection = (index: number, questionIndex = 0) => {
    if (index === sectionIndex && questionIndex === activeExam.currentQuestionIndex) {
      return;
    }
    if (config.navigation === 'sequential' && index < sectionIndex) {
      toast.info('Sequential paper', {
        description: 'This exam does not allow returning to an earlier section.',
      });
      return;
    }
    const target = config.sections[index];
    if (!target) return;

    // Starting the destination's clock here as well as in the effect means the
    // deadline is already on the run in the same transition as the move, so the
    // timer never renders blank for a frame.
    const entered = enterSection(
      { ...activeExam, currentSectionIndex: index, currentQuestionIndex: questionIndex },
      index,
    );
    dispatch({ type: 'set-active-exam', run: entered });
  };

  const toggleFlag = () => {
    if (!questionId) return;
    update({
      flagged: activeExam.flagged.includes(questionId)
        ? activeExam.flagged.filter((id) => id !== questionId)
        : [...activeExam.flagged, questionId],
    });
  };

  /** Finishing a section locks it, when the configuration says so. */
  const finishSection = () => {
    if (!config.lockSectionsOnFinish) {
      // Without locking there is nothing to finish: move on, or submit if this
      // was the last open section.
      const nextOpen = config.sections.findIndex(
        (_, i) => i > sectionIndex && !sectionLocked(activeExam, i, now),
      );
      if (nextOpen === -1) setConfirmSubmit(true);
      else goToSection(nextOpen);
      return;
    }

    const locking = [...activeExam.lockedSectionIds, section.id];
    const remainingOpen = config.sections.filter(
      (s, i) => !locking.includes(s.id) && !sectionLocked(activeExam, i, now),
    );

    if (remainingOpen.length === 0) {
      // Locking the last open section would leave a paper nobody can work on,
      // so that action submits instead — and the dialog says so beforehand.
      submit('manual');
      return;
    }

    const nextIndex = config.sections.findIndex(
      (s, i) => !locking.includes(s.id) && !sectionLocked(activeExam, i, now) && i > sectionIndex,
    );
    const target = nextIndex === -1
      ? config.sections.findIndex(
          (s, i) => !locking.includes(s.id) && !sectionLocked(activeExam, i, now),
        )
      : nextIndex;

    const moved: ExamRun = {
      ...activeExam,
      lockedSectionIds: locking,
      sectionOutcomes: [
        ...activeExam.sectionOutcomes,
        { sectionId: section.id, ended: 'submitted', endedAt: new Date().toISOString() },
      ],
      currentSectionIndex: target === -1 ? sectionIndex : target,
      currentQuestionIndex: 0,
    };
    dispatch({
      type: 'set-active-exam',
      run: target === -1 ? moved : enterSection(moved, target),
    });
    toast.info(`${section.title} locked`, {
      description: 'You can still read it. Nothing is marked until the paper is submitted.',
    });
  };

  /** Jumps to a flagged question wherever it is, if it is still reachable. */
  const goToFlagged = (id: string) => {
    const at = locate(activeExam, id);
    if (!at) return;
    if (config.navigation === 'sequential' && at.sectionIndex < sectionIndex) {
      toast.info('Sequential paper', {
        description: 'That question is in a section you have already passed.',
      });
      return;
    }
    goToSection(at.sectionIndex, at.questionIndex);
    setMapOpen(false);
  };

  const QuestionMap = (
    <div className="flex flex-col gap-section p-gutter">
      {config.sections.map((s, sIndex) => {
        const ids = activeExam.sectionQuestions[s.id] ?? [];
        const isCurrent = sIndex === sectionIndex;
        const sLocked = sectionLocked(activeExam, sIndex, now);
        const sDeadline = deadlineFor(activeExam, s.id);
        const sRemaining =
          config.timing === 'per-section' && sDeadline
            ? new Date(sDeadline).getTime() - now
            : null;

        return (
          <div key={s.id} className="flex flex-col gap-tight">
            <div className="flex items-center justify-between gap-tight">
              <button
                type="button"
                onClick={() => {
                  goToSection(sIndex);
                  setMapOpen(false);
                }}
                className={cn(
                  'focus-visible:ring-ring rounded text-left text-sm outline-none focus-visible:ring-2',
                  isCurrent ? 'font-medium' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {s.title}
              </button>
              {sLocked ? (
                <Badge variant="secondary" className="gap-1 font-normal">
                  <LockIcon className="size-3" aria-hidden />
                  Locked
                </Badge>
              ) : sRemaining !== null ? (
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {formatClock(sRemaining)}
                </span>
              ) : null}
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
                    onClick={() => {
                      goToSection(sIndex, qIndex);
                      setMapOpen(false);
                    }}
                    aria-current={active ? 'true' : undefined}
                    aria-label={`${s.title}, question ${qIndex + 1}${
                      answered ? ', answered' : ', not answered'
                    }${flagged ? ', flagged' : ''}${sLocked ? ', locked' : ''}`}
                    className={cn(
                      'focus-visible:ring-ring relative size-8 rounded-md border font-mono text-xs tabular-nums outline-none transition-colors focus-visible:ring-2',
                      active && 'border-primary bg-primary text-primary-foreground',
                      !active && answered && 'bg-secondary',
                      !active && !answered && 'hover:bg-accent',
                      sLocked && !active && 'opacity-60',
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

      {/* Flags, listed across every section, because the brief asks that they
          help a student find work anywhere in the paper before submitting. */}
      {activeExam.flagged.length > 0 && (
        <div className="flex flex-col gap-tight">
          <span className="text-sm font-medium">
            Flagged ({activeExam.flagged.length})
          </span>
          <div className="flex flex-col gap-hairline">
            {activeExam.flagged.map((id) => {
              const at = locate(activeExam, id);
              const s = at ? config.sections[at.sectionIndex] : undefined;
              const reachable =
                at !== null &&
                (config.navigation !== 'sequential' || at.sectionIndex >= sectionIndex);
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!reachable}
                  onClick={() => goToFlagged(id)}
                  className={cn(
                    'focus-visible:ring-ring rounded-md border px-snug py-1 text-left text-xs outline-none transition-colors focus-visible:ring-2',
                    reachable ? 'hover:bg-accent' : 'opacity-50',
                  )}
                >
                  {s?.title} · question {(at?.questionIndex ?? 0) + 1}
                  {!reachable && ' (passed)'}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="text-muted-foreground flex flex-col gap-hairline text-xs">
        <span>
          {config.book === 'open' ? 'Open book' : 'Closed book'} ·{' '}
          {config.navigation === 'free' ? 'free navigation' : 'sequential'}
        </span>
        <span>
          {config.lockSectionsOnFinish
            ? 'Finishing a section locks its answers'
            : 'Sections stay open until you submit'}
        </span>
        <span>Marks and feedback are released after you submit the paper.</span>
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
                {formatClock(Math.max(0, remaining))}
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
                  Paper
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
            Submit paper
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

            {locked && lockedBecause && (
              <Alert>
                <LockIcon />
                <AlertTitle>This section is closed</AlertTitle>
                <AlertDescription>{lockedBecause}</AlertDescription>
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
                    {config.flaggingEnabled && (
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

                  {/*
                    `hintsAllowed` is hard false. An exam offers no assistance,
                    so this is not a setting being read. It is the absence of a
                    capability, which is why no configuration can turn it on.
                  */}
                  <QuestionView
                    question={question}
                    answer={questionId ? activeExam.answers[questionId] : undefined}
                    onChange={setAnswer}
                    readOnly={locked}
                    hintsAllowed={false}
                  />
                </CardContent>
              </Card>
            ) : (
              <p className="text-muted-foreground">This question is unavailable.</p>
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
              {lastQuestion && !lastSection && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    config.lockSectionsOnFinish
                      ? setConfirmFinishSection(true)
                      : finishSection()
                  }
                >
                  {config.lockSectionsOnFinish
                    ? `Finish ${section.title}`
                    : 'Next section'}
                </Button>
              )}
              {lastQuestion && lastSection && (
                <Button variant="secondary" onClick={() => setConfirmSubmit(true)}>
                  Submit the paper
                </Button>
              )}
            </div>

            <p className="text-muted-foreground text-xs leading-relaxed">
              {config.navigation === 'sequential'
                ? 'This paper is sequential: once you move on you cannot return to an earlier question or section. '
                : `Free navigation: you can move between questions and between the ${openSections} open section${openSections === 1 ? '' : 's'} in any order. `}
              Nothing is marked and no feedback is shown until you submit the whole
              paper.
            </p>
          </div>
        </div>
      </div>

      {wide && (
        <aside className="w-72 shrink-0 overflow-y-auto border-l">{QuestionMap}</aside>
      )}

      <ConfirmDialog
        open={confirmFinishSection}
        onOpenChange={setConfirmFinishSection}
        title={`Finish ${section.title}?`}
        description={
          <span className="flex flex-col gap-tight">
            <span>
              This paper locks a section when you finish it.{' '}
              <strong>
                Its {questionIds.length} answers will be fixed and you will not be able
                to change them
              </strong>
              , though you can still read them.
            </span>
            <span>
              {summary.sections[sectionIndex]?.answered ?? 0} of {questionIds.length}{' '}
              answered in this section.
            </span>
            <span>
              Nothing is marked yet. Marks and feedback come after the whole paper is
              submitted.
            </span>
          </span>
        }
        confirmLabel="Finish and lock"
        onConfirm={() => {
          setConfirmFinishSection(false);
          finishSection();
        }}
      />

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Submit the paper?"
        description={
          <span className="flex flex-col gap-tight">
            {/* The whole paper, not just this section — which is the review the
                brief asks for. */}
            <span>
              {summary.answered} of {summary.total} questions answered across the whole
              paper.
              {summary.unanswered > 0 &&
                ` ${summary.unanswered} ${summary.unanswered === 1 ? 'has' : 'have'} no answer and will score zero.`}
            </span>
            {summary.sections.length > 1 && (
              <span className="flex flex-col gap-hairline">
                {summary.sections.map((s) => (
                  <span key={s.id} className="text-xs">
                    {s.title}: {s.answered}/{s.total} answered
                    {s.flagged > 0 && `, ${s.flagged} flagged`}
                    {s.locked && ', locked'}
                  </span>
                ))}
              </span>
            )}
            {summary.flagged > 0 && (
              <span>
                {summary.flagged}{' '}
                {summary.flagged === 1 ? 'question is' : 'questions are'} still flagged.
              </span>
            )}
            <span>Submitting marks the whole paper and opens your results.</span>
          </span>
        }
        confirmLabel="Submit paper"
        onConfirm={() => {
          setConfirmSubmit(false);
          submit('manual');
        }}
      />

      {/* A last-resort escape for a paper whose every section has expired but
          which the watcher has not yet submitted — a reload lands here first. */}
      {summary.sections.every((s) => s.locked) && (
        <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-gutter">
          <Card className="max-w-md">
            <CardContent className="flex flex-col gap-base">
              <AlertTriangleIcon className="text-warning size-5" aria-hidden />
              <h2 className="font-serif text-xl">Every section is closed</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                There is nothing left to answer on this paper. Submitting it will mark
                what you have and open your results.
              </p>
              <Button onClick={() => submit('expired')}>Submit and see results</Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
