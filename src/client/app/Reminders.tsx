import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BellIcon, CheckIcon, XIcon } from 'lucide-react';
import type { NotificationsView } from '../../server/api-types';

import { DueLabel } from '@/components/domain';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Hint } from '@/components/ui/tooltip';
import { useApi, useSave } from '@/lib/data';
import { keys } from '@/lib/query';

export const REMINDER_CATEGORY: Record<string, string> = { Assessment: 'Assessment', 'Planned study': 'Planned study', 'Due review': 'Review due' };

/** The reminder list, shared by the header popover and the full page. */
export function ReminderList({ onNavigate, limit }: { onNavigate?: () => void; limit?: number }) {
  const data = useApi<NotificationsView>('/v1/notifications', { refetchInterval: 60_000 });
  const save = useSave();
  if (data.isPending) return <LoadingState lines={3} label="Loading reminders" />;
  if (data.error) return <ErrorState error={data.error} onRetry={() => void data.refetch()} />;
  const rows = data.data.reminders.slice(0, limit);
  const mark = (key: string, status: 'read' | 'dismissed') => {
    save.run<NotificationsView>({ path: '/v1/notifications', method: 'PATCH', body: { operationId: crypto.randomUUID(), key, status } },
      { id: `${key}:${status}`, onSuccess: value => { data.setData(value); }, invalidate: [keys.notifications] });
  };
  if (!rows.length) return <p className="text-muted-foreground py-2 text-base">Nothing needs your attention.</p>;
  return (
    <div className="flex flex-col gap-1">
      {save.error && <p role="alert" className="text-danger-text text-sm">{save.error} <Button variant="link" size="sm" onClick={save.retry}>Retry</Button></p>}
      <ul className="-mx-1 flex flex-col">
        {rows.map(r => (
          <li key={r.key} className="group hover:bg-accent flex items-start gap-2 rounded-md px-1 py-1.5">
            <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${r.status === 'read' ? 'bg-transparent' : 'bg-primary'}`} aria-hidden />
            <Link to={r.to} onClick={onNavigate} className="min-w-0 flex-1">
              <span className="block truncate text-base">{r.title}</span>
              <span className="text-muted-foreground flex gap-1.5 text-sm">{REMINDER_CATEGORY[r.category] ?? r.category}<span aria-hidden>·</span><DueLabel date={r.date} /></span>
              {r.status !== 'read' && <span className="sr-only">Unread</span>}
            </Link>
            <span className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              {r.status !== 'read' && <Hint label="Mark read"><Button variant="ghost" size="icon-sm" aria-label={`Mark ${r.title} read`} disabled={save.busy} onClick={() => mark(r.key, 'read')}><CheckIcon /></Button></Hint>}
              <Hint label="Dismiss"><Button variant="ghost" size="icon-sm" aria-label={`Dismiss ${r.title}`} disabled={save.busy} onClick={() => mark(r.key, 'dismissed')}><XIcon /></Button></Hint>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The header bell. Shows a dot while anything is unread. */
export function RemindersButton() {
  const [open, setOpen] = useState(false);
  const data = useApi<NotificationsView>('/v1/notifications', { refetchInterval: 60_000 });
  const unread = data.data?.reminders.filter(r => r.status !== 'read').length ?? 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint label="Reminders">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Reminders, ${unread} unread` : 'Reminders'}>
            <BellIcon />
            {unread > 0 && <span className="bg-primary ring-background absolute top-1.5 right-1.5 size-2 rounded-full ring-2" aria-hidden />}
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="w-80">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-base font-semibold">Reminders</p>
          <Link to="/notifications" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-sm">View all</Link>
        </div>
        <ReminderList onNavigate={() => setOpen(false)} limit={8} />
      </PopoverContent>
    </Popover>
  );
}
