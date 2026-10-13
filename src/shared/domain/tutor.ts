import type { TutorStage } from './types';

/** The tutor's six-stage arc. */
export const STAGE_ORDER: TutorStage[] = [
  'orient',
  'understand',
  'recall',
  'reason',
  'apply',
  'reflect',
];

/**
 * The stage a session has reached, from what can be checked: whether the student has spoken, and
 * how they did on questions in the session's scope. The model never decides it, so praise in the
 * chat moves nothing. Self-marked answers are not counted as misses or as mastery.
 */
export function stageFrom(input: { studentTurns: number; attempts: number; misses: number; ended: boolean }): TutorStage {
  if (input.ended) return 'reflect';
  if (!input.studentTurns) return 'orient';
  if (!input.attempts) return 'understand';
  const right = (input.attempts - input.misses) / input.attempts;
  if (right < 0.6) return 'recall';
  return input.attempts >= 6 && right >= 0.8 ? 'apply' : 'reason';
}

export const STAGE_LABEL: Record<TutorStage, string> = {
  orient: 'Orienting',
  understand: 'Understanding',
  recall: 'Recalling',
  reason: 'Reasoning',
  apply: 'Applying',
  reflect: 'Reflecting',
};


