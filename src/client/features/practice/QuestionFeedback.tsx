import {
  CheckIcon,
  HourglassIcon,
  MessageSquareIcon,
  RotateCcwIcon,
  SquareIcon,
  XIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import type { AnswerValue, Question, QuestionAttempt, WrittenGrading } from '@shared/types.ts';
import { AI_MARKING_NOTICE, LEGACY_MARKING_NOTICE, rubricFor } from '@shared/marking.ts';

import { Prose } from '@/components/Prose';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  FORMAT_LABEL,
  OutcomeBadge,
  SimulatedNotice,
  SourceLink,
} from '@/components/domain';
import { cn } from '@/lib/utils';

/**
 * What the student sees after a question is marked.
 *
 * ── The three parts, in this order ────────────────────────────────────────
 *
 *   1. What you answered, and what was correct. Objective formats show the key
 *      inline against the options, because "you picked B, the answer was C" is
 *      far easier to read on the options themselves than as a sentence.
 *   2. The rubric, for written formats. New answers show AI feedback per
 *      point. Answers from earlier builds keep their simulated keyword grade
 *      and say so.
 *   3. The explanation, and a way back to the passage it came from.
 *
 * ── Labels ───────────────────────────────────────────────────────────────
 *
 * AI feedback carries `AI_MARKING_NOTICE` and names its model. A historical
 * keyword grade carries `LEGACY_MARKING_NOTICE`. Objective feedback carries
 * neither, because comparing an answer with a key is exact.
 */

export function QuestionFeedback({
  question,
  attempt,
  /** A link to discuss this with the tutor, when the topic has a script. */
  discussTo,
}: {
  question: Question;
  attempt: QuestionAttempt;
  discussTo?: string;
}) {
  const written =
    question.format === 'essay' ||
    question.format === 'written-recall' ||
    question.format === 'source-analysis';

  return (
    <div className="flex flex-col gap-base">
      <div className="flex flex-wrap items-center gap-tight">
        <OutcomeBadge outcome={attempt.outcome} />
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {attempt.marksAwarded}/{attempt.marksAvailable} marks
        </span>
        <Separator orientation="vertical" className="h-3" />
        <span className="text-muted-foreground text-xs">
          {FORMAT_LABEL[question.format]}
        </span>
        {attempt.usedHint && (
          <>
            <Separator orientation="vertical" className="h-3" />
            <span className="text-muted-foreground text-xs">Hint used</span>
          </>
        )}
      </div>

      <AnswerReview question={question} response={attempt.response} />

      {written && attempt.grading?.status === 'graded' && (
        <AiRubricReview question={question} grading={attempt.grading} />
      )}

      {written && attempt.outcome === 'pending' && (
        <AwaitingFeedback grading={attempt.grading} />
      )}

      {written && !attempt.grading && attempt.outcome !== 'skipped' && question.rubric && (
        <RubricReview
          question={question}
          creditedIds={attempt.creditedRubricIds ?? []}
        />
      )}

      <div className="bg-muted/40 flex flex-col gap-tight rounded-lg border p-gutter">
        <span className="text-xs font-medium">Explanation</span>
        <Prose text={question.explanation} size="compact" />
        <SourceLink source={question.source} className="mt-tight" />
      </div>

      {written && attempt.grading?.status === 'graded' && (
        <SimulatedNotice>
          {AI_MARKING_NOTICE} Marked by {attempt.grading.model ?? 'an AI model'}.
        </SimulatedNotice>
      )}
      {written && !attempt.grading && attempt.outcome !== 'skipped' && (
        <SimulatedNotice>{LEGACY_MARKING_NOTICE}</SimulatedNotice>
      )}

      {discussTo && attempt.outcome !== 'correct' && attempt.outcome !== 'pending' && (
        <Button variant="outline" size="sm" asChild className="self-start">
          <Link to={discussTo}>
            <MessageSquareIcon />
            Work through this with the tutor
          </Link>
        </Button>
      )}
    </div>
  );
}

/* ── Per-format answer review ─────────────────────────────────────────── */

