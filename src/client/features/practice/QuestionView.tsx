import { useMemo, useRef, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon } from 'lucide-react';

import type { AnswerValue, Question, SelfRating } from '@shared/domain/types';

import { Prose } from '@/components/Prose';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * The answer interaction for every question format, shared by practice and
 * exams so an answer is entered the same way in both. Controlled: the run
 * holds every answer and this draws the current one. `readOnly` keeps the
 * answer in the shape it was given, after checking or when a section locks.
 */
export function QuestionView({ question, answer, onChange, readOnly = false, revealed = false }: {
  question: Question;
  answer: AnswerValue | undefined;
  onChange: (answer: AnswerValue) => void;
  readOnly?: boolean;
  revealed?: boolean;
}) {
  return (
    <div className="flex flex-col gap-gutter">
      {question.extract && (
        <blockquote className="bg-surface rounded-md border-l-2 border-border-strong px-4 py-3 font-serif">
          <Prose text={question.extract} />
        </blockquote>
      )}
      <div className="font-serif text-lg leading-snug [&_.rawi-prose]:text-[length:inherit] [&_.rawi-prose]:leading-[inherit]">
        <Prose text={question.prompt} />
      </div>
      <AnswerInput question={question} answer={answer} onChange={onChange} readOnly={readOnly} revealed={revealed} />
    </div>
  );
}

function AnswerInput({ question, answer, onChange, readOnly, revealed }: { question: Question; answer: AnswerValue | undefined; onChange: (answer: AnswerValue) => void; readOnly: boolean; revealed: boolean }) {
  switch (question.format) {
    case 'multiple-choice':
    case 'multiple-select':
      return <ChoiceInput options={question.options ?? []} selected={answer?.kind === 'choice' ? answer.indices : []} multiple={question.format === 'multiple-select'} readOnly={readOnly} onChange={indices => onChange({ kind: 'choice', indices })} />;
    case 'fill-blank':
      return <BlanksInput template={question.template ?? question.prompt} values={answer?.kind === 'blanks' ? answer.values : []} readOnly={readOnly} onChange={values => onChange({ kind: 'blanks', values })} />;
    case 'ordering':
      return <OrderingInput items={question.sequence ?? []} current={answer?.kind === 'ordering' ? answer.sequence : []} readOnly={readOnly} onChange={sequence => onChange({ kind: 'ordering', sequence })} />;
    case 'matching':
      return <MatchingInput pairs={question.pairs ?? []} assignments={answer?.kind === 'matching' ? answer.assignments : {}} readOnly={readOnly} onChange={assignments => onChange({ kind: 'matching', assignments })} />;
    case 'written-recall':
    case 'source-analysis':
    case 'essay':
      return <WrittenInput question={question} text={answer?.kind === 'text' ? answer.text : ''} readOnly={readOnly} onChange={text => onChange({ kind: 'text', text })} />;
    case 'flashcard':
      return <FlashcardInput initiallyRevealed={revealed} question={question} rating={answer?.kind === 'self-rating' ? answer.rating : undefined} readOnly={readOnly} onChange={rating => onChange({ kind: 'self-rating', rating })} />;
  }
}

