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
import type { AiPolicy, Language, ServiceTier, Tier, Vendor } from './types';

/**
 * A task is everything the engine needs to serve one kind of AI work. Features call tasks and
 * never name a model. `build` is the context builder, `check` the validator. A failed check
 * escalates to the next tier. Output is capped per task, and the cap sets the reservation.
 */
export interface Task<I, O> {
  name: string;
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

export interface CallContext { db: SocketDb; workspaceId: string; operationId?: string; jobId?: string; signal?: AbortSignal }
export interface Served<O> { value: O; route: Route; callId: string; result: ModelResult }

export class AiFailed extends ApiError {}

export function adaptersFor(env: BackendBindings): Partial<Record<Vendor, Adapter>> {
  const out: Partial<Record<Vendor, Adapter>> = {};
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) out.bedrock = bedrockAdapter({ accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY });
  if (env.GOOGLE_VERTEX_PROJECT && env.GOOGLE_VERTEX_CLIENT_EMAIL && env.GOOGLE_VERTEX_PRIVATE_KEY) out.vertex = vertexAdapter({ project: env.GOOGLE_VERTEX_PROJECT, clientEmail: env.GOOGLE_VERTEX_CLIENT_EMAIL, privateKey: env.GOOGLE_VERTEX_PRIVATE_KEY });
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

/** The routes that may serve a tier now, in preference order. */
export async function routesFor(db: ReadDb | SocketDb, adapters: Partial<Record<Vendor, Adapter>>, policy: AiPolicy, tier: Tier) {
  const down = await downRoutes(db);
  return TIERS[tier].map(id => routeById(id)!).filter(r => adapters[r.vendor] && policy.vendors.includes(r.vendor) && (policy.retention === 'standard' || r.retention === 'none') && !down.has(`${r.vendor}:${r.model}`));
}

/* ── Running tasks ───────────────────────────────────────────────────────── */

function trace(fields: Record<string, unknown>) { console.log(JSON.stringify({ operation: 'ai-call', ...fields })); }
const requestText = (req: Omit<ModelRequest, 'maxOutput' | 'cache' | 'serviceTier' | 'temperature'>) =>
  [req.system, req.context ?? '', ...(req.history ?? []).map(h => h.text), req.prompt, req.schema ? JSON.stringify(req.schema) : ''].join('\n');

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
    for (const r of await routesFor(ctx.db, adapters, plan, tier)) {
      const base = task.build(input, r);
      // Flex is recorded and priced only where the route offers it.
      const tierUsed: ServiceTier = task.serviceTier === 'flex' && r.flex ? 'flex' : 'standard';
      const request: ModelRequest = { ...base, maxOutput: task.maxOutput, cache: task.cache, serviceTier: tierUsed, temperature: task.temperature };
      const callId = await reserve(ctx.db, { workspaceId: ctx.workspaceId, operationId: ctx.operationId, jobId: ctx.jobId, task: task.name, step, route: r, serviceTier: tierUsed, language, reservedMicros: reservation(r, estimateTokens(requestText(base), language), task.maxOutput, tierUsed, base.images?.length ?? 0) });
      const started = Date.now();
      let result: ModelResult;
      try { result = await adapters[r.vendor]!.generate(r, request, ctx.signal); }
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
  throw new AiFailed(503, 'ai_unavailable', 'AI is not available right now. Nothing was charged. Try again in a few minutes.');
}

/**
 * Stream a text task. Text already shown cannot be taken back, so a stream never escalates after
 * its first token. A route that refuses before any text gives way to the next.
 */
export async function* runStream<I>(env: BackendBindings, ctx: CallContext, task: Task<I, string>, input: I, onCall?: (callId: string, route: Route) => Promise<void>): AsyncGenerator<string, Served<string>> {
  const adapters = adaptersFor(env);
  const { plan } = await policyFor(ctx.db, ctx.workspaceId);
  const language = task.language(input);
  let step = 0;
  for (const tier of task.tiers) {
    for (const r of await routesFor(ctx.db, adapters, plan, tier)) {
      const base = task.build(input, r);
      // Flex is recorded and priced only where the route offers it.
      const tierUsed: ServiceTier = task.serviceTier === 'flex' && r.flex ? 'flex' : 'standard';
      const request: ModelRequest = { ...base, maxOutput: task.maxOutput, cache: task.cache, serviceTier: tierUsed, temperature: task.temperature };
      const callId = await reserve(ctx.db, { workspaceId: ctx.workspaceId, operationId: ctx.operationId, task: task.name, step, route: r, serviceTier: tierUsed, language, reservedMicros: reservation(r, estimateTokens(requestText(base), language), task.maxOutput, tierUsed) });
      await onCall?.(callId, r);
      const started = Date.now();
      let text = '', saved = 0;
      try {
        const stream = adapters[r.vendor]!.stream(r, request, ctx.signal);
        for (;;) {
          const next = await stream.next();
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
  throw new AiFailed(503, 'ai_unavailable', 'AI is not available right now. Nothing was charged. Try again in a few minutes.');
}

/** Embed texts with the embedding route, metered like any call. Batches stay within vendor limits. */
export async function embed(env: BackendBindings, ctx: CallContext, texts: string[], purpose: 'document' | 'query', language: Language) {
  const adapters = adaptersFor(env);
  const { plan } = await policyFor(ctx.db, ctx.workspaceId);
  const [r] = await routesFor(ctx.db, adapters, plan, 'embed');
  if (!r) return null;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50), chars = batch.reduce((n, t) => n + t.length, 0);
    const callId = await reserve(ctx.db, { workspaceId: ctx.workspaceId, operationId: ctx.operationId, jobId: ctx.jobId, task: `embed.${purpose}`, step: 0, route: r, serviceTier: 'standard', language, reservedMicros: reservation(r, 0, 0, 'standard', 0, chars) });
    const started = Date.now();
    try {
      const result = await adapters[r.vendor]!.embed(r, batch, purpose);
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
