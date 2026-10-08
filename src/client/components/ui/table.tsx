import * as React from 'react';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Table: records compared across columns, such as materials or attempt
 * history. Compact rows, a sticky header, hover, optional sort, selection and
 * a row actions menu (RowActions). For a simple collection, use List.
 */
function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn('w-full caption-bottom border-collapse text-base', className)} {...props} />
    </div>
  );
}
function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead className={cn('bg-background sticky top-0 z-10 [&_tr]:border-b', className)} {...props} />;
}
function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}
function TableRow({ className, onClick, ...props }: React.ComponentProps<'tr'>) {
  return <tr className={cn('hover:bg-surface data-[state=selected]:bg-primary-subtle border-b transition-colors', onClick && 'cursor-pointer', className)} onClick={onClick} {...props} />;
}
function TableHead({ className, sort, onSort, children, ...props }: React.ComponentProps<'th'> & {
  /** Current sort on this column. Pass `onSort` to make the header a sort button. */
  sort?: 'asc' | 'desc' | false;
  onSort?: () => void;
}) {
  const Icon = sort === 'asc' ? ArrowUpIcon : sort === 'desc' ? ArrowDownIcon : ChevronsUpDownIcon;
  return (
    <th aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : onSort ? 'none' : undefined}
      className={cn('text-muted-foreground h-8 px-2 text-left align-middle text-sm font-medium whitespace-nowrap first:pl-0 last:pr-0', className)} {...props}>
      {onSort ? (
        <button type="button" onClick={onSort} className="hover:text-foreground focus-visible:ring-ring -mx-1 inline-flex items-center gap-1 rounded-sm px-1 outline-none focus-visible:ring-2">
          {children}<Icon className={cn('size-3', !sort && 'opacity-50')} aria-hidden />
        </button>
      ) : children}
    </th>
  );
}
function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return <td className={cn('h-10 px-2 align-middle first:pl-0 last:pr-0', className)} {...props} />;
}
/** A full-width row for "nothing here", inside TableBody. */
function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return <tr><td colSpan={colSpan} className="text-muted-foreground py-8 text-center text-base">{children}</td></tr>;
}
/** Placeholder rows while a table loads. Announces once. */
function TableLoading({ colSpan, rows = 4 }: { colSpan: number; rows?: number }) {
  return <>
    {Array.from({ length: rows }, (_, i) => (
      <tr key={i} className="border-b" aria-hidden={i > 0 || undefined}>
        <td colSpan={colSpan} className="h-10 first:pl-0" role={i === 0 ? 'status' : undefined}>
          {i === 0 && <span className="sr-only">Loading</span>}
          <Skeleton className="h-3.5" style={{ width: `${70 - i * 9}%` }} />
        </td>
      </tr>
    ))}
  </>;
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty, TableLoading };
