import type { TutorTranscript, TutorStage } from './types';
import { STAGE_ORDER } from './tutor';

/**
 * The end-of-session summary, built from what actually happened: the stages
 * reached and the student's own turns.
 */
export function summarise(session: TutorTranscript): {
  covered: string[];
  stageReached: TutorStage;
  nextStep: { label: string; to: string } | null;
} {
  return summariseTutorTurns({ ...session, stages: session.messages.filter(m => !m.meta).map(m => m.stage), studentTurns: session.messages.filter(m => m.role === 'student').length });
}

export function summariseTutorTurns(session: { id: string; topicId?: string | null; stage: TutorStage; stages: TutorStage[]; studentTurns: number }) {
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
    session.topicId && (stageReached === 'reflect' || stageReached === 'apply' || stageReached === 'reason')
      ? { label: 'Practise this now', to: `/practice/new?topic=${session.topicId}` }
      : { label: 'Keep going in this session', to: `/tutor/${session.id}` };

  return { covered, stageReached, nextStep };
}
