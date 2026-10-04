import { defineConfig } from 'drizzle-kit';

try { process.loadEnvFile('.dev.vars'); } catch { /* Shell bindings also work. */ }
// Generation is offline. Applying migrations requires DATABASE_URL.
export default defineConfig({
  dialect: 'postgresql', schema: './server/backend/schema.ts', out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
