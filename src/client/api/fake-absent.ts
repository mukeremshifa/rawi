import { ApiClientError, type ApiClient } from '@shared/contract.ts';

/**
 * What `./fake.ts` becomes in a live build.
 *
 * `vite.config.ts` aliases the fake to this module when `VITE_API_MODE` is
 * `live`, so the demo content — and the `correct_option_id` and
 * `answer_explanation` fields on every authored task in it — is **absent from
 * the shipped bundle**, not merely unreferenced.
 *
 * ── Why the alias, when the import is already dynamic ─────────────────────
 *
 * A dynamic import is still a module the bundler must emit. Rollup produced a
 * `fake-*.js` chunk in the live build: never fetched, and still sitting on the
 * origin for anyone who asked for it by name. Never-loaded is not the same
 * property as not-present, and invariant 9 is about the second one.
 *
 * The content in question is a public fixture rather than any learner's real
 * material, so this was not an incident. It was the difference between a check
 * that passes because the rule holds and a check that would have had to be
 * narrowed until it stopped meaning anything.
 */
export const fakeApi: ApiClient = new Proxy({} as ApiClient, {
  get() {
    return () => {
      throw new ApiClientError(
        'internal',
        'The fake API is not part of a live build. This is a configuration error: VITE_API_MODE is "live" but something asked for the fake.',
      );
    };
  },
});
