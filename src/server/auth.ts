import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { BackendBindings } from './config';
import type { ReadDb, SocketDb } from './db/client';
import * as schema from './db/schema';

/** Session reads use the HTTP driver, which has no transactions. Sign-in and updates use the socket. */
export function createAuth(env: BackendBindings, db: SocketDb | ReadDb, transaction = true) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction }),
    secret: env.BETTER_AUTH_SECRET!,
    baseURL: env.BETTER_AUTH_URL!,
    basePath: '/api/auth',
    trustedOrigins: [env.BETTER_AUTH_URL!],
    socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! } },
    account: { accountLinking: { enabled: false } },
    // Most requests read the session from a signed cookie instead of the database. A signed-out or
    // deleted session can stay readable for up to five minutes on another device.
    session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
    advanced: { useSecureCookies: env.BETTER_AUTH_URL!.startsWith('https:') },
    // App logs carry a request ID and a safe error code, never provider or SQL details.
    logger: { disabled: true },
  });
}
