import { SEED_COURSE, SEED_TOPICS, ATLANTIC_COURSE_ID } from './topics.ts';
import { SEED_MATERIALS } from './materials.ts';
import { SEED_QUESTIONS } from './questions.ts';
import { SEED_ATTEMPTS, SEED_EXAM_PRESETS } from './history.ts';
import {
  STATS_COURSE,
  STATS_COURSE_ID,
  STATS_MATERIALS,
  STATS_QUESTIONS,
  STATS_TOPICS,
} from './stats.ts';
import {
  SEED_ASSESSMENTS,
  SEED_AVAILABILITY,
  seedSessions,
  statsAttempts,
} from './planning.ts';


export function seedState() {
  return {
    version: 2,
    onboarded: true,
    preferences: {},
    drafts: {},
    reminderState: {},
    courses: [SEED_COURSE, STATS_COURSE],
    activeCourseId: null,
    topics: [...SEED_TOPICS, ...STATS_TOPICS],
    materials: [...SEED_MATERIALS, ...STATS_MATERIALS],
    questions: [...SEED_QUESTIONS, ...STATS_QUESTIONS],
    attempts: [...SEED_ATTEMPTS, ...statsAttempts()],
    tutorSessions: [],
    savedPractice: [
      {
        id: 'saved-1',
        courseId: ATLANTIC_COURSE_ID,
        name: 'Comparison drill',
        savedAt: new Date(Date.parse('2026-10-07T08:00:00.000Z') - 1000 * 60 * 60 * 24 * 4).toISOString(),
        /* Resolved here rather than left empty. A saved set *is* its
           questions: a set that carries only a configuration cannot be
           started, and two attempts at it would not be comparable. */
        questionIds: [
          'q-enc-mc-2',
          'q-deb-mc-1',
          'q-deb-ord-1',
          'q-enc-match-1',
          'q-deb-match-1',
        ],
        config: {
          activity: 'quiz',
          topicIds: ['topic-debate', 'topic-encomienda'],
          materialIds: [],
          length: 6,
          difficulties: ['reasoning', 'stretch'],
          hintsAllowed: true,
          feedback: 'immediate',
        },
      },
      {
        id: 'set-stat-intervals',
        courseId: STATS_COURSE_ID,
        name: 'Problem set: confidence intervals',
        savedAt: new Date(Date.parse('2026-10-07T08:00:00.000Z') - 1000 * 60 * 60 * 24 * 3).toISOString(),
        questionIds: ['q-stat-int-mc-1', 'q-stat-int-order-1', 'q-stat-int-ms-1'],
        config: {
          activity: 'quiz',
          topicIds: ['stat-intervals'],
          materialIds: [],
          length: 3,
          difficulties: ['reasoning', 'stretch'],
          hintsAllowed: true,
          feedback: 'immediate',
        },
      },
    ],
    practiceRuns: [],
    examConfigs: SEED_EXAM_PRESETS,
    activeExam: null,
    assessments: SEED_ASSESSMENTS,
    availability: SEED_AVAILABILITY,
    sessions: seedSessions(),
    checkIns: [],
    seeded: true,
  };
}

