import * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** ISO calendar dates as strings, built at local noon so no timezone shifts a day. */
const parse = (iso: string) => new Date(`${iso}T12:00:00`);
export const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (iso: string, days: number) => { const d = parse(iso); d.setDate(d.getDate() + days); return toISODate(d); };

/**
 * Calendar: a month grid for picking one date. Used inside DateField. Weeks
 * start on Monday. Arrow keys move by day and week, Page keys by month.
 */
function Calendar({ value, onSelect, today = toISODate(new Date()), min, max }: {
  value: string | null;
  onSelect: (iso: string) => void;
  today?: string;
  min?: string;
  max?: string;
}) {
  const [focus, setFocus] = React.useState(value ?? today);
  const month = parse(focus);
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const start = toISODate(new Date(first.getFullYear(), first.getMonth(), 1 - offset, 12));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const grid = React.useRef<HTMLDivElement>(null);
  const moveMonth = (n: number) => { const d = parse(focus); d.setMonth(d.getMonth() + n); setFocus(toISODate(d)); };
  React.useEffect(() => { grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus({ preventScroll: true }); }, [focus]);
  const outside = (iso: string) => (min && iso < min) || (max && iso > max);
  const weekdays = Array.from({ length: 7 }, (_, i) => parse(addDays(start, i)).toLocaleDateString(undefined, { weekday: 'narrow' }));
  return (
    <div className="flex w-64 flex-col gap-2">
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => moveMonth(-1)}><ChevronLeftIcon /></Button>
        <span className="text-base font-medium" aria-live="polite">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => moveMonth(1)}><ChevronRightIcon /></Button>
      </div>
      <div ref={grid} role="grid" className="grid grid-cols-7 gap-0.5 text-center"
        onKeyDown={e => {
          const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
          if (step) { e.preventDefault(); setFocus(addDays(focus, step)); }
          if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); moveMonth(e.key === 'PageUp' ? -1 : 1); }
        }}>
        {weekdays.map((d, i) => <span key={i} className="text-muted-foreground py-1 text-xs" aria-hidden>{d}</span>)}
        {days.map(iso => {
          const inMonth = parse(iso).getMonth() === month.getMonth();
          return (
            <button key={iso} type="button" data-date={iso} tabIndex={iso === focus ? 0 : -1} disabled={!!outside(iso)}
              aria-selected={iso === value} aria-label={parse(iso).toLocaleDateString(undefined, { dateStyle: 'full' })}
              onClick={() => onSelect(iso)}
              className={cn('tabular h-8 rounded-md text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-ring focus-visible:ring-2 disabled:opacity-30',
                !inMonth && 'text-muted-foreground/60', iso === today && 'font-semibold text-primary-text',
                iso === value && 'bg-primary text-primary-foreground hover:bg-primary-hover')}>
              {parse(iso).getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { Calendar };
