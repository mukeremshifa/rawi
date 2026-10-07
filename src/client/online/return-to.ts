/** Keep route state without allowing external URLs or authentication loops. */
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/courses';
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith('//')) return '/courses';
    const url = new URL(value, window.location.origin);
    const path = decodeURIComponent(url.pathname).toLowerCase();
    if (url.origin !== window.location.origin || /^\/(?:sign-in|auth|api|welcome)(?:\/|$)/.test(path) || /^\/online\/(?:sign-in|auth|api|welcome)(?:\/|$)/.test(path)) return '/courses';
    return url.pathname + url.search + url.hash;
  } catch { return '/courses'; }
}
