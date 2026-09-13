/**
 * Provisional demo lesson: demand shift versus movement along a demand curve.
 *
 * FIXTURE CONTENT. Original text written for Rawi; no third-party source is
 * ingested here. docs/DELIVERY.md R01 permits a small original microeconomics
 * fixture while R00 discovery selects the real pilot course, and explicitly
 * does not authorize building a full economics curriculum.
 *
 * This module is the only place lesson content lives. Replacing the course
 * means replacing this file and its type-checked shape — no other module
 * hardcodes economics.
 */
import type { Explanation, SourceExcerpt } from '../shared/types.js';

/** A question including the parts the browser must never receive. */
export interface AuthoredQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly { id: string; label: string }[];
  readonly explainPrompt?: string;
  /** Server-only. Never serialised into a SessionView. */
  readonly correctOptionId: string;
  /** Server-only. Revealed on request or after grading. */
  readonly answerExplanation: string;
  /** Hints in escalating order of support. */
  readonly hints: readonly string[];
  /** Reviewer who checked this item and its grading criteria. */
  readonly reviewedBy: string;
}

export interface AuthoredLesson {
  readonly id: string;
  readonly title: string;
  readonly conceptId: string;
  readonly conceptName: string;
  readonly objective: string;
  /** Opening diagnostic attempt. */
  readonly diagnostic: AuthoredQuestion;
  readonly explanation: Explanation;
  /** Guided practice, where hints are expected and recorded. */
  readonly practice: AuthoredQuestion;
  /** Fresh independent check. Distinct item, not a repeat of practice. */
  readonly check: AuthoredQuestion;
}

const source: SourceExcerpt = {
  sourceId: 'rawi-demo-notes-v1',
  title: 'Rawi demo notes: demand',
  version: '2026-09-13',
  excerpt:
    'A change in the price of the good itself moves the market along a fixed ' +
    'demand curve. A change in any other relevant condition — income, the ' +
    'price of a substitute or complement, tastes, expectations, or the number ' +
    'of buyers — shifts the whole demand curve to a new position.',
  permission: 'Original text written for Rawi; no external licence required.',
};

export const demoLesson: AuthoredLesson = {
  id: 'demand-shift-vs-movement',
  title: 'Shift in demand or movement along the curve?',
  conceptId: 'demand-shift-vs-movement',
  conceptName: 'Demand shifts versus movement along the curve',
  objective:
    'Decide whether a described change shifts the demand curve or moves the ' +
    'market along it, and say why.',

  diagnostic: {
    id: 'q-diagnostic',
    prompt:
      'The price of bus tickets falls. Riders buy more bus tickets. On the ' +
      'demand curve for bus tickets, what has happened?',
    options: [
      { id: 'a', label: 'The demand curve shifted to the right' },
      { id: 'b', label: 'The market moved along the existing demand curve' },
      { id: 'c', label: 'The demand curve shifted to the left' },
      { id: 'd', label: 'I don’t know yet' },
    ],
    explainPrompt: 'In one sentence, what made you choose that? (Optional)',
    correctOptionId: 'b',
    answerExplanation:
      'The price of the good itself changed, so the market moved along the ' +
      'existing curve. Nothing about riders’ income, tastes, or the price ' +
      'of alternatives changed, so the curve itself stayed put.',
    hints: [
      'Ask first: did the price of this good change, or did something else change?',
      'A change in the good’s own price never shifts its own demand curve.',
    ],
    reviewedBy: 'Pending subject-reviewer sign-off (R00)',
  },

  explanation: {
    id: 'exp-demand-shift',
    body:
      'Use one test. If the thing that changed is the price of the good ' +
      'itself, you move along the curve: the curve is already drawn for every ' +
      'possible price of that good.\n\n' +
      'If the thing that changed is anything else — income, the price of a ' +
      'substitute or complement, tastes, expectations, or how many buyers ' +
      'there are — the curve itself shifts, because buyers now want a ' +
      'different quantity at every price.\n\n' +
      'Worked example: petrol becomes more expensive, and people buy more bus ' +
      'tickets. The price of a bus ticket did not change, so this is not a ' +
      'movement along the bus-ticket curve. Petrol is a substitute for bus ' +
      'travel, so the demand curve for bus tickets shifts right.',
    sourceExcerpt: source,
  },

  practice: {
    id: 'q-practice',
    prompt:
      'A city raises salaries for most workers. Nothing else changes. For a ' +
      'normal good such as restaurant meals, what happens?',
    options: [
      { id: 'a', label: 'Movement along the demand curve' },
      { id: 'b', label: 'The demand curve shifts right' },
      { id: 'c', label: 'The demand curve shifts left' },
      { id: 'd', label: 'Nothing changes until prices change' },
    ],
    correctOptionId: 'b',
    answerExplanation:
      'Income rose, and restaurant meals are a normal good, so buyers want ' +
      'more at every price. That is a rightward shift of the whole curve — ' +
      'the price of a meal has not changed.',
    hints: [
      'What exactly changed here — the price of a meal, or something else?',
      'Income changed, not the good’s own price. So the curve moves, not the point on it.',
      'For a normal good, higher income means more wanted at every price: a shift to the right.',
    ],
    reviewedBy: 'Pending subject-reviewer sign-off (R00)',
  },

  check: {
    id: 'q-check',
    prompt:
      'Coffee and tea are substitutes. The price of coffee rises sharply, and ' +
      'nothing else changes. In the market for tea, what happens?',
    options: [
      { id: 'a', label: 'Movement along the demand curve for tea' },
      { id: 'b', label: 'The demand curve for tea shifts left' },
      { id: 'c', label: 'The demand curve for tea shifts right' },
      { id: 'd', label: 'The demand curve for tea is unchanged' },
    ],
    correctOptionId: 'c',
    answerExplanation:
      'The price that changed was coffee’s, not tea’s. Because the ' +
      'two are substitutes, dearer coffee makes buyers want more tea at every ' +
      'tea price, shifting the tea demand curve to the right.',
    hints: [
      'Whose price changed — tea’s, or another good’s?',
      'A substitute’s price changing is one of the conditions that shifts the curve.',
    ],
    reviewedBy: 'Pending subject-reviewer sign-off (R00)',
  },
};
