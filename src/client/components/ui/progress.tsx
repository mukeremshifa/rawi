import * as React from 'react';
import { Progress as ProgressPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * Progress: a task moving toward completion, such as an upload. Pass
 * `value={null}` when the size is unknown. For a fact that is true now (a
 * count of topics), use Meter instead.
 */
function Progress({ className, value, ...props }: Omit<React.ComponentProps<typeof ProgressPrimitive.Root>, 'value'> & { value: number | null }) {
  const indeterminate = value === null;
  const clamped = indeterminate ? 0 : Math.min(100, Math.max(0, value));
  return (
    <ProgressPrimitive.Root data-slot="progress" value={indeterminate ? undefined : clamped}
      className={cn('bg-muted relative h-1 w-full overflow-hidden rounded-full', className)} {...props}>
      <ProgressPrimitive.Indicator
        className={cn('bg-primary h-full w-full rounded-full', indeterminate ? 'ui-generating' : 'transition-transform')}
        style={{ transform: indeterminate ? undefined : `translateX(-${100 - clamped}%)`, transitionDuration: 'var(--duration-moving)' }} />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
