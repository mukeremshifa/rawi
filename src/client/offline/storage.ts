import type { Me } from '@shared/online';

export const SCHEMA = 1;
export const GRACE_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 7 * GRACE_MS;
const BUDGET = 50 * 1024 * 1024;
const DRAFT_BUDGET = 10 * 1024 * 1024;
const LOCK = 'rawi.device-lock.v1';
type Identity = { key: 'identity'; account: string; me: Me; checkedAt: number };
export type Snapshot = { key: string; account: string; path: string; value: unknown; bytes: number; updatedAt: number; viewedAt: number };
export type Draft = { key: string; account: string; record: string; baseRevision: number; value: unknown; updatedAt: number; bytes: number };
let connection: Promise<IDBDatabase> | undefined;
let active: Identity | null = null;
let generation = 0;
let unavailable = !navigator.onLine;
const listeners = new Set<() => void>();
export const subscribeConnection = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const isDisconnected = () => unavailable;
export function setDisconnected(value: boolean) { if (unavailable !== value) { unavailable = value; listeners.forEach(fn => fn()); } }
export function deviceLocked() { try { return localStorage.getItem(LOCK) !== null; } catch { return true; } }
export function pendingSignOut() { try { return localStorage.getItem(LOCK) === 'sign-out'; } catch { return true; } }
export function markSignOutComplete() { localStorage.setItem(LOCK, 'locked'); }
function db() {
  return connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('rawi-offline-v1', SCHEMA);
    request.onupgradeneeded = () => { for (const name of ['meta', 'snapshots', 'drafts']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'key' }); };
    request.onerror = () => { connection = undefined; reject(request.error); };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); connection = undefined; };
      resolve(request.result);
    };
  });
}
function result<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function transaction<T>(stores: string[], run: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  const tx = (await db()).transaction(stores, 'readwrite');
  const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Device storage failed.')); });
  try { const value = await run(tx); await done; return value; } catch (error) { try { tx.abort(); } catch { /* Already complete. */ } await done.catch(() => {}); throw error; }
}
const accountKey = (me: Me) => `${SCHEMA}:${me.user.id}:${me.workspace.id}`;
function unlocked() { return !!active && !deviceLocked() && Date.now() - active.checkedAt < GRACE_MS; }
export async function rememberAccount(me: Me) {
  const epoch = generation;
  const previous = await result<Identity | undefined>((await db()).transaction('meta').objectStore('meta').get('identity'));
  if (epoch !== generation) throw new Error('Your account changed.');
  if (previous && previous.account !== accountKey(me)) { localStorage.setItem(LOCK, 'switching'); await clearPrivate(); }
  const writeEpoch = generation;
  active = { key: 'identity', account: accountKey(me), me, checkedAt: Date.now() };
  const identity = active;
  await transaction(['meta'], async tx => { await result(tx.objectStore('meta').put(identity)); });
  if (writeEpoch !== generation) throw new Error('Your account changed.');
  localStorage.removeItem(LOCK);
  setDisconnected(false);
}
export async function offlineAccount(): Promise<Me | null> {
  if (deviceLocked()) return null;
  const epoch = generation;
  const identity = await result<Identity | undefined>((await db()).transaction('meta').objectStore('meta').get('identity'));
  if (epoch !== generation || deviceLocked() || !identity || Date.now() - identity.checkedAt >= GRACE_MS) return null;
  active = identity;
  return identity.me;
}
export function lockDevice(signOut = false) {
  generation++; active = null;
  localStorage.setItem(LOCK, signOut ? 'sign-out' : 'locked');
  window.dispatchEvent(new Event('rawi-device-locked'));
}
export async function clearPrivate() {
  generation++; active = null;
  await transaction(['meta', 'snapshots', 'drafts'], async tx => { for (const name of ['meta', 'snapshots', 'drafts']) await result(tx.objectStore(name).clear()); });
}

