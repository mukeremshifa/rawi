import { Link } from 'react-router-dom';

import { Page } from '@/components/layout';
import { Button } from '@/components/ui/button';

/** Any path the app does not know. Typographic, with one way back. */
export function NotFound() {
  return (
    <Page width="narrow" className="py-16">
      <div className="flex flex-col items-start gap-2">
        <p className="text-muted-foreground tabular text-sm">404</p>
        <h1 className="font-serif text-2xl leading-tight font-medium tracking-tight">This page doesn't exist</h1>
        <p className="text-muted-foreground text-md">The link may be old, or the record may have been moved.</p>
        <Button asChild className="mt-3"><Link to="/">Go home</Link></Button>
      </div>
    </Page>
  );
}
