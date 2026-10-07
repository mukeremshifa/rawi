import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { errorMessage, OnlineError, request } from './api';
import { useAccount } from './OnlineApp';

export function useOnlineRecord<T>(path: string) {
  const { user } = useAccount();
  const [epoch, setEpoch] = useState(0);
  const [value, setValue] = useState<T | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setValue(null); setError('');
    void request<T>(path, user.id, undefined, 'GET', controller.signal).then(setValue).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); });
    return () => controller.abort();
  }, [path, user.id, epoch]);
  return { value, setValue, error, refresh: () => setEpoch(v => v + 1) };
}
/** Load a complete, bounded selection pool. Never expose an incomplete pool as complete. */
export function useOnlineCollection<T>(path: string, key: string) {
  const { user } = useAccount();
  const [value, setValue] = useState<T[] | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setValue(null); setError('');
    void (async () => {
      const rows: T[] = []; let cursor: string | null = null;
      do {
        const page: Record<string, unknown> & { nextCursor: string | null } = await request(`${path}${cursor ? `&cursor=${cursor}` : ''}`, user.id, undefined, 'GET', controller.signal);
        rows.push(...page[key] as T[]); cursor = page.nextCursor;
        if (rows.length > 5000) throw new Error('This selection exceeds 5,000 records. Use a smaller course before building a set.');
      } while (cursor);
      if (!controller.signal.aborted) setValue(rows);
    })().catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); });
    return () => controller.abort();
  }, [path, key, user.id]);
  return { value, error };
}
export function useLearningWrite() {
  const { user } = useAccount();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [code, setCode] = useState('');
  const lock = useRef(false), controller = useRef(new AbortController());
  useEffect(() => { controller.current = new AbortController(); return () => controller.current.abort(); }, []);
  async function run<T>(path: string, body: unknown, method: string, accept: (value: T) => void) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setCode('');
    try { const saved = await request<T>(path, user.id, body, method, controller.current.signal); if (!controller.current.signal.aborted) accept(saved); }
    catch (e) { if (!controller.current.signal.aborted) { setError(errorMessage(e)); setCode(e instanceof OnlineError ? e.code : ''); } }
    finally { lock.current = false; if (!controller.current.signal.aborted) setBusy(false); }
  }
  return { busy, error, code, run };
}
let unsavedEdits = false;
export function confirmDiscard() { return !unsavedEdits || window.confirm('You have unsaved changes. Discard them and sign out?'); }
const DraftGuard = createContext<(id: symbol, dirty: boolean) => void>(() => {});
export function OnlineDraftBoundary({ children }: { children: ReactNode }) {
  const entries = useRef(new Set<symbol>()); const [dirty, setDirty] = useState(false);
  const register = useCallback((id: symbol, value: boolean) => { if (value) entries.current.add(id); else entries.current.delete(id); unsavedEdits = entries.current.size > 0; setDirty(unsavedEdits); }, []);
  useEffect(() => () => { unsavedEdits = false; }, []);
  const blocker = useBlocker(useCallback(() => entries.current.size > 0, []));
  useEffect(() => { if (blocker.state === 'blocked') { if (window.confirm('You have unsaved changes. Discard them and leave this page?')) blocker.proceed(); else blocker.reset(); } }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const click = (e: MouseEvent) => {
      const link = (e.target as Element)?.closest('a[href]');
      // React Router handles internal navigation, including the Back button.
      if (link instanceof HTMLAnchorElement && (link.origin !== location.origin || !link.pathname.startsWith('/')) && !link.download && link.target !== '_blank' && !window.confirm('Unsent work will be lost. Leave this page?')) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', click, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true); };
  }, [dirty]);
  return <DraftGuard.Provider value={register}>{children}</DraftGuard.Provider>;
}
export function useUnsentGuard(dirty: boolean) {
  const register = useContext(DraftGuard); const id = useRef(Symbol('draft'));
  useEffect(() => { register(id.current, dirty); return () => register(id.current, false); }, [dirty, register]);
  return () => register(id.current, false);
}
