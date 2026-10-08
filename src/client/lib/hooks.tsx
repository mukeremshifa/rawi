import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { errorMessage } from '@/lib/api';
import { useApi, useApiAll, useSave } from '@/lib/data';

/* Transitional adapters over lib/data.ts. Pages move to useApi and useSave as they are redesigned. */
export function useRecord<T>(path: string) {
  const query = useApi<T>(path);
  return { value: query.data ?? null, setValue: query.setData, error: query.error ? errorMessage(query.error) : '', refresh: () => void query.refetch() };
}
/** Load a complete, bounded selection pool. Never expose an incomplete pool as complete. */
export function useCollection<T>(path: string, key: string) {
  const query = useApiAll<T>(path, key);
  return { value: query.data ?? null, error: query.error ? errorMessage(query.error) : '' };
}
export function useLearningWrite() {
  const save = useSave();
  function run<T>(path: string, body: unknown, method: string, accept: (value: T) => void) {
    // Callers keep their own retry body, so each call is its own request here.
    if (save.busy) return;
    save.discard();
    save.run<T>({ path, body, method }, { id: crypto.randomUUID(), onSuccess: accept });
  }
  return { busy: save.busy, error: save.error, code: save.code, run };
}
let unsavedEdits = false;
export function confirmDiscard() { return !unsavedEdits || window.confirm('You have unsaved changes. Discard them and sign out?'); }
const DraftGuard = createContext<(id: symbol, dirty: boolean) => void>(() => {});
export function DraftBoundary({ children }: { children: ReactNode }) {
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
