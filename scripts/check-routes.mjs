#!/usr/bin/env node
/**
 * Route parity: the contract's methods against the Worker's route table.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * `src/shared/contract.ts` declares an interface of named methods. Two
 * implementations satisfy it — the fake and the real client — and TypeScript
 * enforces both, so *that* drift is already a compile error.
 *
 * What TypeScript cannot see is the third party: the Worker. `client.ts` builds
 * a URL string; `routes/index.ts` registers a path. Nothing type-checks the
 * relationship between them, so a contract method added without a route
 * compiles perfectly and 404s the first time it is called — in production, most
 * likely, because the fake answers it happily in development.
 *
 * This compares the set of method names on `ApiClient` with the set of `op`
 * values in the route table and fails on any difference in either direction.
 * It runs in `verify`, so the drift is caught on the commit that creates it.
 *
 * ── What it does not check ────────────────────────────────────────────────
 *
 * It does not check that `client.ts` builds the path the route registers.
 * Matching a template string against a Hono pattern would be a parser, and a
 * parser is a thing to keep in step — which is the problem this is solving. The
 * *set* of operations is where the bug actually lives; a wrong path within a
 * present operation fails loudly on the first call, and a missing operation
 * does not.
 *
 *   node scripts/check-routes.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT = 'src/shared/contract.ts';
const ROUTES_DIR = 'src/server/routes';

/** Strip comments, so a commented-out method or route is not counted. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (match) => match.replace(/[^\n]/g, ' '));
}

// ---------------------------------------------------------------------------
// The contract: method names inside `export interface ApiClient { … }`
// ---------------------------------------------------------------------------

async function contractOps() {
  const source = stripComments(await readFile(join(root, CONTRACT), 'utf8'));
  const start = source.indexOf('export interface ApiClient');
  if (start < 0) throw new Error(`No "export interface ApiClient" in ${CONTRACT}`);

  // Brace matching from the interface's opening brace: a regex for the whole
  // body would stop at the first `}` inside a nested object type.
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }

  const body = source.slice(open + 1, end);
  const ops = new Set();
  // A method signature at the top level of the interface: `name(` at the start
  // of a line, allowing for indentation.
  for (const match of body.matchAll(/^\s{2}([a-zA-Z][A-Za-z0-9]*)\s*\(/gm)) {
    ops.add(match[1]);
  }
  return ops;
}

// ---------------------------------------------------------------------------
// The Worker: `op: 'name'` in the route table
// ---------------------------------------------------------------------------

async function routeOps() {
  const ops = new Set();
  const duplicates = [];
  const entries = await readdir(join(root, ROUTES_DIR), { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const source = stripComments(
      await readFile(join(root, ROUTES_DIR, entry.name), 'utf8'),
    );
    for (const match of source.matchAll(/\bop:\s*'([A-Za-z0-9]+)'/g)) {
      // Two routes claiming the same operation means one of them is dead, and
      // which one wins depends on registration order — worth failing on.
      if (ops.has(match[1])) duplicates.push(match[1]);
      ops.add(match[1]);
    }
  }

  return { ops, duplicates };
}

// ---------------------------------------------------------------------------

const contract = await contractOps();
const { ops: routes, duplicates } = await routeOps();

/*
 * A parse that finds nothing passes everything. If either file is refactored
 * into a shape these patterns do not match, this must fail loudly rather than
 * quietly guarding nothing.
 */
if (contract.size === 0 || routes.size === 0) {
  console.error('✗ route parity: parsed no operations.');
  console.error(`  ${CONTRACT}: ${contract.size}`);
  console.error(`  ${ROUTES_DIR}/: ${routes.size}`);
  console.error('\n  One of these changed shape. Fix the patterns in this script —');
  console.error('  a check that parses nothing passes everything.');
  process.exit(1);
}

const missingRoutes = [...contract].filter((op) => !routes.has(op)).sort();
const orphanRoutes = [...routes].filter((op) => !contract.has(op)).sort();

if (missingRoutes.length === 0 && orphanRoutes.length === 0 && duplicates.length === 0) {
  console.log(`✓ route parity: ${contract.size} operations, contract and Worker agree.`);
  process.exit(0);
}

console.error('✗ route parity: the contract and the Worker have drifted.\n');

if (missingRoutes.length > 0) {
  console.error('  Declared in the contract, served by no route:');
  for (const op of missingRoutes) console.error(`    ${op}`);
  console.error('');
  console.error('  The fake answers these and the Worker 404s them. This is the');
  console.error('  dangerous direction: nothing fails until live mode.\n');
}

if (orphanRoutes.length > 0) {
  console.error('  Served by a route, declared nowhere in the contract:');
  for (const op of orphanRoutes) console.error(`    ${op}`);
  console.error('');
  console.error('  Either add it to ApiClient or delete the route.\n');
}

if (duplicates.length > 0) {
  console.error('  Claimed by more than one route:');
  for (const op of [...new Set(duplicates)]) console.error(`    ${op}`);
  console.error('');
  console.error('  Which one wins depends on registration order.\n');
}

process.exit(1);
