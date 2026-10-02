import { useDraftState } from '@/store/drafts';
import { useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, Trash2Icon } from 'lucide-react';
import { toast } from '@/lib/toast';

import type { AssessmentType, PlannedAssessment } from '@shared/types.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import { useAllSessions, useAssessment, useExamConfigs, useTopics } from '@/store/selectors';
import { newId } from '@/lib/id';
import { localISO } from '@shared/planner.ts';

/**
 * Creating and editing a planned assessment.
 *
 * ── The object this screen owns ───────────────────────────────────────────
 *
 * A real course milestone, not a rehearsal. The distinction runs through the
 * whole feature: this has a date the institution set, and an `ExamConfig` is a
 * simulator setup the student built to prepare for it. One assessment can be
 * rehearsed by several configurations and many attempts, and none of those
 * rehearsals is the assessment.
 *
 * ── Why the time is optional and the date is not ──────────────────────────
 *
 * A syllabus routinely gives "Week 8" or a date with no time, and defaulting to
 * 09:00 would be the app inventing a fact about the student's timetable.
 * Leaving it blank is honest, and everything downstream — the countdown, the
 * planner, the home page — is written to work from a date alone.
 */

const TYPES: { value: AssessmentType; label: string }[] = [
  { value: 'quiz', label: 'Quiz' },
  { value: 'midterm', label: 'Midterm' },
  { value: 'final', label: 'Final' },
  { value: 'essay', label: 'Essay or coursework' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'other', label: 'Something else' },
];

