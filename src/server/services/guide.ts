import { and, desc, eq } from 'drizzle-orm';
import type { ReadDb, SocketDb, Transaction } from '../db/client';
import { aiOperations, preferences, tutorMessages, tutorSessions } from '../db/schema';
import type { NextMove } from '../../shared/contracts/tutor';
import { isDue, type MasteryLevel } from '../../shared/domain/mastery';
import { localISO } from '../../shared/domain/planner';
import { learnerState, type SectionState } from './questions/results';
import { latestCheck, sessionSections } from './ai/tutor';

/**
 * The guide: which step a tutor session takes next. Code chooses the move from the learner model
 * and the turns so far, and the tutor writes the words. The student can always ask something else.
 *
 * A guided run starts with a review question when part of the scope is due, talks through a wrong
 * answer, then explains the weakest section and checks it, section by section, and suggests
 * wrapping up after a handful of questions.
 */

type Db = ReadDb | SocketDb | Transaction;
type Session = typeof tutorSessions.$inferSelect;

/** Questions in a session before the guide suggests wrapping up. */
const QUESTIONS = 5;
/** Turns read to work out what the session has done so far. */
const LOOKBACK = 30;
/** The order sections are worked on: what was missed, then what is due, then what is new. */
const ORDER: Record<MasteryLevel, number> = { shaky: 0, 'not-checked': 2, learning: 3, secure: 4 };

const explainText = (heading: string) => `Explain "${heading}".`;
const checkText = (heading: string) => `Ask me a question on "${heading}".`;

interface Ranked {
  ref: { materialId: string; key: string };
  heading: string;
  state: SectionState;
  due: boolean;
}

/** The session's sections with what the student has shown on each, weakest first. */
async function ranked(db: Db, session: Session): Promise<{ list: Ranked[]; today: string }> {
  const [weighted, [prefs]] = await Promise.all([
    sessionSections(db, session),
    db
      .select({ timezone: preferences.timezone })
      .from(preferences)
      .where(eq(preferences.workspaceId, session.workspaceId)),
  ]);
  const timezone = prefs?.timezone ?? 'UTC',
    today = localISO(new Date(), timezone);
  const sections = weighted.map(w => w.section).filter(s => s.tokens > 60);
  const state = await learnerState(
    db,
    session.workspaceId,
    sections.map(s => ({ materialId: s.materialId, key: s.key })),
    timezone,
  );
  // A heading two sections share, such as "A worked example", is named with the heading above it, or its material.
  const name = (s: (typeof sections)[number]) => s.heading || s.title;
  const shared = (s: (typeof sections)[number]) => sections.some(o => o !== s && name(o) === name(s));
  const label = (s: (typeof sections)[number]) =>
    !shared(s) ? name(s) : s.path.length > 1 ? `${s.path.at(-2)}: ${name(s)}` : `${name(s)} (${s.title})`;
  const list = sections.map((s, i) => ({
    ref: { materialId: s.materialId, key: s.key },
    heading: label(s),
    state: state[i]!,
    due: isDue(state[i]!.mastery, today),
  }));
  const rank = (r: Ranked) => (r.due && r.state.mastery.level !== 'shaky' ? 1 : ORDER[r.state.mastery.level]);
  return {
    list: list
      .map((r, i) => ({ r, i }))
      .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
      .map(x => x.r),
    today,
  };
}

export async function nextMove(db: Db, session: Session): Promise<NextMove | null> {
  if (session.endedAt || session.archived) return null;
  const [{ list }, recent] = await Promise.all([
    ranked(db, session),
    // A student turn carries the step it took and the section it was about, saved with its reply.
    db
      .select({
        ordinal: tutorMessages.ordinal,
        role: tutorMessages.role,
        text: tutorMessages.text,
        state: tutorMessages.state,
        provenance: tutorMessages.provenance,
        step: aiOperations.input,
      })
      .from(tutorMessages)
      .leftJoin(aiOperations, and(eq(aiOperations.id, tutorMessages.operationId), eq(aiOperations.task, 'tutor')))
      .where(and(eq(tutorMessages.workspaceId, session.workspaceId), eq(tutorMessages.sessionId, session.id)))
      .orderBy(desc(tutorMessages.ordinal))
      .limit(LOOKBACK),
  ]);
  if (!list.length) return null;
  const posed = recent.findIndex(m => m.provenance?.check);
  const check = posed === -1 ? null : await latestCheck(db, session.id, recent[0]!.ordinal);
  // A question waiting for an answer is the next step itself.
  if (check && !check.result) return null;
  const sinceCheck = posed === -1 ? recent : recent.slice(0, posed);
  if (
    check?.result &&
    check.result.marksAwarded < check.result.marksAvailable &&
    !sinceCheck.some(m => m.role === 'student')
  )
    return { label: 'Talk me through it', text: 'Talk me through that question.', action: 'discuss' };
  const questions = recent.filter(m => m.provenance?.check).length;
  if (questions >= QUESTIONS) return { label: 'Wrap up the session', end: true };
  if (!questions && list.some(r => r.due))
    return { label: 'Start with a review question', text: 'Ask me a review question.', action: 'check' };
  // After an explanation, check that section. Otherwise explain the weakest section not yet explained.
  // The step is read from the saved action and section, never from the wording of the message.
  const students = recent
    .filter(m => m.role === 'student')
    .map(m => m.step as { action?: string; focus?: { materialId: string; key: string } } | null);
  const about = (r: Ranked) => (step: (typeof students)[number]) =>
    step?.action === 'explain' && step.focus?.materialId === r.ref.materialId && step.focus.key === r.ref.key;
  const explained = students.length ? list.find(r => about(r)(students[0]!)) : undefined;
  if (explained)
    return {
      label: `Check me on ${explained.heading}`,
      text: checkText(explained.heading),
      action: 'check',
      focus: explained.ref,
    };
  const target = list.find(r => !students.some(about(r)));
  if (target)
    return {
      label: `Explain ${target.heading}`,
      text: explainText(target.heading),
      action: 'explain',
      focus: target.ref,
    };
  return questions
    ? { label: 'Wrap up the session', end: true }
    : { label: 'Ask me a question', text: 'Ask me a question.', action: 'check' };
}

/**
 * The first message of a guided session: what the session will work on and why, from the learner
 * model. Written by code, so it costs nothing and says only what the marks show.
 */
export async function opening(db: Db, session: Session, focus: string) {
  const { list } = await ranked(db, session);
  const due = list.filter(r => r.due).length,
    shaky = list.filter(r => r.state.mastery.level === 'shaky');
  const fresh = list.filter(r => r.state.mastery.level === 'not-checked');
  return [
    `Today we will work on ${focus}.`,
    due ? `${due === 1 ? 'One part is' : `${due} parts are`} due for review, so we start with a question.` : '',
    shaky.length
      ? `Then we look at "${shaky[0]!.heading}", which you have missed lately.`
      : fresh.length
        ? `Then we start on "${fresh[0]!.heading}", which you have not been checked on yet.`
        : '',
    'Take each step with the button below the conversation, or ask me anything at any point.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** The next review date for an ended session: the earliest day a section it worked on comes due, today at the soonest. */
export async function nextReview(db: Db, session: Session) {
  const { list, today } = await ranked(db, session);
  const first = list
    .map(r => r.state.mastery.dueOn)
    .filter((d): d is string => !!d)
    .sort()[0];
  return first ? (first < today ? today : first) : null;
}
