import type { Course, Topic } from '../../src/shared/domain/types';

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

/**
 * An ISO date `days` from today, used to place the seeded assessments and
 * history relative to whenever the prototype is first opened. Without this the
 * sample course's deadlines would drift into the past the week after it was
 * written, and a planner with only overdue work demonstrates nothing.
 */
export function seedDate(days: number, from: Date = new Date('2026-10-07T08:00:00.000Z')): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const ATLANTIC_COURSE_ID = 'course-atlantic';

export const SEED_COURSE: Course = {
  id: ATLANTIC_COURSE_ID,
  name: 'The Atlantic World, 1500–1800',
  description:
    'A reading-heavy introductory survey of the Atlantic basin from first contact to the age of revolutions, taught through primary extracts and competing historiography.',
  goal: 'Explain causes and compare historians’ interpretations without notes.',
  accent: 'indigo',
  createdAt: new Date('2026-10-07T08:00:00.000Z').toISOString(),
};

export const SEED_TOPICS: Topic[] = [
  {
    id: 'topic-columbian',
    courseId: ATLANTIC_COURSE_ID,
    module: 'Week 1: Contact',
    order: 0,
    title: 'The Columbian Exchange',
    summary:
      'The transfer of crops, animals, people and disease across the Atlantic after 1492, and its demographic consequences.',
    priority: 'normal',
    relatedTopicIds: ['topic-encomienda', 'topic-plantation'],
  },
  {
    id: 'topic-encomienda',
    courseId: ATLANTIC_COURSE_ID,
    module: 'Week 2: Conquest and labour',
    order: 1,
    title: 'Conquest and the encomienda system',
    summary:
      'How Spanish colonial labour obligations were justified, administered, and contested in the sixteenth century.',
    priority: 'high',
    relatedTopicIds: ['topic-columbian', 'topic-debate'],
  },
  {
    id: 'topic-plantation',
    courseId: ATLANTIC_COURSE_ID,
    module: 'Week 3: The plantation complex',
    order: 2,
    title: 'The plantation complex',
    summary:
      'Sugar, enslaved labour and the commercial system that linked West Africa, the Caribbean and Europe.',
    priority: 'high',
    relatedTopicIds: ['topic-columbian', 'topic-mercantilism'],
  },
  {
    id: 'topic-mercantilism',
    courseId: ATLANTIC_COURSE_ID,
    module: 'Week 4: Empire and trade',
    order: 3,
    title: 'Mercantilism and imperial trade',
    summary:
      'Navigation acts, monopoly companies, and the argument that colonies existed to enrich the metropole.',
    priority: 'normal',
    relatedTopicIds: ['topic-plantation', 'topic-revolt'],
  },
  {
    id: 'topic-revolt',
    courseId: ATLANTIC_COURSE_ID,
    module: 'Week 5: Resistance',
    order: 4,
    title: 'Resistance and revolt',
    summary:
      'Maroon communities, shipboard rebellion and colonial uprisings, and how historians weigh their significance.',
    priority: 'normal',
    relatedTopicIds: ['topic-plantation', 'topic-debate'],
  },
  {
    id: 'topic-debate',
    courseId: ATLANTIC_COURSE_ID,
    module: 'Week 6: Historiography',
    order: 5,
    title: 'Interpreting the Atlantic world',
    summary:
      'The historiographical argument between economic, cultural and imperial readings of Atlantic history.',
    priority: 'high',
    relatedTopicIds: ['topic-encomienda', 'topic-revolt', 'topic-mercantilism'],
  },
];

export const TOPIC_BY_ID = new Map(SEED_TOPICS.map((t) => [t.id, t]));
