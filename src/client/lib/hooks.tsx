import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { errorMessage } from '@/lib/api';
import { useApi, useApiAll, useSave } from '@/lib/data';
import { useConfirm } from '@/components/ui/alert-dialog';

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
/** Whether any open editor holds unsent work. Read before signing out. */
export function hasUnsavedEdits() { return unsavedEdits; }
const DraftGuard = createContext<(id: symbol, dirty: boolean) => void>(() => {});
export function DraftBoundary({ children }: { children: ReactNode }) {
  const entries = useRef(new Set<symbol>()); const [dirty, setDirty] = useState(false);
  const confirm = useConfirm();
  const register = useCallback((id: symbol, value: boolean) => { if (value) entries.current.add(id); else entries.current.delete(id); unsavedEdits = entries.current.size > 0; setDirty(unsavedEdits); }, []);
  useEffect(() => () => { unsavedEdits = false; }, []);
  const blocker = useBlocker(useCallback(() => entries.current.size > 0, []));
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirm({ title: 'Leave without saving?', description: 'Your changes on this page have not been saved.', confirmLabel: 'Discard and leave', cancelLabel: 'Keep editing', destructive: true })
      .then(leave => { if (leave) blocker.proceed(); else blocker.reset(); });
  }, [blocker, confirm]);
  useEffect(() => {
    if (!dirty) return;
    // The browser shows its own prompt here. Pages cannot replace it.
    let leaving = false;
    const unload = (e: BeforeUnloadEvent) => { if (!leaving) e.preventDefault(); };
    const click = (e: MouseEvent) => {
      const link = (e.target as Element)?.closest('a[href]');
      // React Router handles internal navigation, including the Back button.
      if (!(link instanceof HTMLAnchorElement) || (link.origin === location.origin && link.pathname.startsWith('/')) || link.download || link.target === '_blank') return;
      e.preventDefault(); e.stopPropagation();
      void confirm({ title: 'Leave without saving?', description: 'Unsent work on this page will be lost.', confirmLabel: 'Discard and leave', cancelLabel: 'Keep editing', destructive: true })
        .then(leave => { if (leave) { leaving = true; window.location.href = link.href; } });
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', click, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true); };
  }, [dirty, confirm]);
  return <DraftGuard.Provider value={register}>{children}</DraftGuard.Provider>;
}
export function useUnsentGuard(dirty: boolean) {
  const register = useContext(DraftGuard); const id = useRef(Symbol('draft'));
  useEffect(() => { register(id.current, dirty); return () => register(id.current, false); }, [dirty, register]);
  return () => register(id.current, false);
}
