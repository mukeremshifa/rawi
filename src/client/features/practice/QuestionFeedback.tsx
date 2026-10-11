import { CheckIcon, MessageSquareIcon, XIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { AnswerValue, Question, QuestionAttempt } from '@shared/domain/types';
import { readNumber } from '@shared/domain/marking';

import { FORMAT_LABEL, OutcomeBadge, RATING_LABEL, SELF_MARK_LABEL, SourceLink } from '@/components/domain';
import { Prose } from '@/components/Prose';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * What the learner sees once a question is marked: the outcome, their answer against the key, then
 * the explanation and its source. Flashcards and self-checks say that the student marked them.
 * Colour appears only on outcomes.
 */
export function QuestionFeedback({ question, attempt, discussTo }: { question: Question; attempt: QuestionAttempt; discussTo?: string }) {
  return (
    <div className="flex flex-col gap-gutter">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <OutcomeBadge outcome={attempt.outcome} />
        <span className="tabular">{attempt.marksAwarded} of {attempt.marksAvailable} {attempt.marksAvailable === 1 ? 'mark' : 'marks'}</span>
        <span aria-hidden>·</span><span>{FORMAT_LABEL[question.format]}</span>
        {attempt.usedHint && <><span aria-hidden>·</span><span>Hint used</span></>}
      </div>
      <AnswerReview question={question} response={attempt.response} />
      <section className="flex flex-col gap-1.5 border-t pt-gutter">
        <h3 className="text-base font-semibold">Explanation</h3>
        <Prose text={question.explanation} className="font-serif" />
        {question.source && <SourceLink source={question.source} className="mt-1" />}
      </section>
      {discussTo && attempt.outcome !== 'correct' && (
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
    case 'multiple-choice': {
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
    case 'numeric': {
      const given = response.kind === 'number' ? response.value.trim() : '';
      const unit = question.numeric?.unit ? ` ${question.numeric.unit}` : '';
      const read = readNumber(given), ok = read !== null && !!question.numeric && Math.abs(read - question.numeric.value) <= question.numeric.tolerance;
      return (
        <ul className="flex flex-col gap-tight">
          <Row tone={ok ? 'right' : 'wrong'}>
            <Mark ok={ok} />
            <span className={cn('font-medium', !given && 'text-muted-foreground')}>{given ? `${given}${unit}` : 'Left blank'}</span>
            {!ok && question.numeric && <span className="text-muted-foreground text-sm">Expected {question.numeric.value.toLocaleString()}{unit}</span>}
          </Row>
        </ul>
      );
    }
    case 'cloze': {
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
    case 'self-check': {
      const text = response.kind === 'self-check' || response.kind === 'text' ? response.text : '';
      const mark = response.kind === 'self-check' ? response.mark : null;
      return (
        <div className="flex flex-col gap-gutter">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-base font-semibold">Your answer</h3>
            <div className="bg-surface rounded-md border px-4 py-3 font-serif">{text.trim() ? <Prose text={text} /> : <p className="text-muted-foreground italic">Nothing was written.</p>}</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-base font-semibold">Model answer</h3>
            <div className="rounded-md border px-4 py-3 font-serif"><Prose text={question.answer ?? ''} /></div>
          </div>
          <p className="text-muted-foreground text-sm">{mark ? <>You marked this <span className="text-foreground font-medium">{SELF_MARK_LABEL[mark]}</span>. Self-marked, so it counts separately from marked answers.</> : 'Not marked against the model answer.'}</p>
        </div>
      );
    }
  }
}
