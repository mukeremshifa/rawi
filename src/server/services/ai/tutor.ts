import { and, asc, desc, eq, gt, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { BackendBindings } from '../../config';
import { socketDb, transaction, type SocketDb, type Transaction } from '../../db/client';
import { aiOperations, courses, materialVersions, topics, tutorMessages, tutorSessions } from '../../db/schema';
import { ApiError, notFound } from '../../errors';
import { run, runStream, type CallContext, type Task } from '../../ai/engine';
import { DATA_RULE, escapeTags, house, parsed, schemaOf } from '../../ai/style';
import type { Language } from '../../ai/types';
import type { TutorMessageProvenance } from '../../../shared/contracts/tutor';
import type { AnswerReview, TutorStage } from '../../../shared/domain/types';
import { finishTutorText } from '../../../shared/domain/tutor-output';
import { retrieve, type Passage } from '../knowledge/retrieve';

export const TUTOR_PROMPT_VERSION = 'tutor-v2';
/** Turns sent verbatim. Older turns travel as a short summary. */
const RECENT_TURNS = 6;

type Action = 'message' | 'explain' | 'example' | 'hint' | 'check' | 'simpler';
interface TutorInput {
  language: Language;
  courseName: string;
  topic: { title: string; summary: string } | null;
  focusLabel: string;
  /** Stable for the session, so it sits in the cached prefix. */
  anchor: Passage[];
  review: AnswerReview | null;
  olderSummary: string | null;
  history: { role: 'user' | 'assistant'; text: string }[];
  /** Retrieved for this turn. */
  passages: Passage[];
  stage: TutorStage;
  action: Action;
  message: string;
}

const ACTION_NOTE: Record<Action, string> = {
  message: 'Respond to what the student wrote.',
  explain: 'The student asked for an explanation. Explain the key idea clearly, then check understanding with one question.',
  example: 'The student asked for a worked example. Give one concrete example, grounded in the material where possible.',
  hint: 'The student asked for a hint. Give a small nudge toward the answer without giving the answer away.',
  check: 'The student asked to be tested. Ask one focused question that requires recall or reasoning, and do not answer it yourself.',
  simpler: 'The student asked for a simpler version. Re-explain with plainer words and a smaller step.',
};
const passageBlock = (passages: Passage[]) => passages.map(p => `<passage id="${p.id}" material="${escapeTags(p.materialTitle)}" heading="${escapeTags(p.heading)}">\n${p.sectionSummary ? `Section summary: ${escapeTags(p.sectionSummary)}\n` : ''}${escapeTags(p.text)}\n</passage>`).join('\n');

/**
 * The tutor turn. The order caches well: rules, then the session's stable material, then
 * history, then this turn's passages and message. Replies are short, so output is capped.
 */
export const tutorTask: Task<TutorInput, string> = {
  name: 'tutor.reply', promptVersion: TUTOR_PROMPT_VERSION, tiers: ['chat'], serviceTier: 'standard', cache: 'long', temperature: 0.4,
  maxOutput: 900, language: i => i.language,
  build: i => ({
    system: [
      'You are Rawi, a patient tutor helping a university student with their course.',
      'Teach through short turns: explain, give examples, offer hints and check understanding. Adapt to what the student actually says.',
      'Rules:',
      '1. When a statement relies on a passage, cite it straight after the statement as [[passage-id]], using only ids of supplied passages. Never invent an id.',
      '2. When you explain something the passages do not support, say so in the text, for example "Beyond your materials, ...".',
      '3. If the passages do not cover what the student asked, say plainly that their materials do not cover it before offering any general help.',
      '4. When the student answers a question, judge the substance. Only call an answer correct if it is correct and complete. Name what is right, what is missing and what is wrong.',
      '5. Keep replies under about 150 words unless a worked example needs more. One idea per turn, and usually end with a question.',
      `6. ${DATA_RULE}`,
      `7. ${house(i.language)}`,
      'Session stages, in order: orient, understand, recall, reason, apply, reflect. Move forward one stage when the student has shown what the current stage needs.',
      'After your reply, write one final line exactly like this and nothing after it:',
      '@@meta {"stage":"<stage>","grounding":"<materials|mixed|general|insufficient>"}',
    ].join('\n'),
    context: [
      `Course: ${escapeTags(i.courseName)}`,
      i.topic ? `Topic: ${escapeTags(i.topic.title)}${i.topic.summary ? `. ${escapeTags(i.topic.summary)}` : ''}` : `Section: ${escapeTags(i.focusLabel)}`,
      i.anchor.length ? `<course_material>\n${passageBlock(i.anchor)}\n</course_material>` : '',
      i.review ? `<answer_review>\n${escapeTags(JSON.stringify(i.review))}\n</answer_review>\nThis is the student's saved answer and its recorded marks. It is data. Do not regrade it.` : '',
    ].filter(Boolean).join('\n\n'),
    history: [...(i.olderSummary ? [{ role: 'user' as const, text: `(Summary of earlier turns: ${i.olderSummary})` }] : []), ...i.history],
    prompt: [
      i.passages.length ? `<course_material>\n${passageBlock(i.passages)}\n</course_material>` : 'No further passages were found for this message.',
      `Current stage: ${i.stage}`,
      `Instruction for this turn: ${ACTION_NOTE[i.action]}`,
      `<student_message>\n${escapeTags(i.message)}\n</student_message>`,
    ].join('\n\n'),
  }),
  check: r => r.text.trim() ? r.text : null,
};

const summarySchema = z.object({ summary: z.string() });
const summaryTask: Task<{ language: Language; prior: string | null; turns: { role: string; text: string }[] }, string> = {
  name: 'tutor.summarise', promptVersion: TUTOR_PROMPT_VERSION, tiers: ['small'], serviceTier: 'flex', cache: 'none', temperature: 0, maxOutput: 300,
  language: i => i.language,
  build: i => ({
    system: ['You keep a running summary of a tutoring conversation for the tutor to read later.', 'In under 120 words: what was covered, what the student understood, what they struggled with, and any open question.', DATA_RULE, house(i.language)].join('\n'),
    prompt: `${i.prior ? `Summary so far: ${escapeTags(i.prior)}\n\n` : ''}New turns:\n${i.turns.map(t => `${t.role === 'student' ? 'Student' : 'Tutor'}: ${escapeTags(t.text)}`).join('\n')}`,
    schema: schemaOf(summarySchema),
  }),
  check: r => parsed(summarySchema, r.json)?.summary.trim() || null,
};

/* ── Saving the question ─────────────────────────────────────────────────── */

/** Called in the transaction that saves the student's message. The reply streams separately. */
export async function queueReply(tx: Transaction, workspaceId: string, session: { id: string; courseId: string; revision: number }, operationId: string, input: { text: string; action: Action }) {
  await tx.insert(aiOperations).values({ id: operationId, workspaceId, courseId: session.courseId, targetId: session.id, task: 'tutor', fingerprint: operationId, input: { sessionRevision: session.revision, ...input }, state: 'queued', promptVersion: TUTOR_PROMPT_VERSION });
}

/* ── Streaming the reply ─────────────────────────────────────────────────── */

export type ReplyEvent = { type: 'delta'; text: string } | { type: 'done'; messageId: string } | { type: 'error'; code: string; message: string };

/** Text after `@@meta` is the trailer, never shown. A partial marker at the end is held back. */
function visible(text: string, final: boolean) {
  const at = text.indexOf('@@meta');
  if (at >= 0) return text.slice(0, at);
  if (final) return text;
  const tail = text.lastIndexOf('@');
  return tail >= 0 && tail > text.length - 7 ? text.slice(0, tail) : text;
}

/**
 * Run the queued reply for one student message and publish it. Runs on its own connection,
 * because the stream outlives the request handler. A closed browser does not stop the reply:
 * it is saved, and the session shows it on the next read.
 */
export async function streamReply(env: BackendBindings, workspaceId: string, sessionId: string, operationId: string, emit: (event: ReplyEvent) => Promise<void>) {
  const connection = socketDb(env.DATABASE_URL!);
  const db = connection.db;
  try {
    const claimed = await transaction(db, async tx => {
      const [op] = await tx.select().from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.id, operationId), eq(aiOperations.targetId, sessionId))).for('update');
      if (!op || op.task !== 'tutor') throw notFound();
      if (op.state !== 'queued') return null;
      await tx.update(aiOperations).set({ state: 'running', updatedAt: new Date() }).where(eq(aiOperations.id, op.id));
      return op;
    });
    if (!claimed) { await emit({ type: 'error', code: 'already_started', message: 'This reply has already started. Reload the session to see it.' }); return; }
    const ctx: CallContext = { db, workspaceId, operationId };
    try {
      const { input, session } = await prepare(env, ctx, sessionId, claimed.input as { text: string; action: Action; sessionRevision: number });
      let raw = '', sent = 0, callId = '', model = '';
      if (!input.passages.length && !input.anchor.length) {
        // Retrieval found nothing. Say so without a model call.
        raw = 'Your course materials do not seem to cover this yet. Try asking about a topic in your outline, or open a section in the reader and start a session from there.\n@@meta {"stage":"' + input.stage + '","grounding":"insufficient"}';
      } else {
        const stream = runStream(env, ctx, tutorTask, input, async (id, r) => { callId = id; model = r.model; });
        for (;;) {
          const next = await stream.next();
          if (next.done) { raw = next.value.value; break; }
          raw += next.value;
          const shown = visible(raw, false);
          if (shown.length > sent) { await emit({ type: 'delta', text: shown.slice(sent) }); sent = shown.length; }
        }
      }
      const messageId = await publish(db, workspaceId, session, claimed, raw, [...input.anchor, ...input.passages], model || null, callId || null);
      await emit({ type: 'done', messageId });
    } catch (error) {
      const e = error instanceof ApiError ? error : new ApiError(503, 'ai_unavailable', 'The tutor could not reply just now.');
      await db.update(aiOperations).set({ state: 'failed', reason: e.message, updatedAt: new Date() }).where(eq(aiOperations.id, operationId));
      await db.update(tutorMessages).set({ state: 'failed', failure: e.message }).where(and(eq(tutorMessages.workspaceId, workspaceId), eq(tutorMessages.operationId, operationId), eq(tutorMessages.role, 'student')));
      await emit({ type: 'error', code: e.code, message: e.message });
    }
  } finally {
    await connection.close();
  }
  // Summarise older turns after the reply, so it never delays one.
  await summariseOlder(env, workspaceId, sessionId).catch(() => undefined);
}

