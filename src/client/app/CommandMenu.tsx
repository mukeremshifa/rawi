import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BellIcon, BookOpenIcon, CalendarDaysIcon, ClipboardListIcon, FileTextIcon, GraduationCapIcon, HomeIcon, LayersIcon,
  LayoutDashboardIcon, ListTreeIcon, MessageSquareIcon, PlusIcon, SearchIcon, SettingsIcon, TrendingUpIcon,
} from 'lucide-react';
import type { Course } from '@shared/contracts/workspace';
import type { SearchResults } from '../../server/api-types';

import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useApi } from '@/lib/data';

const CATEGORY_ICON: Record<string, typeof HomeIcon> = {
  Course: LayersIcon, Material: BookOpenIcon, 'Practice set': ClipboardListIcon, 'Tutor session': MessageSquareIcon, Attempt: FileTextIcon, Topic: ListTreeIcon,
};

/** Debounce a fast-changing value, for search as you type. */
function useDebounced<T>(value: T, ms: number) {
  const [current, setCurrent] = useState(value);
  useEffect(() => { const t = setTimeout(() => setCurrent(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return current;
}

/**
 * The command menu: jump to any page, course, material, set or session, and
 * run common actions. Opens with Ctrl K or the header search.
 */
export function CommandMenu({ open, onOpenChange, courses, courseId }: { open: boolean; onOpenChange: (open: boolean) => void; courses: Course[] | undefined; courseId: string | null }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const term = useDebounced(query.trim(), 200);
  const results = useApi<SearchResults>(open && term.length >= 2 ? `/v1/search?q=${encodeURIComponent(term)}` : null);
  useEffect(() => { if (!open) setQuery(''); }, [open]);
  const go = (to: string) => { onOpenChange(false); navigate(to); };
  const course = courses?.find(c => c.id === courseId);
  const remote = term.length >= 2 ? results.data?.results.filter(r => r.category !== 'Course') ?? [] : [];
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} label="Search and commands">
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search courses, materials, sets and pages" />
      <CommandList>
        <CommandEmpty>{results.isFetching ? 'Searching' : 'No matches.'}</CommandEmpty>
        {course && (
          <CommandGroup heading={course.name}>
            <CommandItem onSelect={() => go(`/course/${course.id}`)}><LayoutDashboardIcon />Overview</CommandItem>
            <CommandItem onSelect={() => go(`/course/${course.id}/settings`)}><SettingsIcon />Course settings</CommandItem>
            <CommandItem onSelect={() => go(`/course/${course.id}/materials`)}><BookOpenIcon />Materials</CommandItem>
            <CommandItem onSelect={() => go(`/course/${course.id}/practice`)}><ClipboardListIcon />Practice</CommandItem>
            <CommandItem onSelect={() => go(`/course/${course.id}/exams`)}><GraduationCapIcon />Exams</CommandItem>
            <CommandItem onSelect={() => go(`/course/${course.id}/tutor`)}><MessageSquareIcon />Tutor</CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => go('/')}><HomeIcon />Home</CommandItem>
          <CommandItem onSelect={() => go('/courses')}><LayersIcon />Courses</CommandItem>
          <CommandItem onSelect={() => go('/planner')}><CalendarDaysIcon />Planner</CommandItem>
          <CommandItem onSelect={() => go('/progress')}><TrendingUpIcon />Progress</CommandItem>
          <CommandItem onSelect={() => go('/notifications')}><BellIcon />Reminders</CommandItem>
          <CommandItem onSelect={() => go('/settings')}><SettingsIcon />Settings</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go('/courses?new=1')}><PlusIcon />New course</CommandItem>
          {course && <CommandItem onSelect={() => go(`/course/${course.id}/materials?add=1`)}><PlusIcon />Add material to {course.name}</CommandItem>}
          <CommandItem onSelect={() => go('/planner?availability=1')}><CalendarDaysIcon />Edit availability</CommandItem>
          {query.trim().length >= 2 && <CommandItem value={`search everything ${query}`} onSelect={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}><SearchIcon />Search everything for "{query.trim()}"</CommandItem>}
        </CommandGroup>
        {!!courses?.length && (
          <CommandGroup heading="Courses">
            {courses.filter(c => !c.archived).map(c => <CommandItem key={c.id} value={`course ${c.name}`} onSelect={() => go(`/course/${c.id}`)}><LayersIcon />{c.name}</CommandItem>)}
          </CommandGroup>
        )}
        {remote.length > 0 && (
          <CommandGroup heading="In your workspace">
            {remote.map(r => {
              const Icon = CATEGORY_ICON[r.category] ?? FileTextIcon;
              return <CommandItem key={r.to + r.title} value={`${r.category} ${r.title} ${term}`} onSelect={() => go(r.to)}><Icon /><span className="min-w-0 flex-1 truncate">{r.title}</span><span className="text-muted-foreground text-sm">{r.category}</span></CommandItem>;
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
