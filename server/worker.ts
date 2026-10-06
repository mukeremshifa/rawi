import { Hono } from 'hono';
import { api, type BackendContext } from './backend/routes';
import { socketDb } from './backend/db';
import { reconcileExams } from './backend/learning';
import { reconcile } from './backend/uploads';
import type { BackendBindings } from './backend/config';

const worker = new Hono<BackendContext>();
worker.route('/api', api);
worker.all('*', c => c.env.ASSETS.fetch(c.req.raw));
export default {
  fetch: worker.fetch,
  async scheduled(_controller: ScheduledController, env: BackendBindings) {
    if (!env.DATABASE_URL) return;
    const connection = socketDb(env.DATABASE_URL);
    try { await reconcileExams(connection.db); console.log(JSON.stringify({ operation: 'material-maintenance', ...await reconcile(connection.db, env) })); }
    catch { throw new Error('Material maintenance failed. Retry after checking database and storage availability.'); }
    finally { await connection.close(); }
  },
};
