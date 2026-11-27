import { eq, sql } from 'drizzle-orm';
import type { BackendBindings } from '../config';
import type { ReadDb, SocketDb, Transaction } from '../db/client';
import { fundingSources, workspaces } from '../db/schema';
import { ApiError } from '../errors';
import { openRouterAdapter } from './adapters/openrouter';
import type { Adapter } from './adapters/types';
import type { Route } from './catalog';
import type { DataClass, Limits, Vendor } from './types';

/**
 * Who pays for a workspace's AI work, and on what terms. A funding source is data: the platform's
 * own accounts, an institution's account or quota, or a student's own key. The router, the tasks
 * and the checks never change when a source is added. Only the resolver reads this table.
 */
export type SourceRow = typeof fundingSources.$inferSelect;
/** An OpenRouter key. Keys saved for Bedrock or Vertex before the move are ignored when unsealed. */
export interface Credentials {
  vendor: 'openrouter';
  apiKey: string;
}
/** AES-GCM ciphertext of a `Credentials[]`, never logged or returned. */
export interface Sealed {
  iv: string;
  data: string;
}

export interface Funding {
  source: Pick<SourceRow, 'id' | 'kind' | 'label' | 'vendors' | 'routes' | 'retention' | 'studentRetention'> & {
    limits: Limits;
    perWorkspace: Limits | null;
  };
  adapters: Partial<Record<Vendor, Adapter>>;
}

export const PLATFORM = 'platform';

/* ── Sealing ─────────────────────────────────────────────────────────────── */

const text = new TextEncoder();
const b64 = (bytes: ArrayBuffer | Uint8Array) => {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
/** Derived from the auth secret, so no new secret is needed. Rotating that secret retires stored keys. */
async function sealingKey(secret: string) {
  const base = await crypto.subtle.importKey('raw', text.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: text.encode('rawi-funding'), info: text.encode('credentials-v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function seal(env: BackendBindings, credentials: Credentials[]): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await sealingKey(env.BETTER_AUTH_SECRET!),
    text.encode(JSON.stringify(credentials)),
  );
  return { iv: b64(iv), data: b64(data) };
}
async function unseal(env: BackendBindings, sealed: Sealed): Promise<Credentials[]> {
  const data = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(sealed.iv) },
    await sealingKey(env.BETTER_AUTH_SECRET!),
    unb64(sealed.data),
  );
  return JSON.parse(new TextDecoder().decode(data)) as Credentials[];
}

/* ── Adapters ────────────────────────────────────────────────────────────── */

function platformCredentials(env: BackendBindings): Credentials[] {
  return env.OPENROUTER_API_KEY ? [{ vendor: 'openrouter', apiKey: env.OPENROUTER_API_KEY }] : [];
}
function adaptersOf(credentials: Credentials[]) {
  const out: Partial<Record<Vendor, Adapter>> = {};
  for (const c of credentials) if (c.vendor === 'openrouter') out.openrouter = openRouterAdapter(c.apiKey);
  return out;
}

/** Whether the platform has any vendor configured. Background work without one uses rules. */
/** Kept per isolate. Adapters are keyed by source and its sealed value, so a changed key builds new ones. */
const sources = new Map<string, { at: number; row: SourceRow }>();
const assigned = new Map<string, { at: number; id: string }>();
const built = new Map<string, { key: string; adapters: Partial<Record<Vendor, Adapter>> }>();
const FRESH_MS = 60_000;

async function sourceRow(db: ReadDb | SocketDb | Transaction, id: string) {
  const hit = sources.get(id);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.row;
  const [row] = await db.select().from(fundingSources).where(eq(fundingSources.id, id));
  if (row) sources.set(id, { at: Date.now(), row });
  else sources.delete(id);
  return row ?? null;
}

/** Forget cached rows after a change, so this isolate sees it at once. */
export function forgetFunding(workspaceId: string, sourceId?: string) {
  assigned.delete(workspaceId);
  if (sourceId) {
    sources.delete(sourceId);
    built.delete(sourceId);
  }
}

/**
 * The workspace's funding source with adapters for its credentials: the student's own key when
 * it is switched on, otherwise the source the workspace is assigned, otherwise the platform. An
 * inactive or missing source falls back to the platform, the only source that reads Worker secrets.
 */
export async function fundingFor(
  env: BackendBindings,
  db: ReadDb | SocketDb | Transaction,
  workspaceId: string,
): Promise<Funding> {
  let pick = assigned.get(workspaceId);
  if (!pick || Date.now() - pick.at > FRESH_MS) {
    const [ws] = await db
      .select({
        source: sql<
          string | null
        >`coalesce((select f.id from ${fundingSources} f where f.owner_workspace_id = ${workspaceId} and f.kind = 'user' and f.active), ${workspaces.fundingSourceId})`,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    pick = { at: Date.now(), id: ws?.source ?? PLATFORM };
    assigned.set(workspaceId, pick);
  }
  let row = await sourceRow(db, pick.id);
  if (!row?.active || (row.ownerWorkspaceId && row.ownerWorkspaceId !== workspaceId))
    row = await sourceRow(db, PLATFORM);
  if (!row) throw new ApiError(503, 'ai_unconfigured', 'AI is not set up for this workspace yet.');
  const key =
    row.credentials === 'env'
      ? platformCredentials(env)
          .map(c => c.vendor)
          .join(',')
      : `${row.credentials.iv}:${row.credentials.data.length}`;
  let adapters = built.get(row.id);
  if (adapters?.key !== key) {
    const credentials =
      row.credentials === 'env'
        ? platformCredentials(env)
        : await unseal(env, row.credentials).catch(() => [] as Credentials[]);
    adapters = { key, adapters: adaptersOf(credentials) };
    built.set(row.id, adapters);
  }
  return {
    source: {
      id: row.id,
      kind: row.kind,
      label: row.label,
      vendors: row.vendors,
      routes: row.routes,
      retention: row.retention,
      studentRetention: row.studentRetention,
      limits: row.limits,
      perWorkspace: row.perWorkspace,
    },
    adapters: adapters.adapters,
  };
}

/**
 * Whether a route may serve under a source. Every request asks for endpoints that keep no prompts.
 * What a student writes goes further: only to routes whose pinned providers keep nothing at all.
 * No source can widen that.
 */
export function allowed(funding: Funding, r: Route, data: DataClass) {
  const s = funding.source;
  return (
    !!funding.adapters[r.vendor] &&
    s.vendors.includes(r.vendor) &&
    (!s.routes || s.routes.includes(r.id)) &&
    (data === 'institution' || r.student)
  );
}
