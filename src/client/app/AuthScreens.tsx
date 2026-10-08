import type { ReactNode } from 'react';
import { AlertTriangleIcon } from 'lucide-react';

import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** A centred column for the screens before the workspace opens. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-section px-4 py-12">
        <Logo />
        {children}
      </div>
      <p className="text-muted-foreground px-4 pb-6 text-center text-sm">Your courses, practice and plans, in one private workspace.</p>
    </main>
  );
}

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
  </svg>
);

export function SignInScreen({ busy, error, onSignIn }: { busy: boolean; error: string; onSignIn: () => void }) {
  return (
    <Frame>
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-2xl leading-tight font-medium tracking-tight">Pick up where you left off</h1>
        <p className="text-muted-foreground text-md">Sign in to open your workspace. New accounts start empty, ready for your first course.</p>
      </div>
      <div className="flex flex-col gap-snug">
        <Button size="lg" variant="secondary" loading={busy} onClick={onSignIn} className="w-full">{!busy && <GoogleMark />}Continue with Google</Button>
        {error && <p role="alert" className="text-danger-text flex items-start gap-1.5 text-sm"><AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />{error}</p>}
      </div>
    </Frame>
  );
}

export function UnavailableScreen({ busy, error, onRetry }: { busy: boolean; error: string; onRetry: () => void }) {
  return (
    <Frame>
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-2xl leading-tight font-medium tracking-tight">Your workspace can't be reached</h1>
        <p className="text-muted-foreground text-md">{error || 'The connection to your account failed.'} Nothing has been lost.</p>
      </div>
      <Button size="lg" loading={busy} onClick={onRetry} className="w-full sm:w-auto sm:self-start">Try again</Button>
    </Frame>
  );
}

/** While the session is checked. Shaped like the shell so nothing jumps. */
export function CheckingScreen() {
  return (
    <div className="flex min-h-0 flex-1" role="status" aria-busy>
      <span className="sr-only">Opening your workspace</span>
      <div className="bg-surface hidden w-60 shrink-0 flex-col gap-3 border-r p-4 lg:flex">
        <Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" />
      </div>
      <div className="flex flex-1 flex-col gap-4 p-8"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
    </div>
  );
}

/** Shown above every page when the connection check after sign-in fails. */
export function ConnectionBanner({ message, busy, onRetry }: { message: string; busy: boolean; onRetry: () => void }) {
  return (
    <div role="alert" className="bg-warning-subtle text-warning-text flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm">
      <span className="min-w-0 flex-1">{message}</span>
      <Button variant="secondary" size="sm" loading={busy} onClick={onRetry}>Retry</Button>
    </div>
  );
}
