import { eq, sql } from 'drizzle-orm';
import type { BackendBindings } from '../config';
import type { ReadDb, SocketDb } from '../db/client';
import { aiCalls } from '../db/schema';
import { ApiError } from '../errors';
import { ProviderError, type ModelRequest, type ModelResult } from './adapters/types';
import { cost, estimateTokens, PREFERENCE, reservation, route as routeById, type Route } from './catalog';
import { allowed, fundingFor, type Funding } from './funding';
import { checkpoint, reserve, settle } from './meter';
import type { DataClass, Language, ServiceTier, Skill } from './types';

/**
 * What a task needs from a model. Routes come from data by skill, so a task never names a
 * model and a model swap never touches a task.
 */
export interface Needs {
  skill: Skill;
  /** `student` when the input carries anything a student wrote. It decides which routes may serve. */
  data: DataClass;
  /** Background work takes the flex lane where a route offers it. */
  lane: 'interactive' | 'background';
  maxOutput: number;
  cache: ModelRequest['cache'];
  /** Routes tried in turn when a check fails, the first included. Bounds what one task can spend. */
  attempts?: number;
}

/**
 * Everything the engine needs to serve one kind of AI work. `build` is the context builder,
 * `check` the validator. A failed check moves to the next route for the skill.
 */
export interface Task<I, O> {
  name: string;
  promptVersion: string;
  needs: Needs;
  temperature?: number;
  language: (input: I) => Language;
  build: (input: I, route: Route) => Omit<ModelRequest, 'maxOutput' | 'cache' | 'serviceTier' | 'temperature'>;
  check: (result: ModelResult, input: I) => O | null;
}

export interface CallContext {
  db: SocketDb;
  workspaceId: string;
  operationId?: string;
  jobId?: string;
  signal?: AbortSignal;
  budget?: Budget;
  funding?: Funding;
  ahead?: Promise<Ahead | null>;
}

/**
 * Limits for one operation across all its calls and retries: how many calls, how much reserved
 * spend and until when. Reaching one stops the operation before the next call.
 */
export interface Budget {
  calls: number;
  micros: number;
  maxCalls: number;
  maxMicros: number;
  until: number;
}
export const budget = (maxCalls: number, maxMicros: number, seconds: number): Budget => ({
  calls: 0,
  micros: 0,
  maxCalls,
  maxMicros,
  until: Date.now() + seconds * 1000,
});
function spend(ctx: CallContext, micros: number) {
  const b = ctx.budget;
  if (!b) return;
  if (b.calls + 1 > b.maxCalls || b.micros + micros > b.maxMicros || Date.now() > b.until)
    throw new AiFailed(
      429,
      'ai_operation_limit',
      'This request reached its limit for AI work, so nothing more was sent. What was finished is kept.',
    );
  b.calls++;
  b.micros += micros;
}
export interface Served<O> {
  value: O;
  route: Route;
  callId: string;
  result: ModelResult;
}

export class AiFailed extends ApiError {}

/** The funding source for this context, resolved once per operation. */
export async function funding(env: BackendBindings, ctx: CallContext) {
  return (ctx.funding ??= await fundingFor(env, ctx.db, ctx.workspaceId));
}

/* ── Health ──────────────────────────────────────────────────────────────── */

/** Routes that refused or failed recently, shared through the trace and kept per isolate briefly. */
let health: { at: number; down: Set<string> } | null = null;
const localDown = new Map<string, number>();
async function downRoutes(db: ReadDb | SocketDb) {
  if (!health || Date.now() - health.at > 30_000) {
    const rows =
      await db.execute(sql`select vendor, model from ${aiCalls} where created_at > now() - interval '5 minutes'
      group by vendor, model having count(*) filter (where error is not null and state <> 'settled') >= 3 and count(*) filter (where state = 'settled') = 0`);
    health = {
      at: Date.now(),
      down: new Set((rows.rows as { vendor: string; model: string }[]).map(r => `${r.vendor}:${r.model}`)),
    };
  }
  const down = new Set(health.down);
  for (const [key, until] of localDown) if (until > Date.now()) down.add(key);
  return down;
}
const markDown = (r: Route) => localDown.set(`${r.vendor}:${r.model}`, Date.now() + 60_000);

