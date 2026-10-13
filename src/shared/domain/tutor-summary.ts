import type { TutorStage } from './types';
import { STAGE_ORDER } from './tutor';

/**
 * The end-of-session summary, built from what actually happened: the stages
 * reached and the student's own turns.
 */

export function summariseTutorTurns(session: { id: string; courseId?: string; scopeId?: string | null; topicId?: string | null; stage: TutorStage; stages: TutorStage[]; studentTurns: number }) {
  const stages = new Set(session.stages);
  stages.add(session.stage);
  const reached = STAGE_ORDER.filter((s) => stages.has(s));
  const stageReached = reached[reached.length - 1] ?? 'orient';

  const covered: string[] = [];
  if (stages.has('understand')) covered.push('Worked through the explanation');
  if (stages.has('recall')) covered.push('Tried to recall it without the text');
  if (stages.has('reason')) covered.push('Pushed on why, not just what');
  if (stages.has('apply')) covered.push('Applied it to something new');
  const turns = session.studentTurns;
  if (turns > 0) covered.push(`${turns} of your own ${turns === 1 ? 'turn' : 'turns'}`);

  const nextStep =
    session.courseId && session.scopeId && stageReached !== 'orient'
      ? { label: 'Practise this now', to: `/course/${session.courseId}/practice?scopeId=${session.scopeId}` }
      : { label: 'Keep going in this session', to: `/tutor/${session.id}` };

  return { covered, stageReached, nextStep };
}
