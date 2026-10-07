import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { downloadRecovery } from './learning-hooks';

const KEY = 'rawi.state.v1';
export function LegacyRecovery({ onReview }: { onReview: (input: unknown) => void }) {
  const [raw, setRaw] = useState(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const [error, setError] = useState('');
  if (!raw) return null;
  return <section className="rounded border p-4 space-y-3"><h2 className="font-semibold">Previous browser workspace found</h2>
    <p>This is a recovery original, no longer a live workspace. Nothing is uploaded automatically. Mixed sample content and user edits are preserved because their origin cannot be established reliably from the seeded flag.</p>
    {error && <p role="alert">{error}</p>}
    <Button variant="outline" onClick={() => downloadRecovery('rawi-browser-original.json', { storageKey: KEY, raw })}>Download exact recovery original</Button>
    <Button onClick={() => { try { const state = JSON.parse(raw); if (state.version !== 2) throw new Error('This older storage format needs manual recovery. Download the original before discarding it.'); onReview({ format: 'rawi-workspace', version: 1, state }); } catch (e) { setError(e instanceof Error ? e.message : 'This browser record cannot be read. Download the original.'); } }}>Review browser data for import</Button>
    <Button variant="ghost" onClick={() => { if (window.confirm('Permanently discard the previous browser workspace on this device? Keep a recovery download first.')) { localStorage.removeItem(KEY); setRaw(null); } }}>Discard previous browser data</Button>
  </section>;
}
