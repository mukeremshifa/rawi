import * as React from 'react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Sheet: a side panel for editing or adding a record without leaving a list,
 * or for secondary detail beside a reading surface. On phones it also holds
 * the navigation. Header, scrolling body and footer actions.
 */
const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

function SheetContent({
  className,
  children,
  side = 'right',
  size = 'md',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: 'right' | 'left'; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="ui-overlay fixed inset-0 z-50 bg-black/30 dark:bg-black/55" />
      <SheetPrimitive.Content
        data-side={side}
        className={cn(
          'ui-sheet bg-popover text-popover-foreground fixed inset-y-0 z-50 flex w-full flex-col shadow-modal outline-none',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          size === 'sm' && 'sm:max-w-xs',
          size === 'md' && 'sm:max-w-md',
          size === 'lg' && 'sm:max-w-xl',
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring absolute top-3 right-3 rounded-md p-1 outline-none focus-visible:ring-2"
          aria-label="Close"
        >
          <XIcon className="size-4" aria-hidden />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 border-b px-5 py-4 pr-12', className)} {...props} />;
}
function SheetBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-base overflow-y-auto px-5 py-4', className)} {...props} />
  );
}
function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-tight border-t px-5 py-3', className)} {...props} />
  );
}
function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn('text-md font-semibold', className)} {...props} />;
}
function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn('text-muted-foreground text-base', className)} {...props} />;
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
