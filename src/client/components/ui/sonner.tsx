import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Toaster: confirms a finished action the learner might not otherwise see
 * ("Course archived"). Never the only record of a failed save, and not for
 * errors that need a decision. Call `toast()` from `sonner`.
 */
const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="system"
    position="bottom-right"
    icons={{
      success: <CircleCheckIcon className="text-success size-4" />,
      info: <InfoIcon className="size-4" />,
      warning: <TriangleAlertIcon className="text-warning-text size-4" />,
      error: <OctagonXIcon className="text-danger size-4" />,
      loading: <Loader2Icon className="size-4 animate-spin" />,
    }}
    style={
      {
        '--normal-bg': 'var(--popover)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
        '--border-radius': '0.5rem',
      } as React.CSSProperties
    }
    {...props}
  />
);

export { Toaster };
