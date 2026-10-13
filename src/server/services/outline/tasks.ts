import { z } from 'zod';
import { OUTLINE_MAX, OUTLINE_MIN, type OutlineJobKind } from '../../../shared/contracts/outline';
import type { Task } from '../../ai/engine';
import { DATA_RULE, escapeTags as escape, house, parsed, schemaOf } from '../../ai/style';
import type { AssignInput, Assignment, SyllabusInput, SyllabusReading } from './provider';

export const OUTLINE_PROMPT_VERSION = 'outline-v4';
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
const assignSchema = z.object({
  links: z.array(z.object({ section: z.string(), topics: z.array(z.object({ topic: z.string().describe('A current topic key, or the exact title of a new topic you propose'), depth: z.enum(['covers', 'mentions']) })) })),
  newTopics: z.array(z.object({ title: z.string(), module: z.string().describe('Week or unit label when the material has one, otherwise an empty string'), summary: z.string() })),
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
export function assignPrompt(input: AssignInput) {
  const system = [
    `You organise the sections of the course "${input.courseName}" by topic.`,
    'A topic is a subject a student would study and be assessed on. For each section, list the topics it teaches. Use "covers" when the section teaches the topic and "mentions" when it only touches on it. A section may belong to several topics, or to none, such as a reading list or a title page.',
    input.room ? `When substantial sections teach a subject no current topic names, propose up to ${input.room} new topics, each with a short title that sections link to by that exact title, a one-sentence summary written from the sections, and its week or unit label when there is one. Prefer a few broad topics to many narrow ones.` : 'Propose no new topics.',
    'Use only the section and topic keys supplied.',
    DATA, HOUSE(input),
  ].join('\n');
  const topics = input.topics.length ? input.topics.map(t => `- ${t.key}: ${t.title}${t.summary ? `. ${t.summary}` : ''}`).join('\n') : '(none yet)';
  const sections = input.sections.map(s => `<section key="${s.key}" material="${escape(s.material)}" heading="${escape(s.path)}" words="${s.words}">\n${escape(s.summary)}${s.terms.length ? `\nTerms: ${escape(s.terms.join(', '))}` : ''}\n</section>`).join('\n');
  const prompt = `Topics:\n${topics}\n\n<document>\n${sections}\n</document>`;
  return { system, prompt };
}

/**
 * Outline tasks. Both read structure in the background. Reading the syllabus is rare and decides
 * the outline, so it may try one more route when a reading fails its check.
 */
export const outlineTasks: { [K in OutlineJobKind]: Task<K extends 'read_syllabus' ? SyllabusInput : AssignInput, K extends 'read_syllabus' ? SyllabusReading : Assignment> } = {
  read_syllabus: {
    name: 'outline.read_syllabus', promptVersion: OUTLINE_PROMPT_VERSION, temperature: 0, needs: { skill: 'extract', data: 'institution', lane: 'background', maxOutput: 8000, cache: 'none', attempts: 3 },
    language: i => i.language, build: i => ({ ...syllabusPrompt(i), schema: schemaOf(readingSchema) }), check: r => parsed(readingSchema, r.json),
  },
  assign_topics: {
    name: 'outline.assign_topics', promptVersion: OUTLINE_PROMPT_VERSION, temperature: 0, needs: { skill: 'extract', data: 'institution', lane: 'background', maxOutput: 6000, cache: 'none', attempts: 3 },
    language: i => i.language, build: i => ({ ...assignPrompt(i), schema: schemaOf(assignSchema) }), check: r => parsed(assignSchema, r.json),
  },
};
