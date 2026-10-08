import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/**
 * The last line of defence: a render that throws would otherwise leave a
 * blank page. Shows the message (never the stack), so a learner can report
 * it, and one way out. Saved work is unaffected, because nothing is saved by
 * rendering.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render failed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex flex-1 items-center overflow-y-auto">
        <div className="mx-auto flex w-full max-w-md flex-col items-start gap-2 px-4 py-16">
          <h1 className="font-serif text-2xl leading-tight font-medium tracking-tight">Something went wrong on this screen</h1>
          <p className="text-muted-foreground text-md">Work you already saved is safe. Reloading usually fixes this.</p>
          <p className="text-muted-foreground bg-muted mt-1 rounded-md px-2 py-1 font-mono text-xs break-all">{this.state.error.message}</p>
          <Button className="mt-3" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </main>
    );
  }
}
