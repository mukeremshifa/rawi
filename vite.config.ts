import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from 'node:crypto';

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'rawi-offline-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(path => /^assets\/[\w.-]+\.(js|css|woff2?)$/.test(path));
      const version = createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 16);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = 'rawi-shell-v1-${version}';
const ASSETS = ${JSON.stringify(['/index.html', ...assets.map(path => '/' + path)])};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
// No skipWaiting or clients.claim: an open app keeps its own assets and schema.
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('rawi-shell-') && key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(cache => cache.match('/index.html')).then(response => response || fetch(event.request)));
  } else if (!url.search && ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(response => response || fetch(event.request)));
  }
});
` });
    },
  }],
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: {
      /* Browser and Worker API share the public development origin. */
      "/api": { target: "http://127.0.0.1:8788", changeOrigin: false },
    },
  },
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@": fileURLToPath(new URL("./src/client", import.meta.url)),
    },
  },
});
