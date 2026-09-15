#!/usr/bin/env node
/**
 * Invariant 9, enforced against the thing that actually ships.
 *
 * ── What this checks, and why reading the source would not do ─────────────
 *
 * Three properties have to hold of `dist/`, and all three are properties of the
 * *bundle* rather than of any one file:
 *
 *   1. **No answer text.** `correct_option_id` and `answer_explanation` live on
 *      the authored task and are stripped when a `Task` becomes a `CheckItem`.
 *      One import of the wrong module puts the whole demo content object in the
 *      bundle, and nothing about that import looks wrong.
 *
 *   2. **No credentials.** A service-account key, a Supabase service-role key
 *      or a PEM header in client JavaScript is an incident. Vite inlines
 *      anything named `VITE_*`, so the mistake is one rename away at all times.
 *
 *   3. **No non-VITE environment variable.** `import.meta.env.SUPABASE_*` is
 *      undefined at runtime rather than an error, so this failure is silent in
 *      development and only shows up as a broken production build.
 *
 * Reading the source cannot see any of this: the question is what survived
 * bundling and tree-shaking, and the only honest way to ask it is to grep the
 * output.
 *
 * ── It scans the LIVE build, and that is load-bearing ─────────────────────
 *
 * In fake mode the browser is the server, so it necessarily holds the authored
 * content it grades against — answer keys included. That is unavoidable there
 * and harmless: no learner, no evidence that matters.
 *
 * It is neither in the build that ships. So `npm run check:bundle` builds with
 * `VITE_API_MODE=live` first, where the fake is a dynamic import and is
 * genuinely absent. Scanning a fake-mode build would either fail forever or
 * force the rule to be weakened until it guarded nothing.
 *
 *   npm run check:bundle
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/**
 * Each rule is [name, pattern, why]. A match is a failure; the message says
 * what to do rather than only what is wrong.
 */
const RULES = [
  [
    'answer key',
    /correct_option_id/,
    'An authored answer key reached the bundle. Only `CheckItem` may cross to the browser — see toCheckItem() in src/server/learning/session.ts and src/client/api/fake.ts.',
  ],
  [
    'answer explanation',
    /answer_explanation/,
    'Answer explanations are revealed by the server once earned. They must not be in the bundle for an unanswered item.',
  ],
  [
    'private key',
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    'A PEM private key is in client JavaScript. GOOGLE_SA_PRIVATE_KEY is a server secret and belongs in .dev.vars / wrangler secret put.',
  ],
  [
    'supabase service role key',
    // A prefix on its own is not a key: `supabase-js` ships its own key-format
    // validator containing the literal string, and matching that would be a
    // permanent false positive — the kind a team learns to ignore, which is how
    // a check quietly stops working. Require a plausible key body.
    /SUPABASE_SERVICE_ROLE_KEY|\bsb_secret_[A-Za-z0-9_-]{12,}/,
    'The service-role key bypasses RLS. It must never leave the Worker.',
  ],
  [
    'non-VITE env access',
    /import\.meta\.env\.(?!VITE_|MODE|BASE_URL|DEV|PROD|SSR)[A-Z_]+/,
    'Only VITE_* variables exist in the browser. Anything else is undefined at runtime, silently.',
  ],
  [
    'service account email',
    /iam\.gserviceaccount\.com/,
    'A service-account identity is in the bundle. Vertex is reached from the Worker, never from the browser.',
  ],
];

async function* walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

try {
  await stat(dist);
} catch {
  console.error('✗ bundle check: dist/ does not exist. Run `npm run build` first.');
  console.error('  A check that finds no files passes everything, which is worse than failing.');
  process.exit(1);
}

const failures = [];
let scanned = 0;

for await (const file of walk(dist)) {
  if (!/\.(js|mjs|cjs|css|html|json|map)$/.test(file)) continue;
  scanned += 1;
  const contents = await readFile(file, 'utf8');
  for (const [name, pattern, why] of RULES) {
    const match = pattern.exec(contents);
    if (match) {
      failures.push({
        file: file.slice(root.length + 1),
        name,
        why,
        excerpt: contents
          .slice(Math.max(0, match.index - 60), match.index + 80)
          .replace(/\s+/g, ' '),
      });
    }
  }
}

/*
 * A scan that reads nothing is a broken check, not a passing one — the exact
 * failure mode where a build output moves and the gate goes quiet forever.
 */
if (scanned === 0) {
  console.error('✗ bundle check: dist/ contains no scannable files.');
  console.error('  Either the build produced nothing or its output path changed.');
  process.exit(1);
}

if (failures.length === 0) {
  console.log(`✓ bundle secrets: ${scanned} files scanned, nothing leaked.`);
  process.exit(0);
}

console.error(`✗ bundle secrets: ${failures.length} problem(s) in dist/.\n`);
for (const failure of failures) {
  console.error(`  ${failure.name} — ${failure.file}`);
  console.error(`    ${failure.why}`);
  console.error(`    …${failure.excerpt}…\n`);
}
process.exit(1);