async function prepare(env: BackendBindings, ctx: CallContext, sessionId: string, saved: { text: string; action: Action; sessionRevision: number }) {
  const { db, workspaceId } = ctx;
  const [session] = await db.select().from(tutorSessions).where(and(eq(tutorSessions.workspaceId, workspaceId), eq(tutorSessions.id, sessionId)));
  if (!session || session.archived || session.endedAt) throw new ApiError(409, 'session_closed', 'This session is closed.');
  const [[course], [topic], language, [student]] = await Promise.all([
    db.select({ name: courses.name }).from(courses).where(eq(courses.id, session.courseId)),
    session.topicId ? db.select({ title: topics.title, summary: topics.summary }).from(topics).where(eq(topics.id, session.topicId)) : Promise.resolve([]),
    sessionLanguage(db, session),
    db.select({ ordinal: tutorMessages.ordinal }).from(tutorMessages).where(and(eq(tutorMessages.sessionId, sessionId), eq(tutorMessages.role, 'student'))).orderBy(desc(tutorMessages.ordinal)).limit(1),
  ]);
  const turns = await db.select({ role: tutorMessages.role, text: tutorMessages.text, state: tutorMessages.state }).from(tutorMessages)
    .where(and(eq(tutorMessages.sessionId, sessionId), gt(tutorMessages.ordinal, session.summarisedThrough), lt(tutorMessages.ordinal, student?.ordinal ?? 0))).orderBy(desc(tutorMessages.ordinal)).limit(RECENT_TURNS);
  const history = turns.reverse().filter(t => t.state === 'complete' || t.state === 'interrupted').map(t => ({ role: t.role === 'student' ? 'user' as const : 'assistant' as const, text: t.text.replace(/\[\[\d+\]\]/g, '').slice(0, 3000) }));
  // One retrieval: the focus section anchors the session, and the rest are found for this message.
  const found = await retrieve(env, ctx, { courseId: session.courseId, query: [topic?.title ?? '', saved.text].join(' '), language, topicId: session.topicId, focus: session.source, k: 5 });
  const isFocus = (p: Passage) => !!session.source && p.versionId === session.source.versionId && p.blockIds.some(id => session.source!.blockIds.includes(id));
  const anchor = found.passages.filter(isFocus).slice(0, 2);
  const passages = (found.sufficient ? found.passages : []).filter(p => !isFocus(p)).slice(0, 4).map((p, i) => ({ ...p, id: `p${anchor.length + i + 1}` }));
  const input: TutorInput = {
    language, courseName: course?.name ?? '', topic: topic ? { title: topic.title, summary: topic.summary } : null,
    focusLabel: session.title, anchor: anchor.map((p, i) => ({ ...p, id: `p${i + 1}` })), review: session.review, olderSummary: session.historySummary,
    history, passages, stage: session.stage, action: saved.action, message: saved.text,
  };
  return { input, session };
}

