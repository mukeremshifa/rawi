import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * Tooltip: names an icon-only control or shows its shortcut. Never the only
 * place information lives, because touch and fast keyboard users miss it.
 */
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({ className, sideOffset = 6, children, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content data-slot="tooltip-content" sideOffset={sideOffset}
        className={cn('ui-pop bg-gray-12 text-gray-1 z-50 rounded-sm px-2 py-1 text-xs font-medium', className)} {...props}>
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/** The common case: a label on hover and focus. */
function Hint({ label, children, side }: { label: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side={side}>{label}</TooltipContent></Tooltip>;
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Hint };
