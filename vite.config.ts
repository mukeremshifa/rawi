import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev server proxies /api to the Worker running under `npm run dev:api`
 * (wrangler dev, port 8787). Two processes locally; in production the Worker
 * serves the built assets directly, so the browser origin is unchanged.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    sourcemap: true,
  },
});
