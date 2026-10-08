import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { Crumb } from '@/components/layout';

export type PageMeta = {
  /** Breadcrumbs after the course, such as Materials then a title. */
  crumbs?: Crumb[];
  /** The course a record belongs to, for pages outside /course/:id. */
  courseId?: string | null;
  /** Hide the sidebar and header, for focused study surfaces. */
  focus?: boolean;
};

export const ShellContext = createContext<(meta: PageMeta | null) => void>(() => {});

/**
 * Tell the shell about this page: its breadcrumbs, its course, and whether it
 * wants focus mode. Cleared when the page unmounts.
 */
export function usePageMeta(meta: PageMeta) {
  const set = useContext(ShellContext);
  const key = JSON.stringify({ c: meta.crumbs?.map(c => [typeof c.label === 'string' ? c.label : '', c.to]), id: meta.courseId, f: meta.focus });
  useEffect(() => { set(meta); return () => set(null); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function ShellProvider({ value, children }: { value: (meta: PageMeta | null) => void; children: ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
