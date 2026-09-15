#!/usr/bin/env node
/**
 * Build once with `VITE_API_MODE=live`, so `check-bundle-secrets.mjs` scans the
 * bundle that actually ships to a learner.
 *
 * ── Why this exists rather than an env prefix in the npm script ───────────
 *
 * `VITE_API_MODE=live vite build` is a bash-ism. This repo is developed on
 * Windows and built in CI on Linux, and a gate step that only runs on one of
 * them is a gate step that gets skipped. Node sets the variable the same way
 * everywhere.
 *
 * ── Why the live build and not the default one ────────────────────────────
 *
 * In fake mode the browser is the server, so it necessarily carries the
 * authored content it grades against — answer keys included. Harmless there,
 * and not the thing invariant 9 is about. The live build is where the fake is
 * a dynamic import and genuinely absent, and that is the artefact whose
 * contents are a promise to somebody.
 */

import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['vite', 'build'], {
  stdio: 'inherit',
  // `npx` is a .cmd shim on Windows, which spawnSync cannot exec directly.
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_API_MODE: 'live' },
});

if (result.status !== 0) {
  console.error('\n✗ live build failed, so there is nothing to scan.');
  process.exit(result.status ?? 1);
}
