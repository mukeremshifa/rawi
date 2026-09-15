import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LibraryIcon, PlusIcon } from 'lucide-react';

import { EMPTY } from '@shared/messages.ts';

import { useCreateWorkspace, useWorkspaces } from '@/api/queries.ts';
import { Page, PageHeader, Section } from '@/components/layout.tsx';
import { EmptyState, ErrorState, LoadingCard } from '@/components/states.tsx';
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
 * The first screen: every workspace, and a way to make one.
 *
 * A workspace is never defaulted or inferred — you arrive here, you pick one,
 * and from that point the URL carries it. That is the client-side half of the
 * contract's rule that `workspaceId` is always named explicitly.
 */
export function WorkspaceListPage() {
  const workspaces = useWorkspaces();
  const [open, setOpen] = useState(false);

  return (
    <Page width="wide" className="py-page">
      <PageHeader
        title="Your workspaces"
        description="A workspace is one subject you are trying to understand. Sources, concepts and evidence all belong to exactly one."
        actions={
          <NewWorkspaceDialog open={open} onOpenChange={setOpen}>
            <Button>
              <PlusIcon aria-hidden />
              New workspace
            </Button>
          </NewWorkspaceDialog>
        }
      />

      <Section>
        {workspaces.isPending ? (
          <div className="grid gap-base sm:grid-cols-2 lg:grid-cols-3">
            <LoadingCard />
            <LoadingCard />
            <LoadingCard />
          </div>
        ) : workspaces.isError ? (
          <ErrorState
            title="Could not load your workspaces"
            detail={workspaces.error.message}
            onRetry={() => void workspaces.refetch()}
          />
        ) : workspaces.data.items.length === 0 ? (
          <EmptyState
            icon={<LibraryIcon />}
            title={EMPTY.workspaces.title}
            description={EMPTY.workspaces.description}
            action={
              <NewWorkspaceDialog open={open} onOpenChange={setOpen}>
                <Button>Create your first workspace</Button>
              </NewWorkspaceDialog>
            }
          />
        ) : (
          <ul className="grid gap-base sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.data.items.map((workspace) => (
              <li key={workspace.id}>
                <Link
                  to={`/w/${workspace.id}`}
                  className="border-border hover:border-border-strong focus-visible:ring-ring flex h-full flex-col gap-snug rounded-xl border p-gutter transition-colors outline-none focus-visible:ring-2"
                >
                  <span className="font-serif text-xl leading-tight">{workspace.name}</span>
                  {workspace.intent && (
                    <span className="text-muted-foreground line-clamp-2 text-sm leading-relaxed">
                      {workspace.intent}
                    </span>
                  )}
                  {/* Counts, in the mono face, because they are values you might
                      compare between cards. Never a proportion of anything. */}
                  <span className="text-muted-foreground mt-auto font-mono text-xs tabular-nums">
                    {workspace.sourceCount} source{workspace.sourceCount === 1 ? '' : 's'}
                    {' · '}
                    {workspace.conceptCount} concept
                    {workspace.conceptCount === 1 ? '' : 's'}
                    {workspace.dueCount > 0 && ` · ${workspace.dueCount} due`}
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

function NewWorkspaceDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const create = useCreateWorkspace();
  const [name, setName] = useState('');
  const [intent, setIntent] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate(
      { name, intent: intent.trim() ? intent : null },
      {
        onSuccess: () => {
          setName('');
          setIntent('');
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>
            Name the subject. You can add sources straight after.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-base">
          <div className="flex flex-col gap-tight">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Intro microeconomics"
              required
              maxLength={120}
            />
          </div>

          <div className="flex flex-col gap-tight">
            <Label htmlFor="workspace-intent">
              What are you trying to understand?{' '}
              <span className="text-muted-foreground font-normal">Optional</span>
            </Label>
            <Textarea
              id="workspace-intent"
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              placeholder="I keep getting elasticity questions wrong in problem sets."
              maxLength={500}
              rows={3}
            />
          </div>

          {create.isError && (
            <ErrorState title="Could not create it" detail={create.error.message} />
          )}

          <DialogFooter>
            <Button type="submit" disabled={create.isPending || name.trim().length === 0}>
              {create.isPending ? 'Creating…' : 'Create workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
