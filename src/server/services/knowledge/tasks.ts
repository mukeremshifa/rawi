import { z } from 'zod';
import type { Task } from '../../ai/engine';
import type { Language } from '../../ai/types';
import { DATA_RULE, escapeTags, house, parsed, schemaOf } from '../../ai/style';

export const KNOWLEDGE_PROMPT_VERSION = 'knowledge-v1';

export interface DigestInput {
  language: Language;
  materialTitle: string;
  sections: { key: string; heading: string; blocks: { key: string; text: string }[] }[];
}
const digestSchema = z.object({
  sections: z.array(z.object({
    key: z.string(),
    summary: z.string().describe('One or two sentences on what the section teaches, written only from its blocks'),
    keyTerms: z.array(z.string()).describe('Up to six terms the section defines or relies on'),
    facts: z.array(z.object({
      text: z.string().describe('One self-contained claim the section states, readable without the section'),
      blocks: z.array(z.string()).describe('Keys of the blocks that state it'),
    })).describe('Up to eight claims worth testing a student on'),
  })),
});
export type Digest = z.infer<typeof digestSchema>;

/**
 * Summaries, key terms and atomic facts for several sections in one call, which spreads the
 * instructions over more material. Background work, so it runs on flex.
 */
export const digestTask: Task<DigestInput, Digest> = {
  name: 'knowledge.digest', promptVersion: KNOWLEDGE_PROMPT_VERSION, tiers: ['small', 'strong'], serviceTier: 'flex', cache: 'none', temperature: 0,
  maxOutput: 6000, language: i => i.language,
  build: i => ({
    system: [
      'You read sections of a university course material and record what each one teaches.',
      'For every section: a summary of one or two sentences, up to six key terms, and up to eight facts.',
      'A fact is one claim the section states, written so it makes sense on its own. Cite the keys of the blocks that state it. Use only keys from that section. Leave out anything you cannot tie to a block.',
      'Do not add knowledge from outside the material. Return every section key you were given, in order.',
      DATA_RULE, house(i.language),
    ].join('\n'),
    prompt: `<document title="${escapeTags(i.materialTitle)}">\n${i.sections.map(s => `<section key="${s.key}" heading="${escapeTags(s.heading)}">\n${s.blocks.map(b => `<block key="${b.key}">${escapeTags(b.text)}</block>`).join('\n')}\n</section>`).join('\n')}\n</document>`,
    schema: schemaOf(digestSchema),
  }),
  check: (r, i) => {
    const value = parsed(digestSchema, r.json);
    // Every section must come back. A partial digest escalates rather than leaving gaps.
    return value && i.sections.every(s => value.sections.some(o => o.key === s.key)) ? value : null;
  },
};

export interface FigureInput { language: Language; caption: string; context: string; image: { mime: string; data: Uint8Array } }
const figureSchema = z.object({ description: z.string().describe('What the figure shows and what a student should take from it, in two to four sentences') });

/** One description per figure, from the image itself, written once at ingest. */
export const figureTask: Task<FigureInput, string> = {
  name: 'knowledge.figure', promptVersion: KNOWLEDGE_PROMPT_VERSION, tiers: ['vision'], serviceTier: 'standard', cache: 'none', temperature: 0,
  maxOutput: 400, language: i => i.language,
  build: i => ({
    system: ['You describe a figure from a university course material for a student who cannot see it.', 'Say what it shows and the point it makes. Read any labels, axes and values that matter. Do not guess at what is not visible.', DATA_RULE, house(i.language)].join('\n'),
    prompt: `Caption: ${escapeTags(i.caption) || '(none)'}\nNearby text: ${escapeTags(i.context).slice(0, 600) || '(none)'}`,
    images: [i.image], schema: schemaOf(figureSchema),
  }),
  check: r => parsed(figureSchema, r.json)?.description.trim() || null,
};
