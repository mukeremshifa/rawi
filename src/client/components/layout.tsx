import { Fragment, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRightIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Page: a screen's frame. `width` is about content, not pixels:
 *   narrow  one column to read or fill in: settings, a form, a set
 *   wide    lists, tables and dashboards
 *   full    edge to edge, for bespoke surfaces that manage their own layout
 */
export function Page({ width = 'wide', className, children }: { width?: 'narrow' | 'wide' | 'full'; className?: string; children: ReactNode }) {
  return (
    <div data-slot="page" className={cn('flex flex-col',
      width === 'narrow' && 'mx-auto w-full max-w-2xl gap-section px-4 py-6 sm:px-gutter sm:py-8',
      width === 'wide' && 'mx-auto w-full max-w-5xl gap-section px-4 py-6 sm:px-gutter sm:py-8',
      width === 'full' && 'min-h-full w-full', className)}>
      {children}
    </div>
  );
}

export type Crumb = { label: ReactNode; to?: string };

/** Breadcrumbs: where this page sits. The last crumb is the current page. */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn('text-muted-foreground flex min-w-0 items-center text-sm', className)}>
      <ol className="flex min-w-0 items-center gap-1">
        {items.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && <ChevronRightIcon className="size-3 shrink-0 opacity-60" aria-hidden />}
            <li className={cn('min-w-0 truncate', i === items.length - 1 && 'text-foreground')} aria-current={i === items.length - 1 ? 'page' : undefined}>
              {item.to && i < items.length - 1 ? <Link to={item.to} className="hover:text-foreground">{item.label}</Link> : item.label}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

/**
 * PageHeader: the page title, one optional line under it, and the page's
 * primary action. `display` sets the title in the serif face, for reading
 * and study surfaces. Tool pages keep the sans title.
 */
export function PageHeader({ title, description, actions, display, className }: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  display?: boolean;
  className?: string;
}) {
  return (
    <div data-slot="page-header" className={cn('flex flex-wrap items-start justify-between gap-x-base gap-y-snug', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className={cn('min-w-0 text-balance', display ? 'font-serif text-2xl leading-tight font-medium tracking-tight' : 'text-xl font-semibold tracking-tight')}>{title}</h1>
        {description && <div className="text-muted-foreground max-w-prose text-base">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-tight">{actions}</div>}
    </div>
  );
}

/** SectionHeader: a section heading inside a page, with an optional action. */
export function SectionHeader({ title, description, actions, className, as: Heading = 'h2' }: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: 'h2' | 'h3';
}) {
  return (
    <div data-slot="section-header" className={cn('flex flex-wrap items-end justify-between gap-snug', className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Heading className="text-md font-semibold tracking-tight">{title}</Heading>
        {description && <div className="text-muted-foreground text-sm">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-tight">{actions}</div>}
    </div>
  );
}

/** Section: a SectionHeader and its content, with the gap decided once. */
export function Section({ title, description, actions, className, children }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section data-slot="section" className={cn('flex flex-col gap-snug', className)}>
      {title && <SectionHeader title={title} description={description} actions={actions} />}
      {children}
    </section>
  );
}

/**
 * Toolbar: the row above a list or table. Search and filters on the left,
 * the primary action on the right. Wraps on narrow screens.
 */
export function Toolbar({ className, children, actions }: { className?: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div data-slot="toolbar" className={cn('flex flex-wrap items-center gap-tight', className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-tight">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-tight">{actions}</div>}
    </div>
  );
}

/** Whether a media query matches, read during render so the first paint is right. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Tailwind's `lg`, where the sidebar becomes a sheet. */
export const MEDIA_DESKTOP = '(min-width: 64rem)';
