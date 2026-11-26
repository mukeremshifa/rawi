/** Temporary transition only. Never stores account data or reloads open editors. */
export function retireBrowserStorage() {
  let deleting = false;
  const cleanup = () => {
    for (const storageName of ['localStorage', 'sessionStorage'] as const) {
      try {
        for (const key of ['rawi.state.v1', 'rawi.theme', 'rawi.device-lock.v1']) window[storageName].removeItem(key);
      } catch {
        /* Restricted storage can be retried on the next visit. */
      }
    }
    if (!deleting && 'indexedDB' in window) {
      deleting = true;
      try {
        const request = indexedDB.deleteDatabase('rawi-offline-v1');
        request.onsuccess = request.onerror = () => {
          deleting = false;
        };
        // Keep one blocked deletion pending. It completes when older connections close.
        request.onblocked = () => {};
      } catch {
        deleting = false;
      }
    }
    if ('caches' in window)
      void caches
        .keys()
        .then(keys => Promise.all(keys.filter(key => key.startsWith('rawi-shell-')).map(key => caches.delete(key))))
        .catch(() => {});
  };
  cleanup();
  window.addEventListener('focus', cleanup);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') cleanup();
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'rawi-retire-storage') cleanup();
    });
    void navigator.serviceWorker
      .getRegistrations()
      .then(async registrations => {
        for (const registration of registrations) {
          const worker = registration.active ?? registration.waiting ?? registration.installing;
          if (!worker || worker.scriptURL !== new URL('/sw.js', location.origin).href) continue;
          // Update the old registration so cached navigation cannot pin the old app.
          // Its replacement claims clients, becomes pass-through and unregisters itself.
          await registration.update().catch(() => {});
        }
      })
      .catch(() => {});
  }
}
