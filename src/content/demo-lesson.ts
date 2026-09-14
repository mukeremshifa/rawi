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
  readonly curriculumVersion: string;
  readonly reviewerStatus: 'pending' | 'reviewed';
  readonly sources: readonly SourceExcerpt[];
  readonly misconceptions: readonly string[];
  readonly workedExamples: readonly string[];
  /** Opening diagnostic attempt. */
  readonly diagnostic: AuthoredQuestion;
  readonly explanation: Explanation;
  /** Guided practice, where hints are expected and recorded. */
  readonly practice: AuthoredQuestion;
  /**
   * Primary independent check (first item selected). Distinct from practice.
   * When a learner converts it to help, the server selects from checkBank.
   */
  readonly check: AuthoredQuestion;
  /**
   * Additional independent check items. Used when the primary check (or a
   * previous bank item) is converted to help. The server tracks which items
   * have been exposed; a converted item is never reused as a fresh check.
   * Bank items must be distinct in prompt and correct answer from each other
   * and from `check`.
   */
  readonly checkBank: readonly AuthoredQuestion[];
  /** Distinct delayed items. These are never used for the immediate check. */
  readonly reviewBank: readonly AuthoredQuestion[];
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
  reviewerStatus: 'pending',
};

const sourceExample: SourceExcerpt = {
  sourceId: 'rawi-demo-example-v1',
  title: 'Rawi worked example: substitutes',
  version: '2026-09-14',
  excerpt:
    'When the price of a substitute rises, buyers switch toward the other good. ' +
    'At every unchanged price of that other good, more is demanded, so its demand curve shifts right.',
  permission: 'Original text written for Rawi; no external licence required.',
  reviewerStatus: 'pending',
};

const sourceMisconception: SourceExcerpt = {
  sourceId: 'rawi-demo-misconceptions-v1',
  title: 'Rawi misconception guide: reading the changed variable',
  version: '2026-09-14',
  excerpt:
    'A common error is to treat every quantity change as a curve shift. First identify ' +
    'the variable that changed: the good\u2019s own price means movement along; another determinant means a shift.',
  permission: 'Original text written for Rawi; no external licence required.',
  reviewerStatus: 'pending',
};