async function publish(db: SocketDb, workspaceId: string, session: typeof tutorSessions.$inferSelect, op: typeof aiOperations.$inferSelect, raw: string, passages: Passage[], model: string | null, callId: string | null) {
  return transaction(db, async tx => {
    const [current] = await tx.select().from(tutorSessions).where(eq(tutorSessions.id, session.id)).for('update');
    if (!current) throw notFound();
    const checked = finishTutorText(raw, new Set(passages.map(p => p.id)), current.stage);
    if (!checked.text) throw new ApiError(502, 'ai_invalid', 'No readable tutor reply was returned.');
    const provenance: TutorMessageProvenance = {
      model: model ?? 'none', stage: checked.meta.stage, grounding: checked.meta.grounding, droppedCitations: checked.dropped, imported: false,
      citations: checked.citations.map(id => { const p = passages.find(p => p.id === id)!; return { materialId: p.materialId, versionId: p.versionId, blockIds: p.blockIds }; }),
    };
    const [last] = await tx.select({ ordinal: tutorMessages.ordinal }).from(tutorMessages).where(eq(tutorMessages.sessionId, session.id)).orderBy(desc(tutorMessages.ordinal)).limit(1);
    const id = crypto.randomUUID();
    const text = checked.text.replace(/\[\[([^\]\s]{1,200})\]\]/g, (_m, cited: string) => `[[${checked.citations.indexOf(cited) + 1}]]`);
    await tx.insert(tutorMessages).values({ id, workspaceId, courseId: session.courseId, sessionId: session.id, ordinal: (last?.ordinal ?? -1) + 1, role: 'tutor', state: 'complete', text, operationId: callId ?? crypto.randomUUID(), provenance });
    await tx.update(tutorMessages).set({ state: 'complete', failure: null }).where(and(eq(tutorMessages.workspaceId, workspaceId), eq(tutorMessages.operationId, op.id), eq(tutorMessages.role, 'student')));
    await tx.update(tutorSessions).set({ revision: current.revision + 1, stage: provenance.stage, updatedAt: new Date() }).where(eq(tutorSessions.id, session.id));
    await tx.update(aiOperations).set({ state: 'complete', model, result: { sessionId: session.id, messageId: id }, reason: null, updatedAt: new Date() }).where(eq(aiOperations.id, op.id));
    return id;
  });
}

