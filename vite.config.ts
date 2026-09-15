import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * In a live build the fake is aliased away entirely — see
 * `src/client/api/fake-absent.ts` for why never-loaded is not the same
 * property as not-present, and `scripts/check-bundle-secrets.mjs` for the
 * check that holds it to that.
 */
const LIVE = process.env['VITE_API_MODE'] === 'live';

/**
 * Two processes locally (Vite on 5173, the Worker on 8787, `/api` proxied);
 * one origin in production, where the Worker serves `dist/client` from its
 * ASSETS binding. That asymmetry is deliberate — it buys HMR in development
 * without a CORS surface in production.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    /*
     * The array form, because order matters: the fake must be rewritten before
     * `@` expands, and an object alias would not let that be expressed.
     */
    alias: [
      ...(LIVE
        ? [
            {
              find: '@/api/fake.ts',
              replacement: fileURLToPath(
                new URL('./src/client/api/fake-absent.ts', import.meta.url),
              ),
            },
          ]
        : []),
      { find: '@shared', replacement: fileURLToPath(new URL('./src/shared', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src/client', import.meta.url)) },
    ],
  },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist/client',
    // Public sourcemaps hand the implementation to anyone who opens devtools.
    sourcemap: false,
  },
});
