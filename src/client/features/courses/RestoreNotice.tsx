import { useState } from 'react';
import { AlertTriangleIcon, DownloadIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAppState, useStore } from '@/store/store';

/**
 * What to do when saved data could not be restored.
 *
 * ── Why this is a choice and not a silent reseed ──────────────────────────
 *
 * The brief is explicit: existing browser data must not be wiped to make a new
 * structure work, and a student whose data genuinely cannot be read must be
 * given a recovery choice rather than a fresh app and no explanation.
 *
 * So an unreadable tree is *not* written over. The store keeps it out of the
 * persistence path until this notice is dismissed, which means a student who
 * reloads still has their original blob, and the raw JSON is offered as a
 * download — it is the only copy of their work and this prototype has no server
 * to keep another.
 *
 * The realistic cause is a build newer than this one having written the data;
 * the reason is stated rather than generalised to "something went wrong",
 * because "version 3, and this build reads version 2" tells a student that
 * reopening the newer build would work and "something went wrong" does not.
 */
export function RestoreNotice() {
  const { restoreProblem } = useAppState();
  const { dispatch } = useStore();
  const [downloaded, setDownloaded] = useState(false);

  if (!restoreProblem) return null;

  const download = () => {
    const blob = new Blob([restoreProblem.raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rawi-saved-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  };

  return (
    <Alert variant="destructive">
      <AlertTriangleIcon />
      <AlertTitle>Your saved data could not be opened</AlertTitle>
      <AlertDescription>
        <span className="flex flex-col gap-snug">
          <span>
            {restoreProblem.reason} Rawi is showing the sample courses instead. Your
            saved data has <strong>not</strong> been overwritten — it is still on this
            device, and it stays untouched until you choose below.
          </span>
          <span className="flex flex-wrap gap-tight">
            <Button size="sm" variant="outline" onClick={download}>
              <DownloadIcon />
              {downloaded ? 'Download again' : 'Download a copy'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => dispatch({ type: 'dismiss-restore-problem' })}
            >
              Continue with the sample courses
            </Button>
          </span>
          <span className="text-xs">
            Continuing starts saving over the old data from this point on. Download a
            copy first if you want to keep it.
          </span>
        </span>
      </AlertDescription>
    </Alert>
  );
}
