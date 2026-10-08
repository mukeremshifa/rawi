import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * Switch: a setting that is on or off, such as allowing hints. Pair with a
 * Field label. For one item among several choices, use Checkbox.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root data-slot="switch"
      className={cn('bg-gray-7 data-[state=checked]:bg-primary focus-visible:ring-ring/30 inline-flex h-5 w-8 shrink-0 items-center rounded-full p-0.5 outline-none transition-colors focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...props}>
      <SwitchPrimitive.Thumb className="bg-white pointer-events-none block size-4 rounded-full shadow-raised transition-transform data-[state=checked]:translate-x-3" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
