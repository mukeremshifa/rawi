import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { SearchIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Command: the searchable list behind the command menu (Ctrl K). Groups of
 * items that navigate or run an action. The app's CommandMenu fills it.
 */
function CommandDialog({ open, onOpenChange, children, label = 'Command menu' }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode; label?: string }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-overlay fixed inset-0 z-50 bg-black/30 dark:bg-black/55" />
        <DialogPrimitive.Content aria-describedby={undefined}
          className="ui-panel bg-popover text-popover-foreground fixed top-[14vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border shadow-modal outline-none">
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <CommandPrimitive loop label={label} className="flex max-h-[60vh] flex-col">{children}</CommandPrimitive>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-2 border-b px-3">
      <SearchIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <CommandPrimitive.Input className={cn('h-11 flex-1 bg-transparent text-md outline-none placeholder:text-muted-foreground', className)} {...props} />
    </div>
  );
}
function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cn('overflow-y-auto p-1.5', className)} {...props} />;
}
function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="text-muted-foreground py-8 text-center text-base" {...props} />;
}
function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group className={cn('[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium', className)} {...props} />;
}
function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return <CommandPrimitive.Item className={cn('data-[selected=true]:bg-accent flex cursor-default items-center gap-2.5 rounded-md px-2 py-2 text-base outline-none select-none [&_svg]:text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0', className)} {...props} />;
}

export { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem };
