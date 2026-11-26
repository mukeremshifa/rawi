/**
 * The explicit development seed. Never bundled, and never run by startup, migration or sign-in.
 *
 *   npm run db:seed -- --email EXISTING_EMAIL
 *
 * It adds three fictional courses to an existing account's workspace, each published through the
 * Markdown adapter like pasted material:
 *
 * - The Atlantic World, with no syllabus: readings, a paragraph longer than any chunk, a table of a
 *   hundred rows, and a handbook with two versions that contradict each other.
 * - Statistical inference, with no syllabus: worked examples with numbers, a formula and steps.
 * - Minds, machines and meaning: only a syllabus, so its topics come from the syllabus.
 *
 * Topics, facts and questions are not seeded. Rawi reads the materials the first time a course
 * page opens, as it would for any upload. Running the seed again adds nothing that exists.
 */
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { socketDb, transaction } from '../src/server/db/client';
import * as s from '../src/server/db/schema';
import { bootstrap, createCourse } from '../src/server/services/workspace';
import { createMaterial, publishVersion } from '../src/server/services/materials';
import { enqueueJob } from '../src/server/services/outline/queue';
import { createCourseInput } from '../src/shared/contracts/workspace';
import { createMaterialInput } from '../src/shared/contracts/materials';
import { SEED_COURSE } from './fixtures/topics';
import { SEED_MATERIALS } from './fixtures/materials';
import { STATS_COURSE, STATS_MATERIALS } from './fixtures/stats';
import { EVAL_MATERIALS, FIGURE } from './fixtures/eval';
import type { FixtureMaterial } from './fixtures/types';

const VERSION = 'rawi-dev-v3';
const args = process.argv.slice(2);
const email = args[0] === '--email' ? args[1]?.trim().toLowerCase() : undefined;
if (!email || args.length !== 2) throw new Error('Pass --email EXISTING_EMAIL.');
const config = parseEnv(readFileSync('.dev.vars', 'utf8'));
if (!config.DATABASE_URL || config.R2_ENVIRONMENT !== 'development')
  throw new Error('The designated .dev.vars development backend is required.');
const connection = socketDb(config.DATABASE_URL),
  db = connection.db;

