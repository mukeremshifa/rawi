import { ApiClientError } from '../../shared/contract.ts';
import { ERROR_MESSAGE } from '../../shared/messages.ts';
import type { AiSettings } from '../env.ts';
import type { Db } from '../db/client.ts';
import { PostgresAiBudget } from '../db/ai.ts';
import type { SessionContext } from '../learning/session.ts';
import { assessmentResponseSchema, askResponseSchema } from '../assessment/schema.ts';
import {
  costMicrosUsd,
  currentMonth,
  estimateReservationMicrosUsd,
  type AiBudget,
} from './budget.ts';
import {
  ASK_SYSTEM_INSTRUCTION,
  ASSESSMENT_SYSTEM_INSTRUCTION,
  PROMPT_VERSION,
  type AskPayload,
  type AssessmentPayload,
} from './prompts.ts';
import { generateStructured, ProviderError, type VertexConfig } from './vertex.ts';

/**
 * Live AI, with the ledger wrapped around it.
 *
 * ── The order, and why it is this order ───────────────────────────────────
 *
 *   1. **Reserve** before the call. A cap checked after the fact is not a cap.
 *   2. **Call**, with a timeout.
 *   3. **Settle** with the real token counts — or, if the outcome is unknown,
 *      **settle `ambiguous`**, which keeps the full reservation charged.
 *
 * Step 3's failure branch is the one that matters. A request that times out may
 * still have been billed; recording it as free is the cheap assumption and the
 * one that silently overruns the cap. Invariant 10: never assume a call whose
 * outcome you do not know cost nothing.
 *
 * The reservation is released only on a failure that is *definitely* not
 * chargeable — a rejected credential, a missing model — because those fail
 * before the model runs.
 */

function vertexConfig(settings: AiSettings): VertexConfig {
  return {
    project: settings.project,
    location: settings.location,
    model: settings.model,
    clientEmail: settings.clientEmail,
    privateKey: settings.privateKey,
    timeoutMs: settings.timeoutMs,
  };
}

/** Provider failures, mapped onto the contract's closed union. */
function toApiError(error: unknown): ApiClientError {
  if (error instanceof ProviderError) {
    switch (error.code) {
      case 'PROVIDER_KEY_INVALID':
      case 'PROVIDER_KEY_MISSING':
      case 'MODEL_UNAVAILABLE':
        return new ApiClientError('provider_error', error.message);
      case 'PROVIDER_RATE_LIMIT':
        return new ApiClientError('rate_limited', error.message);
      case 'PROVIDER_TIMEOUT':
        return new ApiClientError('provider_error', error.message);
      case 'PROVIDER_REFUSED':
        return new ApiClientError('refused', error.message);
      case 'PROVIDER_TRUNCATED':
        return new ApiClientError('input_too_long', error.message);
      default:
        return new ApiClientError('provider_error', error.message);
    }
  }
  if (error instanceof ApiClientError) return error;
  return new ApiClientError('provider_error', ERROR_MESSAGE.provider_error);
}

/**
 * Definitely-not-chargeable failures.
 *
 * Everything else is treated as possibly billed. The asymmetry is deliberate:
 * the cost of over-reserving is a slightly early cap, and the cost of
 * under-reserving is spending money nobody authorised.
 */
function definitelyFree(error: unknown): boolean {
  return (
    error instanceof ProviderError &&
    (error.code === 'PROVIDER_KEY_INVALID' ||
      error.code === 'PROVIDER_KEY_MISSING' ||
      error.code === 'MODEL_UNAVAILABLE')
  );
}

