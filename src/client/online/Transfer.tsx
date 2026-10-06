import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ImportReview } from '@shared/transfer';
import { Page, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useLearningWrite, downloadRecovery } from './learning-hooks';
export function OnlineTransfer() {
  const op = useLearningWrite(); const [review, setReview] = useState<ImportReview | null>(null), [input, setInput] = useState<unknown>(null), [error, setError] = useState(''), [accepted, setAccepted] = useState(false);
  const commitId = useRef(crypto.randomUUID());
  return <Page className="py-8" width="prose"><PageHeader title="Workspace data" description="Export your account or review a local workspace export before importing." />
    <p>Signing in never uploads browser data. Keep your local originals until you have checked the imported result. Import adds courses and never replaces existing work.</p>
    <Button disabled={op.busy} onClick={() => void op.run('/v1/export', undefined, 'GET', value => downloadRecovery('rawi-online-workspace.json', value))}>Export online workspace</Button>
    <p>The online export is a versioned recovery archive, including saved activity and import originals. It does not contain source-file bytes. Online archive restoration is not connected yet.</p>
    {error && <p role="alert">{error}</p>}{op.error && <p role="alert">{op.error}</p>}<p role="status">{op.busy ? 'Working…' : ''}</p>
    <section className="border-t pt-6 mt-6 space-y-4"><h2 className="text-xl font-semibold">Import a local export</h2><p>Choose a version 1 Rawi workspace export containing local state version 2, up to 6 MiB. Older work can first be restored and exported in local mode.</p><label className="block">Local workspace export<input className="block" type="file" accept="application/json,.json" disabled={op.busy} onChange={e => { const file = e.target.files?.[0]; if (!file) return; setReview(null); setAccepted(false); setError(''); if (file.size > 6 * 1048576) { setError('Choose an export up to 6 MiB.'); return; } void file.text().then(raw => { setInput(JSON.parse(raw)); commitId.current = crypto.randomUUID(); }).catch(() => setError('This file could not be read as JSON.')); }} /></label>
      <Button disabled={op.busy || !input} onClick={() => void op.run<ImportReview>('/v1/imports/review', { export: input }, 'POST', setReview)}>Review import</Button>
      {review && <div className="border rounded p-4 space-y-3"><h3 className="font-semibold">{review.state === 'complete' ? 'Previously imported' : 'Import review'}</h3><p>{review.courses} courses, {review.materials} materials, {review.questions} questions, {review.sets} sets and {review.attempts} completed attempts.</p><h4>Recovery-only records and limitations</h4><ul className="list-disc pl-5">{review.unsupported.map(v => <li key={v}>{v}</li>)}</ul><Button variant="outline" onClick={() => void op.run(`/v1/imports/${review.id}/original`, undefined, 'GET', v => downloadRecovery('rawi-original-local-export.json', v))}>Download original recovery file</Button>
        {review.state === 'review' ? <><label className="block"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> I have reviewed the limitations and will keep my local original.</label><Button disabled={op.busy || !accepted} onClick={() => void op.run<ImportReview>(`/v1/imports/${review.id}/commit`, { operationId: commitId.current }, 'POST', setReview)}>Import reviewed records</Button></> : <><p>These records were published together. Repeating this exact export does not create duplicates.</p>{review.courseIds?.map(id => <p key={id}><Link className="underline" to={`/online/course/${id}`}>Open imported course</Link></p>)}</>}
      </div>}
    </section>
  </Page>;
}
