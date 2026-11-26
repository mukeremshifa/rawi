import type { AnswerValue, Question } from './types';

/** The correct answer a student is shown, in whatever shape the format has. */
export const answerKey = (question: Question) =>
  question.correctIndices?.map(i => question.options?.[i]).join('\n') ??
  (question.numeric
    ? `${question.numeric.value}${question.numeric.unit ? ` ${question.numeric.unit}` : ''}`
    : undefined) ??
  question.answer ??
  question.sequence?.join('\n') ??
  question.blanks?.map(b => b.join(' or ')).join('\n') ??
  question.pairs?.map(p => `${p.left}: ${p.right}`).join('\n') ??
  '';

export function responseText(value: AnswerValue, question: Question): string {
  switch (value.kind) {
    case 'text':
      return value.text;
    case 'choice':
      return value.indices.map(i => question.options?.[i] ?? `Option ${i + 1}`).join('\n');
    case 'blanks':
      return value.values.join('\n');
    case 'ordering':
      return value.sequence.join('\n');
    case 'matching':
      return Object.entries(value.assignments)
        .map(([a, b]) => `${a}: ${b}`)
        .join('\n');
    case 'number':
      return value.value;
    case 'self-check':
      return value.text;
    case 'self-rating':
      return `Self-rated recall: ${value.rating}`;
    case 'none':
      return 'No answer submitted.';
  }
}
