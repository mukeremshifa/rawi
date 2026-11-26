import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * Tabs: switch between peer views of the same object, such as Saved sets and
 * History, or Outline and Settings. An underline marks the current tab. For
 * filtering one list, use SegmentedControl.
 */
const Tabs = TabsPrimitive.Root;

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'flex items-center gap-4 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)]',
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'text-muted-foreground hover:text-foreground relative inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-0.5 text-base font-medium whitespace-nowrap outline-none transition-colors',
        'focus-visible:ring-ring rounded-t-sm focus-visible:ring-2 data-[state=active]:border-foreground data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-base outline-none', className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
