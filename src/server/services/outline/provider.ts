import type { AssessmentType } from '../../../shared/domain/types';
import { OUTLINE_MAX } from '../../../shared/contracts/outline';
import type { Language } from '../../ai/types';

/**
 * The provider contract for outline jobs. Inputs carry short keys for
 * blocks, sections, topics and materials, and outputs cite those keys. The
 * job maps keys back to ids and drops anything that cites nothing it was
 * given, so neither implementation can invent a citation.
 */
export interface SyllabusInput {
  courseName: string;
  language: Language;
  /** Blocks in reading order, as Markdown, with their keys. */
  blocks: { key: string; text: string }[];
  /** The current outline, so a re-read reuses a topic's key when the subject is the same. */
  current: { key: string; title: string; module: string }[];
}
export interface SyllabusReading {
  topics: { existing: string | null; title: string; module: string; summary: string; blocks: string[] }[];
  assessments: { title: string; type: AssessmentType; date: string | null; weight: number | null; topics: number[]; blocks: string[] }[];
}
/**
 * Sections in reading order, each with its material, heading path, summary and key terms, matched
 * to the current topics. `room` is how many new topics may be proposed for sections that fit none.
 */
export interface AssignInput {
  courseName: string;
  language: Language;
  topics: { key: string; title: string; summary: string }[];
  sections: { key: string; material: string; path: string; summary: string; terms: string[]; words: number }[];
  room: number;
}
export interface Assignment {
  links: { section: string; topics: { topic: string; depth: 'covers' | 'mentions' }[] }[];
  /** New topics. Links name them by their exact title. */
  newTopics: { title: string; module: string; summary: string }[];
}

/** Words from which a section is substantial enough to belong to a topic. */
export const SUBSTANTIAL_WORDS = 80;

/** Words from which a whole material is substantial enough that it should belong to some topic. */
const SUBSTANTIAL_MATERIAL_WORDS = 150;

/**
 * An assignment with every new topic its links name. A model sometimes links sections to a title
 * it never lists as a new topic. While new topics are allowed, such a title becomes one, with the
 * summary of the first section linked to it, rather than failing a reading that is otherwise sound.
 */
export function withNamedTopics(input: AssignInput, value: Assignment): Assignment {
  if (!input.room) return value;
  const keys = new Set(input.topics.map(t => t.key)), titles = new Set(value.newTopics.map(t => normalTitle(t.title)));
  const named: Assignment['newTopics'] = [];
  for (const l of value.links) for (const t of l.topics) {
    const title = t.topic.trim(), normal = normalTitle(title);
    // A key the input never had, such as "t9", is a broken link, not a title.
    if (!normal || keys.has(title) || titles.has(normal) || /^t\d+$/.test(title)) continue;
    titles.add(normal);
    named.push({ title, module: '', summary: input.sections.find(s => s.key === l.section)?.summary.split(/(?<=[.!?])\s/)[0] ?? '' });
  }
  return named.length ? { ...value, newTopics: [...value.newTopics, ...named] } : value;
}

/**
 * The current topic a reading files too much under: one covering more than twice `share` of the
 * batch's substantial sections while room for new topics is left. A broad topic a student
 * protected tends to swallow every section like this.
 */
export function overloadedTopic(input: AssignInput, value: Assignment, share: number) {
  if (input.room - value.newTopics.length <= 0) return null;
  const substantial = new Set(input.sections.filter(s => s.words >= SUBSTANTIAL_WORDS).map(s => s.key));
  const counts = new Map<string, number>();
  for (const l of value.links) if (substantial.has(l.section)) for (const t of l.topics) if (t.depth !== 'mentions' && input.topics.some(x => x.key === t.topic)) counts.set(t.topic, (counts.get(t.topic) ?? 0) + 1);
  return [...counts].find(([, n]) => n > share * 2)?.[0] ?? null;
}

/** The batch to read again without the overloaded topic: the sections it covers, and only the room left. */
export function withoutTopic(input: AssignInput, value: Assignment, broad: string): AssignInput {
  const covered = new Set(value.links.filter(l => l.topics.some(t => t.topic === broad && t.depth !== 'mentions')).map(l => l.section));
  return { ...input, room: input.room - value.newTopics.length, topics: input.topics.filter(t => t.key !== broad), sections: input.sections.filter(s => covered.has(s.key)) };
}

