import type { VertexUsage } from './vertex.ts';

/**
 * Reserve-then-settle accounting, wrapping **every** live call.
 *
 * Carried from the old `ai-budget.ts` and retargeted to Vertex pricing. The
 * instinct that made it worth keeping is the `ambiguous` state:
 *
 * > A call whose outcome is unknown is recorded `ambiguous`, never assumed
 * > free. (Invariant 10.)
 *
 * A request that times out or whose response never arrives may still have been
 * billed. Treating that as zero is the cheap assumption and it is the one that
 * silently overruns a cap. Treating it as the full reservation is the honest
 * one, and it is what `settle(..., 'ambiguous')` does.
 *
 * ── Fail closed ───────────────────────────────────────────────────────────
 *
 * Paid AI is unavailable unless a provider credential **and both caps** are
 * present. Not "defaults to something sensible" — absent configuration means
 * the app runs on fixtures and says so. A missing cap is not a licence to
 * spend; it is a sign nobody has decided what this may cost.
 */

export type ReservationStatus = 'reserved' | 'settled' | 'ambiguous';

export interface AiReservation {
  readonly id: string;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly month: string;
  readonly reservedMicrosUsd: number;
  readonly actualMicrosUsd: number | null;
  readonly status: ReservationStatus;
  readonly response?: unknown;
}

export type ReserveOutcome =
  | { readonly ok: true; readonly reservation: AiReservation; readonly replay: boolean }
  | { readonly ok: false; readonly reason: 'global_cap' | 'user_cap' | 'in_progress' };

export interface VertexPricing {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

/** Micros of USD, so money is an integer everywhere it is compared. */
export function costMicrosUsd(usage: VertexUsage, pricing: VertexPricing): number {
  const input = (usage.inputTokens / 1_000_000) * pricing.inputUsdPerMillion;
  const output = (usage.outputTokens / 1_000_000) * pricing.outputUsdPerMillion;
  // Rounded up. A fractional micro rounded down, a million times, is how a
  // ledger drifts under the true spend in the direction that costs the owner.
  return Math.ceil((input + output) * 1_000_000);
}

/**
 * What to reserve before a call whose token count is not yet known.
 *
 * Deliberately pessimistic: a reservation that turns out too large is refunded
 * at settle time, whereas one that turns out too small has already let a call
 * through a cap it should have stopped.
 */
export function estimateReservationMicrosUsd(
  promptCharacters: number,
  maxOutputTokens: number,
  pricing: VertexPricing,
): number {
  // ~4 characters per token is the usual rule of thumb; rounded against us.
  const estimatedInput = Math.ceil(promptCharacters / 3);
  return costMicrosUsd(
    { inputTokens: estimatedInput, outputTokens: maxOutputTokens },
    pricing,
  );
}

export function currentMonth(now: Date): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

/** The ledger interface. Production is a SQL function; tests use the class below. */
export interface AiBudget {
  reserve(input: {
    userId: string;
    idempotencyKey: string;
    month: string;
    amountMicrosUsd: number;
    globalCapMicrosUsd: number;
    userCapMicrosUsd: number;
  }): Promise<ReserveOutcome>;
  settle(input: {
    userId: string;
    idempotencyKey: string;
    status: 'settled' | 'ambiguous';
    actualMicrosUsd: number | null;
    response?: unknown;
  }): Promise<void>;
}

/**
 * Deterministic in-isolate ledger for fixture mode and tests.
 *
 * Production uses the `reserve_ai_usage` SQL function, because the cap check
 * and the insert have to be one atomic step — two Workers reserving
 * concurrently against the same cap is not a hypothetical.
 */
export class MemoryAiBudget implements AiBudget {
  private readonly reservations = new Map<string, AiReservation>();

  async reserve(input: {
    userId: string;
    idempotencyKey: string;
    month: string;
    amountMicrosUsd: number;
    globalCapMicrosUsd: number;
    userCapMicrosUsd: number;
  }): Promise<ReserveOutcome> {
    const key = `${input.userId}:${input.idempotencyKey}`;
    const existing = this.reservations.get(key);
    if (existing) {
      if (existing.status === 'settled' && existing.response !== undefined) {
        return { ok: true, reservation: existing, replay: true };
      }
      // A second call on a key still in flight is a retry racing itself. Let
      // the first one finish rather than double-charging for one intent.
      return { ok: false, reason: 'in_progress' };
    }

    const monthly = [...this.reservations.values()].filter(
      (item) => item.month === input.month,
    );
    // Charged against the *reservation*, not the settled amount: an ambiguous
    // call has to keep occupying its space in the cap.
    const spend = (item: AiReservation) => item.actualMicrosUsd ?? item.reservedMicrosUsd;
    const globalUsed = monthly.reduce((sum, item) => sum + spend(item), 0);
    const userUsed = monthly
      .filter((item) => item.userId === input.userId)
      .reduce((sum, item) => sum + spend(item), 0);

    if (globalUsed + input.amountMicrosUsd > input.globalCapMicrosUsd) {
      return { ok: false, reason: 'global_cap' };
    }
    if (userUsed + input.amountMicrosUsd > input.userCapMicrosUsd) {
      return { ok: false, reason: 'user_cap' };
    }

    const reservation: AiReservation = {
      id: crypto.randomUUID(),
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      month: input.month,
      reservedMicrosUsd: input.amountMicrosUsd,
      actualMicrosUsd: null,
      status: 'reserved',
    };
    this.reservations.set(key, reservation);
    return { ok: true, reservation, replay: false };
  }

  async settle(input: {
    userId: string;
    idempotencyKey: string;
    status: 'settled' | 'ambiguous';
    actualMicrosUsd: number | null;
    response?: unknown;
  }): Promise<void> {
    const key = `${input.userId}:${input.idempotencyKey}`;
    const existing = this.reservations.get(key);
    if (!existing) throw new Error('reservation_not_found');
    this.reservations.set(key, {
      ...existing,
      status: input.status,
      // An ambiguous call keeps its full reservation. Invariant 10.
      actualMicrosUsd:
        input.status === 'ambiguous'
          ? existing.reservedMicrosUsd
          : (input.actualMicrosUsd ?? existing.reservedMicrosUsd),
      response: input.response,
    });
  }

  spentMicrosUsd(userId: string, month: string): number {
    return [...this.reservations.values()]
      .filter((item) => item.userId === userId && item.month === month)
      .reduce((sum, item) => sum + (item.actualMicrosUsd ?? item.reservedMicrosUsd), 0);
  }

  ambiguousCount(userId: string, month: string): number {
    return [...this.reservations.values()].filter(
      (item) => item.userId === userId && item.month === month && item.status === 'ambiguous',
    ).length;
  }

  clear(): void {
    this.reservations.clear();
  }
}
