import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarClockIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import type { PlannerView } from '../../../server/api-types';
import type { Availability, PlanProposal, PlannedAssessment, PlannedSession, SessionActivity, AssessmentType } from '@shared/domain/types';
import { addDays, formatMinutes as clock, weekDates, weekStart, windowsForDate } from '@shared/domain/planner';

import { ACTIVITY_LABEL, ASSESSMENT_LABEL, DueLabel, SESSION_STATUS_LABEL } from '@/components/domain';
import { MEDIA_DESKTOP, Page, PageHeader, Section, useMediaQuery } from '@/components/layout';
import { ErrorState, Notice, PageLoading } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { DateField } from '@/components/ui/date-field';
import { Field, FieldError, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NumberField } from '@/components/ui/number-field';
import { Select } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { TimeField } from '@/components/ui/time-field';
import { useApi, useSave } from '@/lib/data';
import { useUnsentGuard } from '@/lib/hooks';
import { keys } from '@/lib/query';
import { cn } from '@/lib/utils';

type Data = PlannerView;
type SessionDraft = { id: string | null; courseId: string; title: string; date: string; startMinutes: number; durationMinutes: number; activity: SessionActivity; topicIds: string[]; assessmentId?: string; locked: boolean; status: PlannedSession['status'] };
type AssessmentDraft = Omit<PlannedAssessment, 'id' | 'createdAt'> & { id: string | null };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOUR_MIN = 44;
const activityTarget = (s: { courseId: string; activity: SessionActivity; id: string }) => `/course/${s.courseId}/${s.activity === 'exam' ? 'exams' : s.activity === 'read' ? 'materials' : s.activity === 'tutor' ? 'tutor' : 'practice'}?plannedSessionId=${s.id}`;
const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, opts);
const invalidate = [keys.planner, keys.progress, keys.notifications];

/**
 * Planner: a week of availability with planned sessions placed inside it,
 * proposals reviewed as a list, and sheets for sessions, assessments and
 * study hours. Today is marked with the accent.
 */
