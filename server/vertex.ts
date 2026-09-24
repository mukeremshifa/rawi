import {
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentConfig,
  type GenerateContentResponse,
} from '@google/genai';

import type { AiErrorCode, AiUsage } from '../src/shared/ai.ts';
import { config, missingConfiguration, modelFor, type Task } from './config.ts';
import { BudgetError, cost, priceFor, release, reserve, settle } from './ledger.ts';

/**
 * The one place that talks to Vertex AI.
 *
 * The SDK is configured for Vertex explicitly, with the project and location
 * from the server environment, and authenticates with Application Default
 * Credentials. No API key is read or accepted. The SDK's own retry loop is
 * switched off, because it retries up to five times by default and each retry
 * is billable. Retries happen here instead, bounded by `RAWI_MAX_RETRIES`, and
 * each one reserves budget of its own before it is sent.
 */

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const missing = missingConfiguration();
  if (missing.length > 0) {
    throw new AiError('not-configured', missing.join(' '), 503);
  }
  client ??= new GoogleGenAI({
    vertexai: true,
    project: config.project!,
    location: config.location,
    httpOptions: { retryOptions: { attempts: 1 } },
  });
  return client;
}

/* ── Concurrency ────────────────────────────────────────────────────────── */

let inFlight = 0;

function acquire() {
  if (inFlight >= config.maxConcurrent) {
    throw new AiError(
      'busy',
      'Another AI request is still running. Wait for it to finish, then try again.',
      429,
    );
  }
  inFlight += 1;
  let released = false;
  return () => {
    if (!released) inFlight -= 1;
    released = true;
  };
}

/* ── Request shaping ────────────────────────────────────────────────────── */

/** A deliberately high estimate: about three characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

function thinkingFor(tier: 'main' | 'lite'): GenerateContentConfig['thinkingConfig'] {
  const level = (tier === 'main' ? config.thinkingLevel : config.liteThinkingLevel)
    .trim()
    .toUpperCase();
  if (!level) return undefined;
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(level)) {
    throw new AiError(
      'not-configured',
      `Thinking level "${level}" is not supported here. Use LOW, MEDIUM or HIGH.`,
      503,
    );
  }
  return { thinkingLevel: level as ThinkingLevel };
}

export interface CallSpec {
  task: Task;
  system: string;
  prompt: string;
  json?: { schema: unknown };
  signal: AbortSignal;
}

interface Prepared {
  model: string;
  tier: 'main' | 'lite';
  params: {
    model: string;
    contents: string;
    config: GenerateContentConfig;
  };
  reservedUsd: number;
}

function prepare(spec: CallSpec): Prepared {
  const { model, tier } = modelFor(spec.task);
  const inputTokens = estimateTokens(spec.system) + estimateTokens(spec.prompt);
  if (inputTokens > config.maxInputTokens) {
    throw new AiError(
      'too-large',
      `This request is about ${inputTokens} tokens, above the ${config.maxInputTokens} token limit. Select fewer materials or a shorter passage.`,
      413,
    );
  }
  const maxOutputTokens = config.maxOutputTokens[spec.task];
  const thinkingConfig = thinkingFor(tier);
  return {
    model,
    tier,
    reservedUsd: cost(priceFor(tier), inputTokens, maxOutputTokens),
    params: {
      model,
      contents: spec.prompt,
      config: {
        systemInstruction: spec.system,
        maxOutputTokens,
        abortSignal: spec.signal,
        ...(thinkingConfig ? { thinkingConfig } : {}),
        ...(spec.json
          ? { responseMimeType: 'application/json', responseJsonSchema: spec.json.schema }
          : {}),
      },
    },
  };
}

function usageOf(
  response: GenerateContentResponse | undefined,
  prepared: Prepared,
): (AiUsage & { usd: number }) | null {
  const meta = response?.usageMetadata;
  if (!meta || meta.promptTokenCount === undefined) return null;
  const inputTokens = meta.promptTokenCount ?? 0;
  const outputTokens = meta.candidatesTokenCount ?? 0;
  const thinkingTokens = meta.thoughtsTokenCount ?? 0;
  const usd = cost(priceFor(prepared.tier), inputTokens, outputTokens + thinkingTokens);
  return {
    model: response?.modelVersion || prepared.model,
    inputTokens,
    outputTokens,
    thinkingTokens,
    estimatedUsd: usd,
    usd,
  };
}

/** Maps an SDK or network failure onto something the student can act on. */
function classify(error: unknown, signal: AbortSignal): AiError {
  if (error instanceof AiError) return error;
  if (signal.aborted) return new AiError('cancelled', 'The request was cancelled.', 499);
  const raw = error as { status?: number; message?: string; name?: string };
  const message = raw?.message ?? String(error);
  const status = typeof raw?.status === 'number' ? raw.status : undefined;

  if (
    /default credentials|could not load the default credentials|invalid_grant|reauth|unable to impersonate/i.test(
      message,
    )
  ) {
    return new AiError(
      'auth',
      'Application Default Credentials were not found or have expired. Run "gcloud auth application-default login" and restart npm run dev.',
      503,
    );
  }
  if (status === 401 || status === 403) {
    return new AiError(
      'auth',
      `Vertex AI refused the request (${status}). Check that the Vertex AI API is enabled for ${config.project}, that billing is linked, and that your account has the Vertex AI User role. ${message.slice(0, 300)}`,
      503,
    );
  }
  if (status === 404) {
    return new AiError(
      'upstream',
      `The model was not found in ${config.location} for this project. Check RAWI_MODEL and GOOGLE_CLOUD_LOCATION. ${message.slice(0, 300)}`,
      502,
    );
  }
  if (status === 429) {
    return new AiError('upstream', 'Vertex AI is rate limiting this project. Try again shortly.', 503);
  }
  return new AiError('upstream', `Vertex AI request failed. ${message.slice(0, 300)}`, 502);
}