/** Choices as cards. The runner maps keys 1 to 9 onto them. */
function ChoiceInput({ options, selected, multiple, readOnly, onChange }: { options: string[]; selected: number[]; multiple: boolean; readOnly: boolean; onChange: (indices: number[]) => void }) {
  const toggle = (index: number) => {
    if (readOnly) return;
    if (!multiple) onChange([index]);
    else onChange(selected.includes(index) ? selected.filter(i => i !== index) : [...selected, index].sort((a, b) => a - b));
  };
  return (
    <div role={multiple ? 'group' : 'radiogroup'} aria-label={multiple ? 'Select every answer that applies' : 'Select one answer'} className="flex flex-col gap-tight" data-choices>
      {multiple && <p className="text-muted-foreground text-sm">Select every answer that applies. Wrong selections reduce the mark.</p>}
      {options.map((option, index) => {
        const checked = selected.includes(index);
        return (
          <button key={index} type="button" role={multiple ? 'checkbox' : 'radio'} aria-checked={checked} disabled={readOnly} onClick={() => toggle(index)}
            className={cn('bg-card flex w-full items-start gap-snug rounded-lg border px-3.5 py-3 text-left text-md shadow-raised outline-none transition-colors',
              'focus-visible:ring-ring/30 focus-visible:border-ring focus-visible:ring-3 disabled:cursor-default',
              checked ? 'border-primary bg-primary-subtle ring-1 ring-primary' : !readOnly && 'hover:bg-accent')}>
            <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center border text-xs font-medium',
              multiple ? 'rounded-[5px]' : 'rounded-full', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong text-muted-foreground')}>
              {checked ? <CheckIcon className="size-3" strokeWidth={3} aria-hidden /> : index < 9 ? index + 1 : ''}
            </span>
            <span className="min-w-0 flex-1 leading-relaxed">{option}</span>
          </button>
        );
      })}
    </div>
  );
}

function BlanksInput({ template, values, readOnly, onChange }: { template: string; values: string[]; readOnly: boolean; onChange: (values: string[]) => void }) {
  const parts = useMemo(() => template.split('___'), [template]);
  const count = parts.length - 1;
  return (
    <p className="font-serif text-md leading-[2.4]">
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < count && (
            <input aria-label={`Blank ${index + 1}`} value={values[index] ?? ''} disabled={readOnly} autoComplete="off" spellCheck={false}
              onChange={e => { const next = Array.from({ length: count }, (_, i) => values[i] ?? ''); next[index] = e.target.value; onChange(next); }}
              className="border-border-strong focus:border-primary mx-1 inline-block w-40 border-0 border-b-2 bg-transparent px-1 text-center font-sans text-base outline-none disabled:opacity-70" />
          )}
        </span>
      ))}
    </p>
  );
}

/**
 * Ordering with move buttons, which work by keyboard, by touch and in an
 * exam. The start order is the sequence reversed and rotated, so it is never
 * the answer and never reshuffles on reload.
 */
