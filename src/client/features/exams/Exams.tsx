import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArchiveIcon, ArchiveRestoreIcon, CopyIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import type { z } from 'zod';
import { createExamInput, type SavedExam } from '@shared/contracts/exams';
import { formats, type LearningRun } from '@shared/contracts/learning';
import type { CourseDetail } from '@shared/contracts/workspace';
import type { Material } from '@shared/contracts/materials';
import type { QuestionFormat } from '@shared/domain/types';
import type { PlannerView } from '../../../server/api-types';

import { BOOK_LABEL, FORMAT_LABEL, NAVIGATION_LABEL, TIMING_LABEL } from '@/components/domain';
import { Page, PageHeader } from '@/components/layout';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenuItem, DropdownMenuSeparator, RowActions } from '@/components/ui/dropdown-menu';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { List, ListLoading, ListRow } from '@/components/ui/list';
import { NumberField } from '@/components/ui/number-field';
import { RadioCards, RadioGroup } from '@/components/ui/radio-group';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useApi, useApiAll, useApiPages, useSave } from '@/lib/data';
import { useUnsentGuard } from '@/lib/hooks';
import { activityKeys, keys } from '@/lib/query';

type Config = z.infer<typeof createExamInput>['config'];
type Section = Config['sections'][number];
const newSection = (n: number): Section => ({
  id: crypto.randomUUID(),
  title: `Section ${n}`,
  instructions: '',
  formats: ['multiple-choice'],
  topicIds: [],
  count: 5,
  minutes: 15,
});
const blank = (): Config => ({
  name: '',
  sections: [newSection(1)],
  timing: 'overall',
  totalMinutes: 30,
  extraTimePercent: 0,
  book: 'closed',
  allowedMaterialIds: [],
  navigation: 'free',
  flaggingEnabled: true,
  lockSectionsOnFinish: false,
});
const EXAM_FORMATS = formats
  .filter(f => f !== 'flashcard' && f !== 'self-check')
  .map(f => ({ value: f, label: FORMAT_LABEL[f as QuestionFormat] }));

