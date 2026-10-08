import * as React from 'react';
import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import { CheckIcon, MoreHorizontalIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * DropdownMenu: actions behind a trigger, such as row actions or the account
 * menu. Items run actions or navigate. For choosing a value, use Select.
 */
const DropdownMenu = MenuPrimitive.Root;
const DropdownMenuTrigger = MenuPrimitive.Trigger;
const DropdownMenuGroup = MenuPrimitive.Group;
const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

function DropdownMenuContent({ className, align = 'end', sideOffset = 4, ...props }: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content align={align} sideOffset={sideOffset}
        className={cn('ui-pop bg-popover text-popover-foreground z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-44 overflow-y-auto rounded-lg border p-1 shadow-overlay', className)} {...props} />
    </MenuPrimitive.Portal>
  );
}

const itemClass = 'data-[highlighted]:bg-accent relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-base outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground';

function DropdownMenuItem({ className, destructive, ...props }: React.ComponentProps<typeof MenuPrimitive.Item> & { destructive?: boolean }) {
  return <MenuPrimitive.Item className={cn(itemClass, destructive && 'text-danger-text [&_svg]:text-danger-text', className)} {...props} />;
}

function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem className={cn(itemClass, 'pl-7', className)} {...props}>
      <span className="absolute left-2 flex size-3.5 items-center justify-center"><MenuPrimitive.ItemIndicator><CheckIcon className="text-foreground!" /></MenuPrimitive.ItemIndicator></span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className={cn('text-muted-foreground px-2 py-1.5 text-xs font-medium', className)} {...props} />;
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn('bg-border -mx-1 my-1 h-px', className)} {...props} />;
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('text-muted-foreground ml-auto text-xs tracking-wide', className)} {...props} />;
}

/** The "more" button and menu for a row in a List or Table. */
function RowActions({ label = 'More actions', children }: { label?: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={e => e.stopPropagation()}><MoreHorizontalIcon /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={e => e.stopPropagation()}>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, RowActions,
};
