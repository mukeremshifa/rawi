import { eq, sql } from 'drizzle-orm';
import type { BackendBindings } from '../config';
import type { ReadDb, SocketDb } from '../db/client';
import { aiCalls } from '../db/schema';
import { ApiError } from '../errors';
import { bedrockAdapter } from './adapters/bedrock';
import { ProviderError, type Adapter, type ModelRequest, type ModelResult } from './adapters/types';
import { vertexAdapter } from './adapters/vertex';
import { cost, estimateTokens, reservation, route as routeById, TIERS, type Route } from './catalog';
import { checkpoint, policyFor, reserve, settle } from './meter';
import type { AiPolicy, DataClass, Language, ServiceTier, Tier, Vendor } from './types';

/**
 * A task is everything the engine needs to serve one kind of AI work. Features call tasks and
 * never name a model. `build` is the context builder, `check` the validator. A failed check
 * escalates to the next tier. Output is capped per task, and the cap sets the reservation.
 */
export interface Task<I, O> {
  name: string;
  /** `student` when the input carries anything a student wrote. It decides which routes may serve. */
  data: DataClass;
  promptVersion: string;
  tiers: Tier[];
  serviceTier: ServiceTier;
  maxOutput: number;
  cache: ModelRequest['cache'];
  temperature?: number;
  language: (input: I) => Language;
  build: (input: I, route: Route) => Omit<ModelRequest, 'maxOutput' | 'cache' | 'serviceTier' | 'temperature'>;
  check: (result: ModelResult, input: I) => O | null;
}

export interface CallContext { db: SocketDb; workspaceId: string; operationId?: string; jobId?: string; signal?: AbortSignal; budget?: Budget }

/**
 * Limits for one operation across all its calls, retries and escalations: how many calls, how
 * much reserved spend and until when. Reaching one stops the operation before the next call.
 */
export interface Budget { calls: number; micros: number; maxCalls: number; maxMicros: number; until: number }
export const budget = (maxCalls: number, maxMicros: number, seconds: number): Budget => ({ calls: 0, micros: 0, maxCalls, maxMicros, until: Date.now() + seconds * 1000 });
function spend(ctx: CallContext, micros: number) {
  const b = ctx.budget;
  if (!b) return;
  if (b.calls + 1 > b.maxCalls || b.micros + micros > b.maxMicros || Date.now() > b.until) throw new AiFailed(429, 'ai_operation_limit', 'This request reached its limit for AI work, so nothing more was sent. What was finished is kept.');
  b.calls++; b.micros += micros;
}
export interface Served<O> { value: O; route: Route; callId: string; result: ModelResult }

export class AiFailed extends ApiError {}

/**
 * Adapters are kept per isolate, keyed by their credentials, so the Vertex access token is
 * signed and exchanged once an hour rather than before every call.
 */
let adapters: { key: string; value: Partial<Record<Vendor, Adapter>> } | null = null;
export function adaptersFor(env: BackendBindings): Partial<Record<Vendor, Adapter>> {
  const key = [env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY, env.GOOGLE_VERTEX_PROJECT, env.GOOGLE_VERTEX_CLIENT_EMAIL, env.GOOGLE_VERTEX_PRIVATE_KEY].join('\u0000');
  if (adapters?.key === key) return adapters.value;
  const out: Partial<Record<Vendor, Adapter>> = {};
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) out.bedrock = bedrockAdapter({ accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY });
  if (env.GOOGLE_VERTEX_PROJECT && env.GOOGLE_VERTEX_CLIENT_EMAIL && env.GOOGLE_VERTEX_PRIVATE_KEY) out.vertex = vertexAdapter({ project: env.GOOGLE_VERTEX_PROJECT, clientEmail: env.GOOGLE_VERTEX_CLIENT_EMAIL, privateKey: env.GOOGLE_VERTEX_PRIVATE_KEY });
  adapters = { key, value: out };
  return out;
}

/* ── Health ──────────────────────────────────────────────────────────────── */

/** Routes that refused or failed recently, shared through the trace and kept per isolate briefly. */
let health: { at: number; down: Set<string> } | null = null;
const localDown = new Map<string, number>();
async function downRoutes(db: ReadDb | SocketDb) {
  if (!health || Date.now() - health.at > 30_000) {
    const rows = await db.execute(sql`select vendor, model from ${aiCalls} where created_at > now() - interval '5 minutes'
      group by vendor, model having count(*) filter (where error is not null and state <> 'settled') >= 3 and count(*) filter (where state = 'settled') = 0`);
    health = { at: Date.now(), down: new Set((rows.rows as { vendor: string; model: string }[]).map(r => `${r.vendor}:${r.model}`)) };
  }
  const down = new Set(health.down);
  for (const [key, until] of localDown) if (until > Date.now()) down.add(key);
  return down;
}
const markDown = (r: Route) => localDown.set(`${r.vendor}:${r.model}`, Date.now() + 60_000);

