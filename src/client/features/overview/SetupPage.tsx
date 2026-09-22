import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import type { Topic, TopicPriority } from '@shared/types.ts';
import { SEED_TOPICS, seedExamDate } from '@shared/course/topics.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAppState, useStore } from '@/store/store';
import { newId } from '@/lib/id';

/**
 * Course setup, used for both the first visit and every later edit.
 *
 * ── One screen, not a wizard ──────────────────────────────────────────────
 *
 * A multi-step wizard is the usual shape for onboarding and it is the wrong one
 * here. The fields are few, none depends on an earlier answer, and the screen
 * has a second job — editing an existing course — that a wizard serves badly.
 * One form that knows whether it is creating or editing is smaller and means a
 * student changing their exam date does not walk through four steps to do it.
 *
 * ── Starting without materials ────────────────────────────────────────────
 *
 * The brief requires that a student can start without uploading anything, so
 * topics are the only required content here and they come pre-filled with the
 * sample course's. Nothing on this screen asks for a file.
 */

interface DraftTopic {
  id: string;
  title: string;
  summary: string;
  priority: TopicPriority;
}

function toDraft(topic: Topic): DraftTopic {
  return {
    id: topic.id,
    title: topic.title,
    summary: topic.summary,
    priority: topic.priority,
  };
}

