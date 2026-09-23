import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  DumbbellIcon,
  SendIcon,
  SquarePenIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import type { TutorIntent, TutorSession } from '@shared/types.ts';
import {
  SCRIPTED_NOTICE,
  STAGE_BLURB,
  STAGE_LABEL,
  STAGE_ORDER,
} from '@shared/course/tutor-script.ts';

import { Prose } from '@/components/Prose';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { MEDIA_WIDE, useMediaQuery } from '@/components/layout';
import { SimulatedNotice, SourceLink } from '@/components/domain';
import { useStore } from '@/store/store';
import { useCoursePath } from '@/store/course-context';
import { useSource, useTopic, useTutorSession } from '@/store/selectors';
import { respond, studentMessage, summarise } from './engine';
import { NotFoundPage } from '@/routes';
import { cn } from '@/lib/utils';

/**
 * A tutor session.
 *
 * ── Layout ───────────────────────────────────────────────────────────────
 *
 * Two columns on desktop: the conversation, and a context rail holding the
 * passage being discussed and the stage arc. On mobile the rail becomes a
 * sheet, because the brief is explicit that a phone should switch between
 * reading and tutoring rather than squeeze both into one viewport — and a
 * 320px-wide reading column beside a 320px-wide chat serves neither.
 *
 * ── Why the stage arc is visible ──────────────────────────────────────────
 *
 * The brief asks the tutor to demonstrate orient → understand → recall →
 * reason → apply → reflect. A student cannot see a pedagogical arc from inside
 * the conversation; showing where they are makes the structure legible and,
 * more usefully, makes "we have not tested this yet" visible before the exam
 * does it for them.
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

      <SimulatedNotice tone="block">{SCRIPTED_NOTICE}</SimulatedNotice>
    </div>
  );
}

export function TutorSessionPage() {
  const path = useCoursePath();
  const { sessionId } = useParams();
  const session = useTutorSession(sessionId);
  const { dispatch } = useStore();
  const navigate = useNavigate();
  const wide = useMediaQuery(MEDIA_WIDE);
  const topic = useTopic(session?.topicId);
  const [draft, setDraft] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const summary = useMemo(() => (session ? summarise(session) : null), [session]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [session?.messages.length]);

  if (!session) return <NotFoundPage />;

  const send = (text: string, intent?: TutorIntent) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const result = respond(session, { text: trimmed, ...(intent ? { intent } : {}) });
    const updated: TutorSession = {
      ...session,
      messages: [
        ...session.messages,
        studentMessage(trimmed, session.stage),
        ...result.messages,
      ],
      stage: result.stage,
      updatedAt: new Date().toISOString(),
      ...(result.ended ? { endedAt: new Date().toISOString() } : {}),
    };

    dispatch({ type: 'upsert-tutor-session', session: updated });
    setDraft('');

    if (result.launchPractice) {
      const topics = result.launchPractice.topicIds.join(',');
      toast.success('Practice set ready', {
        description: 'Opening the setup so you can adjust it first.',
      });
      navigate(path(`/practice/new?topic=${topics}&from=${session.id}`));
    }
  };

  const endSession = () => {
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

  const last = session.messages[session.messages.length - 1];
  const suggestions = last?.role === 'tutor' ? (last.suggestions ?? []) : [];

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
            <span className="truncate text-sm font-medium">
              {topic?.title ?? 'Session'}
            </span>
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
          {!session.endedAt && (
            <Button variant="outline" size="sm" onClick={endSession}>
              <CheckCircle2Icon />
              End session
            </Button>
          )}
        </div>

        {/* Transcript */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-base px-gutter py-gutter">
            {session.messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex flex-col gap-tight',
                  message.role === 'student' && 'items-end',
                )}
              >
                <div
                  className={cn(
                    'max-w-[90%] rounded-xl px-gutter py-snug',
                    message.role === 'student'
                      ? 'bg-primary text-primary-foreground'
                      : message.meta
                        ? 'bg-muted/60 text-muted-foreground border border-dashed'
                        : 'bg-card border',
                  )}
                >
                  <Prose
                    text={message.text}
                    size={message.role === 'student' ? 'compact' : 'reading'}
                  />
                </div>
                {message.source && (
                  <SourceLink source={message.source} className="px-tight" />
                )}
              </div>
            ))}

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
                          <span className="bg-evidence-independent-mark mt-1.5 size-1.5 shrink-0 rounded-full" aria-hidden />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-tight pt-tight">
                    {summary.nextStep && (
                      <Button size="sm" asChild>
                        <Link to={summary.nextStep.to}>{summary.nextStep.label}</Link>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/">Back to overview</Link>
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
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-tight">
                  {suggestions.map((suggestion) => (
                    <Button
                      key={suggestion.label}
                      variant="outline"
                      size="sm"
                      onClick={() => send(suggestion.label, suggestion.intent)}
                    >
                      {suggestion.label}
                    </Button>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-tight">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(draft);
                    }
                  }}
                  rows={2}
                  placeholder="Answer, or ask for an explanation, a hint or an example…"
                  aria-label="Your message to the tutor"
                  className="min-h-0 resize-none"
                />
                <Button
                  size="icon"
                  onClick={() => send(draft)}
                  disabled={!draft.trim()}
                  aria-label="Send"
                >
                  <SendIcon />
                </Button>
              </div>

              <div className="text-muted-foreground flex flex-wrap items-center gap-tight text-xs">
                <SquarePenIcon className="size-3" aria-hidden />
                <span>Enter to send, Shift+Enter for a new line.</span>
                <Separator orientation="vertical" className="h-3" />
                <span>
                  Asking for a hint costs you nothing here — this is supported
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
