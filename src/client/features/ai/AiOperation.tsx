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

const TASK_LABEL: Record<string, string> = { tutor: 'Tutor reply', generate: 'Question generation' };
const STATE_LABEL: Record<string, string> = {
  blocked: 'Not sent',
  queued: 'Waiting',
  running: 'Working',
  complete: 'Finished',
  cancelled: 'Stopped',
  failed: 'Failed',
  interrupted: 'Interrupted',
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
  if (data.isPending)
    return (
      <Page width="narrow">
        <PageLoading label="Loading request" />
      </Page>
    );
  if (data.error)
    return (
      <Page width="narrow">
        <ErrorState error={data.error} onRetry={() => void data.refetch()} />
      </Page>
    );
  const op = data.data;
  return (
    <Page width="narrow">
      <PageHeader
        title={TASK_LABEL[op.task] ?? 'AI request'}
        description="Saved with the materials it would use."
        actions={<Badge>{STATE_LABEL[op.state] ?? op.state}</Badge>}
      />
      {op.reason && <Notice>{op.reason}</Notice>}
      {op.calls
        .filter(e => e.partial)
        .map(e => (
          <div key={e.id} className="rawi-prose rounded-md border p-4 whitespace-pre-wrap">
            {e.partial}
          </div>
        ))}
      <div className="flex flex-wrap gap-tight">
        {['queued', 'failed'].includes(op.state) && (
          <Button
            variant="secondary"
            loading={stop.busy}
            onClick={() =>
              stop.run<Operation>(
                { path: `/v1/ai/operations/${id}/cancel`, body: { operationId: stopId.current } },
                { id: 'stop', onSuccess: data.setData },
              )
            }
          >
            Stop this request
          </Button>
        )}
        <Button variant="ghost" loading={data.isFetching} onClick={() => void data.refetch()}>
          Refresh status
        </Button>
      </div>
      {stop.error && <FieldError>{stop.error}</FieldError>}
    </Page>
  );
}

/** After a request that may have been charged without a result, the next press is a new request. */