export function AssessmentEditorPage() {
  const draftLocation = useLocation();
  const draftPrefix = `form:${draftLocation.pathname}${draftLocation.search}:`;
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();
  const { dispatch } = useStore();
  const course = useCourse();
  const path = useCoursePath();
  const topics = useTopics();
  const configs = useExamConfigs();
  const sessions = useAllSessions();

  const found = useAssessment(assessmentId);
  const existing = found?.courseId === course.id ? found : undefined;

  const [title, setTitle] = useDraftState(draftPrefix + "title", existing?.title ?? '');
  const [type, setType] = useDraftState<AssessmentType>(draftPrefix + "type", existing?.type ?? 'quiz');
  const [date, setDate] = useDraftState(draftPrefix + "date", existing?.date ?? '');
  const [time, setTime] = useDraftState(draftPrefix + "time", existing?.time ?? '');
  const [duration, setDuration] = useDraftState(draftPrefix + "duration",
    existing?.durationMinutes ? String(existing.durationMinutes) : '',
  );
  const [topicIds, setTopicIds] = useDraftState<string[]>(draftPrefix + "topicIds", existing?.topicIds ?? []);
  const [weight, setWeight] = useDraftState(draftPrefix + "weight",
    existing?.weightPercent !== undefined ? String(existing.weightPercent) : '',
  );
  const [notes, setNotes] = useDraftState(draftPrefix + "notes", existing?.notes ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const titleError = !title.trim() ? 'Give the assessment a name.' : null;
  const dateError = !date ? 'An assessment needs a date.' : null;
  const valid = !titleError && !dateError && (!duration || (Number(duration) > 0 && Number(duration) <= 1440)) && (!weight || (Number(weight) >= 0 && Number(weight) <= 100));

  const save = () => {
    if (!valid) return;
    const assessment: PlannedAssessment = {
      id: existing?.id ?? newId('assess'),
      courseId: course.id,
      title: title.trim(),
      type,
      date,
      topicIds,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      ...(time ? { time } : {}),
      ...(duration && Number(duration) > 0
        ? { durationMinutes: Number(duration) }
        : {}),
      ...(weight !== '' && !Number.isNaN(Number(weight))
        ? { weightPercent: Number(weight) }
        : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    dispatch({ type: 'clear-draft', prefix: draftPrefix });
    dispatch({ type: 'save-assessment', assessment });
    toast.success(existing ? 'Assessment updated' : 'Assessment added', {
      description:
        existing && (existing.date !== date || existing.topicIds.length !== topicIds.length)
          ? 'Countdowns and planner suggestions have been updated to match.'
          : undefined,
    });
    navigate(path('/exams'), { replace: true });
  };

  /* What points at this assessment, for the delete dialog. */
  const linkedSessions = sessions.filter((s) => s.assessmentId === assessmentId);
  const linkedConfigs = configs.filter((c) =>
    c.assessmentIds?.includes(assessmentId ?? ''),
  );

  const isPast = date !== '' && date < localISO(new Date());

  if (assessmentId && !existing) return <Page><PageHeader title="Assessment unavailable" description="This assessment does not belong to this course, or it has been removed." /><Button asChild><Link to={path('/exams')}>Open course assessments</Link></Button></Page>;
  return (
    <Page width="prose" className="pb-page">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to={path('/exams')}>
            <ArrowLeftIcon />
            Exams
          </Link>
        </Button>
      </div>

      <PageHeader
        title={existing ? 'Edit assessment' : 'Add a planned assessment'}
        description={`A real milestone in ${course.name}: a quiz, a midterm, a final. Rehearsals are set up separately.`}
      />

      <Section title="What and when">
        <div className="flex flex-col gap-base">
          <div className="flex flex-col gap-tight">
            <Label htmlFor="assessment-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="assessment-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Week 8 midterm"
              aria-invalid={!!titleError}
            />
          </div>

          <div className="flex flex-col gap-tight">
            <Label htmlFor="assessment-type">Type</Label>
            <Select
              id="assessment-type"
              value={type}
              onChange={(e) => setType(e.target.value as AssessmentType)}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-tight sm:grid-cols-3">
            <div className="flex flex-col gap-tight">
              <Label htmlFor="assessment-date">
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="assessment-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={!!dateError}
              />
            </div>
            <div className="flex flex-col gap-tight">
              <Label htmlFor="assessment-time">Time</Label>
              <Input
                id="assessment-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-tight">
              <Label htmlFor="assessment-duration">Minutes</Label>
              <Input
                id="assessment-duration"
                type="number"
                min={0}
                step={5}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <p className="text-muted-foreground text-xs leading-relaxed">
            Time and duration are optional. Plenty of syllabi give only a date, and
            Rawi would rather leave the time blank than invent one.
          </p>

          {isPast && (
            <Alert>
              <AlertTitle>This date has passed</AlertTitle>
              <AlertDescription>
                Past assessments stay here and stay readable, but they stop driving
                countdowns and the planner works from the next one instead.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </Section>

      <Section
        title="What it covers"
        description="Used to prioritise topics in the planner and in today's suggestions. Leaving it empty means the whole course."
        actions={
          <div className="flex gap-tight">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setTopicIds(topics.map((t) => t.id))}
            >
              All
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setTopicIds([])}>
              None
            </Button>
          </div>
        }
      >
        {topics.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            This course has no topics yet.{' '}
            <Link to={path('/syllabus')} className="underline">
              Set up the outline
            </Link>{' '}
            and you can record what each assessment covers.
          </p>
        ) : (
          <div className="flex flex-wrap gap-tight">
            {topics.map((topic) => (
              <label
                key={topic.id}
                className="flex items-center gap-tight rounded-md border px-snug py-1.5 text-sm"
              >
                <Checkbox
                  checked={topicIds.includes(topic.id)}
                  onCheckedChange={(checked) =>
                    setTopicIds((prev) =>
                      checked ? [...prev, topic.id] : prev.filter((id) => id !== topic.id),
                    )
                  }
                />
                <span className="max-w-56 truncate">{topic.title}</span>
              </label>
            ))}
          </div>
        )}
      </Section>

      <Section title="Details">
        <div className="flex flex-col gap-base">
          <div className="flex flex-col gap-tight">
            <Label htmlFor="assessment-weight">Worth (% of the final grade)</Label>
            <Input
              id="assessment-weight"
              type="number"
              min={0}
              max={100}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-28 font-mono tabular-nums"
            />
          </div>

          <div className="flex flex-col gap-tight">
            <Label htmlFor="assessment-notes">Notes</Label>
            <Textarea
              id="assessment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Closed book, calculators allowed, two essays from a choice of five…"
            />
          </div>
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-tight">
        <Button onClick={save} disabled={!valid}>
          {existing ? 'Save changes' : 'Add assessment'}
        </Button>
        <Button variant="ghost" asChild>
          <Link to={path('/exams')}>Cancel</Link>
        </Button>
        {existing && (
          <>
            <div className="flex-1" />
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              className="text-destructive"
            >
              <Trash2Icon />
              Delete
            </Button>
          </>
        )}
      </div>

      {(titleError || dateError) && (
        <p className="text-destructive text-xs">{titleError ?? dateError}</p>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${existing?.title ?? ''}”?`}
        description={
          linkedSessions.length > 0 || linkedConfigs.length > 0
            ? `${linkedSessions.length > 0 ? `${linkedSessions.length} planner ${linkedSessions.length === 1 ? 'session' : 'sessions'}` : ''}${
                linkedSessions.length > 0 && linkedConfigs.length > 0 ? ' and ' : ''
              }${linkedConfigs.length > 0 ? `${linkedConfigs.length} exam ${linkedConfigs.length === 1 ? 'configuration' : 'configurations'}` : ''} ${
                linkedSessions.length + linkedConfigs.length === 1 ? 'points' : 'point'
              } at this assessment. They are kept and simply lose the link. Your attempts and history are untouched.`
            : 'Nothing points at this assessment. Countdowns will move to the next one.'
        }
        confirmLabel="Delete assessment"
        onConfirm={() => {
          if (assessmentId) {
            dispatch({ type: 'remove-assessment', assessmentId });
          }
          setConfirmDelete(false);
          navigate(path('/exams'), { replace: true });
        }}
      />
    </Page>
  );
}
