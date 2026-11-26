import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { useConfirm } from '@/components/ui/alert-dialog';

let unsavedEdits = false;
/** Whether any open editor holds unsent work. Read before signing out. */
export function hasUnsavedEdits() {
  return unsavedEdits;
}
const DraftGuard = createContext<(id: symbol, dirty: boolean) => void>(() => {});
export function DraftBoundary({ children }: { children: ReactNode }) {
  const entries = useRef(new Set<symbol>());
  const [dirty, setDirty] = useState(false);
  const confirm = useConfirm();
  const register = useCallback((id: symbol, value: boolean) => {
    if (value) entries.current.add(id);
    else entries.current.delete(id);
    unsavedEdits = entries.current.size > 0;
    setDirty(unsavedEdits);
  }, []);
  useEffect(
    () => () => {
      unsavedEdits = false;
    },
    [],
  );
  const blocker = useBlocker(useCallback(() => entries.current.size > 0, []));
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirm({
      title: 'Leave without saving?',
      description: 'Your changes on this page have not been saved.',
      confirmLabel: 'Discard and leave',
      cancelLabel: 'Keep editing',
      destructive: true,
    }).then(leave => {
      if (leave) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker, confirm]);
  useEffect(() => {
    if (!dirty) return;
    // The browser shows its own prompt here. Pages cannot replace it.
    let leaving = false;
    const unload = (e: BeforeUnloadEvent) => {
      if (!leaving) e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      const link = (e.target as Element)?.closest('a[href]');
      // React Router handles internal navigation, including the Back button.
      if (
        !(link instanceof HTMLAnchorElement) ||
        (link.origin === location.origin && link.pathname.startsWith('/')) ||
        link.download ||
        link.target === '_blank'
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      void confirm({
        title: 'Leave without saving?',
        description: 'Unsent work on this page will be lost.',
        confirmLabel: 'Discard and leave',
        cancelLabel: 'Keep editing',
        destructive: true,
      }).then(leave => {
        if (leave) {
          leaving = true;
          window.location.href = link.href;
        }
      });
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, [dirty, confirm]);
  return <DraftGuard.Provider value={register}>{children}</DraftGuard.Provider>;
}
export function useUnsentGuard(dirty: boolean) {
  const register = useContext(DraftGuard);
  const id = useRef(Symbol('draft'));
  useEffect(() => {
    register(id.current, dirty);
    return () => register(id.current, false);
  }, [dirty, register]);
  return () => register(id.current, false);
}
