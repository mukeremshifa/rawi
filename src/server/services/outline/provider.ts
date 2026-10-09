import type { AssessmentType } from '../../../shared/domain/types';
import { OUTLINE_MAX } from '../../../shared/contracts/outline';

/**
 * The provider contract for outline jobs. Inputs carry short keys for
 * blocks, sections, topics and materials, and outputs cite those keys. The
 * job maps keys back to ids and drops anything that cites nothing it was
 * given, so neither implementation can invent a citation.
 */
export interface SyllabusInput {
  courseName: string;
  /** Blocks in reading order, as Markdown, with their keys. */
  blocks: { key: string; text: string }[];
  /** The current outline, so a re-read reuses a topic's key when the subject is the same. */
  current: { key: string; title: string; module: string }[];
}
export interface SyllabusReading {
  topics: { existing: string | null; title: string; module: string; summary: string; blocks: string[] }[];
  assessments: { title: string; type: AssessmentType; date: string | null; weight: number | null; topics: number[]; blocks: string[] }[];
}
export interface MappingInput {
  materialTitle: string;
  /** `parent` marks a section that holds subsections, such as a document title. It is never a new topic. */
  sections: { key: string; heading: string; excerpt: string; parent: boolean }[];
  topics: { key: string; title: string; summary: string }[];
  /** How many new topics the mapping may add for substantial sections that fit nothing. */
  newTopics: number;
}
export interface Mapping {
  links: { section: string; topics: string[] }[];
  newTopics: { title: string; summary: string; sections: string[] }[];
}
export interface DraftInput {
  courseName: string;
  materials: { key: string; title: string; order: number | null; headings: { key: string; text: string; level: number }[]; lead: string | null }[];
}
export interface Draft {
  topics: { title: string; module: string; summary: string; material: string; heading: string | null }[];
}
export interface Usage { inputTokens: number; outputTokens: number }

export interface OutlineProvider {
  readSyllabus(input: SyllabusInput): Promise<{ value: SyllabusReading; usage?: Usage }>;
  mapMaterial(input: MappingInput): Promise<{ value: Mapping; usage?: Usage }>;
  draftOutline(input: DraftInput): Promise<{ value: Draft; usage?: Usage }>;
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
