import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArchiveIcon, ArchiveRestoreIcon, ArrowRightIcon, ListTreeIcon, MoreHorizontalIcon, SettingsIcon } from 'lucide-react';
import type { Course } from '@shared/contracts/workspace';

import { DueLabel, MODE_LABEL, formatRelative } from '@/components/domain';
import { Page, PageHeader, Section } from '@/components/layout';
import { EmptyState, ErrorState, PageLoading } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/ui/alert-dialog';
import { ShortList, TopicReadiness, type ProgressData } from '@/features/progress/parts';
import { useApi, useSave } from '@/lib/data';
import { keys } from '@/lib/query';

/** Course overview: readiness by topic, what is due, and the next action. */
export function CourseOverview() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const data = useApi<ProgressData>('/v1/progress');
  const course = useApi<{ course: Course }>(`/v1/courses/${id}/topics`);
  const save = useSave();
  if (data.isPending || course.isPending) return <Page><PageLoading label="Loading course" /></Page>;
  if (course.error || data.error) return <Page><ErrorState error={course.error ?? data.error} onRetry={() => { void course.refetch(); void data.refetch(); }} /></Page>;
  const row = data.data, info = course.data.course;
  const run = row.runs.find(r => r.courseId === id);
  const topics = row.topics.filter(t => t.courseId === id);
  const recent = row.attempts.filter(a => a.courseId === id && a.completedAt).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!)).slice(0, 5);
  const archive = async () => {
    if (!info.archived && !await confirm({ title: `Archive ${info.name}?`, description: 'It leaves your active courses. Everything in it is kept, and you can restore it any time.', confirmLabel: 'Archive course' })) return;
    save.run<Course>({ path: `/v1/courses/${id}`, method: 'PATCH', body: { operationId: crypto.randomUUID(), archived: !info.archived, expectedRevision: info.revision } },
      { id: `archive:${info.revision}`, invalidate: [keys.courses.all, keys.progress], onSuccess: saved => { course.setData({ ...course.data, course: saved }); toast.success(saved.archived ? 'Course archived' : 'Course restored'); } });
  };
  return (
    <Page>
      <PageHeader display title={info.name} description={info.goal || info.description || undefined}
        actions={<>
          {info.archived && <Badge>Archived</Badge>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="secondary" size="icon" aria-label="Course options"><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => navigate(`/course/${id}/syllabus`)}><ListTreeIcon />Edit outline</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate(`/course/${id}/settings`)}><SettingsIcon />Course settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={save.busy} onSelect={() => void archive()}>{info.archived ? <><ArchiveRestoreIcon />Restore course</> : <><ArchiveIcon />Archive course</>}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {run
            ? <Button asChild size="lg"><Link to={`/runs/${run.id}`}>Continue<ArrowRightIcon /></Link></Button>
            : <Button asChild size="lg"><Link to={`/course/${id}/practice`}>Start practice</Link></Button>}
        </>} />
      {save.error && <ErrorState title="The course was not updated" detail={save.error} onRetry={save.retry} />}
      <Section title="Topic readiness" description={topics.length ? `${row.evidence.filter(e => e.courseId === id && (e.level === 'independent-once' || e.level === 'retained')).length} of ${topics.length} topics answered unaided` : undefined}>
        {topics.length
          ? <TopicReadiness row={row} courseId={id} />
          : <EmptyState compact title="No topics yet" description="Outline the course to track readiness topic by topic." action={<Button asChild variant="secondary"><Link to={`/course/${id}/syllabus`}>Add topics</Link></Button>} />}
      </Section>
      <div className="grid gap-section lg:grid-cols-3">
        <Section title="Due for review">
          <ShortList empty="Nothing due."
            items={row.due.filter(d => d.courseId === id).slice(0, 6).map(d => ({ key: d.topicId, to: `/course/${id}/practice?topicId=${d.topicId}`, title: row.topics.find(t => t.id === d.topicId)?.title ?? 'Topic', meta: `${d.daysSince} days since you studied it` }))} />
        </Section>
        <Section title="Upcoming assessments">
          <ShortList empty="None planned."
            items={row.assessments.filter(a => a.courseId === id).sort((a, b) => a.date.localeCompare(b.date)).map(a => ({ key: a.id, to: '/planner', title: a.title, trailing: <DueLabel date={a.date} /> }))} />
        </Section>
        <Section title="Recent activity">
          <ShortList empty="No finished practice yet."
            items={recent.map(a => ({ key: a.id, to: `/attempts/${a.id}`, title: a.title, meta: `${MODE_LABEL[a.mode]} · ${formatRelative(a.completedAt!)}`, trailing: a.marksAvailable ? <span className="tabular text-muted-foreground text-sm">{a.marksAwarded}/{a.marksAvailable}</span> : undefined }))} />
        </Section>
      </div>
    </Page>
  );
}
