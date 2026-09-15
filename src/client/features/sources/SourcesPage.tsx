import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileTextIcon, PlusIcon } from 'lucide-react';

import { EMPTY } from '@shared/messages.ts';

import { useAddSource, useJob, useSources } from '@/api/queries.ts';
import { Page, PageHeader, Section } from '@/components/layout.tsx';
import {
  EmptyState,
  ErrorState,
  GeneratingState,
  LoadingCard,
} from '@/components/states.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';

/**
 * The sources a workspace is grounded in.
 *
 * ── Adding one is visibly a job ───────────────────────────────────────────
 *
 * `addSource` returns a job, and this screen polls it with `GeneratingState`
 * until it settles. That is not ceremony: chunking is stepped on the free plan,
 * so a source genuinely is not searchable the moment it is added, and showing
 * it as ready would make the first Ask against it look broken.
 *
 * The bar breathes while `unitsTotal` is null and fills once it is known,
 * because "we have not counted yet" and "0% done" are different promises.
 */
export function SourcesPage() {
  const { workspaceId = '' } = useParams();
  const sources = useSources(workspaceId);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(workspaceId, jobId);
  const [open, setOpen] = useState(false);

  return (
    <Page width="wide" className="py-page">
      <PageHeader
        title="Sources"
        description="Everything Rawi teaches comes from these, and it cites them. Paste text, or upload a .txt or .md file."
        actions={
          <AddSourceDialog
            workspaceId={workspaceId}
            open={open}
            onOpenChange={setOpen}
            onStarted={setJobId}
          >
            <Button>
              <PlusIcon aria-hidden />
              Add a source
            </Button>
          </AddSourceDialog>
        }
      />

      {jobId && job.data && job.data.status !== 'succeeded' && (
        <GeneratingState
          stage={job.data.stage}
          value={
            job.data.unitsTotal ? (job.data.unitsDone / job.data.unitsTotal) * 100 : null
          }
          detail={
            job.data.status === 'failed'
              ? (job.data.error?.message ?? 'The job failed.')
              : 'Splitting it into passages so answers can cite it.'
          }
        />
      )}

      <Section>
        {sources.isPending ? (
          <div className="grid gap-base sm:grid-cols-2">
            <LoadingCard />
            <LoadingCard />
          </div>
        ) : sources.isError ? (
          <ErrorState
            title="Could not load your sources"
            detail={sources.error.message}
            onRetry={() => void sources.refetch()}
          />
        ) : sources.data.items.length === 0 ? (
          <EmptyState
            icon={<FileTextIcon />}
            title={EMPTY.sources.title}
            description={EMPTY.sources.description}
            action={
              <AddSourceDialog
                workspaceId={workspaceId}
                open={open}
                onOpenChange={setOpen}
                onStarted={setJobId}
              >
                <Button>Add your first source</Button>
              </AddSourceDialog>
            }
          />
        ) : (
          <ul className="grid gap-base sm:grid-cols-2">
            {sources.data.items.map((source) => (
              <li key={source.id}>
                <Link
                  to={`/w/${workspaceId}/sources/${source.id}`}
                  className="border-border hover:border-border-strong focus-visible:ring-ring flex h-full flex-col gap-snug rounded-xl border p-gutter transition-colors outline-none focus-visible:ring-2"
                >
                  <span className="font-serif text-lg leading-tight">{source.title}</span>
                  <span className="text-muted-foreground mt-auto font-mono text-xs tabular-nums">
                    {source.characterCount.toLocaleString('en')} characters
                    {' · '}
                    {/* null, not 0 — the count is genuinely unknown until the
                        ingestion job finishes, and saying "0 passages" would be
                        a number that is simply wrong. */}
                    {source.chunkCount === null
                      ? 'counting passages…'
                      : `${source.chunkCount} passage${source.chunkCount === 1 ? '' : 's'}`}
                    {source.status !== 'ready' && ` · ${source.status}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}

function AddSourceDialog({
  workspaceId,
  open,
  onOpenChange,
  onStarted,
  children,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: (jobId: string) => void;
  children: React.ReactNode;
}) {
  const add = useAddSource(workspaceId);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  async function onFile(file: File) {
    // v1 reads .txt and .md as plain text. No PDF and no OCR — both are an
    // ingestion dependency and a failure surface for material a learner can
    // paste. The file is read here and sent as text, so the upload path and
    // the paste path converge immediately.
    setTitle((current) => current || file.name.replace(/\.(txt|md)$/i, ''));
    setText(await file.text());
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    add.mutate(
      { title, kind: 'pasted', text },
      {
        onSuccess: (job) => {
          onStarted(job.id);
          setTitle('');
          setText('');
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a source</DialogTitle>
          <DialogDescription>
            Lecture notes, a chapter, a problem set. Everything the tutor says will be
            grounded in this and will cite it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-base">
          <div className="flex flex-col gap-tight">
            <Label htmlFor="source-title">Title</Label>
            <Input
              id="source-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Lecture 4 — elasticity"
              required
              maxLength={160}
            />
          </div>

          <div className="flex flex-col gap-tight">
            <Label htmlFor="source-file">
              Upload <span className="text-muted-foreground font-normal">.txt or .md</span>
            </Label>
            <Input
              id="source-file"
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
          </div>

          <div className="flex flex-col gap-tight">
            <Label htmlFor="source-text">Or paste the text</Label>
            <Textarea
              id="source-text"
              rows={10}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste your notes here."
            />
          </div>

          {add.isError && <ErrorState title="Could not add it" detail={add.error.message} />}

          <DialogFooter>
            <Button
              type="submit"
              disabled={add.isPending || !title.trim() || !text.trim()}
            >
              {add.isPending ? 'Adding…' : 'Add source'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
