import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/layout';
import { downloadRecovery } from '@/online/learning-hooks';
import { isDisconnected, subscribeConnection, readDraft, writeDraft, removeDraft, storageContents, clearSnapshots, type Draft, type Snapshot } from './storage';

export const useDisconnected = () => useSyncExternalStore(subscribeConnection, isDisconnected);

/** Recovery is explicit and retains the original revision until review. */
export function useRecovery<T>(record: string, revision: number | undefined, value: T, dirty: boolean, restore: (value: T, base: number) => void) {
  const [found, setFound] = useState<Draft | null>(null), [status, setStatus] = useState('');
  const base = useRef<number | null>(null), ready = useRef(false), wasDirty = useRef(false), serial = useRef(Promise.resolve());
  const manualSave = useRef(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  useEffect(() => {
    let alive = true; ready.current = false;
    void readDraft(record).then(draft => { if (alive) { setFound(draft ?? null); ready.current = true; } }).catch(() => { if (alive) { ready.current = true; setStatus('Device recovery is unavailable. Export a copy before leaving.'); } });
    return () => { alive = false; };
  }, [record]);
  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!ready.current || found || revision === undefined) return;
    if (!dirty) { if (wasDirty.current) { serial.current = serial.current.then(() => removeDraft(record)).catch(() => setStatus('The previous device draft could not be cleared. Review it before restoring.')); setStatus(''); } wasDirty.current = false; base.current = null; setReviewRequired(false); return; }
    wasDirty.current = true;
    if (isDisconnected()) manualSave.current = true;
    if (base.current !== null && base.current !== revision) setReviewRequired(true);
    base.current ??= revision;
    setStatus('Saving recovery draft…');
    let alive = true;
    serial.current = serial.current.catch(() => {}).then(() => writeDraft(record, base.current ?? revision, value)).then(() => { if (alive) setStatus('Saved on this device. Not submitted or graded.'); }).catch(() => { if (alive) setStatus('Recovery could not be saved. Export a copy before leaving.'); });
    return () => { alive = false; };
  }, [record, serialized, dirty, revision, found]);
  const clear = async () => { await serial.current; await removeDraft(record); base.current = null; manualSave.current = false; setFound(null); setStatus(''); setReviewRequired(false); };
  const panel = <div className="space-y-2 text-sm" aria-live="polite">
    {status && <p role="status">{status}</p>}
    {found && <div className="rounded border p-3 space-y-2"><p>A recovery draft from {new Date(found.updatedAt).toLocaleString()} is saved on this device at revision {found.baseRevision}.</p>
      {revision !== undefined && <Button variant="outline" onClick={() => { const changed = revision !== found.baseRevision; manualSave.current = true; base.current = found.baseRevision; restore(found.value as T, found.baseRevision); setFound(null); setReviewRequired(changed); setStatus(changed ? 'The saved record changed. Review the latest record before saving this draft.' : 'Draft restored. Save explicitly when connected.'); }}>Restore draft for review</Button>}
      <Button variant="outline" onClick={() => downloadRecovery('rawi-recovery-draft.json', found)}>Export draft</Button>
      <Button variant="ghost" onClick={() => { if (window.confirm('Discard this device draft?')) void clear(); }}>Discard device draft</Button>
    </div>}
    {dirty && <Button variant="outline" onClick={() => downloadRecovery('rawi-recovery-draft.json', { record, baseRevision: base.current ?? revision, value })}>Export current draft</Button>}
    {reviewRequired && <p role="alert">Review the latest saved record before using its revision. Your recovered text is still available.</p>}
  </div>;
  return { panel, clear, blocked: !!found || reviewRequired, recovered: manualSave.current,
    protect: async (next: T) => {
      try { await serial.current; await writeDraft(record, base.current ?? revision ?? 0, next); }
      catch { setStatus('Device recovery could not be saved. Keep this page open or export a copy if the account save fails.'); }
    },
    reviewed: (nextRevision = revision) => { base.current = nextRevision ?? null; setReviewRequired(false); } };
}

export function ConnectionStatus() {
  const offline = useDisconnected(); const [updated, setUpdated] = useState<number | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const read = (event: Event) => setUpdated((event as CustomEvent<{ updatedAt: number }>).detail.updatedAt);
    const failed = () => setError('This view could not be saved for offline reading.');
    const update = () => setError('An update is ready. Save or export your drafts, then close all Rawi tabs and reopen the app to update.');
    const unavailable = () => setError('Offline app loading could not be installed. Keep a recovery copy of unsent drafts.');
    window.addEventListener('rawi-update-ready', update); window.addEventListener('rawi-shell-unavailable', unavailable);
    window.addEventListener('rawi-cached-read', read); window.addEventListener('rawi-cache-failed', failed);
    return () => { window.removeEventListener('rawi-cached-read', read); window.removeEventListener('rawi-cache-failed', failed); window.removeEventListener('rawi-update-ready', update); window.removeEventListener('rawi-shell-unavailable', unavailable); };
  }, []);
  return <div className="border-b px-6 py-2 text-sm" role="status">{offline ? <>Connection unavailable. Cached reading only{updated ? `, last saved ${new Date(updated).toLocaleString()}` : ''}. Saves, submissions, timers and AI need the backend. <Link className="underline" to="/courses">Courses</Link> · </> : null}{error} <Link className="underline" to="/storage">Device storage</Link></div>;
}

export function StoragePage() {
  const [value, setValue] = useState<{ snapshots: Snapshot[]; drafts: Draft[] }>({ snapshots: [], drafts: [] }), [error, setError] = useState('');
  const load = () => { void storageContents().then(setValue).catch(() => setError('Device storage is unavailable.')); };
  useEffect(load, []);
  return <Page className="py-8" width="prose"><PageHeader title="Device storage" description="Recently read views are cached for seven days, within a 50 MiB limit. Offline reading requires a successful account check within 24 hours." />
    <p>Readable text is cached as you visit it. Original files need a connection. Drafts have a separate 10 MiB limit and are never evicted to make room for reading.</p>
    {error && <p role="alert">{error}</p>}<p>{(value.snapshots.reduce((n, s) => n + s.bytes, 0) / 1048576).toFixed(2)} MiB in {value.snapshots.length} cached views. {value.drafts.length} recovery drafts.</p>
    <Button onClick={() => void clearSnapshots().then(load)}>Clear cached content and keep drafts</Button>
    <Button variant="outline" onClick={() => downloadRecovery('rawi-device-drafts.json', value.drafts)}>Export recovery drafts</Button>
    {value.drafts.map(d => <article className="border p-3" key={d.key}><p>{d.record}, revision {d.baseRevision}</p><Button variant="outline" onClick={() => downloadRecovery('rawi-draft.json', d)}>Export</Button><Button variant="ghost" onClick={() => { if (window.confirm('Discard this recovery draft?')) void removeDraft(d.record).then(load); }}>Discard draft</Button></article>)}
    <details><summary>Cached views</summary>{value.snapshots.map(s => <p key={s.key}>{s.path} · {new Date(s.updatedAt).toLocaleString()} <Button variant="ghost" onClick={() => void clearSnapshots(s.key).then(load)}>Remove</Button></p>)}</details>
  </Page>;
}
