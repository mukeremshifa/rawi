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
  newTopics: { key: string; title: string; module: string; summary: string }[];
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
