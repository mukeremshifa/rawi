import type { Route } from '../catalog';
import { noUsage, type Usage } from '../types';
import { ProviderError, refused, type Adapter, type ModelRequest, type ModelResult } from './types';

/**
 * Every model through OpenRouter's OpenAI-compatible API. Each request is pinned to the route's
 * providers and restricted to endpoints that keep no prompts (`zdr`), and OpenRouter reports the
 * real cost, which the engine records in place of an estimate.
 */

const BASE = 'https://openrouter.ai/api/v1';

type Part =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl?: '1h' } }
  | { type: 'image_url'; image_url: { url: string } };
type Message = { role: 'system' | 'user' | 'assistant'; content: string | Part[] };
type OrUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
  cost?: number;
};
type Choice = {
  message?: {
    content?: string | null;
    tool_calls?: { function?: { name?: string; arguments?: string } }[];
  };
  delta?: { content?: string | null };
  finish_reason?: string | null;
};
type Chunk = { choices?: Choice[]; usage?: OrUsage; error?: { message?: string; code?: number | string } };

const base64 = (data: Uint8Array) => {
  let s = '';
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
};

/** A reply asked for as JSON, read leniently: some models wrap it in a code fence. */
export function parseJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/** The tool a structured answer is returned through, on routes that take tools rather than a schema. */
const TOOL = 'record_result';

/** Tokens a reasoning route may spend thinking, on top of the task's own output cap. */
const REASONING_ROOM = 2048;

function body(route: Route, req: ModelRequest, stream: boolean) {
  // The stable part goes first and, for models that cache explicitly, ends in a cache point.
  const cachePoint =
    route.cache === 'explicit' && req.cache !== 'none'
      ? { cache_control: { type: 'ephemeral' as const, ...(req.cache === 'long' ? { ttl: '1h' as const } : {}) } }
      : {};
  const instructions =
    req.schema && route.structured === 'tool'
      ? `${req.system}\nReturn your answer only by calling the ${TOOL} tool.`
      : req.system;
  const system: Part[] = [
    { type: 'text', text: instructions, ...(req.context ? {} : cachePoint) },
    ...(req.context ? [{ type: 'text' as const, text: req.context, ...cachePoint }] : []),
  ];
  const messages: Message[] = [
    { role: 'system', content: system },
    ...(req.history ?? []).map(h => ({ role: h.role, content: h.text })),
    {
      role: 'user',
      content: req.images?.length
        ? [
            ...req.images.map(i => ({
              type: 'image_url' as const,
              image_url: { url: `data:${i.mime};base64,${base64(i.data)}` },
            })),
            { type: 'text' as const, text: req.prompt },
          ]
        : req.prompt,
    },
  ];
  return {
    model: route.model,
    messages,
    max_tokens: req.maxOutput + (route.reasoning === 'low' ? REASONING_ROOM : 0),
    ...(route.temperature && req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(route.reasoning ? { reasoning: { effort: route.reasoning, exclude: true } } : {}),
    // Structured output as a forced tool call where the provider takes no response schema, as Bedrock does not.
    ...(req.schema && route.structured === 'tool'
      ? {
          tools: [
            {
              type: 'function',
              function: { name: TOOL, description: 'Return the result in this shape.', parameters: req.schema },
            },
          ],
          // Bedrock takes no forced choice for these models, so the instructions ask for the tool, and a
          // reply in plain text is still read as JSON and checked by the task.
          tool_choice: 'auto',
        }
      : req.schema
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'result', strict: false, schema: req.schema },
            },
          }
        : {}),
    provider: {
      only: route.providers,
      order: route.providers,
      zdr: true,
      data_collection: 'deny',
      // A provider that cannot honour the schema is skipped rather than asked to guess.
      require_parameters: !!req.schema,
    },
    usage: { include: true },
    ...(stream ? { stream: true } : {}),
  };
}

