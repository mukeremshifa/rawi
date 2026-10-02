import { useLocation } from 'react-router-dom';
import { useStore } from '@/store/store';
import { Button } from './ui/button';

export function DraftNotice() {
  const location = useLocation(); const { state, dispatch, saveError } = useStore();
  const prefix = `form:${location.pathname}${location.search}:`;
  const hasDraft = Object.keys(state.drafts).some(k => k.startsWith(prefix));
  const isForm = /\/new$|\/build(?:\/|$)|\/assessment(?:\/|$)|\/syllabus$|\/tutor\//.test(location.pathname);
  if (!hasDraft || !isForm) return null;
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b px-gutter py-2 text-xs text-muted-foreground" role="status"><span>{saveError ? 'Draft is in memory. Export before reloading.' : 'Draft kept on this device. You can leave and return. Saved records change only when committed.'}</span><Button variant="ghost" size="xs" onClick={() => dispatch({ type: 'clear-draft', prefix })}>Discard form draft</Button></div>;
}
