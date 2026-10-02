import { useDraftState } from '@/store/drafts';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, ArchiveIcon, ListTreeIcon, Trash2Icon } from 'lucide-react';
import { toast } from '@/lib/toast';

import type { CourseAccent } from '@shared/types.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { COURSE_ACCENT } from '@/components/domain';
import { useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import {
  useAssessments,
  useAttempts,
  useAvailability,
  useMaterials,
  usePracticeSets,
  useSessions,
  useTopics,
} from '@/store/selectors';
import { cn } from '@/lib/utils';

const ACCENTS: CourseAccent[] = ['indigo', 'amber', 'teal', 'rose', 'violet'];

/**
 * Course settings: the stable facts about a course, and nothing else.
 *
 * ── What left this screen, and where it went ──────────────────────────────
 *
 * The previous version of this form held the exam date, a daily study-time
 * budget and the whole topic editor. All three have moved, and the pointers
 * below are part of the design rather than politeness — the brief's requirement
 * is that there must not be two places to configure the same thing, which means
 * this screen has to say where the one place is.
 *
 *   exam date        → planned assessments, in Exams. A course can have
 *                      several, and each has its own coverage.
 *   daily minutes    → availability, in the planner. A student has one week,
 *                      not one week per course.
 *   topics           → the syllabus screen, which can also read a syllabus.
 *
 * ── Scrolling ─────────────────────────────────────────────────────────────
 *
 * This is an ordinary page: one column, no nested overflow, scrolled by the
 * shell. The doubled scrollbar this screen used to show came from the document
 * and the shell both being scrollable at once, which `globals.css` now
 * prevents.
 */
export function CourseSettingsPage() {
  const course = useCourse();
  const path = useCoursePath();
  const navigate = useNavigate();
  const { state, dispatch } = useStore();
  const draftPrefix = `course-settings:${course.id}:`;

  const topics = useTopics();
  const materials = useMaterials();
  const attempts = useAttempts();
  const assessments = useAssessments();
  const sets = usePracticeSets();
  const sessions = useSessions();
  const availability = useAvailability();

  const [name, setName] = useDraftState(draftPrefix + "name", course.name);
  const [description, setDescription] = useDraftState(draftPrefix + "description", course.description);
  const [goal, setGoal] = useDraftState(draftPrefix + "goal", course.goal);
  const [accent, setAccent] = useDraftState<CourseAccent>(draftPrefix + "accent", course.accent);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const nameError = !name.trim() ? 'A course needs a name.' : null;
  const dirty =
    name !== course.name ||
    description !== course.description ||
    goal !== course.goal ||
    accent !== course.accent;

  const save = () => {
    if (nameError) return;
    dispatch({
      type: 'update-course',
      courseId: course.id,
      patch: {
        name: name.trim(),
        description: description.trim(),
        goal: goal.trim(),
        accent,
      },
    });
    dispatch({ type: 'clear-draft', prefix: draftPrefix });
    toast.success('Course updated');
  };

  const weeklyMinutes = availability.windows.reduce(
    (sum, w) => sum + Math.max(0, w.endMinutes - w.startMinutes),
    0,
  );

  return (
    <Page width="prose" className="pb-page">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to={path('')}>
            <ArrowLeftIcon />
            {course.name}
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Course settings"
        description="The stable facts about this course. Topics, dates and study time each live where they belong."
      />

      <Section title="About this course">
        <div className="flex flex-col gap-base">
          <div className="flex flex-col gap-tight">
            <Label htmlFor="course-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="course-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!nameError}
            />
            {nameError && <p className="text-destructive text-xs">{nameError}</p>}
          </div>

          <div className="flex flex-col gap-tight">
            <Label htmlFor="course-description">Description</Label>
            <Textarea
              id="course-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What the course is, how it is taught and assessed."
            />
          </div>

          <div className="flex flex-col gap-tight">
            <Label htmlFor="course-goal">Your goal</Label>
            <Textarea
              id="course-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              In your own words, and shown back to you on the overview. Nothing reads it
              or generates from it.
            </p>
          </div>

          <div className="flex flex-col gap-tight">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-tight">
              {ACCENTS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setAccent(option)}
                  aria-pressed={accent === option}
                  aria-label={`Use the ${option} accent`}
                  className={cn(
                    'focus-visible:ring-ring flex items-center gap-tight rounded-md border px-snug py-1.5 text-sm outline-none transition-colors focus-visible:ring-2',
                    accent === option ? 'border-primary bg-primary/5' : 'hover:bg-accent/50',
                  )}
                >
                  <span
                    className={cn('size-3 rounded-full', COURSE_ACCENT[option].dot)}
                    aria-hidden
                  />
                  <span className="capitalize">{option}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-tight">
            <Button onClick={save} disabled={!!nameError || !dirty}>
              Save changes
            </Button>
            <Button variant="ghost" disabled={!dirty} onClick={() => dispatch({ type: 'clear-draft', prefix: draftPrefix })}>Discard draft</Button>
            {dirty && (
              <span className="text-muted-foreground text-xs">Unsaved changes</span>
            )}
          </div>
        </div>
      </Section>

      {/* ── Where the removed settings went ───────────────────────────── */}
      <Section
        title="Set up elsewhere"
        description="These used to be on this form. Each one now lives with the object that owns it, so there is only ever one place to change it."
      >
        <div className="flex flex-col gap-tight">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-base">
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">Topics and the outline</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {topics.length > 0
                    ? `${topics.length} topics. Rename, reorder, group into weeks, or read a new syllabus.`
                    : 'No topics yet. Paste a syllabus or build a week-by-week outline.'}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to={path('/syllabus')}>
                  <ListTreeIcon />
                  Syllabus & topics
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap items-center gap-base">
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">Assessment dates</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {assessments.length > 0
                    ? `${assessments.length} planned ${assessments.length === 1 ? 'assessment' : 'assessments'}. Each has its own date and coverage. This course no longer has a single exam date.`
                    : 'No assessments recorded. Add the dates this course actually has, and the planner will work back from them.'}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to={path('/exams')}>Exams</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap items-center gap-base">
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">Study time</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {weeklyMinutes > 0
                    ? `You have about ${Math.round(weeklyMinutes / 60)} hours a week set aside, across every course.`
                    : 'No availability set yet.'}{' '}
                  Availability is one budget for all your courses rather than a number
                  per course.
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/planner/availability">Availability</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* ── Archiving and deleting ────────────────────────────────────── */}
      <Section title="Finishing with this course">
        <div className="flex flex-col gap-tight">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-base">
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">
                  {course.archived ? 'Unarchive' : 'Archive'}
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {course.archived
                    ? 'Bring it back into planning and the main course list.'
                    : 'Keeps everything, including materials, attempts and history, but leaves the course out of planning and the default list.'}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  dispatch({
                    type: 'update-course',
                    courseId: course.id,
                    patch: { archived: !course.archived },
                  });
                  toast.success(course.archived ? 'Course unarchived' : 'Course archived');
                }}
              >
                <ArchiveIcon />
                {course.archived ? 'Unarchive' : 'Archive'}
              </Button>
            </CardContent>
          </Card>

          {(state.activeExam?.courseId === course.id || state.practiceRuns.some(r => r.courseId === course.id)) && <p className="text-muted-foreground text-sm">Finish or abandon this course’s active runs before deleting it.</p>}
          <Alert variant="destructive">
            <Trash2Icon />
            <AlertTitle>Delete this course</AlertTitle>
            <AlertDescription>
              <span className="flex flex-col gap-snug">
                <span>
                  Everything belonging to it goes with it. Archiving keeps it all and
                  gets it out of the way.
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  className="self-start"
                  disabled={state.activeExam?.courseId === course.id || state.practiceRuns.some(r => r.courseId === course.id)} onClick={() => setConfirmDelete(true)}
                >
                  Delete course
                </Button>
              </span>
            </AlertDescription>
          </Alert>
        </div>
      </Section>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${course.name}”?`}
        description={`This removes ${topics.length} topics, ${materials.length} materials, ${sets.length} practice sets, ${assessments.length} assessments, ${sessions.length} planner sessions and ${
          attempts.filter((a) => a.completedAt).length
        } recorded attempts. Your history for this course, its tutor sessions, configurations and ${Object.keys(state.drafts).filter(k => k.includes(course.id)).length} draft fields go with it and cannot be recovered. Archiving keeps all of it instead.`}
        confirmLabel="Delete the course and everything in it"
        onConfirm={() => {
          dispatch({ type: 'remove-course', courseId: course.id });
          toast.success('Course deleted');
          navigate('/courses', { replace: true });
        }}
      />
    </Page>
  );
}
