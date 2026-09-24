import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { BudgetSnapshot } from '../src/shared/ai.ts';
import { config, type ModelPrice, type Task } from './config.ts';

/**
 * A small spending ledger, kept on disk beside the project.
 *
 * ── How the allowance holds under concurrency ─────────────────────────────
 *
 * Before a request is sent, its worst case (the estimated input plus the
 * whole output allowance) is reserved. The check and the reservation happen
 * in one synchronous step, so two requests arriving together cannot both see
 * the same headroom. When the response returns, the reservation is replaced by
 * the cost worked out from the usage the API reported.
 *
 * Reservations are written to disk too. If the server stops while a request is
 * in flight, the next start converts the orphan into a charge at its reserved
 * amount, because the request may well have been billed.
 *
 * All figures are estimates from token counts and configured prices. They are
 * not the Google credit balance, which only Cloud Billing knows.
 */

export interface LedgerEntry {
  id: string;
  at: string;
  task: Task;
  model: string;
  status: 'reserved' | 'settled' | 'orphaned';
  reservedUsd: number;
  usd: number;
  inputTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  /** Set when usage was unavailable and the reservation was charged instead. */
  estimatedFromReservation?: boolean;
}

interface LedgerFile {
  version: 1;
  entries: LedgerEntry[];
}

let ledger: LedgerFile = load();

function load(): LedgerFile {
  try {
    const parsed = JSON.parse(readFileSync(config.ledgerPath, 'utf8')) as LedgerFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) throw new Error('shape');
    for (const entry of parsed.entries) {
      if (entry.status === 'reserved') {
        entry.status = 'orphaned';
        entry.usd = entry.reservedUsd;
        entry.estimatedFromReservation = true;
      }
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      /* A ledger that exists but cannot be read must not be replaced with an
         empty one, which would reset the allowance. Refuse to start instead. */
      throw new Error(
        `The spending ledger at ${config.ledgerPath} could not be read. Fix or move it before starting the server.`,
      );
    }
    return { version: 1, entries: [] };
  }
}

function save() {
  mkdirSync(dirname(config.ledgerPath), { recursive: true });
  const tmp = `${config.ledgerPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(ledger, null, 1));
  renameSync(tmp, config.ledgerPath);
}

/** The local calendar day, so "today" matches the owner's clock. */
function day(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function charge(entry: LedgerEntry): number {
  return entry.status === 'reserved' ? entry.reservedUsd : entry.usd;
}

export function snapshot(now = new Date()): BudgetSnapshot {
  const today = day(now.toISOString());
  let todayUsd = 0;
  let totalUsd = 0;
  let reservedUsd = 0;
  for (const entry of ledger.entries) {
    if (entry.status === 'reserved') {
      reservedUsd += entry.reservedUsd;
      continue;
    }
    totalUsd += entry.usd;
    if (day(entry.at) === today) todayUsd += entry.usd;
  }
  return {
    dailyLimitUsd: config.dailyBudgetUsd,
    totalLimitUsd: config.totalBudgetUsd,
    todayUsd: round(todayUsd),
    totalUsd: round(totalUsd),
    reservedUsd: round(reservedUsd),
  };
}

function round(usd: number) {
  return Math.round(usd * 1e6) / 1e6;
}

/**
 * The price for a tier. The main model's introductory rate ends after
 * 31 December 2026, and from then the published standard rate applies unless
 * the prices were set explicitly in the environment.
 */
export function priceFor(tier: 'main' | 'lite', now = new Date()): ModelPrice {
  const configured = config.prices[tier];
  if (
    tier === 'main' &&
    now >= new Date('2027-01-01T00:00:00Z') &&
    !process.env.RAWI_PRICE_MAIN_INPUT &&
    !process.env.RAWI_PRICE_MAIN_OUTPUT
  ) {
    return { inputPerMillion: 1.5, outputPerMillion: 7.5 };
  }
  return configured;
}

export function cost(price: ModelPrice, inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1e6
  );
}

export class BudgetError extends Error {
  constructor(
    readonly code: 'budget-daily' | 'budget-total',
    message: string,
  ) {
    super(message);
  }
}

/** Checks the allowance and holds `reservedUsd` against it, atomically. */
export function reserve(task: Task, model: string, reservedUsd: number): LedgerEntry {
  const now = new Date();
  const today = day(now.toISOString());
  let todayUsd = 0;
  let totalUsd = 0;
  for (const entry of ledger.entries) {
    const amount = charge(entry);
    totalUsd += amount;
    if (day(entry.at) === today) todayUsd += amount;
  }

  if (totalUsd + reservedUsd > config.totalBudgetUsd) {
    throw new BudgetError(
      'budget-total',
      `Rawi has used about $${totalUsd.toFixed(2)} of its $${config.totalBudgetUsd.toFixed(2)} overall allowance, so this request was not sent. Raise RAWI_TOTAL_BUDGET_USD if you mean to spend more.`,
    );
  }
  if (todayUsd + reservedUsd > config.dailyBudgetUsd) {
    throw new BudgetError(
      'budget-daily',
      `Rawi has used about $${todayUsd.toFixed(2)} of today's $${config.dailyBudgetUsd.toFixed(2)} allowance, so this request was not sent. It resets at midnight.`,
    );
  }

  const entry: LedgerEntry = {
    id: randomUUID(),
    at: now.toISOString(),
    task,
    model,
    status: 'reserved',
    reservedUsd: round(reservedUsd),
    usd: 0,
  };
  ledger.entries.push(entry);
  save();
  return entry;
}

export function settle(
  entry: LedgerEntry,
  usage:
    | { model: string; inputTokens: number; outputTokens: number; thinkingTokens: number; usd: number }
    | null,
) {
  if (usage) {
    entry.model = usage.model;
    entry.inputTokens = usage.inputTokens;
    entry.outputTokens = usage.outputTokens;
    entry.thinkingTokens = usage.thinkingTokens;
    entry.usd = round(usage.usd);
  } else {
    /* No usage came back: the request may or may not have been billed, so
       the conservative figure is the whole reservation. */
    entry.usd = entry.reservedUsd;
    entry.estimatedFromReservation = true;
  }
  entry.status = 'settled';
  save();
}

/** Drops a reservation for a request that was never sent. */
export function release(entry: LedgerEntry) {
  ledger = { ...ledger, entries: ledger.entries.filter((e) => e.id !== entry.id) };
  save();
}
