import type { ReactNode } from 'react';
import { AlertDialog } from 'radix-ui';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * SPEC §10: "No destructive action without confirmation." Deleting a deck takes
 * its cards and their whole review history with it (`on delete cascade`), and
 * there is no undo for that one — so it gets a dialog, not a toast with an
 * "undo" that would have to be a lie.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  confirming = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  confirming?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Content
          className={cn(
            'bg-background fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md',
            '-translate-x-1/2 -translate-y-1/2 rounded-lg border p-6 shadow-lg',
          )}
        >
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-muted-foreground mt-2 text-sm">
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialog.Cancel>
            <Button variant="destructive" onClick={onConfirm} disabled={confirming}>
              {confirming ? 'Working…' : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
