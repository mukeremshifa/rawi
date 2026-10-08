import * as React from 'react';
import { ToggleGroup } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * SegmentedControl: two to four mutually exclusive options seen at once, such
 * as Active, Archived and All, or a topic's priority. Always has a value.
 */
function SegmentedControl<T extends string>({ value, onValueChange, options, size = 'md', className, ...aria }: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: React.ReactNode }[];
  size?: 'sm' | 'md';
  className?: string;
  'aria-label': string;
}) {
  return (
    <ToggleGroup.Root type="single" value={value} onValueChange={v => { if (v) onValueChange(v as T); }} {...aria}
      className={cn('bg-muted inline-flex w-fit max-w-full items-center gap-0.5 rounded-md p-0.5', className)}>
      {options.map(option => (
        <ToggleGroup.Item key={option.value} value={option.value}
          className={cn('text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-[5px] px-2.5 font-medium whitespace-nowrap outline-none transition-colors',
            'focus-visible:ring-ring focus-visible:ring-2 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-raised',
            size === 'sm' ? 'h-6 text-sm' : 'h-7 text-sm')}>
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export { SegmentedControl };