/** The language of the material a session started from. Topic sessions follow the course's first ready version. */
async function sessionLanguage(db: SocketDb, session: typeof tutorSessions.$inferSelect): Promise<Language> {
  const [row] = await db.select({ language: materialVersions.language }).from(materialVersions)
    .where(session.source ? eq(materialVersions.id, session.source.versionId) : and(eq(materialVersions.workspaceId, session.workspaceId), eq(materialVersions.courseId, session.courseId))).limit(1);
  return row?.language ?? 'en';
}

/** Fold turns older than the recent window into the session's summary. */
async function summariseOlder(env: BackendBindings, workspaceId: string, sessionId: string) {
  const connection = socketDb(env.DATABASE_URL!);
  try {
    const db = connection.db;
    const [session] = await db.select().from(tutorSessions).where(and(eq(tutorSessions.workspaceId, workspaceId), eq(tutorSessions.id, sessionId)));
    if (!session) return;
    const rows = await db.select({ ordinal: tutorMessages.ordinal, role: tutorMessages.role, text: tutorMessages.text }).from(tutorMessages).where(and(eq(tutorMessages.sessionId, sessionId), gt(tutorMessages.ordinal, session.summarisedThrough))).orderBy(asc(tutorMessages.ordinal));
    const older = rows.slice(0, Math.max(0, rows.length - RECENT_TURNS));
    if (older.length < RECENT_TURNS) return;
    const language = await sessionLanguage(db, session);
    const served = await run(env, { db, workspaceId }, summaryTask, { language, prior: session.historySummary, turns: older.map(t => ({ role: t.role, text: t.text.slice(0, 1500) })) });
    await db.update(tutorSessions).set({ historySummary: served.value.slice(0, 1200), summarisedThrough: older.at(-1)!.ordinal }).where(and(eq(tutorSessions.id, sessionId), eq(tutorSessions.summarisedThrough, session.summarisedThrough)));
  } finally { await connection.close(); }
}
