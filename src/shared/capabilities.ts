import type {
  ActivityType,
  Material,
  Question,
  QuestionFormat,
  SessionActivity,
  Topic,
} from './types.ts';
import { isUsableMaterial, materialsForTopic } from './ai-context.ts';

/**
 * What can actually be done with a topic, given the content that exists.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Both planners used to decide what to recommend from one fact: whether the
 * topic had *any* question behind it. That is not the same question as "can
 * the student do the thing I am about to suggest", and the gap showed. The
 * planner proposed a flashcard round for topics whose only questions were
 * essays, which is an actionable-looking entry with no action behind it.
 *
 * The tutor is a model now, so it can talk about anything, but it can only
 * *teach from the course* when there is readable material that relates to the
 * topic. That is the test, and a placeholder for a file Rawi could not read
 * does not count.
 *
 * So capability is computed per topic, per activity, from the content that is
 * actually there, and the planners choose from what comes back rather than
 * from a single boolean. When nothing is possible the caller is expected to
 * say so and offer setup, which is the honest version of a dead end.
 *
 * ── Why this is a shared module ───────────────────────────────────────────
 *
 * Home, the course overview, the weekly planner and the check-in all make
 * recommendations, and the brief asks that they agree. One module read by all
 * of them is the only way that holds as any of them changes.
 */

/** The question formats each practice activity draws on. */
export const ACTIVITY_QUESTION_FORMATS: Record<ActivityType, QuestionFormat[]> = {
  flashcards: ['flashcard'],
  quiz: ['multiple-choice', 'multiple-select', 'matching', 'ordering', 'fill-blank'],
  'written-recall': ['written-recall'],
  'source-analysis': ['source-analysis'],
  essay: ['essay'],
};

export interface TopicCapabilities {
  /** Readable course material relates to this topic, so the tutor can teach it. */
  tutor: boolean;
  /** A readable material in this course is linked to the topic. */
  read: boolean;
  /** Practice activities that have at least one matching question. */
  activities: ActivityType[];
  /** Any question at all, in any format. */
  anyQuestion: boolean;
}

/**
 * What is possible for one topic.
 *
 * `questions` and `materials` should already be this topic's course. Passing a
 * wider pool would let a history topic report that it can be practised because
 * a statistics question happens to match, which is the leak the course scoping
 * exists to prevent.
 */
export function topicCapabilities(
  topic: Topic,
  questions: Question[],
  materials: Material[],
): TopicCapabilities {
  const topicId = topic.id;
  const forTopic = questions.filter((q) => q.topicId === topicId);
  const formats = new Set(forTopic.map((q) => q.format));

  const activities = (
    Object.keys(ACTIVITY_QUESTION_FORMATS) as ActivityType[]
  ).filter((activity) =>
    ACTIVITY_QUESTION_FORMATS[activity].some((format) => formats.has(format)),
  );

  return {
    tutor: materialsForTopic(topic, materials).length > 0,
    read: materials.some(
      (m) =>
        isUsableMaterial(m) &&
        (m.topicIds.includes(topicId) ||
          m.passages.some((p) => p.topicIds.includes(topicId))),
    ),
    activities,
    anyQuestion: forTopic.length > 0,
  };
}

/**
 * The best activity for a topic, given what exists and what is wanted.
 *
 * `preferred` is what the ranking rules would choose in an ideal world. This
 * returns that when it is possible, and otherwise the nearest thing that is,
 * in a deliberate order: teaching before testing when the topic is new,
 * testing before reading when it is not. `null` means nothing is possible and
 * the caller must say so rather than inventing a task.
 */
export function bestActivity(
  preferred: SessionActivity,
  capabilities: TopicCapabilities,
): SessionActivity | null {
  const possible = (activity: SessionActivity): boolean => {
    switch (activity) {
      case 'tutor':
        return capabilities.tutor;
      case 'read':
        return capabilities.read;
      case 'flashcards':
        return capabilities.activities.includes('flashcards');
      case 'practice':
        return capabilities.activities.length > 0;
      case 'review':
        return capabilities.activities.length > 0;
      default:
        return false;
    }
  };

  if (possible(preferred)) return preferred;

  /* The fallback order depends on what was wanted. A topic the student has
     never met is better read than tested, and one they have worked on is
     better tested than re-read. */
  const order: SessionActivity[] =
    preferred === 'tutor'
      ? ['read', 'practice', 'flashcards']
      : preferred === 'flashcards'
        ? ['practice', 'read', 'tutor']
        : ['practice', 'flashcards', 'read', 'tutor'];

  return order.find(possible) ?? null;
}

/**
 * A short phrase naming why the preferred activity was not available.
 *
 * Used in the reason a suggestion carries, so a student who wonders why they
 * are being sent to a reading rather than the tutor gets the actual answer.
 */
export function substitutionNote(
  preferred: SessionActivity,
  chosen: SessionActivity,
): string {
  if (preferred === chosen) return '';
  if (preferred === 'tutor') {
    return ' There is no readable material for the tutor to teach this topic from, so this is the next best thing available.';
  }
  if (preferred === 'flashcards') {
    return ' There are no flashcards for this topic, so this uses the question formats that do exist.';
  }
  return ' This is what the content behind this topic supports.';
}

/** Why nothing could be suggested for a topic, as a sentence. */
export const NO_CONTENT_REASON =
  'There is no readable material or question behind this topic yet, so there is nothing to study it with. Add a reading or link this topic to material first.';
