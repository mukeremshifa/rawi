import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Badge: a short status or category label. `neutral` almost always. The
 * coloured variants only where the state carries meaning (an outcome, an
 * error, an urgent deadline).
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-sm border px-1.5 text-xs leading-5 font-medium whitespace-nowrap [&>svg]:size-3',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-muted-foreground border-transparent',
        outline: 'text-muted-foreground border-border',
        accent: 'bg-primary-subtle text-primary-text border-transparent',
        success: 'bg-success-subtle text-success-text border-transparent',
        warning: 'bg-warning-subtle text-warning-text border-transparent',
        danger: 'bg-danger-subtle text-danger-text border-transparent',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
