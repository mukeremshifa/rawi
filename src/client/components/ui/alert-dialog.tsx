import * as React from 'react';
import { AlertDialog as AlertPrimitive } from 'radix-ui';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * AlertDialog: a decision the learner must make before continuing, such as
 * discarding unsaved work or submitting an exam. It cannot be dismissed by an
 * outside click. Use `useConfirm()` for the common yes or no case, which
 * replaces `window.confirm`.
 */
const AlertDialog = AlertPrimitive.Root;
const AlertDialogTrigger = AlertPrimitive.Trigger;

function AlertDialogContent({ className, children, ...props }: React.ComponentProps<typeof AlertPrimitive.Content>) {
  return (
    <AlertPrimitive.Portal>
      <AlertPrimitive.Overlay className="ui-overlay fixed inset-0 z-50 bg-black/40 dark:bg-black/60" />
      <AlertPrimitive.Content
        className={cn(
          'ui-panel bg-popover text-popover-foreground fixed top-[18vh] left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 flex-col gap-base rounded-xl border p-5 shadow-modal outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </AlertPrimitive.Content>
    </AlertPrimitive.Portal>
  );
}
function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof AlertPrimitive.Title>) {
  return <AlertPrimitive.Title className={cn('text-md font-semibold', className)} {...props} />;
}
function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof AlertPrimitive.Description>) {
  return <AlertPrimitive.Description className={cn('text-muted-foreground text-base', className)} {...props} />;
}
function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-col-reverse gap-tight pt-1 sm:flex-row sm:justify-end', className)} {...props} />
  );
}
const AlertDialogCancel = AlertPrimitive.Cancel;
const AlertDialogAction = AlertPrimitive.Action;

export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};

const ConfirmContext = React.createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

/** Mount once near the root. Supplies `useConfirm()` to the tree. */
function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = React.useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);
  const confirm = React.useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>(resolve => {
        setRequest(previous => {
          previous?.resolve(false);
          return { ...options, resolve };
        });
      }),
    [],
  );
  const close = (value: boolean) => {
    request?.resolve(value);
    setRequest(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={!!request}
        onOpenChange={open => {
          if (!open) close(false);
        }}
      >
        {request && (
          <AlertDialogContent>
            <div className="flex flex-col gap-1.5">
              <AlertDialogTitle>{request.title}</AlertDialogTitle>
              {request.description && (
                <AlertDialogDescription asChild>
                  <div>{request.description}</div>
                </AlertDialogDescription>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="secondary" onClick={() => close(false)}>
                  {request.cancelLabel ?? 'Cancel'}
                </Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button variant={request.destructive ? 'destructive' : 'primary'} onClick={() => close(true)}>
                  {request.confirmLabel}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/** Ask a yes or no question in an AlertDialog. Resolves true on confirm. */
function useConfirm() {
  return React.useContext(ConfirmContext);
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  ConfirmProvider,
  useConfirm,
};
