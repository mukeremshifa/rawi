import { ApiClientError } from '../../shared/contract.ts';
import type { AiBudget, AiReservation, ReserveOutcome } from '../ai/budget.ts';
import { many, type Db } from './client.ts';

/**
 * The production AI ledger: migration 003's `reserve_ai_usage`.
 *
 * ── Why the cap check is a SQL function and not two queries ───────────────
 *
 * "Sum this month's spend, compare it to the cap, insert a reservation" is
 * three statements, and two Workers running them concurrently both read a sum
 * that predates the other's insert. The cap is then exceeded by exactly one
 * call, every time it is raced — which is the failure mode you only see on the
 * day something goes wrong and the retry loop is hot.
 *
 * The RPC does the check and the insert in one statement, so the database is
 * the thing serialising it. 003 already got this right, which is why this
 * module is a binding rather than a reimplementation.
 */
export class PostgresAiBudget implements AiBudget {
  constructor(
    private readonly db: Db,
    private readonly meta: {
      provider: string;
      model: string;
      promptVersion: string;
      contentVersion: string;
    },
  ) {}

  async reserve(input: {
    userId: string;
    idempotencyKey: string;
    month: string;
    amountMicrosUsd: number;
    globalCapMicrosUsd: number;
    userCapMicrosUsd: number;
  }): Promise<ReserveOutcome> {
    const { data, error } = await this.db.rpc('reserve_ai_usage', {
      p_user_id: input.userId,
      p_idempotency_key: input.idempotencyKey,
      p_provider: this.meta.provider,
      p_model: this.meta.model,
      p_prompt_version: this.meta.promptVersion,
      p_curriculum_version: this.meta.contentVersion,
      p_reserved_micros_usd: input.amountMicrosUsd,
      p_global_cap_micros_usd: input.globalCapMicrosUsd,
      p_learner_cap_micros_usd: input.userCapMicrosUsd,
    });

    if (error) throw new ApiClientError('internal', error.message);

    const outcome = data as {
      ok?: boolean;
      reason?: 'global_cap' | 'user_cap' | 'learner_cap' | 'in_progress';
      replay?: boolean;
      reservation?: AiReservation;
    };

    if (!outcome?.ok) {
      // 003 names the per-learner cap `learner_cap`; the contract calls it
      // `user_cap`. Mapped here rather than renamed in an applied migration.
      const reason = outcome?.reason === 'learner_cap' ? 'user_cap' : outcome?.reason;
      return { ok: false, reason: reason ?? 'in_progress' };
    }

    return {
      ok: true,
      replay: outcome.replay ?? false,
      reservation: outcome.reservation as AiReservation,
    };
  }

  async settle(input: {
    userId: string;
    idempotencyKey: string;
    status: 'settled' | 'ambiguous';
    actualMicrosUsd: number | null;
    response?: unknown;
  }): Promise<void> {
    const result = await this.db
      .from('ai_usage')
      .update({
        status: input.status,
        // Invariant 10: an ambiguous call keeps its full reservation. Writing
        // NULL here would let the next cap check treat it as free.
        actual_micros_usd: input.status === 'ambiguous' ? undefined : input.actualMicrosUsd,
        response_json: input.response ?? null,
        settled_at: new Date().toISOString(),
      })
      .eq('user_id', input.userId)
      .eq('idempotency_key', input.idempotencyKey);

    if (result.error) throw new ApiClientError('internal', result.error.message);
  }
}

/** This month's spend and ambiguous count, for the quota surface. */
export async function monthlyUsage(
  db: Db,
  userId: string,
  month: string,
): Promise<{ spentMicrosUsd: number; ambiguousCalls: number }> {
  const rows = many<{
    reserved_micros_usd: number;
    actual_micros_usd: number | null;
    status: string;
  }>(
    await db
      .from('ai_usage')
      .select('reserved_micros_usd, actual_micros_usd, status')
      .eq('user_id', userId)
      .eq('usage_month', month),
  );

  return {
    // A reserved-but-unsettled call counts at its reservation. Optimism here
    // would let an in-flight call be invisible to the cap that should stop it.
    spentMicrosUsd: rows.reduce(
      (sum, row) => sum + (row.actual_micros_usd ?? row.reserved_micros_usd),
      0,
    ),
    ambiguousCalls: rows.filter((row) => row.status === 'ambiguous').length,
  };
}
