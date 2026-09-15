import { beforeEach, describe, expect, it } from 'vitest';

import {
  costMicrosUsd,
  currentMonth,
  estimateReservationMicrosUsd,
  MemoryAiBudget,
} from '../../src/server/ai/budget.ts';
import { aiSettings } from '../../src/server/env.ts';

const pricing = { inputUsdPerMillion: 0.2, outputUsdPerMillion: 1.2 };

describe('cost arithmetic', () => {
  it('rounds up, so the ledger never drifts under the true spend', () => {
    const cost = costMicrosUsd({ inputTokens: 1, outputTokens: 1 }, pricing);
    expect(cost).toBe(Math.ceil((0.2 / 1_000_000 + 1.2 / 1_000_000) * 1_000_000));
    expect(cost).toBeGreaterThan(0);
  });

  it('estimates pessimistically', () => {
    // A reservation that turns out too large is refunded at settle time. One
    // that turns out too small has already let a call through a cap.
    const estimate = estimateReservationMicrosUsd(3000, 1800, pricing);
    const actual = costMicrosUsd({ inputTokens: 750, outputTokens: 400 }, pricing);
    expect(estimate).toBeGreaterThan(actual);
  });

  it('keys the month to the first of the month', () => {
    expect(currentMonth(new Date('2026-09-15T23:00:00.000Z'))).toBe('2026-09-01');
  });
});

describe('MemoryAiBudget', () => {
  let budget: MemoryAiBudget;
  const month = '2026-09-01';

  beforeEach(() => {
    budget = new MemoryAiBudget();
  });

  const reserve = (key: string, amount: number, caps = { global: 1000, user: 500 }) =>
    budget.reserve({
      userId: 'u1',
      idempotencyKey: key,
      month,
      amountMicrosUsd: amount,
      globalCapMicrosUsd: caps.global,
      userCapMicrosUsd: caps.user,
    });

  it('refuses a reservation that would cross the per-user cap', async () => {
    expect((await reserve('k1', 400)).ok).toBe(true);
    const second = await reserve('k2', 200);
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.reason).toBe('user_cap');
  });

  it('refuses a reservation that would cross the global cap', async () => {
    const outcome = await budget.reserve({
      userId: 'u1',
      idempotencyKey: 'k1',
      month,
      amountMicrosUsd: 2000,
      globalCapMicrosUsd: 1000,
      userCapMicrosUsd: 5000,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe('global_cap');
  });

  it('does not double-charge a key still in flight', async () => {
    await reserve('k1', 100);
    const again = await reserve('k1', 100);
    expect(again.ok).toBe(false);
    expect(again.ok === false && again.reason).toBe('in_progress');
  });

  it('replays a settled key without charging again', async () => {
    await reserve('k1', 100);
    await budget.settle({
      userId: 'u1',
      idempotencyKey: 'k1',
      status: 'settled',
      actualMicrosUsd: 40,
      response: { answered: true },
    });
    const replay = await reserve('k1', 100);
    expect(replay.ok).toBe(true);
    expect(replay.ok && replay.replay).toBe(true);
    expect(budget.spentMicrosUsd('u1', month)).toBe(40);
  });

  it('charges an ambiguous call its full reservation', async () => {
    // Invariant 10. A call whose outcome is unknown may still have been billed;
    // recording it as free is the assumption that silently overruns a cap.
    await reserve('k1', 100);
    await budget.settle({
      userId: 'u1',
      idempotencyKey: 'k1',
      status: 'ambiguous',
      actualMicrosUsd: null,
    });
    expect(budget.spentMicrosUsd('u1', month)).toBe(100);
    expect(budget.ambiguousCount('u1', month)).toBe(1);
  });

  it('counts an unsettled reservation against the cap', async () => {
    await reserve('k1', 400);
    // Not yet settled — but an in-flight call has to be visible to the cap
    // that should stop the next one.
    expect(budget.spentMicrosUsd('u1', month)).toBe(400);
  });
});

describe('aiSettings — fail closed', () => {
  const full = {
    RAWI_AI_MODE: 'live',
    GOOGLE_CLOUD_PROJECT: 'p',
    GOOGLE_SA_CLIENT_EMAIL: 'e',
    GOOGLE_SA_PRIVATE_KEY: 'k',
    RAWI_AI_MONTHLY_CAP_USD: '10',
    RAWI_AI_USER_MONTHLY_CAP_USD: '1',
    VERTEX_INPUT_USD_PER_MILLION: '0.2',
    VERTEX_OUTPUT_USD_PER_MILLION: '1.2',
  } as never;

  it('is live only when everything is present', () => {
    expect(aiSettings(full).mode).toBe('live');
    expect(aiSettings(full).unavailableReason).toBeNull();
  });

  it('defaults to fixture with no reason, because that is not a failure', () => {
    const settings = aiSettings({} as never);
    expect(settings.mode).toBe('fixture');
    expect(settings.unavailableReason).toBeNull();
  });

  it('names the missing key rather than saying "unavailable"', () => {
    const withoutCap = { ...(full as object), RAWI_AI_USER_MONTHLY_CAP_USD: undefined };
    const settings = aiSettings(withoutCap as never);
    expect(settings.mode).toBe('fixture');
    expect(settings.unavailableReason).toContain('RAWI_AI_USER_MONTHLY_CAP_USD');
  });

  it('refuses live mode with a credential but no caps', () => {
    const noCaps = {
      ...(full as object),
      RAWI_AI_MONTHLY_CAP_USD: undefined,
      RAWI_AI_USER_MONTHLY_CAP_USD: undefined,
    };
    expect(aiSettings(noCaps as never).mode).toBe('fixture');
  });
});
