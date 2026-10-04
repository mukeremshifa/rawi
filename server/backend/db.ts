import { neon, Pool } from '@neondatabase/serverless';
import { drizzle as httpDrizzle } from 'drizzle-orm/neon-http';
import { drizzle as socketDrizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

export const readDb = (url: string) => httpDrizzle(neon(url), { schema });
export function socketDb(url: string) {
  const pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 10000 });
  pool.on('error', () => { /* Request failures are reported without database details. */ });
  return { db: socketDrizzle(pool, { schema }), close: () => pool.end() };
}
export type SocketDb = ReturnType<typeof socketDb>['db'];
export type ReadDb = ReturnType<typeof readDb>;
export type Transaction = Parameters<Parameters<SocketDb['transaction']>[0]>[0];
