import * as React from 'react';

import { cn } from '@/lib/utils';

/** Shared look for text-like controls, so every field lines up at 32px. */
export const controlClass = cn(
  'border-input bg-card text-foreground placeholder:text-muted-foreground h-8 w-full min-w-0 rounded-md border px-2.5 text-base shadow-raised transition-[border-color,box-shadow] outline-none',
  'focus-visible:border-ring focus-visible:ring-ring/25 focus-visible:ring-3',
  'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
  'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/25',
);

/** Input: single-line text. Wrap in Field for a label and errors. */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        controlClass,
        'file:text-foreground file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