/** The routes that may serve a skill now under this funding, in preference order. */
export async function routesFor(db: ReadDb | SocketDb, f: Funding, skill: Skill, data: DataClass = 'institution') {
  const down = await downRoutes(db);
  return PREFERENCE[skill]
    .map(id => routeById(id)!)
    .filter(r => allowed(f, r, data) && !down.has(`${r.vendor}:${r.model}`));
}

/** When nothing may serve, say whether only the student-content rule stood in the way. */
function unavailable(f: Funding, needs: Needs) {
  const blocked =
    needs.data === 'student' && PREFERENCE[needs.skill].some(id => allowed(f, routeById(id)!, 'institution'));
  return blocked
    ? new AiFailed(
        503,
        'ai_no_private_route',
        'No AI service that keeps no copy of what you write is available right now, so nothing was sent. Try again in a few minutes.',
      )
    : new AiFailed(
        503,
        'ai_unavailable',
        'AI is not available right now. Nothing was charged. Try again in a few minutes.',
      );
}

/* ── Running tasks ───────────────────────────────────────────────────────── */

function trace(fields: Record<string, unknown>) {
  console.log(JSON.stringify({ operation: 'ai-call', ...fields }));
}
const requestText = (req: Omit<ModelRequest, 'maxOutput' | 'cache' | 'serviceTier' | 'temperature'>) =>
  [
    req.system,
    req.context ?? '',
    ...(req.history ?? []).map(h => h.text),
    req.prompt,
    req.schema ? JSON.stringify(req.schema) : '',
  ].join('\n');

/** How long a call may take before it is abandoned as uncertain. The flex lane queues, so it gets longer. */
const TIMEOUT_MS: Record<ServiceTier, number> = { standard: 60_000, flex: 150_000 };
const deadline = (ctx: CallContext, tier: ServiceTier) =>
  AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS[tier]), ...(ctx.signal ? [ctx.signal] : [])]);
/**
 * Settles with the signal, whatever the adapter does with it. A vendor client that ignores an
 * abort mid-read would otherwise hold a stopped or timed-out call open.
 */
function within<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new ProviderError('aborted', false));
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new ProviderError('aborted', false));
    signal.addEventListener('abort', stop, { once: true });
    work.then(
      v => {
        signal.removeEventListener('abort', stop);
        resolve(v);
      },
      e => {
        signal.removeEventListener('abort', stop);
        reject(e);
      },
    );
  });
}

/** The student stopped a streamed reply. What arrived is kept, and the call stays charged as uncertain. */
export class Cancelled extends Error {
  constructor(
    readonly text: string,
    readonly callId: string,
    readonly route: Route,
  ) {
    super('cancelled');
  }
}

/** One prepared call: the request, its lane and its reservation. Null when the route is too small. */
function prepare<I>(task: Task<I, unknown>, input: I, r: Route, language: Language) {
  const base = task.build(input, r);
  const text = requestText(base);
  const tokens = estimateTokens(text, language);
  if (tokens > r.context) return null;
  const tier: ServiceTier = task.needs.lane === 'background' && r.flex ? 'flex' : 'standard';
  const request: ModelRequest = {
    ...base,
    maxOutput: task.needs.maxOutput,
    cache: task.needs.cache,
    serviceTier: tier,
    temperature: task.temperature,
  };
  return { request, tier, reserved: reservation(r, tokens, task.needs.maxOutput, tier, base.images?.length ?? 0) };
}

/**
 * Walk the routes for the task's skill. A route that refused before generating gives way to the
 * next. A failed check moves on too, up to the task's attempts. An uncertain outcome stops the
 * run: it stays charged and is never retried automatically.
 */
