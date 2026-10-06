import { sql } from 'drizzle-orm';
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

/** Bound locks after a disconnected request without changing database settings. */
export async function transaction<T>(db: SocketDb, run: (tx: Transaction) => Promise<T>, config?: Parameters<SocketDb['transaction']>[1]): Promise<T> {
  return db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '15s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '10s'`);
    return run(tx);
  }, config);
}