const usageOf = (u: OrUsage | undefined): Usage => {
  const cached = u?.prompt_tokens_details?.cached_tokens ?? 0,
    written = u?.prompt_tokens_details?.cache_write_tokens ?? 0,
    reasoning = u?.completion_tokens_details?.reasoning_tokens ?? 0;
  return {
    ...noUsage(),
    input: Math.max(0, (u?.prompt_tokens ?? 0) - cached - written),
    cacheRead: cached,
    cacheWrite: written,
    output: Math.max(0, (u?.completion_tokens ?? 0) - reasoning),
    reasoning,
  };
};
/** OpenRouter reports cost in dollars. The meter keeps micro-dollars. */
const microsOf = (u: OrUsage | undefined) => (typeof u?.cost === 'number' ? Math.ceil(u.cost * 1_000_000) : undefined);
const stopOf = (reason: string | null | undefined): ModelResult['stop'] =>
  reason === 'stop' || reason === 'tool_calls'
    ? 'end'
    : reason === 'length'
      ? 'max_tokens'
      : reason === 'content_filter'
        ? 'refusal'
        : 'other';

export function openRouterAdapter(apiKey: string): Adapter {
  async function send(path: string, payload: unknown, signal?: AbortSignal) {
    let response: Response;
    try {
      response = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (error) {
      throw new ProviderError(`openrouter_unreachable: ${String(error).slice(0, 120)}`, false);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // 402 is out of credits and 503 no provider meets the routing rules: both refuse before any work.
      const certain = refused(response.status) || response.status === 402 || response.status === 503;
      throw new ProviderError(`openrouter_${response.status}: ${detail.slice(0, 200)}`, certain, response.status);
    }
    return response;
  }

  return {
    async generate(route, req, signal) {
      const started = Date.now();
      const j = (await (await send('/chat/completions', body(route, req, false), signal)).json()) as Chunk;
      if (j.error) throw new ProviderError(`openrouter_error: ${String(j.error.message).slice(0, 200)}`, false);
      const message = j.choices?.[0]?.message;
      const args = message?.tool_calls?.find(c => c.function?.name === TOOL)?.function?.arguments;
      const text = args ?? message?.content ?? '';
      return {
        text,
        ...(req.schema ? { json: parseJson(text) } : {}),
        usage: usageOf(j.usage),
        costMicros: microsOf(j.usage),
        stop: stopOf(j.choices?.[0]?.finish_reason),
        latencyMs: Date.now() - started,
        ttftMs: null,
      };
    },
    async *stream(route, req, signal) {
      const started = Date.now();
      const response = await send('/chat/completions', body(route, req, true), signal);
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '',
        text = '',
        ttft: number | null = null,
        usage: OrUsage | undefined,
        stop: ModelResult['stop'] = 'other';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          buffer += value ?? '';
          let at: number;
          while ((at = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, at).trim();
            buffer = buffer.slice(at + 1);
            // Lines starting with a colon are keep-alive comments.
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;
            const chunk = JSON.parse(data) as Chunk;
            if (chunk.error) throw new Error(String(chunk.error.message ?? 'provider_error'));
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              ttft ??= Date.now() - started;
              text += delta;
              yield delta;
            }
            if (chunk.usage) usage = chunk.usage;
            const reason = chunk.choices?.[0]?.finish_reason;
            if (reason) stop = stopOf(reason);
          }
          if (done) break;
        }
      } catch (error) {
        throw new ProviderError(`openrouter_stream_broken: ${String(error).slice(0, 120)}`, false);
      } finally {
        reader.cancel().catch(() => undefined);
      }
      return {
        text,
        usage: usageOf(usage),
        costMicros: microsOf(usage),
        stop,
        latencyMs: Date.now() - started,
        ttftMs: ttft,
      };
    },
    async embed(route, texts, _purpose, signal) {
      const started = Date.now();
      const j = (await (
        await send(
          '/embeddings',
          {
            model: route.model,
            input: texts,
            ...(route.dimensions ? { dimensions: route.dimensions } : {}),
            provider: { only: route.providers, zdr: true, data_collection: 'deny' },
          },
          signal,
        )
      ).json()) as { data?: { embedding: number[]; index: number }[]; usage?: OrUsage };
      const vectors = [...(j.data ?? [])].sort((a, b) => a.index - b.index).map(d => d.embedding);
      return {
        vectors,
        tokens: j.usage?.prompt_tokens ?? 0,
        costMicros: microsOf(j.usage),
        latencyMs: Date.now() - started,
      };
    },
  };
}