export function Planner() {
  const [params, setParams] = useSearchParams();
  const data = useApi<Data>('/v1/planner');
  const desktop = useMediaQuery(MEDIA_DESKTOP);
  const save = useSave();
  const [monday, setMonday] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ id: string; proposal: PlanProposal } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [session, setSession] = useState<SessionDraft | null>(null);
  const [assessment, setAssessment] = useState<AssessmentDraft | null>(null);
  const availabilityOpen = params.get('availability') === '1';
  const setAvailabilityOpen = (open: boolean) => { const next = new URLSearchParams(params); if (open) next.set('availability', '1'); else next.delete('availability'); setParams(next, { replace: true }); };
  const row = data.data;
  useEffect(() => { if (row && !monday) setMonday(weekStart(row.today)); }, [row, monday]);
  // Deep links from Home and reminders open the session they name.
  useEffect(() => {
    const target = params.get('session');
    const s = target && row?.sessions.find(x => x.id === target);
    if (s) { setMonday(weekStart(s.date)); setSession(draftOf(s)); const next = new URLSearchParams(params); next.delete('session'); setParams(next, { replace: true }); }
  }, [row, params]);
  if (data.isPending || !monday) return <Page><PageHeader title="Planner" /><PageLoading label="Loading planner" /></Page>;
  if (data.error) return <Page><PageHeader title="Planner" /><ErrorState error={data.error} onRetry={() => void data.refetch()} /></Page>;
  const r = data.data;
  const days = weekDates(monday);
  const courseName = (id: string) => r.courses.find(c => c.id === id)?.name ?? 'Course';
  const active = r.courses.filter(c => !c.archived);
  const saved = r.savedProposal && r.savedProposal.proposal.weekStart === monday ? r.savedProposal : null;
  const shown = proposal ?? (reviewing ? saved : null);
  const propose = () => save.run<{ id: string; proposal: PlanProposal }>({ path: '/v1/planner/proposals', body: { operationId: crypto.randomUUID(), weekStart: monday } }, { id: `propose:${monday}:${r.revision}`, onSuccess: setProposal });
  const apply = (id: string) => save.run({ path: `/v1/planner/proposals/${id}/apply`, body: { operationId: crypto.randomUUID() } }, { id: `apply:${id}`, invalidate, onSuccess: () => { setProposal(null); setReviewing(false); toast.success('Plan applied'); } });
  const newSession = (date = r.today, startMinutes = 18 * 60): SessionDraft => ({ id: null, courseId: active[0]?.id ?? '', title: '', date, startMinutes, durationMinutes: r.availability.sessionMinutes, activity: 'practice', topicIds: [], locked: true, status: 'planned' });
  return (
    <Page width="wide" className="max-w-6xl">
      <PageHeader title="Planner" description={`Times are in ${r.timezone.replace(/_/g, ' ')}.`}
        actions={<>
          <Button variant="secondary" onClick={() => setAvailabilityOpen(true)}><CalendarClockIcon />Study hours</Button>
          <Button variant="secondary" disabled={!active.length} onClick={() => setSession(newSession())}><PlusIcon />Session</Button>
          <Button loading={save.busy && !proposal} onClick={propose} disabled={!active.length}><SparklesIcon />Plan this week</Button>
        </>} />
      {save.conflict ? (
        <div className="bg-warning-subtle text-warning-text flex flex-wrap items-center gap-snug rounded-md px-3 py-2 text-sm">
          <span className="flex-1">Your plan changed in another tab. Open sheets keep your edits. Load the latest, then save again.</span>
          <Button size="sm" variant="secondary" onClick={() => { save.discard(); setProposal(null); void data.refetch(); }}>Load latest</Button>
        </div>
      ) : save.error && !session && !assessment && !availabilityOpen ? <ErrorState title="That didn't save" detail={save.error} onRetry={save.retry} /> : null}

      {!shown && saved && <Notice action={<Button variant="secondary" size="sm" onClick={() => setReviewing(true)}>Review</Button>}>A proposed plan for this week is waiting for you to review.</Notice>}
      {shown && (
        <Section title="Proposed plan" description={`${shown.proposal.minutesPlanned} of ${shown.proposal.minutesAvailable} available minutes. Nothing changes until you apply it.`}
          actions={<><Button variant="ghost" onClick={() => { setProposal(null); setReviewing(false); }}>Close</Button><Button loading={save.busy} onClick={() => apply(shown.id)}>Apply plan</Button></>}>
          <ul className="divide-y border-y">
            {[...shown.proposal.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes).map(s => (
              <li key={s.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-gutter">
                <span className="tabular text-muted-foreground w-36 shrink-0 text-sm">{dayLabel(s.date, { weekday: 'short', day: 'numeric' })} · {clock(s.startMinutes)}</span>
                <span className="flex min-w-0 flex-col"><span className="text-base font-medium">{s.title}</span><span className="text-muted-foreground text-sm"><bdi>{courseName(s.courseId)}</bdi> · {s.durationMinutes} min{s.reason ? ` · ${s.reason}` : ''}</span></span>
              </li>
            ))}
          </ul>
          {shown.proposal.unscheduled.length > 0 && (
            <details className="text-sm">
              <summary className="text-muted-foreground cursor-pointer">{shown.proposal.unscheduled.length} {shown.proposal.unscheduled.length === 1 ? 'item' : 'items'} didn't fit</summary>
              <ul className="mt-2 flex flex-col gap-1.5">{shown.proposal.unscheduled.map((u, i) => <li key={i}><span className="font-medium">{u.title}.</span> <span className="text-muted-foreground">{u.reason}</span></li>)}</ul>
            </details>
          )}
          {shown.proposal.notes.map(n => <p key={n} className="text-muted-foreground text-sm">{n}</p>)}
        </Section>
      )}

      <section className="flex flex-col gap-snug" aria-label="Week">
        <div className="flex flex-wrap items-center gap-tight">
          <Button variant="secondary" size="icon" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}><ChevronLeftIcon /></Button>
          <Button variant="secondary" size="icon" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}><ChevronRightIcon /></Button>
          <Button variant="ghost" onClick={() => setMonday(weekStart(r.today))} disabled={monday === weekStart(r.today)}>This week</Button>
          <h2 className="text-md font-semibold">{dayLabel(days[0]!, { day: 'numeric', month: 'short' })} to {dayLabel(days[6]!, { day: 'numeric', month: 'short', year: 'numeric' })}</h2>
        </div>
        {!r.availability.windows.length && !r.availability.exceptions.length && <Notice action={<Button variant="secondary" size="sm" onClick={() => setAvailabilityOpen(true)}>Set study hours</Button>}>No study hours set yet. Plans fit around the hours you give.</Notice>}
        {desktop ? <WeekGrid row={r} days={days} courseName={courseName} onOpen={s => setSession(draftOf(s))} onNew={(date, start) => active.length && setSession(newSession(date, start))} />
          : <Agenda row={r} days={days} courseName={courseName} onOpen={s => setSession(draftOf(s))} />}
      </section>

      <Section title="Assessments" actions={<Button variant="ghost" size="sm" disabled={!r.courses.length} onClick={() => setAssessment({ id: null, courseId: active[0]?.id ?? '', title: '', date: r.today, type: 'quiz', topicIds: [] })}><PlusIcon />Add</Button>}>
        {r.assessments.length ? (
          <ul className="divide-y border-y">
            {[...r.assessments].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')).map(a => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-snug">
                <button type="button" className="hover:bg-surface flex min-w-0 flex-1 items-center gap-snug py-2.5 text-left outline-none focus-visible:bg-surface" onClick={() => { const { id, createdAt: _c, revision: _r, source: _s, ...rest } = a as PlannedAssessment & { revision?: number; source?: unknown }; setAssessment({ ...rest, id }); }}>
                  <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-base font-medium">{a.title}</span><span className="text-muted-foreground truncate text-sm">{ASSESSMENT_LABEL[a.type]} · <bdi>{courseName(a.courseId)}</bdi>{a.date ? ` · ${dayLabel(a.date, { weekday: 'short', day: 'numeric', month: 'short' })}${a.time ? `, ${a.time}` : ''}` : ''}{a.weightPercent !== undefined ? ` · ${a.weightPercent}%` : ''}</span></span>
                  {a.date && <DueLabel date={a.date} />}
                </button>
                {a.source && <Link className="text-muted-foreground text-sm hover:underline" to={`/materials/${a.source.materialId}/versions/${a.source.versionId}#block-${a.source.blockIds[0]}`} aria-label={`${a.title} in the syllabus`}>Syllabus</Link>}
                {!a.date && <AddDate assessment={a} revision={r.revision} save={save} />}
              </li>
            ))}
          </ul>
        ) : <p className="text-muted-foreground text-base">No assessments yet. Adding them lets plans work towards their dates.</p>}
      </Section>

      {session && <SessionSheet row={r} draft={session} save={save} onClose={() => setSession(null)} />}
      {assessment && <AssessmentSheet row={r} draft={assessment} save={save} onClose={() => setAssessment(null)} />}
      {availabilityOpen && <AvailabilitySheet row={r} save={save} onClose={() => setAvailabilityOpen(false)} />}
    </Page>
  );
}

