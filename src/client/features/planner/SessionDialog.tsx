import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type {
  PlannedSession,
  SessionActivity,
  SessionLink,
} from '@shared/types.ts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useStore } from '@/store/store';
import {
  useActiveCourses,
  useAllAssessments,
  useAllMaterials,
  useAllPracticeSets,
  useAllExamConfigs,
  useAllTopics,
} from '@/store/selectors';
import { newId } from '@/lib/id';
import { formatMinutes } from '@shared/planner.ts';

/**
 * Creating and editing one study session.
 *
 * ── Why the link is chosen here rather than at open time ──────────────────
 *
 * A session says what it opens — a specific reading, a saved set, an exam
 * configuration, a topic to tutor — and the student picks that when they plan,
 * not when they sit down. That is the difference between a calendar entry and a
 * plan: "Thursday, 45 minutes, Rawi decides later" is a reminder, whereas
 * "Thursday, the confidence-intervals problem set" is something you can start
 * without making a decision first.
 *
 * ── Editing a generated session makes it yours ────────────────────────────
 *
 * Saving here sets `locked`, which takes the session out of the set that "Plan
 * my week" is allowed to replace. A student who moved a generated session to
 * Friday should not find it back on Tuesday after regenerating, and the rule
 * that achieves that is simply: if you touched it, it is yours.
 */
