import type { Attempt, ExamConfig } from '../../src/shared/types.ts';
import { ATLANTIC_COURSE_ID } from './topics.ts';
import { STATS_COURSE_ID } from './stats.ts';

/**
 * The returning student's prior work.
 *
 * ── Why seed history at all ───────────────────────────────────────────────
 *
 * The brief asks for a *returning* student with visible progress, recurring
 * mistakes, and an overview that recommends work for reasons it can show. All
 * four are computed from the attempt log, so an empty log produces an app that
 * is technically correct and demonstrates none of it. Seeding ten days of
 * plausible work is what makes Progress, the review queue and the suggestion
 * reasons legible on first open.
 *
 * The seeded pattern is deliberate and matches the student the brief describes:
 * strong recall, weak causal explanation, weak comparison. So flashcards and
 * multiple-choice go well; `q-deb-essay-1` and the comparison questions have
 * been failed **twice**, which is what makes them show up as a recurring
 * mistake rather than a bad day.
 *
 * ── The reset story ───────────────────────────────────────────────────────
 *
 * Because this is seed data rather than user data, "Reset demo" restores
 * exactly this, and the store labels these attempts so the UI can distinguish
 * seeded history from work done in the session if it ever needs to.
 */

const day = (n: number) => new Date(Date.parse('2026-10-07T08:00:00.000Z') - 1000 * 60 * 60 * 24 * n).toISOString();

export const SEED_EXAM_PRESETS: ExamConfig[] = [
  {
    id: 'preset-quick',
    courseId: ATLANTIC_COURSE_ID,
    name: 'Quick check, 15 minutes',
    preset: true,
    savedAt: day(30),
    sections: [
      {
        id: 'sec-quick-1',
        title: 'Recall',
        instructions:
          'Short questions across the whole course. Answer all of them. No notes.',
        formats: ['multiple-choice', 'multiple-select', 'fill-blank'],
        topicIds: [],
        count: 6,
        minutes: 15,
      },
    ],
    timing: 'overall',
    totalMinutes: 15,
    extraTimePercent: 0,
    book: 'closed',
    allowedMaterialIds: [],
    navigation: 'free',
    flaggingEnabled: true,
    lockSectionsOnFinish: false,
  },
  {
    id: 'preset-paper',
    courseId: ATLANTIC_COURSE_ID,
    name: 'Full paper, two sections',
    preset: true,
    savedAt: day(30),
    sections: [
      {
        id: 'sec-paper-1',
        title: 'Section A: short answers',
        instructions:
          'Answer all questions in this section. Each is worth 2–4 marks. Closed book.',
        formats: ['multiple-choice', 'multiple-select', 'fill-blank', 'ordering', 'matching'],
        topicIds: [],
        count: 6,
        minutes: 25,
      },
      {
        id: 'sec-paper-2',
        title: 'Section B: extended writing',
        instructions:
          'Answer the questions in this section in continuous prose. Marks and rubrics are released once the whole paper is submitted.',
        formats: ['source-analysis', 'essay'],
        topicIds: [],
        count: 2,
        minutes: 50,
      },
    ],
    timing: 'per-section',
    totalMinutes: 75,
    extraTimePercent: 0,
    book: 'closed',
    allowedMaterialIds: [],
    navigation: 'free',
    flaggingEnabled: true,
    lockSectionsOnFinish: true,
  },
  {
    id: 'preset-rehearsal',
    courseId: ATLANTIC_COURSE_ID,
    name: 'Untimed rehearsal, essay only',
    preset: true,
    savedAt: day(30),
    sections: [
      {
        id: 'sec-reh-1',
        title: 'Extended writing',
        instructions:
          'One extended question, untimed, with your materials available. Use it to rehearse structure rather than speed.',
        formats: ['essay'],
        topicIds: ['topic-debate'],
        count: 1,
        minutes: 0,
      },
    ],
    timing: 'untimed',
    totalMinutes: 0,
    extraTimePercent: 0,
    book: 'open',
    allowedMaterialIds: ['mat-debate-lecture', 'mat-encomienda-reading'],
    navigation: 'free',
    flaggingEnabled: false,
    lockSectionsOnFinish: false,
  },
  {
    id: 'preset-stat-quiz',
    courseId: STATS_COURSE_ID,
    name: 'Quiz conditions, 20 minutes',
    preset: true,
    savedAt: day(30),
    sections: [
      {
        id: 'sec-stat-quiz-1',
        title: 'Estimation and testing',
        instructions:
          'Answer all questions. Closed book, 20 minutes. Nothing is marked until you submit the whole paper.',
        formats: ['multiple-choice', 'multiple-select', 'fill-blank', 'matching', 'ordering'],
        topicIds: [],
        count: 5,
        minutes: 20,
      },
    ],
    timing: 'overall',
    totalMinutes: 20,
    extraTimePercent: 0,
    book: 'closed',
    allowedMaterialIds: [],
    navigation: 'free',
    flaggingEnabled: true,
    lockSectionsOnFinish: false,
    assessmentIds: ['assess-stat-quiz-2'],
  },
];

