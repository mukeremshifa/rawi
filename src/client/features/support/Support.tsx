import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SearchIcon } from 'lucide-react';
import type { SearchResults } from '../../../server/api-types';

import { ReminderList } from '@/app/Reminders';
import { Page, PageHeader } from '@/components/layout';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListLoading } from '@/components/ui/list';
import { useApi } from '@/lib/data';

/** Search: titles across courses, materials, topics, sets, sessions and attempts. */
export function Search() {
  const [params, setParams] = useSearchParams();
  const submitted = params.get('q') ?? '';
  const [query, setQuery] = useState(submitted);
  useEffect(() => { const t = setTimeout(() => { if (query.trim() !== submitted) setParams(query.trim() ? { q: query.trim() } : {}, { replace: true }); }, 300); return () => clearTimeout(t); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = useApi<SearchResults>(submitted.length >= 2 ? `/v1/search?q=${encodeURIComponent(submitted)}` : null);
  const groups = [...new Set(data.data?.results.map(r => r.category) ?? [])];
  return (
    <Page width="narrow">
      <PageHeader title="Search" />
      <div className="relative">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
        <Input aria-label="Search your workspace" autoFocus className="h-10 pl-9 text-md" maxLength={100} placeholder="Search titles in your workspace" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      {submitted.length < 2 ? <p className="text-muted-foreground">Type at least two letters.</p>
        : data.isPending ? <ListLoading rows={4} label="Searching" />
          : data.error ? <ErrorState error={data.error} onRetry={() => void data.refetch()} />
            : !data.data.results.length ? <p className="text-muted-foreground">Nothing matches "{submitted}".</p>
              : groups.map(group => (
                <section key={group} className="flex flex-col gap-1">
                  <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{group}</h2>
                  <ul className="divide-y border-y">
                    {data.data.results.filter(r => r.category === group).map(r => <li key={r.to + r.title}><Link to={r.to} className="hover:bg-surface block truncate py-2.5 text-base outline-none focus-visible:bg-surface">{r.title}</Link></li>)}
                  </ul>
                </section>
              ))}
      {data.data && data.data.results.length > 0 && <p className="text-muted-foreground text-sm">Up to {data.data.limitPerCategory} results per kind. Try a longer phrase to narrow it down.</p>}
    </Page>
  );
}

/** Reminders: everything the header bell shows, in full. */
export function Notifications() {
  return (
    <Page width="narrow">
      <PageHeader title="Reminders" description="Shown in the app only. Nothing is sent by email." actions={<Button asChild variant="secondary"><Link to="/settings/study">Reminder settings</Link></Button>} />
      <ReminderList />
    </Page>
  );
}
