import type { ReactNode } from 'react';
import type { TutorTurn, SourceRef } from '@shared/domain/types';
import { Prose } from '@/components/Prose';
import { SourceLink } from '@/components/domain';
import { cn } from '@/lib/utils';
import { renderCitations } from '@/features/tutor/citations';

const GROUNDING_LABEL: Record<NonNullable<TutorTurn['grounding']>, string> = {
  materials: 'From your materials',
  mixed: 'Partly beyond your materials',
  general: 'General explanation, not from your materials',
  insufficient: 'Your materials do not cover this',
};

/** One turn in the transcript, with its provenance where it has one. */
export function MessageBubble({ message, renderSource = source => <SourceLink source={source} /> }: { message: TutorTurn; renderSource?: (source: SourceRef) => ReactNode }) {
  const ids = (message.citations ?? []).map((c) => c.passageId);
  /* Earlier builds' authored replies carry neither a model nor a status. */
  const legacy =
    message.role === 'tutor' && !message.meta && !message.model && !message.status;
  return (
    <div id={message.id} className={cn('flex flex-col gap-tight', message.role === 'student' && 'items-end')}>
      <div
        className={cn(
          'max-w-[90%] rounded-xl px-gutter py-snug',
          message.role === 'student'
            ? 'bg-primary text-primary-foreground'
            : message.meta
              ? 'bg-muted/60 text-muted-foreground border border-dashed'
              : message.status === 'interrupted'
                ? 'bg-card border border-dashed'
                : 'bg-card border',
        )}
      >
        <Prose
          text={message.role === 'tutor' ? renderCitations(message.text, ids) : message.text}
          size={message.role === 'student' ? 'compact' : 'reading'}
        />
      </div>
      {message.role === 'tutor' && !message.meta && (
        <div className="flex flex-col gap-hairline px-tight">
          {message.status === 'interrupted' && (
            <span className="text-foreground text-xs font-medium">
              This reply was cut off before it finished, so it is incomplete.
            </span>
          )}
          {legacy && (
            <span className="text-muted-foreground text-xs">
              Scripted reply from an earlier version of Rawi.
            </span>
          )}
          {message.grounding && (
            <span className="text-muted-foreground text-xs">
              {GROUNDING_LABEL[message.grounding]}
            </span>
          )}
          {(message.citations ?? []).map((source, i) => (
            <span key={source.passageId} className="flex items-center gap-tight text-xs">
              <span className="text-muted-foreground font-mono tabular-nums">[{i + 1}]</span>
              {renderSource(source)}
            </span>
          ))}
          {message.droppedCitations ? (
            <span className="text-muted-foreground text-xs">
              {message.droppedCitations === 1
                ? 'One citation was removed because it did not match your materials.'
                : `${message.droppedCitations} citations were removed because they did not match your materials.`}
            </span>
          ) : null}
        </div>
      )}
      {message.source && renderSource(message.source)}
    </div>
  );
}

