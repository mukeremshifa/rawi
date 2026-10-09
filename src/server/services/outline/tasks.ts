import { z } from 'zod';
import { OUTLINE_MAX, OUTLINE_MIN, type OutlineJobKind } from '../../../shared/contracts/outline';
import type { Task } from '../../ai/engine';
import { DATA_RULE, escapeTags as escape, house, parsed, schemaOf } from '../../ai/style';
import type { DraftInput, Draft, MappingInput, Mapping, SyllabusInput, SyllabusReading } from './provider';

export const OUTLINE_PROMPT_VERSION = 'outline-v2';
const HOUSE = (input: { language: string }) => `${house(input.language)} Copy titles exactly as the document writes them.`;
const DATA = DATA_RULE;

const readingSchema = z.object({
  topics: z.array(z.object({
    existing: z.string().nullable().default(null).describe('Key of the current topic about the same subject, or null for a new topic'),
    title: z.string(), module: z.string().describe('Week or unit label such as "Week 3", or an empty string'),
    summary: z.string().describe('One or two sentences written from the cited text'),
    blocks: z.array(z.string()).describe('Keys of the blocks this topic comes from'),
  })),
  assessments: z.array(z.object({
    title: z.string(), type: z.enum(['quiz', 'midterm', 'final', 'essay', 'presentation', 'other']),
    date: z.string().nullable().default(null).describe('YYYY-MM-DD when the syllabus states a date, otherwise null'),
    weight: z.number().nullable().default(null).describe('Percentage of the final grade when stated, otherwise null'),
    topics: z.array(z.number().int()).describe('Zero-based positions in your topics list that this assessment covers'),
    blocks: z.array(z.string()),
  })),
});
const mappingSchema = z.object({
  links: z.array(z.object({ section: z.string(), topics: z.array(z.string()) })),
  newTopics: z.array(z.object({ title: z.string(), summary: z.string(), sections: z.array(z.string()) })),
});
const draftSchema = z.object({
  topics: z.array(z.object({ title: z.string(), module: z.string(), summary: z.string(), material: z.string(), heading: z.string().nullable().default(null) })),
});

export function syllabusPrompt(input: SyllabusInput) {
  const system = [
    `You read a university syllabus for the course "${input.courseName}" and return its outline and its assessments.`,
    `The outline has ${OUTLINE_MIN} to ${OUTLINE_MAX} topics in teaching order. Fold finer items into a topic's summary rather than making them topics. Give each topic its week or unit label when the syllabus has one.`,
    'Each topic and each assessment cites the keys of the blocks it comes from. Use only keys that appear in the document. Leave out anything you cannot tie to a block.',
    'A summary is one or two sentences written only from the cited text.',
    'When a current outline is supplied, reuse a current topic\'s key in "existing" whenever your topic is about the same subject, even if you word the title differently.',
    'Assessments: title, type, the date only when stated, the weight only when stated, and the topics each covers when the syllabus says.',
    DATA, HOUSE(input),
  ].join('\n');
  const current = input.current.length ? `Current outline:\n${input.current.map(t => `- ${t.key}: ${t.title}${t.module ? ` (${t.module})` : ''}`).join('\n')}` : 'There is no current outline.';
  const prompt = `${current}\n\n<document>\n${input.blocks.map(b => `<block key="${b.key}">\n${escape(b.text)}\n</block>`).join('\n')}\n</document>`;
  return { system, prompt };
}
export function mappingPrompt(input: MappingInput) {
  const system = [
    'You match the sections of a course material to the topics of the course outline.',
    'Link a section to a topic only when the section teaches that topic. A section may fit one or two topics, or none.',
    input.newTopics ? `When a substantial section fits no topic, you may propose up to ${input.newTopics} new topics, each citing its sections. Never propose one for a section marked parent="true", which only holds its subsections. Otherwise return no new topics.` : 'Return no new topics.',
    'Use only the section and topic keys supplied.',
    DATA, HOUSE(input),
  ].join('\n');
  const prompt = `Topics:\n${input.topics.map(t => `- ${t.key}: ${t.title}${t.summary ? `. ${t.summary}` : ''}`).join('\n')}\n\n<document title="${escape(input.materialTitle)}">\n${input.sections.map(s => `<section key="${s.key}" heading="${escape(s.heading)}" parent="${s.parent}">\n${escape(s.excerpt)}\n</section>`).join('\n')}\n</document>`;
  return { system, prompt };
}
export function draftPrompt(input: DraftInput) {
  const system = [
    `You draft the outline of the course "${input.courseName}" from its materials' titles and section headings.`,
    `Return ${OUTLINE_MIN} to ${OUTLINE_MAX} topics in teaching order, ordered by lecture or week number when the materials have one. Fold finer headings into a topic's summary.`,
    'Each topic cites one material key and the heading key it comes from, or null for the material as a whole. Use only supplied keys.',
    'The module is the lecture or week label when there is one, otherwise an empty string. The summary is one short sentence drawn from the headings.',
    DATA, HOUSE(input),
  ].join('\n');
  const prompt = `<document>\n${input.materials.map(m => `<material key="${m.key}" title="${escape(m.title)}">\n${m.headings.map(h => `${'  '.repeat(Math.max(0, h.level - 1))}<heading key="${h.key}">${escape(h.text)}</heading>`).join('\n')}\n</material>`).join('\n')}\n</document>`;
  return { system, prompt };
}

/**
 * Outline tasks. Reading the syllabus is rare and decides the whole outline, so it starts on the
 * strong tier. Mapping and drafting are small structured jobs in the background, on flex.
 */
export const outlineTasks: { [K in OutlineJobKind]: Task<K extends 'read_syllabus' ? SyllabusInput : K extends 'map_material' ? MappingInput : DraftInput, K extends 'read_syllabus' ? SyllabusReading : K extends 'map_material' ? Mapping : Draft> } = {
  read_syllabus: {
    name: 'outline.read_syllabus', promptVersion: OUTLINE_PROMPT_VERSION, tiers: ['strong'], serviceTier: 'standard', maxOutput: 8000, cache: 'none', temperature: 0,
    language: i => i.language, build: i => ({ ...syllabusPrompt(i), schema: schemaOf(readingSchema) }), check: r => parsed(readingSchema, r.json),
  },
  map_material: {
    name: 'outline.map_material', promptVersion: OUTLINE_PROMPT_VERSION, tiers: ['small', 'strong'], serviceTier: 'flex', maxOutput: 4000, cache: 'none', temperature: 0,
    language: i => i.language, build: i => ({ ...mappingPrompt(i), schema: schemaOf(mappingSchema) }), check: r => parsed(mappingSchema, r.json),
  },
  draft_outline: {
    name: 'outline.draft_outline', promptVersion: OUTLINE_PROMPT_VERSION, tiers: ['small', 'strong'], serviceTier: 'flex', maxOutput: 4000, cache: 'none', temperature: 0,
    language: i => i.language, build: i => ({ ...draftPrompt(i), schema: schemaOf(draftSchema) }), check: r => parsed(draftSchema, r.json),
  },
};