/**
 * The routes that may serve a tier now, in preference order. Student content goes only to routes
 * that keep no prompts, whatever the plan allows, unless the plan deliberately widens it with
 * `studentRetention: 'standard'`. Institution material follows the plan's retention alone.
 */
export async function routesFor(db: ReadDb | SocketDb, adapters: Partial<Record<Vendor, Adapter>>, policy: AiPolicy, tier: Tier, data: DataClass = 'institution') {
  const down = await downRoutes(db);
  return TIERS[tier].map(id => routeById(id)!).filter(r => adapters[r.vendor] && policy.vendors.includes(r.vendor) && allowed(policy, r, data) && !down.has(`${r.vendor}:${r.model}`));
}
const allowed = (policy: AiPolicy, r: Route, data: DataClass) =>
  (policy.retention === 'standard' || r.retention === 'none') && (data === 'institution' || r.retention === 'none' || policy.studentRetention === 'standard');

/** When nothing may serve, say whether only the student-content rule stood in the way. */
function unavailable(adapters: Partial<Record<Vendor, Adapter>>, policy: AiPolicy, tiers: Tier[], data: DataClass) {
  const blocked = data === 'student' && tiers.some(t => TIERS[t].some(id => { const r = routeById(id)!; return adapters[r.vendor] && policy.vendors.includes(r.vendor) && !allowed(policy, r, data); }));
  return blocked
    ? new AiFailed(503, 'ai_no_private_route', 'No AI service that keeps no copy of what you write is available right now, so nothing was sent. Try again in a few minutes.')
    : new AiFailed(503, 'ai_unavailable', 'AI is not available right now. Nothing was charged. Try again in a few minutes.');
}

/* ── Running tasks ───────────────────────────────────────────────────────── */

function trace(fields: Record<string, unknown>) { console.log(JSON.stringify({ operation: 'ai-call', ...fields })); }
const requestText = (req: Omit<ModelRequest, 'maxOutput' | 'cache' | 'serviceTier' | 'temperature'>) =>
  [req.system, req.context ?? '', ...(req.history ?? []).map(h => h.text), req.prompt, req.schema ? JSON.stringify(req.schema) : ''].join('\n');

/** How long a call may take before it is abandoned as uncertain. The flex lane queues, so it gets longer. */
const TIMEOUT_MS: Record<ServiceTier, number> = { standard: 60_000, flex: 150_000 };
const deadline = (ctx: CallContext, tier: ServiceTier) => AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS[tier]), ...(ctx.signal ? [ctx.signal] : [])]);
/**
 * Settles with the signal, whatever the adapter does with it. A vendor client that ignores an
 * abort mid-read would otherwise hold a stopped or timed-out call open.
 */
function within<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new ProviderError('aborted', false));
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new ProviderError('aborted', false));
    signal.addEventListener('abort', stop, { once: true });
    work.then(v => { signal.removeEventListener('abort', stop); resolve(v); }, e => { signal.removeEventListener('abort', stop); reject(e); });
  });
}

/** The student stopped a streamed reply. What arrived is kept, and the call stays charged as uncertain. */
export class Cancelled extends Error {
  constructor(readonly text: string, readonly callId: string, readonly route: Route) { super('cancelled'); }
}

/**
 * Walk the task's tiers. Inside a tier, a route that refused before generating gives way to the
 * next route. A failed check escalates to the next tier. An uncertain outcome stops the run: it
 * stays charged and is never retried automatically.
 */
