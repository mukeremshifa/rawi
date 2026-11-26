import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArchiveIcon, ArchiveRestoreIcon, PlusIcon, SearchIcon, SettingsIcon } from 'lucide-react';
import { createCourseInput, type Course, type CourseDetail, type CreateCourseInput } from '@shared/contracts/workspace';
import type { ProgressView } from '../../../server/api-types';

import { DueLabel, formatRelative } from '@/components/domain';
import { Page, PageHeader, Toolbar } from '@/components/layout';
import { EmptyState, ErrorState } from '@/components/states';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DropdownMenuItem, RowActions } from '@/components/ui/dropdown-menu';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableLoading,
  TableRow,
} from '@/components/ui/table';
import { lastStudied } from '@/features/progress/parts';
import { useApi, useApiPages, useSave } from '@/lib/data';
import { useUnsentGuard } from '@/lib/hooks';
import { keys } from '@/lib/query';

/** Courses: search, Active or Archived, and a table of courses. */
export function CourseLibrary() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'false' | 'true'>('false');
  const [query, setQuery] = useState('');
  const pages = useApiPages<Course, 'courses'>(`/v1/courses?archived=${status}`, 'courses');
  const progress = useApi<ProgressView>('/v1/progress');
  const save = useSave();
  const creating = params.get('new') === '1';
  const setCreating = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set('new', '1');
    else next.delete('new');
    setParams(next, { replace: true });
  };
  const rows = useMemo(
    () => (pages.items ?? []).filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase())),
    [pages.items, query],
  );
  const facts = (id: string) => {
    const p = progress.data;
    if (!p) return null;
    const deadline = p.assessments.filter(a => a.courseId === id).sort((a, b) => a.date.localeCompare(b.date))[0];
    const last = lastStudied(
      p.evidence
        .filter(e => e.courseId === id && e.lastWorkedAt)
        .map(e => e.lastWorkedAt!)
        .sort()
        .at(-1),
      p.mastery
        .filter(m => m.courseId === id && m.lastDay)
        .map(m => m.lastDay!)
        .sort()
        .at(-1),
    );
    return { topics: p.topics.filter(t => t.courseId === id).length, deadline, last };
  };
  const archive = (course: Course) =>
    save.run<Course>(
      {
        path: `/v1/courses/${course.id}`,
        method: 'PATCH',
        body: { operationId: crypto.randomUUID(), archived: !course.archived, expectedRevision: course.revision },
      },
      {
        id: `archive:${course.id}:${course.revision}`,
        invalidate: [keys.courses.all, keys.progress],
        onSuccess: saved => toast.success(saved.archived ? `${saved.name} archived` : `${saved.name} restored`),
      },
    );
  return (
    <Page>
      <PageHeader
        title="Courses"
        actions={
          <Button size="lg" onClick={() => setCreating(true)}>
            <PlusIcon />
            New course
          </Button>
        }
      />
      <div className="flex flex-col gap-snug">
        <Toolbar>
          <div className="relative w-64 max-w-full">
            <SearchIcon
              className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
              aria-hidden
            />
            <Input
              aria-label="Search courses"
              placeholder="Search courses"
              className="pl-8"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <SegmentedControl
            aria-label="Course status"
            value={status}
            onValueChange={setStatus}
            options={[
              { value: 'false', label: 'Active' },
              { value: 'true', label: 'Archived' },
            ]}
          />
        </Toolbar>
        {save.error && <ErrorState title="The course was not updated" detail={save.error} onRetry={save.retry} />}
        {pages.error ? (
          <ErrorState error={pages.error} onRetry={() => void pages.refetch()} />
        ) : !pages.isPending && !pages.items?.length && status === 'false' ? (
          <EmptyState
            title="No courses yet"
            description="A course holds a syllabus, its materials and your practice."
            action={
              <Button onClick={() => setCreating(true)}>
                <PlusIcon />
                New course
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead className="hidden w-20 sm:table-cell">Topics</TableHead>
                <TableHead className="hidden w-36 md:table-cell">Next deadline</TableHead>
                <TableHead className="hidden w-32 md:table-cell">Last studied</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.isPending && <TableLoading colSpan={5} rows={3} />}
              {!pages.isPending && rows.length === 0 && (
                <TableEmpty colSpan={5}>{query ? 'No courses match your search.' : 'No archived courses.'}</TableEmpty>
              )}
              {rows.map(course => {
                const f = facts(course.id);
                return (
                  <TableRow key={course.id} onClick={() => navigate(`/course/${course.id}`)}>
                    <TableCell className="max-w-0 py-2">
                      <div className="flex items-center gap-snug">
                        <Avatar name={course.name} shape="square" size="lg" />
                        <div className="min-w-0">
                          <Link
                            to={`/course/${course.id}`}
                            onClick={e => e.stopPropagation()}
                            className="block truncate font-medium hover:underline"
                          >
                            {course.name}
                          </Link>
                          {course.description && (
                            <span className="text-muted-foreground block truncate text-sm">{course.description}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular hidden sm:table-cell">
                      {f ? f.topics : ''}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {f &&
                        (f.deadline ? (
                          <DueLabel date={f.deadline.date} />
                        ) : (
                          <span className="text-muted-foreground text-sm">None</span>
                        ))}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                      {f && (f.last ? formatRelative(f.last) : 'Not yet')}
                    </TableCell>
                    <TableCell>
                      <RowActions label={`Actions for ${course.name}`}>
                        <DropdownMenuItem onSelect={() => navigate(`/course/${course.id}/settings`)}>
                          <SettingsIcon />
                          Course settings
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={save.busy} onSelect={() => archive(course)}>
                          {course.archived ? (
                            <>
                              <ArchiveRestoreIcon />
                              Restore
                            </>
                          ) : (
                            <>
                              <ArchiveIcon />
                              Archive
                            </>
                          )}
                        </DropdownMenuItem>
                      </RowActions>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {pages.hasNextPage && (
          <Button
            variant="secondary"
            className="self-start"
            loading={pages.isFetchingNextPage}
            onClick={() => void pages.fetchNextPage()}
          >
            Load more
          </Button>
        )}
      </div>
      <NewCourseDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
}

/**
 * New course: a name only. On success the learner lands on the course page,
 * where the syllabus and materials go. A failed create keeps its id, so Retry
 * cannot make a second course.
 */
function NewCourseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [id, setId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState<CreateCourseInput | null>(null);
  const [invalid, setInvalid] = useState('');
  const save = useSave();
  const allow = useUnsentGuard((open && !!name) || !!submitted);
  const create = () => {
    const parsed = createCourseInput.safeParse(submitted ?? { id, name });
    if (!parsed.success) {
      setInvalid('Enter a course name of up to 200 characters.');
      return;
    }
    setInvalid('');
    setSubmitted(parsed.data);
    save.run<CourseDetail>(
      { path: '/v1/courses', body: parsed.data },
      {
        id: `create:${parsed.data.id}`,
        invalidate: [keys.courses.all, keys.progress],
        onSuccess: result => {
          allow();
          setSubmitted(null);
          setName('');
          setId(crypto.randomUUID());
          navigate(`/course/${result.course.id}`);
        },
      },
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!save.busy) onOpenChange(next);
      }}
    >
      <DialogContent>
        <form
          onSubmit={e => {
            e.preventDefault();
            create();
          }}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>New course</DialogTitle>
            <DialogDescription>
              Name it now. Add the syllabus and materials next, and Rawi outlines the course from them.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Course name" required error={invalid || undefined}>
              <Input
                autoFocus
                maxLength={200}
                value={name}
                disabled={!!submitted}
                onChange={e => setName(e.target.value)}
                placeholder="Introductory statistics"
              />
            </Field>
            {save.error && (
              <FieldError>
                {save.error} Retry sends the same request, so it cannot create a duplicate.{' '}
                <Link to={`/course/${submitted?.id}`} className="underline">
                  Check whether it was saved
                </Link>
                .
              </FieldError>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={save.busy}
              onClick={() => {
                if (submitted && !save.busy) {
                  save.discard();
                  setSubmitted(null);
                  setId(crypto.randomUUID());
                }
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={save.busy} disabled={!name.trim() && !submitted}>
              {save.status === 'failed' ? 'Retry' : 'Create course'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