export async function run<I, O>(
  env: BackendBindings,
  ctx: CallContext,
  task: Task<I, O>,
  input: I,
): Promise<Served<O>> {
  const f = await funding(env, ctx);
  const language = task.language(input);
  const attempts = task.needs.attempts ?? 2;
  let step = 0,
    checks = 0,
    lastError = 'unavailable';
  for (const r of await routesFor(ctx.db, f, task.needs.skill, task.needs.data)) {
    if (checks >= attempts) break;
    const call = prepare(task, input, r, language);
    if (!call) continue;
    spend(ctx, call.reserved);
    const callId = await reserve(ctx.db, f, {
      workspaceId: ctx.workspaceId,
      operationId: ctx.operationId,
      jobId: ctx.jobId,
      task: task.name,
      step,
      route: r,
      serviceTier: call.tier,
      language,
      reservedMicros: call.reserved,
    });
    const started = Date.now();
    let result: ModelResult;
    const limit = deadline(ctx, call.tier);
    try {
      result = await within(f.adapters[r.vendor]!.generate(r, call.request, limit), limit);
    } catch (error) {
      const e = error instanceof ProviderError ? error : new ProviderError(String(error), false);
      await settle(ctx.db, callId, {
        state: e.certain ? 'released' : 'ambiguous',
        error: e.message.slice(0, 300),
        latencyMs: Date.now() - started,
      });
      trace({
        task: task.name,
        model: r.model,
        vendor: r.vendor,
        source: f.source.id,
        language,
        step,
        outcome: e.certain ? 'refused' : 'uncertain',
        error: e.message.slice(0, 120),
      });
      if (!e.certain)
        throw new AiFailed(
          502,
          'ai_uncertain',
          'The AI service stopped responding partway. This request was not repeated, so nothing was saved twice.',
        );
      markDown(r);
      lastError = e.message;
      step++;
      continue;
    }
    const value = result.stop === 'end' ? task.check(result, input) : null;
    const validation = value === null ? 'failed' : 'passed';
    await settle(ctx.db, callId, {
      state: 'settled',
      chargedMicros: cost(r, result.usage, call.tier),
      usage: result.usage,
      latencyMs: result.latencyMs,
      ttftMs: result.ttftMs,
      validation,
      ...(result.stop === 'end' ? {} : { error: `stop_${result.stop}` }),
    });
    trace({
      task: task.name,
      model: r.model,
      vendor: r.vendor,
      source: f.source.id,
      language,
      step,
      usage: result.usage,
      latencyMs: result.latencyMs,
      validation,
      stop: result.stop,
    });
    if (value !== null) return { value, route: r, callId, result };
    // Keep the start of a rejected answer so the check can be diagnosed from the trace.
    await ctx.db
      .update(aiCalls)
      .set({ partial: (result.text || JSON.stringify(result.json ?? null)).slice(0, 2000) })
      .where(eq(aiCalls.id, callId));
    lastError = `invalid_${result.stop}`;
    checks++;
    step++;
  }
  if (lastError.startsWith('invalid'))
    throw new AiFailed(502, 'ai_invalid', 'The AI answer did not pass its checks, so nothing was saved.');
  throw unavailable(f, task.needs);
}

/**
 * A reservation made before the request is built, from an upper bound on its size, so it runs
 * alongside the work that prepares the request instead of after it. `runStream` uses it for the
 * route it was made for, and it is released unused otherwise.
 */