/** Exams: saved rehearsals with Start, and New rehearsal in a sheet. */
export function Exams() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const planned = params.get('plannedSessionId');
  const [status, setStatus] = useState<'false' | 'true'>('false');
  const library = useApiPages<SavedExam, 'exams'>(`/v1/courses/${id}/exams?limit=100`, 'exams');
  const save = useSave();
  const [editing, setEditing] = useState<Config | null>(null);
  const [renaming, setRenaming] = useState<SavedExam | null>(null);
  const rows = library.items?.filter(e => e.archived === (status === 'true')) ?? [];
  const patch = (e: SavedExam, change: { name?: string; archived?: boolean }, done?: () => void) =>
    save.run<SavedExam>(
      {
        path: `/v1/exams/${e.id}`,
        method: 'PATCH',
        body: {
          operationId: crypto.randomUUID(),
          expectedRevision: e.revision,
          name: change.name ?? e.config.name,
          archived: change.archived ?? e.archived,
        },
      },
      {
        id: `exam:${e.id}:${e.revision}:${change.name ?? ''}:${change.archived ?? ''}`,
        invalidate: [keys.course(id).exams],
        onSuccess: saved => {
          done?.();
          if (change.archived !== undefined)
            toast.success(saved.archived ? 'Rehearsal archived' : 'Rehearsal restored');
        },
      },
    );
  const start = (e: SavedExam) =>
    save.run<LearningRun>(
      {
        path: `/v1/exams/${e.id}/runs`,
        body: { id: crypto.randomUUID(), ...(planned ? { plannedSessionId: planned } : {}) },
      },
      {
        id: `start:${e.id}`,
        invalidate: [keys.course(id).runs, ...activityKeys],
        onSuccess: run => navigate(`/runs/${run.id}`),
      },
    );
  const copyOf = (e: SavedExam): Config => {
    const {
      id: _id,
      courseId: _course,
      savedAt: _saved,
      preset: _preset,
      archived: _archived,
      ...fields
    } = e.config as typeof e.config & { savedAt?: string; preset?: boolean };
    return {
      ...(fields as Config),
      name: `${e.config.name} copy`,
      sections: e.config.sections.map(s => ({ ...s, id: crypto.randomUUID() })) as Section[],
    };
  };
  return (
    <Page>
      <PageHeader
        title="Exams"
        description="Timed rehearsals with no feedback until you submit the whole paper."
        actions={
          <Button size="lg" onClick={() => setEditing(blank())}>
            <PlusIcon />
            New rehearsal
          </Button>
        }
      />
      <div className="flex flex-col gap-snug">
        <SegmentedControl
          aria-label="Rehearsal status"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: 'false', label: 'Active' },
            { value: 'true', label: 'Archived' },
          ]}
        />
        {save.error && (
          <ErrorState
            title="That didn't work"
            detail={save.conflict ? 'This rehearsal changed in another tab. The list has been refreshed.' : save.error}
            onRetry={
              save.conflict
                ? () => {
                    save.discard();
                    void library.refetch();
                  }
                : save.retry
            }
            retryLabel={save.conflict ? 'Dismiss' : 'Try again'}
          />
        )}
        {library.error ? (
          <ErrorState error={library.error} onRetry={() => void library.refetch()} />
        ) : library.isPending ? (
          <ListLoading rows={3} />
        ) : !rows.length ? (
          <EmptyState
            compact
            title={status === 'true' ? 'No archived rehearsals' : 'No rehearsals yet'}
            description={
              status === 'true'
                ? undefined
                : 'Set up a paper like the real one: sections, timing and what you may consult.'
            }
            action={
              status === 'false' ? (
                <Button variant="secondary" onClick={() => setEditing(blank())}>
                  <PlusIcon />
                  New rehearsal
                </Button>
              ) : undefined
            }
          />
        ) : (
          <List>
            {rows.map(e => (
              <ListRow
                key={e.id}
                title={e.config.name}
                meta={`${e.config.sections.length} ${e.config.sections.length === 1 ? 'section' : 'sections'} · ${e.config.sections.reduce((n, s) => n + s.count, 0)} questions · ${TIMING_LABEL[e.config.timing]}${e.config.timing === 'overall' ? `, ${e.config.totalMinutes} min` : ''} · ${BOOK_LABEL[e.config.book]}`}
                actions={
                  <>
                    {!e.archived && (
                      <Button variant="secondary" size="sm" disabled={save.busy} onClick={() => start(e)}>
                        <PlayIcon />
                        Start
                      </Button>
                    )}
                    <RowActions label={`Actions for ${e.config.name}`}>
                      <DropdownMenuItem onSelect={() => setRenaming(e)}>
                        <PencilIcon />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setEditing(copyOf(e))}>
                        <CopyIcon />
                        New rehearsal from this
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled={save.busy} onSelect={() => patch(e, { archived: !e.archived })}>
                        {e.archived ? (
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
                  </>
                }
              />
            ))}
          </List>
        )}
        {library.hasNextPage && (
          <Button
            variant="secondary"
            className="self-start"
            loading={library.isFetchingNextPage}
            onClick={() => void library.fetchNextPage()}
          >
            Load more
          </Button>
        )}
      </div>
      {editing && <RehearsalSheet courseId={id} initial={editing} onClose={() => setEditing(null)} />}
      <RenameDialog
        exam={renaming}
        busy={save.busy}
        onClose={() => setRenaming(null)}
        onSave={(e, name) => patch(e, { name }, () => setRenaming(null))}
      />
    </Page>
  );
}

function RenameDialog({
  exam,
  busy,
  onClose,
  onSave,
}: {
  exam: SavedExam | null;
  busy: boolean;
  onClose: () => void;
  onSave: (e: SavedExam, name: string) => void;
}) {
  return (
    <Dialog
      open={!!exam}
      onOpenChange={open => {
        if (!open && !busy) onClose();
      }}
    >
      {exam && <RenameForm key={exam.id} exam={exam} busy={busy} onClose={onClose} onSave={onSave} />}
    </Dialog>
  );
}