export async function run<I, O>(env: BackendBindings, ctx: CallContext, task: Task<I, O>, input: I): Promise<Served<O>> {
  const adapters = adaptersFor(env);
  const { plan } = await policyFor(ctx.db, ctx.workspaceId);
  const language = task.language(input);
  let step = 0, lastError = 'unavailable';
  for (const tier of task.tiers) {
    for (const r of await routesFor(ctx.db, adapters, plan, tier, task.data)) {
      const base = task.build(input, r);
      // Flex is recorded and priced only where the route offers it.
      const tierUsed: ServiceTier = task.serviceTier === 'flex' && r.flex ? 'flex' : 'standard';
      const request: ModelRequest = { ...base, maxOutput: task.maxOutput, cache: task.cache, serviceTier: tierUsed, temperature: task.temperature };
      const reservedMicros = reservation(r, estimateTokens(requestText(base), language), task.maxOutput, tierUsed, base.images?.length ?? 0);
      spend(ctx, reservedMicros);
      const callId = await reserve(ctx.db, { workspaceId: ctx.workspaceId, operationId: ctx.operationId, jobId: ctx.jobId, task: task.name, step, route: r, serviceTier: tierUsed, language, reservedMicros });
      const started = Date.now();
      let result: ModelResult;
      const limit = deadline(ctx, tierUsed);
      try { result = await within(adapters[r.vendor]!.generate(r, request, limit), limit); }
      catch (error) {
        const e = error instanceof ProviderError ? error : new ProviderError(String(error), false);
        await settle(ctx.db, callId, { state: e.certain ? 'released' : 'ambiguous', error: e.message.slice(0, 300), latencyMs: Date.now() - started });
        trace({ task: task.name, model: r.model, vendor: r.vendor, language, step, outcome: e.certain ? 'refused' : 'uncertain', error: e.message.slice(0, 120) });
        if (!e.certain) throw new AiFailed(502, 'ai_uncertain', 'The AI service stopped responding partway. This request was not repeated, so nothing was saved twice.');
        markDown(r); lastError = e.message; continue;
      }
      const value = result.stop === 'end' ? task.check(result, input) : null;
      const validation = value === null ? 'failed' : 'passed';
      await settle(ctx.db, callId, { state: 'settled', chargedMicros: cost(r, result.usage, tierUsed), usage: result.usage, latencyMs: result.latencyMs, ttftMs: result.ttftMs, validation, ...(result.stop === 'end' ? {} : { error: `stop_${result.stop}` }) });
      trace({ task: task.name, model: r.model, vendor: r.vendor, language, step, usage: result.usage, latencyMs: result.latencyMs, validation, stop: result.stop });
      if (value !== null) return { value, route: r, callId, result };
      // Keep the start of a rejected answer so the check can be diagnosed from the trace.
      await ctx.db.update(aiCalls).set({ partial: (result.text || JSON.stringify(result.json ?? null)).slice(0, 2000) }).where(eq(aiCalls.id, callId));
      lastError = `invalid_${result.stop}`;
      break;
    }
    step++;
  }
  if (lastError.startsWith('invalid')) throw new AiFailed(502, 'ai_invalid', 'The AI answer did not pass its checks, so nothing was saved.');
  throw unavailable(adapters, plan, task.tiers, task.data);
}

/**
 * Stream a text task. Text already shown cannot be taken back, so a stream never escalates after
 * its first token. A route that refuses before any text gives way to the next. When the
 * context's signal aborts, the stream stops and `Cancelled` carries the text that arrived.
 */