function OrderingInput({ items, current, readOnly, onChange }: { items: string[]; current: string[]; readOnly: boolean; onChange: (sequence: string[]) => void }) {
  const sequence = useMemo(() => {
    if (current.length === items.length) return current;
    if (items.length < 2) return items;
    const reversed = [...items].reverse();
    return [...reversed.slice(1), reversed[0]!];
  }, [items, current]);
  const list = useRef<HTMLOListElement>(null);
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sequence.length) return;
    const next = [...sequence];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
    requestAnimationFrame(() => list.current?.children[target]?.querySelector<HTMLButtonElement>(`[data-direction="${direction === -1 ? 'up' : 'down'}"]:not(:disabled), button:not(:disabled)`)?.focus());
  };
  return (
    <ol ref={list} className="flex flex-col gap-tight">
      {sequence.map((item, index) => (
        <li key={item} className="bg-card flex items-center gap-snug rounded-lg border px-3 py-2 shadow-raised">
          <span className="text-muted-foreground tabular w-5 shrink-0 text-center text-sm">{index + 1}</span>
          <span className="flex-1 text-md leading-relaxed">{item}</span>
          <span className="flex shrink-0 gap-0.5">
            <Button variant="ghost" size="icon-sm" data-direction="up" disabled={readOnly || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${item} up`}><ArrowUpIcon /></Button>
            <Button variant="ghost" size="icon-sm" data-direction="down" disabled={readOnly || index === sequence.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${item} down`}><ArrowDownIcon /></Button>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Matching. Options are sorted, so the nth list never defaults to the nth answer. */
function MatchingInput({ pairs, assignments, readOnly, onChange }: { pairs: { left: string; right: string }[]; assignments: Record<string, string>; readOnly: boolean; onChange: (assignments: Record<string, string>) => void }) {
  const options = useMemo(() => [...pairs.map(p => p.right)].sort((a, b) => a.localeCompare(b)).map(value => ({ value, label: value })), [pairs]);
  return (
    <div className="divide-y border-y">
      {pairs.map(pair => (
        <div key={pair.left} className="grid gap-tight py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-center">
          <span className="text-md font-medium">{pair.left}</span>
          <Select aria-label={`Match for ${pair.left}`} value={assignments[pair.left] ?? ''} disabled={readOnly} placeholder="Choose a match"
            onValueChange={value => onChange({ ...assignments, [pair.left]: value })} options={options} />
        </div>
      ))}
    </div>
  );
}

function WrittenInput({ question, text, readOnly, onChange }: { question: Question; text: string; readOnly: boolean; onChange: (text: string) => void }) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const target = question.format === 'essay' ? 300 : 90;
  return (
    <div className="flex flex-col gap-tight">
      <Textarea aria-label="Your answer" value={text} disabled={readOnly} onChange={e => onChange(e.target.value)}
        rows={question.format === 'essay' ? 14 : 7}
        placeholder={question.format === 'essay' ? 'Start with your argument, then the evidence for it.' : question.format === 'source-analysis' ? 'Work from the extract and point to the lines you rely on.' : 'Write it from memory.'}
        className="min-h-40 font-serif text-md leading-relaxed" />
      <p className="text-muted-foreground flex flex-wrap justify-between gap-tight text-sm">
        <span className="tabular">{words} {words === 1 ? 'word' : 'words'}</span>
        <span>A full answer is usually around {target} words.</span>
      </p>
    </div>
  );
}

const RATINGS: { value: SelfRating; label: string; blurb: string }[] = [
  { value: 'again', label: 'Again', blurb: "Didn't recall it" },
  { value: 'hard', label: 'Hard', blurb: 'Got there slowly' },
  { value: 'good', label: 'Good', blurb: 'Recalled it' },
  { value: 'easy', label: 'Easy', blurb: 'Instantly' },
];

/** A flashcard: reveal, then rate recall. Rating comes after the reveal, or it rates confidence. */
function FlashcardInput({ question, initiallyRevealed, rating, readOnly, onChange }: { question: Question; initiallyRevealed: boolean; rating: SelfRating | undefined; readOnly: boolean; onChange: (rating: SelfRating) => void }) {
  const [revealed, setRevealed] = useState(initiallyRevealed || readOnly || rating !== undefined);
  if (!revealed) return <Button variant="secondary" size="lg" className="self-start" onClick={() => setRevealed(true)}>Reveal the answer</Button>;
  return (
    <div className="flex flex-col gap-gutter">
      <div className="border-t pt-gutter font-serif">
        <p className="text-muted-foreground mb-1 font-sans text-sm font-medium">Answer</p>
        <Prose text={question.answer ?? question.explanation} />
      </div>
      <fieldset disabled={readOnly} className="flex flex-col gap-tight">
        <legend className="mb-1 text-base font-medium">How well did you recall it?</legend>
        <div className="grid grid-cols-2 gap-tight sm:grid-cols-4" data-choices>
          {RATINGS.map((option, i) => (
            <button key={option.value} type="button" aria-pressed={rating === option.value} onClick={() => onChange(option.value)}
              className={cn('bg-card flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left shadow-raised outline-none transition-colors focus-visible:ring-ring/30 focus-visible:ring-3 disabled:cursor-default',
                rating === option.value ? 'border-primary bg-primary-subtle ring-1 ring-primary' : 'hover:bg-accent')}>
              <span className="flex w-full items-center justify-between text-base font-medium">{option.label}<Kbd className="hidden sm:inline-flex">{i + 1}</Kbd></span>
              <span className="text-muted-foreground text-sm">{option.blurb}</span>
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-sm">Self-rated, so it counts separately from answers that are marked.</p>
      </fieldset>
    </div>
  );
}
