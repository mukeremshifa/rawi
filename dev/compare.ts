/**
 * Development only. Runs fixture tasks across the configured model routes and reports cost,
 * latency, time to first token and how often the output passes the task's own check plus a
 * fixture expectation. Calls vendors directly with the credentials in .dev.vars. Nothing is
 * metered or saved, and no bundle imports this file.
 *
 *   npx tsx dev/compare.ts                      every text route, every case, once
 *   npx tsx dev/compare.ts --routes qwen3-32b,gemini-2.5-flash-lite --cases tutor --repeat 3
 *   npx tsx dev/compare.ts --pipeline --label baseline --repeat 6   the real pipeline, see pipeline.ts
 */
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { adaptersFor, type Task } from '../src/server/ai/engine';
import type { ModelRequest, ModelResult } from '../src/server/ai/adapters/types';
import { cost, ROUTES, type Route } from '../src/server/ai/catalog';
import { markdownBlocks } from '../src/server/services/documents/markdown';
import { blockMarkdown } from '../src/shared/domain/document-text';
import { outlineTasks } from '../src/server/services/outline/tasks';
import { digestTask, figureTask, type DigestInput } from '../src/server/services/knowledge/tasks';
import { tutorTask } from '../src/server/services/ai/tutor';
import { ruleCheck, writeTask } from '../src/server/services/ai/questions';
import { gradeTask } from '../src/server/services/ai/grading';
import { SEED_MATERIALS } from './fixtures/materials';
import { SEED_QUESTIONS } from './fixtures/questions';
import type { BackendBindings } from '../src/server/config';

process.loadEnvFile('.dev.vars');
const { values: args } = parseArgs({ options: {
  routes: { type: 'string' }, cases: { type: 'string' }, repeat: { type: 'string', default: '1' }, debug: { type: 'boolean', default: false },
  pipeline: { type: 'boolean', default: false }, label: { type: 'string', default: 'latest' }, suites: { type: 'string', default: 'retrieval,tutor,questions,grading' },
  'tutor-routes': { type: 'string' }, 'grade-routes': { type: 'string' },
} });
if (args.pipeline) {
  const { runPipeline } = await import('./pipeline');
  await runPipeline({ label: args.label, suites: args.suites.split(','), repeat: Number(args.repeat), tutorRoutes: args['tutor-routes']?.split(','), gradeRoutes: args['grade-routes']?.split(','), debug: args.debug });
  process.exit(0);
}
const adapters = adaptersFor(process.env as unknown as BackendBindings);

/* ── Fixture cases ───────────────────────────────────────────────────────── */

// Each case is a task, its input, and an expectation the output must meet beyond the task's check.
type Case = { name: string; task: Task<any, any>; input: any; stream?: boolean; expect: (value: any) => string | null };

const syllabusBlocks = markdownBlocks(readFileSync('dev/fixtures/syllabus.md', 'utf8'), 'md').map((b, i) => ({ key: `b${i}`, text: blockMarkdown(b as never) })).filter(b => b.text.trim());
const exchange = SEED_MATERIALS.find(m => m.id === 'mat-exchange-reading')!;
const keyed = exchange.sections.map((s, i) => ({ key: `s${i}`, heading: s.heading, blocks: s.text.split(/\n\n+/).map((t, n) => ({ key: `b${i}_${n}`, text: t })) }));
const written = SEED_QUESTIONS.filter(q => q.format === 'written-recall' && q.rubric?.length).slice(0, 2);
// The fixtures carry marker notes, not model answers, so the strong answers are written here.
const strong = [
  'Epidemic disease after contact killed most of the indigenous population, which removed the labour supply colonists relied on. Demand for labour in mines and on plantations already existed and did not fall when the supply did. The slave trade expanded to fill that gap. So the order is demand first, then disease removing the supply, then the trade. Disease did not cause slavery on its own.',
  'The encomienda granted a Spaniard the labour and tribute of a named indigenous community. It did not grant land: the land legally remained indigenous. Calling it a land grant hides that it was a claim on people, which moves the argument from property to coerced labour and tribute.',
];
const passage = (i: number) => ({ id: `p${i + 1}`, materialId: 'm', versionId: 'v', blockIds: [], materialTitle: exchange.title, heading: exchange.sections[i]!.heading, text: exchange.sections[i]!.text, sectionSummary: null });

