import { getAccessToken, GoogleAuthError } from './google-auth.ts';

/**
 * A dependency-free Vertex AI client.
 *
 * Everything that made Concept Bridge's `gemini.ts` good is transport
 * independent, and all of it is preserved here: the system instruction,
 * structured output, `temperature: 0`, an abort-signal timeout, the error
 * taxonomy, and validating the parsed result before trusting any of it. Only
 * the transport is rewritten — see `google-auth.ts` for why the SDK could not
 * come along.
 *
 * ── The one difference that will bite you ─────────────────────────────────
 *
 * The SDK exposed `responseJsonSchema`, which takes a standard JSON Schema.
 * The REST surface takes **`responseSchema`**, in an **OpenAPI 3.0 subset**:
 * type names are uppercase, nullability is `nullable: true` rather than an
 * `anyOf` with a null branch, and `additionalProperties` is rejected outright.
 * Those schemas live in `assessment/schema.ts`, written in that dialect, and
 * the Zod schema beside each one is what actually enforces the shape. **The
 * response schema only steers the model**; invariant 11 does not accept steering
 * as evidence.
 */

export type ProviderErrorCode =
  | 'PROVIDER_KEY_INVALID'
  | 'PROVIDER_KEY_MISSING'
  | 'MODEL_UNAVAILABLE'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_INVALID'
  | 'PROVIDER_REFUSED'
  | 'PROVIDER_TRUNCATED'
  | 'PROVIDER_UNAVAILABLE';

/**
 * Ported from the donor verbatim in structure.
 *
 * **Every message says the learner's work is saved, and it always is** — the
 * response is persisted before the model is ever called, so this is a promise
 * the code keeps rather than a reassurance it offers.
 */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface VertexConfig {
  project: string;
  /** `global`, or a region. Both hosts are handled below. */
  location: string;
  model: string;
  clientEmail: string;
  privateKey: string;
  timeoutMs: number;
}

export interface VertexUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface VertexResult<T> {
  value: T;
  usage: VertexUsage;
  latencyMs: number;
}

/**
 * `global` and regional Vertex endpoints differ in **host as well as path**,
 * which is the detail that turns a location change into a 404 nobody expects.
 */
export function vertexEndpoint(config: VertexConfig): string {
  const host =
    config.location === 'global'
      ? 'aiplatform.googleapis.com'
      : `${config.location}-aiplatform.googleapis.com`;
  return (
    `https://${host}/v1/projects/${config.project}/locations/${config.location}` +
    `/publishers/google/models/${config.model}:generateContent`
  );
}

interface VertexResponseBody {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

function providerErrorForStatus(status: number, model: string, detail: string): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError(
      'PROVIDER_KEY_INVALID',
      false,
      'Vertex rejected the service account. Check GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY, and that the account has roles/aiplatform.user. Your work is saved.',
    );
  }
  if (status === 404) {
    return new ProviderError(
      'MODEL_UNAVAILABLE',
      false,
      `The configured model is unavailable in this location. Check VERTEX_MODEL (${model}) and VERTEX_LOCATION. Your work is saved.`,
    );
  }
  if (status === 429) {
    return new ProviderError(
      'PROVIDER_RATE_LIMIT',
      true,
      'Vertex is rate limiting right now. Your work is saved; retry shortly.',
    );
  }
  return new ProviderError(
    'PROVIDER_UNAVAILABLE',
    true,
    `Vertex could not complete the request (${status}). Your work is saved; retry. ${detail.slice(0, 160)}`,
  );
}

/**
 * One structured-output call.
 *
 * The caller supplies the response schema in the OpenAPI dialect and validates
 * the parsed JSON itself — this function does not know what shape it fetched,
 * on purpose. Its job is the transport and the taxonomy.
 */
export async function generateStructured(input: {
  config: VertexConfig;
  systemInstruction: string;
  payload: unknown;
  responseSchema: unknown;
  maxOutputTokens?: number;
  fetcher?: typeof fetch;
}): Promise<VertexResult<unknown>> {
  const { config } = input;
  const fetcher = input.fetcher ?? fetch;

  if (!config.project) {
    throw new ProviderError(
      'PROVIDER_KEY_MISSING',
      false,
      'GOOGLE_CLOUD_PROJECT is not set, so live AI is unavailable.',
    );
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const token = await getAccessToken({
      clientEmail: config.clientEmail,
      privateKey: config.privateKey,
    });

    const response = await fetcher(vertexEndpoint(config), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(input.payload) }] }],
        systemInstruction: { parts: [{ text: input.systemInstruction }] },
        generationConfig: {
          // Assessment is not a creative task. Two runs over the same response
          // disagreeing would make the evidence log a record of dice rolls.
          temperature: 0,
          maxOutputTokens: input.maxOutputTokens ?? 1800,
          responseMimeType: 'application/json',
          responseSchema: input.responseSchema,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw providerErrorForStatus(response.status, config.model, detail);
    }

    const body = (await response.json()) as VertexResponseBody;
    const candidate = body.candidates?.[0];

    // Checked *before* parsing, deliberately. A MAX_TOKENS body is valid JSON
    // right up until it is not, and parsing a truncated assessment produces a
    // plausible object with claims silently missing — which the ID-set check
    // would then reject as a model fault rather than as a budget fault.
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new ProviderError(
        'PROVIDER_TRUNCATED',
        false,
        'The model ran out of output budget before finishing. Your work is saved.',
      );
    }
    if (candidate?.finishReason === 'SAFETY') {
      throw new ProviderError(
        'PROVIDER_REFUSED',
        false,
        'The model declined to assess this response. Your work is saved; retrying will not change it.',
      );
    }

    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) {
      throw new ProviderError(
        'PROVIDER_INVALID',
        true,
        'Vertex returned no content. Your work is saved; retry.',
      );
    }

    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new ProviderError(
        'PROVIDER_INVALID',
        true,
        'Vertex returned malformed JSON. Your work is saved; retry.',
      );
    }

    return {
      value,
      usage: {
        inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      },
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof GoogleAuthError) {
      throw new ProviderError('PROVIDER_KEY_INVALID', false, `${error.message} Your work is saved.`);
    }
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new ProviderError(
        'PROVIDER_TIMEOUT',
        true,
        'The model took too long. Your work is saved; retry.',
      );
    }
    throw new ProviderError(
      'PROVIDER_UNAVAILABLE',
      true,
      'Vertex could not be reached. Your work is saved; retry.',
    );
  } finally {
    clearTimeout(timer);
  }
}