/**
 * Ten days of work. Ordered oldest first; the store reverses for display.
 *
 * Note the pattern across the exam attempts: `q-deb-essay-1` fails on day 8
 * and again on day 2, and `q-enc-mc-1` is wrong on day 6 and day 2. Those are
 * the two that surface as recurring mistakes, and they are exactly the
 * weaknesses the brief describes.
 */
export const SEED_ATTEMPTS: Attempt[] = [
  {
    id: 'att-seed-1',
    courseId: ATLANTIC_COURSE_ID,
    assistanceRecord: 'tracked',
    kind: 'practice',
    mode: 'self-rated',
    title: 'Flashcards: Columbian Exchange',
    topicIds: ['topic-columbian'],
    startedAt: day(10),
    completedAt: day(10),
    marksAwarded: 2,
    marksAvailable: 2,
    questions: [
      {
        questionId: 'q-col-fc-1',
        topicId: 'topic-columbian',
        format: 'flashcard',
        response: { kind: 'self-rating', rating: 'good' },
        outcome: 'correct',
        marksAwarded: 1,
        marksAvailable: 1,
        usedHint: false,
      },
      {
        questionId: 'q-col-fc-2',
        topicId: 'topic-columbian',
        format: 'flashcard',
        response: { kind: 'self-rating', rating: 'easy' },
        outcome: 'correct',
        marksAwarded: 1,
        marksAvailable: 1,
        usedHint: false,
      },
    ],
  },
  {
    id: 'att-seed-2',
    courseId: ATLANTIC_COURSE_ID,
    assistanceRecord: 'tracked',
    kind: 'practice',
    mode: 'practice',
    title: 'Quiz: encomienda',
    topicIds: ['topic-encomienda'],
    startedAt: day(8),
    completedAt: day(8),
    marksAwarded: 3,
    marksAvailable: 7,
    questions: [
      {
        questionId: 'q-enc-mc-1',
        topicId: 'topic-encomienda',
        format: 'multiple-choice',
        response: { kind: 'choice', indices: [1] },
        outcome: 'correct',
        marksAwarded: 2,
        marksAvailable: 2,
        usedHint: true,
      },
      {
        questionId: 'q-enc-mc-2',
        topicId: 'topic-encomienda',
        format: 'multiple-choice',
        response: { kind: 'choice', indices: [0] },
        outcome: 'incorrect',
        marksAwarded: 0,
        marksAvailable: 3,
        usedHint: false,
      },
      {
        questionId: 'q-enc-fb-1',
        topicId: 'topic-encomienda',
        format: 'fill-blank',
        response: { kind: 'blanks', values: ['tribute', 'christianity', 'house'] },
        outcome: 'partial',
        marksAwarded: 1,
        marksAvailable: 2,
        usedHint: false,
      },
    ],
  },
  {
    id: 'att-seed-3',
    courseId: ATLANTIC_COURSE_ID,
    assistanceRecord: 'tracked',
    kind: 'exam',
    mode: 'exam',
    title: 'Quick check, 15 minutes',
    examConfigId: 'preset-quick',
    topicIds: ['topic-columbian', 'topic-encomienda', 'topic-debate'],
    startedAt: day(8),
    completedAt: day(8),
    marksAwarded: 17,
    marksAvailable: 35,
    questions: [
      {
        questionId: 'q-col-mc-1',
        topicId: 'topic-columbian',
        format: 'multiple-choice',
        response: { kind: 'choice', indices: [2] },
        outcome: 'incorrect',
        marksAwarded: 0,
        marksAvailable: 2,
        usedHint: false,
      },
      {
        questionId: 'q-enc-mc-1',
        topicId: 'topic-encomienda',
        format: 'multiple-choice',
        response: { kind: 'choice', indices: [1] },
        outcome: 'correct',
        marksAwarded: 2,
        marksAvailable: 2,
        usedHint: false,
      },
      {
        questionId: 'q-deb-essay-1',
        topicId: 'topic-debate',
        format: 'essay',
        response: {
          kind: 'text',
          text: 'Valderrama argues the encomienda was a fiscal device used by the Crown to raise revenue. He uses tribute schedules as evidence. Okonkwo argues that it was a system of coerced labour and uses different sources. Both historians have written about this topic and both make good points about the evidence they use.',
        },
        outcome: 'partial',
        marksAwarded: 6,
        marksAvailable: 15,
        usedHint: false,
        creditedRubricIds: ['r-ess-2', 'r-ess-3'],
      },
      {
        questionId: 'q-mer-ms-1',
        topicId: 'topic-mercantilism',
        format: 'multiple-select',
        response: { kind: 'choice', indices: [0, 1, 2] },
        outcome: 'correct',
        marksAwarded: 3,
        marksAvailable: 3,
        usedHint: false,
      },
      {
        questionId: 'q-pl-fc-1',
        topicId: 'topic-plantation',
        format: 'flashcard',
        response: { kind: 'self-rating', rating: 'good' },
        outcome: 'correct',
        marksAwarded: 1,
        marksAvailable: 1,
        usedHint: false,
      },
      {
        questionId: 'q-deb-mc-1',
        topicId: 'topic-debate',
        format: 'multiple-choice',
        response: { kind: 'choice', indices: [3] },
        outcome: 'incorrect',
        marksAwarded: 0,
        marksAvailable: 3,
        usedHint: false,
      },
      {
        questionId: 'q-rev-mc-1',
        topicId: 'topic-revolt',
        format: 'multiple-choice',
        response: { kind: 'choice', indices: [1] },
        outcome: 'correct',
        marksAwarded: 3,
        marksAvailable: 3,
        usedHint: false,
      },
      {
        questionId: 'q-col-fb-1',
        topicId: 'topic-columbian',
        format: 'fill-blank',
        response: { kind: 'blanks', values: ['indigenous', 'reduced', 'slave'] },
        outcome: 'partial',
        marksAwarded: 2,
        marksAvailable: 2,
        usedHint: false,
      },
    ],
  },
  {
    id: 'att-seed-4',
    courseId: ATLANTIC_COURSE_ID,
    assistanceRecord: 'tracked',
    kind: 'practice',
    mode: 'self-rated',
    title: 'Flashcards: mixed review',
    topicIds: ['topic-plantation', 'topic-mercantilism', 'topic-revolt'],
    startedAt: day(6),
    completedAt: day(6),
    marksAwarded: 3,
    marksAvailable: 3,
    questions: [
      {
        questionId: 'q-pl-fc-1',
        topicId: 'topic-plantation',
        format: 'flashcard',
        response: { kind: 'self-rating', rating: 'good' },
        outcome: 'correct',
        marksAwarded: 1,
        marksAvailable: 1,
        usedHint: false,
      },
      {
        questionId: 'q-mer-fc-1',
        topicId: 'topic-mercantilism',
        format: 'flashcard',
        response: { kind: 'self-rating', rating: 'hard' },
        outcome: 'partial',
        marksAwarded: 1,
        marksAvailable: 1,
        usedHint: false,
      },
      {
        questionId: 'q-rev-fc-1',
        topicId: 'topic-revolt',
        format: 'flashcard',
        response: { kind: 'self-rating', rating: 'good' },
        outcome: 'correct',
        marksAwarded: 1,
        marksAvailable: 1,
        usedHint: false,
      },
    ],
  },
  {
    id: 'att-seed-5',
    courseId: ATLANTIC_COURSE_ID,
    assistanceRecord: 'tracked',
    kind: 'practice',
    mode: 'practice',
    title: 'Written recall: plantation complex',
    topicIds: ['topic-plantation'],
    startedAt: day(6),
    completedAt: day(6),
    marksAwarded: 4,
    marksAvailable: 6,
    questions: [
      {
        questionId: 'q-pl-wr-1',
        topicId: 'topic-plantation',
        format: 'written-recall',
        response: {
          kind: 'text',
          text: 'Sugar cane has to be milled very quickly after it is cut, within about a day, otherwise the sucrose content drops. This meant the mill had to be right next to the field and you needed a large workforce working to the mill schedule. It required a lot of capital as well.',
        },
        outcome: 'partial',
        marksAwarded: 4,
        marksAvailable: 6,
        usedHint: false,
        creditedRubricIds: ['r-pl-wr-1', 'r-pl-wr-2'],
      },
    ],
  },
  {
    id: 'att-seed-6',
    courseId: ATLANTIC_COURSE_ID,
    assistanceRecord: 'tracked',
    kind: 'exam',
    mode: 'exam',
    title: 'Quick check, 15 minutes',
    examConfigId: 'preset-quick',
    topicIds: ['topic-encomienda', 'topic-debate', 'topic-columbian'],
    startedAt: day(2),
    completedAt: day(2),
    marksAwarded: 11,
    marksAvailable: 27,
    questions: [
      {
        questionId: 'q-enc-mc-1',
        topicId: 'topic-encomienda',
        format: 'multiple-choice',
        response: { kind: 'choice', indices: [0] },
        outcome: 'incorrect',
        marksAwarded: 0,
        marksAvailable: 2,
        usedHint: false,
      },
      {
        questionId: 'q-deb-mc-1',
        topicId: 'topic-debate',
        format: 'multiple-choice',
        response: { kind: 'choice', indices: [0] },
        outcome: 'incorrect',
        marksAwarded: 0,
        marksAvailable: 3,
        usedHint: false,
      },
      {
        questionId: 'q-deb-essay-1',
        topicId: 'topic-debate',
        format: 'essay',
        response: {
          kind: 'text',
          text: 'Valderrama thinks the encomienda was fiscal and uses tribute schedules and the abolition to show this. Okonkwo thinks it was about coercion and uses residencia hearings and mortality registers. Valderrama says it was abolished when direct taxation was possible. Okonkwo says forced labour carried on afterwards. In conclusion both are useful for understanding the encomienda.',
        },
        outcome: 'partial',
        marksAwarded: 6,
        marksAvailable: 15,
        usedHint: false,
        creditedRubricIds: ['r-ess-2', 'r-ess-3'],
      },
      {
        questionId: 'q-col-mc-1',
        topicId: 'topic-columbian',
        format: 'multiple-choice',
        response: { kind: 'choice', indices: [1] },
        outcome: 'correct',
        marksAwarded: 2,
        marksAvailable: 2,
        usedHint: false,
      },
      {
        questionId: 'q-enc-fb-1',
        topicId: 'topic-encomienda',
        format: 'fill-blank',
        response: { kind: 'blanks', values: ['tribute', 'christianity', 'land'] },
        outcome: 'correct',
        marksAwarded: 2,
        marksAvailable: 2,
        usedHint: false,
      },
      {
        questionId: 'q-rev-ord-1',
        topicId: 'topic-revolt',
        format: 'ordering',
        response: {
          kind: 'ordering',
          sequence: [
            'Deliberate slowness and feigned incomprehension',
            'Tool breakage and concealed cultivation',
            'Flight for a few days',
            'Armed rising',
            'Permanent flight and maroon settlement',
          ],
        },
        outcome: 'partial',
        marksAwarded: 1,
        marksAvailable: 4,
        usedHint: false,
      },
    ],
  },
];
