import type {
  AnswerValue,
  Outcome,
  Question,
  QuestionAttempt,
  RubricPoint,
} from './types.ts';

/**
 * Marking, for every format.
 *
 * ── What this is honest about ─────────────────────────────────────────────
 *
 * Objective formats are marked exactly: a multiple-choice answer either matches
 * the key or it does not, and there is nothing simulated about that.
 *
 * Written formats are marked by **keyword matching against an authored
 * rubric**, and that is a very different thing. It cannot tell a well-argued
 * paragraph from a keyword-stuffed one, and it will credit a point that happens
 * to contain the right noun. The UI says so every time it shows written
 * feedback — see `SIMULATED_MARKING_NOTICE`. Calling this "AI marking" would be
 * the exact dishonesty the brief rules out, so the prototype calls it what it
 * is: a rubric checker looking for the words a good answer usually contains.
 *
 * The one thing it does do well is diagnostic: a rubric point the answer missed
 * comes with authored advice about what was absent, which is genuinely useful
 * feedback even from a crude marker.
 */

export const SIMULATED_MARKING_NOTICE =
  'Simulated marking. Written answers are checked against an authored rubric by looking for the words a strong answer usually contains, not by reading your argument. Treat the rubric points as a checklist, not a grade.';

/* ── Per-format marking ───────────────────────────────────────────────── */

function markChoice(question: Question, answer: AnswerValue) {
  if (answer.kind !== 'choice') return { outcome: 'skipped' as Outcome, fraction: 0 };
  const correct = new Set(question.correctIndices ?? []);
  const given = new Set(answer.indices);
  if (given.size === 0) return { outcome: 'skipped' as Outcome, fraction: 0 };

  if (question.format === 'multiple-choice') {
    const ok = given.size === 1 && correct.has([...given][0]!);
    return { outcome: (ok ? 'correct' : 'incorrect') as Outcome, fraction: ok ? 1 : 0 };
  }

  // Multiple select: credit for correct picks, penalty for wrong ones, floored
  // at zero. All-or-nothing would make a 4-of-5 answer score the same as a
  // blank one, which is not a fair reading of what the student knew.
  let hits = 0;
  let misses = 0;
  for (const i of given) (correct.has(i) ? (hits += 1) : (misses += 1));
  const raw = (hits - misses) / correct.size;
  const fraction = Math.max(0, Math.min(1, raw));
  const outcome: Outcome =
    fraction === 1 ? 'correct' : fraction === 0 ? 'incorrect' : 'partial';
  return { outcome, fraction };
}

function markBlanks(question: Question, answer: AnswerValue) {
  if (answer.kind !== 'blanks') return { outcome: 'skipped' as Outcome, fraction: 0 };
  const keys = question.blanks ?? [];
  if (keys.length === 0) return { outcome: 'skipped' as Outcome, fraction: 0 };
  if (answer.values.every((v) => !v.trim())) {
    return { outcome: 'skipped' as Outcome, fraction: 0 };
  }

  let hits = 0;
  keys.forEach((accepted, i) => {
    const given = (answer.values[i] ?? '').trim().toLowerCase();
    if (given && accepted.some((a) => a.trim().toLowerCase() === given)) hits += 1;
  });
  const fraction = hits / keys.length;
  const outcome: Outcome =
    fraction === 1 ? 'correct' : fraction === 0 ? 'incorrect' : 'partial';
  return { outcome, fraction };
}

function markOrdering(question: Question, answer: AnswerValue) {
  if (answer.kind !== 'ordering') return { outcome: 'skipped' as Outcome, fraction: 0 };
  const correct = question.sequence ?? [];
  if (correct.length === 0) return { outcome: 'skipped' as Outcome, fraction: 0 };

  // Credit per item in its correct position. Partial credit matters here more
  // than anywhere: a sequence with one adjacent pair swapped demonstrates most
  // of the understanding, and scoring it zero teaches nothing.
  let hits = 0;
  correct.forEach((item, i) => {
    if (answer.sequence[i] === item) hits += 1;
  });
  const fraction = hits / correct.length;
  const outcome: Outcome =
    fraction === 1 ? 'correct' : fraction === 0 ? 'incorrect' : 'partial';
  return { outcome, fraction };
}

function markMatching(question: Question, answer: AnswerValue) {
  if (answer.kind !== 'matching') return { outcome: 'skipped' as Outcome, fraction: 0 };
  const pairs = question.pairs ?? [];
  if (pairs.length === 0) return { outcome: 'skipped' as Outcome, fraction: 0 };
  const assigned = Object.values(answer.assignments).filter(Boolean);
  if (assigned.length === 0) return { outcome: 'skipped' as Outcome, fraction: 0 };

  let hits = 0;
  for (const pair of pairs) {
    if (answer.assignments[pair.left] === pair.right) hits += 1;
  }
  const fraction = hits / pairs.length;
  const outcome: Outcome =
    fraction === 1 ? 'correct' : fraction === 0 ? 'incorrect' : 'partial';
  return { outcome, fraction };
}

/**
 * Whether the rubric point's keywords appear in the answer.
 *
 * Word-boundary matching on each keyword, so "not" does not match "cannot" and
 * "land" does not match "Iceland". Multi-word keywords are matched as
 * substrings, because phrase boundaries inside a sentence are not worth the
 * regex complexity for the accuracy gained.
 */
