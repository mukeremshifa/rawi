// Workers wait for existing tabs to close. Never replace an editor in use.
export function installOfflineShell() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => {
    const waiting = () => { if (registration.waiting) window.dispatchEvent(new Event('rawi-update-ready')); };
    waiting();
    registration.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', waiting);
    });
  }).catch(() => window.dispatchEvent(new Event('rawi-shell-unavailable')));
}
