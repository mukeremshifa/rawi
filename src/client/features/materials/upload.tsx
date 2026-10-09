import { useRef, useState } from 'react';
import type { z } from 'zod';
import { fileTypes, uploadInput, type Material, type UploadState, type UploadTicket, materialFields } from '@shared/contracts/materials';

import { useAccount } from '@/lib/account';
import { errorMessage, request } from '@/lib/api';
import { useUnsentGuard } from '@/lib/hooks';

type Fields = z.infer<typeof materialFields>;
export type UploadPhase = 'idle' | 'preparing' | 'uploading' | 'finalizing' | 'done' | 'failed';

export const UPLOAD_HINT = 'Text and Markdown files are readable at once. PDF, Word and PowerPoint files are converted into a readable page after upload, and the original stays downloadable. Up to 25 MB, or 1 MB for text.';

/**
 * The upload lifecycle: hash, ask for a ticket, send the bytes straight to
 * private storage, then finalize. A failure keeps the same request id and
 * file, so Retry resumes rather than starting a second material.
 */
export function useUpload(courseId: string, onReady: (state: UploadState) => void) {
  const { user } = useAccount();
  const [file, setFileState] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [state, setState] = useState<UploadState | null>(null);
  const submitted = useRef<z.infer<typeof uploadInput> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const allow = useUnsentGuard(!!file && phase !== 'done');
  const setFile = (next: File | null) => { setFileState(next); submitted.current = null; setState(null); setProgress(0); setError(''); setPhase('idle'); };

  async function start(fields: Fields, material?: Material) {
    if (!file || (phase !== 'idle' && phase !== 'failed')) return;
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setError('');
    try {
      if (file.size > 25 * 1048576) throw new Error('Choose a file up to 25 MB.');
      const type = file.name.split('.').pop()?.toLowerCase();
      if (!fileTypes.includes(type as typeof fileTypes[number])) throw new Error('Choose a TXT, Markdown, PDF, DOCX or PPTX file.');
      if (!submitted.current) {
        setPhase('preparing');
        const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join('');
        submitted.current = uploadInput.parse({ ...fields, requestId: crypto.randomUUID(), materialId: material?.id, expectedRevision: material?.revision, fileName: file.name, size: file.size, type, checksum });
      }
      const ticket = await request<UploadTicket>(`/v1/courses/${courseId}/uploads`, user.id, submitted.current, 'POST', signal);
      setState(ticket.upload);
      if (ticket.upload.state === 'ready') { finish(ticket.upload); return; }
      if (!ticket.url || !ticket.headers) throw new Error(ticket.upload.failure ?? 'This upload expired. Choose the file again to start over.');
      setPhase('uploading');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest(); const abort = () => xhr.abort();
        xhr.open('PUT', ticket.url!); xhr.withCredentials = false; xhr.timeout = 120000;
        for (const [key, value] of Object.entries(ticket.headers!)) xhr.setRequestHeader(key, value);
        xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(Math.round(e.loaded / e.total * 100)); };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('The file did not reach storage. Retry with the same file.'));
        xhr.onerror = () => reject(new Error('Storage could not be reached. Check your connection and retry.'));
        xhr.ontimeout = () => reject(new Error('The upload timed out. Retry with the same file.'));
        xhr.onabort = () => reject(new Error('Upload cancelled.'));
        xhr.onloadend = () => signal.removeEventListener('abort', abort);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) { reject(new Error('Upload cancelled.')); return; }
        xhr.send(file);
      });
      setPhase('finalizing');
      const result = await request<UploadState>(`/v1/uploads/${ticket.upload.id}/finalize`, user.id, {}, 'POST', signal);
      setState(result);
      if (result.state === 'ready') finish(result);
      else throw new Error(result.failure ?? 'The upload is still pending. Retry to finish it.');
    } catch (e) {
      if (signal.aborted) return;
      setPhase('failed'); setError(errorMessage(e));
    }
  }
  function finish(result: UploadState) { setPhase('done'); allow(); onReady(result); }
  return { file, setFile, phase, progress, error, state, start, cancel: () => controller.current?.abort(), busy: phase === 'preparing' || phase === 'uploading' || phase === 'finalizing' };
}

export const PHASE_LABEL: Record<UploadPhase, string> = {
  idle: '', preparing: 'Preparing', uploading: 'Uploading', finalizing: 'Saving', done: 'Saved', failed: 'Not saved',
};
