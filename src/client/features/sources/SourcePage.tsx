import { useParams } from 'react-router-dom';

import { useSource, useSourceChunks } from '@/api/queries.ts';
import { InlineText } from '@/components/InlineText.tsx';
import { Page, PageHeader, Section } from '@/components/layout.tsx';
import { ErrorState, LoadingState } from '@/components/states.tsx';

/**
 * Reading one source, passage by passage.
 *
 * ── Why the passages are visible as passages ──────────────────────────────
 *
 * A citation points at a chunk, so a learner who follows one lands here and
 * needs to see the *same unit* the citation named. Rendering the source as one
 * continuous wall of text would make a citation point at a place rather than a
 * thing, and "the third paragraph, roughly" is not a citation.
 *
 * Each passage is numbered in the mono face, because the number is an
 * identifier you might compare against a citation you are holding.
 */
export function SourcePage() {
  const { workspaceId = '', sourceId = '' } = useParams();
  const source = useSource(workspaceId, sourceId);
  const chunks = useSourceChunks(workspaceId, sourceId);

  if (source.isPending) {
    return (
      <Page width="prose" className="py-page">
        <LoadingState lines={8} label="Loading this source" />
      </Page>
    );
  }

  if (source.isError) {
    return (
      <Page width="prose" className="py-page">
        <ErrorState
          title="Could not load this source"
          detail={source.error.message}
          onRetry={() => void source.refetch()}
        />
      </Page>
    );
  }

  return (
    <Page width="prose" className="py-page">
      <PageHeader
        title={source.data.title}
        description={
          source.data.status === 'ready'
            ? `${source.data.chunkCount ?? 0} passage${source.data.chunkCount === 1 ? '' : 's'}, searchable.`
            : 'Still being split into passages. It is not searchable yet.'
        }
      />

      <Section>
        {chunks.isPending ? (
          <LoadingState lines={10} label="Loading the passages" />
        ) : chunks.isError ? (
          <ErrorState
            title="Could not load the passages"
            detail={chunks.error.message}
            onRetry={() => void chunks.refetch()}
          />
        ) : (
          <ol className="flex flex-col gap-gutter">
            {chunks.data.items.map((chunk) => (
              <li key={chunk.id} className="flex gap-base">
                <span
                  className="text-muted-foreground shrink-0 pt-1 font-mono text-xs tabular-nums"
                  aria-hidden
                >
                  {chunk.ordinal + 1}
                </span>
                <div className="ui-reading text-base leading-relaxed">
                  {/* Source text is untrusted input. InlineText emits elements
                      and never HTML, by construction rather than by option. */}
                  <InlineText text={chunk.text} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </Page>
  );
}