/** Stable ids per workspace, so a second run finds what the first made. */
const stableId = (workspace: string, key: string) => {
  const h = createHash('sha256').update(`${VERSION}:${workspace}:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const markdown = (m: FixtureMaterial) => m.sections.map(p => `# ${p.heading}\n\n${p.text}`).join('\n\n');

try {
  const users = await db
    .select({ id: s.user.id })
    .from(s.user)
    .where(sql`lower(${s.user.email}) = ${email}`);
  if (users.length !== 1) throw new Error('The email must belong to exactly one existing account. Sign in once first.');
  const { workspace } = await bootstrap(db, users[0]!.id);
  const wid = workspace.id,
    id = (key: string) => stableId(wid, key);
  await db
    .insert(s.developmentSeeds)
    .values({ workspaceId: wid, version: VERSION, anchorDate: new Date().toISOString().slice(0, 10), timezone: 'UTC' })
    .onConflictDoNothing();
  const made: string[] = [];

  async function course(key: string, name: string, description: string) {
    const [existing] = await db
      .select({ id: s.courses.id })
      .from(s.courses)
      .where(and(eq(s.courses.workspaceId, wid), eq(s.courses.id, id(key))));
    if (!existing) {
      await createCourse(db, wid, createCourseInput.parse({ id: id(key), name, description }));
      made.push(name);
    }
    return id(key);
  }
  async function material(
    courseId: string,
    key: string,
    title: string,
    versions: string[],
    kind: 'reading' | 'syllabus' = 'reading',
  ) {
    const [existing] = await db
      .select()
      .from(s.materials)
      .where(and(eq(s.materials.workspaceId, wid), eq(s.materials.id, id(key))));
    if (existing) return;
    const saved = await createMaterial(
      db,
      wid,
      courseId,
      createMaterialInput.parse({
        id: id(key),
        title,
        kind: kind === 'syllabus' ? 'reading' : kind,
        attribution: 'Fictional development material.',
        format: 'md',
        text: versions[0]!,
      }),
      1048576,
    );
    for (const [n, text] of versions.slice(1).entries())
      await transaction(db, async tx => {
        const [row] = await tx.select().from(s.materials).where(eq(s.materials.id, saved.id)).for('update');
        await publishVersion(tx, row!, {
          requestId: id(`${key}:v${n + 2}`),
          fingerprint: VERSION,
          origin: 'paste',
          sourceObjectId: null,
          format: 'md',
          conversion: { adapter: 'markdown', text, format: 'md' },
        });
      });
    if (kind === 'syllabus') {
      await db.update(s.materials).set({ kind: 'syllabus' }).where(eq(s.materials.id, saved.id));
      await db
        .update(s.courses)
        .set({ syllabusMaterialId: saved.id })
        .where(and(eq(s.courses.workspaceId, wid), eq(s.courses.id, courseId)));
      await transaction(db, tx =>
        enqueueJob(tx, { workspaceId: wid, courseId }, 'read_syllabus', {
          materialId: saved.id,
          versionId: saved.currentVersionId!,
        }),
      );
    }
    made.push(title);
  }

  const atlantic = await course(
    'atlantic',
    SEED_COURSE.name,
    `Fictional development course. ${SEED_COURSE.description}`,
  );
  for (const m of SEED_MATERIALS) await material(atlantic, m.id, m.title, [markdown(m)]);
  for (const m of EVAL_MATERIALS)
    await material(
      atlantic,
      `extra:${m.key}`,
      m.title,
      m.versions ?? [m.markdown.replace('FIGURE_PLACEHOLDER\n\n', '')],
    );

  // The winds material carries a figure whose content exists only in its description. Its
  // placeholder paragraph becomes a figure block, with the description a vision model would
  // write, before the material is read, so reading builds a figure passage without an image.
  // A workspace seeded before this gets the figure as a new version of the material.
  const winds = EVAL_MATERIALS.find(m => m.key === FIGURE.material)!;
  const [windsRow] = await db
    .select()
    .from(s.materials)
    .where(and(eq(s.materials.workspaceId, wid), eq(s.materials.id, id(`extra:${winds.key}`))));
  const [drawn] = windsRow
    ? await db
        .select({ id: s.blocks.id })
        .from(s.blocks)
        .where(and(eq(s.blocks.versionId, windsRow.currentVersionId!), eq(s.blocks.type, 'figure')))
        .limit(1)
    : [];
  if (windsRow && !drawn)
    await transaction(db, async tx => {
      const [locked] = await tx.select().from(s.materials).where(eq(s.materials.id, windsRow.id)).for('update');
      await publishVersion(tx, locked!, {
        requestId: id('extra:winds:figure'),
        fingerprint: VERSION,
        origin: 'paste',
        sourceObjectId: null,
        format: 'md',
        conversion: { adapter: 'markdown', text: winds.markdown, format: 'md' },
      });
      const [current] = await tx
        .select({ versionId: s.materials.currentVersionId })
        .from(s.materials)
        .where(eq(s.materials.id, windsRow.id));
      const versionId = current!.versionId!;
      const [placeholder] = await tx
        .select({ id: s.blocks.id })
        .from(s.blocks)
        .where(
          and(
            eq(s.blocks.versionId, versionId),
            eq(s.blocks.type, 'paragraph'),
            sql`${s.blocks.content}::text like '%FIGURE_PLACEHOLDER%'`,
          ),
        );
      if (!placeholder) throw new Error('The figure placeholder was not found in the winds material.');
      await tx
        .update(s.blocks)
        .set({ type: 'figure', content: { assetId: null, caption: [{ type: 'text', text: FIGURE.caption }] } })
        .where(eq(s.blocks.id, placeholder.id));
      await tx.insert(s.figureDescriptions).values({
        blockId: placeholder.id,
        workspaceId: wid,
        courseId: atlantic,
        materialId: windsRow.id,
        versionId,
        description: FIGURE.description,
        language: 'en',
        model: 'fixture',
      });
      made.push('Figure in Winds and routes of the North Atlantic');
    });

  const stats = await course('stats', STATS_COURSE.name, `Fictional development course. ${STATS_COURSE.description}`);
  for (const m of STATS_MATERIALS) await material(stats, m.id, m.title, [markdown(m)]);
  await material(stats, 'standard-error', 'Worked problems: the standard error', [
    readFileSync('dev/fixtures/standard-error.md', 'utf8'),
  ]);

  const minds = await course(
    'minds',
    'Minds, Machines and Meaning',
    'Fictional development course, outlined from its syllabus.',
  );
  await material(
    minds,
    'minds-syllabus',
    'PHIL 214 syllabus',
    [readFileSync('dev/fixtures/syllabus.md', 'utf8')],
    'syllabus',
  );

  console.log(JSON.stringify({ version: VERSION, workspaceId: wid, added: made, courses: { atlantic, stats, minds } }));
} catch (error) {
  // Never print driver query parameters.
  console.error(error instanceof Error && !('query' in error) ? error.message : 'Seed failed.');
  process.exitCode = 1;
} finally {
  await connection.close();
}
