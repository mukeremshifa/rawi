import { useDraftState } from '@/store/drafts';
import { EditMaterialDialog } from './EditMaterialDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SourceLink } from '@/components/domain';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckIcon,
  DumbbellIcon,
  MessageSquareIcon,
  NotebookPenIcon,
  Trash2Icon,
} from 'lucide-react';
import { toast } from '@/lib/toast';

import { Page, PageHeader } from '@/components/layout';
import { Prose } from '@/components/Prose';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Separator } from '@/components/ui/separator';
import {
  FictionalNotice,
  ImportedNotice,
  KIND_LABEL,
  ORIGIN_LABEL,
  formatDate,
  formatDueDate,
} from '@/components/domain';
import { useAllSessions, useMaterial, useTopicMap } from '@/store/selectors';
import { useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import { newId } from '@/lib/id';
import { NotFoundPage } from '@/routes';

/**
 * One material, read at full width, with actions on every passage.
 *
 * ── The passage action is the point of this screen ────────────────────────
 *
 * The brief asks that a student be able to select a passage, or use a passage
 * action, to ask the tutor / save a note / practise the topic. Both paths are
 * here, because they answer different needs: the per-passage buttons are
 * discoverable and always available, and the selection toolbar handles "this
 * sentence specifically", which is what a student actually wants when they are
 * stuck mid-paragraph.
 *
 * The selection toolbar appears on `mouseup`/`keyup` within the reading column
 * and disappears when the selection collapses. It positions itself under the
 * selection rather than floating over it, because a popover on top of the text
 * you just selected hides the thing you are asking about.
 */

interface Selection {
  text: string;
  passageId: string;
  top: number;
  left: number;
}

export function MaterialPage() {
  const path = useCoursePath();
  const course = useCourse();
  const { materialId } = useParams();
  const [searchParams] = useSearchParams();
  const material = useMaterial(materialId);
  const topicMap = useTopicMap();
  const { dispatch } = useStore();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editing, setEditing] = useState(searchParams.get('link') === '1');
  const [pending, setPending] = useDraftState<{ activity: 'tutor' | 'practice'; passageId: string; quote?: string } | null>(`material-intent:${course.id}:${materialId}`, null);
  const [choosing, setChoosing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /*
   * A planner reading session, when one sent the student here.
   *
   * Reading has no completion event the app can observe: there is no answer to
   * mark and no end of a run. Opening a material therefore does *not* complete
   * the session, because "I opened it" and "I read it" are different claims and
   * only the student knows which is true. So the session offers an explicit
   * button instead, which is also what offline study needs.
   */
  const plannedSessionId = searchParams.get('session') ?? undefined;
  const allSessions = useAllSessions();
  const linkedSession = plannedSessionId
    ? allSessions.find(
        (session) =>
          session.id === plannedSessionId &&
          session.courseId === course.id &&
          session.status === 'planned',
      )
    : undefined;

  const completeReading = () => {
    if (!linkedSession) return;
    dispatch({
      type: 'save-session',
      session: {
        ...linkedSession,
        status: 'completed',
        completedAt: new Date().toISOString(),
      },
    });
    toast.success('Reading marked done', {
      description: 'Your planner session is complete. It counts once toward your streak.',
    });
  };

  /* Scroll to a passage named in the hash — how question reviews link back. */
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('ring-2', 'ring-ring', 'rounded-md');
      const timer = setTimeout(
        () => el.classList.remove('ring-2', 'ring-ring', 'rounded-md'),
        2000,
      );
      return () => clearTimeout(timer);
    }
    return;
  }, [materialId]);

  if (!material || material.courseId !== course.id) return <NotFoundPage />;

  const captureSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setSelection(null);
      return;
    }
    const text = sel.toString().trim();
    if (text.length < 8) {
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }

    // Walk up to the passage element so the action knows what it is acting on.
    let node: Node | null = range.commonAncestorContainer;
    while (node && !(node instanceof HTMLElement && node.dataset.passageId)) {
      node = node.parentNode;
    }
    const passageId =
      node instanceof HTMLElement ? (node.dataset.passageId ?? '') : '';
    if (!passageId) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    setSelection({
      text,
      passageId,
      top: rect.bottom - box.top + 8,
      left: Math.max(0, rect.left - box.left),
    });
  };

  const askTutor = (passageId: string, quote?: string) => {
    const passage = material.passages.find((p) => p.id === passageId);
    const ids = (passage?.topicIds.length ? passage.topicIds : material.topicIds).filter(id => topicMap.get(id)?.courseId === course.id);
    if (ids.length !== 1) { setPending({ activity: 'tutor', passageId, quote }); if (ids.length) setChoosing(true); else setEditing(true); return; }
    const topicId = ids[0];
    if (!topicId) {
      toast.error('No topic linked', {
        description:
          'Link this material to a topic first. Tutor sessions are organised by topic.',
      });
      return;
    }
    const params = new URLSearchParams({
      topic: topicId,
      material: material.id,
      passage: passageId,
    });
    if (quote) params.set('quote', quote.slice(0, 240));
    navigate(path(`/tutor/new?${params.toString()}`));
  };

  const practise = (passageId: string) => {
    const passage = material.passages.find((p) => p.id === passageId);
    const ids = (passage?.topicIds.length ? passage.topicIds : material.topicIds).filter(id => topicMap.get(id)?.courseId === course.id);
    if (ids.length !== 1) { setPending({ activity: 'practice', passageId }); if (ids.length) setChoosing(true); else setEditing(true); return; }
    const topicId = ids[0];
    if (!topicId) {
      toast.error('No topic linked', {
        description: 'Link this material to a topic to practise from it.',
      });
      return;
    }
    navigate(path(`/practice/new?topic=${topicId}&material=${material.id}`));
  };

  const saveNote = (passageId: string, quote: string) => {
    const passage = material.passages.find((p) => p.id === passageId);
    const id = newId('mat');
    dispatch({
      type: 'add-material',
      material: {
        id,
        courseId: course.id,
        title: `Note on ${material.title}`,
        kind: 'student-note',
        noteSource: { materialId: material.id, passageId },
        origin: 'pasted',
        topicIds: passage?.topicIds ?? material.topicIds,
        addedAt: new Date().toISOString(),
        passages: [
          {
            id: newId('p'),
            heading: `From “${passage?.heading ?? material.title}”`,
            text: `> ${quote}\n\nFrom ${material.title}.`,
            topicIds: passage?.topicIds ?? material.topicIds,
          },
        ],
      },
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    toast.success('Note saved', {
      description: 'Added to your materials as a note.',
      action: { label: 'Open', onClick: () => navigate(path(`/materials/${id}`)) },
    });
  };

  return (
    <Page className="max-w-3xl">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to={path('/materials')}>
            <ArrowLeftIcon />
            Materials
          </Link>
        </Button>
      </div>

      <PageHeader
        title={material.title}
        description={
          <span className="flex flex-wrap items-center gap-tight">
            <span>{KIND_LABEL[material.kind]}</span>
            <Separator orientation="vertical" className="h-3" />
            <span>{ORIGIN_LABEL[material.origin]}</span>
            <Separator orientation="vertical" className="h-3" />
            <span>Added {formatDate(material.addedAt)}</span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit / Link topics</Button>
            <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'update-material', materialId: material.id, patch: { archived: !material.archived } })}>{material.archived ? 'Restore' : 'Archive'}</Button>
            <Button variant="outline" size="sm" disabled={!!material.archived || material.origin === 'preview'} onClick={() => practise(material.passages[0]?.id ?? '')}>
              <DumbbellIcon />
              Practise
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete this material"
              onClick={() => setDeleting(true)}
            >
              <Trash2Icon />
            </Button>
          </>
        }
      />

      {material.archived && <Alert><AlertTitle>Archived reading</AlertTitle><AlertDescription>Historical citations remain available. Restore this reading before using it for new study.</AlertDescription></Alert>}
      {material.noteSource && <SourceLink source={material.noteSource} />}
      {!material.topicIds.length && <Alert><AlertTitle>This material has no linked topics</AlertTitle><AlertDescription><Button variant="outline" onClick={() => setEditing(true)}>Link topics for tutoring and practice</Button></AlertDescription></Alert>}
      {(material.priorPassages ?? []).filter(p => window.location.hash === `#${p.id}`).map(p => <section key={p.id} id={p.id} className="rounded border p-4"><h2 className="font-semibold">Earlier cited passage: {p.heading}</h2><p className="text-muted-foreground text-sm">This is the evidence used before the reading was edited. New study uses the current reading below.</p><Prose text={p.text} /></section>)}
      {material.attribution && (
        <p className="text-muted-foreground -mt-base text-sm italic">
          {material.attribution}
        </p>
      )}

      <div className="flex flex-wrap gap-hairline">
        {material.topicIds.map((id) => {
          const topic = topicMap.get(id);
          return topic ? (
            <Link key={id} to={path(`/progress/topic/${id}`)}>
              <Badge variant="secondary" className="font-normal">
                {topic.title}
              </Badge>
            </Link>
          ) : null;
        })}
      </div>

      {linkedSession && (
        <Alert>
          <AlertTitle>{linkedSession.title}</AlertTitle>
          <AlertDescription>
            <span className="flex flex-col gap-snug">
              <span>
                This reading is on your planner for{' '}
                {formatDueDate(linkedSession.date).toLowerCase()}. Opening it does
                not mark it done, because only you know whether you have read it.
              </span>
              <span className="flex flex-wrap gap-tight">
                <Button size="sm" onClick={completeReading}>
                  <CheckIcon />
                  Mark this reading done
                </Button>
              </span>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {material.origin === 'preview' ? (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>This file was not read</AlertTitle>
          <AlertDescription>
            {material.fileName ? (
              <>
                <span className="font-mono text-xs">{material.fileName}</span> was
                recorded as a reference only.{' '}
              </>
            ) : null}
            Rawi reads plain text and Markdown in the browser and has no PDF,
            Word or slide parser. Nothing from inside this document has been
            extracted, so the tutor and practice cannot draw on it. Open the
            original and paste the passages you want as a new material.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {material.origin === 'authored' && <FictionalNotice />}
          {material.origin === 'imported' && (
            <ImportedNotice source={material.fileName} />
          )}

          <div
            ref={containerRef}
            className="relative flex flex-col gap-section"
            onMouseUp={captureSelection}
            onKeyUp={captureSelection}
          >
            {material.passages.map((passage) => (
              <section
                key={passage.id}
                id={passage.id}
                data-passage-id={passage.id}
                className="scroll-mt-gutter flex flex-col gap-snug transition-shadow"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-tight">
                  <h2 className="font-serif text-xl tracking-tight">
                    {passage.heading}
                  </h2>
                  <div className="flex shrink-0 items-center gap-hairline">
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={!!material.archived} onClick={() => askTutor(passage.id)}
                    >
                      <MessageSquareIcon />
                      Ask the tutor
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={!!material.archived} onClick={() => practise(passage.id)}
                    >
                      <DumbbellIcon />
                      Practise
                    </Button>
                  </div>
                </div>

                <Prose text={passage.text} />

                {passage.topicIds.length > 0 && (
                  <div className="flex flex-wrap gap-hairline">
                    {passage.topicIds.map((id) => {
                      const topic = topicMap.get(id);
                      return topic ? (
                        <Badge key={id} variant="outline" className="font-normal">
                          {topic.title}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
              </section>
            ))}

            {selection && (
              <div
                className="bg-popover text-popover-foreground shadow-overlay absolute z-20 flex items-center gap-hairline rounded-lg border p-hairline"
                style={{ top: selection.top, left: selection.left }}
                role="toolbar"
                aria-label="Actions for the selected text"
              >
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => askTutor(selection.passageId, selection.text)}
                >
                  <MessageSquareIcon />
                  Ask
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => saveNote(selection.passageId, selection.text)}
                >
                  <NotebookPenIcon />
                  Save note
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => practise(selection.passageId)}
                >
                  <DumbbellIcon />
                  Practise
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <EditMaterialDialog key={material.id + String(editing)} material={material} open={editing} onOpenChange={setEditing} onSaved={next => { if (pending && next.topicIds.length) setChoosing(true); }} />
      <Dialog open={choosing} onOpenChange={setChoosing}><DialogContent><DialogHeader><DialogTitle>Choose a topic for this activity</DialogTitle><DialogDescription>Your material covers several topics. Choose the one to study now.</DialogDescription></DialogHeader>{material.topicIds.filter(id => topicMap.get(id)?.courseId === course.id).map(id => <Button key={id} variant="outline" onClick={() => {
        if (!pending) return;
        const params = new URLSearchParams({ topic: id, material: material.id, passage: pending.passageId }); if (pending.quote) params.set('quote', pending.quote);
        setPending(null);
        navigate(path(`/${pending.activity === 'tutor' ? 'tutor' : 'practice'}/new?${params}`));
      }}>{topicMap.get(id)?.title}</Button>)}</DialogContent></Dialog>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${material.title}”?`}
        description="The material and its passages are removed from this device. Questions that cite it keep their explanations but lose the link back."
        onConfirm={() => {
          dispatch({ type: 'remove-material', materialId: material.id });
          setDeleting(false);
          toast.success('Material deleted');
          navigate(path('/materials'));
        }}
      />
    </Page>
  );
}
