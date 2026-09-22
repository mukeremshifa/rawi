import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  RotateCcwIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import type {
  AnswerValue,
  Attempt,
  FeedbackTiming,
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
import { useQuestionMap, useTopicMap } from '@/store/selectors';
import { hasScript } from '@/features/tutor/engine';
import { QuestionView } from './QuestionView';
import { QuestionFeedback } from './QuestionFeedback';

/**
 * Running a practice set.
 *
 * ── Why the set arrives in router state ───────────────────────────────────
 *
 * The setup page resolves the question list once and hands it over, rather than
 * this page re-running the filter. Two reasons. The filter depends on the pool,
 * which a student could change mid-session by deleting a material; re-running
 * it would silently alter a set that is already underway. And a set that is
 * resolved once can be retried exactly, which "retry the ones you got wrong"
 * depends on.
 *
 * The cost is that a hard reload of this URL has nothing to run, so it
 * redirects to setup rather than showing an error. That is the honest outcome:
 * the set genuinely is gone, and pretending otherwise by re-deriving a
 * different one would be worse.
 *
 * ── Flashcards get a different shape ──────────────────────────────────────
 *
 * A flashcard has no "submit" — revealing and rating *is* the interaction, and
 * a Check button between them would be a step that does nothing. So rating
 * advances, and the difficult cards come round again at the end.
 */

interface RunState {
  attempt: Attempt;
  questionIds: string[];
  hintsAllowed: boolean;
  feedback: FeedbackTiming;
}

export function PracticeRunPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { dispatch } = useStore();
  const questionMap = useQuestionMap();
  const topicMap = useTopicMap();

  const runState = location.state as RunState | null;

  const questions = useMemo(
    () =>
      (runState?.questionIds ?? [])
        .map((id) => questionMap.get(id))
        .filter((q): q is NonNullable<typeof q> => !!q),
    [runState?.questionIds, questionMap],
  );

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [hinted, setHinted] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  /** Flashcards the student rated "again" or "hard", queued for a second pass. */
  const [revisit, setRevisit] = useState<string[]>([]);
  const [secondPass, setSecondPass] = useState(false);

  if (!runState || questions.length === 0) {
    return <Navigate to="/practice/new" replace />;
  }

  const order = secondPass ? revisit : runState.questionIds;
  const activeIds = order.filter((id) => questionMap.has(id));
  const questionId = activeIds[index];
  const question = questionId ? questionMap.get(questionId) : undefined;

  if (!question || !questionId) return <Navigate to="/practice" replace />;

  const answer = answers[questionId];
  const isFlashcard = question.format === 'flashcard';
  const isChecked = checked.has(questionId);
  const immediate = runState.feedback === 'immediate';
  const last = index === activeIds.length - 1;

  const marked: QuestionAttempt | null =
    isChecked && answer ? toQuestionAttempt(question, answer, hinted.has(questionId)) : null;

  const setAnswer = (value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (isFlashcard && value.kind === 'self-rating') {
      setChecked((prev) => new Set(prev).add(questionId));
      if (
        !secondPass &&
        (value.rating === 'again' || value.rating === 'hard') &&
        !revisit.includes(questionId)
      ) {
        setRevisit((prev) => [...prev, questionId]);
      }
    }
  };

  const check = () => {
    setChecked((prev) => new Set(prev).add(questionId));
  };

  const finish = () => {
    const questionAttempts: QuestionAttempt[] = runState.questionIds
      .map((id) => {
        const q = questionMap.get(id);
        if (!q) return null;
        const given = answers[id] ?? { kind: 'none' as const };
        return toQuestionAttempt(q, given, hinted.has(id));
      })
      .filter((qa): qa is QuestionAttempt => qa !== null);

    const completed: Attempt = {
      ...runState.attempt,
      completedAt: new Date().toISOString(),
      questions: questionAttempts,
      marksAwarded: questionAttempts.reduce((sum, qa) => sum + qa.marksAwarded, 0),
      marksAvailable: questionAttempts.reduce((sum, qa) => sum + qa.marksAvailable, 0),
    };

    dispatch({ type: 'record-attempt', attempt: completed });
    toast.success('Practice recorded', {
      description: `${completed.marksAwarded} of ${completed.marksAvailable} marks. Progress updated.`,
    });
    navigate(`/practice/results/${completed.id}`, { replace: true });
  };

  const next = () => {
    if (!last) {
      setIndex((i) => i + 1);
      return;
    }
    // End of the first pass: offer the difficult flashcards again before
    // recording, which is the whole point of self-rating them.
    if (!secondPass && revisit.length > 0) {
      setSecondPass(true);
      setIndex(0);
      setChecked(new Set());
      toast.info('Second pass', {
        description: `${revisit.length} ${revisit.length === 1 ? 'card' : 'cards'} you found difficult.`,
      });
      return;
    }
    finish();
  };

  const topic = topicMap.get(question.topicId);
  const answered = hasContent(answer);
  const canAdvance = isFlashcard ? isChecked : immediate ? isChecked || !answered : true;

  return (
    <Page className="max-w-3xl pb-page">
      <div className="flex items-center justify-between gap-tight">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/practice">
            <ArrowLeftIcon />
            Leave
          </Link>
        </Button>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {index + 1} / {activeIds.length}
        </span>
      </div>

      <Progress
        value={((index + (isChecked ? 1 : 0)) / activeIds.length) * 100}
        aria-label="Progress through this set"
      />

      <PageHeader
        title={secondPass ? 'Second pass' : runState.attempt.title}
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
            hintsAllowed={runState.hintsAllowed && !isChecked}
            onHintUsed={() => setHinted((prev) => new Set(prev).add(questionId))}
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
                    discussTo: `/tutor/new?topic=${question.topicId}&question=${question.id}`,
                  }
                : {})}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-tight">
        {index > 0 && (
          <Button variant="outline" onClick={() => setIndex((i) => i - 1)}>
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
            {last && (secondPass || revisit.length === 0)
              ? 'Finish and record'
              : last && revisit.length > 0
                ? `Revisit ${revisit.length} difficult`
                : 'Next question'}
            {last && (secondPass || revisit.length === 0) ? (
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

        {!immediate && (
          <span className="text-muted-foreground text-xs">
            Feedback comes at the end of this set.
          </span>
        )}
      </div>

      {/* A compact map of the set, so a student can see what is left. */}
      {activeIds.length > 1 && (
        <div className="flex flex-wrap items-center gap-tight">
          <span className="text-muted-foreground text-xs">This set:</span>
          {activeIds.map((id, i) => {
            const q = questionMap.get(id);
            const done = hasContent(answers[id]);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setIndex(i)}
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

      {secondPass && (
        <p className="text-muted-foreground flex items-center gap-tight text-xs">
          <XIcon className="size-3" aria-hidden />
          Second-pass ratings replace your first for these cards.
        </p>
      )}
    </Page>
  );
}
