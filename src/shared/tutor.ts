import type { TutorStage } from './types.ts';

/**
 * The tutor's six-stage arc. The model proposes when to move on, and the
 * server allows at most one stage forward per turn.
 */
export const STAGE_ORDER: TutorStage[] = [
  'orient',
  'understand',
  'recall',
  'reason',
  'apply',
  'reflect',
];

export const STAGE_LABEL: Record<TutorStage, string> = {
  orient: 'Orienting',
  understand: 'Understanding',
  recall: 'Recalling',
  reason: 'Reasoning',
  apply: 'Applying',
  reflect: 'Reflecting',
};

export const STAGE_BLURB: Record<TutorStage, string> = {
  orient: 'Working out where you are and what this session is for.',
  understand: 'Building the explanation, as simply as it needs to be.',
  recall: 'Getting it back out of your head without the text in front of you.',
  reason: 'Pushing on why, not just what.',
  apply: 'Using it on something you have not seen before.',
  reflect: 'Naming what held and what to come back to.',
};

export const AI_TUTOR_NOTICE =
  'AI tutor. Replies are written by a language model from your course material. Numbered links are passages it cited and Rawi checked. Anything marked as beyond your materials is general explanation, so check it against your course.';
