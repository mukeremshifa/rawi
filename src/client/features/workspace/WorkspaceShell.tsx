import { NavLink, Outlet, useParams } from 'react-router-dom';
import {
  BookOpenIcon,
  CompassIcon,
  FileTextIcon,
  ListChecksIcon,
  MessageCircleQuestionIcon,
} from 'lucide-react';

import { useWorkspace } from '@/api/queries.ts';
import { Logo } from '@/components/Logo.tsx';
import { ErrorState, LoadingState } from '@/components/states.tsx';
import { ThemeToggle } from '@/components/ThemeToggle.tsx';
import { cn } from '@/lib/utils.ts';
import { useAuth } from '@/features/auth/AuthProvider.tsx';

/**
 * The frame every workspace screen sits in.
 *
 * ── These are routes, not tabs ────────────────────────────────────────────
 *
 * Switching between Plan, Concepts, Sources, Ask and Evidence changes *what*
 * you are looking at, so each one is a URL. The standing rule: if switching
 * changes what you see, it is a route. Tabs are for two views of the same
 * subject, and these are five different subjects.
 *
 * That is also what makes a deep link work — a learner can bookmark a concept,
 * and the back button means what they expect.
 */
export function WorkspaceShell() {
  const { workspaceId = '' } = useParams();
  const workspace = useWorkspace(workspaceId);
  const { user, signOut } = useAuth();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-base px-gutter py-snug">
          <NavLink to="/" className="shrink-0">
            <Logo />
          </NavLink>

          <span className="text-muted-foreground shrink-0" aria-hidden>
            /
          </span>

          <span className="min-w-0 truncate text-sm font-medium">
            {workspace.data?.name ?? '…'}
          </span>

          <div className="ml-auto flex items-center gap-tight">
            <ThemeToggle />
            {user && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md px-tight py-hairline text-xs outline-none focus-visible:ring-2"
              >
                Sign out
              </button>
            )}
          </div>
        </div>

        <nav
          aria-label="Workspace"
          className="mx-auto flex w-full max-w-6xl gap-base overflow-x-auto px-gutter"
        >
          <ShellLink to={`/w/${workspaceId}`} end icon={<CompassIcon />} label="Plan" />
          <ShellLink
            to={`/w/${workspaceId}/concepts`}
            icon={<ListChecksIcon />}
            label="Concepts"
          />
          <ShellLink
            to={`/w/${workspaceId}/sources`}
            icon={<FileTextIcon />}
            label="Sources"
          />
          <ShellLink
            to={`/w/${workspaceId}/ask`}
            icon={<MessageCircleQuestionIcon />}
            label="Ask"
          />
          <ShellLink
            to={`/w/${workspaceId}/evidence`}
            icon={<BookOpenIcon />}
            label="Evidence"
          />
        </nav>
      </header>

      <main className="flex-1">
        {workspace.isPending ? (
          <div className="mx-auto w-full max-w-6xl px-gutter py-page">
            <LoadingState lines={5} label="Loading this workspace" />
          </div>
        ) : workspace.isError ? (
          <div className="mx-auto w-full max-w-6xl px-gutter py-page">
            <ErrorState
              title="Could not open this workspace"
              detail={workspace.error.message}
              onRetry={() => void workspace.refetch()}
            />
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}

function ShellLink({
  to,
  end,
  icon,
  label,
}: {
  to: string;
  end?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex shrink-0 items-center gap-tight border-b-2 px-hairline py-snug text-sm transition-colors outline-none',
          'focus-visible:ring-ring focus-visible:ring-2',
          // The accent as a mark, which is the only job it has here. The rest
          // of the strip is ink and paper.
          isActive
            ? 'border-primary text-foreground font-medium'
            : 'text-muted-foreground hover:text-foreground border-transparent',
          '[&>svg]:size-4',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
