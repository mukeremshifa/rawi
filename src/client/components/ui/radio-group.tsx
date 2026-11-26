import * as React from 'react';
import { RadioGroup as RadioPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * RadioGroup: one choice from a few options that each need a sentence of
 * explanation. RadioCards: the same as larger cards, for choosing a mode,
 * such as feedback timing or exam navigation.
 */
function RadioGroup<T extends string>({
  value,
  onValueChange,
  options,
  className,
  ...aria
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }[];
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  const base = React.useId();
  return (
    <RadioPrimitive.Root
      value={value}
      onValueChange={v => onValueChange(v as T)}
      className={cn('flex flex-col gap-1.5', className)}
      {...aria}
    >
      {options.map(option => (
        <div key={option.value} className="flex items-start gap-tight">
          <RadioPrimitive.Item
            id={`${base}-${option.value}`}
            value={option.value}
            disabled={option.disabled}
            className="border-input bg-card focus-visible:ring-ring/30 data-[state=checked]:border-primary mt-[3px] flex size-4 shrink-0 items-center justify-center rounded-full border shadow-raised outline-none focus-visible:ring-3 disabled:opacity-50"
          >
            <RadioPrimitive.Indicator className="bg-primary size-2 rounded-full" />
          </RadioPrimitive.Item>
          <label htmlFor={`${base}-${option.value}`} className="text-base leading-snug">
            {option.label}
            {option.description && <span className="text-muted-foreground block text-sm">{option.description}</span>}
          </label>
        </div>
      ))}
    </RadioPrimitive.Root>
  );
}

function RadioCards<T extends string>({
  value,
  onValueChange,
  options,
  columns = 2,
  className,
  ...aria
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }[];
  columns?: 1 | 2 | 3;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  return (
    <RadioPrimitive.Root
      value={value}
      onValueChange={v => onValueChange(v as T)}
      {...aria}
      className={cn('grid gap-tight', columns === 2 && 'sm:grid-cols-2', columns === 3 && 'sm:grid-cols-3', className)}
    >
      {options.map(option => (
        <RadioPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            'bg-card flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left shadow-raised outline-none transition-colors',
            'hover:bg-accent focus-visible:ring-ring/30 focus-visible:ring-3 disabled:opacity-50',
            'data-[state=checked]:border-primary data-[state=checked]:bg-primary-subtle data-[state=checked]:ring-primary data-[state=checked]:ring-1',
          )}
        >
          <span className="text-base font-medium">{option.label}</span>
          {option.description && <span className="text-muted-foreground text-sm">{option.description}</span>}
        </RadioPrimitive.Item>
      ))}
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, RadioCards };
