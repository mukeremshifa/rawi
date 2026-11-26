import { z } from 'zod';
import { uuid } from './workspace';
import type { Citation } from './document';

/** First languages Rawi can explain in. Checks stay in the language of the course. */
export const FIRST_LANGUAGES = { ar: 'Arabic' } as const;
export type FirstLanguage = keyof typeof FIRST_LANGUAGES;
export const firstLanguage = z.enum(['ar']);

export interface GlossaryEntry {
  factId: string;
  term: string;
  /** The material's own definition, in the language of the course. */
  definition: string;
  source: Citation;
  heading: string;
  material: string;
  /** The term in the first language, or null until Rawi has written it. */
  gloss: string | null;
  explanation: string | null;
}
export interface GlossaryView {
  language: string;
  entries: GlossaryEntry[];
  /** Terms without a gloss yet. */
  missing: number;
}
export const glossaryBuild = z.strictObject({ operationId: uuid, language: firstLanguage });