function creditsPoint(point: RubricPoint, text: string): boolean {
  const lower = text.toLowerCase();
  return point.keywords.some((keyword) => {
    const k = keyword.toLowerCase().trim();
    if (!k) return false;
    if (k.includes(' ')) return lower.includes(k);
    return new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(lower);
  });
}

export interface WrittenMarking {
  outcome: Outcome;
  fraction: number;
  creditedRubricIds: string[];
  /** Rubric points not credited, for the feedback panel. */
  missedRubricIds: string[];
  /** Words in the answer, so the UI can warn about a very short submission. */
  wordCount: number;
}

export function markWritten(question: Question, text: string): WrittenMarking {
  const rubric = question.rubric ?? [];
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0 || rubric.length === 0) {
    return {
      outcome: 'skipped',
      fraction: 0,
      creditedRubricIds: [],
      missedRubricIds: rubric.map((r) => r.id),
      wordCount: words.length,
    };
  }

  const credited = rubric.filter((point) => creditsPoint(point, text));
  const earned = credited.reduce((sum, p) => sum + p.marks, 0);
  const total = rubric.reduce((sum, p) => sum + p.marks, 0);
  const fraction = total === 0 ? 0 : earned / total;

  const outcome: Outcome =
    fraction >= 0.85 ? 'correct' : fraction === 0 ? 'incorrect' : 'partial';

  return {
    outcome,
    fraction,
    creditedRubricIds: credited.map((p) => p.id),
    missedRubricIds: rubric.filter((p) => !credited.includes(p)).map((p) => p.id),
    wordCount: words.length,
  };
}

/* ── The entry point ──────────────────────────────────────────────────── */

export interface MarkResult {
  outcome: Outcome;
  marksAwarded: number;
  creditedRubricIds?: string[];
  missedRubricIds?: string[];
}

/**
 * Marks one answer against one question.
 *
 * `usedHint` does not reduce marks. That is a deliberate pedagogical choice the
 * brief asks for: hints should feel welcome during tutoring, so the cost of one
 * is recorded in `AttemptMode` and in the evidence derivation — where it stops
 * the work counting as *independent* — rather than docked from a score. Being
 * penalised in marks for asking is what teaches students not to ask.
 */
export function mark(question: Question, answer: AnswerValue): MarkResult {
  switch (question.format) {
    case 'multiple-choice':
    case 'multiple-select': {
      const { outcome, fraction } = markChoice(question, answer);
      return { outcome, marksAwarded: Math.round(question.marks * fraction) };
    }
    case 'fill-blank': {
      const { outcome, fraction } = markBlanks(question, answer);
      return { outcome, marksAwarded: Math.round(question.marks * fraction) };
    }
    case 'ordering': {
      const { outcome, fraction } = markOrdering(question, answer);
      return { outcome, marksAwarded: Math.round(question.marks * fraction) };
    }
    case 'matching': {
      const { outcome, fraction } = markMatching(question, answer);
      return { outcome, marksAwarded: Math.round(question.marks * fraction) };
    }
    case 'written-recall':
    case 'source-analysis':
    case 'essay': {
      const text = answer.kind === 'text' ? answer.text : '';
      const result = markWritten(question, text);
      const rubric = question.rubric ?? [];
      const earned = rubric
        .filter((p) => result.creditedRubricIds.includes(p.id))
        .reduce((sum, p) => sum + p.marks, 0);
      return {
        outcome: result.outcome,
        // Rubric marks are the authority when they sum to the question's total,
        // which they do for every authored question. The scaling fallback
        // covers a hand-edited question whose rubric does not add up.
        marksAwarded:
          rubric.reduce((s, p) => s + p.marks, 0) === question.marks
            ? earned
            : Math.round(question.marks * result.fraction),
        creditedRubricIds: result.creditedRubricIds,
        missedRubricIds: result.missedRubricIds,
      };
    }
    case 'flashcard': {
      // A flashcard is self-rated; there is no key to mark against. "good" and
      // "easy" count as recalled, and the attempt records that this was the
      // student's own judgement rather than an assessment.
      if (answer.kind !== 'self-rating') return { outcome: 'skipped', marksAwarded: 0 };
      const recalled = answer.rating === 'good' || answer.rating === 'easy';
      return {
        outcome: recalled ? 'correct' : answer.rating === 'hard' ? 'partial' : 'incorrect',
        marksAwarded: recalled ? question.marks : answer.rating === 'hard' ? question.marks : 0,
      };
    }
  }
}

/** Builds the stored record for one marked answer. */
export function toQuestionAttempt(
  question: Question,
  answer: AnswerValue,
  usedHint: boolean,
): QuestionAttempt {
  const result = mark(question, answer);
  return {
    questionId: question.id,
    topicId: question.topicId,
    format: question.format,
    response: answer,
    outcome: result.outcome,
    marksAwarded: result.marksAwarded,
    marksAvailable: question.marks,
    usedHint,
    ...(result.creditedRubricIds ? { creditedRubricIds: result.creditedRubricIds } : {}),
  };
}

/** True when an answer has enough in it to be worth marking. */
export function hasContent(answer: AnswerValue | undefined): boolean {
  if (!answer) return false;
  switch (answer.kind) {
    case 'none':
      return false;
    case 'choice':
      return answer.indices.length > 0;
    case 'text':
      return answer.text.trim().length > 0;
    case 'blanks':
      return answer.values.some((v) => v.trim().length > 0);
    case 'ordering':
      return answer.sequence.length > 0;
    case 'matching':
      return Object.values(answer.assignments).some(Boolean);
    case 'self-rating':
      return true;
  }
}
