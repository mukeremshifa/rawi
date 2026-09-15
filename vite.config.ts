import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Two processes locally (Vite on 5173, the Worker on 8787, `/api` proxied);
 * one origin in production, where the Worker serves `dist/client` from its
 * ASSETS binding. That asymmetry is deliberate — it buys HMR in development
 * without a CORS surface in production.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/client', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
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
