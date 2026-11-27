import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      /* Browser and Worker API share the public development origin. */
      '/api': { target: 'http://127.0.0.1:8788', changeOrigin: false },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // The framework changes only when it is upgraded, so it is its own file and stays cached
        // across deploys while the app's own code changes.
        advancedChunks: {
          groups: [
            {
              name: 'framework',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@tanstack)[\\/]/,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@': fileURLToPath(new URL('./src/client', import.meta.url)),
    },
  },
});
