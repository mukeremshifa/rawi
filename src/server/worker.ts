import { Hono } from 'hono';
import { api } from './app';
import type { BackendContext } from './http';
import { socketDb } from './db/client';
import { reconcileExams } from './services/learning';
import { reconcile } from './services/uploads';
import { sweepConversions, sweepOrphanAssets } from './services/conversion';
import { sweepOutlineJobs } from './services/outline/jobs';
import { sweepIngest } from './services/knowledge/ingest';
import { recoverReplies } from './services/ai/tutor';
import { sweepGenerations } from './services/questions/practice';
import { expireOpenCalls } from './ai/meter';
import type { BackendBindings } from './config';
import { ApiError } from './errors';

const worker = new Hono<BackendContext>();
worker.route('/api', api);
// Unsupported API methods must never fall through to the application document.
worker.all('/api/*', c => {
  c.header('Cache-Control', 'no-store');
  return c.json({ error: { code: 'not_found', message: 'This API route is unavailable.' } }, 404);
});
worker.all('*', c => c.env.ASSETS.fetch(c.req.raw));
export default {
  fetch: worker.fetch,
  async scheduled(_controller: ScheduledController, env: BackendBindings) {
    if (!env.DATABASE_URL) return;
    const connection = socketDb(env.DATABASE_URL),
      db = connection.db;
    // Each sweep runs on its own, so one failure never starves the others. Logs name the sweep, never SQL or provider details.
    const sweeps: [string, () => Promise<unknown>][] = [
      ['exams', () => reconcileExams(db)],
      ['uploads', () => reconcile(db, env)],
      ['conversions', () => sweepConversions(db, env)],
      ['outline', () => sweepOutlineJobs(db, env)],
      ['abandonedCalls', () => expireOpenCalls(db)],
      ['recoveredReplies', () => recoverReplies(db, null)],
      ['generations', () => sweepGenerations(db, env)],
      ['ingest', () => sweepIngest(db, env)],
      ['orphanAssets', () => sweepOrphanAssets(db, env)],
    ];
    const results: Record<string, unknown> = {},
      failed: string[] = [];
    try {
      for (const [name, sweep] of sweeps) {
        try {
          results[name] = (await sweep()) ?? 'done';
        } catch (error) {
          failed.push(name);
          results[name] = { failed: error instanceof ApiError ? error.code : 'unavailable' };
        }
      }
      console.log(JSON.stringify({ operation: 'material-maintenance', ...results }));
    } finally {
      await connection.close();
    }
    if (failed.length)
      throw new Error(
        `Maintenance failed for ${failed.join(', ')}. Retry after checking database and storage availability.`,
      );
  },
};
