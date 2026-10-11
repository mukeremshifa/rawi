import type { Difficulty } from '../../../shared/domain/types';

export type PoolFormat = 'flashcard' | 'multiple-choice' | 'written-recall';

/** A candidate question as generated, before it becomes a question version in a workspace. */
export interface PoolQuestion {
  format: PoolFormat;
  difficulty: Difficulty;
  prompt: string;
  answer: string;
  explanation: string;
  options?: string[];
  correctIndex?: number;
  rubric?: { label: string; marks: number; missedAdvice: string }[];
}

/** What checked the question: rules always, and the checker model's verdict when it ran. */
export interface PoolVerification {
  rules: string[];
  checker: { model: string; supported: boolean; answerCorrect: boolean; reason: string } | null;
}

/**
 * What a version's knowledge layer holds against what it should. Counts are blocks, chunks,
 * sections and figures. Warnings name what conversion was unsure of, by code.
 */
export interface KnowledgeCoverage {
  blocks?: number;
  chunked?: number;
  chunks?: number;
  embedded?: number;
  sections?: number;
  digested?: number;
  figures?: number;
  described?: number;
  /** Figures with an image that no description has been tried for, such as without storage. */
  undescribed?: number;
  uncertainBlocks?: number;
  warnings?: string[];
}