function RenameForm({
  exam,
  busy,
  onClose,
  onSave,
}: {
  exam: SavedExam;
  busy: boolean;
  onClose: () => void;
  onSave: (e: SavedExam, name: string) => void;
}) {
  const [name, setName] = useState(exam.config.name);
  return (
    <DialogContent size="sm">
      <form
        onSubmit={e => {
          e.preventDefault();
          if (name.trim()) onSave(exam, name.trim());
        }}
      >
        <DialogHeader>
          <DialogTitle>Rename rehearsal</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Field label="Name" required>
            <Input autoFocus maxLength={200} value={name} onChange={e => setName(e.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!name.trim()}>
            Rename
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** New rehearsal: paper settings first, then its sections. */
function RehearsalSheet({ courseId, initial, onClose }: { courseId: string; initial: Config; onClose: () => void }) {
  const outline = useApi<CourseDetail>(`/v1/courses/${courseId}/topics`);
  const planner = useApi<PlannerView>('/v1/planner');
  const materials = useApiAll<Material>(`/v1/courses/${courseId}/materials?limit=50`, 'materials');
  const [config, setConfig] = useState<Config>(initial);
  const [body, setBody] = useState<z.infer<typeof createExamInput> | null>(null);
  const [invalid, setInvalid] = useState('');
  const save = useSave();
  const allow = useUnsentGuard(!!config.name || !!body);
  const set = (patch: Partial<Config>) => setConfig(c => ({ ...c, ...patch }));
  const setSection = (index: number, patch: Partial<Section>) =>
    setConfig(c => ({ ...c, sections: c.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  const topics = outline.data?.topics.map(t => ({ value: t.id, label: t.title })) ?? [];
  const total = config.sections.reduce((n, s) => n + s.count, 0);
  const submit = () => {
    const parsed = body
      ? { success: true as const, data: body }
      : createExamInput.safeParse({ operationId: crypto.randomUUID(), id: crypto.randomUUID(), config });
    if (!parsed.success) {
      setInvalid(
        !config.name.trim() ? 'Give the rehearsal a name.' : parsed.error.issues.map(i => i.message).join(' '),
      );
      return;
    }
    setInvalid('');
    setBody(parsed.data);
    save.run<SavedExam>(
      { path: `/v1/courses/${courseId}/exams`, body: parsed.data },
      {
        id: `create:${parsed.data.id}`,
        invalidate: [keys.course(courseId).exams],
        onSuccess: () => {
          allow();
          toast.success('Rehearsal saved');
          onClose();
        },
      },
    );
  };
  const locked = save.busy || !!body;
  return (
    <Sheet
      open
      onOpenChange={open => {
        if (!open && !save.busy) onClose();
      }}
    >
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>New rehearsal</SheetTitle>
          <SheetDescription>Questions are drawn from this course's bank each time you start it.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <fieldset disabled={locked} className="flex flex-col gap-base">
            <Field label="Name" required>
              <Input
                maxLength={200}
                value={config.name}
                onChange={e => set({ name: e.target.value })}
                placeholder="Midterm rehearsal"
                autoFocus
              />
            </Field>
            <Field label="Timing">
              <RadioCards
                aria-label="Timing"
                columns={3}
                value={config.timing}
                onValueChange={timing => set({ timing })}
                options={[
                  { value: 'overall', label: TIMING_LABEL.overall, description: 'One clock for the paper.' },
                  {
                    value: 'per-section',
                    label: TIMING_LABEL['per-section'],
                    description: 'Each section has its own.',
                  },
                  { value: 'untimed', label: TIMING_LABEL.untimed, description: 'No clock.' },
                ]}
              />
            </Field>
            <div className="grid gap-base sm:grid-cols-2">
              {config.timing === 'overall' && (
                <Field label="Paper length">
                  <NumberField
                    value={config.totalMinutes}
                    onValueChange={v => set({ totalMinutes: v ?? 0 })}
                    min={1}
                    max={600}
                    step={5}
                    suffix="min"
                  />
                </Field>
              )}
              {config.timing !== 'untimed' && (
                <Field label="Extra time" description="For agreed adjustments.">
                  <NumberField
                    value={config.extraTimePercent}
                    onValueChange={v => set({ extraTimePercent: v ?? 0 })}
                    min={0}
                    max={100}
                    step={5}
                    suffix="%"
                  />
                </Field>
              )}
            </div>
            {config.timing === 'per-section' && (
              <p className="text-muted-foreground text-sm">
                Each section's clock starts when you enter it. The whole run also ends after the total of the section
                times, and closing the browser does not pause it.
              </p>
            )}
            <Field label="Moving between questions">
              <RadioGroup
                aria-label="Navigation"
                value={config.navigation}
                onValueChange={navigation => set({ navigation })}
                options={[
                  { value: 'free', label: NAVIGATION_LABEL.free },
                  { value: 'sequential', label: NAVIGATION_LABEL.sequential },
                ]}
              />
            </Field>
            <Field layout="row" label="Allow flags" description="Mark questions to come back to.">
              <Switch checked={config.flaggingEnabled} onCheckedChange={flaggingEnabled => set({ flaggingEnabled })} />
            </Field>
            <Field layout="row" label="Close finished sections" description="A finished section can't be changed.">
              <Switch
                checked={config.lockSectionsOnFinish}
                onCheckedChange={lockSectionsOnFinish => set({ lockSectionsOnFinish })}
              />
            </Field>
            <Field label="Materials">
              <SegmentedControl
                aria-label="Materials"
                value={config.book}
                onValueChange={book => set({ book })}
                options={[
                  { value: 'closed', label: BOOK_LABEL.closed },
                  { value: 'open', label: BOOK_LABEL.open },
                ]}
              />
            </Field>
            {config.book === 'open' && (
              <Field label="Allowed materials">
                <Combobox
                  multiple
                  value={config.allowedMaterialIds}
                  onValueChange={allowedMaterialIds => set({ allowedMaterialIds })}
                  placeholder="None"
                  options={materials.data?.map(m => ({ value: m.id, label: m.title })) ?? []}
                />
              </Field>
            )}
            {!!planner.data?.assessments.filter(a => a.courseId === courseId).length && (
              <Field label="Rehearses" optional description="Link the assessments this prepares you for.">
                <Combobox
                  multiple
                  value={config.assessmentIds ?? []}
                  onValueChange={assessmentIds => set({ assessmentIds })}
                  placeholder="None"
                  options={planner.data.assessments
                    .filter(a => a.courseId === courseId)
                    .map(a => ({ value: a.id, label: a.title }))}
                />
              </Field>
            )}
          </fieldset>
          <div className="flex flex-col gap-snug border-t pt-base">
            <div className="flex items-baseline justify-between">
              <h3 className="text-md font-semibold">Sections</h3>
              <span className="text-muted-foreground tabular text-sm">{total} of 50 questions</span>
            </div>
            {config.sections.map((s, i) => (
              <fieldset
                key={s.id}
                disabled={locked}
                className="bg-surface flex flex-col gap-base rounded-lg border p-3"
              >
                <div className="flex items-end gap-tight">
                  <Field label={`Section ${i + 1} title`} className="flex-1">
                    <Input maxLength={200} value={s.title} onChange={e => setSection(i, { title: e.target.value })} />
                  </Field>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove section ${i + 1}`}
                    disabled={config.sections.length === 1}
                    onClick={() => set({ sections: config.sections.filter(v => v.id !== s.id) })}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                <Field label="Instructions" optional>
                  <Textarea
                    className="min-h-14"
                    maxLength={4000}
                    value={s.instructions}
                    onChange={e => setSection(i, { instructions: e.target.value })}
                  />
                </Field>
                <div className="grid gap-base sm:grid-cols-2">
                  <Field label="Questions">
                    <NumberField
                      value={s.count}
                      onValueChange={v => setSection(i, { count: v ?? 1 })}
                      min={1}
                      max={50}
                    />
                  </Field>
                  {config.timing === 'per-section' && (
                    <Field label="Time">
                      <NumberField
                        value={s.minutes}
                        onValueChange={v => setSection(i, { minutes: v ?? 1 })}
                        min={1}
                        max={600}
                        step={5}
                        suffix="min"
                      />
                    </Field>
                  )}
                  <Field label="Formats">
                    <Combobox
                      multiple
                      value={s.formats}
                      onValueChange={f => setSection(i, { formats: f as Section['formats'] })}
                      placeholder="Choose formats"
                      options={EXAM_FORMATS}
                    />
                  </Field>
                  <Field label="Topics">
                    <Combobox
                      multiple
                      value={s.topicIds}
                      onValueChange={topicIds => setSection(i, { topicIds })}
                      placeholder="All topics"
                      options={topics}
                    />
                  </Field>
                </div>
              </fieldset>
            ))}
            <Button
              variant="secondary"
              className="self-start"
              disabled={locked || config.sections.length >= 10}
              onClick={() => set({ sections: [...config.sections, newSection(config.sections.length + 1)] })}
            >
              <PlusIcon />
              Add section
            </Button>
          </div>
          {invalid && <FieldError>{invalid}</FieldError>}
          {save.error && <FieldError>{save.error}</FieldError>}
        </SheetBody>
        <SheetFooter>
          {body && !save.busy && (
            <Button
              variant="ghost"
              onClick={() => {
                setBody(null);
                save.discard();
              }}
            >
              Edit again
            </Button>
          )}
          <Button variant="secondary" disabled={save.busy} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.busy} onClick={submit}>
            {save.status === 'failed' ? 'Retry' : 'Save rehearsal'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