export function SessionDialog({
  open,
  onOpenChange,
  session,
  defaultDate,
  defaultCourseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The session being edited, or undefined when creating one. */
  session?: PlannedSession;
  defaultDate?: string;
  defaultCourseId?: string;
}) {
  const { dispatch } = useStore();
  const courses = useActiveCourses();
  const topics = useAllTopics();
  const materials = useAllMaterials();
  const sets = useAllPracticeSets();
  const configs = useAllExamConfigs();
  const assessments = useAllAssessments();

  const [courseId, setCourseId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState('45');
  const [title, setTitle] = useState('');
  const [activity, setActivity] = useState<SessionActivity>('practice');
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [assessmentId, setAssessmentId] = useState('');
  const [linkValue, setLinkValue] = useState('');
  const [note, setNote] = useState('');

  /* Reset the form whenever the dialog opens onto a different subject. */
  useEffect(() => {
    if (!open) return;
    if (session) {
      setCourseId(session.courseId);
      setDate(session.date);
      setTime(
        `${String(Math.floor(session.startMinutes / 60)).padStart(2, '0')}:${String(
          session.startMinutes % 60,
        ).padStart(2, '0')}`,
      );
      setDuration(String(session.durationMinutes));
      setTitle(session.title);
      setActivity(session.activity);
      setTopicIds(session.topicIds);
      setAssessmentId(session.assessmentId ?? '');
      setNote(session.reason ?? '');
      setLinkValue(linkToValue(session.link));
    } else {
      setCourseId(defaultCourseId ?? courses[0]?.id ?? '');
      setDate(defaultDate ?? new Date().toISOString().slice(0, 10));
      setTime('18:00');
      setDuration('45');
      setTitle('');
      setActivity('practice');
      setTopicIds([]);
      setAssessmentId('');
      setNote('');
      setLinkValue('');
    }
  }, [open, session, defaultDate, defaultCourseId, courses]);

  const courseTopics = topics.filter((t) => t.courseId === courseId);
  const courseMaterials = materials.filter((m) => m.courseId === courseId);
  const courseSets = sets.filter((s) => s.courseId === courseId);
  const courseConfigs = configs.filter((c) => c.courseId === courseId);
  const courseAssessments = assessments.filter((a) => a.courseId === courseId);

  const minutes = Number(duration) || 0;
  const valid = courseId && date && title.trim() && minutes > 0;

  const save = () => {
    if (!valid) return;
    const [h = '18', m = '00'] = time.split(':');
    const startMinutes = Number(h) * 60 + Number(m);

    const next: PlannedSession = {
      id: session?.id ?? newId('sess'),
      courseId,
      date,
      startMinutes,
      durationMinutes: minutes,
      title: title.trim(),
      activity,
      topicIds,
      status: session?.status ?? 'planned',
      createdAt: session?.createdAt ?? new Date().toISOString(),
      ...(assessmentId ? { assessmentId } : {}),
      ...(valueToLink(linkValue) ? { link: valueToLink(linkValue) } : {}),
      ...(note.trim() ? { reason: note.trim() } : {}),
      ...(session?.completedAt ? { completedAt: session.completedAt } : {}),
      ...(session?.completedBy ? { completedBy: session.completedBy } : {}),
      ...(session?.generated ? { generated: true } : {}),
      // Touching a session takes it out of the regenerate-and-replace set.
      ...(session?.generated ? { locked: true } : {}),
    };

    dispatch({ type: 'save-session', session: next });
    onOpenChange(false);
    toast.success(session ? 'Session updated' : 'Session added', {
      description:
        session?.generated && !session.locked
          ? 'Because you edited it, “Plan my week” will leave this one alone from now on.'
          : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{session ? 'Edit session' : 'Add a study session'}</DialogTitle>
          <DialogDescription>
            {session
              ? 'Change when this happens, how long it runs, or what it opens.'
              : 'A block of time, with the work it is for. You can link it to something so it opens ready to go.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-base">
          <div className="flex flex-col gap-tight">
            <Label htmlFor="session-course">Course</Label>
            <Select
              id="session-course"
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setTopicIds([]);
                setAssessmentId('');
                setLinkValue('');
              }}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-tight">
            <Label htmlFor="session-title">What are you doing?</Label>
            <Input
              id="session-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Problem set: confidence intervals"
            />
          </div>

          <div className="grid gap-tight sm:grid-cols-3">
            <div className="flex flex-col gap-tight">
              <Label htmlFor="session-date">Date</Label>
              <Input
                id="session-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-tight">
              <Label htmlFor="session-time">Start</Label>
              <Input
                id="session-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-tight">
              <Label htmlFor="session-duration">Minutes</Label>
              <Input
                id="session-duration"
                type="number"
                min={5}
                step={5}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-col gap-tight">
            <Label htmlFor="session-activity">Kind of work</Label>
            <Select
              id="session-activity"
              value={activity}
              onChange={(e) => setActivity(e.target.value as SessionActivity)}
            >
              <option value="read">Reading</option>
              <option value="tutor">Tutor session</option>
              <option value="practice">Practice</option>
              <option value="flashcards">Flashcards</option>
              <option value="exam">Timed rehearsal</option>
              <option value="review">Review</option>
              <option value="other">Something else</option>
            </Select>
          </div>

          <div className="flex flex-col gap-tight">
            <Label htmlFor="session-link">Open this when the session starts</Label>
            <Select
              id="session-link"
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
            >
              <option value="">Nothing in particular</option>
              {courseMaterials.length > 0 && (
                <optgroup label="Reading">
                  {courseMaterials.map((m) => (
                    <option key={m.id} value={`material:${m.id}`}>
                      {m.title}
                    </option>
                  ))}
                </optgroup>
              )}
              {courseSets.length > 0 && (
                <optgroup label="Practice sets">
                  {courseSets.map((s) => (
                    <option key={s.id} value={`practice-set:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {courseConfigs.length > 0 && (
                <optgroup label="Exam configurations">
                  {courseConfigs.map((c) => (
                    <option key={c.id} value={`exam-config:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {courseTopics.length > 0 && (
                <optgroup label="Tutor, on a topic">
                  {courseTopics.map((t) => (
                    <option key={t.id} value={`tutor:${t.id}`}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Finishing the linked activity marks this session done, once. Sessions with
              nothing linked are marked done by hand, which is what offline study needs.
            </p>
          </div>

          {courseAssessments.length > 0 && (
            <div className="flex flex-col gap-tight">
              <Label htmlFor="session-assessment">Preparing for</Label>
              <Select
                id="session-assessment"
                value={assessmentId}
                onChange={(e) => setAssessmentId(e.target.value)}
              >
                <option value="">No particular assessment</option>
                {courseAssessments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} — {a.date}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {courseTopics.length > 0 && (
            <div className="flex flex-col gap-tight">
              <Label>Topics</Label>
              <div className="flex max-h-40 flex-wrap gap-tight overflow-y-auto">
                {courseTopics.map((topic) => (
                  <label
                    key={topic.id}
                    className="flex items-center gap-tight rounded-md border px-snug py-1.5 text-sm"
                  >
                    <Checkbox
                      checked={topicIds.includes(topic.id)}
                      onCheckedChange={(checked) =>
                        setTopicIds((prev) =>
                          checked
                            ? [...prev, topic.id]
                            : prev.filter((id) => id !== topic.id),
                        )
                      }
                    />
                    <span className="max-w-40 truncate">{topic.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-tight">
            <Label htmlFor="session-note">Note</Label>
            <Textarea
              id="session-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Optional — why this, now?"
            />
          </div>

          {minutes > 0 && (
            <p className="text-muted-foreground text-xs">
              {formatMinutes(Number(time.split(':')[0]) * 60 + Number(time.split(':')[1]))}{' '}
              for {minutes} minutes.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid}>
            {session ? 'Save changes' : 'Add session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── The link, as a single select value ───────────────────────────────── */

function linkToValue(link: SessionLink | undefined): string {
  if (!link) return '';
  switch (link.kind) {
    case 'material':
      return `material:${link.materialId}`;
    case 'practice-set':
      return `practice-set:${link.setId}`;
    case 'exam-config':
      return `exam-config:${link.configId}`;
    case 'tutor':
      return `tutor:${link.topicId}`;
    case 'practice-new':
      return '';
  }
}

function valueToLink(value: string): SessionLink | undefined {
  const [kind, id] = value.split(':');
  if (!kind || !id) return undefined;
  switch (kind) {
    case 'material':
      return { kind: 'material', materialId: id };
    case 'practice-set':
      return { kind: 'practice-set', setId: id };
    case 'exam-config':
      return { kind: 'exam-config', configId: id };
    case 'tutor':
      return { kind: 'tutor', topicId: id };
    default:
      return undefined;
  }
}
