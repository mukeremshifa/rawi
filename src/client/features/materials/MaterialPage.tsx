import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  DumbbellIcon,
  MessageSquareIcon,
  NotebookPenIcon,
  Trash2Icon,
} from 'lucide-react';
import { toast } from 'sonner';

import { Page, PageHeader } from '@/components/layout';
import { Prose } from '@/components/Prose';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Separator } from '@/components/ui/separator';
import {
  FictionalNotice,
  KIND_LABEL,
  ORIGIN_LABEL,
  formatDate,
} from '@/components/domain';
import { useMaterial, useTopicMap } from '@/store/selectors';
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
  const material = useMaterial(materialId);
  const topicMap = useTopicMap();
  const { dispatch } = useStore();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  if (!material) return <NotFoundPage />;

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
    const topicId = passage?.topicIds[0] ?? material.topicIds[0];
    if (!topicId) {
      toast.error('No topic linked', {
        description:
          'Link this material to a topic first — the tutor’s authored branches are organised by topic.',
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
    const topicId = passage?.topicIds[0] ?? material.topicIds[0];
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
            <Button variant="outline" size="sm" onClick={() => practise(material.passages[0]?.id ?? '')}>
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
                      onClick={() => askTutor(passage.id)}
                    >
                      <MessageSquareIcon />
                      Ask the tutor
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => practise(passage.id)}
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

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${material.title}”?`}
        description="The material and its passages are removed from this device. Questions that cite it keep their explanations but lose the link back."
        onConfirm={() => {
          dispatch({ type: 'remove-material', materialId: material.id });
          setDeleting(false);
          toast.success('Material deleted');
          navigate('/materials');
        }}
      />
    </Page>
  );
}
