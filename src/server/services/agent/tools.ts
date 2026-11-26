import { and, eq, sql } from 'drizzle-orm';
import type { BackendBindings } from '../../config';
import type { SocketDb } from '../../db/client';
import { courses } from '../../db/schema';
import type { Decision } from '../../../shared/domain/agent';
import { MODEL_FORMATS } from '../questions/bank';
import { topUp } from '../questions/practice';
import { applyProposal, propose } from '../planning';
import { makeGoal, setGoalStatus } from './goals';

/**
 * The agent's tools: thin wrappers over services that already hold the rules. A tool acts only in
 * the student's own workspace. None marks an answer, writes evidence or contacts anyone, and model
 * work goes through the engine, inside the funding source's caps.
 */

export interface Outcome {
  status: 'done' | 'skipped' | 'failed';
  outcome: string;
}
const done = (outcome: string): Outcome => ({ status: 'done', outcome });
const skipped = (outcome: string): Outcome => ({ status: 'skipped', outcome });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Tool = (
  env: BackendBindings,
  db: SocketDb,
  workspaceId: string,
  ids: { runId: string; actionId: string },
  d: Decision,
) => Promise<Outcome>;

const tools: Record<Decision['tool'], Tool> = {
  async set_goal(_env, db, workspaceId, _ids, d) {
    const input = d.input as { assessmentId: string; title: string; date: string };
    const goal = await makeGoal(db, workspaceId, d.courseId!, input, 'syllabus');
    return done(`Goal set: ${goal.title}${goal.date ? ` on ${goal.date}` : ''}.`);
  },
  async close_goal(_env, db, workspaceId, _ids, d) {
    await setGoalStatus(db, workspaceId, (d.input as { goalId: string }).goalId, 'done');
    return done('Goal closed.');
  },
  async plan_week(_env, db, workspaceId, _ids, d) {
    const { weekStart } = d.input as { weekStart: string };
    const proposal = await propose(db, workspaceId, { operationId: crypto.randomUUID(), weekStart });
    if (!proposal.proposal.sessions.length)
      return skipped(
        proposal.proposal.minutesAvailable
          ? 'Every free study time this week is already planned, so nothing changed.'
          : 'No free study time is left this week, so nothing new was planned.',
      );
    await applyProposal(db, workspaceId, proposal.id, crypto.randomUUID());
    const p = proposal.proposal;
    return done(
      `Planned ${plural(p.sessions.length, 'session')}, ${p.minutesPlanned} of ${p.minutesAvailable} free minutes this week.`,
    );
  },
  async prepare_questions(env, db, workspaceId, ids, d) {
    const { scopeId } = d.input as { scopeId: string };
    const written = await topUp(env, db, workspaceId, d.courseId!, scopeId, ['multiple-choice', ...MODEL_FORMATS], {
      operationId: ids.actionId,
    });
    return written
      ? done(`Wrote and checked ${plural(written, 'new question')}.`)
      : skipped('The bank already holds unseen questions for the weakest sections.');
  },
  async prepare_glossary() {
    return skipped('The glossary is not available yet.');
  },
  async schedule_check(_env, _db, _workspaceId, _ids, d) {
    return done(`Reminder set for ${(d.input as { date: string }).date}.`);
  },
  async send_reminder() {
    return done('Shown in your reminders.');
  },
  async update_tutor_notes(_env, db, workspaceId, _ids, d) {
    const { line } = d.input as { line: string };
    const [row] = await db
      .select({ notes: courses.tutorNotes })
      .from(courses)
      .where(and(eq(courses.workspaceId, workspaceId), eq(courses.id, d.courseId!)));
    if (row?.notes?.includes(line)) return skipped('The tutor notes already say this.');
    await db
      .update(courses)
      .set({
        tutorNotes: sql`case when ${courses.tutorNotes} is null or ${courses.tutorNotes} = '' then ${line} else ${courses.tutorNotes} || E'\n' || ${line} end`,
        tutorNotesAt: new Date(),
      })
      .where(and(eq(courses.workspaceId, workspaceId), eq(courses.id, d.courseId!)));
    return done('Added a line to the tutor notes. You can read or clear them on the tutor page.');
  },
};

export function act(
  env: BackendBindings,
  db: SocketDb,
  workspaceId: string,
  runId: string,
  actionId: string,
  d: Decision,
) {
  return tools[d.tool](env, db, workspaceId, { runId, actionId }, d);
}
