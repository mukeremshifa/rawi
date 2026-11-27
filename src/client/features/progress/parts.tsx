import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProgressView } from '../../../server/api-types';
import type { CheckInMood } from '@shared/domain/types';
import { formatMinutes as clock } from '@shared/domain/planner';

import { MOOD_LABEL, formatMinutes, formatRelative, formatRelativeInline } from '@/components/domain';
import { EvidenceMeter, MasteryMeter } from '@/components/Meter';
import { Button } from '@/components/ui/button';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NumberField } from '@/components/ui/number-field';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSave } from '@/lib/data';
import { useUnsentGuard } from '@/lib/hooks';
import { keys } from '@/lib/query';
import { cn } from '@/lib/utils';

export type ProgressData = ProgressView;

/** "09:00", from minutes after midnight. */
export const timeOfDay = (minutes: number) => clock(minutes);

/** The later of a topic's last finished attempt and its last marked answer, which includes tutor questions. */
export function lastStudied(attemptAt?: string | null, answerDay?: string | null) {
  const answered = answerDay ? `${answerDay}T12:00:00` : null;
  return (
    [attemptAt, answered]
      .filter((d): d is string => !!d)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .at(-1) ?? null
  );
}

export function courseName(row: ProgressData, id: string) {
  return row.courses.find(c => c.id === id)?.name ?? 'Course';
}

/** One topic's mastery, when it was last studied, and a way to practise it, in a line. */
export function TopicStatus({ row, topicId }: { row: ProgressData; topicId: string }) {
  const evidence = row.evidence.find(e => e.topicId === topicId);
  const mastery = row.mastery.find(m => m.topicId === topicId);
  const last = lastStudied(evidence?.lastWorkedAt, mastery?.lastDay);
  const courseId = row.topics.find(t => t.id === topicId)?.courseId;
  return (
    <span className="flex flex-wrap items-center gap-x-snug gap-y-1 text-sm">
      <MasteryMeter
        level={mastery?.level ?? 'not-checked'}
        secure={mastery?.secure ?? 0}
        sections={mastery?.sections ?? 0}
      />
      {last && <span className="text-muted-foreground">Studied {formatRelativeInline(last)}</span>}
      {courseId && (
        <Link className="text-primary hover:underline" to={`/course/${courseId}/practice?topicId=${topicId}`}>
          Practise
        </Link>
      )}
    </span>
  );
}

/**
 * Topic readiness: each topic's mastery from all its marked answers, its
 * evidence from unaided exam work, when it was last studied, and a way to
 * practise it. Used on the course overview and on Progress.
 */
export function TopicReadiness({
  row,
  courseId,
  showCourse,
  emptyAction,
}: {
  row: ProgressData;
  courseId?: string;
  showCourse?: boolean;
  emptyAction?: React.ReactNode;
}) {
  const archived = new Set(row.courses.filter(c => c.archived).map(c => c.id));
  // Across courses, each course's topics stay together, in outline order.
  const order = new Map(row.courses.map((c, i) => [c.id, i]));
  const topics = row.topics
    .filter(t => (courseId ? t.courseId === courseId : !archived.has(t.courseId)))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (order.get(a.t.courseId) ?? 0) - (order.get(b.t.courseId) ?? 0) || a.i - b.i)
    .map(({ t }) => t);
  return (
    <>
      {/* On a phone each topic is a short stacked row. The table needs more width than a phone has. */}
      <ul className="flex flex-col divide-y border-y sm:hidden">
        {topics.length === 0 && (
          <li className="text-muted-foreground py-3 text-base">{emptyAction ?? 'No topics yet.'}</li>
        )}
        {topics.map(topic => (
          <li key={topic.id} className="flex flex-col gap-1 py-2.5">
            <span className="font-medium">{topic.title}</span>
            {showCourse && <span className="text-muted-foreground text-sm">{courseName(row, topic.courseId)}</span>}
            <TopicStatus row={row} topicId={topic.id} />
          </li>
        ))}
      </ul>
      <div className="hidden sm:block">
        <ReadinessTable row={row} topics={topics} showCourse={showCourse} emptyAction={emptyAction} />
      </div>
    </>
  );
}

