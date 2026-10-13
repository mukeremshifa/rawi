export type IngestStage = 'structure' | 'embed' | 'digest' | 'figures' | 'repair' | 'done';
export type Readiness = 'readable' | 'searchable' | 'enriched';
/**
 * `fact`: one claim. `definition`: a term and what it means. `number`: a quantity with its value
 * and unit. `steps`: a process in order. `formula`: an equation and what it computes.
 */
export type FactKind = 'fact' | 'definition' | 'number' | 'steps' | 'formula';

/**
 * What a version's knowledge layer holds against what it should. Counts are blocks, chunks,
 * sections, facts and figures. Warnings name what conversion was unsure of, by code.
 */
export interface KnowledgeCoverage {
  blocks?: number;
  chunked?: number;
  chunks?: number;
  embedded?: number;
  sections?: number;
  digested?: number;
  /** Sections whose summary and facts were carried over from an identical section already read. */
  reused?: number;
  facts?: number;
  figures?: number;
  described?: number;
  /** Figures with an image that no description has been tried for, such as without storage. */
  undescribed?: number;
  uncertainBlocks?: number;
  /** Set when no AI service could be used, so only code built the layer. */
  rulesOnly?: boolean;
  warnings?: string[];
}