export async function* runStream<I>(env: BackendBindings, ctx: CallContext, task: Task<I, string>, input: I, onCall?: (callId: string, route: Route) => Promise<void>): AsyncGenerator<string, Served<string>> {
  const adapters = adaptersFor(env);
  const { plan } = await policyFor(ctx.db, ctx.workspaceId);
  const language = task.language(input);
  let step = 0;
  for (const tier of task.tiers) {
    for (const r of await routesFor(ctx.db, adapters, plan, tier, task.data)) {
      const base = task.build(input, r);
      // Flex is recorded and priced only where the route offers it.
      const tierUsed: ServiceTier = task.serviceTier === 'flex' && r.flex ? 'flex' : 'standard';
      const request: ModelRequest = { ...base, maxOutput: task.maxOutput, cache: task.cache, serviceTier: tierUsed, temperature: task.temperature };
      const reservedMicros = reservation(r, estimateTokens(requestText(base), language), task.maxOutput, tierUsed);
      spend(ctx, reservedMicros);
      const callId = await reserve(ctx.db, { workspaceId: ctx.workspaceId, operationId: ctx.operationId, task: task.name, step, route: r, serviceTier: tierUsed, language, reservedMicros });
      await onCall?.(callId, r);
      const started = Date.now();
      let text = '', saved = 0;
      try {
        const limit = deadline(ctx, tierUsed);
        const stream = adapters[r.vendor]!.stream(r, request, limit);
        for (;;) {
          let next: IteratorResult<string, ModelResult>;
          try { next = await within(stream.next(), limit); }
          catch (error) { void stream.return(undefined as never).catch(() => undefined); throw error; }
          if (next.done) {
            const result = next.value;
            const value = result.stop === 'end' || result.stop === 'max_tokens' ? task.check(result, input) : null;
            await settle(ctx.db, callId, { state: 'settled', chargedMicros: cost(r, result.usage, tierUsed), usage: result.usage, latencyMs: result.latencyMs, ttftMs: result.ttftMs, validation: value === null ? 'failed' : 'passed', ...(result.stop === 'end' ? {} : { error: `stop_${result.stop}` }) });
            trace({ task: task.name, model: r.model, vendor: r.vendor, language, step, usage: result.usage, latencyMs: result.latencyMs, ttftMs: result.ttftMs, validation: value === null ? 'failed' : 'passed' });
            if (value === null) throw new AiFailed(502, 'ai_invalid', 'The reply did not pass its checks.');
            return { value, route: r, callId, result };
          }
          text += next.value; yield next.value;
          // Checkpoint about every 400 characters, so a lost connection keeps most of the reply.
          if (text.length - saved > 400) { saved = text.length; await checkpoint(ctx.db, callId, text); }
        }
      } catch (error) {
        if (error instanceof AiFailed) throw error;
        if (ctx.signal?.aborted) {
          // Stopped by the student. Usage is unknown, so the reservation stands as the charge.
          if (text) await checkpoint(ctx.db, callId, text);
          await settle(ctx.db, callId, { state: 'ambiguous', error: 'cancelled', latencyMs: Date.now() - started });
          trace({ task: task.name, model: r.model, vendor: r.vendor, language, step, outcome: 'cancelled', chars: text.length });
          throw new Cancelled(text, callId, r);
        }
        const e = error instanceof ProviderError ? error : new ProviderError(String(error), false);
        const certain = e.certain && !text;
        if (text) await checkpoint(ctx.db, callId, text);
        await settle(ctx.db, callId, { state: certain ? 'released' : 'ambiguous', error: e.message.slice(0, 300), latencyMs: Date.now() - started });
        trace({ task: task.name, model: r.model, vendor: r.vendor, language, step, outcome: certain ? 'refused' : 'uncertain', error: e.message.slice(0, 120) });
        if (!certain) throw new AiFailed(502, 'ai_uncertain', 'The reply stopped partway. What arrived is kept, and it was not sent again.');
        markDown(r); continue;
      }
    }
    step++;
  }
  throw unavailable(adapters, plan, task.tiers, task.data);
}

/**
 * Embed texts with the embedding route, metered like any call. Batches stay within vendor
 * limits. A student's question is student content, so it needs a route that keeps no prompts,
 * and without one the caller searches by text alone.
 */
export async function embed(env: BackendBindings, ctx: CallContext, texts: string[], purpose: 'document' | 'query', language: Language, data: DataClass) {
  const adapters = adaptersFor(env);
  const { plan } = await policyFor(ctx.db, ctx.workspaceId);
  const [r] = await routesFor(ctx.db, adapters, plan, 'embed', data);
  if (!r) return null;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50), chars = batch.reduce((n, t) => n + t.length, 0);
    const callId = await reserve(ctx.db, { workspaceId: ctx.workspaceId, operationId: ctx.operationId, jobId: ctx.jobId, task: `embed.${purpose}`, step: 0, route: r, serviceTier: 'standard', language, reservedMicros: reservation(r, 0, 0, 'standard', 0, chars) });
    const started = Date.now();
    try {
      const result = await adapters[r.vendor]!.embed(r, batch, purpose, deadline(ctx, 'standard'));
      await settle(ctx.db, callId, { state: 'settled', chargedMicros: cost(r, { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, audioSeconds: 0, images: 0 }, 'standard', result.chars), usage: { input: result.chars, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, audioSeconds: 0, images: 0 }, latencyMs: result.latencyMs, ttftMs: null, validation: result.vectors.length === batch.length ? 'passed' : 'failed' });
      if (result.vectors.length !== batch.length) return null;
      out.push(...result.vectors);
    } catch (error) {
      const e = error instanceof ProviderError ? error : new ProviderError(String(error), false);
      await settle(ctx.db, callId, { state: e.certain ? 'released' : 'ambiguous', error: e.message.slice(0, 300), latencyMs: Date.now() - started });
      return null;
    }
  }
  return { vectors: out, model: r.model };
}
