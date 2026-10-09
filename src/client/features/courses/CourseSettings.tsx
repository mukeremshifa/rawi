import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { courseFields, type Course } from '@shared/contracts/workspace';

import { Page, PageHeader, SectionHeader } from '@/components/layout';
import { ErrorState, PageLoading, SaveIndicator } from '@/components/states';
import { useConfirm } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAccount } from '@/lib/account';
import { errorMessage, request } from '@/lib/api';
import { useApi, useSave } from '@/lib/data';
import { useUnsentGuard } from '@/lib/hooks';
import { keys } from '@/lib/query';

type Fields = { name: string; description: string };
const fieldsOf = (c: Course): Fields => ({ name: c.name, description: c.description });

/** Course settings: name, description and archive. The outline lives on the course page. */
export function CourseSettings() {
  const { id = '' } = useParams();
  const course = useApi<Course>(`/v1/courses/${id}`);
  if (course.isPending) return <Page width="narrow"><PageLoading label="Loading course" /></Page>;
  if (course.error) return <Page width="narrow"><ErrorState error={course.error} onRetry={() => void course.refetch()} /></Page>;
  return <LoadedSettings key={id} initial={course.data} onSaved={course.setData} />;
}

function LoadedSettings({ initial, onSaved }: { initial: Course; onSaved: (course: Course) => void }) {
  const { user } = useAccount();
  const confirm = useConfirm();
  const [base, setBase] = useState(initial);
  const [fields, setFields] = useState(fieldsOf(initial));
  const [review, setReview] = useState<Course | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [invalid, setInvalid] = useState('');
  const save = useSave();
  const dirty = JSON.stringify(fields) !== JSON.stringify(fieldsOf(base));
  useUnsentGuard(dirty || save.pending);
  const accept = (next: Course) => { setBase(next); onSaved(next); };

  const submit = (archived?: boolean) => {
    const parsed = courseFields.safeParse(fields);
    if (!parsed.success) { setInvalid('Enter a course name and check the field lengths.'); return; }
    setInvalid('');
    save.run<Course>({ path: `/v1/courses/${base.id}`, method: 'PATCH', body: { ...parsed.data, operationId: crypto.randomUUID(), ...(archived === undefined ? {} : { archived }), expectedRevision: base.revision } }, {
      id: `course:${base.revision}:${archived}`, invalidate: [keys.courses.all, keys.progress, keys.course(base.id).all],
      onSuccess: course => { accept(course); setFields(fieldsOf(course)); if (archived !== undefined) toast.success(course.archived ? 'Course archived' : 'Course restored'); },
    });
  };
  const loadReview = async () => {
    setReviewError('');
    try { setReview(await request<Course>(`/v1/courses/${base.id}`, user.id)); } catch (e) { setReviewError(errorMessage(e)); }
  };

  return (
    <Page width="narrow">
      <PageHeader title="Course settings" description={base.name} actions={base.archived ? <Badge>Archived</Badge> : undefined} />
      {save.conflict && (
        <div className="bg-warning-subtle text-warning-text flex flex-wrap items-center gap-snug rounded-md px-3 py-2 text-sm">
          <span className="flex-1">This course changed in another tab. Your edits are kept here.</span>
          <Button size="sm" variant="secondary" onClick={() => void loadReview()}>Review latest</Button>
        </div>
      )}
      {reviewError && <FieldError>{reviewError}</FieldError>}
      <form className="flex flex-col gap-section" onSubmit={e => { e.preventDefault(); submit(); }}>
        <section className="flex flex-col gap-1">
          <div className="divide-y border-y">
            <Field layout="row" label="Course name" required><Input maxLength={200} value={fields.name} onChange={e => setFields({ ...fields, name: e.target.value })} /></Field>
            <Field layout="row" label="Description" optional description="A sentence about the course. Shown on the course page and given to the tutor."><Textarea maxLength={4000} value={fields.description} onChange={e => setFields({ ...fields, description: e.target.value })} /></Field>
          </div>
          {invalid && <FieldError className="pt-2">{invalid}</FieldError>}
          <div className="flex flex-wrap items-center justify-end gap-snug pt-3">
            <SaveIndicator status={save.status} dirty={dirty} error={save.conflict ? undefined : save.error} onRetry={save.conflict ? undefined : save.retry} />
            <Button type="submit" loading={save.busy} disabled={(!dirty && !save.pending) || save.conflict}>Save changes</Button>
          </div>
        </section>
        <section className="flex flex-col gap-snug">
          <SectionHeader title={base.archived ? 'Restore course' : 'Archive course'} description={base.archived ? 'Return it to your active courses.' : 'Remove it from your active courses. Everything in it is kept, and you can restore it any time.'} />
          <Button type="button" variant="secondary" className="self-start" disabled={save.busy || dirty || save.conflict}
            onClick={async () => { if (base.archived || await confirm({ title: `Archive ${base.name}?`, description: 'It leaves your active courses. Nothing is deleted.', confirmLabel: 'Archive course' })) submit(!base.archived); }}>
            {base.archived ? 'Restore course' : 'Archive course'}
          </Button>
          {dirty && <p className="text-muted-foreground text-sm">Save or undo your changes first.</p>}
        </section>
      </form>

      <Dialog open={!!review} onOpenChange={open => { if (!open) setReview(null); }}>
        {review && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Latest saved version</DialogTitle>
              <DialogDescription>Compare it with your edits, then choose which to keep.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <p className="font-medium">{review.name}</p>
              {review.description && <p className="text-muted-foreground">{review.description}</p>}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => { save.discard(); accept(review); setFields(fieldsOf(review)); setReview(null); }}>Use the saved version</Button>
              <Button onClick={() => { save.discard(); accept(review); setReview(null); }}>Keep my edits</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}
