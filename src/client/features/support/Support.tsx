import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NotificationsView, SearchResults } from '../../../server/api-types';
import { Page, PageHeader } from '@/components/layout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLearningWrite, useOnlineRecord } from '@/lib/hooks';
export function OnlineSearch() {
  const [query, setQuery] = useState(''), [submitted, setSubmitted] = useState('');
  const data = useOnlineRecord<SearchResults>(`/v1/search?q=${encodeURIComponent(submitted)}`);
  return <Page className="py-8" width="prose"><PageHeader title="Search your workspace" description="Titles across your courses, materials, topics and saved learning. Up to 10 results per category." /><form className="flex gap-3" onSubmit={e => { e.preventDefault(); setSubmitted(query); }}><Input aria-label="Search workspace" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} /><Button>Search</Button></form>{data.error && <p role="alert">{data.error}</p>}{data.value?.results.map(r => <p className="border-b py-3" key={r.to}><span>{r.category} · </span><Link className="underline" to={r.to}>{r.title}</Link></p>)}</Page>;
}
export function OnlineNotifications() {
  const data = useOnlineRecord<NotificationsView>('/v1/notifications'); const op = useLearningWrite();
  const pending = useRef<{ operationId: string; key: string; status: 'read' | 'dismissed' } | null>(null);
  useEffect(() => { const timer = setInterval(data.refresh, 60000); return () => clearInterval(timer); }, []);
  return <Page className="py-8" width="prose"><PageHeader title="In-app reminders" description="Saved account preferences control upcoming work and due review. No email or closed-browser delivery." actions={<Link to="/settings">Reminder preferences</Link>} />{[data.error, op.error].filter(Boolean).map(e => <p role="alert" key={e}>{e}</p>)}{pending.current && !op.busy && <Button onClick={() => void op.run('/v1/notifications', pending.current, 'PATCH', v => { pending.current = null; data.setValue(v as NotificationsView); })}>Retry reminder update</Button>}{data.value?.reminders.length === 0 && <p>No reminders right now.</p>}{data.value?.reminders.map(r => <article className="border p-4 space-y-3" key={r.key}><p>{r.category} · {r.date} · {r.status ?? 'Unread'}</p><Link className="underline" to={r.to}>{r.title}</Link><div className="flex gap-3">{(['read', 'dismissed'] as const).map(status => <Button variant="outline" key={status} disabled={op.busy || !!pending.current} onClick={() => { pending.current = { operationId: crypto.randomUUID(), key: r.key, status }; void op.run<NotificationsView>('/v1/notifications', pending.current, 'PATCH', value => { pending.current = null; data.setValue(value); }); }}>{status === 'read' ? 'Mark read' : 'Dismiss'}</Button>)}</div></article>)}</Page>;
}
