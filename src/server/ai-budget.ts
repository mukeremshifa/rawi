export type ReservationStatus = 'reserved' | 'settled' | 'ambiguous';

export interface AiReservation {
  readonly id: string;
  readonly learnerId: string;
  readonly idempotencyKey: string;
  readonly month: string;
  readonly reservedMicrosUsd: number;
  readonly status: ReservationStatus;
  readonly response?: unknown;
}

export type ReserveOutcome =
  | { readonly ok: true; readonly reservation: AiReservation; readonly replay: boolean }
  | { readonly ok: false; readonly reason: 'global_cap' | 'learner_cap' | 'in_progress' };

/** Deterministic in-isolate ledger for fixture tests. Production uses a SQL RPC. */
export class MemoryAiBudget {
  private readonly reservations = new Map<string, AiReservation>();

  reserve(input: {
    learnerId: string;
    idempotencyKey: string;
    month: string;
    amountMicrosUsd: number;
    globalCapMicrosUsd: number;
    learnerCapMicrosUsd: number;
  }): ReserveOutcome {
    const key = `${input.learnerId}:${input.idempotencyKey}`;
    const existing = this.reservations.get(key);
    if (existing) {
      if (existing.status === 'settled' && existing.response !== undefined) {
        return { ok: true, reservation: existing, replay: true };
      }
      return { ok: false, reason: 'in_progress' };
    }

    const monthly = [...this.reservations.values()].filter(
      (item) => item.month === input.month,
    );
    const globalUsed = monthly.reduce((sum, item) => sum + item.reservedMicrosUsd, 0);
    const learnerUsed = monthly
      .filter((item) => item.learnerId === input.learnerId)
      .reduce((sum, item) => sum + item.reservedMicrosUsd, 0);
    if (globalUsed + input.amountMicrosUsd > input.globalCapMicrosUsd) {
      return { ok: false, reason: 'global_cap' };
    }
    if (learnerUsed + input.amountMicrosUsd > input.learnerCapMicrosUsd) {
      return { ok: false, reason: 'learner_cap' };
    }

    const reservation: AiReservation = {
      id: crypto.randomUUID(),
      learnerId: input.learnerId,
      idempotencyKey: input.idempotencyKey,
      month: input.month,
      reservedMicrosUsd: input.amountMicrosUsd,
      status: 'reserved',
    };
    this.reservations.set(key, reservation);
    return { ok: true, reservation, replay: false };
  }

  settle(
    learnerId: string,
    idempotencyKey: string,
    status: 'settled' | 'ambiguous',
    response?: unknown,
  ): void {
    const key = `${learnerId}:${idempotencyKey}`;
    const existing = this.reservations.get(key);
    if (!existing) throw new Error('reservation_not_found');
    this.reservations.set(key, { ...existing, status, response });
  }

  clear(): void {
    this.reservations.clear();
  }
}

