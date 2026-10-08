import * as React from 'react';
import { Link } from 'react-router-dom';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * List and ListRow: the default for a collection (courses, sets, sessions).
 * Each row has primary text, optional secondary meta, and trailing meta or an
 * action. Give `to` to make the whole row a link. Hairlines, no cards.
 */
function List({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul role="list" className={cn('divide-y border-y', className)} {...props} />;
}

function ListRow({ title, meta, leading, trailing, actions, to, onClick, className, titleClassName }: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  leading?: React.ReactNode;
  /** Quiet information at the end, such as a date. */
  trailing?: React.ReactNode;
  /** Controls at the end, such as RowActions. Not part of the link. */
  actions?: React.ReactNode;
  to?: string;
  onClick?: () => void;
  className?: string;
  titleClassName?: string;
}) {
  const body = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate text-base font-medium', titleClassName)}>{title}</span>
        {meta && <span className="text-muted-foreground truncate text-sm">{meta}</span>}
      </span>
      {trailing && <span className="text-muted-foreground shrink-0 text-sm tabular">{trailing}</span>}
    </>
  );
  const inner = 'flex min-w-0 flex-1 items-center gap-snug py-2.5 outline-none';
  return (
    <li className={cn('group hover:bg-surface flex items-center gap-tight transition-colors has-[a:focus-visible]:bg-surface', className)}>
      {to ? <Link to={to} className={cn(inner, 'focus-visible:underline')}>{body}</Link>
        : onClick ? <button type="button" onClick={onClick} className={cn(inner, 'text-left')}>{body}</button>
          : <div className={inner}>{body}</div>}
      {actions && <span className="flex shrink-0 items-center gap-1">{actions}</span>}
    </li>
  );
}

/** Placeholder rows while a list loads. Announces once. */
function ListLoading({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <ul role="status" aria-busy className="divide-y border-y">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex flex-col gap-1.5 py-3" aria-hidden>
          <Skeleton className="h-3.5" style={{ width: `${55 - i * 8}%` }} />
          <Skeleton className="h-3 w-1/4" />
        </li>
      ))}
    </ul>
  );
}

export { List, ListRow, ListLoading };
