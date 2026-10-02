import { useMemo, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, LightbulbIcon } from 'lucide-react';

import type { AnswerValue, Question, SelfRating } from '@shared/types.ts';

import { Prose } from '@/components/Prose';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The answer interaction for every question format.
 *
 * ── Why one component and not nine ────────────────────────────────────────
 *
 * Practice and exams both need all of these, and both need them to behave
 * identically — an exam answer and a practice answer are the same `AnswerValue`
 * and are marked by the same code, so they had better be *entered* the same
 * way too. Splitting per format would have meant two copies of each interaction
 * drifting apart.
 *
 * The component is controlled: it never holds the answer, it reports changes
 * upward. That is what makes answer preservation across exam navigation free
 * — the run holds every answer and this just draws the current one.
 *
 * ── `readOnly` ────────────────────────────────────────────────────────────
 *
 * Set after submission, and after a section is locked by released feedback.
 * The inputs are disabled rather than replaced with text, so the student sees
 * their answer in the shape they gave it.
 */

export function QuestionView({
  question,
  answer,
  onChange,
  readOnly = false,
  hintsAllowed = false,
  onHintUsed,
}: {
  question: Question;
  answer: AnswerValue | undefined;
  onChange: (answer: AnswerValue) => void;
  readOnly?: boolean;
  hintsAllowed?: boolean;
  onHintUsed?: () => void;
}) {
  const [hintShown, setHintShown] = useState(false);

  return (
    <div className="flex flex-col gap-base">
      {question.extract && (
        <Card className="bg-muted/40">
          <CardContent>
            <Prose text={question.extract} size="compact" />
          </CardContent>
        </Card>
      )}

      <div className="text-[0.975rem] leading-relaxed">
        <Prose text={question.prompt} />
      </div>

      <AnswerInput
        question={question}
        answer={answer}
        onChange={onChange}
        readOnly={readOnly}
      />

      {/* No hint on a flashcard: "reveal the answer" already is the hint, and
          offering both makes the reveal look like a penalty. */}
      {hintsAllowed && !readOnly && question.format !== 'flashcard' && question.explanation && (
        <div className="flex flex-col gap-tight">
          {hintShown ? (
            <div className="bg-warning/10 border-warning/30 flex items-start gap-tight rounded-lg border p-snug text-sm">
              <LightbulbIcon className="text-warning-text mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="mb-hairline font-medium">Hint</p>
                <p className="text-muted-foreground leading-relaxed">
                  {hintFor(question)}
                </p>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => {
                setHintShown(true);
                onHintUsed?.();
              }}
            >
              <LightbulbIcon />
              Show a hint
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A hint, derived from the authored explanation.
 *
 * The first sentence of the explanation, which in this question bank is
 * consistently the "what to notice" line rather than the answer itself. Deriving
 * rather than authoring a separate hint field keeps the bank smaller and, more
 * importantly, keeps a hint from drifting out of step with the explanation it
 * is meant to lead towards.
 */
function hintFor(question: Question): string {
  const first = question.explanation.split(/(?<=\.)\s+/)[0];
  return first ?? question.explanation;
}

function AnswerInput({
  question,
  answer,
  onChange,
  readOnly,
}: {
  question: Question;
  answer: AnswerValue | undefined;
  onChange: (answer: AnswerValue) => void;
  readOnly: boolean;
}) {
  switch (question.format) {
    case 'multiple-choice':
      return (
        <ChoiceInput
          options={question.options ?? []}
          selected={answer?.kind === 'choice' ? answer.indices : []}
          multiple={false}
          readOnly={readOnly}
          name={question.id}
          onChange={(indices) => onChange({ kind: 'choice', indices })}
        />
      );

    case 'multiple-select':
      return (
        <ChoiceInput
          options={question.options ?? []}
          selected={answer?.kind === 'choice' ? answer.indices : []}
          multiple
          readOnly={readOnly}
          name={question.id}
          onChange={(indices) => onChange({ kind: 'choice', indices })}
        />
      );

    case 'fill-blank':
      return (
        <BlanksInput
          template={question.template ?? question.prompt}
          values={answer?.kind === 'blanks' ? answer.values : []}
          readOnly={readOnly}
          onChange={(values) => onChange({ kind: 'blanks', values })}
        />
      );

    case 'ordering':
      return (
        <OrderingInput
          items={question.sequence ?? []}
          current={answer?.kind === 'ordering' ? answer.sequence : []}
          readOnly={readOnly}
          onChange={(sequence) => onChange({ kind: 'ordering', sequence })}
        />
      );

    case 'matching':
      return (
        <MatchingInput
          pairs={question.pairs ?? []}
          assignments={answer?.kind === 'matching' ? answer.assignments : {}}
          readOnly={readOnly}
          onChange={(assignments) => onChange({ kind: 'matching', assignments })}
        />
      );

    case 'written-recall':
    case 'source-analysis':
    case 'essay':
      return (
        <WrittenInput
          question={question}
          text={answer?.kind === 'text' ? answer.text : ''}
          readOnly={readOnly}
          onChange={(text) => onChange({ kind: 'text', text })}
        />
      );

    case 'flashcard':
      return (
        <FlashcardInput
          question={question}
          rating={answer?.kind === 'self-rating' ? answer.rating : undefined}
          readOnly={readOnly}
          onChange={(rating) => onChange({ kind: 'self-rating', rating })}
        />
      );
  }
}

/* ── Choice ───────────────────────────────────────────────────────────── */

function ChoiceInput({
  options,
  selected,
  multiple,
  readOnly,
  name,
  onChange,
}: {
  options: string[];
  selected: number[];
  multiple: boolean;
  readOnly: boolean;
  name: string;
  onChange: (indices: number[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-tight" disabled={readOnly}>
      <legend className="sr-only">
        {multiple ? 'Select all that apply' : 'Select one answer'}
      </legend>
      {multiple && (
        <p className="text-muted-foreground mb-tight text-xs">
          Select every option that applies. Wrong selections reduce the mark.
        </p>
      )}
      {options.map((option, index) => {
        const checked = selected.includes(index);
        return (
          <label
            key={index}
            className={cn(
              'flex cursor-pointer items-start gap-snug rounded-lg border p-snug transition-colors',
              checked ? 'border-primary bg-primary/5' : 'hover:bg-accent/50',
              readOnly && 'cursor-default',
            )}
          >
            {multiple ? (
              <Checkbox
                checked={checked}
                disabled={readOnly}
                onCheckedChange={(next) =>
                  onChange(
                    next
                      ? [...selected, index].sort((a, b) => a - b)
                      : selected.filter((i) => i !== index),
                  )
                }
                className="mt-0.5"
              />
            ) : (
              <input
                type="radio"
                name={name}
                checked={checked}
                disabled={readOnly}
                onChange={() => onChange([index])}
                className="accent-primary mt-1 size-4 shrink-0"
              />
            )}
            <span className="text-sm leading-relaxed">{option}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/* ── Fill in the blank ────────────────────────────────────────────────── */

function BlanksInput({
  template,
  values,
  readOnly,
  onChange,
}: {
  template: string;
  values: string[];
  readOnly: boolean;
  onChange: (values: string[]) => void;
}) {
  const parts = useMemo(() => template.split('___'), [template]);
  const blankCount = parts.length - 1;

  return (
    <p className="text-[0.975rem] leading-loose">
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < blankCount && (
            <>
              <Label htmlFor={`blank-${index}`} className="sr-only">
                Blank {index + 1}
              </Label>
              <Input
                id={`blank-${index}`}
                value={values[index] ?? ''}
                disabled={readOnly}
                onChange={(e) => {
                  const next = Array.from(
                    { length: blankCount },
                    (_, i) => values[i] ?? '',
                  );
                  next[index] = e.target.value;
                  onChange(next);
                }}
                className="mx-1 inline-block h-8 w-36 align-baseline"
                autoComplete="off"
              />
            </>
          )}
        </span>
      ))}
    </p>
  );
}

/* ── Ordering ─────────────────────────────────────────────────────────── */

/**
 * Ordering, with buttons rather than drag and drop.
 *
 * Drag and drop is the expected interaction and it is the wrong one for an
 * exam: it needs a pointer, it is awkward on a phone, and making it keyboard
 * accessible means building a parallel button interface anyway. So the buttons
 * are the only interface, which is smaller, works everywhere, and is what a
 * keyboard user would have got regardless.
 *
 * The initial order is the authored sequence rotated, so the student is never
 * handed the correct answer as the starting state.
 */
function OrderingInput({
  items,
  current,
  readOnly,
  onChange,
}: {
  items: string[];
  current: string[];
  readOnly: boolean;
  onChange: (sequence: string[]) => void;
}) {
  const sequence = useMemo(() => {
    if (current.length === items.length) return current;
    if (items.length < 2) return items;
    // A deterministic shuffle: reverse, then rotate by one. Stable across
    // reloads (so an exam paper does not reshuffle) and never the answer.
    const reversed = [...items].reverse();
    return [...reversed.slice(1), reversed[0]!];
  }, [items, current]);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sequence.length) return;
    const next = [...sequence];
    const a = next[index]!;
    const b = next[target]!;
    next[index] = b;
    next[target] = a;
    onChange(next);
  };

  return (
    <ol className="flex flex-col gap-tight">
      {sequence.map((item, index) => (
        <li
          key={item}
          className="flex items-center gap-snug rounded-lg border p-snug"
        >
          <span className="text-muted-foreground w-5 shrink-0 text-center font-mono text-xs tabular-nums">
            {index + 1}
          </span>
          <span className="flex-1 text-sm leading-relaxed">{item}</span>
          <div className="flex shrink-0 flex-col gap-hairline">
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={readOnly || index === 0}
              onClick={() => move(index, -1)}
              aria-label={`Move “${item}” up`}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={readOnly || index === sequence.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`Move “${item}” down`}
            >
              <ArrowDownIcon />
            </Button>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── Matching ─────────────────────────────────────────────────────────── */

function MatchingInput({
  pairs,
  assignments,
  readOnly,
  onChange,
}: {
  pairs: { left: string; right: string }[];
  assignments: Record<string, string>;
  readOnly: boolean;
  onChange: (assignments: Record<string, string>) => void;
}) {
  // Options are sorted alphabetically rather than left in authored order, so
  // the nth dropdown does not default to the nth correct answer.
  const options = useMemo(
    () => [...pairs.map((p) => p.right)].sort((a, b) => a.localeCompare(b)),
    [pairs],
  );

  return (
    <div className="flex flex-col gap-snug">
      {pairs.map((pair) => (
        <div
          key={pair.left}
          className="flex flex-wrap items-center gap-snug rounded-lg border p-snug"
        >
          <Label
            htmlFor={`match-${pair.left}`}
            className="min-w-32 flex-1 text-sm font-medium"
          >
            {pair.left}
          </Label>
          <Select
            id={`match-${pair.left}`}
            className="min-w-52 flex-[2]"
            value={assignments[pair.left] ?? ''}
            disabled={readOnly}
            onChange={(e) =>
              onChange({ ...assignments, [pair.left]: e.target.value })
            }
          >
            <option value="">Choose…</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>
      ))}
    </div>
  );
}

/* ── Written ──────────────────────────────────────────────────────────── */

function WrittenInput({
  question,
  text,
  readOnly,
  onChange,
}: {
  question: Question;
  text: string;
  readOnly: boolean;
  onChange: (text: string) => void;
}) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const target = question.format === 'essay' ? 300 : 90;

  return (
    <div className="flex flex-col gap-tight">
      <Label htmlFor={`written-${question.id}`} className="sr-only">
        Your answer
      </Label>
      <Textarea
        id={`written-${question.id}`}
        value={text}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
        rows={question.format === 'essay' ? 16 : 8}
        placeholder={
          question.format === 'essay'
            ? 'Write your answer. A plan with a clear thesis and named evidence earns more than unstructured prose.'
            : 'Write from memory. Close the reading first, because that is the point of the exercise.'
        }
        className="leading-relaxed"
      />
      <p className="text-muted-foreground flex items-center justify-between gap-tight text-xs">
        <span className="font-mono tabular-nums">
          {words} {words === 1 ? 'word' : 'words'}
        </span>
        <span>
          {words < target * 0.4
            ? `A full answer here is usually around ${target} words.`
            : 'Length looks reasonable for this question.'}
        </span>
      </p>
    </div>
  );
}

/* ── Flashcard ────────────────────────────────────────────────────────── */

const RATINGS: { value: SelfRating; label: string; blurb: string }[] = [
  { value: 'again', label: 'Again', blurb: 'No recall' },
  { value: 'hard', label: 'Hard', blurb: 'Got there slowly' },
  { value: 'good', label: 'Good', blurb: 'Recalled it' },
  { value: 'easy', label: 'Easy', blurb: 'Instant' },
];

/**
 * A flashcard: reveal, then rate your own recall.
 *
 * The rating buttons appear only after the reveal, which is the whole
 * discipline of the format — rating before seeing the answer is rating your
 * confidence, not your recall.
 */
function FlashcardInput({
  question,
  rating,
  readOnly,
  onChange,
}: {
  question: Question;
  rating: SelfRating | undefined;
  readOnly: boolean;
  onChange: (rating: SelfRating) => void;
}) {
  const [revealed, setRevealed] = useState(readOnly || rating !== undefined);

  return (
    <div className="flex flex-col gap-base">
      {revealed ? (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardContent className="flex flex-col gap-tight">
            <span className="text-muted-foreground text-xs font-medium">Answer</span>
            <Prose text={question.answer ?? question.explanation} size="compact" />
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="outline"
          size="lg"
          onClick={() => setRevealed(true)}
          className="self-start"
        >
          Reveal the answer
        </Button>
      )}

      {revealed && (
        <fieldset className="flex flex-col gap-tight" disabled={readOnly}>
          <legend className="mb-tight text-sm font-medium">
            How did that go?
          </legend>
          <p className="text-muted-foreground mb-tight text-xs">
            Your own judgement, recorded as self-rated rather than as an
            assessment.
          </p>
          <div className="flex flex-wrap gap-tight">
            {RATINGS.map((option) => (
              <Button
                key={option.value}
                variant={rating === option.value ? 'default' : 'outline'}
                size="sm"
                disabled={readOnly}
                onClick={() => onChange(option.value)}
                className="flex-col items-start gap-0 h-auto py-1.5"
              >
                <span>{option.label}</span>
                <span className="text-[0.65rem] opacity-70">{option.blurb}</span>
              </Button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
