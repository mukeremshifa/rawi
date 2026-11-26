import { z } from 'zod';
import type { Task } from '../../ai/engine';
import type { Language } from '../../ai/types';
import { attribute, DATA_RULE, escapeTags, house, parsed, schemaOf } from '../../ai/style';

export const KNOWLEDGE_PROMPT_VERSION = 'knowledge-v3';

export interface DigestInput {
  language: Language;
  materialTitle: string;
  sections: { key: string; heading: string; blocks: { key: string; text: string }[] }[];
}
const factSchema = z.object({
  kind: z.enum(['fact', 'definition', 'number', 'steps', 'formula']),
  subject: z
    .string()
    .describe(
      'definition: the term. number: what is measured, as a noun phrase such as "the population of Lisbon in 1550". steps: the process, as a noun phrase. formula: what it computes. fact: what the claim is about, in a few words',
    ),
  text: z.string().describe('The claim, definition, formula or summary of the steps, readable on its own'),
  value: z.number().nullish().describe('number only: the value exactly as the text gives it. Leave it out otherwise'),
  unit: z.string().nullish().describe('number only: the unit. Leave it out otherwise'),
  items: z
    .array(z.string())
    .nullish()
    .describe('steps only: each step in the order the text gives. Leave it out otherwise'),
  blocks: z.array(z.string()).describe('Keys of the blocks that state it'),
});
const digestSection = z.object({
  key: z.string(),
  summary: z.string().describe('One or two sentences on what the section teaches, written only from its blocks'),
  keyTerms: z.array(z.string()).describe('Up to six terms the section defines or relies on'),
  facts: z.array(factSchema).describe('Up to ten facts worth testing a student on'),
});
const digestSchema = z.object({ sections: z.array(digestSection) });
export type Digest = z.infer<typeof digestSchema>;

/**
 * Summaries, key terms and typed facts for several sections in one call, which spreads the
 * instructions over more material. The main expensive step of reading a material, so it runs on
 * the background lane and its results are kept per section text and reused.
 */
export const digestTask: Task<DigestInput, Digest> = {
  name: 'knowledge.digest',
  promptVersion: KNOWLEDGE_PROMPT_VERSION,
  temperature: 0,
  needs: { skill: 'extract', data: 'institution', lane: 'background', maxOutput: 7000, cache: 'none', attempts: 3 },
  language: i => i.language,
  build: i => ({
    system: [
      'You read sections of a university course material and record what each one teaches.',
      'For every section: a summary of one or two sentences, up to six key terms, and up to ten facts.',
      'Each fact has a kind. definition: a term and what the section says it means. number: a quantity the section states, with its value and unit exactly as written. steps: a process the section gives in order, with each step. formula: an equation, written as the section writes it, and what it computes. fact: any other single claim.',
      'Write each fact so it makes sense on its own. Cite the keys of the blocks that state it. Use only keys from that section. Leave out anything you cannot tie to a block.',
      'Do not add knowledge from outside the material. Return every section key you were given, in order.',
      DATA_RULE,
      house(i.language),
    ].join('\n'),
    prompt: `<document title="${attribute(i.materialTitle)}">\n${i.sections.map(s => `<section key="${s.key}" heading="${attribute(s.heading)}">\n${s.blocks.map(b => `<block key="${b.key}">${escapeTags(b.text)}</block>`).join('\n')}\n</section>`).join('\n')}\n</document>`,
    schema: schemaOf(digestSchema),
  }),
  check: (r, i) => {
    // Some routes add a stray element after the real sections, or leave out the keys while keeping
    // the order asked for. An element that is not a section is dropped, and keys left out are taken
    // from the order when every section came back. Rejecting the whole answer would pay for another route.
    const raw = (r.json as { sections?: unknown } | null | undefined)?.sections;
    if (!Array.isArray(raw)) return null;
    const shaped = raw.filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && 'summary' in s);
    const keyed =
      shaped.every(s => typeof s.key !== 'string') && shaped.length === i.sections.length
        ? shaped.map((s, n) => ({ ...s, key: i.sections[n]!.key }))
        : shaped;
    const sections = keyed.flatMap(s => {
      const p = digestSection.safeParse(s);
      return p.success ? [p.data] : [];
    });
    // Every section must come back. A partial digest moves to the next route rather than leaving gaps.
    return i.sections.every(s => sections.some(o => o.key === s.key)) ? { sections } : null;
  },
};

export interface FigureInput {
  language: Language;
  caption: string;
  context: string;
  image: { mime: string; data: Uint8Array };
}
const figureSchema = z.object({
  description: z
    .string()
    .describe('What the figure shows and what a student should take from it, in two to four sentences'),
});

/** One description per figure, from the image itself, written once at ingest. */
export const figureTask: Task<FigureInput, string> = {
  name: 'knowledge.figure',
  promptVersion: KNOWLEDGE_PROMPT_VERSION,
  temperature: 0,
  needs: { skill: 'vision', data: 'institution', lane: 'background', maxOutput: 400, cache: 'none' },
  language: i => i.language,
  build: i => ({
    system: [
      'You describe a figure from a university course material for a student who cannot see it.',
      'Say what it shows and the point it makes. Read any labels, axes and values that matter. Do not guess at what is not visible.',
      DATA_RULE,
      house(i.language),
    ].join('\n'),
    prompt: `Caption: ${escapeTags(i.caption) || '(none)'}\nNearby text: ${escapeTags(i.context).slice(0, 600) || '(none)'}`,
    images: [i.image],
    schema: schemaOf(figureSchema),
  }),
  check: r => parsed(figureSchema, r.json)?.description.trim() || null,
};

export interface AnsweredInput {
  language: Language;
  parts: string[];
  passages: { heading: string; text: string }[];
}
const answeredSchema = z.object({
  parts: z.array(
    z.object({
      part: z.number().describe('The number of the question part'),
      quote: z
        .string()
        .describe(
          'The exact words of one passage that state the answer to this part, copied as written. Empty when no passage states it',
        ),
    }),
  ),
});

/**
 * Whether passages that cover a question's words answer a part worded differently, as "how long
 * was it meant to last" is answered by "a single lifetime". The answer is a quote, and code keeps
 * only quotes it finds in the passages, so the model can widen the evidence but never invent it.
 */
export const answeredTask: Task<AnsweredInput, { part: number; quote: string }[]> = {
  name: 'knowledge.answered',
  promptVersion: 'answered-v1',
  temperature: 0,
  needs: { skill: 'extract', data: 'student', lane: 'interactive', maxOutput: 300, cache: 'none', attempts: 1 },
  language: i => i.language,
  build: i => ({
    system: [
      'You check whether course passages answer parts of a student question.',
      'For each numbered part, copy the shortest exact words from one passage that give the specific answer it asks for. A passage that only mentions the subject, or answers a different question, does not count. When none answers it, leave the quote empty.',
      'Copy words exactly as the passage writes them. Do not paraphrase or add knowledge from outside the passages.',
      DATA_RULE,
    ].join('\n'),
    prompt: `<course_material>\n${i.passages.map((p, n) => `<passage n="${n + 1}" heading="${attribute(p.heading)}">\n${escapeTags(p.text)}\n</passage>`).join('\n')}\n</course_material>\n\nQuestion parts:\n${i.parts.map((p, n) => `${n + 1}. ${escapeTags(p)}`).join('\n')}`,
    schema: schemaOf(answeredSchema),
  }),
  check: r => parsed(answeredSchema, r.json)?.parts ?? null,
};
