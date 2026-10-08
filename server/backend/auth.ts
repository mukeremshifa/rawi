import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { BackendBindings } from './config';
import type { ReadDb, SocketDb } from './db';
import * as schema from './schema';

/** Session reads use the HTTP driver, which has no transactions. Sign-in and updates use the socket. */
export function createAuth(env: BackendBindings, db: SocketDb | ReadDb, transaction = true) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction }),
    secret: env.BETTER_AUTH_SECRET!, baseURL: env.BETTER_AUTH_URL!, basePath: '/api/auth',
    trustedOrigins: [env.BETTER_AUTH_URL!],
    socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! } },
    account: { accountLinking: { enabled: false } },
    advanced: { useSecureCookies: env.BETTER_AUTH_URL!.startsWith('https:') },
    // App logs carry a request ID and a safe error code, never provider or SQL details.
    logger: { disabled: true },
  });
}
