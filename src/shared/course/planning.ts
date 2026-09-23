import type {
  Attempt,
  Availability,
  PlannedAssessment,
  PlannedSession,
} from '../types.ts';
import { ATLANTIC_COURSE_ID, seedDate } from './topics.ts';
import { STATS_COURSE_ID } from './stats.ts';

/**
 * The student-wide seed: assessments, availability and a part-planned week.
 *
 * ── Why the dates are relative ────────────────────────────────────────────
 *
 * Every date here is computed from the day the prototype is opened. Fixed dates
 * would be in the past within a week of being written, and a planner whose
 * every deadline has already passed demonstrates none of the behaviour the
 * planner exists for. `seedDate(n)` places things a stated number of days out,
 * which keeps the sample week meaningful whenever it is opened.
 *
 * ── The shape of the seeded week ──────────────────────────────────────────
 *
 * Deliberately *part* planned, not fully planned. A week with every slot filled
 * gives "Plan my week" nothing to do and hides the interesting case — a
 * proposal that has to work around commitments already there. So the seed has
 * a few real sessions, some already completed, some still ahead, and leaves
 * genuine gaps for a generated plan to fill.
 *
 * The two courses' deadlines are staggered on purpose: the stats quiz lands
 * before the history midterm, so priority between courses is a real question
 * rather than a formality.
 */

