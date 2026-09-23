import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangleIcon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';

import type { Material, MaterialKind, MaterialOrigin, Passage } from '@shared/types.ts';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import { useTopics } from '@/store/selectors';
import { newId } from '@/lib/id';

/**
 * Adding a material: paste, or add a local file.
 *
 * ── The honesty problem this screen exists to solve ───────────────────────
 *
 * A student will try to add a PDF. The prototype cannot parse one, and the
 * tempting responses are both bad: silently reject the file, or accept it and
 * show a plausible-looking "extracted text" that was never extracted from
 * anything. The brief rules the second out explicitly.
 *
 * So the file input accepts everything, reads `.txt` and `.md` for real through
 * the File API, and for anything else creates a material that *says on its own
 * detail page* that the file was not read and the text shown is a placeholder.
 * The student keeps the filename and a record that the document exists; nobody
 * is told a PDF was parsed.
 *
 * ── Splitting text into passages ──────────────────────────────────────────
 *
 * Blank-line separated blocks, with a markdown-style heading adopted as the
 * passage heading when one is present. This is crude and it is enough: the
 * point of passages is to give "ask about this bit" something to address, and
 * paragraph boundaries are a reasonable guess at where a bit ends.
 */

const TEXT_EXTENSIONS = /\.(txt|md|markdown|text)$/i;
const MAX_FILE_BYTES = 512 * 1024;

/** Splits pasted or read text into addressable passages. */
export function splitIntoPassages(text: string, topicIds: string[]): Passage[] {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 0) return [];

  const passages: Passage[] = [];
  let pending: string | null = null;
  let index = 0;

  for (const block of blocks) {
    const headingMatch = /^#{1,4}\s+(.+)$/.exec(block);
    if (headingMatch && block.split('\n').length === 1) {
      // A lone heading line attaches to the block after it rather than
      // becoming an empty passage of its own.
      pending = headingMatch[1]!.trim();
      continue;
    }

    index += 1;
    const lines = block.split('\n');
    const inlineHeading = /^#{1,4}\s+(.+)$/.exec(lines[0] ?? '');

    passages.push({
      id: newId('p'),
      heading:
        pending ??
        (inlineHeading ? inlineHeading[1]!.trim() : `Passage ${index}`),
      text: inlineHeading ? lines.slice(1).join('\n').trim() : block,
      topicIds,
    });
    pending = null;
  }

  return passages.filter((p) => p.text.length > 0);
}

const PREVIEW_TEXT = `This file was not read.

Rawi's prototype reads plain text and Markdown in the browser. It has no PDF, Word or slide parser, and it will not pretend to have one — so nothing from inside this document has been extracted, indexed or shown to the tutor.

The file is recorded here so you can see it in your library and attach it to topics. To work with its contents, open the original and paste the passages you want into a new material.`;

