import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import type { AvailabilityWindow, Weekday } from '@shared/types.ts';
import { formatMinutes as formatDuration } from '@shared/planner.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatDayShort, formatMinutes } from '@/components/domain';
import { useStore } from '@/store/store';
import { useAvailability } from '@/store/selectors';
import { newId } from '@/lib/id';

/**
 * When the student is available to study.
 *
 * ── Why this is global and not per course ─────────────────────────────────
 *
 * A student has one Tuesday evening. The previous checkpoint asked for daily
 * study minutes *per course*, which produced the obviously wrong arithmetic of
 * two courses each claiming the same hour. Availability belongs to the person;
 * how it gets divided between courses is what the planner decides.
 *
 * ── Exceptions replace rather than merge ──────────────────────────────────
 *
 * An exception for a date replaces that day's recurring windows outright,
 * including when it is empty — an empty exception is how "I am away" is said.
 * Merging would make it impossible to express less availability than usual,
 * which is the case exceptions mostly exist for.
 */

const DAYS: { day: Weekday; label: string }[] = [
  { day: 1, label: 'Monday' },
  { day: 2, label: 'Tuesday' },
  { day: 3, label: 'Wednesday' },
  { day: 4, label: 'Thursday' },
  { day: 5, label: 'Friday' },
  { day: 6, label: 'Saturday' },
  { day: 0, label: 'Sunday' },
];

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
    minutes % 60,
  ).padStart(2, '0')}`;
}

function fromTime(value: string): number {
  const [h = '0', m = '0'] = value.split(':');
  return Number(h) * 60 + Number(m);
}

export function AvailabilityPage() {
  const availability = useAvailability();
  const { dispatch } = useStore();

  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionNote, setExceptionNote] = useState('');

  const save = (windows: AvailabilityWindow[]) => {
    dispatch({ type: 'set-availability', availability: { ...availability, windows } });
  };

  const addWindow = (day: Weekday) => {
    save([
      ...availability.windows,
      { id: newId('av'), day, startMinutes: 18 * 60, endMinutes: 20 * 60 },
    ]);
  };

  const patchWindow = (id: string, patch: Partial<AvailabilityWindow>) => {
    save(availability.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  };

  const removeWindow = (id: string) => {
    save(availability.windows.filter((w) => w.id !== id));
  };

  const weeklyTotal = availability.windows.reduce(
    (sum, w) => sum + Math.max(0, w.endMinutes - w.startMinutes),
    0,
  );

  const addException = (available: boolean) => {
    if (!exceptionDate) return;
    dispatch({
      type: 'set-availability-exception',
      exception: {
        id: newId('exc'),
        date: exceptionDate,
        windows: available ? [{ startMinutes: 10 * 60, endMinutes: 13 * 60 }] : [],
        ...(exceptionNote.trim() ? { note: exceptionNote.trim() } : {}),
      },
    });
    setExceptionDate('');
    setExceptionNote('');
    toast.success(available ? 'Extra time added' : 'Day marked unavailable');
  };

  return (
    <Page width="prose" className="pb-page">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/planner">
            <ArrowLeftIcon />
            Planner
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Your availability"
        description="When you can study, in a normal week. The planner fills these windows and nothing outside them."
      />

      <Alert>
        <AlertTitle>
          {formatDuration(weeklyTotal)} a week, in {availability.windows.length}{' '}
          {availability.windows.length === 1 ? 'window' : 'windows'}
        </AlertTitle>
        <AlertDescription>
          This is one budget across every course. A plan never schedules outside these
          hours or on top of something already booked — if the work does not fit, it
          says so rather than overfilling the week.
        </AlertDescription>
      </Alert>

      <Section
        title="A normal week"
        description="Add a window for each stretch of time you can reliably give."
      >
        <div className="flex flex-col gap-base">
          {DAYS.map(({ day, label }) => {
            const windows = availability.windows
              .filter((w) => w.day === day)
              .sort((a, b) => a.startMinutes - b.startMinutes);
            const total = windows.reduce(
              (sum, w) => sum + Math.max(0, w.endMinutes - w.startMinutes),
              0,
            );

            return (
              <div key={day} className="flex flex-col gap-tight">
                <div className="flex items-center justify-between gap-tight">
                  <span className="text-sm font-medium">
                    {label}
                    {total > 0 && (
                      <span className="text-muted-foreground ml-tight font-mono text-xs tabular-nums">
                        {formatMinutes(total)}
                      </span>
                    )}
                  </span>
                  <Button variant="ghost" size="xs" onClick={() => addWindow(day)}>
                    <PlusIcon />
                    Add
                  </Button>
                </div>

                {windows.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    Nothing scheduled on {label}s.
                  </p>
                ) : (
                  windows.map((window) => (
                    <div
                      key={window.id}
                      className="flex flex-wrap items-center gap-tight rounded-lg border p-snug"
                    >
                      <Label htmlFor={`start-${window.id}`} className="sr-only">
                        {label} start
                      </Label>
                      <Input
                        id={`start-${window.id}`}
                        type="time"
                        value={toTime(window.startMinutes)}
                        onChange={(e) =>
                          patchWindow(window.id, {
                            startMinutes: fromTime(e.target.value),
                          })
                        }
                        className="w-32"
                      />
                      <span className="text-muted-foreground text-sm">to</span>
                      <Label htmlFor={`end-${window.id}`} className="sr-only">
                        {label} end
                      </Label>
                      <Input
                        id={`end-${window.id}`}
                        type="time"
                        value={toTime(window.endMinutes)}
                        onChange={(e) =>
                          patchWindow(window.id, { endMinutes: fromTime(e.target.value) })
                        }
                        className="w-32"
                      />
                      <div className="flex-1" />
                      {window.endMinutes <= window.startMinutes && (
                        <span className="text-destructive text-xs">
                          Ends before it starts
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeWindow(window.id)}
                        aria-label={`Remove this ${label} window`}
                        className="text-destructive"
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="How long a sitting should be"
        description="The planner uses this as the length of a generated session, and will not propose a block that does not fit a free window."
      >
        <div className="flex items-center gap-snug">
          <Label htmlFor="session-length">Minutes</Label>
          <Input
            id="session-length"
            type="number"
            min={15}
            max={120}
            step={5}
            value={availability.sessionMinutes}
            onChange={(e) =>
              dispatch({
                type: 'set-availability',
                availability: {
                  ...availability,
                  sessionMinutes: Math.max(15, Number(e.target.value) || 45),
                },
              })
            }
            className="w-24 font-mono tabular-nums"
          />
        </div>
      </Section>

      <Section
        title="Days that are different"
        description="An exception replaces that day's usual windows completely."
      >
        <Card>
          <CardContent className="flex flex-col gap-base">
            <div className="flex flex-wrap items-end gap-tight">
              <div className="flex flex-col gap-tight">
                <Label htmlFor="exception-date">Date</Label>
                <Input
                  id="exception-date"
                  type="date"
                  value={exceptionDate}
                  onChange={(e) => setExceptionDate(e.target.value)}
                />
              </div>
              <div className="flex min-w-40 flex-1 flex-col gap-tight">
                <Label htmlFor="exception-note">Note</Label>
                <Input
                  id="exception-note"
                  value={exceptionNote}
                  onChange={(e) => setExceptionNote(e.target.value)}
                  placeholder="Away, shift at work…"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-tight">
              <Button
                variant="outline"
                onClick={() => addException(false)}
                disabled={!exceptionDate}
              >
                Not available that day
              </Button>
              <Button
                variant="outline"
                onClick={() => addException(true)}
                disabled={!exceptionDate}
              >
                Free 10:00–13:00 instead
              </Button>
            </div>
          </CardContent>
        </Card>

        {availability.exceptions.length > 0 && (
          <div className="flex flex-col gap-tight">
            {[...availability.exceptions]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((exception) => (
                <div
                  key={exception.id}
                  className="flex flex-wrap items-center gap-snug rounded-lg border p-snug"
                >
                  <span className="text-sm">{formatDayShort(exception.date)}</span>
                  <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                    {exception.windows.length === 0
                      ? 'Not available'
                      : exception.windows
                          .map((w) => `${toTime(w.startMinutes)}–${toTime(w.endMinutes)}`)
                          .join(', ')}
                    {exception.note && ` · ${exception.note}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      dispatch({
                        type: 'remove-availability-exception',
                        exceptionId: exception.id,
                      })
                    }
                    aria-label={`Remove the exception on ${exception.date}`}
                    className="text-destructive"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
          </div>
        )}
      </Section>
    </Page>
  );
}
