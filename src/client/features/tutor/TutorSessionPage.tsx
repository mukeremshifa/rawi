import { MessageBubble } from './MessageBubble';
import { useDraftState } from '@/store/drafts';
import { useLocation } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  DumbbellIcon,
  RotateCcwIcon,
  SendIcon,
  SquareIcon,
  SquarePenIcon,
} from 'lucide-react';
import { toast } from '@/lib/toast';

import type { TutorAction } from '@shared/ai.ts';
import type { TutorMessage, TutorSession } from '@shared/types.ts';
import { AI_TUTOR_NOTICE, STAGE_BLURB, STAGE_LABEL, STAGE_ORDER } from '@shared/tutor.ts';

import { Prose } from '@/components/Prose';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { MEDIA_WIDE, useMediaQuery } from '@/components/layout';
import { SimulatedNotice } from '@/components/domain';
import { useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import {
  useAttempts,
  useMaterials,
  useQuestionMap,
  useSource,
  useTopic,
  useTutorSession,
} from '@/store/selectors';
import { AiRequestError, streamTutor, useAiStatus, visibleTutorText } from '@/lib/ai';
import { newId } from '@/lib/id';
import {
  buildTutorRequest,
  citationOrder,
  renderCitations,
  resolveCitations,
  studentMessage,
  summarise,
} from './engine';
import { NotFoundPage } from '@/routes';
import { cn } from '@/lib/utils';

/**
 * A tutor session.
 *
 * ── Layout ───────────────────────────────────────────────────────────────
 *
 * Two columns on desktop: the conversation, and a context rail holding the
 * passage being discussed and the stage arc. On mobile the rail becomes a
 * sheet, because a phone should switch between reading and tutoring rather
 * than squeeze both into one viewport.
 *
 * ── Replies ──────────────────────────────────────────────────────────────
 *
 * Each student turn is saved the moment it is sent, then the reply streams
 * in. A finished reply is saved as a complete turn with its model, its
 * validated citations and how far it rests on the material. A reply that is
 * cancelled or fails part-way is saved as `interrupted` and labelled, so it is
 * never mistaken for a complete teaching turn. A failure with no text saves
 * nothing but the student's message, and Retry sends that message again
 * rather than a second copy of it. No scripted text ever stands in for a
 * failed reply.
 *
 * ── Why the stage arc is visible ──────────────────────────────────────────
 *
 * A student cannot see a pedagogical arc from inside the conversation.
 * Showing where they are makes the structure legible and makes "we have not
 * tested this yet" visible before the exam does it for them.
 */

function StageArc({ current }: { current: TutorSession['stage'] }) {
  const currentIndex = STAGE_ORDER.indexOf(current);
  return (
    <ol className="flex flex-col gap-hairline" aria-label="Session stages">
      {STAGE_ORDER.map((stage, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={stage}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex items-start gap-tight rounded-md px-tight py-1 text-xs',
              active && 'bg-secondary font-medium',
              !active && !done && 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'mt-1 size-1.5 shrink-0 rounded-full',
                done && 'bg-evidence-independent-mark',
                active && 'bg-primary',
                !done && !active && 'bg-border',
              )}
              aria-hidden
            />
            <span className="flex flex-col gap-hairline">
              <span>{STAGE_LABEL[stage]}</span>
              {active && (
                <span className="text-muted-foreground font-normal">
                  {STAGE_BLURB[stage]}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ContextPanel({ session }: { session: TutorSession }) {
  const path = useCoursePath();
  const topic = useTopic(session.topicId);
  const resolved = useSource(session.source);
  const { state } = useStore();
  const origin = state.attempts.find(a => a.id === session.fromAttemptId && a.courseId === session.courseId);

  return (
    <div className="flex flex-col gap-section p-gutter">
      <div className="flex flex-col gap-snug">
        <h2 className="text-sm font-semibold">Where you are</h2>
        <StageArc current={session.stage} />
      </div>

      {topic && (
        <div className="flex flex-col gap-tight">
          <h2 className="text-sm font-semibold">Topic</h2>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {topic.summary}
          </p>
          <Button variant="outline" size="sm" asChild className="self-start">
            <Link to={path(`/practice/new?topic=${topic.id}`)}>
              <DumbbellIcon />
              Practise this topic
            </Link>
          </Button>
        </div>
      )}

      {session.review && <section className="flex flex-col gap-2"><h2 className="text-sm font-semibold">Exact answer being reviewed</h2><Prose text={session.review.prompt} /><h3 className="text-xs font-semibold">Your submitted answer</h3><Prose text={session.review.response || 'No answer submitted.'} /><p className="text-xs">{session.review.pending ? 'Feedback pending' : `${session.review.marksAwarded}/${session.review.marksAvailable} marks`} · {session.review.usedHint ? 'Hint used' : 'No hint recorded'}</p><h3 className="text-xs font-semibold">Answer key and recorded feedback</h3><Prose text={session.review.answerKey + '\n\n' + session.review.feedback} /></section>}
      {origin && <Button variant="outline" asChild><Link to={path(`/${origin.kind === 'exam' ? 'exams' : 'practice'}/results/${origin.id}`)}>Return to originating result</Link></Button>}
      {session.source && !resolved && <p className="text-muted-foreground text-xs">The original source is unavailable. The saved conversation and answer review remain.</p>}
      {resolved && (
        <div className="flex flex-col gap-tight">
          <h2 className="text-sm font-semibold">The passage</h2>
          <Link
            to={path(`/materials/${resolved.material.id}#${resolved.passage.id}`)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-hairline text-xs underline-offset-4 hover:underline"
          >
            <BookOpenIcon className="size-3 shrink-0" aria-hidden />
            {resolved.material.title}
          </Link>
          <Card>
            <CardContent>
              <h3 className="mb-tight text-xs font-medium">
                {resolved.passage.heading}
              </h3>
              <Prose
                text={resolved.passage.text}
                size="compact"
                className="text-muted-foreground max-h-72 overflow-y-auto"
              />
            </CardContent>
          </Card>
        </div>
      )}

      <SimulatedNotice tone="block">{AI_TUTOR_NOTICE}</SimulatedNotice>
    </div>
  );
}

const QUICK_ACTIONS: { label: string; action: TutorAction }[] = [
  { label: 'Explain it', action: 'explain' },
  { label: 'Give me an example', action: 'example' },
  { label: 'Give me a hint', action: 'hint' },
  { label: 'Test me', action: 'check' },
  { label: 'Say that more simply', action: 'simpler' },
];

interface Failure {
  message: string;
  code: string;
  retry: { text: string; action: TutorAction };
}

const CITATION_MARKER = /\[\[([^\]\s]{1,200})\]\]/g;

export function TutorSessionPage() {
  const draftLocation = useLocation();
  const draftPrefix = `form:${draftLocation.pathname}${draftLocation.search}:`;
  const path = useCoursePath();
  const course = useCourse();
  const { sessionId } = useParams();
  const session = useTutorSession(sessionId);
  const { dispatch } = useStore();
  const wide = useMediaQuery(MEDIA_WIDE);
  const topic = useTopic(session?.topicId);
  const materials = useMaterials();
  const attempts = useAttempts();
  const questionMap = useQuestionMap();
  const { unavailable, refresh } = useAiStatus();
  const [draft, setDraft] = useDraftState(draftPrefix + "draft", '');
  const [contextOpen, setContextOpen] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(() => {
    const last = session?.messages.at(-1);
    if (last?.role !== 'student' && last?.status !== 'interrupted') return null;
    const student = [...(session?.messages ?? [])].reverse().find(m => m.role === 'student');
    return student ? { code: 'upstream', message: 'The previous reply did not finish. Your message is saved.', retry: { text: student.text, action: 'message' } } : null;
  });
  const controllerRef = useRef<AbortController | null>(null);
  const partialRef = useRef('');
  const endRef = useRef<HTMLDivElement>(null);

  const summary = useMemo(() => (session ? summarise(session) : null), [session]);
  const busy = streaming !== null || !!session?.archived || course.archived;

  /* A session opened from a missed answer starts with a useful draft. */
  const fromQuestion = session?.fromQuestionId
    ? questionMap.get(session.fromQuestionId)
    : undefined;
  const sessionKey = session?.id;
  useEffect(() => {
    if (!draft && fromQuestion && session && !session.messages.some((m) => m.role === 'student')) {
      setDraft(`Help me see where I went wrong on this question: ${fromQuestion.prompt}`);
    }
    // Only when the session first opens.
  }, [sessionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (window.location.hash && document.getElementById(window.location.hash.slice(1))) { document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'center' }); return; }
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [session?.messages.length, streaming]);

  /* Leaving the page cancels a reply in flight rather than paying for it. */
  useEffect(() => () => controllerRef.current?.abort(), []);

  if (!session || session.courseId !== course.id) return <NotFoundPage />;

  /**
   * Requests one reply to `text`. The student's turn is already saved, and
   * `history` is everything before it.
   */
  const run = async (text: string, action: TutorAction, history: TutorMessage[]) => {
    if (!topic || session.archived || course.archived) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    partialRef.current = '';
    setFailure(null);
    setStreaming('');

    const request = buildTutorRequest({
      course,
      topic,
      session,
      history,
      message: text,
      action,
      materials,
      attempts,
      questions: questionMap,
    });

    try {
      const done = await streamTutor(
        request,
        (delta) => {
          partialRef.current += delta;
          setStreaming(partialRef.current);
        },
        controller.signal,
      );
      const citations = resolveCitations(done.citations, request.passages);
      const dropped = done.droppedCitations + (done.citations.length - citations.length);
      dispatch({
        type: 'append-tutor-messages',
        sessionId: session.id,
        stage: done.meta.stage,
        messages: [
          {
            id: newId('msg'),
            role: 'tutor',
            text: done.text,
            stage: session.stage,
            model: done.usage.model,
            status: 'complete',
            grounding: done.meta.grounding,
            citations,
            ...(dropped > 0 ? { droppedCitations: dropped } : {}),
          },
        ],
      });
    } catch (error) {
      const e =
        error instanceof AiRequestError
          ? error
          : new AiRequestError('upstream', 'Something went wrong while the reply was arriving.');
      const partial = visibleTutorText(partialRef.current).trim();
      if (partial) {
        const known = new Set(request.passages.map((p) => p.id));
        const cleaned = partial.replace(CITATION_MARKER, (m, id: string) =>
          known.has(id) ? m : '',
        );
        dispatch({
          type: 'append-tutor-messages',
          sessionId: session.id,
          messages: [
            {
              id: newId('msg'),
              role: 'tutor',
              text: cleaned,
              stage: session.stage,
              status: 'interrupted',
              citations: resolveCitations(citationOrder(cleaned), request.passages),
            },
          ],
        });
      }
      setFailure({
        code: e.code,
        message: e.code === 'cancelled' ? 'You stopped the reply.' : e.message,
        retry: { text, action },
      });
      if (e.code === 'not-configured' || e.code === 'unreachable' || e.code === 'auth') {
        refresh();
      }
    } finally {
      controllerRef.current = null;
      partialRef.current = '';
      setStreaming(null);
    }
  };

  const send = (text: string, action: TutorAction = 'message') => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const history = session.messages;
    dispatch({
      type: 'append-tutor-messages',
      sessionId: session.id,
      messages: [studentMessage(trimmed, session.stage)],
    });
    setDraft('');
    void run(trimmed, action, history);
  };

  /* The student's turn is already saved, so Retry resends it without adding a
     second copy. History is everything before that turn. */
  const retry = () => {
    if (!failure || busy) return;
    let cut = session.messages.length;
    for (let i = session.messages.length - 1; i >= 0; i -= 1) {
      if (session.messages[i]!.role === 'student') {
        cut = i;
        break;
      }
    }
    void run(failure.retry.text, failure.retry.action, session.messages.slice(0, cut));
  };

  const endSession = () => {
    if (session.endedAt || session.archived) return;
    controllerRef.current?.abort();
    dispatch({
      type: 'upsert-tutor-session',
      session: {
        ...session,
        endedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    toast.success('Session saved', {
      description: 'You can reopen it from the Tutor page.',
    });
  };

  const streamingText = streaming ? visibleTutorText(streaming) : '';

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex shrink-0 flex-wrap items-center gap-snug border-b px-gutter py-snug">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link to={path('/tutor')}>
              <ArrowLeftIcon />
              Tutor
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-sm font-medium">
              {session.title ?? topic?.title ?? 'Session'}
            </h1>
            <span className="text-muted-foreground text-xs">
              {STAGE_LABEL[session.stage]}
              {session.endedAt ? ' · ended' : ''}
            </span>
          </div>
          <div className="flex-1" />
          {!wide && (
            <Sheet open={contextOpen} onOpenChange={setContextOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <BookOpenIcon />
                  Context
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[22rem] overflow-y-auto p-0">
                <SheetHeader className="border-b">
                  <SheetTitle>Session context</SheetTitle>
                </SheetHeader>
                <ContextPanel session={session} />
              </SheetContent>
            </Sheet>
          )}
          {session.archived && <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'upsert-tutor-session', session: { ...session, archived: false } })}>Restore session</Button>}
                  {!session.endedAt && !session.archived && !course.archived && (
            <Button variant="outline" size="sm" onClick={endSession}>
              <CheckCircle2Icon />
              End session
            </Button>
          )}
        </div>

        {/* Transcript */}
        <div className="min-h-0 flex-1 overflow-y-auto" tabIndex={0} role="region" aria-label="Tutor conversation">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-base px-gutter py-gutter">
            {session.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {streaming !== null && (
              <div className="flex flex-col gap-tight" aria-live="polite">
                <div className="bg-card max-w-[90%] rounded-xl border px-gutter py-snug">
                  {streamingText.trim() ? (
                    <Prose
                      text={renderCitations(streamingText, citationOrder(streamingText))}
                      size="reading"
                    />
                  ) : (
                    <p className="text-muted-foreground text-sm">Thinking…</p>
                  )}
                </div>
              </div>
            )}

            {failure && (
              <Alert variant={failure.code === 'cancelled' ? 'default' : 'destructive'}>
                <AlertTriangleIcon />
                <AlertTitle>
                  {failure.code === 'cancelled' ? 'Reply stopped' : 'The tutor could not reply'}
                </AlertTitle>
                <AlertDescription className="flex flex-col gap-tight">
                  <span>{failure.message}</span>
                  <span>Your message is saved. Nothing has been lost.</span>
          {!session.endedAt && !session.archived && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="self-start"
                      onClick={retry}
                      disabled={!!unavailable}
                    >
                      <RotateCcwIcon />
                      Try again
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {session.endedAt && summary && (
              <Card className="border-primary/40">
                <CardContent className="flex flex-col gap-snug">
                  <div className="flex items-center gap-tight">
                    <CheckCircle2Icon className="text-success size-4" aria-hidden />
                    <span className="font-medium">Session summary</span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    You reached the <strong>{STAGE_LABEL[summary.stageReached]}</strong>{' '}
                    stage.
                  </p>
                  {summary.covered.length > 0 && (
                    <ul className="flex flex-col gap-hairline text-sm">
                      {summary.covered.map((item) => (
                        <li key={item} className="flex items-start gap-tight">
                          <span
                            className="bg-evidence-independent-mark mt-1.5 size-1.5 shrink-0 rounded-full"
                            aria-hidden
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-tight pt-tight">
                    {summary.nextStep && (
                      <Button size="sm" asChild>
                        <Link to={path(summary.nextStep.to)}>{summary.nextStep.label}</Link>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <Link to={path('')}>Back to overview</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div ref={endRef} />
          </div>
        </div>

        {/* Composer */}
        {!session.endedAt && (
          <div className="shrink-0 border-t">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-snug px-gutter py-snug">
              {unavailable && (
                <Alert variant="destructive">
                  <AlertTriangleIcon />
                  <AlertTitle>The AI tutor is not available</AlertTitle>
                  <AlertDescription className="flex flex-col gap-tight">
                    <span>{unavailable}</span>
                    <span>This session and everything in it are saved.</span>
                    <Button variant="outline" size="sm" className="self-start" onClick={refresh}>
                      Check again
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-tight">
                {QUICK_ACTIONS.map((quick) => (
                  <Button
                    key={quick.action}
                    variant="outline"
                    size="sm"
                    disabled={busy || !!unavailable}
                    onClick={() => send(quick.label, quick.action)}
                  >
                    {quick.label}
                  </Button>
                ))}
                {topic && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={path(`/practice/new?topic=${topic.id}&from=${session.id}`)}>
                      <DumbbellIcon />
                      Practise this
                    </Link>
                  </Button>
                )}
              </div>

              <div className="flex items-end gap-tight">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!unavailable) send(draft);
                    }
                  }}
                  rows={2}
                  placeholder="Answer, or ask for an explanation, a hint or an example…"
                  aria-label="Your message to the tutor"
                  disabled={!!session.archived || course.archived}
                  className="min-h-0 resize-none"
                />
                {busy ? (
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => controllerRef.current?.abort()}
                    aria-label="Stop the reply"
                  >
                    <SquareIcon />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    onClick={() => send(draft)}
                    disabled={busy || !draft.trim() || !!unavailable}
                    aria-label="Send"
                  >
                    <SendIcon />
                  </Button>
                )}
              </div>

              <div className="text-muted-foreground flex flex-wrap items-center gap-tight text-xs">
                <SquarePenIcon className="size-3" aria-hidden />
                <span>Enter to send, Shift+Enter for a new line.</span>
                <Separator orientation="vertical" className="h-3" />
                <span>
                  Asking for a hint costs you nothing here, because this is supported
                  learning, not an assessment.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {wide && (
        <aside className="w-80 shrink-0 overflow-y-auto border-l">
          <ContextPanel session={session} />
        </aside>
      )}
    </div>
  );
}

/** The chip shown on lists of sessions. */
export function SessionStageBadge({ session }: { session: TutorSession }) {
  return (
    <Badge variant="secondary" className="font-normal">
      {STAGE_LABEL[session.stage]}
    </Badge>
  );
}
