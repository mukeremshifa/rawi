import { NavLink, useLocation } from 'react-router-dom';
import type { LayoutDashboardIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboardIcon;
  /** Matches nested routes, so /materials/x keeps Materials highlighted. */
  match: string;
  end?: boolean;
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.end) return pathname === item.match;
  return pathname === item.match || pathname.startsWith(`${item.match}/`);
}

export function NavGroup({
  items,
  onNavigate,
  badges,
}: {
  items: NavItem[];
  onNavigate?: () => void;
  badges?: Record<string, number>;
}) {
  const { pathname } = useLocation();

  return (
    <div className="flex flex-col gap-hairline">
      {items.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        const badge = badges?.[item.to];
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-snug rounded-md px-snug py-2 text-sm transition-colors',
              'focus-visible:ring-ring outline-none focus-visible:ring-2',
              active
                ? 'bg-secondary text-secondary-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate">{item.label}</span>
            {badge !== undefined && badge > 0 && (
              <Badge variant="neutral" className="font-mono tabular-nums">
                {badge}
              </Badge>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}

