import type {
  ExamConfig,
  PlannedAssessment,
  SavedPracticeSet,
} from '../types.ts';
import { CENG401_COURSE_ID } from './ceng401.ts';

/**
 * The study setup for CENG 401: the assessment, ready-to-start practice sets,
 * and rehearsal configurations.
 *
 * ── The assessment date is real, and only the date is ─────────────────────
 *
 * The student said the quiz is tomorrow, asking on 23 September 2026 in
 * Asia/Dubai, so the date is fixed at 2026-09-24 rather than computed with
 * `seedDate`. The two sample courses use relative dates because their
 * deadlines are invented and would otherwise rot; this one is a real date and
 * must not drift.
 *
 * What was *not* supplied is the start time, the duration, the question count
 * and the official format. So `time` and `durationMinutes` are absent rather
 * than filled with a plausible-looking 09:00 and 45 minutes. `PlannedAssessment`
 * documents that optionality for exactly this case, and the planner already
 * treats a date-only assessment conservatively, finishing preparation the day
 * before rather than inventing an hour to work back from.
 *
 * ── Practice and rehearsal settings are study choices ─────────────────────
 *
 * Nothing below claims to reproduce the real quiz. The 20-question, 30-minute
 * rehearsal is a reasonable way to practise under time pressure given the
 * question bank that exists, and its name and notes say so. Presenting a
 * guessed format as the real one would be the most damaging possible thing to
 * get wrong the night before an assessment.
 */

/** The quiz, as the student described it. Date only, by design. */
export const CENG401_ASSESSMENT: PlannedAssessment = {
  id: 'assess-ceng-quiz-1',
  courseId: CENG401_COURSE_ID,
  title: 'CENG 401 quiz',
  type: 'quiz',
  date: '2026-09-24',
  topicIds: [
    'ceng-servers',
    'ceng-delay',
    'ceng-scaling',
    'ceng-transport',
    'ceng-quic',
    'ceng-sockets',
    'ceng-p2p-time',
    'ceng-discovery',
    'ceng-bittorrent',
    'ceng-dht',
  ],
  notes:
    'Covers lectures 1 to 3. The start time, duration, question count and official format were not recorded, so nothing in Rawi assumes them. The rehearsal settings here are study choices, not the real paper.',
  createdAt: new Date().toISOString(),
};

/**
 * Four ready-to-start sets: one per lecture, plus a mixed one.
 *
 * `questionIds` is resolved here rather than left to a filter, for the reason
 * `SavedPracticeSet` gives: a set *is* its questions, and re-deriving it later
 * would quietly produce a different paper on a second attempt.
 *
 * Each set mixes formats deliberately. A quiz set of nothing but multiple
 * choice trains recognition, and recognition is what fails first under time
 * pressure, so every set carries ordering, matching or fill-blank work too.
 */
