import { cn } from '@/lib/utils';

/**
 * Skeleton: a placeholder shaped like the content that is coming. Use through
 * LoadingState or the loading rows of List and Table, which announce once.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" aria-hidden className={cn('ui-skeleton rounded-sm', className)} {...props} />;
}

export { Skeleton };
