import * as React from 'react';

import { cn } from '@/lib/utils';

/** Kbd: a keyboard key in a hint or shortcut, such as Ctrl K or Enter. */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-sm border px-1 font-sans text-xs font-medium',
        className,
      )}
      {...props}
    />
  );
}

/** "Ctrl" on Windows and Linux, the command symbol on Apple platforms. */
export const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

export { Kbd };