export const demoLesson: AuthoredLesson = {
  id: 'demand-shift-vs-movement',
  title: 'Shift in demand or movement along the curve?',
  conceptId: 'demand-shift-vs-movement',
  conceptName: 'Demand shifts versus movement along the curve',
  curriculumVersion: 'demo-demand-v2-2026-09-14',
  reviewerStatus: 'pending',
  sources: [source, sourceExample, sourceMisconception],
  misconceptions: [
    'Any change in quantity demanded must mean the demand curve shifted.',
    'A change in a related good\u2019s price is a movement along this good\u2019s demand curve.',
  ],
  workedExamples: [
    'Petrol becomes more expensive and bus demand rises: petrol is a substitute, so the bus-demand curve shifts right.',
  ],
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

  /**
   * Replacement check items. The server selects the next unexposed item when
   * the learner converts their active check to help. Items are original content
   * written for Rawi. None may recycle the same prompt or correct option as
   * check or each other. correctOptionId and answerExplanation are server-only.
   */
  checkBank: [
    {
      id: 'q-check-b1',
      prompt:
        'Bus and train travel are substitutes. Train fares fall. ' +
        'Nothing else changes. In the market for bus travel, what happens?',
      options: [
        { id: 'a', label: 'The demand curve for bus travel shifts right' },
        { id: 'b', label: 'Movement along the existing demand curve for bus travel' },
        { id: 'c', label: 'The demand curve for bus travel shifts left' },
        { id: 'd', label: 'No change to the demand curve for bus travel' },
      ],
      correctOptionId: 'c',
      answerExplanation:
        'Train fares fell, making train travel cheaper relative to buses. ' +
        'Buyers now want less bus travel at every bus price because a substitute ' +
        'became more attractive \u2014 the bus demand curve shifts left.',
      hints: [
        'The bus price did not change. So is this a movement or a shift?',
        'Train travel is a substitute. Cheaper train fares make people want fewer bus trips at any price.',
      ],
      reviewedBy: 'Pending subject-reviewer sign-off (R00)',
    },
    {
      id: 'q-check-b2',
      prompt:
        'A government report finds that eating red meat raises health risks. ' +
        'Consumer tastes shift away from red meat. In the market for red meat, ' +
        'what happens?',
      options: [
        { id: 'a', label: 'Movement along the demand curve for red meat' },
        { id: 'b', label: 'The demand curve for red meat shifts left' },
        { id: 'c', label: 'The demand curve for red meat shifts right' },
        { id: 'd', label: 'The price of red meat changes but not the curve' },
      ],
      correctOptionId: 'b',
      answerExplanation:
        'Tastes changed \u2014 a buyer characteristic, not the price of red meat ' +
        'itself. A change in tastes shifts the whole curve; at every price, buyers ' +
        'now want less red meat, so the curve shifts left.',
      hints: [
        'Did the price of red meat change, or did something else change?',
        'Tastes are one of the factors that can shift the demand curve.',
      ],
      reviewedBy: 'Pending subject-reviewer sign-off (R00)',
    },
    {
      id: 'q-check-b3',
      prompt:
        'Buyers of smartphones expect that next month\'s models will be ' +
        'significantly better and cheaper. Nothing else changes this month. ' +
        'In the current market for smartphones, what most likely happens?',
      options: [
        { id: 'a', label: 'The demand curve shifts right: people buy more now' },
        { id: 'b', label: 'Movement along the existing demand curve' },
        { id: 'c', label: 'The demand curve shifts left: people wait and buy less now' },
        { id: 'd', label: 'No change; expectations do not affect demand' },
      ],
      correctOptionId: 'c',
      answerExplanation:
        'Buyers\u2019 expectations about future prices are one of the demand-shift ' +
        'factors. Expecting a cheaper, better product next month, rational buyers ' +
        'postpone purchases, so demand for current models falls \u2014 the curve shifts left.',
      hints: [
        'Did the current price of smartphones change, or did something about buyers\u2019 expectations change?',
        'Expectations about future prices are one of the factors listed that shifts a demand curve.',
      ],
      reviewedBy: 'Pending subject-reviewer sign-off (R00)',
    },
  ],
  reviewBank: [
    {
      id: 'q-review-1',
      prompt:
        'A streaming service cuts its own monthly price. More households subscribe. ' +
        'What happened on the demand curve for that service?',
      options: [
        { id: 'a', label: 'The demand curve shifted right' },
        { id: 'b', label: 'Movement along the existing demand curve' },
        { id: 'c', label: 'The demand curve shifted left' },
        { id: 'd', label: 'There is not enough information' },
      ],
      correctOptionId: 'b',
      answerExplanation:
        'The service\u2019s own price changed, so households moved along its existing demand curve. ' +
        'No outside determinant was described.',
      hints: [],
      reviewedBy: 'Pending subject-reviewer sign-off (R00)',
    },
    {
      id: 'q-review-2',
      prompt:
        'Laptops and tablets are substitutes. Tablet prices rise while laptop prices stay fixed. ' +
        'What happens to demand for laptops?',
      options: [
        { id: 'a', label: 'Movement along the laptop demand curve' },
        { id: 'b', label: 'The laptop demand curve shifts left' },
        { id: 'c', label: 'The laptop demand curve shifts right' },
        { id: 'd', label: 'Laptop demand cannot change' },
      ],
      correctOptionId: 'c',
      answerExplanation:
        'A substitute\u2019s price rose, so buyers switch toward laptops at every laptop price. ' +
        'That shifts the laptop demand curve right.',
      hints: [],
      reviewedBy: 'Pending subject-reviewer sign-off (R00)',
    },
  ],
};
