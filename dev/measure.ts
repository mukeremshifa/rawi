/**
 * Development only. Measures the pipeline end to end on the seeded fictional courses, in the
 * workspace of an existing account, on the designated development database. No bundle imports it.
 *
 *   npx tsx dev/measure.ts --email EXISTING_EMAIL [--read] [--repeat 3] [--suites retrieval,questions,tutor]
 *
 * `--read` first runs reading, topic and prerequisite work until every seeded material is done.
 * Provider calls are metered like any other, so cost is read back from `ai_calls`. Nothing here
 * compares models: it uses the routes the catalog prefers.
 */
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { Client } from '@neondatabase/serverless';
import { and, eq, sql } from 'drizzle-orm';
import { socketDb, transaction } from '../src/server/db/client';
import * as s from '../src/server/db/schema';
import type { BackendBindings } from '../src/server/config';
import { ingestPending } from '../src/server/services/knowledge/ingest';
import { courseJobsDue, runCourseJobs } from '../src/server/services/outline/jobs';
import { courseSections } from '../src/server/services/knowledge/course';
import { retrieve, resolveQuery } from '../src/server/services/knowledge/retrieve';
import { ensureScope } from '../src/server/services/scopes';
import { contexts, ensureBuilt, generate } from '../src/server/services/questions/bank';
import { createSession, saveMessage } from '../src/server/services/tutoring';
import { replyConnection, streamReply } from '../src/server/services/ai/tutor';
import { LIMITATION, TUTOR_CASES, type TutorCase } from './fixtures/eval';
import { SEED_MATERIALS } from './fixtures/materials';

const args = process.argv.slice(2);
const option = (name: string, fallback?: string) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const email = option('--email')?.toLowerCase();
const repeat = Number(option('--repeat', '3'));
const suites = (option('--suites', 'retrieval,questions,tutor') ?? '').split(',');
if (!email) throw new Error('Pass --email EXISTING_EMAIL.');
const config = parseEnv(readFileSync('.dev.vars', 'utf8'));
if (!config.DATABASE_URL || config.R2_ENVIRONMENT !== 'development') throw new Error('The designated .dev.vars development backend is required.');
const env = { ...config } as unknown as BackendBindings;

// Database round trips, counted at the driver.
let trips = 0;
const query = Client.prototype.query;
Client.prototype.query = function (this: Client, ...a: unknown[]) { trips++; return (query as (...b: unknown[]) => unknown).apply(this, a); } as typeof Client.prototype.query;

const { db, close } = socketDb(config.DATABASE_URL, 5);
const median = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)]! : null; };
const spent = async (where: ReturnType<typeof sql>) => (await db.execute(sql`select coalesce(sum(coalesce(charged_micros, reserved_micros)) filter (where state <> 'released'), 0)::int as micros, count(*)::int as calls from ai_calls where ${where}`)).rows[0] as { micros: number; calls: number };
const out: Record<string, unknown> = { at: new Date().toISOString(), repeat };

