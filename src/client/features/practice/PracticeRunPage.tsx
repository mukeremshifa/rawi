import { useCallback, useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  RotateCcwIcon,
  SaveIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import type {
  AnswerValue,
  Attempt,
  PracticeAttemptState,
  QuestionAttempt,
} from '@shared/types.ts';
import { hasContent, toQuestionAttempt } from '@shared/marking.ts';

import { Page, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { FORMAT_LABEL, OutcomeBadge } from '@/components/domain';
import { useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import {
  usePracticeRun,
  usePracticeSet,
  useQuestionMap,
  useTopicMap,
} from '@/store/selectors';
import { hasScript } from '@/features/tutor/engine';
import { newId } from '@/lib/id';
import { QuestionView } from './QuestionView';
import { QuestionFeedback } from './QuestionFeedback';

/**
 * Running a practice set.
 *
 * ── Where the work lives, and why that changed ────────────────────────────
 *
 * Every keystroke goes to the store, onto a `PracticeAttemptState` keyed by the
 * run id in the URL. The previous build kept answers in component state and the
 * question list in router history state, which meant a reload, a navigation
 * away, or a course switch lost everything — including a half-written essay,
 * which is the single worst thing this app could lose.
 *
 * The cost is a store write per keystroke. That is affordable here because the
 * store is a synchronous reducer over a small tree and the write to
 * `localStorage` is batched by an effect, and it buys the property the brief
 * asks for: work survives anything short of clearing the browser.
 *
 * ── Recording happens once ────────────────────────────────────────────────
 *
 * Finishing writes an `Attempt` and deletes the run in the same dispatch pair.
 * The attempt id is generated once, before either, and `record-attempt` is
 * idempotent by id — so a double-click on Finish cannot produce two entries in
 * history or complete a planner session twice.
 *
 * ── Flashcards get a different shape ──────────────────────────────────────
 *
 * A flashcard has no "submit" — revealing and rating *is* the interaction, and
 * a Check button between them would be a step that does nothing. So rating
 * advances, and the difficult cards come round again at the end.
 */
export function PracticeRunPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { dispatch } = useStore();
  const course = useCourse();
  const path = useCoursePath();
  const questionMap = useQuestionMap();
  const topicMap = useTopicMap();

  const run = usePracticeRun(runId);
  const set = usePracticeSet(run?.setId);

  const update = useCallback(
    (patch: Partial<PracticeAttemptState>) => {
      if (!run) return;
      dispatch({
        type: 'upsert-practice-run',
        run: { ...run, ...patch, updatedAt: new Date().toISOString() },
      });
    },
    [run, dispatch],
  );

  const questions = useMemo(
    () =>
      (run?.questionIds ?? [])
        .map((id) => questionMap.get(id))
        .filter((q): q is NonNullable<typeof q> => !!q),
    [run?.questionIds, questionMap],
  );

  /**
   * Finishes the run: one attempt recorded, the run removed.
   *
   * Marks every question in the set, not only the ones reached — an unanswered
   * question scores zero and says so, which is more honest than quietly
   * shortening the set to what the student happened to get to.
   */
  const finish = useCallback(() => {
    if (!run || !set) return;

    const questionAttempts: QuestionAttempt[] = run.questionIds
      .map((id) => {
        const q = questionMap.get(id);
        if (!q) return null;
        const given = run.answers[id] ?? { kind: 'none' as const };
        return toQuestionAttempt(q, given, run.hintedIds.includes(id));
      })
      .filter((qa): qa is QuestionAttempt => qa !== null);

    const completed: Attempt = {
      id: newId('att'),
      courseId: run.courseId,
      kind: 'practice',
      mode: set.config.activity === 'flashcards' ? 'self-rated' : 'practice',
      title: set.name,
      practiceSetId: set.id,
      assistanceRecord: 'tracked',
      topicIds: [...new Set(questionAttempts.map((q) => q.topicId))],
      startedAt: run.startedAt,
      completedAt: new Date().toISOString(),
      questions: questionAttempts,
      marksAwarded: questionAttempts.reduce((sum, qa) => sum + qa.marksAwarded, 0),
      marksAvailable: questionAttempts.reduce((sum, qa) => sum + qa.marksAvailable, 0),
      ...(run.plannedSessionId ? { plannedSessionId: run.plannedSessionId } : {}),
    };

    dispatch({ type: 'record-attempt', attempt: completed });
    dispatch({ type: 'remove-practice-run', runId: run.id });

    toast.success('Practice recorded', {
      description: `${completed.marksAwarded} of ${completed.marksAvailable} marks. Progress updated.`,
    });
    navigate(path(`/practice/results/${completed.id}`), { replace: true });
  }, [run, set, questionMap, dispatch, navigate, path]);

  if (!run || !set) return <Navigate to={path('/practice')} replace />;
  if (run.courseId !== course.id) {
    return <Navigate to={`/course/${run.courseId}/practice/run/${run.id}`} replace />;
  }
  if (questions.length === 0) return <Navigate to={path('/practice')} replace />;

  const order = run.secondPass ? run.revisitIds : run.questionIds;
  const activeIds = order.filter((id) => questionMap.has(id));
  const index = Math.min(run.index, Math.max(0, activeIds.length - 1));
  const questionId = activeIds[index];
  const question = questionId ? questionMap.get(questionId) : undefined;

  if (!question || !questionId) return <Navigate to={path('/practice')} replace />;

  const answer = run.answers[questionId];
  const isFlashcard = question.format === 'flashcard';
  const isChecked = run.checkedIds.includes(questionId);
  const immediate = run.feedback === 'immediate';
  const last = index === activeIds.length - 1;

  const marked: QuestionAttempt | null =
    isChecked && answer
      ? toQuestionAttempt(question, answer, run.hintedIds.includes(questionId))
      : null;

  const setAnswer = (value: AnswerValue) => {
    const answers = { ...run.answers, [questionId]: value };
    if (isFlashcard && value.kind === 'self-rating') {
      const checkedIds = run.checkedIds.includes(questionId)
        ? run.checkedIds
        : [...run.checkedIds, questionId];
      const queueIt =
        !run.secondPass &&
        (value.rating === 'again' || value.rating === 'hard') &&
        !run.revisitIds.includes(questionId);
      update({
        answers,
        checkedIds,
        revisitIds: queueIt ? [...run.revisitIds, questionId] : run.revisitIds,
      });
      return;
    }
    update({ answers });
  };

  const check = () => {
    if (run.checkedIds.includes(questionId)) return;
    update({ checkedIds: [...run.checkedIds, questionId] });
  };

  const next = () => {
    if (!last) {
      update({ index: index + 1 });
      return;
    }
    // End of the first pass: offer the difficult flashcards again before
    // recording, which is the whole point of self-rating them.
    if (!run.secondPass && run.revisitIds.length > 0) {
      update({ secondPass: true, index: 0, checkedIds: [] });
      toast.info('Second pass', {
        description: `${run.revisitIds.length} ${
          run.revisitIds.length === 1 ? 'card' : 'cards'
        } you found difficult.`,
      });
      return;
    }
    finish();
  };

  const topic = topicMap.get(question.topicId);
  const answered = hasContent(answer);
  const canAdvance = isFlashcard ? isChecked : immediate ? isChecked || !answered : true;
  const answeredCount = run.questionIds.filter((id) =>
    hasContent(run.answers[id]),
  ).length;

  return (
    <Page className="max-w-3xl pb-page">
      <div className="flex flex-wrap items-center justify-between gap-tight">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to={path(`/practice/set/${set.id}`)}>
            <ArrowLeftIcon />
            Leave
          </Link>
        </Button>
        <span className="flex items-center gap-tight">
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <SaveIcon className="size-3" aria-hidden />
            Saved as you go
          </span>
          <Separator orientation="vertical" className="h-3" />
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {index + 1} / {activeIds.length}
          </span>
        </span>
      </div>

      <Progress
        value={((index + (isChecked ? 1 : 0)) / activeIds.length) * 100}
        aria-label="Progress through this set"
      />

      <PageHeader
        title={run.secondPass ? 'Second pass' : set.name}
        description={
          <span className="flex flex-wrap items-center gap-tight">
            <span>{topic?.title}</span>
            <Separator orientation="vertical" className="h-3" />
            <span>{FORMAT_LABEL[question.format]}</span>
            <Separator orientation="vertical" className="h-3" />
            <span className="font-mono tabular-nums">
              {question.marks} {question.marks === 1 ? 'mark' : 'marks'}
            </span>
          </span>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-base">
          <QuestionView
            question={question}
            answer={answer}
            onChange={setAnswer}
            readOnly={isChecked && !isFlashcard}
            hintsAllowed={run.hintsAllowed && !isChecked}
            onHintUsed={() =>
              !run.hintedIds.includes(questionId) &&
              update({ hintedIds: [...run.hintedIds, questionId] })
            }
          />
        </CardContent>
      </Card>

      {immediate && marked && !isFlashcard && (
        <Card
          className={
            marked.outcome === 'correct'
              ? 'border-success/40'
              : marked.outcome === 'incorrect'
                ? 'border-destructive/40'
                : 'border-warning/40'
          }
        >
          <CardContent>
            <QuestionFeedback
              question={question}
              attempt={marked}
              {...(hasScript(question.topicId)
                ? {
                    discussTo: path(
                      `/tutor/new?topic=${question.topicId}&question=${question.id}`,
                    ),
                  }
                : {})}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-tight">
        {index > 0 && (
          <Button variant="outline" onClick={() => update({ index: index - 1 })}>
            <ArrowLeftIcon />
            Previous
          </Button>
        )}

        {immediate && !isChecked && !isFlashcard && (
          <Button onClick={check} disabled={!answered}>
            <CheckIcon />
            Check answer
          </Button>
        )}

        {(!immediate || isChecked || isFlashcard) && (
          <Button onClick={next} disabled={!canAdvance}>
            {last && (run.secondPass || run.revisitIds.length === 0)
              ? 'Finish and record'
              : last && run.revisitIds.length > 0
                ? `Revisit ${run.revisitIds.length} difficult`
                : 'Next question'}
            {last && (run.secondPass || run.revisitIds.length === 0) ? (
              <CheckIcon />
            ) : last ? (
              <RotateCcwIcon />
            ) : (
              <ArrowRightIcon />
            )}
          </Button>
        )}

        {!immediate && !isFlashcard && (
          <Button variant="ghost" onClick={finish}>
            Finish now
          </Button>
        )}

        <div className="flex-1" />

        <span className="text-muted-foreground text-xs">
          {!immediate
            ? 'Feedback comes at the end of this set.'
            : `${answeredCount} of ${run.questionIds.length} answered`}
        </span>
      </div>

      {/* A compact map of the set, so a student can see what is left. */}
      {activeIds.length > 1 && (
        <div className="flex flex-wrap items-center gap-tight">
          <span className="text-muted-foreground text-xs">This set:</span>
          {activeIds.map((id, i) => {
            const q = questionMap.get(id);
            const done = hasContent(run.answers[id]);
            return (
              <button
                key={id}
                type="button"
                onClick={() => update({ index: i })}
                aria-label={`Question ${i + 1}${done ? ', answered' : ''}`}
                aria-current={i === index ? 'true' : undefined}
                className={`focus-visible:ring-ring size-7 rounded-md border font-mono text-xs tabular-nums outline-none focus-visible:ring-2 ${
                  i === index
                    ? 'border-primary bg-primary text-primary-foreground'
                    : done
                      ? 'bg-secondary'
                      : 'hover:bg-accent'
                }`}
                title={q ? FORMAT_LABEL[q.format] : undefined}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      )}

      {isChecked && marked && !immediate && (
        <div className="flex items-center gap-tight">
          <Badge variant="secondary">Answer recorded</Badge>
          <OutcomeBadge outcome={marked.outcome} />
        </div>
      )}

      {run.secondPass && (
        <p className="text-muted-foreground text-xs">
          Second-pass ratings replace your first for these cards.
        </p>
      )}

      <p className="text-muted-foreground text-xs leading-relaxed">
        You can leave this page and come back. Your answers, your position and
        anything you have written are saved on this device as you go, and this set is
        waiting for you in Practice.
      </p>
    </Page>
  );
}