const draftOf = (s: PlannedSession): SessionDraft => ({ id: s.id, courseId: s.courseId, title: s.title, date: s.date, startMinutes: s.startMinutes, durationMinutes: s.durationMinutes, activity: s.activity, topicIds: s.topicIds, assessmentId: s.assessmentId, locked: s.locked ?? true, status: s.status });

/** Seven columns of time. Availability is a quiet band, sessions sit on top. */
function WeekGrid({ row, days, courseName, onOpen, onNew }: { row: Data; days: string[]; courseName: (id: string) => string; onOpen: (s: PlannedSession) => void; onNew: (date: string, start: number) => void }) {
  const spans = days.flatMap(d => [...windowsForDate(row.availability as Availability, d), ...row.sessions.filter(s => s.date === d).map(s => ({ startMinutes: s.startMinutes, endMinutes: s.startMinutes + s.durationMinutes }))]);
  // Show the week's own hours with an hour either side, so the grid is about
  // the time you actually have rather than an empty working day.
  const first = spans.length ? Math.min(...spans.map(s => s.startMinutes)) : 9 * 60;
  const last = spans.length ? Math.max(...spans.map(s => s.endMinutes)) : 18 * 60;
  let from = Math.max(0, Math.floor(first / 60) * 60 - 60), to = Math.min(1440, Math.ceil(last / 60) * 60 + 60);
  if (to - from < 6 * 60) { const pad = (6 * 60 - (to - from)) / 2; from = Math.max(0, from - Math.floor(pad / 60) * 60); to = Math.min(1440, from + 6 * 60); }
  const hours = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
  const HOUR = Math.round(Math.min(96, Math.max(HOUR_MIN, 480 / hours.length)));
  const y = (m: number) => ((m - from) / 60) * HOUR;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="grid min-w-[760px] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
        <div className="bg-surface border-b" />
        {days.map(d => {
          const today = d === row.today;
          return (
            <div key={d} className={cn('bg-surface flex flex-col items-center border-b border-l py-1.5', today && 'bg-primary-subtle')}>
              <span className={cn('text-xs', today ? 'text-primary-text font-semibold' : 'text-muted-foreground')}>{dayLabel(d, { weekday: 'short' })}</span>
              <span className={cn('tabular flex size-7 items-center justify-center rounded-full text-base', today && 'bg-primary text-primary-foreground font-semibold')} aria-current={today ? 'date' : undefined}>{dayLabel(d, { day: 'numeric' })}</span>
            </div>
          );
        })}
        <div className="relative" style={{ height: hours.length * HOUR }}>
          {hours.map(h => <span key={h} className="text-muted-foreground tabular absolute right-2 -translate-y-1/2 text-xs" style={{ top: y(h) }}>{h > from ? clock(h) : ''}</span>)}
        </div>
        {days.map(d => (
          <div key={d} className={cn('relative border-l', d === row.today && 'bg-primary-subtle/40')} style={{ height: hours.length * HOUR }}
            onDoubleClick={e => { const rect = e.currentTarget.getBoundingClientRect(); onNew(d, Math.round((from + ((e.clientY - rect.top) / HOUR) * 60) / 30) * 30); }}>
            {hours.map(h => <div key={h} className="absolute inset-x-0 border-t border-dashed border-border/60" style={{ top: y(h) }} />)}
            {windowsForDate(row.availability as Availability, d).map((w, i) => (
              <div key={i} className="bg-gray-4 absolute inset-x-1 rounded-sm" style={{ top: y(w.startMinutes), height: y(w.endMinutes) - y(w.startMinutes) }} title={`Free ${clock(w.startMinutes)} to ${w.endMinutes === 1440 ? '24:00' : clock(w.endMinutes)}`} />
            ))}
            {row.sessions.filter(s => s.date === d).map(s => (
              <button key={s.id} type="button" onClick={() => onOpen(s)} title={`${s.title}, ${clock(s.startMinutes)}, ${ACTIVITY_LABEL[s.activity]}, ${courseName(s.courseId)}`}
                className={cn('bg-card absolute inset-x-1.5 overflow-hidden rounded-md border px-1.5 py-1 text-left shadow-raised outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring',
                  s.status === 'completed' && 'opacity-70', s.status === 'skipped' && 'border-dashed opacity-60')}
                style={{ top: y(s.startMinutes) + 1, height: Math.max(26, y(s.startMinutes + s.durationMinutes) - y(s.startMinutes) - 2) }}>
                <span className={cn('block truncate text-xs font-medium', s.status === 'skipped' && 'line-through')}>{s.title}</span>
                <span className="text-muted-foreground block truncate text-[11px]">{clock(s.startMinutes)} · {ACTIVITY_LABEL[s.activity]} · <bdi>{courseName(s.courseId)}</bdi></span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Phones get the same week as a list by day. */
function Agenda({ row, days, courseName, onOpen }: { row: Data; days: string[]; courseName: (id: string) => string; onOpen: (s: PlannedSession) => void }) {
  return (
    <ol className="flex flex-col gap-base">
      {days.map(d => {
        const sessions = row.sessions.filter(s => s.date === d).sort((a, b) => a.startMinutes - b.startMinutes);
        const windows = windowsForDate(row.availability as Availability, d);
        return (
          <li key={d} className="flex flex-col gap-1">
            <h3 className={cn('text-sm font-semibold', d === row.today && 'text-primary-text')}>{dayLabel(d, { weekday: 'long', day: 'numeric', month: 'short' })}{d === row.today ? ' · Today' : ''}</h3>
            <p className="text-muted-foreground text-xs">{windows.length ? `Free ${windows.map(w => `${clock(w.startMinutes)} to ${w.endMinutes === 1440 ? '24:00' : clock(w.endMinutes)}`).join(', ')}` : 'No study hours'}</p>
            {sessions.length ? (
              <ul className="divide-y border-y">
                {sessions.map(s => (
                  <li key={s.id}><button type="button" onClick={() => onOpen(s)} className="hover:bg-surface flex w-full items-center gap-snug py-2 text-left">
                    <span className="tabular text-muted-foreground w-12 text-sm">{clock(s.startMinutes)}</span>
                    <span className="flex min-w-0 flex-1 flex-col"><span className={cn('truncate text-base', s.status === 'skipped' && 'line-through')}>{s.title}</span><span className="text-muted-foreground truncate text-sm">{ACTIVITY_LABEL[s.activity]} · <bdi>{courseName(s.courseId)}</bdi></span></span>
                    {s.status !== 'planned' && <Badge>{SESSION_STATUS_LABEL[s.status]}</Badge>}
                  </button></li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

type Save = ReturnType<typeof useSave>;

function SessionSheet({ row, draft, save, onClose }: { row: Data; draft: SessionDraft; save: Save; onClose: () => void }) {
  const [s, setS] = useState(draft);
  const allow = useUnsentGuard(JSON.stringify(s) !== JSON.stringify(draft));
  const set = (patch: Partial<SessionDraft>) => setS(v => ({ ...v, ...patch }));
  const editable = s.status !== 'completed';
  const submit = (status: 'planned' | 'skipped' = 'planned') => {
    const id = s.id ?? crypto.randomUUID();
    const { id: _id, status: _status, ...fields } = s;
    save.run({ path: '/v1/planner/sessions', method: 'PUT', body: { operationId: crypto.randomUUID(), expectedRevision: row.revision, id, session: { ...fields, status, assessmentId: s.assessmentId || undefined } } },
      { id: `session:${id}:${status}:${row.revision}`, invalidate, onSuccess: () => { allow(); toast.success(status === 'skipped' ? 'Session skipped' : 'Session saved'); onClose(); } });
  };
  return (
    <Sheet open onOpenChange={open => { if (!open && !save.busy) onClose(); }}>
      <SheetContent>
        <SheetHeader><SheetTitle>{s.id ? s.title || 'Session' : 'New session'}</SheetTitle>{s.id && <SheetDescription>{SESSION_STATUS_LABEL[s.status]}</SheetDescription>}</SheetHeader>
        <SheetBody>
          {s.id && <Button asChild variant="secondary" className="self-start"><Link to={activityTarget({ ...s, id: s.id })}>Open {ACTIVITY_LABEL[s.activity].toLowerCase()}</Link></Button>}
          <fieldset disabled={!editable || save.busy} className="flex flex-col gap-base">
            <Field label="Course" required><Select value={s.courseId} disabled={!!s.id} onValueChange={courseId => set({ courseId, topicIds: [], assessmentId: undefined })} options={row.courses.filter(c => !c.archived || c.id === s.courseId).map(c => ({ value: c.id, label: c.name }))} /></Field>
            <Field label="Title" required><Input maxLength={200} value={s.title} onChange={e => set({ title: e.target.value })} placeholder="Practise week 3 topics" /></Field>
            <div className="grid grid-cols-2 gap-base">
              <Field label="Date"><DateField value={s.date} onValueChange={date => set({ date })} /></Field>
              <Field label="Start"><TimeField value={s.startMinutes} onValueChange={m => set({ startMinutes: m ?? 0 })} /></Field>
              <Field label="Length"><NumberField value={s.durationMinutes} onValueChange={d => set({ durationMinutes: d ?? 5 })} min={5} max={1440} step={5} suffix="min" /></Field>
              <Field label="Activity"><Select value={s.activity} onValueChange={a => set({ activity: a as SessionActivity })} options={(Object.keys(ACTIVITY_LABEL) as SessionActivity[]).map(value => ({ value, label: ACTIVITY_LABEL[value] }))} /></Field>
            </div>
            <Field label="Topics" optional><Combobox multiple value={s.topicIds} onValueChange={topicIds => set({ topicIds })} placeholder="Any topic" options={row.topics.filter(t => t.courseId === s.courseId).map(t => ({ value: t.id, label: t.title }))} /></Field>
            <Field label="For assessment" optional><Select value={s.assessmentId ?? ''} onValueChange={v => set({ assessmentId: v || undefined })} options={[{ value: '', label: 'None' }, ...row.assessments.filter(a => a.courseId === s.courseId).map(a => ({ value: a.id, label: a.title }))]} /></Field>
            <Field layout="row" label="Keep when replanning" description="Plan this week works around it."><Switch checked={s.locked} onCheckedChange={locked => set({ locked })} /></Field>
          </fieldset>
          {!editable && <p className="text-muted-foreground text-sm">Done sessions stay in your history and can't be changed.</p>}
          {save.error && <FieldError>{save.conflict ? 'Your plan changed in another tab. Load the latest, then save again.' : save.error}</FieldError>}
        </SheetBody>
        <SheetFooter>
          {s.id && s.status === 'planned' && <Button variant="ghost" className="mr-auto" disabled={save.busy} onClick={() => submit('skipped')}>Skip session</Button>}
          <Button variant="secondary" disabled={save.busy} onClick={onClose}>Cancel</Button>
          {editable && <Button loading={save.busy} disabled={!s.courseId || !s.title.trim() || save.conflict} onClick={() => submit()}>Save session</Button>}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * An assessment the syllabus names without a date does not affect
 * scheduling, so its row asks for the date in place.
 */
function AddDate({ assessment, revision, save }: { assessment: Data['assessments'][number]; revision: number; save: Save }) {
  const [date, setDate] = useState('');
  const submit = (value: string) => {
    setDate(value);
    if (!value) return;
    const { id, courseId, createdAt: _c, revision: _r, source: _s, ...fields } = assessment as Data['assessments'][number] & { revision?: number; source?: unknown };
    save.run({ path: `/v1/courses/${courseId}/assessments`, method: 'PUT', body: { operationId: crypto.randomUUID(), expectedRevision: revision, id, assessment: { ...fields, date: value } } },
      { id: `assessment-date:${id}:${value}`, invalidate, onSuccess: () => toast.success(`${assessment.title} is on the plan`) });
  };
  return (
    <div className="flex items-center gap-tight pb-2 sm:pb-0">
      <span className="text-warning-text text-sm" id={`date-${assessment.id}`}>Add the date</span>
      <DateField className="w-44" value={date} onValueChange={submit} disabled={save.busy} aria-labelledby={`date-${assessment.id}`} />
    </div>
  );
}

function AssessmentSheet({ row, draft, save, onClose }: { row: Data; draft: AssessmentDraft; save: Save; onClose: () => void }) {
  const [a, setA] = useState(draft);
  const allow = useUnsentGuard(JSON.stringify(a) !== JSON.stringify(draft));
  const set = (patch: Partial<AssessmentDraft>) => setA(v => ({ ...v, ...patch }));
  const submit = () => {
    const id = a.id ?? crypto.randomUUID();
    const { id: _id, courseId, ...fields } = a;
    save.run({ path: `/v1/courses/${courseId}/assessments`, method: 'PUT', body: { operationId: crypto.randomUUID(), expectedRevision: row.revision, id, assessment: fields } },
      { id: `assessment:${id}:${row.revision}`, invalidate, onSuccess: () => { allow(); toast.success('Assessment saved'); onClose(); } });
  };
  return (
    <Sheet open onOpenChange={open => { if (!open && !save.busy) onClose(); }}>
      <SheetContent>
        <SheetHeader><SheetTitle>{a.id ? 'Edit assessment' : 'New assessment'}</SheetTitle></SheetHeader>
        <SheetBody>
          <fieldset disabled={save.busy} className="flex flex-col gap-base">
            <Field label="Course" required><Select value={a.courseId} disabled={!!a.id} onValueChange={courseId => set({ courseId, topicIds: [] })} options={row.courses.map(c => ({ value: c.id, label: c.name }))} /></Field>
            <Field label="Title" required><Input maxLength={200} value={a.title} onChange={e => set({ title: e.target.value })} placeholder="Midterm" /></Field>
            <div className="grid grid-cols-2 gap-base">
              <Field label="Type"><Select value={a.type} onValueChange={type => set({ type: type as AssessmentType })} options={(Object.keys(ASSESSMENT_LABEL) as AssessmentType[]).map(value => ({ value, label: ASSESSMENT_LABEL[value] }))} /></Field>
              <Field label="Date" optional description={a.date ? undefined : 'Undated assessments do not affect the plan.'}><DateField value={a.date ?? ''} clearable onValueChange={date => set({ date: date || null })} /></Field>
              <Field label="Time" optional><TimeField value={a.time ? Number(a.time.slice(0, 2)) * 60 + Number(a.time.slice(3)) : null} onValueChange={m => set({ time: m === null ? undefined : clock(m) })} /></Field>
              <Field label="Length" optional><NumberField value={a.durationMinutes ?? null} onValueChange={d => set({ durationMinutes: d ?? undefined })} min={1} max={1440} step={15} suffix="min" /></Field>
              <Field label="Weight" optional><NumberField value={a.weightPercent ?? null} onValueChange={w => set({ weightPercent: w ?? undefined })} min={0} max={100} step={5} suffix="%" /></Field>
            </div>
            <Field label="Topics covered" optional><Combobox multiple value={a.topicIds} onValueChange={topicIds => set({ topicIds })} placeholder="All topics" options={row.topics.filter(t => t.courseId === a.courseId).map(t => ({ value: t.id, label: t.title }))} /></Field>
            <Field label="Notes" optional><Input maxLength={4000} value={a.notes ?? ''} onChange={e => set({ notes: e.target.value })} /></Field>
          </fieldset>
          {save.error && <FieldError>{save.conflict ? 'Your plan changed in another tab. Load the latest, then save again.' : save.error}</FieldError>}
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" disabled={save.busy} onClick={onClose}>Cancel</Button>
          <Button loading={save.busy} disabled={!a.courseId || !a.title.trim() || save.conflict} onClick={submit}>Save assessment</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Study hours: weekly windows, one-off exceptions and a preferred session length. */
function AvailabilitySheet({ row, save, onClose }: { row: Data; save: Save; onClose: () => void }) {
  const initial = useMemo(() => structuredClone(row.availability) as Availability, [row.availability]);
  const [v, setV] = useState<Availability>(initial);
  const allow = useUnsentGuard(JSON.stringify(v) !== JSON.stringify(initial));
  const windows = [...v.windows].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7) || a.startMinutes - b.startMinutes);
  const setWindow = (id: string, patch: Partial<Availability['windows'][number]>) => setV(x => ({ ...x, windows: x.windows.map(w => w.id === id ? { ...w, ...patch } : w) }));
  const setException = (id: string, patch: Partial<Availability['exceptions'][number]>) => setV(x => ({ ...x, exceptions: x.exceptions.map(e => e.id === id ? { ...e, ...patch } : e) }));
  const bad = v.windows.some(w => w.endMinutes <= w.startMinutes) || v.exceptions.some(e => e.windows.some(w => w.endMinutes <= w.startMinutes)) || new Set(v.exceptions.map(e => e.date)).size !== v.exceptions.length;
  const submit = () => save.run({ path: '/v1/planner/availability', method: 'PUT', body: { operationId: crypto.randomUUID(), expectedRevision: row.revision, availability: v } },
    { id: `availability:${row.revision}`, invalidate, onSuccess: () => { allow(); toast.success('Study hours saved'); onClose(); } });
  return (
    <Sheet open onOpenChange={open => { if (!open && !save.busy) onClose(); }}>
      <SheetContent size="lg">
        <SheetHeader><SheetTitle>Study hours</SheetTitle><SheetDescription>When you're free to study. Plans only use these times.</SheetDescription></SheetHeader>
        <SheetBody>
          <fieldset disabled={save.busy} className="flex flex-col gap-section">
            <Field layout="row" label="Session length" description="How long a planned session usually lasts."><NumberField value={v.sessionMinutes} onValueChange={n => setV({ ...v, sessionMinutes: n ?? 30 })} min={10} max={120} step={5} suffix="min" /></Field>
            <FieldSet legend="Every week">
              {windows.length === 0 && <p className="text-muted-foreground text-sm">No weekly hours yet.</p>}
              {windows.map(w => (
                <div key={w.id} className="flex flex-wrap items-center gap-tight">
                  <Select aria-label="Day" className="w-36" value={String(w.day)} onValueChange={d => setWindow(w.id, { day: Number(d) as typeof w.day })} options={[1, 2, 3, 4, 5, 6, 0].map(n => ({ value: String(n), label: WEEKDAYS[n]! }))} />
                  <TimeField aria-label="From" value={w.startMinutes} onValueChange={m => setWindow(w.id, { startMinutes: m ?? 0 })} />
                  <span className="text-muted-foreground text-sm">to</span>
                  <TimeField aria-label="Until" endOfDay value={w.endMinutes} onValueChange={m => setWindow(w.id, { endMinutes: m ?? 1440 })} aria-invalid={w.endMinutes <= w.startMinutes || undefined} />
                  <Button variant="ghost" size="icon" aria-label="Remove these hours" onClick={() => setV({ ...v, windows: v.windows.filter(x => x.id !== w.id) })}><Trash2Icon /></Button>
                </div>
              ))}
              <Button variant="secondary" size="sm" className="self-start" disabled={v.windows.length >= 100} onClick={() => setV({ ...v, windows: [...v.windows, { id: crypto.randomUUID(), day: 1, startMinutes: 18 * 60, endMinutes: 20 * 60 }] })}><PlusIcon />Add hours</Button>
            </FieldSet>
            <FieldSet legend="Exceptions" description="Days that differ from your usual week.">
              {v.exceptions.map(e => (
                <div key={e.id} className="bg-surface flex flex-col gap-tight rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-tight">
                    <DateField aria-label="Date" value={e.date} onValueChange={date => setException(e.id, { date })} />
                    <Input aria-label="Note" className="min-w-40 flex-1" maxLength={1000} placeholder="Note, such as Travel" value={e.note ?? ''} onChange={x => setException(e.id, { note: x.target.value || undefined })} />
                    <Button variant="ghost" size="icon" aria-label="Remove exception" onClick={() => setV({ ...v, exceptions: v.exceptions.filter(x => x.id !== e.id) })}><Trash2Icon /></Button>
                  </div>
                  {e.windows.length === 0 && <p className="text-muted-foreground text-sm">No study this day.</p>}
                  {e.windows.map((w, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-tight">
                      <TimeField aria-label="From" value={w.startMinutes} onValueChange={m => setException(e.id, { windows: e.windows.map((x, j) => j === i ? { ...x, startMinutes: m ?? 0 } : x) })} />
                      <span className="text-muted-foreground text-sm">to</span>
                      <TimeField aria-label="Until" endOfDay value={w.endMinutes} onValueChange={m => setException(e.id, { windows: e.windows.map((x, j) => j === i ? { ...x, endMinutes: m ?? 1440 } : x) })} />
                      <Button variant="ghost" size="icon" aria-label="Remove these hours" onClick={() => setException(e.id, { windows: e.windows.filter((_, j) => j !== i) })}><Trash2Icon /></Button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="self-start" onClick={() => setException(e.id, { windows: [...e.windows, { startMinutes: 18 * 60, endMinutes: 20 * 60 }] })}><PlusIcon />Add hours</Button>
                </div>
              ))}
              <Button variant="secondary" size="sm" className="self-start" onClick={() => setV({ ...v, exceptions: [...v.exceptions, { id: crypto.randomUUID(), date: addDays(row.today, 1), windows: [] }] })}><PlusIcon />Add exception</Button>
            </FieldSet>
          </fieldset>
          {bad && <FieldError>Each end time must be after its start, and each exception needs its own date.</FieldError>}
          {save.error && <FieldError>{save.conflict ? 'Your plan changed in another tab. Load the latest, then save again.' : save.error}</FieldError>}
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" disabled={save.busy} onClick={onClose}>Cancel</Button>
          <Button loading={save.busy} disabled={bad || save.conflict} onClick={submit}>Save study hours</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