export interface Ahead {
  callId: string;
  route: Route;
  tier: ServiceTier;
  inputTokens: number;
}
export async function reserveAhead<I>(
  env: BackendBindings,
  ctx: CallContext,
  task: Task<I, unknown>,
  inputTokens: number,
  language: Language,
): Promise<Ahead | null> {
  const f = await funding(env, ctx);
  const [r] = await routesFor(ctx.db, f, task.needs.skill, task.needs.data);
  if (!r) return null;
  const tier: ServiceTier = task.needs.lane === 'background' && r.flex ? 'flex' : 'standard';
  const micros = reservation(r, inputTokens, task.needs.maxOutput, tier);
  spend(ctx, micros);
  const callId = await reserve(ctx.db, f, {
    workspaceId: ctx.workspaceId,
    operationId: ctx.operationId,
    task: task.name,
    step: 0,
    route: r,
    serviceTier: tier,
    language,
    reservedMicros: micros,
  });
  return { callId, route: r, tier, inputTokens };
}
/** Release a reservation made ahead that no call used. */
export async function releaseAhead(ctx: CallContext) {
  const ahead = await ctx.ahead?.catch(() => null);
  if (ahead) await settle(ctx.db, ahead.callId, { state: 'released', error: 'unused', latencyMs: 0 });
  ctx.ahead = undefined;
}

/**
 * Stream a text task. Text already shown cannot be taken back, so a stream never moves to another
 * route after its first token. A route that refuses before any text gives way to the next. When
 * the context's signal aborts, the stream stops and `Cancelled` carries the text that arrived.
 */
export async function* runStream<I>(
  env: BackendBindings,
  ctx: CallContext,
  task: Task<I, string>,
  input: I,
  onCall?: (callId: string, route: Route) => void,
): AsyncGenerator<string, Served<string>> {
  const f = await funding(env, ctx);
  const language = task.language(input);
  let step = 0;
  for (const r of await routesFor(ctx.db, f, task.needs.skill, task.needs.data)) {
    const call = prepare(task, input, r, language);
    if (!call) continue;
    // A reservation made ahead for this route covers the call when the request fits its bound.
    const ahead = ctx.ahead ? await ctx.ahead : null;
    ctx.ahead = undefined;
    const fits =
      ahead &&
      ahead.route.id === r.id &&
      estimateTokens(requestText(task.build(input, r)), language) <= ahead.inputTokens;
    if (ahead && !fits) await settle(ctx.db, ahead.callId, { state: 'released', error: 'unused', latencyMs: 0 });
    if (!fits) spend(ctx, call.reserved);
    const callId = fits
      ? ahead.callId
      : await reserve(ctx.db, f, {
          workspaceId: ctx.workspaceId,
          operationId: ctx.operationId,
          task: task.name,
          step,
          route: r,
          serviceTier: call.tier,
          language,
          reservedMicros: call.reserved,
        });
    onCall?.(callId, r);
    const started = Date.now();
    let text = '',
      saved = 0;
    try {
      const limit = deadline(ctx, call.tier);
      const stream = f.adapters[r.vendor]!.stream(r, call.request, limit);
      for (;;) {
        let next: IteratorResult<string, ModelResult>;
        try {
          next = await within(stream.next(), limit);
        } catch (error) {
          void stream.return(undefined as never).catch(() => undefined);
          throw error;
        }
        if (next.done) {
          const result = next.value;
          const value = result.stop === 'end' || result.stop === 'max_tokens' ? task.check(result, input) : null;
          await settle(ctx.db, callId, {
            state: 'settled',
            chargedMicros: cost(r, result.usage, call.tier),
            usage: result.usage,
            latencyMs: result.latencyMs,
            ttftMs: result.ttftMs,
            validation: value === null ? 'failed' : 'passed',
            ...(result.stop === 'end' ? {} : { error: `stop_${result.stop}` }),
          });
          trace({
            task: task.name,
            model: r.model,
            vendor: r.vendor,
            source: f.source.id,
            language,
            step,
            usage: result.usage,
            latencyMs: result.latencyMs,
            ttftMs: result.ttftMs,
            validation: value === null ? 'failed' : 'passed',
          });
          if (value === null) throw new AiFailed(502, 'ai_invalid', 'The reply did not pass its checks.');
          return { value, route: r, callId, result };
        }
        text += next.value;
        yield next.value;
        // Checkpoint about every 400 characters, so a lost connection keeps most of the reply.
        if (text.length - saved > 400) {
          saved = text.length;
          await checkpoint(ctx.db, callId, text);
        }
      }
    } catch (error) {
      if (error instanceof AiFailed) throw error;
      if (ctx.signal?.aborted) {
        // Stopped by the student. Usage is unknown, so the reservation stands as the charge.
        if (text) await checkpoint(ctx.db, callId, text);
        await settle(ctx.db, callId, { state: 'ambiguous', error: 'cancelled', latencyMs: Date.now() - started });
        trace({
          task: task.name,
          model: r.model,
          vendor: r.vendor,
          source: f.source.id,
          language,
          step,
          outcome: 'cancelled',
          chars: text.length,
        });
        throw new Cancelled(text, callId, r);
      }
      const e = error instanceof ProviderError ? error : new ProviderError(String(error), false);
      const certain = e.certain && !text;
      if (text) await checkpoint(ctx.db, callId, text);
      await settle(ctx.db, callId, {
        state: certain ? 'released' : 'ambiguous',
        error: e.message.slice(0, 300),
        latencyMs: Date.now() - started,
      });
      trace({
        task: task.name,
        model: r.model,
        vendor: r.vendor,
        source: f.source.id,
        language,
        step,
        outcome: certain ? 'refused' : 'uncertain',
        error: e.message.slice(0, 120),
      });
      if (!certain)
        throw new AiFailed(
          502,
          'ai_uncertain',
          'The reply stopped partway. What arrived is kept, and it was not sent again.',
        );
      markDown(r);
      step++;
      continue;
    }
  }
  await releaseAhead(ctx);
  throw unavailable(f, task.needs);
}