async function metered<T>(input: {
  budget: AiBudget;
  userId: string;
  idempotencyKey: string;
  settings: AiSettings;
  promptCharacters: number;
  maxOutputTokens: number;
  now: Date;
  call: () => Promise<{ value: unknown; usage: { inputTokens: number; outputTokens: number } }>;
  parse: (value: unknown) => T;
}): Promise<T> {
  const month = currentMonth(input.now);
  const reservation = estimateReservationMicrosUsd(
    input.promptCharacters,
    input.maxOutputTokens,
    input.settings.pricing,
  );

  const reserved = await input.budget.reserve({
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    month,
    amountMicrosUsd: reservation,
    globalCapMicrosUsd: input.settings.monthlyCapMicrosUsd ?? 0,
    userCapMicrosUsd: input.settings.userCapMicrosUsd ?? 0,
  });

  if (!reserved.ok) {
    if (reserved.reason === 'in_progress') {
      throw new ApiClientError(
        'rate_limited',
        'That request is already running. Your work is saved; wait a moment.',
      );
    }
    throw new ApiClientError('quota_exceeded', ERROR_MESSAGE.quota_exceeded);
  }

  if (reserved.replay && reserved.reservation.response !== undefined) {
    // Idempotent: the same key returns the same answer without paying twice.
    return input.parse(reserved.reservation.response);
  }

  try {
    const result = await input.call();
    await input.budget.settle({
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      status: 'settled',
      actualMicrosUsd: costMicrosUsd(result.usage, input.settings.pricing),
      response: result.value,
    });
    return input.parse(result.value);
  } catch (error) {
    await input.budget.settle({
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      status: definitelyFree(error) ? 'settled' : 'ambiguous',
      actualMicrosUsd: definitelyFree(error) ? 0 : null,
    });
    throw toApiError(error);
  }
}

/** The assessor a live session is given. */
export function liveAssessor(input: {
  settings: AiSettings;
  db: Db;
  userId: string;
}): SessionContext['assess'] {
  const budget = new PostgresAiBudget(input.db, {
    provider: 'vertex',
    model: input.settings.model,
    promptVersion: PROMPT_VERSION,
    contentVersion: 'rawi-v1',
  });

  return async ({ task, response, content, supportsInForce }) => {
    const payload: AssessmentPayload = {
      item_id: task.id,
      item_version: task.version,
      prompt: task.prompt,
      claims: content.claims
        .filter((claim) => task.required_claim_ids.includes(claim.id))
        .map((claim) => ({
          id: claim.id,
          meaning: claim.meaning,
          acceptable_examples: claim.acceptable_examples,
          contradiction_examples: claim.contradiction_examples,
        })),
      supports_in_force: supportsInForce.map((support) => ({
        id: support.id,
        type: support.type,
        text: support.text,
      })),
      clarification_item_ids: task.clarification_task_ids,
      learner_response: response,
    };

    const serialised = JSON.stringify(payload);

    return metered({
      budget,
      userId: input.userId,
      // Keyed on the response, so a retry of the same submission is the same
      // billable intent rather than a second one.
      idempotencyKey: `assess:${task.id}:${await digest(response)}`,
      settings: input.settings,
      promptCharacters: serialised.length,
      maxOutputTokens: 1800,
      now: new Date(),
      call: () =>
        generateStructured({
          config: vertexConfig(input.settings),
          systemInstruction: ASSESSMENT_SYSTEM_INSTRUCTION,
          payload,
          responseSchema: assessmentResponseSchema,
          maxOutputTokens: 1800,
        }),
      // Returned unvalidated on purpose: `validateAssessment` in the session
      // service is the single place model output is held to invariant 11, and
      // a second parse here would be a second place to get it wrong.
      parse: (value) => value as never,
    });
  };
}

/** The grounded-answer call. */
export function liveAsk(input: {
  settings: AiSettings;
  db: Db;
  userId: string;
}): (payload: AskPayload) => Promise<unknown> {
  const budget = new PostgresAiBudget(input.db, {
    provider: 'vertex',
    model: input.settings.model,
    promptVersion: PROMPT_VERSION,
    contentVersion: 'rawi-v1',
  });

  return async (payload) => {
    const serialised = JSON.stringify(payload);
    return metered({
      budget,
      userId: input.userId,
      idempotencyKey: `ask:${await digest(serialised)}`,
      settings: input.settings,
      promptCharacters: serialised.length,
      maxOutputTokens: 900,
      now: new Date(),
      call: () =>
        generateStructured({
          config: vertexConfig(input.settings),
          systemInstruction: ASK_SYSTEM_INSTRUCTION,
          payload,
          responseSchema: askResponseSchema,
          maxOutputTokens: 900,
        }),
      parse: (value) => value,
    });
  };
}

/** Short stable hash, for idempotency keys. */
async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)]
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
