import type { TutorStage } from './types';
import { STAGE_ORDER } from './tutor';

const CITATION = /(\s?)\[\[([^\]\s]{1,200})\]\]/g;
const GROUNDINGS = ['materials', 'mixed', 'general', 'insufficient'] as const;

/**
 * Splits the reply from its trailer, keeps only citations to supplied
 * passages and checks the stage and grounding claims.
 */
export function finishTutorText(raw: string, passageIds: Set<string>, current: TutorStage) {
  const at = raw.lastIndexOf('@@meta');
  let body = at >= 0 ? raw.slice(0, at) : raw;
  let meta: { stage?: unknown; grounding?: unknown } = {};
  if (at >= 0) {
    try {
      meta = JSON.parse(raw.slice(at + 6).trim().split('\n')[0] ?? '{}');
    } catch {
      meta = {};
    }
  }

  const citations: string[] = [];
  let dropped = 0;
  body = body.replace(CITATION, (_match, space: string, id: string) => {
    if (!passageIds.has(id)) {
      dropped += 1;
      return '';
    }
    if (!citations.includes(id)) citations.push(id);
    return `${space}[[${id}]]`;
  });

  const stages = STAGE_ORDER;
  const proposed = stages.includes(meta.stage as TutorStage) ? (meta.stage as TutorStage) : current;
  /* The model may move the session on by one stage at most, never back. */
  const stage =
    stages.indexOf(proposed) > stages.indexOf(current)
      ? stages[stages.indexOf(current) + 1]!
      : current;

  let grounding = GROUNDINGS.includes(meta.grounding as never)
    ? (meta.grounding as (typeof GROUNDINGS)[number])
    : citations.length > 0
      ? 'mixed'
      : 'general';
  /* A claim of full grounding with nothing valid cited is not believed. */
  if (grounding === 'materials' && citations.length === 0) grounding = 'general';

  return { text: body.trim(), citations, dropped, meta: { stage, grounding } };
}

