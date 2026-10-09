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