function AnswerReview({
  question,
  response,
}: {
  question: Question;
  response: AnswerValue;
}) {
  switch (question.format) {
    case 'multiple-choice':
    case 'multiple-select': {
      const given = response.kind === 'choice' ? response.indices : [];
      const correct = question.correctIndices ?? [];
      return (
        <ul className="flex flex-col gap-tight">
          {(question.options ?? []).map((option, index) => {
            const picked = given.includes(index);
            const isCorrect = correct.includes(index);
            return (
              <li
                key={index}
                className={cn(
                  'flex items-start gap-snug rounded-lg border p-snug text-sm',
                  isCorrect && 'border-success/40 bg-success/8',
                  picked && !isCorrect && 'border-destructive/40 bg-destructive/8',
                )}
              >
                <span className="mt-0.5 shrink-0">
                  {isCorrect ? (
                    <CheckIcon className="text-success size-4" aria-hidden />
                  ) : picked ? (
                    <XIcon className="text-destructive size-4" aria-hidden />
                  ) : (
                    <span className="block size-4" />
                  )}
                </span>
                <span className="flex-1 leading-relaxed">{option}</span>
                {picked && (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    your answer
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      );
    }

    case 'fill-blank': {
      const given = response.kind === 'blanks' ? response.values : [];
      return (
        <ul className="flex flex-col gap-tight">
          {(question.blanks ?? []).map((accepted, index) => {
            const value = (given[index] ?? '').trim();
            const ok =
              value && accepted.some((a) => a.toLowerCase() === value.toLowerCase());
            return (
              <li
                key={index}
                className={cn(
                  'flex flex-wrap items-center gap-snug rounded-lg border p-snug text-sm',
                  ok ? 'border-success/40 bg-success/8' : 'border-destructive/30',
                )}
              >
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {index + 1}
                </span>
                <span className={cn('font-medium', !value && 'text-muted-foreground')}>
                  {value || '(blank)'}
                </span>
                {!ok && (
                  <span className="text-muted-foreground text-xs">
                    expected: {accepted[0]}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      );
    }

    case 'ordering': {
      const given = response.kind === 'ordering' ? response.sequence : [];
      const correct = question.sequence ?? [];
      return (
        <ol className="flex flex-col gap-tight">
          {correct.map((item, index) => {
            const inPlace = given[index] === item;
            return (
              <li
                key={item}
                className={cn(
                  'flex items-start gap-snug rounded-lg border p-snug text-sm',
                  inPlace ? 'border-success/40 bg-success/8' : 'border-destructive/30',
                )}
              >
                <span className="text-muted-foreground w-5 shrink-0 text-center font-mono text-xs tabular-nums">
                  {index + 1}
                </span>
                <div className="flex flex-1 flex-col gap-hairline">
                  <span className="leading-relaxed">{item}</span>
                  {!inPlace && given[index] && (
                    <span className="text-muted-foreground text-xs">
                      you put: {given[index]}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      );
    }

    case 'matching': {
      const assignments =
        response.kind === 'matching' ? response.assignments : {};
      return (
        <ul className="flex flex-col gap-tight">
          {(question.pairs ?? []).map((pair) => {
            const given = assignments[pair.left];
            const ok = given === pair.right;
            return (
              <li
                key={pair.left}
                className={cn(
                  'flex flex-col gap-hairline rounded-lg border p-snug text-sm',
                  ok ? 'border-success/40 bg-success/8' : 'border-destructive/30',
                )}
              >
                <span className="font-medium">{pair.left}</span>
                <span className="text-muted-foreground text-xs">
                  {ok ? (
                    pair.right
                  ) : (
                    <>
                      you said: {given || '(nothing)'} · correct: {pair.right}
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      );
    }

    case 'flashcard': {
      const rating = response.kind === 'self-rating' ? response.rating : null;
      return (
        <div className="flex flex-col gap-tight">
          <div className="bg-muted/40 rounded-lg border p-snug">
            <span className="text-muted-foreground mb-hairline block text-xs font-medium">
              The answer
            </span>
            <Prose text={question.answer ?? ''} size="compact" />
          </div>
          <p className="text-muted-foreground text-xs">
            You rated your recall: <strong>{rating ?? 'not rated'}</strong>. Recorded
            as self-rated, which counts differently from an unaided exam answer.
          </p>
        </div>
      );
    }

    case 'written-recall':
    case 'source-analysis':
    case 'essay': {
      const text = response.kind === 'text' ? response.text : '';
      return (
        <div className="flex flex-col gap-tight">
          <span className="text-xs font-medium">Your answer</span>
          <div className="bg-muted/30 rounded-lg border p-gutter">
            {text.trim() ? (
              <Prose text={text} size="compact" />
            ) : (
              <p className="text-muted-foreground text-sm italic">
                Nothing was written.
              </p>
            )}
          </div>
        </div>
      );
    }
  }
}

/* ── Rubric ───────────────────────────────────────────────────────────── */

function RubricReview({
  question,
  creditedIds,
}: {
  question: Question;
  creditedIds: string[];
}) {
  const rubric = question.rubric ?? [];
  const earned = rubric
    .filter((p) => creditedIds.includes(p.id))
    .reduce((sum, p) => sum + p.marks, 0);
  const total = rubric.reduce((sum, p) => sum + p.marks, 0);

  return (
    <div className="flex flex-col gap-snug">
      <div className="flex items-baseline justify-between gap-tight">
        <span className="text-xs font-medium">Rubric</span>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {earned}/{total}
        </span>
      </div>
      <ul className="flex flex-col gap-tight">
        {rubric.map((point) => {
          const credited = creditedIds.includes(point.id);
          return (
            <li
              key={point.id}
              className={cn(
                'flex items-start gap-snug rounded-lg border p-snug text-sm',
                credited ? 'border-success/40 bg-success/8' : 'border-border',
              )}
            >
              <span className="mt-0.5 shrink-0">
                {credited ? (
                  <CheckIcon className="text-success size-4" aria-hidden />
                ) : (
                  <XIcon className="text-muted-foreground size-4" aria-hidden />
                )}
              </span>
              <div className="flex flex-1 flex-col gap-hairline">
                <span className="leading-relaxed">{point.label}</span>
                {!credited && (
                  <span className="text-muted-foreground text-xs leading-relaxed">
                    {point.missedAdvice}
                  </span>
                )}
              </div>
              <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                {credited ? point.marks : 0}/{point.marks}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── AI feedback ──────────────────────────────────────────────────────── */

function AiRubricReview({
  question,
  grading,
}: {
  question: Question;
  grading: WrittenGrading;
}) {
  const rubric = rubricFor(question);
  const points = grading.points ?? [];
  const earned = points.reduce((sum, p) => sum + p.awarded, 0);
  const total = points.reduce((sum, p) => sum + p.max, 0);

  return (
    <div className="flex flex-col gap-snug">
      <div className="flex items-baseline justify-between gap-tight">
        <span className="text-xs font-medium">Rubric feedback</span>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {earned}/{total}
        </span>
      </div>
      <ul className="flex flex-col gap-tight">
        {points.map((point) => {
          const label = rubric.find((r) => r.id === point.rubricId)?.label ?? point.rubricId;
          const full = point.awarded === point.max;
          return (
            <li
              key={point.rubricId}
              className={cn(
                'flex items-start gap-snug rounded-lg border p-snug text-sm',
                full
                  ? 'border-success/40 bg-success/8'
                  : point.awarded > 0
                    ? 'border-warning/40'
                    : 'border-border',
              )}
            >
              <span className="mt-0.5 shrink-0">
                {full ? (
                  <CheckIcon className="text-success size-4" aria-hidden />
                ) : (
                  <XIcon className="text-muted-foreground size-4" aria-hidden />
                )}
              </span>
              <div className="flex flex-1 flex-col gap-hairline">
                <span className="leading-relaxed">{label}</span>
                <span className="text-muted-foreground text-xs leading-relaxed">
                  {point.feedback}
                </span>
              </div>
              <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                {point.awarded}/{point.max}
              </span>
            </li>
          );
        })}
      </ul>
      {grading.summary && (
        <p className="text-sm leading-relaxed">
          <span className="font-medium">Next step: </span>
          {grading.summary}
        </p>
      )}
    </div>
  );
}

function AwaitingFeedback({ grading }: { grading: WrittenGrading | undefined }) {
  return (
    <div className="text-muted-foreground flex items-start gap-tight rounded-lg border border-dashed p-snug text-sm">
      <HourglassIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {grading?.status === 'failed'
          ? `Feedback could not be fetched. ${grading.error ?? ''} Your answer is saved and has not been marked yet.`
          : 'Your answer is saved and waiting for feedback. It does not count for or against your progress until it is marked.'}
      </span>
    </div>
  );
}

/**
 * The control for an attempt's waiting written answers: how many, whether
 * feedback is being fetched, and a way to start, stop or retry it.
 */
export function PendingFeedbackPanel({
  waiting,
  running,
  error,
  onGrade,
  onCancel,
}: {
  waiting: number;
  running: boolean;
  error: string | null;
  onGrade: () => void;
  onCancel: () => void;
}) {
  if (waiting === 0 && !running) return null;
  return (
    <div
      className="bg-muted/40 flex flex-col gap-snug rounded-lg border p-gutter"
      aria-live="polite"
    >
      <span className="text-sm font-medium">
        {running
          ? 'Getting feedback on your written answers…'
          : `${waiting} written ${waiting === 1 ? 'answer is' : 'answers are'} waiting for feedback`}
      </span>
      <span className="text-muted-foreground text-xs leading-relaxed">
        Your answers are saved. Until feedback arrives, the marks shown leave these answers
        out, and they count neither for nor against your progress.
      </span>
      {error && <span className="text-destructive text-xs">{error}</span>}
      <div>
        {running ? (
          <Button variant="outline" size="sm" onClick={onCancel}>
            <SquareIcon />
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={onGrade}>
            <RotateCcwIcon />
            {error ? 'Try again' : 'Get feedback'}
          </Button>
        )}
      </div>
    </div>
  );
}
