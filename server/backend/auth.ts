import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { BackendBindings } from './config';
import type { SocketDb } from './db';
import * as schema from './schema';

export function createAuth(env: BackendBindings, db: SocketDb) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
    secret: env.BETTER_AUTH_SECRET!, baseURL: env.BETTER_AUTH_URL!, basePath: '/api/auth',
    trustedOrigins: [env.BETTER_AUTH_URL!],
    socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! } },
    account: { accountLinking: { enabled: false } },
    advanced: { useSecureCookies: env.BETTER_AUTH_URL!.startsWith('https:') },
    // App logs carry a request ID and a safe error code, never provider or SQL details.
    logger: { disabled: true },
  });
}
