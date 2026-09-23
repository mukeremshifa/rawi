import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  FileTextIcon,
  ListTreeIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import type { Topic, TopicPriority } from '@shared/types.ts';
import {
  SAMPLE_SYLLABUS,
  blankOutline,
  readSampleSyllabus,
  readSyllabus,
  type ProposedTopic,
  type SyllabusReading,
} from '@shared/syllabus.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/states';
import { useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import {
  useAllAttempts,
  useAssessments,
  useMaterials,
  useQuestions,
  useTopics,
} from '@/store/selectors';
import { newId } from '@/lib/id';

/**
 * The course outline: where topics are created, organised and edited.
 *
 * ── Why topics moved out of course settings ───────────────────────────────
 *
 * Topics were previously a repeater inside the settings form, which made the
 * outline a side effect of editing the course's name. They are the course's
 * structure — everything else points at them — so they get their own screen,
 * with the three ways in that the brief asks for: a pasted syllabus, a text
 * file, or building the outline by hand.
 *
 * ── Confirmation is the product interaction ───────────────────────────────
 *
 * Selecting a file or pasting text **never** creates a topic. It produces a
 * proposal, on screen, that the student renames, reorders, groups and deletes
 * from before pressing Confirm. That is deliberate: an app that silently
 * created six topics because a file was picked would be one that a student has
 * to undo rather than one they direct.
 *
 * ── Identity survives editing ─────────────────────────────────────────────
 *
 * Editing an existing outline keeps topic ids stable, because attempts,
 * materials, assessments and planner sessions all point at them. Renaming a
 * topic renames it everywhere; *removing* one is the consequential case, so the
 * confirm dialog counts exactly what points at it before it goes.
 */
export function SyllabusPage() {
  const course = useCourse();
  const path = useCoursePath();
  const { dispatch } = useStore();
  const existing = useTopics();
  const materials = useMaterials();
  const questions = useQuestions();
  const attempts = useAllAttempts();
  const assessments = useAssessments();

  const [reading, setReading] = useState<SyllabusReading | null>(null);
  const [draft, setDraft] = useState<ProposedTopic[] | null>(null);
  const [pasted, setPasted] = useState('');
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const topicsWithQuestions = useMemo(
    () => new Set(questions.map((q) => q.topicId)),
    [questions],
  );

  /* ── Reading input ──────────────────────────────────────────────────── */

  const interpret = (text: string, source: string) => {
    const result = readSyllabus(text);
    setReading(result);
    setDraft(result.topics);
    setFileNote(source);
    if (result.topics.length === 0) {
      toast.info('Nothing matched', {
        description: 'Build the outline by hand instead. The tab is below.',
      });
    }
  };

  const useSample = () => {
    const result = readSampleSyllabus();
    setReading(result);
    setDraft(result.topics);
    setPasted(SAMPLE_SYLLABUS);
    setFileNote('the sample syllabus');
    setUnsupported(null);
  };

  const pickFile = async (file: File) => {
    const name = file.name.toLowerCase();
    const isText = name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/');

    if (!isText) {
      /*
       * The honest branch. There is no PDF or Word parser in this prototype,
       * and there is not going to be one at this checkpoint, so an unsupported
       * file is refused by name rather than being "read" into invented text.
       */
      setUnsupported(file.name);
      setReading(null);
      setDraft(null);
      return;
    }

    const text = await file.text();
    setUnsupported(null);
    setPasted(text);
    interpret(text, `“${file.name}”`);
  };

  /* ── Editing the draft ──────────────────────────────────────────────── */

  const patch = (key: string, changes: Partial<ProposedTopic>) => {
    setDraft((prev) =>
      prev ? prev.map((t) => (t.key === key ? { ...t, ...changes } : t)) : prev,
    );
  };

  const move = (key: string, by: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const i = prev.findIndex((t) => t.key === key);
      const j = i + by;
      if (i === -1 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const a = next[i]!;
      const b = next[j]!;
      next[i] = b;
      next[j] = a;
      return next;
    });
  };

  const addRow = () => {
    setDraft((prev) => [
      ...(prev ?? []),
      {
        key: `proposed-new-${Date.now()}`,
        title: '',
        summary: '',
        module: prev?.[prev.length - 1]?.module ?? null,
        confidence: 'high',
        matchedBy: 'added by you',
        sourceLine: '',
      },
    ]);
  };

  const removeRow = (key: string) => {
    setDraft((prev) => (prev ? prev.filter((t) => t.key !== key) : prev));
  };

  /**
   * Commits the draft as the course's outline.
   *
   * Existing topics are matched by position against the draft rows that came
   * from them, which is what keeps ids — and therefore every attempt, material
   * link and planner session — attached across an edit.
   */
  const confirm = (rows: ProposedTopic[], replacing: boolean) => {
    const cleaned = rows.filter((r) => r.title.trim());
    if (cleaned.length === 0) return;

    const topics: Topic[] = cleaned.map((row, index) => {
      // A row carrying an existing id keeps it; everything else is new.
      const existingId = row.key.startsWith('existing:')
        ? row.key.slice('existing:'.length)
        : undefined;
      const prior = existingId ? existing.find((t) => t.id === existingId) : undefined;

      return {
        id: prior?.id ?? newId('topic'),
        courseId: course.id,
        title: row.title.trim(),
        summary: row.summary.trim() || 'No description yet.',
        priority: prior?.priority ?? 'normal',
        relatedTopicIds: prior?.relatedTopicIds ?? [],
        ...(row.module?.trim() ? { module: row.module.trim() } : {}),
        order: index,
      };
    });

    dispatch({ type: 'set-topics', courseId: course.id, topics });
    setReading(null);
    setDraft(null);
    setFileNote(null);
    toast.success(replacing ? 'Outline updated' : 'Topics confirmed', {
      description: `${topics.length} ${topics.length === 1 ? 'topic' : 'topics'} in ${course.name}.`,
    });
  };

  /** Loads the current outline into the editor, ids preserved. */
  const editExisting = () => {
    setReading(null);
    setDraft(
      existing.map((t) => ({
        key: `existing:${t.id}`,
        title: t.title,
        summary: t.summary === 'No description yet.' ? '' : t.summary,
        module: t.module ?? null,
        confidence: 'high' as const,
        matchedBy: 'already in your outline',
        sourceLine: '',
      })),
    );
    setFileNote(null);
  };

  const startBlank = (weeks: number) => {
    setReading(null);
    setDraft(blankOutline(weeks));
    setFileNote(null);
  };

  /* ── What removing a topic would cost ───────────────────────────────── */

  const removalImpact = (topicId: string) => {
    const attemptCount = attempts.filter(
      (a) => a.courseId === course.id && a.topicIds.includes(topicId),
    ).length;
    const materialCount = materials.filter((m) => m.topicIds.includes(topicId)).length;
    const questionCount = questions.filter((q) => q.topicId === topicId).length;
    const assessmentCount = assessments.filter((a) =>
      a.topicIds.includes(topicId),
    ).length;
    return { attemptCount, materialCount, questionCount, assessmentCount };
  };

  const droppedExisting = draft
    ? existing.filter((t) => !draft.some((d) => d.key === `existing:${t.id}`))
    : [];

  return (
    <Page className="py-page">
      <PageHeader
        title="Syllabus & topics"
        description={`The outline for ${course.name}. Everything else points at these topics: materials, practice, assessments and your history.`}
        actions={
          existing.length > 0 &&
          !draft && (
            <Button variant="outline" onClick={editExisting}>
              <ListTreeIcon />
              Edit the outline
            </Button>
          )
        }
      />

      {/* ── The current outline ───────────────────────────────────────── */}
      {!draft && (
        <>
          {existing.length === 0 ? (
            <EmptyState
              icon={<ListTreeIcon />}
              title="No topics yet"
              description="Add a syllabus below, or build a week-by-week outline yourself. Nothing is created until you confirm it."
            />
          ) : (
            <Section
              title={`Current outline (${existing.length} topics)`}
              description="Grouped as you organised it. Topics with no authored questions are marked. The tutor and your own materials are the way into those."
            >
              <div className="flex flex-col gap-base">
                {groupByModule(existing).map(({ module, topics }) => (
                  <div key={module ?? 'ungrouped'} className="flex flex-col gap-tight">
                    {module && (
                      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        {module}
                      </h3>
                    )}
                    {topics.map((topic) => (
                      <div
                        key={topic.id}
                        className="flex flex-wrap items-start gap-snug rounded-lg border p-snug"
                      >
                        <div className="min-w-0 flex-1 flex-col gap-hairline">
                          <Link
                            to={path(`/progress/topic/${topic.id}`)}
                            className="focus-visible:ring-ring rounded text-sm font-medium outline-none hover:underline focus-visible:ring-2"
                          >
                            {topic.title}
                          </Link>
                          <p className="text-muted-foreground text-xs leading-relaxed">
                            {topic.summary}
                          </p>
                        </div>
                        {topic.priority !== 'normal' && (
                          <Badge variant="secondary" className="font-normal">
                            {topic.priority === 'high' ? 'High priority' : 'Low priority'}
                          </Badge>
                        )}
                        {!topicsWithQuestions.has(topic.id) && (
                          <Badge variant="outline" className="font-normal">
                            No questions
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {existing.some((t) => !topicsWithQuestions.has(t.id)) && (
                <Alert>
                  <AlertTitle>Some topics have no practice questions</AlertTitle>
                  <AlertDescription>
                    This prototype has an authored question bank and cannot write
                    questions for a topic you added. Those topics still work with the
                    tutor where a script exists, can hold your own readings and notes,
                    and can be covered by an assessment. They simply cannot generate a
                    quiz. Nothing unrelated will be attached to them to hide that.
                  </AlertDescription>
                </Alert>
              )}
            </Section>
          )}
        </>
      )}

      {/* ── The editor ────────────────────────────────────────────────── */}
      {draft && (
        <Section
          title={reading ? 'Review the proposed outline' : 'Edit the outline'}
          description={
            reading
              ? `Proposed from ${fileNote ?? 'your text'}. Nothing has been created yet. Rename, reorder, group and delete, then confirm.`
              : 'Rename, reorder, group and delete. Topics keep their identity, so your history and materials stay attached.'
          }
        >
          {reading && (
            <Alert>
              {reading.fromSample ? <SparklesIcon /> : <FileTextIcon />}
              <AlertTitle>
                {reading.fromSample ? 'Sample syllabus' : 'Simulated extraction'}
              </AlertTitle>
              <AlertDescription>{reading.summary}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-tight">
            {draft.map((row, index) => (
              <Card key={row.key}>
                <CardContent className="flex flex-col gap-snug">
                  <div className="flex flex-wrap items-center gap-tight">
                    <span className="text-muted-foreground font-mono text-xs tabular-nums">
                      {index + 1}
                    </span>
                    {reading && (
                      <Badge
                        variant={row.confidence === 'high' ? 'secondary' : 'outline'}
                        className="font-normal"
                      >
                        {row.confidence === 'high' ? 'Matched' : 'Uncertain'}
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-xs">{row.matchedBy}</span>
                    <div className="flex-1" />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => move(row.key, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${row.title || 'this topic'} up`}
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => move(row.key, 1)}
                      disabled={index === draft.length - 1}
                      aria-label={`Move ${row.title || 'this topic'} down`}
                    >
                      <ArrowDownIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeRow(row.key)}
                      aria-label={`Remove ${row.title || 'this topic'}`}
                      className="text-destructive"
                    >
                      <Trash2Icon />
                    </Button>
                  </div>

                  <div className="grid gap-tight sm:grid-cols-[1fr_12rem]">
                    <div className="flex flex-col gap-hairline">
                      <Label htmlFor={`title-${row.key}`} className="sr-only">
                        Topic title
                      </Label>
                      <Input
                        id={`title-${row.key}`}
                        value={row.title}
                        onChange={(e) => patch(row.key, { title: e.target.value })}
                        placeholder="Topic title"
                      />
                    </div>
                    <div className="flex flex-col gap-hairline">
                      <Label htmlFor={`module-${row.key}`} className="sr-only">
                        Module or week
                      </Label>
                      <Input
                        id={`module-${row.key}`}
                        value={row.module ?? ''}
                        onChange={(e) =>
                          patch(row.key, { module: e.target.value || null })
                        }
                        placeholder="Week or module"
                      />
                    </div>
                  </div>

                  <Textarea
                    value={row.summary}
                    onChange={(e) => patch(row.key, { summary: e.target.value })}
                    placeholder="One sentence about this topic (optional)"
                    rows={2}
                    aria-label={`Description for ${row.title || 'this topic'}`}
                  />

                  {row.sourceLine && (
                    <p className="text-muted-foreground font-mono text-xs">
                      From: {row.sourceLine}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Button variant="outline" onClick={addRow} className="self-start">
            <PlusIcon />
            Add a topic
          </Button>

          {droppedExisting.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>
                {droppedExisting.length} existing{' '}
                {droppedExisting.length === 1 ? 'topic' : 'topics'} will be removed
              </AlertTitle>
              <AlertDescription>
                <span className="flex flex-col gap-tight">
                  {droppedExisting.map((topic) => {
                    const impact = removalImpact(topic.id);
                    const pointing = [
                      impact.attemptCount > 0 &&
                        `${impact.attemptCount} ${impact.attemptCount === 1 ? 'attempt' : 'attempts'}`,
                      impact.materialCount > 0 &&
                        `${impact.materialCount} ${impact.materialCount === 1 ? 'material' : 'materials'}`,
                      impact.questionCount > 0 &&
                        `${impact.questionCount} ${impact.questionCount === 1 ? 'question' : 'questions'}`,
                      impact.assessmentCount > 0 &&
                        `${impact.assessmentCount} ${impact.assessmentCount === 1 ? 'assessment' : 'assessments'}`,
                    ].filter(Boolean);
                    return (
                      <span key={topic.id} className="text-xs">
                        <strong>{topic.title}</strong>
                        {pointing.length > 0
                          ? `: ${pointing.join(', ')} point at it. Your attempts stay in your history, but they will no longer count toward any topic.`
                          : ': nothing points at it.'}
                      </span>
                    );
                  })}
                </span>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-tight">
            <Button
              onClick={() => confirm(draft, existing.length > 0)}
              disabled={draft.filter((r) => r.title.trim()).length === 0}
            >
              <CheckIcon />
              Confirm {draft.filter((r) => r.title.trim()).length}{' '}
              {draft.filter((r) => r.title.trim()).length === 1 ? 'topic' : 'topics'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setReading(null);
                setFileNote(null);
              }}
            >
              Cancel
            </Button>
          </div>

          {reading && reading.skipped.length > 0 && (
            <Section
              title={`Lines that were not used (${reading.skipped.length})`}
              description="Shown so you can see what the matcher ignored rather than wondering whether it read them."
            >
              <Card className="bg-muted/30">
                <CardContent className="flex flex-col gap-hairline">
                  {reading.skipped.map((line, i) => (
                    <p key={i} className="text-muted-foreground font-mono text-xs">
                      {line}
                    </p>
                  ))}
                </CardContent>
              </Card>
            </Section>
          )}
        </Section>
      )}

      {/* ── Ways in ───────────────────────────────────────────────────── */}
      {!draft && (
        <Section
          title={existing.length > 0 ? 'Replace the outline' : 'Set up your topics'}
          description="Nothing is created until you review a proposal and confirm it."
        >
          <Tabs defaultValue="syllabus">
            <TabsList>
              <TabsTrigger value="syllabus">From a syllabus</TabsTrigger>
              <TabsTrigger value="manual">Build it yourself</TabsTrigger>
            </TabsList>

            <TabsContent value="syllabus" className="flex flex-col gap-base pt-base">
              {unsupported && (
                <Alert variant="destructive">
                  <AlertTriangleIcon />
                  <AlertTitle>“{unsupported}” was not read</AlertTitle>
                  <AlertDescription>
                    This prototype reads plain text and Markdown in the browser. It has
                    no PDF or Word parser, so rather than show you invented text it has
                    not opened the file at all. Copy the outline out of it and paste it
                    below.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-tight">
                <Label htmlFor="syllabus-text">Paste your syllabus</Label>
                <Textarea
                  id="syllabus-text"
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={10}
                  placeholder={'Week 1: Introduction\nWeek 2: The next thing\n…'}
                  className="font-mono text-xs"
                />
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Lines like “Week 3: Estimation”, “Unit II: Conquest” or a numbered
                  list are recognised. This is pattern matching over the text, not a
                  model reading it, and you will see exactly what matched before
                  anything is created.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-tight">
                <Button
                  onClick={() => interpret(pasted, 'the text you pasted')}
                  disabled={!pasted.trim()}
                >
                  <SparklesIcon />
                  Read it
                </Button>

                <input
                  ref={fileInput}
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void pickFile(file);
                    e.target.value = '';
                  }}
                />
                <Button variant="outline" onClick={() => fileInput.current?.click()}>
                  <UploadIcon />
                  Choose a .txt or .md file
                </Button>

                <Separator orientation="vertical" className="h-6" />

                <Button variant="ghost" onClick={useSample}>
                  <FileTextIcon />
                  Try the sample syllabus
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="manual" className="flex flex-col gap-base pt-base">
              <p className="text-muted-foreground text-sm leading-relaxed">
                Start from an empty week-by-week outline and fill it in. This is the
                right path when your syllabus is written as prose, or when you would
                rather type six titles than tidy up six guesses.
              </p>
              <div className="flex flex-wrap items-center gap-tight">
                {[6, 10, 12].map((weeks) => (
                  <Button key={weeks} variant="outline" onClick={() => startBlank(weeks)}>
                    {weeks} weeks
                  </Button>
                ))}
                <Button variant="ghost" onClick={() => startBlank(1)}>
                  <PlusIcon />
                  Start with one
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </Section>
      )}

      {/* ── Priorities, which live on the topic rather than the outline ── */}
      {!draft && existing.length > 0 && (
        <Section
          title="Priorities"
          description="What you mark high is weighted up in the planner and in today's suggestions."
        >
          <div className="flex flex-col gap-tight">
            {existing.map((topic) => (
              <div
                key={topic.id}
                className="flex flex-wrap items-center gap-snug rounded-lg border p-snug"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{topic.title}</span>
                <Label htmlFor={`priority-${topic.id}`} className="sr-only">
                  Priority for {topic.title}
                </Label>
                <Select
                  id={`priority-${topic.id}`}
                  value={topic.priority}
                  onChange={(e) =>
                    dispatch({
                      type: 'update-topic',
                      topicId: topic.id,
                      patch: { priority: e.target.value as TopicPriority },
                    })
                  }
                  className="w-36"
                >
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </Select>
              </div>
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}

/** Groups topics by module, preserving outline order and keeping strays. */
function groupByModule(topics: Topic[]): { module: string | null; topics: Topic[] }[] {
  const groups = new Map<string | null, Topic[]>();
  for (const topic of topics) {
    const key = topic.module?.trim() || null;
    groups.set(key, [...(groups.get(key) ?? []), topic]);
  }
  return [...groups.entries()].map(([module, rows]) => ({ module, topics: rows }));
}
