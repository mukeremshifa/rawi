import { useRef } from 'react';
import { useParams } from 'react-router-dom';
import type { AiOperationView } from '../../../server/api-types';

import { Page, PageHeader } from '@/components/layout';
import { ErrorState, Notice, PageLoading } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { useApi, useSave } from '@/lib/data';

type Operation = AiOperationView;

const TASK_LABEL: Record<string, string> = { tutor: 'Tutor reply', generate: 'Question generation', grade: 'Written feedback', feedback: 'Written feedback' };
const STATE_LABEL: Record<string, string> = {
  blocked: 'Not sent', queued: 'Waiting', running: 'Working', complete: 'Finished', cancelled: 'Stopped', failed: 'Failed', interrupted: 'Interrupted',
};

/**
 * A saved AI request and its status. Reloading reads the saved record and
 * never sends another request to a provider.
 */
export function AiOperation() {
  const { id = '' } = useParams();
  const data = useApi<Operation>(`/v1/ai/operations/${id}`);
  const stop = useSave();
  const stopId = useRef(crypto.randomUUID());
  if (data.isPending) return <Page width="narrow"><PageLoading label="Loading request" /></Page>;
  if (data.error) return <Page width="narrow"><ErrorState error={data.error} onRetry={() => void data.refetch()} /></Page>;
  const op = data.data;
  return (
    <Page width="narrow">
      <PageHeader title={TASK_LABEL[op.task] ?? 'AI request'} description="Saved with the materials it would use." actions={<Badge>{STATE_LABEL[op.state] ?? op.state}</Badge>} />
      {op.reason && <Notice>{op.reason}</Notice>}
      {op.calls.filter(e => e.partial).map(e => (
        <div key={e.id} className="rawi-prose rounded-md border p-4 whitespace-pre-wrap">{e.partial}</div>
      ))}
      <div className="flex flex-wrap gap-tight">
        {['queued', 'failed'].includes(op.state) && (
          <Button variant="secondary" loading={stop.busy} onClick={() => stop.run<Operation>({ path: `/v1/ai/operations/${id}/cancel`, body: { operationId: stopId.current } }, { id: 'stop', onSuccess: data.setData })}>Stop this request</Button>
        )}
        <Button variant="ghost" loading={data.isFetching} onClick={() => void data.refetch()}>Refresh status</Button>
      </div>
      {stop.error && <FieldError>{stop.error}</FieldError>}
    </Page>
  );
}

/** After a request that may have been charged without a result, the next press is a new request. */
export const UNCERTAIN = ['ai_uncertain', 'operation_uncertain'];

/** Ask for feedback on every written answer in an attempt at once. The attempt reloads with it. */
export function RequestFeedback({ attemptId, count, onDone }: { attemptId: string; count: number; onDone: () => void }) {
  const save = useSave();
  const id = useRef(crypto.randomUUID());
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="secondary" size="sm" loading={save.busy} onClick={() => { if (UNCERTAIN.includes(save.code)) { save.discard(); id.current = crypto.randomUUID(); } save.run<{ graded: number }>({ path: `/v1/attempts/${attemptId}/feedback`, body: { operationId: id.current } }, { id: 'feedback', onSuccess: () => { id.current = crypto.randomUUID(); onDone(); } }); }}>
        {save.busy ? 'Marking your answers' : count === 1 ? 'Get feedback on your written answer' : `Get feedback on ${count} written answers`}
      </Button>
      {save.error && <FieldError>{save.error}</FieldError>}
    </div>
  );
}
