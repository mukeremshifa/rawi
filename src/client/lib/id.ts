/**
 * Ids for objects created in the browser.
 *
 * `crypto.randomUUID` where it exists, a counter-plus-random fallback where it
 * does not — which in practice means an insecure origin other than localhost.
 * The prefix is there so an id in a URL or a dev-tools inspection says what
 * kind of thing it names.
 */
let counter = 0;

export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
