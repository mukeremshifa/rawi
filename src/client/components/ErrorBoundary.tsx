import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Page } from './layout.tsx';
import { ErrorState } from './states.tsx';

/**
 * The last line of defence.
 *
 * A render that throws unmounts the whole tree and leaves a white page, which
 * is the one failure a learner cannot recover from without knowing to reload.
 * This catches it and offers the reload.
 *
 * ── Why the detail is shown ───────────────────────────────────────────────
 *
 * The message goes on screen rather than only to the console. A learner reading
 * "Cannot read properties of undefined" cannot fix it, but they can paste it,
 * and a bug report with the message in it is worth an order of magnitude more
 * than "it went blank". The one thing never shown is a stack trace, which is
 * noise to everyone who is not already looking at the source.
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
      <Page width="prose" className="py-page">
        <ErrorState
          title="This screen stopped working"
          detail={this.state.error.message}
          onRetry={() => window.location.reload()}
          retryLabel="Reload"
        />
        <p className="text-muted-foreground text-sm leading-relaxed">
          Nothing you had already submitted is affected — evidence is written when you
          submit it, not when a screen renders.
        </p>
      </Page>
    );
  }
}