export function SetupPage() {
  const state = useAppState();
  const { dispatch, resetDemo } = useStore();
  const navigate = useNavigate();

  const editing = state.course !== null;

  const [name, setName] = useState(state.course?.name ?? '');
  const [goal, setGoal] = useState(state.course?.goal ?? '');
  const [examDate, setExamDate] = useState(state.course?.examDate ?? seedExamDate());
  const [dailyMinutes, setDailyMinutes] = useState(
    String(state.course?.dailyMinutes ?? 45),
  );
  const [resetOpen, setResetOpen] = useState(false);
  const [topics, setTopics] = useState<DraftTopic[]>(
    (state.topics.length > 0 ? state.topics : SEED_TOPICS).map(toDraft),
  );

  const nameError = !name.trim() ? 'Give the course a name.' : null;
  const topicError =
    topics.filter((t) => t.title.trim()).length === 0
      ? 'Add at least one topic — that is what practice and exams draw on.'
      : null;
  const dateError =
    !examDate || Number.isNaN(new Date(examDate).getTime())
      ? 'Choose a valid exam date.'
      : null;

  const valid = !nameError && !topicError && !dateError;

  const save = () => {
    if (!valid) return;

    const cleaned: Topic[] = topics
      .filter((t) => t.title.trim())
      .map((t) => {
        // Preserve the authored relationships for seeded topics; a topic the
        // student typed has none until they say otherwise.
        const original = SEED_TOPICS.find((s) => s.id === t.id);
        return {
          id: t.id,
          title: t.title.trim(),
          summary: t.summary.trim() || 'No description yet.',
          priority: t.priority,
          relatedTopicIds: original?.relatedTopicIds ?? [],
        };
      });

    if (editing && state.course) {
      dispatch({
        type: 'update-course',
        patch: {
          name: name.trim(),
          goal: goal.trim(),
          examDate,
          dailyMinutes: Number(dailyMinutes) || 45,
        },
      });
      for (const topic of cleaned) {
        dispatch({ type: 'update-topic', topicId: topic.id, patch: topic });
      }
      for (const existing of state.topics) {
        if (!cleaned.some((t) => t.id === existing.id)) {
          dispatch({ type: 'remove-topic', topicId: existing.id });
        }
      }
      for (const topic of cleaned) {
        if (!state.topics.some((t) => t.id === topic.id)) {
          dispatch({ type: 'add-topic', topic });
        }
      }
      toast.success('Course updated', {
        description: 'Today’s plan has been recalculated.',
      });
      navigate('/');
      return;
    }

    dispatch({
      type: 'create-course',
      course: {
        id: newId('course'),
        name: name.trim(),
        goal: goal.trim() || 'Be ready for the exam.',
        examDate,
        dailyMinutes: Number(dailyMinutes) || 45,
        createdAt: new Date().toISOString(),
      },
      topics: cleaned,
    });
    toast.success('Course created');
    navigate('/');
  };

  return (
    <Page width="prose" className="pb-page">
      <PageHeader
        title={editing ? 'Course settings' : 'Set up your course'}
        description={
          editing
            ? 'Changing any of this recalculates what the overview suggests.'
            : 'Four answers and a list of topics. You can add readings later, or never — topic practice works without them.'
        }
      />

      <Section title="The course">
        <div className="flex flex-col gap-base">
          <div className="flex flex-col gap-tight">
            <Label htmlFor="course-name">Course name</Label>
            <Input
              id="course-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Atlantic World, 1500–1800"
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'course-name-error' : undefined}
            />
            {nameError && (
              <p id="course-name-error" className="text-destructive text-xs">
                {nameError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-tight">
            <Label htmlFor="course-goal">What are you trying to be able to do?</Label>
            <Textarea
              id="course-goal"
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Explain causes and compare historians’ interpretations without notes."
            />
            <p className="text-muted-foreground text-xs">
              Written in your own words. The tutor and the plan refer back to it.
            </p>
          </div>

          <div className="grid gap-base sm:grid-cols-2">
            <div className="flex flex-col gap-tight">
              <Label htmlFor="course-date">Exam date</Label>
              <Input
                id="course-date"
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                aria-invalid={!!dateError}
              />
              {dateError && <p className="text-destructive text-xs">{dateError}</p>}
            </div>
            <div className="flex flex-col gap-tight">
              <Label htmlFor="course-minutes">Study time on a normal day</Label>
              <Select
                id="course-minutes"
                value={dailyMinutes}
                onChange={(e) => setDailyMinutes(e.target.value)}
              >
                {['15', '30', '45', '60', '90', '120'].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Topics"
        description="Priority changes the order of suggestions, not what is available."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setTopics((prev) => [
                ...prev,
                { id: newId('topic'), title: '', summary: '', priority: 'normal' },
              ])
            }
          >
            <PlusIcon />
            Add topic
          </Button>
        }
      >
        {topicError && (
          <Alert variant="destructive">
            <AlertDescription>{topicError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-snug">
          {topics.map((topic, index) => (
            <Card key={topic.id}>
              <CardContent className="flex flex-col gap-snug">
                <div className="flex items-start gap-tight">
                  <div className="flex min-w-0 flex-1 flex-col gap-tight">
                    <Label htmlFor={`topic-title-${topic.id}`} className="sr-only">
                      Topic {index + 1} title
                    </Label>
                    <Input
                      id={`topic-title-${topic.id}`}
                      value={topic.title}
                      placeholder="Topic name"
                      onChange={(e) =>
                        setTopics((prev) =>
                          prev.map((t) =>
                            t.id === topic.id ? { ...t, title: e.target.value } : t,
                          ),
                        )
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${topic.title || `topic ${index + 1}`}`}
                    onClick={() =>
                      setTopics((prev) => prev.filter((t) => t.id !== topic.id))
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>

                <div className="flex flex-col gap-tight">
                  <Label htmlFor={`topic-summary-${topic.id}`} className="sr-only">
                    Topic {index + 1} description
                  </Label>
                  <Textarea
                    id={`topic-summary-${topic.id}`}
                    rows={2}
                    value={topic.summary}
                    placeholder="One sentence on what this covers."
                    onChange={(e) =>
                      setTopics((prev) =>
                        prev.map((t) =>
                          t.id === topic.id ? { ...t, summary: e.target.value } : t,
                        ),
                      )
                    }
                  />
                </div>

                <div className="flex items-center gap-snug">
                  <Label
                    htmlFor={`topic-priority-${topic.id}`}
                    className="text-muted-foreground text-xs"
                  >
                    Priority
                  </Label>
                  <Select
                    id={`topic-priority-${topic.id}`}
                    className="h-8 w-36"
                    value={topic.priority}
                    onChange={(e) =>
                      setTopics((prev) =>
                        prev.map((t) =>
                          t.id === topic.id
                            ? { ...t, priority: e.target.value as TopicPriority }
                            : t,
                        ),
                      )
                    }
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-tight">
        <Button onClick={save} disabled={!valid}>
          {editing ? 'Save changes' : 'Create course'}
        </Button>
        {editing && (
          <Button variant="ghost" onClick={() => navigate('/')}>
            Cancel
          </Button>
        )}
        {!editing && state.seeded && (
          <Button variant="ghost" onClick={() => navigate('/')}>
            Use the sample course instead
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
          Reset demo data
        </Button>
        <ConfirmDialog
          open={resetOpen}
          onOpenChange={setResetOpen}
          title="Reset the demo?"
          description="This clears everything stored on this device — your course, materials, attempts and saved sets — and restores the sample course with its seeded history."
          confirmLabel="Reset"
          onConfirm={() => {
            resetDemo();
            setResetOpen(false);
            toast.success('Demo reset');
            navigate('/');
          }}
        />
      </div>
    </Page>
  );
}

/** The very first screen, when there is no course and no seed. */
export function WelcomePage() {
  const { dispatch, resetDemo } = useStore();
  const navigate = useNavigate();

  return (
    <Page width="prose" className="py-page">
      <PageHeader
        title="Welcome to Rawi"
        description="A study workspace that turns course reading into something you can use in an exam."
      />

      <div className="flex flex-col gap-snug">
        <Card>
          <CardContent className="flex flex-col gap-snug">
            <span className="font-medium">Explore the sample course</span>
            <p className="text-muted-foreground text-sm leading-relaxed">
              A fictional introductory history course with readings, six topics,
              an authored question bank and ten days of seeded study history —
              so progress, reviews and recurring mistakes have something to show.
            </p>
            <Button
              className="self-start"
              onClick={() => {
                resetDemo();
                navigate('/');
              }}
            >
              Open the sample course
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-snug">
            <span className="font-medium">Set up your own</span>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Name a course, set an exam date and list your topics. You can add
              readings later, or not at all — practice works from topics alone.
              Note that the authored question bank covers the sample course’s
              topics, so your own topics will have no questions behind them yet.
            </p>
            <Button
              variant="outline"
              className="self-start"
              onClick={() => {
                dispatch({ type: 'start-fresh' });
                navigate('/setup');
              }}
            >
              Start from scratch
            </Button>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
