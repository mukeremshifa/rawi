import type { ReactNode } from 'react';
import { AlertTriangleIcon, CheckIcon, CircleDotIcon, Loader2Icon, RotateCwIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, RequestError } from '@/lib/api';
import type { SaveStatus } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * LoadingState: a skeleton shaped like the content that is coming. Pages use
 * this (or ListLoading and TableLoading) and never hand-write "Loading".
 */
export function LoadingState({
  lines = 3,
  className,
  label = 'Loading',
}: {
  lines?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)} role="status" aria-live="polite" aria-busy>
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: i === lines - 1 ? '55%' : `${92 - i * 6}%` }} />
      ))}
    </div>
  );
}

/** A whole page loading: a title bar and a few rows. */
export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex flex-col gap-section" role="status" aria-busy>
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
      <div className="flex flex-col gap-2.5">
        {[80, 72, 64, 40].map(w => (
          <Skeleton key={w} className="h-3.5" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

/**
 * EmptyState: typographic. One sentence that says what this place is for,
 * and at most one action that fills it.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
  compact,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Inside a section rather than filling a page. */
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-start gap-1', compact ? 'py-4' : 'py-10', className)}>
      <p className="text-md font-medium">{title}</p>
      {description && <div className="text-muted-foreground max-w-prose text-base">{description}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/**
 * ErrorState: something could not load. Says what failed, keeps the server's
 * request reference for support, and offers the retry.
 */
export function ErrorState({
  title = 'This could not be loaded',
  error,
  detail,
  onRetry,
  retryLabel = 'Try again',
  className,
}: {
  title?: string;
  /** The thrown value. Its message and request reference are shown. */
  error?: unknown;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  const message = detail ?? (error ? errorMessage(error) : undefined);
  const reference = error instanceof RequestError ? error.requestId : '';
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-snug rounded-lg border p-4', className)}>
      <div className="flex items-start gap-tight">
        <AlertTriangleIcon className="text-danger mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="flex flex-col gap-0.5">
          <p className="text-base font-medium">{title}</p>
          {message && <p className="text-muted-foreground text-base">{message}</p>}
          {reference && (
            <p className="text-muted-foreground text-xs">
              Reference <span className="font-mono">{reference}</span>
            </p>
          )}
        </div>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCwIcon />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

/**
 * SaveIndicator: the state of an editor's changes, in one quiet line:
 * Saved, Saving, Unsaved changes, or Not saved with a retry. Use it where a
 * form saves, instead of a status sentence.
 */
export function SaveIndicator({
  status,
  dirty,
  error,
  onRetry,
  className,
}: {
  status: SaveStatus;
  /** Local edits that have not been sent yet. */
  dirty?: boolean;
  error?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const state =
    status === 'saving'
      ? 'saving'
      : status === 'failed'
        ? 'failed'
        : dirty
          ? 'unsaved'
          : status === 'saved'
            ? 'saved'
            : 'idle';
  if (state === 'idle') return <span className={className} aria-live="polite" />;
  return (
    <span
      aria-live="polite"
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 text-sm',
        state === 'failed' ? 'text-danger-text' : 'text-muted-foreground',
        className,
      )}
    >
      {state === 'saving' && (
        <>
          <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
          Saving
        </>
      )}
      {state === 'saved' && (
        <>
          <CheckIcon className="size-3.5" aria-hidden />
          Saved
        </>
      )}
      {state === 'unsaved' && (
        <>
          <CircleDotIcon className="size-3.5" aria-hidden />
          Unsaved changes
        </>
      )}
      {state === 'failed' && (
        <>
          <AlertTriangleIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate" title={error}>
            Not saved{error ? `. ${error}` : ''}
          </span>
          {onRetry && (
            <Button variant="link" size="sm" className="text-danger-text! underline" onClick={onRetry}>
              Retry
            </Button>
          )}
        </>
      )}
    </span>
  );
}

/**
 * Notice: a single calm line about the state of the system, such as AI not
 * being available. Say it once, where it matters.
 */
export function Notice({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-surface text-muted-foreground flex flex-wrap items-center gap-x-snug gap-y-1 rounded-md border px-3 py-2 text-sm',
        className,
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}