/** ISO date of the Monday of the week containing `date`. */
export function weekStartOf(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(`${date}T12:00:00`) : new Date(date);
  const day = d.getDay();
  // getDay() is 0 for Sunday, so Sunday belongs to the week that started six
  // days earlier rather than to the one beginning tomorrow.
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Minutes from midnight, from an `HH:MM` string. */
export function minutesFromTime(time: string): number {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
}

export const SEED_ASSESSMENTS: PlannedAssessment[] = [
  {
    id: 'assess-stat-quiz-2',
    courseId: STATS_COURSE_ID,
    title: 'Quiz 2 — estimation and testing',
    type: 'quiz',
    date: seedDate(5),
    time: '10:00',
    durationMinutes: 45,
    topicIds: ['stat-intervals', 'stat-testing'],
    weightPercent: 15,
    notes:
      'In the lab, closed book. Calculators allowed. Covers weeks 3 and 4 only — the causal material is not examined until the practical.',
    createdAt: seedDate(-20),
  },
  {
    id: 'assess-atl-midterm',
    courseId: ATLANTIC_COURSE_ID,
    title: 'Midterm essay paper',
    type: 'midterm',
    date: seedDate(12),
    time: '14:00',
    durationMinutes: 120,
    topicIds: [
      'topic-columbian',
      'topic-encomienda',
      'topic-plantation',
      'topic-debate',
    ],
    weightPercent: 30,
    notes:
      'Two essays from a choice of five, two hours, closed book. The historiography question is compulsory.',
    createdAt: seedDate(-20),
  },
  {
    id: 'assess-stat-practical',
    courseId: STATS_COURSE_ID,
    title: 'Practical exam',
    type: 'final',
    date: seedDate(31),
    durationMinutes: 90,
    topicIds: ['stat-sampling', 'stat-intervals', 'stat-testing', 'stat-multiple', 'stat-causal'],
    weightPercent: 40,
    notes:
      'Date confirmed, time not yet published. Whole-course coverage; the emphasis is on interpreting output rather than computing it.',
    createdAt: seedDate(-20),
  },
  {
    id: 'assess-atl-final',
    courseId: ATLANTIC_COURSE_ID,
    title: 'Final examination',
    type: 'final',
    date: seedDate(45),
    time: '09:30',
    durationMinutes: 180,
    topicIds: [
      'topic-columbian',
      'topic-encomienda',
      'topic-plantation',
      'topic-mercantilism',
      'topic-revolt',
      'topic-debate',
    ],
    weightPercent: 50,
    notes: 'Three hours, three essays, whole course. Section C is the comparison question.',
    createdAt: seedDate(-20),
  },
  {
    id: 'assess-stat-quiz-1',
    courseId: STATS_COURSE_ID,
    title: 'Quiz 1 — sampling and description',
    type: 'quiz',
    date: seedDate(-9),
    time: '10:00',
    durationMinutes: 30,
    topicIds: ['stat-sampling', 'stat-describing'],
    weightPercent: 10,
    notes: 'Sat and returned. 21/30 — the sampling-frame question went wrong.',
    createdAt: seedDate(-30),
  },
];

/**
 * A working week with two protected evenings.
 *
 * Wednesday and Sunday are deliberately empty: a student with seven identical
 * study days is not a student, and "Plan my week" needs days it must not fill
 * in order to show that it respects them.
 */
export const SEED_AVAILABILITY: Availability = {
  sessionMinutes: 45,
  windows: [
    { id: 'av-mon-e', day: 1, startMinutes: 18 * 60, endMinutes: 21 * 60 },
    { id: 'av-tue-m', day: 2, startMinutes: 9 * 60, endMinutes: 11 * 60 },
    { id: 'av-tue-e', day: 2, startMinutes: 19 * 60, endMinutes: 21 * 60 },
    { id: 'av-thu-e', day: 4, startMinutes: 18 * 60, endMinutes: 21 * 60 },
    { id: 'av-fri-m', day: 5, startMinutes: 10 * 60, endMinutes: 12 * 60 },
    { id: 'av-sat-m', day: 6, startMinutes: 10 * 60, endMinutes: 13 * 60 },
  ],
  exceptions: [],
};

/**
 * The seeded planner week.
 *
 * Built relative to today rather than to the week boundary, so that whichever
 * day the prototype is first opened there is both completed work behind and
 * planned work ahead. `daysFromNow` is clamped into the current week by the
 * caller in the store seed.
 */
export function seedSessions(): PlannedSession[] {
  const made = seedDate(-14);
  return [
    {
      id: 'sess-seed-1',
      courseId: STATS_COURSE_ID,
      date: seedDate(-2),
      startMinutes: 19 * 60,
      durationMinutes: 45,
      title: 'Problem set: confidence intervals',
      activity: 'practice',
      topicIds: ['stat-intervals'],
      assessmentId: 'assess-stat-quiz-2',
      link: { kind: 'practice-set', setId: 'set-stat-intervals' },
      status: 'completed',
      completedAt: seedDate(-2),
      completedBy: 'att-stat-2',
      createdAt: made,
    },
    {
      id: 'sess-seed-2',
      courseId: ATLANTIC_COURSE_ID,
      date: seedDate(-1),
      startMinutes: 18 * 60,
      durationMinutes: 60,
      title: 'Read: the encomienda reconsidered',
      activity: 'read',
      topicIds: ['topic-encomienda'],
      link: { kind: 'material', materialId: 'mat-encomienda-reading' },
      status: 'planned',
      createdAt: made,
    },
    {
      id: 'sess-seed-3',
      courseId: STATS_COURSE_ID,
      date: seedDate(1),
      startMinutes: 18 * 60,
      durationMinutes: 45,
      title: 'Rehearse quiz 2 conditions',
      activity: 'exam',
      topicIds: ['stat-intervals', 'stat-testing'],
      assessmentId: 'assess-stat-quiz-2',
      link: { kind: 'exam-config', configId: 'preset-stat-quiz' },
      status: 'planned',
      reason:
        'Quiz 2 is in five days and covers these two topics. A timed run under the same conditions is worth more now than more reading.',
      createdAt: made,
    },
    {
      id: 'sess-seed-4',
      courseId: ATLANTIC_COURSE_ID,
      date: seedDate(2),
      startMinutes: 10 * 60,
      durationMinutes: 45,
      title: 'Tutor: interpreting the Atlantic world',
      activity: 'tutor',
      topicIds: ['topic-debate'],
      assessmentId: 'assess-atl-midterm',
      link: { kind: 'tutor', topicId: 'topic-debate' },
      status: 'planned',
      reason:
        'The compulsory midterm question is the historiography one, and this is the topic with the weakest evidence behind it.',
      createdAt: made,
    },
  ];
}

/**
 * Prior work on the statistics course.
 *
 * Shorter than the Atlantic history and with a different shape: the stats
 * student is doing well on the mechanical questions and badly on the
 * interpretive ones, which is the mirror image of the history student and gives
 * the cross-course progress view two genuinely different pictures to show.
 */
export function statsAttempts(): Attempt[] {
  const at = (days: number, hour = 19) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  return [
    {
      id: 'att-stat-1',
      courseId: STATS_COURSE_ID,
      kind: 'practice',
      mode: 'self-rated',
      title: 'Flashcards — week 1 to 3 terms',
      topicIds: ['stat-sampling', 'stat-describing', 'stat-intervals'],
      startedAt: at(6),
      completedAt: at(6),
      assistanceRecord: 'tracked',
      marksAwarded: 3,
      marksAvailable: 4,
      questions: [
        {
          questionId: 'q-stat-samp-fc-1',
          topicId: 'stat-sampling',
          format: 'flashcard',
          response: { kind: 'self-rating', rating: 'good' },
          outcome: 'correct',
          marksAwarded: 1,
          marksAvailable: 1,
          usedHint: false,
        },
        {
          questionId: 'q-stat-desc-fc-1',
          topicId: 'stat-describing',
          format: 'flashcard',
          response: { kind: 'self-rating', rating: 'easy' },
          outcome: 'correct',
          marksAwarded: 1,
          marksAvailable: 1,
          usedHint: false,
        },
        {
          questionId: 'q-stat-int-fc-1',
          topicId: 'stat-intervals',
          format: 'flashcard',
          response: { kind: 'self-rating', rating: 'good' },
          outcome: 'correct',
          marksAwarded: 1,
          marksAvailable: 1,
          usedHint: false,
        },
        {
          questionId: 'q-stat-test-fc-1',
          topicId: 'stat-testing',
          format: 'flashcard',
          response: { kind: 'self-rating', rating: 'again' },
          outcome: 'incorrect',
          marksAwarded: 0,
          marksAvailable: 1,
          usedHint: false,
        },
      ],
    },
    {
      id: 'att-stat-2',
      courseId: STATS_COURSE_ID,
      kind: 'practice',
      mode: 'practice',
      title: 'Problem set: confidence intervals',
      topicIds: ['stat-intervals'],
      startedAt: at(2),
      completedAt: at(2),
      practiceSetId: 'set-stat-intervals',
      plannedSessionId: 'sess-seed-1',
      assistanceRecord: 'tracked',
      marksAwarded: 6,
      marksAvailable: 10,
      questions: [
        {
          questionId: 'q-stat-int-mc-1',
          topicId: 'stat-intervals',
          format: 'multiple-choice',
          response: { kind: 'choice', indices: [0] },
          outcome: 'correct',
          marksAwarded: 3,
          marksAvailable: 3,
          usedHint: false,
        },
        {
          questionId: 'q-stat-int-order-1',
          topicId: 'stat-intervals',
          format: 'ordering',
          response: {
            kind: 'ordering',
            sequence: [
              'Compute the sample mean.',
              'Compute the sample standard deviation.',
              'Divide the standard deviation by the square root of the sample size to get the standard error.',
              'Multiply the standard error by the critical value for the chosen confidence level.',
              'Add and subtract that margin from the sample mean.',
            ],
          },
          outcome: 'correct',
          marksAwarded: 3,
          marksAvailable: 3,
          usedHint: true,
        },
        {
          questionId: 'q-stat-int-ms-1',
          topicId: 'stat-intervals',
          format: 'multiple-select',
          response: { kind: 'choice', indices: [1] },
          outcome: 'incorrect',
          marksAwarded: 0,
          marksAvailable: 4,
          usedHint: false,
        },
      ],
    },
    {
      id: 'att-stat-3',
      courseId: STATS_COURSE_ID,
      kind: 'exam',
      mode: 'exam',
      title: 'Quiz 1 rehearsal',
      topicIds: ['stat-sampling', 'stat-describing'],
      startedAt: at(10, 10),
      completedAt: at(10, 10),
      examConfigId: 'preset-stat-quiz',
      assistanceRecord: 'tracked',
      finish: 'manual',
      marksAwarded: 4,
      marksAvailable: 7,
      questions: [
        {
          questionId: 'q-stat-samp-mc-1',
          topicId: 'stat-sampling',
          format: 'multiple-choice',
          response: { kind: 'choice', indices: [0] },
          outcome: 'incorrect',
          marksAwarded: 0,
          marksAvailable: 2,
          usedHint: false,
        },
        {
          questionId: 'q-stat-desc-mc-1',
          topicId: 'stat-describing',
          format: 'multiple-choice',
          response: { kind: 'choice', indices: [0] },
          outcome: 'correct',
          marksAwarded: 2,
          marksAvailable: 2,
          usedHint: false,
        },
        {
          questionId: 'q-stat-desc-blank-1',
          topicId: 'stat-describing',
          format: 'fill-blank',
          response: { kind: 'blanks', values: ['individuals', 'error'] },
          outcome: 'correct',
          marksAwarded: 2,
          marksAvailable: 2,
          usedHint: false,
        },
        {
          questionId: 'q-stat-samp-written-1',
          topicId: 'stat-sampling',
          format: 'written-recall',
          response: {
            kind: 'text',
            text: 'A low response rate means fewer people answered but it does not on its own say the answer is wrong.',
          },
          outcome: 'partial',
          marksAwarded: 0,
          marksAvailable: 1,
          usedHint: false,
          creditedRubricIds: [],
        },
      ],
    },
    {
      id: 'att-stat-4',
      courseId: STATS_COURSE_ID,
      kind: 'practice',
      mode: 'practice',
      title: 'Quiz — p-values and multiple testing',
      topicIds: ['stat-testing', 'stat-multiple'],
      startedAt: at(1),
      completedAt: at(1),
      assistanceRecord: 'tracked',
      marksAwarded: 5,
      marksAvailable: 10,
      questions: [
        {
          questionId: 'q-stat-test-mc-1',
          topicId: 'stat-testing',
          format: 'multiple-choice',
          response: { kind: 'choice', indices: [0] },
          outcome: 'incorrect',
          marksAwarded: 0,
          marksAvailable: 3,
          usedHint: false,
        },
        {
          questionId: 'q-stat-test-match-1',
          topicId: 'stat-testing',
          format: 'matching',
          response: {
            kind: 'matching',
            assignments: {
              'Type I error': 'Rejecting a null hypothesis that is in fact true',
              'Type II error': 'Failing to reject a null hypothesis that is in fact false',
              Power: 'The probability of detecting an effect that is really there',
              'Effect size': 'How large the difference is, independent of the sample size',
            },
          },
          outcome: 'correct',
          marksAwarded: 4,
          marksAvailable: 4,
          usedHint: true,
        },
        {
          questionId: 'q-stat-mult-mc-1',
          topicId: 'stat-multiple',
          format: 'multiple-choice',
          response: { kind: 'choice', indices: [1] },
          outcome: 'incorrect',
          marksAwarded: 0,
          marksAvailable: 3,
          usedHint: false,
        },
      ],
    },
    {
      id: 'att-stat-5',
      courseId: STATS_COURSE_ID,
      kind: 'practice',
      mode: 'practice',
      title: 'Retry — p-value interpretation',
      topicIds: ['stat-testing'],
      startedAt: at(0, 9),
      completedAt: at(0, 9),
      assistanceRecord: 'tracked',
      remediatesAttemptId: 'att-stat-4',
      marksAwarded: 0,
      marksAvailable: 3,
      questions: [
        {
          questionId: 'q-stat-test-mc-1',
          topicId: 'stat-testing',
          format: 'multiple-choice',
          response: { kind: 'choice', indices: [1] },
          outcome: 'incorrect',
          marksAwarded: 0,
          marksAvailable: 3,
          usedHint: false,
        },
      ],
    },
  ];
}
