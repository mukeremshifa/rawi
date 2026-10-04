import { Hono } from 'hono';
import { api, type BackendContext } from './backend/routes';

const worker = new Hono<BackendContext>();
worker.route('/api', api);
worker.all('*', c => c.env.ASSETS.fetch(c.req.raw));
export default worker;
