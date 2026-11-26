// Temporary retirement of the former Rawi offline shell. Remove after migration.
// No fetch handler: every request uses the network and normal HTTP caching.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event =>
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await Promise.all(
        (await caches.keys()).filter(key => key.startsWith('rawi-shell-')).map(key => caches.delete(key)),
      );
      for (const client of await self.clients.matchAll({ type: 'window' }))
        client.postMessage({ type: 'rawi-retire-storage' });
      // Older tabs close their database on versionchange. A blocked request can be
      // retried by the new client without holding activation or navigating a tab.
      await new Promise(resolve => {
        const request = indexedDB.deleteDatabase('rawi-offline-v1');
        request.onsuccess = request.onerror = request.onblocked = resolve;
      });
      await self.registration.unregister();
    })(),
  ),
);