export function AddMaterialDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { dispatch } = useStore();
  const course = useCourse();
  const path = useCoursePath();
  const topics = useTopics();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<MaterialKind>('reading');
  const [text, setText] = useState('');
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [origin, setOrigin] = useState<MaterialOrigin>('pasted');
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setKind('reading');
    setText('');
    setTopicIds([]);
    setFileName(null);
    setOrigin('pasted');
    setFileError(null);
    setReading(false);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    setFileName(file.name);
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ''));

    if (!TEXT_EXTENSIONS.test(file.name) && !file.type.startsWith('text/')) {
      setOrigin('preview');
      setText(PREVIEW_TEXT);
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setFileError(
        `That file is ${Math.round(file.size / 1024)} KB. This prototype keeps everything in browser storage, so it reads text files up to 512 KB.`,
      );
      setFileName(null);
      return;
    }

    setReading(true);
    try {
      const content = await file.text();
      setText(content);
      setOrigin('text-file');
    } catch {
      setFileError('The file could not be read. It may have been moved or locked.');
      setFileName(null);
    } finally {
      setReading(false);
    }
  };

  const canSave = title.trim().length > 0 && text.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    const id = newId('mat');
    const material: Material = {
      id,
      courseId: course.id,
      title: title.trim(),
      kind,
      origin,
      topicIds,
      passages:
        origin === 'preview'
          ? [
              {
                id: newId('p'),
                heading: 'File not read',
                text: PREVIEW_TEXT,
                topicIds,
              },
            ]
          : splitIntoPassages(text, topicIds),
      addedAt: new Date().toISOString(),
      ...(fileName ? { fileName } : {}),
    };

    dispatch({ type: 'add-material', material });
    toast.success('Material added', {
      description:
        origin === 'preview'
          ? 'Recorded as a file reference — its contents were not read.'
          : `${material.passages.length} passages.`,
    });
    reset();
    onOpenChange(false);
    navigate(path(`/materials/${id}`));
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add material</DialogTitle>
          <DialogDescription>
            Paste text, or add a plain text file from your device. Everything
            stays in this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-base">
          <div className="grid gap-base sm:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-tight">
              <Label htmlFor="mat-title">Title</Label>
              <Input
                id="mat-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Week 3 reading — the plantation complex"
              />
            </div>
            <div className="flex flex-col gap-tight">
              <Label htmlFor="mat-kind">Type</Label>
              <Select
                id="mat-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as MaterialKind)}
              >
                <option value="reading">Reading</option>
                <option value="lecture-notes">Lecture notes</option>
                <option value="student-note">My note</option>
              </Select>
            </div>
          </div>

          <Tabs
            value={origin === 'pasted' ? 'paste' : 'file'}
            onValueChange={(v) => {
              if (v === 'paste') {
                setOrigin('pasted');
                setFileName(null);
                setFileError(null);
                if (text === PREVIEW_TEXT) setText('');
              }
            }}
          >
            <TabsList>
              <TabsTrigger value="paste">Paste text</TabsTrigger>
              <TabsTrigger value="file">Add a file</TabsTrigger>
            </TabsList>

            <TabsContent value="paste" className="pt-base">
              <div className="flex flex-col gap-tight">
                <Label htmlFor="mat-text">Content</Label>
                <Textarea
                  id="mat-text"
                  rows={10}
                  value={origin === 'preview' ? '' : text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setOrigin('pasted');
                  }}
                  placeholder="Paste the reading here. Blank lines become separate passages, so you can ask the tutor about one part at a time."
                  className="font-mono text-xs"
                />
                <p className="text-muted-foreground text-xs">
                  {text.trim()
                    ? `${splitIntoPassages(text, topicIds).length} passages`
                    : 'Blank lines separate passages. A line starting with # becomes that passage’s heading.'}
                </p>
              </div>
            </TabsContent>

            <TabsContent value="file" className="pt-base">
              <div className="flex flex-col gap-snug">
                <input
                  ref={fileInput}
                  type="file"
                  className="sr-only"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInput.current?.click()}
                  disabled={reading}
                  className="self-start"
                >
                  <UploadIcon />
                  {reading ? 'Reading…' : 'Choose a file'}
                </Button>

                {fileName && (
                  <p className="text-muted-foreground font-mono text-xs">{fileName}</p>
                )}

                {fileError && (
                  <Alert variant="destructive">
                    <AlertDescription>{fileError}</AlertDescription>
                  </Alert>
                )}

                {origin === 'preview' && (
                  <Alert>
                    <AlertTriangleIcon />
                    <AlertTitle>This file was not read</AlertTitle>
                    <AlertDescription>
                      Rawi reads plain text and Markdown in the browser and has no
                      PDF, Word or slide parser. Adding this records the filename
                      and lets you attach it to topics, but nothing from inside
                      the document is available to the tutor or to practice. To
                      use its contents, paste the passages you want instead.
                    </AlertDescription>
                  </Alert>
                )}

                {origin === 'text-file' && text && (
                  <div className="flex flex-col gap-tight">
                    <Label htmlFor="mat-file-text">Content read from the file</Label>
                    <Textarea
                      id="mat-file-text"
                      rows={8}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <p className="text-muted-foreground text-xs">
                      {splitIntoPassages(text, topicIds).length} passages. Edit
                      before saving if you want to.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <fieldset className="flex flex-col gap-tight">
            <legend className="mb-tight text-sm font-medium">
              Topics this covers
            </legend>
            <p className="text-muted-foreground mb-tight text-xs">
              Optional. Linking topics is what lets a passage offer “practise
              this” and lets question reviews point back here.
            </p>
            <div className="flex flex-wrap gap-snug">
              {topics.map((topic) => (
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
                  {topic.title}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!canSave}>
            Add material
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
