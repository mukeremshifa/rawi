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
import { expireOpenCalls } from './ai/meter';
import type { BackendBindings } from './config';

const worker = new Hono<BackendContext>();
worker.route('/api', api);
// Unsupported API methods must never fall through to the application document.
worker.all('/api/*', c => { c.header('Cache-Control', 'no-store'); return c.json({ error: { code: 'not_found', message: 'This API route is unavailable.' } }, 404); });
worker.all('*', c => c.env.ASSETS.fetch(c.req.raw));
export default {
  fetch: worker.fetch,
  async scheduled(_controller: ScheduledController, env: BackendBindings) {
    if (!env.DATABASE_URL) return;
    const connection = socketDb(env.DATABASE_URL);
    try { await reconcileExams(connection.db); console.log(JSON.stringify({ operation: 'material-maintenance', ...await reconcile(connection.db, env), ...await sweepConversions(connection.db, env), ...await sweepOutlineJobs(connection.db, env), abandonedCalls: await expireOpenCalls(connection.db), recoveredReplies: await recoverReplies(connection.db, null), ...await sweepIngest(connection.db, env), ...await sweepOrphanAssets(connection.db, env) })); }
    catch { throw new Error('Material maintenance failed. Retry after checking database and storage availability.'); }
    finally { await connection.close(); }
  },
};
