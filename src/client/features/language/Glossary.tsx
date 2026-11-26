import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FIRST_LANGUAGES, type GlossaryEntry, type GlossaryView } from '@shared/contracts/language';

import { Page, PageHeader } from '@/components/layout';
import { EmptyState, ErrorState, PageLoading } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAccount } from '@/lib/account';
import { useApi, useSave } from '@/lib/data';

/** The student's first language, or null when they study in English only. */
export function useFirstLanguage() {
  const language = useAccount().preferences.values.firstLanguage;
  return language && language !== 'none' ? language : null;
}

/** One term: the material's definition in English, and the gloss in the student's first language. */
export function GlossaryTerm({ entry, language }: { entry: GlossaryEntry; language: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-medium">{entry.term}</span>
        {entry.gloss && (
          <span lang={language} dir="rtl" className="text-md">
            {entry.gloss}
          </span>
        )}
      </div>
      <p className="text-sm">{entry.definition}</p>
      {entry.explanation && (
        <p lang={language} dir="rtl" className="bg-surface rounded-md px-3 py-2 text-base leading-relaxed">
          {entry.explanation}
        </p>
      )}
      <Link
        className="text-muted-foreground self-start text-sm hover:underline"
        to={`/materials/${entry.source.materialId}/versions/${entry.source.versionId}${entry.source.blockIds[0] ? `#block-${entry.source.blockIds[0]}` : ''}`}
      >
        {entry.material}, {entry.heading}
      </Link>
    </div>
  );
}

/** The course glossary: every term the materials define, with a gloss in the student's first language. */
export function Glossary() {
  const { id } = useParams<{ id: string }>();
  const language = useFirstLanguage();
  const view = useApi<GlossaryView>(language ? `/v1/courses/${id}/glossary?language=${language}` : null);
  const save = useSave();
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const all = view.data?.entries ?? [];
    return q ? all.filter(e => e.term.toLowerCase().includes(q) || (e.gloss ?? '').includes(filter.trim())) : all;
  }, [view.data, filter]);
  if (!language)
    return (
      <Page width="narrow">
        <PageHeader title="Glossary" />
        <EmptyState
          title="Choose your first language"
          description="Set it in Settings, under Study defaults. Rawi then glosses each term your materials define."
          action={
            <Button asChild variant="secondary">
              <Link to="/settings/study">Open Settings</Link>
            </Button>
          }
        />
      </Page>
    );
  if (view.isPending) return <PageLoading label="Loading the glossary" />;
  if (view.error) return <ErrorState error={view.error} onRetry={() => void view.refetch()} />;
  const name = FIRST_LANGUAGES[language];
  const build = () =>
    save.run<{ written: number; remaining: number; view: GlossaryView }>(
      { path: `/v1/courses/${id}/glossary`, body: { operationId: crypto.randomUUID(), language } },
      { id: `glossary-${id}-${Date.now()}`, onSuccess: r => view.setData(r.view) },
    );
  return (
    <Page width="narrow">
      <PageHeader
        title="Glossary"
        description={`Terms your materials define, with the material's own definition and a gloss in ${name}. Checks stay in English. Opening a gloss during a question records it as language support.`}
        actions={
          view.data.missing > 0 && (
            <Button onClick={build} disabled={save.busy}>
              {save.busy ? 'Writing glosses' : `Write ${name} glosses (${view.data.missing})`}
            </Button>
          )
        }
      />
      {save.error && <p className="text-danger-text text-sm">{save.error}</p>}
      {!view.data.entries.length ? (
        <EmptyState title="No terms yet" description="Terms appear once Rawi has read a material that defines them." />
      ) : (
        <>
          <Input
            aria-label="Find a term"
            placeholder="Find a term"
            value={filter}
            maxLength={100}
            onChange={e => setFilter(e.target.value)}
          />
          <ul className="divide-y border-y">
            {shown.map(e => (
              <li key={e.factId} className="py-3">
                <GlossaryTerm entry={e} language={language} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  );
}
