import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * The database connection string. In production a Hyperdrive binding pools connections close to the
 * database, so each query is a short hop. Without one, as in development, Rawi connects directly.
 */
export const databaseUrl = (env: { DATABASE_URL?: string; HYPERDRIVE?: { connectionString: string } }) =>
  env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL!;

/** A pooled TCP connection for one request or one background job. Close it when the work ends. */
export function socketDb(url: string, max = 2) {
  const pool = new Pool({ connectionString: url, max, connectionTimeoutMillis: 10000 });
  pool.on('error', () => {
    /* Request failures are reported without database details. */
  });
  return { db: drizzle({ client: pool, schema }), close: () => pool.end() };
}
export type SocketDb = ReturnType<typeof socketDb>['db'];
/** Reads use the request's own connection. The name stays so read-only code says so. */
export type ReadDb = SocketDb;
export type Transaction = Parameters<Parameters<SocketDb['transaction']>[0]>[0];

/** Bound locks after a disconnected request without changing database settings. */
export async function transaction<T>(
  db: SocketDb,
  run: (tx: Transaction) => Promise<T>,
  config?: Parameters<SocketDb['transaction']>[1],
): Promise<T> {
  return db.transaction(async tx => {
    // One round trip. set_config(..., true) is SET LOCAL.
    await tx.execute(
      sql`SELECT set_config('idle_in_transaction_session_timeout', '15s', true), set_config('statement_timeout', '30s', true), set_config('lock_timeout', '10s', true)`,
    );
    return run(tx);
  }, config);
}
