import { useRef, type Dispatch, type SetStateAction } from 'react';
import { useStore } from './store';

/** Draft keys include their course, form and field. Saved records change only on commit. */
export function useDraftState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const { state, dispatch } = useStore();
  const first = useRef<{ key: string; value: T } | null>(null);
  if (!first.current || first.current.key !== key) first.current = { key, value: typeof initial === 'function' ? (initial as () => T)() : initial };
  const fallback = typeof initial === 'function' ? first.current.value : initial;
  const value = key in state.drafts ? state.drafts[key] as T : fallback;
  const current = useRef(value);
  current.current = value;
  const set: Dispatch<SetStateAction<T>> = (next) => {
    const resolved = typeof next === 'function' ? (next as (v: T) => T)(current.current) : next;
    current.current = resolved;
    dispatch({ type: 'draft', key, value: resolved });
  };
  return [value, set];
}
