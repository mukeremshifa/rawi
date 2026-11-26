import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { CheckIcon, MinusIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Checkbox: an independent on or off choice, or one item in a multi-select
 * list. For a setting that applies at once, use Switch.
 */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer border-input bg-card size-4 shrink-0 rounded-[4px] border shadow-raised outline-none transition-colors',
        'focus-visible:ring-ring/30 focus-visible:border-ring focus-visible:ring-3',
        'data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {props.checked === 'indeterminate' ? (
          <MinusIcon className="size-3" aria-hidden />
        ) : (
          <CheckIcon className="size-3" strokeWidth={3} aria-hidden />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/** A checkbox with its label, for lists of choices. */
function CheckboxRow({
  label,
  description,
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & { label: React.ReactNode; description?: React.ReactNode }) {
  const id = React.useId();
  return (
    <div className={cn('flex items-start gap-tight py-1', className)}>
      <Checkbox id={id} className="mt-[3px]" {...props} />
      <label htmlFor={id} className="text-base leading-snug">
        {label}
        {description && <span className="text-muted-foreground block text-sm">{description}</span>}
      </label>
    </div>
  );
}

export { Checkbox, CheckboxRow };
