import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { eq } from 'drizzle-orm';
import { socketDb } from '../server/backend/db';
import { workspaces } from '../server/backend/schema';
import { prepareImport, commitImport } from '../server/backend/transfer';
import { seedState } from './fixtures/workspace';

const workspaceId = process.argv[process.argv.indexOf('--target') + 1];
if (!process.argv.includes('--target') || !/^[\da-f-]{36}$/i.test(workspaceId ?? '')) throw new Error('Pass --target EXISTING_DEVELOPMENT_WORKSPACE_ID.');
const config = parseEnv(readFileSync('.dev.vars', 'utf8'));
if (!config.DATABASE_URL || config.R2_ENVIRONMENT !== 'development') throw new Error('The designated .dev.vars development backend is required.');
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== config.DATABASE_URL) throw new Error('The shell database differs from the designated development backend.');
const connection = socketDb(config.DATABASE_URL);
try {
  const [workspace] = await connection.db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId!));
  if (!workspace) throw new Error('The explicit development workspace does not exist. Sign in before seeding.');
  const state = seedState();
  state.courses = state.courses.map(c => ({ ...c, description: `Fictional development course. ${c.description}` }));
  state.attempts = state.attempts.map(a => ({ ...a, title: `Fictional activity: ${a.title}` }));
  const input = { format: 'rawi-workspace', version: 1, seedProvenance: 'rawi-fictional-v1', state };
  const review = await prepareImport(connection.db, workspace.id, input);
  const saved = await commitImport(connection.db, workspace.id, review.id, crypto.randomUUID());
  console.log(JSON.stringify({ state: saved.state, courses: saved.courseIds, repeated: review.state === 'complete' }));
} finally { await connection.close(); }
