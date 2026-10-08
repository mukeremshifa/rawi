import { CheckIcon, HourglassIcon, MessageSquareIcon, XIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { AnswerValue, Question, QuestionAttempt, WrittenGrading } from '@shared/domain/types';
import { AI_MARKING_NOTICE, LEGACY_MARKING_NOTICE, rubricFor } from '@shared/domain/marking';

import { FORMAT_LABEL, OutcomeBadge, RATING_LABEL, SourceLink } from '@/components/domain';
import { Prose } from '@/components/Prose';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const WRITTEN = new Set(['essay', 'written-recall', 'source-analysis']);

/**
 * What the learner sees once a question is marked: the outcome, their answer
 * against the key, rubric feedback for written work, then the explanation
 * and its source. Colour appears only on outcomes.
 */
export function QuestionFeedback({ question, attempt, discussTo }: { question: Question; attempt: QuestionAttempt; discussTo?: string }) {
  const written = WRITTEN.has(question.format);
  return (
    <div className="flex flex-col gap-gutter">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <OutcomeBadge outcome={attempt.outcome} />
        <span className="tabular">{attempt.outcome === 'pending' ? `${attempt.marksAvailable} marks available` : `${attempt.marksAwarded} of ${attempt.marksAvailable} marks`}</span>
        <span aria-hidden>·</span><span>{FORMAT_LABEL[question.format]}</span>
        {attempt.usedHint && <><span aria-hidden>·</span><span>Hint used</span></>}
      </div>
      <AnswerReview question={question} response={attempt.response} />
      {written && attempt.grading?.status === 'graded' && <AiRubricReview question={question} grading={attempt.grading} />}
      {written && attempt.outcome === 'pending' && <AwaitingFeedback grading={attempt.grading} />}
      {written && !attempt.grading && attempt.outcome !== 'skipped' && question.rubric && <RubricReview question={question} creditedIds={attempt.creditedRubricIds ?? []} />}
      <section className="flex flex-col gap-1.5 border-t pt-gutter">
        <h3 className="text-base font-semibold">Explanation</h3>
        <Prose text={question.explanation} className="font-serif" />
        {question.source && <SourceLink source={question.source} className="mt-1" />}
      </section>
      {written && attempt.grading?.status === 'graded' && (
        <p className="text-muted-foreground text-sm">{attempt.grading.method === 'sample' ? 'Sample feedback, written to illustrate rubric review.' : `${AI_MARKING_NOTICE} Marked by ${attempt.grading.model ?? 'an AI model'}.`}</p>
      )}
      {written && !attempt.grading && attempt.outcome !== 'skipped' && <p className="text-muted-foreground text-sm">{LEGACY_MARKING_NOTICE}</p>}
      {discussTo && attempt.outcome !== 'correct' && attempt.outcome !== 'pending' && (
        <Button variant="secondary" size="sm" asChild className="self-start"><Link to={discussTo}><MessageSquareIcon />Work through this with the tutor</Link></Button>
      )}
    </div>
  );
}

function Mark({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="block size-4 shrink-0" />;
  return ok ? <CheckIcon className="text-success mt-0.5 size-4 shrink-0" aria-label="Correct" /> : <XIcon className="text-danger mt-0.5 size-4 shrink-0" aria-label="Incorrect" />;
}

function Row({ tone, children }: { tone: 'right' | 'wrong' | 'plain'; children: React.ReactNode }) {
  return <li className={cn('flex items-start gap-snug rounded-md border px-3 py-2 text-base', tone === 'right' && 'border-success/40 bg-success-subtle', tone === 'wrong' && 'border-danger/30')}>{children}</li>;
}

function AnswerReview({ question, response }: { question: Question; response: AnswerValue }) {
  switch (question.format) {
    case 'multiple-choice':
    case 'multiple-select': {
      const given = response.kind === 'choice' ? response.indices : [];
      const correct = question.correctIndices ?? [];
      return (
        <ul className="flex flex-col gap-tight">
          {(question.options ?? []).map((option, index) => {
            const picked = given.includes(index), isCorrect = correct.includes(index);
            return (
              <Row key={index} tone={isCorrect ? 'right' : picked ? 'wrong' : 'plain'}>
                <Mark ok={isCorrect ? true : picked ? false : null} />
                <span className="flex-1 leading-relaxed">{option}</span>
                {(picked || isCorrect) && <span className="text-muted-foreground shrink-0 text-sm">{picked && isCorrect ? 'Your answer' : picked ? 'Your answer' : 'Correct answer'}</span>}
              </Row>
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
            const ok = !!value && accepted.some(a => a.toLowerCase() === value.toLowerCase());
            return (
              <Row key={index} tone={ok ? 'right' : 'wrong'}>
                <span className="text-muted-foreground tabular w-4 text-sm">{index + 1}</span>
                <span className={cn('font-medium', !value && 'text-muted-foreground')}>{value || 'Left blank'}</span>
                {!ok && <span className="text-muted-foreground text-sm">Expected {accepted[0]}</span>}
              </Row>
            );
          })}
        </ul>
      );
    }
    case 'ordering': {
      const given = response.kind === 'ordering' ? response.sequence : [];
      return (
        <ol className="flex flex-col gap-tight">
          {(question.sequence ?? []).map((item, index) => {
            const inPlace = given[index] === item;
            return (
              <Row key={item} tone={inPlace ? 'right' : 'wrong'}>
                <span className="text-muted-foreground tabular w-4 text-sm">{index + 1}</span>
                <span className="flex flex-1 flex-col"><span>{item}</span>{!inPlace && given[index] && <span className="text-muted-foreground text-sm">You put: {given[index]}</span>}</span>
              </Row>
            );
          })}
        </ol>
      );
    }
    case 'matching': {
      const assignments = response.kind === 'matching' ? response.assignments : {};
      return (
        <ul className="flex flex-col gap-tight">
          {(question.pairs ?? []).map(pair => {
            const given = assignments[pair.left], ok = given === pair.right;
            return (
              <Row key={pair.left} tone={ok ? 'right' : 'wrong'}>
                <Mark ok={ok} />
                <span className="flex flex-1 flex-col"><span className="font-medium">{pair.left}</span>
                  <span className="text-muted-foreground text-sm">{ok ? pair.right : `You chose ${given || 'nothing'}. Correct: ${pair.right}`}</span></span>
              </Row>
            );
          })}
        </ul>
      );
    }
    case 'flashcard': {
      const rating = response.kind === 'self-rating' ? response.rating : null;
      return (
        <div className="flex flex-col gap-tight">
          <div className="bg-surface rounded-md border px-4 py-3 font-serif"><Prose text={question.answer ?? ''} /></div>
          <p className="text-muted-foreground text-sm">You rated your recall <span className="text-foreground font-medium">{rating ? RATING_LABEL[rating] : 'not at all'}</span>. Self-rated, so it counts separately from marked answers.</p>
        </div>
      );
    }
    case 'written-recall':
    case 'source-analysis':
    case 'essay': {
      const text = response.kind === 'text' ? response.text : '';
      return (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-base font-semibold">Your answer</h3>
          <div className="bg-surface rounded-md border px-4 py-3 font-serif">{text.trim() ? <Prose text={text} /> : <p className="text-muted-foreground italic">Nothing was written.</p>}</div>
        </div>
      );
    }
  }
}

function RubricReview({ question, creditedIds }: { question: Question; creditedIds: string[] }) {
  const rubric = question.rubric ?? [];
  const earned = rubric.filter(p => creditedIds.includes(p.id)).reduce((n, p) => n + p.marks, 0);
  const total = rubric.reduce((n, p) => n + p.marks, 0);
  return (
    <div className="flex flex-col gap-tight">
      <div className="flex items-baseline justify-between"><h3 className="text-base font-semibold">Rubric</h3><span className="text-muted-foreground tabular text-sm">{earned} of {total}</span></div>
      <ul className="divide-y border-y">
        {rubric.map(point => {
          const credited = creditedIds.includes(point.id);
          return (
            <li key={point.id} className="flex items-start gap-snug py-2 text-base">
              <Mark ok={credited} />
              <span className="flex flex-1 flex-col"><span>{point.label}</span>{!credited && <span className="text-muted-foreground text-sm">{point.missedAdvice}</span>}</span>
              <span className="text-muted-foreground tabular shrink-0 text-sm">{credited ? point.marks : 0}/{point.marks}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AiRubricReview({ question, grading }: { question: Question; grading: WrittenGrading }) {
  const rubric = rubricFor(question);
  const points = grading.points ?? [];
  const earned = points.reduce((n, p) => n + p.awarded, 0), total = points.reduce((n, p) => n + p.max, 0);
  return (
    <div className="flex flex-col gap-tight">
      <div className="flex items-baseline justify-between"><h3 className="text-base font-semibold">Feedback by rubric point</h3><span className="text-muted-foreground tabular text-sm">{earned} of {total}</span></div>
      <ul className="divide-y border-y">
        {points.map(point => (
          <li key={point.rubricId} className="flex items-start gap-snug py-2 text-base">
            <Mark ok={point.awarded === point.max ? true : point.awarded > 0 ? null : false} />
            <span className="flex flex-1 flex-col"><span>{rubric.find(r => r.id === point.rubricId)?.label ?? point.rubricId}</span><span className="text-muted-foreground text-sm">{point.feedback}</span></span>
            <span className="text-muted-foreground tabular shrink-0 text-sm">{point.awarded}/{point.max}</span>
          </li>
        ))}
      </ul>
      {grading.summary && <p className="text-base"><span className="font-medium">Next step: </span>{grading.summary}</p>}
    </div>
  );
}

function AwaitingFeedback({ grading }: { grading: WrittenGrading | undefined }) {
  return (
    <div className="text-muted-foreground flex items-start gap-tight rounded-md border border-dashed px-3 py-2.5 text-base">
      <HourglassIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{grading?.status === 'failed'
        ? `Feedback could not be fetched. ${grading.error ?? ''} Your answer is saved and not marked yet.`
        : 'Awaiting feedback. Your answer is saved, and it counts neither for nor against you until it is marked.'}</span>
    </div>
  );
}