try {
  const [user] = await db.select({ id: s.user.id }).from(s.user).where(sql`lower(${s.user.email}) = ${email}`);
  const [workspace] = user ? await db.select().from(s.workspaces).where(eq(s.workspaces.ownerUserId, user.id)) : [];
  if (!workspace) throw new Error('No workspace for that account. Sign in and run the seed first.');
  const wid = workspace.id;
  const courseRows = await db.select().from(s.courses).where(eq(s.courses.workspaceId, wid));
  const course = (prefix: string) => { const c = courseRows.find(r => r.name.startsWith(prefix)); if (!c) throw new Error(`Seeded course missing: ${prefix}. Run the seed.`); return c; };
  const atlantic = course('The Atlantic World'), stats = course('Statistical'), minds = course('Minds');

  /* ── Reading ─────────────────────────────────────────────────────────── */
  if (args.includes('--read')) {
    const started = Date.now(), before = await spent(sql`workspace_id = ${wid}`);
    for (const c of [atlantic, stats, minds]) {
      const scope = { workspaceId: wid, courseId: c.id };
      for (let i = 0; i < 60 && (await ingestPending(db, scope) || await courseJobsDue(db, scope)); i++) await runCourseJobs(env, scope);
    }
    const after = await spent(sql`workspace_id = ${wid}`);
    out.reading = { ms: Date.now() - started, micros: after.micros - before.micros, calls: after.calls - before.calls };
  }
  const layer = [];
  for (const c of [atlantic, stats, minds]) {
    const [jobs, facts, topics] = await Promise.all([
      db.execute(sql`select readiness, count(*)::int n from ingest_jobs j join materials m on m.current_version_id = j.version_id where j.workspace_id = ${wid} and j.course_id = ${c.id} group by readiness`),
      db.execute(sql`select f.kind, f.extractor like 'model%' as model, count(*)::int n from facts f join materials m on m.current_version_id = f.version_id where f.workspace_id = ${wid} and f.course_id = ${c.id} group by 1, 2`),
      db.execute(sql`select count(*)::int n, count(*) filter (where origin = 'syllabus')::int syllabus from topics where workspace_id = ${wid} and course_id = ${c.id}`),
    ]);
    const list = await courseSections(db, { workspaceId: wid, courseId: c.id });
    layer.push({ course: c.name, sections: list.length, digested: list.filter(x => x.summary).length, readiness: jobs.rows, facts: facts.rows, topics: topics.rows[0], prerequisites: (await db.select({ n: sql<number>`count(*)::int` }).from(s.prerequisites).where(eq(s.prerequisites.courseId, c.id)))[0]!.n });
  }
  out.layer = layer;

  // A case starting from a section opens on that section's blocks.
  const focusOf = async (c: TutorCase) => {
    if (!('material' in c.start)) return null;
    const start = c.start;
    const title = start.material === 'handbook' ? 'Course handbook' : SEED_MATERIALS.find(m => m.id === start.material)?.title ?? '';
    const [m] = await db.select().from(s.materials).where(and(eq(s.materials.workspaceId, wid), eq(s.materials.title, title)));
    if (!m) return null;
    const versions = await db.select().from(s.materialVersions).where(eq(s.materialVersions.materialId, m.id)).orderBy(s.materialVersions.number);
    const version = 'version' in start && start.version ? versions[start.version - 1]! : versions.at(-1)!;
    const [section] = await db.select().from(s.sections).where(and(eq(s.sections.versionId, version.id), eq(s.sections.heading, start.heading)));
    return section ? { materialId: m.id, versionId: version.id, blockIds: section.blockIds } : null;
  };

  /* ── Retrieval ───────────────────────────────────────────────────────── */
  if (suites.includes('retrieval')) {
    const ctx = { db, workspaceId: wid };
    const rows = [];
    for (const c of TUTOR_CASES) {
      const focus = await focusOf(c);
      const history = (c.history ?? []).flatMap(([student, tutor]) => [{ role: 'user' as const, text: student }, { role: 'assistant' as const, text: tutor }]);
      const resolved = resolveQuery(c.message, history, 'en');
      const found = await retrieve(env, ctx, { courseId: atlantic.id, query: resolved.query, context: resolved.context, language: 'en', focus });
      const text = found.passages.map(p => p.text).join('\n');
      rows.push({ case: c.id, evidence: c.evidence.every(m => text.includes(m)), stale: !(c.staleEvidence ?? []).some(m => found.passages.filter(p => !p.earlier).some(p => p.text.includes(m))), verdict: found.verdict === c.verdict, got: found.verdict });
    }
    // A scope ranks its sections first and never limits what can be found.
    const reading = (await courseSections(db, { workspaceId: wid, courseId: atlantic.id })).filter(x => x.title === 'The Exchange and its Aftermath');
    const scope = await ensureScope(db, wid, atlantic.id, { kind: 'material', materialId: reading[0]!.materialId });
    const ids = new Set(scope.sections.map(x => x.id));
    const scoped = [];
    for (const c of TUTOR_CASES.filter(c => ['ord-demography', 'ord-navigation', 'long-indigo', 'table-mariposa', 'conflict-encomienda'].includes(c.id))) {
      const found = await retrieve(env, ctx, { courseId: atlantic.id, query: c.message, language: 'en', scope: { name: scope.name, sectionIds: ids } });
      const text = found.passages.map(p => p.text).join('\n');
      scoped.push({ case: c.id, evidence: c.evidence.every(m => text.includes(m)), outsideScope: found.outsideScope });
    }
    out.retrieval = { cases: rows.length, evidence: rows.filter(r => r.evidence).length, verdict: rows.filter(r => r.verdict).length, stale: rows.filter(r => !r.stale).length, misses: rows.filter(r => !r.evidence || !r.verdict).map(r => `${r.case}:${r.got}`), scoped };
  }

  /* ── Questions ───────────────────────────────────────────────────────── */
  if (suites.includes('questions')) {
    const result: Record<string, unknown> = {};
    for (const c of [atlantic, stats]) {
      const owned = { workspaceId: wid, courseId: c.id };
      const list = (await courseSections(db, owned)).filter(x => x.summary);
      const ctxs = await contexts(db, owned, list);
      const built = await transaction(db, tx => ensureBuilt(tx, owned, [...ctxs.values()], ['flashcard', 'cloze', 'matching', 'ordering', 'multiple-choice']));
      const byFormat = (await db.execute(sql`select format, origin, count(*)::int n from bank_items where workspace_id = ${wid} and course_id = ${c.id} group by 1, 2`)).rows;
      const formats = c.id === stats.id ? ['multiple-choice', 'numeric', 'self-check'] as const : ['multiple-choice', 'self-check'] as const;
      const runs: { format: string; requested: number; written: number; accepted: number; rejected: Record<string, number>; micros: number; calls: number; ms: number }[] = [];
      for (const format of formats) {
        for (let r = 0; r < repeat; r++) {
          const operationId = crypto.randomUUID(), started = Date.now();
          const targets = list.slice((r * 3) % Math.max(1, list.length - 3)).slice(0, 3);
          const made = await generate(env, { db, workspaceId: wid, operationId }, owned, targets.map(t => ({ sectionId: t.id, format, count: 2 }))).catch(e => ({ items: [], written: 0, rejected: { [String(e.code ?? e)]: 1 } }));
          const cost = await spent(sql`operation_id = ${operationId}`);
          runs.push({ format, requested: targets.length * 2, written: made.written, accepted: made.items.length, rejected: made.rejected, micros: cost.micros, calls: cost.calls, ms: Date.now() - started });
        }
      }
      const sum = (f: string, k: 'requested' | 'written' | 'accepted' | 'micros') => runs.filter(r => r.format === f).reduce((n, r) => n + r[k], 0);
      result[c.name] = { builtNow: built, bank: byFormat, generated: formats.map(f => ({ format: f, requested: sum(f, 'requested'), written: sum(f, 'written'), accepted: sum(f, 'accepted'), microsPerAccepted: sum(f, 'accepted') ? Math.round(sum(f, 'micros') / sum(f, 'accepted')) : null, msMedian: median(runs.filter(r => r.format === f).map(r => r.ms)), rejected: runs.filter(r => r.format === f).reduce((m, r) => { for (const [k, v] of Object.entries(r.rejected)) m[k] = (m[k] ?? 0) + v; return m; }, {} as Record<string, number>) })) };
    }
    out.questions = result;
  }

  /* ── Tutor ───────────────────────────────────────────────────────────── */
  if (suites.includes('tutor')) {
    const scope = await ensureScope(db, wid, atlantic.id, { kind: 'course' });
    const rows = [];
    for (const c of TUTOR_CASES) {
      for (let r = 0; r < repeat; r++) {
        const focus = await focusOf(c);
        const session = await createSession(db, wid, atlantic.id, { id: crypto.randomUUID(), title: `Measure ${c.id}`, scopeId: scope.id, ...(focus ? { source: focus } : {}) });
        let ordinal = 0;
        for (const [student, tutor] of c.history ?? []) for (const [role, text] of [['student', student], ['tutor', tutor]] as const) {
          await db.insert(s.tutorMessages).values({ id: crypto.randomUUID(), workspaceId: wid, courseId: atlantic.id, sessionId: session.session.id, ordinal: ordinal++, role, text, state: 'complete', operationId: crypto.randomUUID() });
        }
        const operationId = crypto.randomUUID();
        const t0 = Date.now(); trips = 0;
        // As the ask route does: save the question, then stream the reply on the same connection.
        const connection = replyConnection(env);
        await saveMessage(connection.db, wid, session.session.id, { operationId, expectedRevision: session.session.revision, text: c.message, action: 'message' });
        let first: number | null = null, firstTrips: number | null = null, text = '', error = '';
        await streamReply(env, wid, session.session.id, operationId, async e => {
          if (e.type === 'delta') { if (first === null) { first = Date.now() - t0; firstTrips = trips; } text += e.text; }
          if (e.type === 'error') error = e.code;
        }, p => { void p.catch(() => undefined); }, connection);
        const cost = await spent(sql`operation_id = ${operationId}`);
        const [reply] = await db.select({ text: s.tutorMessages.text, provenance: s.tutorMessages.provenance }).from(s.tutorMessages).where(and(eq(s.tutorMessages.sessionId, session.session.id), eq(s.tutorMessages.role, 'tutor'))).orderBy(sql`${s.tutorMessages.ordinal} desc`).limit(1);
        const body = reply?.text ?? text;
        const pass = !error && c.answer.every(p => p.test(body)) && !(c.forbid ?? []).some(p => p.test(body)) && (!c.limitation || LIMITATION.test(body));
        rows.push({ case: c.id, kind: c.kind, pass, firstMs: first, totalMs: Date.now() - t0, tripsToFirst: firstTrips, micros: cost.micros, noCall: cost.calls === 0, error });
      }
    }
    const called = rows.filter(r => !r.noCall);
    out.tutor = {
      runs: rows.length, pass: rows.filter(r => r.pass).length,
      firstMsMedian: median(called.flatMap(r => r.firstMs ?? [])), totalMsMedian: median(called.map(r => r.totalMs)), tripsToFirstMedian: median(called.flatMap(r => r.tripsToFirst ?? [])),
      microsPerReplyMedian: median(called.map(r => r.micros)), noCall: rows.length - called.length,
      failed: [...new Set(rows.filter(r => !r.pass).map(r => r.case))],
    };
  }
  console.log(JSON.stringify(out, null, 2));
} finally {
  await close();
}
