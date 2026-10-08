import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Transitional: pages still on the native `<select>` API. Each page moves to
 * Select or Combobox as it is redesigned, then this file is deleted.
 *
 * Deliberately not the Radix listbox: the timezone picker holds several hundred
 * options, and a native select gets typeahead, scrolling and the platform's own
 * mobile picker for free. Nothing in P1 needs a custom option renderer.
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          'border-input dark:bg-input/30 h-8 w-full appearance-none bg-card rounded-md border bg-transparent px-3 py-1 pr-8 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-2',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
      />
    </div>
  );
}

export { NativeSelect };