/** A 64 by 64 PNG: a red square on white, for the figure case. */
function redSquare() {
  const size = 64, rows: number[] = [];
  for (let y = 0; y < size; y++) { rows.push(0); for (let x = 0; x < size; x++) { const red = x >= 16 && x < 48 && y >= 16 && y < 48; rows.push(255, red ? 0 : 255, red ? 0 : 255); } }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]));
}

const cases: Case[] = [
  {
    name: 'figure', task: figureTask,
    input: { language: 'en', caption: 'A test figure', context: '', image: { mime: 'image/png', data: redSquare() } },
    expect: v => /red/i.test(v) && /square/i.test(v) ? null : 'missed the red square',
  },
  {
    name: 'syllabus', task: outlineTasks.read_syllabus,
    input: { courseName: 'PHIL 214 Minds, Machines and Meaning', language: 'en', blocks: syllabusBlocks, current: [] },
    // Six weeks are listed, with two essays and an examination.
    expect: v => v.topics.length !== 6 ? `topics ${v.topics.length}` : !v.topics.every((t: any) => /^Week \d$/.test(t.module.trim())) ? 'module labels' : v.assessments.length < 2 ? `assessments ${v.assessments.length}` : null,
  },
  {
    name: 'digest', task: digestTask,
    input: { language: 'en', materialTitle: exchange.title, sections: keyed } satisfies DigestInput,
    expect: v => {
      const known = new Set(keyed.flatMap(s => s.blocks.map(b => b.key)));
      const facts = v.sections.flatMap((s: any) => s.facts);
      const cited = facts.filter((f: any) => f.blocks.length && f.blocks.every((k: string) => known.has(k))).length;
      return facts.length < keyed.length ? `facts ${facts.length}` : cited / facts.length < 0.9 ? `valid citations ${cited}/${facts.length}` : null;
    },
  },
  {
    name: 'questions', task: writeTask,
    input: { language: 'en', materialTitle: exchange.title, format: 'multiple-choice', targets: keyed.slice(0, 2).map((s, i) => ({ key: `t${i}`, heading: s.heading, facts: [], blocks: s.blocks, difficulty: i ? 'reasoning' : 'recall', count: 2 })) },
    expect: v => { const bad = v.questions.filter((q: any) => ruleCheck(q, 'multiple-choice').length); return v.questions.length < 4 ? `questions ${v.questions.length}` : bad.length ? `rule failures ${bad.length}/${v.questions.length}` : null; },
  },
  {
    name: 'grade', task: gradeTask,
    // A model answer should earn most marks and an empty one none.
    input: { language: 'en', items: written.flatMap((q, i) => [
      { key: `a${i}good`, prompt: q.prompt, modelAnswer: q.answer ?? '', rubric: q.rubric!.map((r, n) => ({ key: `r${n}`, label: r.label, marks: r.marks })), source: '', response: strong[i]! },
      { key: `a${i}weak`, prompt: q.prompt, modelAnswer: q.answer ?? '', rubric: q.rubric!.map((r, n) => ({ key: `r${n}`, label: r.label, marks: r.marks })), source: '', response: 'I am not sure. It was about the colonies.' },
    ]) },
    expect: v => {
      const share = (key: string) => { const it = v.items.find((o: any) => o.key === key); const q = written[Number(key[1])]!; return it.points.reduce((n: number, p: any) => n + p.awarded, 0) / q.rubric!.reduce((n, r) => n + r.marks, 0); };
      const low = written.map((_, i) => share(`a${i}good`)).find(s => s < 0.6), high = written.map((_, i) => share(`a${i}weak`)).find(s => s > 0.2);
      return low !== undefined ? `model answer scored ${Math.round(low * 100)}%` : high !== undefined ? `empty answer scored ${Math.round(high * 100)}%` : null;
    },
  },
  {
    name: 'tutor', task: tutorTask, stream: true,
    input: { language: 'en', courseName: 'The Atlantic World, 1500 to 1800', topic: { title: 'The Columbian Exchange', summary: '' }, focusLabel: '', anchor: [passage(0)], review: null, olderSummary: null, history: [], passages: [passage(1)], stage: 'understand', action: 'message', message: 'Why did the demographic collapse matter for the slave trade?' },
    expect: v => !/\[\[p[12]\]\]/.test(v) ? 'no citation' : !/@@meta \{/.test(v) ? 'no meta line' : /—|;/.test(v.split('@@meta')[0]) ? 'house punctuation' : null,
  },
];

/* ── Running ─────────────────────────────────────────────────────────────── */

const routes = ROUTES.filter(r => r.kind === 'text' && adapters[r.vendor] && (!args.routes || args.routes.split(',').includes(r.id)));
const fits = (r: Route, c: Case) => c.name !== 'figure' || r.vision;
const chosen = cases.filter(c => !args.cases || args.cases.split(',').includes(c.name));
const repeat = Number(args.repeat);
type Row = { route: string; case: string; ok: number; runs: number; ms: number[]; ttft: number[]; micros: number[]; inTok: number[]; outTok: number[]; notes: string[] };
const rows: Row[] = [];

async function once(r: Route, c: Case): Promise<{ result: ModelResult; value: unknown }> {
  const req: ModelRequest = { ...c.task.build(c.input, r), maxOutput: c.task.maxOutput, cache: c.task.cache, serviceTier: c.task.serviceTier === 'flex' && r.flex ? 'flex' : 'standard', temperature: c.task.temperature };
  if (!c.stream) { const result = await adapters[r.vendor]!.generate(r, req); return { result, value: result.stop === 'end' ? c.task.check(result, c.input) : null }; }
  const stream = adapters[r.vendor]!.stream(r, req);
  for (;;) { const n = await stream.next(); if (n.done) return { result: n.value, value: c.task.check(n.value, c.input) }; }
}

for (const c of chosen) for (const r of routes.filter(r => fits(r, c))) {
  const row: Row = { route: r.id, case: c.name, ok: 0, runs: 0, ms: [], ttft: [], micros: [], inTok: [], outTok: [], notes: [] };
  rows.push(row);
  for (let i = 0; i < repeat; i++) {
    row.runs++;
    try {
      const { result, value } = await once(r, c);
      const tier = c.task.serviceTier === 'flex' && r.flex ? 'flex' : 'standard';
      row.ms.push(result.latencyMs); if (result.ttftMs !== null) row.ttft.push(result.ttftMs);
      row.micros.push(cost(r, result.usage, tier)); row.inTok.push(result.usage.input + result.usage.cacheRead); row.outTok.push(result.usage.output + result.usage.reasoning);
      const problem = value === null ? `check failed (${result.stop})` : c.expect(value);
      if (problem) row.notes.push(problem); else row.ok++;
      if (problem && args.debug) console.log(`--- ${r.id} ${c.name}: ${problem}
${(result.text || JSON.stringify(result.json)).slice(0, 1500)}`);
    } catch (error) { row.notes.push(String(error).slice(0, 80)); }
  }
  process.stdout.write(`${c.name} ${r.id}: ${row.ok}/${row.runs}${row.notes.length ? ` (${row.notes[0]})` : ''}\n`);
}

const mean = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : NaN;
console.log('\ncase       route                     pass   ms mean  ttft  µ$ mean  in tok  out tok  notes');
for (const r of rows) console.log(`${r.case.padEnd(10)} ${r.route.padEnd(25)} ${`${r.ok}/${r.runs}`.padEnd(6)} ${String(mean(r.ms)).padStart(7)} ${String(mean(r.ttft)).padStart(5)} ${String(mean(r.micros)).padStart(8)} ${String(mean(r.inTok)).padStart(7)} ${String(mean(r.outTok)).padStart(8)}  ${[...new Set(r.notes)].join('; ').slice(0, 70)}`);
console.log(`\nTotal spend about $${(rows.reduce((n, r) => n + r.micros.reduce((a, b) => a + b, 0), 0) / 1e6).toFixed(4)}.`);
