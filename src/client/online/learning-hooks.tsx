import { useEffect, useRef, useState } from 'react';
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
export function useUnsentGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const click = (e: MouseEvent) => {
      const link = (e.target as Element)?.closest('a[href]');
      if (link && !window.confirm('Unsent work will be lost. Leave this page?')) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', click, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true); };
  }, [dirty]);
}
export function downloadRecovery(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
