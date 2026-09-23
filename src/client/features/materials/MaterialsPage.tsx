import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpenIcon,
  FileTextIcon,
  NotebookPenIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react';

import type { MaterialKind } from '@shared/types.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  FictionalNotice,
  KIND_LABEL,
  ORIGIN_LABEL,
  formatRelative,
} from '@/components/domain';
import { useMaterials, useTopicMap } from '@/store/selectors';
import { useCoursePath } from '@/store/course-context';
import { AddMaterialDialog } from './AddMaterialDialog';

/**
 * The library.
 *
 * A flat list with a filter rather than folders. Six materials do not need a
 * hierarchy, and inventing one would mean a student's first action in a new
 * course is to decide on a filing system rather than to read something.
 */

const KIND_ICON: Record<MaterialKind, typeof BookOpenIcon> = {
  reading: BookOpenIcon,
  'lecture-notes': FileTextIcon,
  'student-note': NotebookPenIcon,
};

export function MaterialsPage() {
  const path = useCoursePath();
  const materials = useMaterials();
  const topicMap = useTopicMap();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<MaterialKind | 'all'>('all');
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials.filter((m) => {
      if (kind !== 'all' && m.kind !== kind) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.passages.some(
          (p) =>
            p.heading.toLowerCase().includes(q) || p.text.toLowerCase().includes(q),
        )
      );
    });
  }, [materials, kind, query]);

  return (
    <Page>
      <PageHeader
        title="Materials"
        description="Readings, lecture notes and your own notes. Select a passage inside any of them to ask the tutor or practise the topic."
        actions={
          <Button onClick={() => setAdding(true)}>
            <PlusIcon />
            Add material
          </Button>
        }
      />

      <FictionalNotice />

      {materials.length === 0 ? (
        <EmptyState
          icon={<BookOpenIcon />}
          title="Nothing in your library yet"
          description="Paste a reading in, or add a plain text file. You can also skip this entirely — tutoring and practice work from topics alone."
          action={
            <div className="flex flex-wrap justify-center gap-tight">
              <Button onClick={() => setAdding(true)}>Add material</Button>
              <Button variant="outline" asChild>
                <Link to={path('/tutor')}>Start from a topic instead</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <Section>
          <div className="flex flex-wrap items-center gap-snug">
            <div className="relative min-w-52 flex-1">
              <SearchIcon
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search titles and passages"
                className="pl-8"
                aria-label="Search materials"
              />
            </div>
            <ToggleGroup
              type="single"
              value={kind}
              onValueChange={(v) => v && setKind(v as MaterialKind | 'all')}
            >
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              <ToggleGroupItem value="reading">Readings</ToggleGroupItem>
              <ToggleGroupItem value="lecture-notes">Lectures</ToggleGroupItem>
              <ToggleGroupItem value="student-note">My notes</ToggleGroupItem>
            </ToggleGroup>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<SearchIcon />}
              title="No material matches that"
              description="Try a different word, or clear the filter."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery('');
                    setKind('all');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-snug sm:grid-cols-2">
              {filtered.map((material) => {
                const Icon = KIND_ICON[material.kind];
                return (
                  <li key={material.id}>
                    <Link
                      to={path(`/materials/${material.id}`)}
                      className="hover:bg-accent/50 focus-visible:ring-ring flex h-full flex-col gap-snug rounded-lg border p-gutter outline-none transition-colors focus-visible:ring-2"
                    >
                      <div className="flex items-start gap-snug">
                        <Icon
                          className="text-muted-foreground mt-0.5 size-4 shrink-0"
                          aria-hidden
                        />
                        <div className="flex min-w-0 flex-col gap-hairline">
                          <span className="font-medium leading-snug">
                            {material.title}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {KIND_LABEL[material.kind]} ·{' '}
                            {material.passages.length}{' '}
                            {material.passages.length === 1 ? 'passage' : 'passages'} ·{' '}
                            {formatRelative(material.addedAt)}
                          </span>
                        </div>
                      </div>

                      {material.origin === 'preview' && (
                        <Badge variant="outline" className="text-warning-foreground">
                          {ORIGIN_LABEL.preview}
                        </Badge>
                      )}

                      <div className="mt-auto flex flex-wrap gap-hairline">
                        {material.topicIds.map((id) => {
                          const topic = topicMap.get(id);
                          return topic ? (
                            <Badge
                              key={id}
                              variant="secondary"
                              className="font-normal"
                            >
                              {topic.title}
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      <AddMaterialDialog open={adding} onOpenChange={setAdding} />
    </Page>
  );
}
