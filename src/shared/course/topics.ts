import type { Course, Topic } from '../types.ts';

/**
 * The seeded course.
 *
 * ── Everything here is fictional, and says so on screen ───────────────────
 *
 * "The Atlantic World, 1500–1800" is an invented introductory course. The
 * historians named in the readings — Mbeki, Larssen, Okonkwo and the rest —
 * are invented too, and so are their books. The brief forbids inventing real
 * scholarly citations, so nothing here is attributed to a real person, and
 * every material view carries a "fictional course material" label rather than
 * relying on the student to remember.
 *
 * ── Why five topics and not three ─────────────────────────────────────────
 *
 * The brief wants mixed-topic exams, recurring mistakes and visible progress.
 * Three topics cannot produce a convincing mixed paper — a two-section exam
 * ends up drawing both sections from the same pool. Five topics with authored
 * cross-links give the exam builder something real to mix, and give the
 * comparison questions (which are the seeded student's actual weakness) two
 * genuinely different interpretations to set against each other.
 */

/** The exam is three weeks out from whenever the prototype is first opened. */
export function seedExamDate(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 21);
  return d.toISOString().slice(0, 10);
}

export const SEED_COURSE: Course = {
  id: 'course-atlantic',
  name: 'The Atlantic World, 1500–1800',
  goal: 'Explain causes and compare historians’ interpretations without notes.',
  examDate: seedExamDate(),
  dailyMinutes: 45,
  createdAt: new Date().toISOString(),
};

export const SEED_TOPICS: Topic[] = [
  {
    id: 'topic-columbian',
    title: 'The Columbian Exchange',
    summary:
      'The transfer of crops, animals, people and disease across the Atlantic after 1492, and its demographic consequences.',
    priority: 'normal',
    relatedTopicIds: ['topic-encomienda', 'topic-plantation'],
  },
  {
    id: 'topic-encomienda',
    title: 'Conquest and the encomienda system',
    summary:
      'How Spanish colonial labour obligations were justified, administered, and contested in the sixteenth century.',
    priority: 'high',
    relatedTopicIds: ['topic-columbian', 'topic-debate'],
  },
  {
    id: 'topic-plantation',
    title: 'The plantation complex',
    summary:
      'Sugar, enslaved labour and the commercial system that linked West Africa, the Caribbean and Europe.',
    priority: 'high',
    relatedTopicIds: ['topic-columbian', 'topic-mercantilism'],
  },
  {
    id: 'topic-mercantilism',
    title: 'Mercantilism and imperial trade',
    summary:
      'Navigation acts, monopoly companies, and the argument that colonies existed to enrich the metropole.',
    priority: 'normal',
    relatedTopicIds: ['topic-plantation', 'topic-revolt'],
  },
  {
    id: 'topic-revolt',
    title: 'Resistance and revolt',
    summary:
      'Maroon communities, shipboard rebellion and colonial uprisings, and how historians weigh their significance.',
    priority: 'normal',
    relatedTopicIds: ['topic-plantation', 'topic-debate'],
  },
  {
    id: 'topic-debate',
    title: 'Interpreting the Atlantic world',
    summary:
      'The historiographical argument between economic, cultural and imperial readings of Atlantic history.',
    priority: 'high',
    relatedTopicIds: ['topic-encomienda', 'topic-revolt', 'topic-mercantilism'],
  },
];

export const TOPIC_BY_ID = new Map(SEED_TOPICS.map((t) => [t.id, t]));