export const CENG401_PRACTICE_SETS: SavedPracticeSet[] = [
  {
    id: 'set-ceng-l1',
    courseId: CENG401_COURSE_ID,
    name: 'Lecture 1: throughput, delay and infrastructure',
    savedAt: new Date().toISOString(),
    questionIds: [
      'q-ceng-del-mc-1',
      'q-ceng-del-mc-2',
      'q-ceng-del-mc-3',
      'q-ceng-del-ms-1',
      'q-ceng-del-blank-1',
      'q-ceng-del-match-1',
      'q-ceng-srv-mc-1',
      'q-ceng-srv-ord-1',
      'q-ceng-srv-ms-1',
      'q-ceng-scl-mc-1',
      'q-ceng-scl-ms-1',
      'q-ceng-scl-match-1',
    ],
    config: {
      activity: 'quiz',
      topicIds: ['ceng-delay', 'ceng-servers', 'ceng-scaling'],
      materialIds: ['mat-ceng-l1'],
      length: 12,
      difficulties: ['recall', 'reasoning', 'stretch'],
      hintsAllowed: true,
      feedback: 'immediate',
    },
  },
  {
    id: 'set-ceng-l2',
    courseId: CENG401_COURSE_ID,
    name: 'Lecture 2: transport and socket programming',
    savedAt: new Date().toISOString(),
    questionIds: [
      'q-ceng-tra-mc-1',
      'q-ceng-tra-mc-2',
      'q-ceng-tra-ms-1',
      'q-ceng-tra-ms-2',
      'q-ceng-tra-blank-1',
      'q-ceng-tra-match-1',
      'q-ceng-sok-mc-1',
      'q-ceng-sok-mc-2',
      'q-ceng-sok-ord-1',
      'q-ceng-sok-ord-2',
      'q-ceng-sok-match-1',
      'q-ceng-sok-blank-1',
      'q-ceng-qui-mc-1',
      'q-ceng-qui-ms-1',
    ],
    config: {
      activity: 'quiz',
      topicIds: ['ceng-transport', 'ceng-sockets', 'ceng-quic'],
      materialIds: ['mat-ceng-l2'],
      length: 14,
      difficulties: ['recall', 'reasoning', 'stretch'],
      hintsAllowed: true,
      feedback: 'immediate',
    },
  },
  {
    id: 'set-ceng-l3',
    courseId: CENG401_COURSE_ID,
    name: 'Lecture 3: P2P, BitTorrent and DHTs',
    savedAt: new Date().toISOString(),
    questionIds: [
      'q-ceng-p2p-mc-1',
      'q-ceng-p2p-mc-2',
      'q-ceng-p2p-mc-3',
      'q-ceng-p2p-blank-1',
      'q-ceng-p2p-ord-1',
      'q-ceng-p2p-ms-1',
      'q-ceng-dis-mc-1',
      'q-ceng-dis-match-1',
      'q-ceng-bit-mc-1',
      'q-ceng-bit-mc-2',
      'q-ceng-bit-ord-2',
      'q-ceng-bit-blank-1',
      'q-ceng-dht-mc-1',
      'q-ceng-dht-mc-2',
      'q-ceng-dht-mc-3',
      'q-ceng-dht-ord-1',
    ],
    config: {
      activity: 'quiz',
      topicIds: ['ceng-p2p-time', 'ceng-discovery', 'ceng-bittorrent', 'ceng-dht'],
      materialIds: ['mat-ceng-l3'],
      length: 16,
      difficulties: ['recall', 'reasoning', 'stretch'],
      hintsAllowed: true,
      feedback: 'immediate',
    },
  },
  {
    id: 'set-ceng-calc',
    courseId: CENG401_COURSE_ID,
    name: 'The calculations: throughput, delay and distribution time',
    savedAt: new Date().toISOString(),
    questionIds: [
      'q-ceng-del-mc-1',
      'q-ceng-del-mc-2',
      'q-ceng-del-mc-3',
      'q-ceng-p2p-mc-1',
      'q-ceng-p2p-mc-2',
      'q-ceng-p2p-mc-3',
      'q-ceng-p2p-blank-1',
      'q-ceng-del-blank-1',
    ],
    config: {
      activity: 'quiz',
      topicIds: ['ceng-delay', 'ceng-p2p-time'],
      materialIds: [],
      length: 8,
      difficulties: ['reasoning', 'stretch'],
      hintsAllowed: true,
      feedback: 'immediate',
    },
  },
];

/**
 * Two rehearsal configurations.
 *
 * Neither is the real paper, and both say so in their instructions. The mixed
 * one is the headline: 20 questions in 30 minutes across all ten topics,
 * closed book, which is a defensible way to practise under pressure with the
 * bank that exists. The second is untimed and open book, for working through
 * the calculations with the slides available rather than against a clock.
 *
 * `preset: true` marks them undeletable built-ins, matching the two sample
 * courses' presets. Both list the quiz in `assessmentIds`, so the exams screen
 * can offer them as preparation for it.
 */
export const CENG401_EXAM_PRESETS: ExamConfig[] = [
  {
    id: 'preset-ceng-mixed',
    courseId: CENG401_COURSE_ID,
    name: 'Mixed rehearsal, 20 questions in 30 minutes',
    preset: true,
    assessmentIds: ['assess-ceng-quiz-1'],
    savedAt: new Date().toISOString(),
    sections: [
      {
        id: 'sec-ceng-mixed-1',
        title: 'Lectures 1 to 3',
        instructions:
          'Twenty questions across all three lectures, closed book, 30 minutes. This is a study setting rather than the real quiz format, which was not recorded. Nothing is marked until you submit the whole paper.',
        formats: [
          'multiple-choice',
          'multiple-select',
          'fill-blank',
          'ordering',
          'matching',
        ],
        topicIds: [],
        count: 20,
        minutes: 30,
      },
    ],
    timing: 'overall',
    totalMinutes: 30,
    extraTimePercent: 0,
    book: 'closed',
    allowedMaterialIds: [],
    navigation: 'free',
    flaggingEnabled: true,
    lockSectionsOnFinish: false,
  },
  {
    id: 'preset-ceng-calc',
    courseId: CENG401_COURSE_ID,
    name: 'Calculations, untimed and open book',
    preset: true,
    assessmentIds: ['assess-ceng-quiz-1'],
    savedAt: new Date().toISOString(),
    sections: [
      {
        id: 'sec-ceng-calc-1',
        title: 'Worked answers',
        instructions:
          'Throughput, delay and distribution-time questions with the lecture notes available and no clock. Use it to get the method right before rehearsing it under time pressure. Marks and rubrics appear once you submit.',
        formats: ['multiple-choice', 'fill-blank', 'written-recall', 'source-analysis'],
        topicIds: ['ceng-delay', 'ceng-p2p-time'],
        count: 6,
        minutes: 0,
      },
    ],
    timing: 'untimed',
    totalMinutes: 0,
    extraTimePercent: 0,
    book: 'open',
    allowedMaterialIds: ['mat-ceng-l1', 'mat-ceng-l3'],
    navigation: 'free',
    flaggingEnabled: true,
    lockSectionsOnFinish: false,
  },
];