// Explicit read-view allowlist. Uploads, AI, search, exports, auth and URLs are
// never cached. Each page is bounded by the API and the per-account byte budget.
const views: [RegExp, string[] | null][] = [
  [/^\/v1\/courses$/, ['courses', 'nextCursor']],
  [/^\/v1\/courses\/[^/]+\/topics$/, ['course', 'topics']],
  [/^\/v1\/courses\/[^/]+\/materials$/, ['materials', 'nextCursor']],
  [/^\/v1\/courses\/[^/]+\/sets$/, ['sets', 'nextCursor']],
  [/^\/v1\/courses\/[^/]+\/runs$/, ['runs', 'nextCursor']],
  [/^\/v1\/courses\/[^/]+\/attempts$/, ['attempts', 'nextCursor']],
  [/^\/v1\/courses\/[^/]+\/tutor$/, ['sessions', 'nextCursor']],
  [/^\/v1\/courses\/[^/]+\/exams$/, ['exams', 'nextCursor']],
  [/^\/v1\/materials\/[^/]+$/, null],
  [/^\/v1\/materials\/[^/]+\/versions$/, ['versions', 'nextCursor']],
  [/^\/v1\/materials\/[^/]+\/versions\/[^/]+$/, ['version', 'passages', 'nextCursor']],
  [/^\/v1\/materials\/[^/]+\/versions\/[^/]+\/passages\/[^/]+$/, null],
  [/^\/v1\/sets\/[^/]+$/, ['set', 'items']],
  [/^\/v1\/runs\/[^/]+$/, null],
  [/^\/v1\/attempts\/[^/]+$/, null],
  [/^\/v1\/tutor\/[^/]+$/, ['session', 'messages', 'nextCursor', 'summary', 'execution']],
  [/^\/v1\/(planner|progress)$/, null],
];
function projection(path: string, value: unknown) {
  const match = views.find(([pattern]) => pattern.test(path.split('?')[0]!));
  if (!match || !value || typeof value !== 'object') return undefined;
  const object = value as Record<string, unknown>;
  const selected = match[1] ? Object.fromEntries(match[1].filter(k => k in object).map(k => [k, object[k]])) : { ...object };
  if (path === '/v1/progress') {
    for (const key of ['attempts', 'tutorActivity', 'mistakes', 'due', 'runs', 'sessions', 'assessments', 'checkIns']) {
      if (Array.isArray(selected[key])) selected[key] = selected[key].slice(-100);
    }
    // Evidence uses server totals. Offline history keeps only display fields.
    if (Array.isArray(selected.attempts)) selected.attempts = selected.attempts.map(({ questions: _questions, ...summary }) => summary);
  }
  if (path === '/v1/planner' && Array.isArray(selected.sessions)) selected.sessions = selected.sessions.slice(-200);
  return selected;
}
function bytes(value: unknown) { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
export async function cacheRead(path: string, user: string, value: unknown) {
  if (!unlocked() || active!.me.user.id !== user) return;
  const projected = projection(path, value); if (projected === undefined) return;
  const size = bytes(projected); if (size > 2 * 1024 * 1024) return;
  const identity = active!, epoch = generation;
  await transaction(['snapshots'], async tx => {
    if (epoch !== generation || deviceLocked()) return;
    const store = tx.objectStore('snapshots'); const all = await result<Snapshot[]>(store.getAll());
    const key = `${identity.account}:${path}`, now = Date.now();
    let used = all.filter(s => s.key !== key).reduce((n, s) => n + s.bytes, 0);
    for (const row of all.sort((a, b) => a.viewedAt - b.viewedAt)) {
      if (row.key !== key && (row.account !== identity.account || now - row.updatedAt > RETENTION_MS || used + size > BUDGET)) { await result(store.delete(row.key)); used -= row.bytes; }
    }
    if (epoch !== generation || deviceLocked()) return;
    await result(store.put({ key, account: identity.account, path, value: projected, bytes: size, updatedAt: now, viewedAt: now } satisfies Snapshot));
  });
}
export async function cachedRead<T>(path: string, user: string): Promise<T | undefined> {
  if (!unlocked() || active!.me.user.id !== user) return undefined;
  const epoch = generation, key = `${active!.account}:${path}`;
  return transaction(['snapshots'], async tx => {
    const store = tx.objectStore('snapshots'); const row = await result<Snapshot | undefined>(store.get(key));
    if (epoch !== generation || !unlocked() || !row || Date.now() - row.updatedAt > RETENTION_MS) return undefined;
    await result(store.put({ ...row, viewedAt: Date.now() }));
    window.dispatchEvent(new CustomEvent('rawi-cached-read', { detail: { path, updatedAt: row.updatedAt } }));
    return row.value as T;
  });
}
export async function storageContents() {
  if (!unlocked()) return { snapshots: [] as Snapshot[], drafts: [] as Draft[] };
  const account = active!.account, epoch = generation;
  const database = await db();
  const [snapshots, drafts] = await Promise.all([
    result<Snapshot[]>(database.transaction('snapshots').objectStore('snapshots').getAll()),
    result<Draft[]>(database.transaction('drafts').objectStore('drafts').getAll()),
  ]);
  if (epoch !== generation || !unlocked()) return { snapshots: [] as Snapshot[], drafts: [] as Draft[] };
  return { snapshots: snapshots.filter(s => s.account === account), drafts: drafts.filter(d => d.account === account) };
}
export async function clearSnapshots(key?: string) {
  await transaction(['snapshots'], async tx => { await result(key ? tx.objectStore('snapshots').delete(key) : tx.objectStore('snapshots').clear()); });
}
export async function forgetSnapshot(path: string, user: string) {
  if (active?.me.user.id === user) await clearSnapshots(`${active.account}:${path}`);
}
export async function readDraft(record: string) { return (await storageContents()).drafts.find(d => d.record === record); }
export async function writeDraft(record: string, baseRevision: number, value: unknown) {
  if (!unlocked()) throw new Error('Sign in again before saving recovery drafts on this device.');
  const identity = active!, epoch = generation, size = bytes(value);
  await transaction(['drafts'], async tx => {
    if (epoch !== generation || deviceLocked()) throw new Error('Your account changed.');
    const store = tx.objectStore('drafts'), key = `${identity.account}:${record}`;
    const all = await result<Draft[]>(store.getAll());
    if (size > 2 * 1024 * 1024 || all.filter(d => d.key !== key).reduce((n, d) => n + d.bytes, 0) + size > DRAFT_BUDGET) throw new Error('Recovery storage is full. Export your drafts before removing them.');
    if (epoch !== generation || deviceLocked()) throw new Error('Your account changed.');
    await result(store.put({ key, account: identity.account, record, baseRevision, value, updatedAt: Date.now(), bytes: size } satisfies Draft));
  });
}
export async function removeDraft(record: string) {
  if (!unlocked()) return;
  const key = `${active!.account}:${record}`;
  await transaction(['drafts'], async tx => { await result(tx.objectStore('drafts').delete(key)); });
}
