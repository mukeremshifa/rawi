import type { Route } from '../catalog';
import type { ServiceTier, Usage } from '../types';

/**
 * A request in the order that caches best: stable instructions, then stable course material,
 * then history, then the new message. Adapters map it to each vendor without reordering.
 */
export interface ModelRequest {
  system: string;
  /** Course material or another stable prefix. A cache point goes after it when the route takes one. */
  context?: string;
  history?: { role: 'user' | 'assistant'; text: string }[];
  prompt: string;
  images?: { mime: string; data: Uint8Array }[];
  /** JSON Schema for structured output. Without it the reply is text. */
  schema?: Record<string, unknown>;
  maxOutput: number;
  temperature?: number;
  /** `long` asks for the one-hour lifetime where a route offers it. */
  cache: 'none' | 'short' | 'long';
  serviceTier: ServiceTier;
}

export interface ModelResult {
  text: string;
  /** Parsed structured output, when a schema was given and the reply parsed. */
  json?: unknown;
  usage: Usage;
  stop: 'end' | 'max_tokens' | 'refusal' | 'other';
  latencyMs: number;
  ttftMs: number | null;
}

/**
 * `certain` means the vendor refused before generating, so nothing was charged and another route
 * may be tried. Anything else may have generated tokens, so it stays charged and is not retried.
 */
export class ProviderError extends Error {
  constructor(message: string, readonly certain: boolean, readonly status?: number) { super(message); }
}

export interface Adapter {
  generate(route: Route, request: ModelRequest, signal?: AbortSignal): Promise<ModelResult>;
  /** Yields text as it arrives and returns the final result. */
  stream(route: Route, request: ModelRequest, signal?: AbortSignal): AsyncGenerator<string, ModelResult>;
  embed(route: Route, texts: string[], purpose: 'document' | 'query', signal?: AbortSignal): Promise<{ vectors: number[][]; chars: number; latencyMs: number }>;
}

/** Statuses that mean the request was refused before any generation. */
export const refused = (status: number) => status === 400 || status === 401 || status === 403 || status === 404 || status === 413 || status === 422 || status === 429;