function retryable(error: AiError, status?: number) {
  return error.code === 'upstream' && (status === undefined || status === 429 || status >= 500);
}

async function withBudget<T>(
  spec: CallSpec,
  run: (prepared: Prepared) => Promise<{ value: T; response: GenerateContentResponse | undefined }>,
  canRetry: () => boolean = () => true,
): Promise<{ value: T; usage: AiUsage }> {
  /* Fails fast, before any reservation, when the project is not set. */
  getClient();
  const releaseSlot = acquire();
  try {
    let attempt = 0;
    for (;;) {
      const prepared = prepare(spec);
      let entry;
      try {
        entry = reserve(spec.task, prepared.model, prepared.reservedUsd);
      } catch (error) {
        if (error instanceof BudgetError) throw new AiError(error.code, error.message, 402);
        throw error;
      }

      try {
        const { value, response } = await run(prepared);
        const usage = usageOf(response, prepared);
        settle(entry, usage);
        return {
          value,
          usage: usage ?? {
            model: response?.modelVersion || prepared.model,
            inputTokens: 0,
            outputTokens: 0,
            thinkingTokens: 0,
            estimatedUsd: prepared.reservedUsd,
          },
        };
      } catch (error) {
        const failure = classify(error, spec.signal);
        const status = (error as { status?: number })?.status;
        /* Auth and configuration failures happen before anything is billed.
           Everything else is charged at the reservation, conservatively. */
        if (failure.code === 'auth' || failure.code === 'not-configured') release(entry);
        else settle(entry, null);

        if (
          attempt < config.maxRetries &&
          retryable(failure, status) &&
          !spec.signal.aborted &&
          canRetry()
        ) {
          attempt += 1;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw failure;
      }
    }
  } finally {
    releaseSlot();
  }
}

export async function generateJson(spec: CallSpec & { json: { schema: unknown } }) {
  return withBudget(spec, async (prepared) => {
    const response = await getClient().models.generateContent(prepared.params);
    return { value: response.text ?? '', response };
  });
}

/**
 * Streams text, calling `onText` per chunk. Only the first attempt streams:
 * once text has reached the student, a retry would repeat it, so a failure
 * after the first chunk is reported rather than retried.
 */
export async function streamText(spec: CallSpec, onText: (text: string) => void) {
  let sent = false;
  return withBudget(
    spec,
    async (prepared) => {
      const stream = await getClient().models.generateContentStream(prepared.params);
      let text = '';
      let last: GenerateContentResponse | undefined;
      for await (const chunk of stream) {
        last = chunk;
        const piece = chunk.text ?? '';
        if (piece) {
          sent = true;
          text += piece;
          onText(piece);
        }
      }
      return { value: text, response: last };
    },
    () => !sent,
  );
}