function ReadinessTable({
  row,
  topics,
  showCourse,
  emptyAction,
}: {
  row: ProgressData;
  topics: ProgressData['topics'];
  showCourse?: boolean;
  emptyAction?: React.ReactNode;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Topic</TableHead>
          <TableHead>Mastery</TableHead>
          <TableHead className="hidden md:table-cell">Exam evidence</TableHead>
          <TableHead className="hidden sm:table-cell">Last studied</TableHead>
          <TableHead className="w-24">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {topics.length === 0 && <TableEmpty colSpan={5}>{emptyAction ?? 'No topics yet.'}</TableEmpty>}
        {topics.map(topic => {
          const evidence = row.evidence.find(e => e.topicId === topic.id);
          const mastery = row.mastery.find(m => m.topicId === topic.id);
          const last = lastStudied(evidence?.lastWorkedAt, mastery?.lastDay);
          return (
            <TableRow key={topic.id}>
              <TableCell className="max-w-0 min-w-40">
                <span className="block truncate font-medium">{topic.title}</span>
                {showCourse && (
                  <span className="text-muted-foreground block truncate text-sm">
                    {courseName(row, topic.courseId)}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <MasteryMeter
                  level={mastery?.level ?? 'not-checked'}
                  secure={mastery?.secure ?? 0}
                  sections={mastery?.sections ?? 0}
                />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <EvidenceMeter level={evidence?.level ?? 'not-checked'} />
              </TableCell>
              <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                {last ? formatRelative(last) : 'Not yet'}
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/course/${topic.courseId}/practice?topicId=${topic.id}`}>Practise</Link>
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** A short list inside a page section. Rows are links. */
export function ShortList({
  items,
  empty,
}: {
  items: { key: string; to?: string; title: React.ReactNode; meta?: React.ReactNode; trailing?: React.ReactNode }[];
  empty: string;
}) {
  if (!items.length) return <p className="text-muted-foreground py-2 text-base">{empty}</p>;
  return (
    <ul className="divide-y border-y">
      {items.map(item => {
        const body = (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-base">{item.title}</span>
              {item.meta && <span className="text-muted-foreground truncate text-sm">{item.meta}</span>}
            </span>
            {item.trailing && <span className="shrink-0">{item.trailing}</span>}
          </>
        );
        return (
          <li key={item.key}>
            {item.to ? (
              <Link
                to={item.to}
                className="hover:bg-surface focus-visible:bg-surface flex items-center gap-snug py-2 outline-none"
              >
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-snug py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const MOODS: CheckInMood[] = ['on-track', 'confident', 'struggling', 'less-time'];

/**
 * The daily check-in, as one quiet prompt. Picking a mood reveals optional
 * minutes and a note. Saved only when the server acknowledges it.
 */
export function CheckInPrompt({ row, courseId }: { row: ProgressData; courseId?: string }) {
  const save = useSave();
  const [mood, setMood] = useState<CheckInMood | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [note, setNote] = useState('');
  useUnsentGuard((!!mood && (minutes !== null || !!note)) || save.pending);
  const today = row.checkIns.filter(c => !courseId || c.courseId === courseId).at(-1);
  if (today && !mood) {
    return (
      <p className="text-muted-foreground text-base">
        Checked in today: <span className="text-foreground">{MOOD_LABEL[today.mood]}</span>
        {today.minutesToday !== undefined ? `, ${formatMinutes(today.minutesToday)} available` : ''}.
      </p>
    );
  }
  const submit = () => {
    if (!mood) return;
    save.run(
      {
        path: '/v1/planner/check-ins',
        body: {
          operationId: crypto.randomUUID(),
          checkIn: {
            mood,
            ...(courseId ? { courseId } : {}),
            ...(minutes !== null ? { minutesToday: minutes } : {}),
            ...(note.trim() ? { note } : {}),
          },
        },
      },
      {
        id: 'check-in',
        invalidate: [keys.progress, keys.planner],
        onSuccess: () => {
          setMood(null);
          setMinutes(null);
          setNote('');
        },
      },
    );
  };
  return (
    <div className="flex flex-col gap-snug">
      <div className="flex flex-wrap items-center gap-x-snug gap-y-tight">
        <span id="check-in-label" className="text-base font-medium">
          How is study going?
        </span>
        <div role="radiogroup" aria-labelledby="check-in-label" className="flex flex-wrap gap-1.5">
          {MOODS.map(value => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mood === value}
              disabled={save.busy}
              onClick={() => setMood(mood === value ? null : value)}
              className={cn(
                'h-7 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                mood === value
                  ? 'border-primary bg-primary-subtle text-primary-text font-medium'
                  : 'bg-card hover:bg-accent text-foreground',
              )}
            >
              {MOOD_LABEL[value]}
            </button>
          ))}
        </div>
      </div>
      {mood && (
        <form
          className="flex flex-wrap items-end gap-snug"
          onSubmit={e => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Minutes free today" optional>
            <NumberField value={minutes} onValueChange={setMinutes} min={0} max={1440} step={15} suffix="min" />
          </Field>
          <Field label="Note" optional className="min-w-48 flex-1">
            <Input
              maxLength={4000}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Anything that would help plan"
            />
          </Field>
          <Button type="submit" loading={save.busy}>
            {save.status === 'failed' ? 'Retry check-in' : 'Save check-in'}
          </Button>
        </form>
      )}
      {save.error && <FieldError>{save.error}</FieldError>}
    </div>
  );
}