/**
 * Embed texts with the embedding route, metered like any call. Batches stay within vendor
 * limits. A student's question is student content, so it needs a route that keeps no prompts,
 * and without one the caller searches by text alone.
 */
export async function embed(
  env: BackendBindings,
  ctx: CallContext,
  texts: string[],
  purpose: 'document' | 'query',
  language: Language,
  data: DataClass,
) {
  const f = await funding(env, ctx);
  const [r] = await routesFor(ctx.db, f, 'embed', data);
  if (!r) return null;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50),
      chars = batch.reduce((n, t) => n + t.length, 0);
    const callId = await reserve(ctx.db, f, {
      workspaceId: ctx.workspaceId,
      operationId: ctx.operationId,
      jobId: ctx.jobId,
      task: `embed.${purpose}`,
      step: 0,
      route: r,
      serviceTier: 'standard',
      language,
      reservedMicros: reservation(r, 0, 0, 'standard', 0, chars),
    });
    const started = Date.now();
    try {
      const result = await f.adapters[r.vendor]!.embed(r, batch, purpose, deadline(ctx, 'standard'));
      const usage = {
        input: result.chars,
        cacheRead: 0,
        cacheWrite: 0,
        output: 0,
        reasoning: 0,
        audioSeconds: 0,
        images: 0,
      };
      await settle(ctx.db, callId, {
        state: 'settled',
        chargedMicros: cost(r, { ...usage, input: 0 }, 'standard', result.chars),
        usage,
        latencyMs: result.latencyMs,
        ttftMs: null,
        validation: result.vectors.length === batch.length ? 'passed' : 'failed',
      });
      if (result.vectors.length !== batch.length) return null;
      out.push(...result.vectors);
    } catch (error) {
      const e = error instanceof ProviderError ? error : new ProviderError(String(error), false);
      await settle(ctx.db, callId, {
        state: e.certain ? 'released' : 'ambiguous',
        error: e.message.slice(0, 300),
        latencyMs: Date.now() - started,
      });
      return null;
    }
  }
  return { vectors: out, model: r.model };
}