/**
 * The first reading with the second one, made without the overloaded topic, laid over it. A
 * section the second reading files under a new topic moves there and keeps the broad topic as a
 * mention. A new topic named like the broad one is the broad one. Sections it leaves out stay put.
 */
export function respread(input: AssignInput, first: Assignment, second: Assignment, broad: string): Assignment {
  const broadTitle = normalTitle(input.topics.find(t => t.key === broad)?.title ?? '');
  const room = input.room - first.newTopics.length;
  const fresh = second.newTopics.filter(t => normalTitle(t.title) !== broadTitle).slice(0, room);
  const known = new Set(fresh.map(t => normalTitle(t.title)));
  const moved = new Map(second.links.flatMap(l => {
    const own = l.topics.filter(t => known.has(normalTitle(t.topic)));
    return own.length ? [[l.section, own] as const] : [];
  }));
  // The new topic comes first, so it survives the three topics a section keeps.
  const links = first.links.map(l => { const to = moved.get(l.section); return to ? { ...l, topics: [...to, ...l.topics.map(t => t.topic === broad ? { ...t, depth: 'mentions' as const } : t)] } : l; });
  return { links, newTopics: [...first.newTopics, ...fresh] };
}

/**
 * Whether an assignment reads the batch: it links some substantial section to a topic it may use,
 * a current key or a new topic it proposes, and while new topics are allowed, it links every
 * substantial material somewhere. One that leaves those out is a failed reading, not an answer.
 */
export function linksEnough(input: AssignInput, value: Assignment) {
  const keys = new Set(input.topics.map(t => t.key)), titles = new Set(value.newTopics.map(t => normalTitle(t.title)));
  const linked = new Set(value.links.filter(l => l.topics.some(t => keys.has(t.topic) || titles.has(normalTitle(t.topic)))).map(l => l.section));
  const substantial = input.sections.filter(s => s.words >= SUBSTANTIAL_WORDS);
  if (!substantial.length || (!input.topics.length && !input.room)) return true;
  if (!substantial.some(s => linked.has(s.key))) return false;
  if (!input.room) return true;
  const words = new Map<string, number>();
  for (const s of input.sections) words.set(s.material, (words.get(s.material) ?? 0) + s.words);
  return [...words].every(([material, n]) => n < SUBSTANTIAL_MATERIAL_WORDS || input.sections.some(s => s.material === material && linked.has(s.key)));
}

/** The rules pass. It runs when no model is available, and the outline says so. */
export interface OutlineProvider {
  readSyllabus(input: SyllabusInput): Promise<{ value: SyllabusReading }>;
  assignTopics(input: AssignInput): Promise<{ value: Assignment }>;
}

/** Rawi's own sentences follow the house punctuation: no em dashes or semicolons. */
export function housePunctuation(text: string) {
  return text.replace(/\s*[—–]\s*/g, ', ').replace(/\s*;\s*/g, '. ').replace(/\.\s+([a-z])/g, (_m, c: string) => `. ${c.toUpperCase()}`).replace(/\s+/g, ' ').trim();
}

export const normalTitle = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Keep items that cite at least one known key, without duplicate titles, within the cap. */
export function citedOnly<T extends { title: string }>(items: T[], cites: (item: T) => string[], known: Set<string>, cap = OUTLINE_MAX) {
  const seen = new Set<string>(), out: T[] = [];
  for (const item of items) {
    const title = item.title.trim(), key = normalTitle(title);
    if (!title || !key || seen.has(key) || !cites(item).some(k => known.has(k))) continue;
    seen.add(key); out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

/** Lecture, week or unit number in a title, for ordering a draft. */
export function sequenceNumber(title: string): number | null {
  const match = /\b(?:lecture|week|session|class|unit|chapter|module|part|topic|lesson)\s*(\d{1,3})\b/i.exec(title) ?? /^\s*(\d{1,3})\b/.exec(title);
  return match ? Number(match[1]) : null;
}
