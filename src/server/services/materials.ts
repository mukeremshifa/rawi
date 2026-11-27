import { transaction } from '../db/client';
import { and, asc, desc, eq, exists, gt, inArray, ne, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import type { createMaterialInput, materialPatch, materialListInput } from '../../shared/contracts/materials';
import { materials, materialVersions, blocks, ingestJobs, topicSections, topics, courses } from '../db/schema';
import {
  blockInput,
  DOCUMENT_SCHEMA_VERSION,
  usableStatus,
  type BlockBody,
  type BlockInput,
  type Citation,
  type ConversionWarning,
  type DocumentBlock,
  type Pagination,
  type ParsedBlock,
} from '../../shared/contracts/document';
import { blockMarkdown, spansText } from '../../shared/domain/document-text';
import { markdownBlocks, MARKDOWN_ADAPTER_VERSION } from './documents/markdown';
import type { ReadDb, SocketDb, Transaction } from '../db/client';
import { ApiError, conflict, notFound } from '../errors';
import { getCourse } from './workspace';
import { materialTopics, materialTopicsFrom, materialTopicsReads } from './outline/links';
import { reads, type Rows } from '../db/reads';
import { afterVersionReady } from './outline/queue';

type Db = ReadDb | SocketDb | Transaction;
/** Provider submissions per version, across the first attempt and retries. */
export const MAX_CONVERSION_ATTEMPTS = 3;
export const materialScope = (workspaceId: string, id: string | SQL) =>
  and(eq(materials.workspaceId, workspaceId), eq(materials.id, id));
export async function hash(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)), n =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}
export function readableText(text: string, limit = 1048576) {
  if (
    !text.trim() ||
    new TextEncoder().encode(text).length > limit ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text)
  ) {
    throw new ApiError(400, 'invalid_text', 'Use readable UTF-8 text within the text size limit.');
  }
  return text;
}
export async function lockCourse(tx: Transaction, workspaceId: string, id: string) {
  const [course] = await tx
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.workspaceId, workspaceId), eq(courses.id, id)))
    .for('update');
  if (!course) throw notFound();
}
export async function ownMaterial(db: Db, workspaceId: string, id: string) {
  const [row] = await db.select().from(materials).where(materialScope(workspaceId, id));
  if (!row) throw notFound();
  return row;
}
export async function materialDetail(db: Db, workspaceId: string, id: string) {
  const detail = materialDetailFrom(await reads(db, materialDetailReads(db, workspaceId, id)));
  if (!detail) throw notFound();
  return detail;
}
/**
 * The reads behind `materialDetail`: the material, its current version's status, and its topics. The id
 * may be a subquery, such as a course's syllabus.
 */
export function materialDetailReads(db: Db, workspaceId: string, id: string | SQL) {
  const current = sql`(select ${materials.currentVersionId} from ${materials} where ${materialScope(workspaceId, id)})`;
  return {
    material: db.select().from(materials).where(materialScope(workspaceId, id)),
    version: db
      .select({ status: materialVersions.status, readiness: ingestJobs.readiness })
      .from(materialVersions)
      .leftJoin(ingestJobs, eq(ingestJobs.versionId, materialVersions.id))
      .where(eq(materialVersions.id, current)),
    ...materialTopicsReads(db, { workspaceId }, [id]),
  };
}
/** The detail from `materialDetailReads`, or null when the material is not there. */
export function materialDetailFrom(r: Rows<ReturnType<typeof materialDetailReads>>) {
  const [row] = r.material;
  if (!row) return null;
  const [version] = r.version;
  const { createFingerprint: _private, workspaceId: _workspace, ...visible } = row;
  return {
    ...visible,
    topicIds: materialTopicsFrom(r).get(row.id) ?? [],
    status: version?.status ?? null,
    readiness: version?.readiness ?? null,
  };
}
export async function validateTopics(tx: Transaction, workspaceId: string, courseId: string, ids: string[]) {
  if (!ids.length) return;
  const found = await tx
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, courseId), inArray(topics.id, ids)));
  if (found.length !== ids.length) throw notFound();
}

export function publicVersion(row: typeof materialVersions.$inferSelect) {
  const {
    fingerprint: _hash,
    requestId: _request,
    workspaceId: _workspace,
    courseId: _course,
    rawObjectId: _raw,
    ...version
  } = row;
  const {
    leaseToken: _lease,
    leaseExpiresAt: _leaseExpiry,
    providerRequestId: _provider,
    nextPollAt: _poll,
    submittedAt: _submitted,
    completionFailures: _failures,
    attempts,
    ...visible
  } = version;
  return {
    ...visible,
    retryable: row.status === 'failed' && row.adapter === 'datalab' && attempts < MAX_CONVERSION_ATTEMPTS,
  };
}
/** The readable text of a block that failed validation, without Markdown table or math fences. */
function plainText(block: BlockBody): string {
  switch (block.type) {
    case 'table':
      return block.content.rows.map(row => row.cells.map(cell => spansText(cell.spans)).join(' | ')).join('\n');
    case 'equation':
      return block.content.latex;
    case 'code':
      return block.content.text;
    default:
      return blockMarkdown(block);
  }
}
/**
 * Validate adapter output block by block against the shared contract. A
 * block that fails keeps its text as plain paragraphs, and only a block with
 * no usable text is dropped. Either way the version records a warning, so
 * one irregular table never costs the rest of the document. Dropped content
 * makes the version partial.
 */
export function prepareBlocks(inputs: BlockInput[]) {
  const out: ParsedBlock[] = [];
  const simplified = new Set<number | undefined>(),
    dropped = new Set<number | undefined>();
  for (const input of inputs) {
    const parsed = blockInput.safeParse(input);
    if (parsed.success) {
      out.push(parsed.data);
      continue;
    }
    const page = input.sources?.[0]?.page;
    const sources = (input.sources ?? []).slice(0, 50);
    let text = '';
    try {
      text = plainText(input as BlockBody)
        .replace(/\r\n/g, '\n')
        .trim();
    } catch {
      text = '';
    }
    const pieces = text
      .split(/\n{2,}/)
      .flatMap(part => part.match(/[\s\S]{1,20000}/g) ?? [])
      .filter(part => part.trim());
    const fallback = pieces.map(part =>
      blockInput.safeParse({ type: 'paragraph', content: { spans: [{ type: 'text', text: part }] }, sources }),
    );
    if (pieces.length && fallback.every(f => f.success)) {
      for (const f of fallback) if (f.success) out.push(f.data);
      simplified.add(page);
    } else dropped.add(page);
  }
  const note = (pages: Set<number | undefined>, code: string, message: string): ConversionWarning[] =>
    [...pages].sort((a, b) => (a ?? 0) - (b ?? 0)).map(page => ({ code, message, ...(page ? { page } : {}) }));
  const warnings = [
    ...note(
      simplified,
      'simplified_content',
      'Some content was too large or irregular to keep its layout, so it is shown as plain text.',
    ),
    ...note(dropped, 'dropped_content', 'Some content could not be kept. The original still has it.'),
  ];
  return { blocks: out, warnings, dropped: dropped.size > 0 };
}
/**
 * Insert prepared blocks in order. Section parents come from heading levels,
 * so every adapter gets the same hierarchy rule. Callers run this inside the
 * transaction that marks the version ready or partial.
 */
export async function insertBlocks(
  tx: Transaction,
  scope: { workspaceId: string; courseId: string; materialId: string; versionId: string },
  prepared: ParsedBlock[],
) {
  const headings: { id: string; level: number }[] = [];
  const rows = prepared.map((block, ordinal) => {
    const id = crypto.randomUUID();
    if (block.type === 'heading')
      while (headings.length && headings.at(-1)!.level >= block.content.level) headings.pop();
    const parentId = headings.at(-1)?.id ?? null;
    if (block.type === 'heading') headings.push({ id, level: block.content.level });
    return {
      ...scope,
      id,
      ordinal,
      parentId,
      type: block.type,
      content: block.content,
      sources: block.sources,
      flags: block.flags,
    };
  });
  for (let i = 0; i < rows.length; i += 500) await tx.insert(blocks).values(rows.slice(i, i + 500));
  return rows.length;
}
type Conversion =
  { adapter: 'markdown'; text: string; format: 'md' | 'txt' } | { adapter: 'datalab'; pagination: Pagination };
export async function publishVersion(
  tx: Transaction,
  row: typeof materials.$inferSelect,
  input: {
    requestId: string;
    fingerprint: string;
    origin: 'paste' | 'upload';
    sourceObjectId: string | null;
    format: string;
    conversion: Conversion;
  },
) {
  const [latest] = await tx
    .select({ number: materialVersions.number })
    .from(materialVersions)
    .where(eq(materialVersions.materialId, row.id))
    .orderBy(desc(materialVersions.number))
    .limit(1);
  const { conversion, ...fields } = input;
  // Markdown converts in the publish transaction. Other formats wait for their conversion job.
  const markdown =
    conversion.adapter === 'markdown' ? prepareBlocks(markdownBlocks(conversion.text, conversion.format)) : null;
  const [version] = await tx
    .insert(materialVersions)
    .values({
      ...fields,
      id: crypto.randomUUID(),
      workspaceId: row.workspaceId,
      courseId: row.courseId,
      materialId: row.id,
      number: (latest?.number ?? 0) + 1,
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      adapter: conversion.adapter,
      adapterVersion: conversion.adapter === 'markdown' ? MARKDOWN_ADAPTER_VERSION : '',
      status: markdown ? (markdown.dropped ? 'partial' : 'ready') : 'pending',
      pagination: conversion.adapter === 'markdown' ? 'none' : conversion.pagination,
      warnings: markdown
        ? [
            ...markdown.warnings,
            ...(markdown.blocks.length
              ? []
              : [{ code: 'empty', message: 'No readable text was found in this material.' }]),
          ]
        : [],
    })
    .returning();
  if (markdown)
    await insertBlocks(
      tx,
      { workspaceId: row.workspaceId, courseId: row.courseId, materialId: row.id, versionId: version!.id },
      markdown.blocks,
    );
  await tx
    .update(materials)
    .set({ currentVersionId: version!.id, revision: latest ? row.revision + 1 : row.revision, updatedAt: new Date() })
    .where(eq(materials.id, row.id));
  // After the material points at this version, so the outline jobs count it as ready.
  if (markdown?.blocks.length) await afterVersionReady(tx, version!);
  return publicVersion(version!);
}
export async function createMaterial(
  db: SocketDb,
  workspaceId: string,
  courseId: string,
  input: z.infer<typeof createMaterialInput>,
  limit: number,
) {
  readableText(input.text, limit);
  const fingerprint = await hash(JSON.stringify(input));
  return transaction(db, async tx => {
    await lockCourse(tx, workspaceId, courseId);
    const { text, format, ...fields } = input;
    const [inserted] = await tx
      .insert(materials)
      .values({ ...fields, workspaceId, courseId, createFingerprint: fingerprint })
      .onConflictDoNothing()
      .returning();
    const row = inserted ?? (await ownMaterial(tx, workspaceId, input.id));
    if (row.courseId !== courseId) throw notFound();
    if (row.createFingerprint !== fingerprint)
      throw new ApiError(409, 'create_conflict', 'This request ID was used with different content.');
    if (inserted) {
      await publishVersion(tx, row, {
        requestId: input.id,
        fingerprint,
        origin: 'paste',
        sourceObjectId: null,
        format,
        conversion: { adapter: 'markdown', text, format },
      });
    }
    return materialDetail(tx, workspaceId, row.id);
  });
}
export async function patchMaterial(
  db: SocketDb,
  workspaceId: string,
  id: string,
  input: z.infer<typeof materialPatch>,
) {
  return transaction(db, async tx => {
    const row = await ownMaterial(tx, workspaceId, id);
    await lockCourse(tx, workspaceId, row.courseId);
    const { expectedRevision, ...fields } = input;
    if (row.kind === 'syllabus' && fields.kind)
      throw new ApiError(400, 'invalid_input', 'The syllabus keeps its place on the course page.');
    const [saved] = await tx
      .update(materials)
      .set({ ...fields, revision: sql`${materials.revision} + 1`, updatedAt: new Date() })
      .where(and(materialScope(workspaceId, id), eq(materials.revision, expectedRevision)))
      .returning();
    if (!saved) throw conflict();
    return materialDetail(tx, workspaceId, id);
  });
}
export async function listMaterials(
  db: ReadDb,
  workspaceId: string,
  courseId: string,
  input: z.infer<typeof materialListInput>,
) {
  await getCourse(db, workspaceId, courseId);
  if (input.topicId) {
    const [topic] = await db
      .select({ id: topics.id })
      .from(topics)
      .where(and(eq(topics.workspaceId, workspaceId), eq(topics.courseId, courseId), eq(topics.id, input.topicId)));
    if (!topic) throw notFound();
  }
  // The syllabus has its own slot on the course page and is not listed here.
  const rows = await db
    .select({ material: materials, status: materialVersions.status, readiness: ingestJobs.readiness })
    .from(materials)
    .leftJoin(materialVersions, eq(materialVersions.id, materials.currentVersionId))
    .leftJoin(ingestJobs, eq(ingestJobs.versionId, materials.currentVersionId))
    .where(
      and(
        eq(materials.workspaceId, workspaceId),
        eq(materials.courseId, courseId),
        ne(materials.kind, 'syllabus'),
        input.archived === 'all' ? undefined : eq(materials.archived, input.archived === 'true'),
        input.cursor ? gt(materials.id, input.cursor) : undefined,
        input.topicId
          ? exists(
              db
                .select({ id: topicSections.topicId })
                .from(topicSections)
                .where(
                  and(
                    eq(topicSections.materialId, materials.id),
                    eq(topicSections.topicId, input.topicId),
                    eq(topicSections.removed, false),
                  ),
                ),
            )
          : undefined,
      ),
    )
    .orderBy(asc(materials.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const links = page.length
    ? await materialTopics(
        db,
        { workspaceId, courseId },
        page.map(r => r.material.id),
      )
    : new Map<string, string[]>();
  return {
    materials: page.map(
      ({ material: { createFingerprint: _hash, workspaceId: _workspace, ...material }, status, readiness }) => ({
        ...material,
        status,
        readiness,
        topicIds: links.get(material.id) ?? [],
      }),
    ),
    nextCursor: rows.length > input.limit ? rows[input.limit - 1]!.material.id : null,
  };
}
export async function ownVersion(db: Db, workspaceId: string, materialId: string, id: string) {
  const [row] = await db
    .select()
    .from(materialVersions)
    .where(
      and(
        eq(materialVersions.workspaceId, workspaceId),
        eq(materialVersions.materialId, materialId),
        eq(materialVersions.id, id),
      ),
    );
  if (!row) throw notFound();
  return row;
}
export async function listVersions(db: ReadDb, workspaceId: string, id: string, limit: number, cursor?: string) {
  await ownMaterial(db, workspaceId, id);
  const rows = await db
    .select()
    .from(materialVersions)
    .where(and(eq(materialVersions.materialId, id), cursor ? gt(materialVersions.id, cursor) : undefined))
    .orderBy(asc(materialVersions.id))
    .limit(limit + 1);
  return {
    versions: rows.slice(0, limit).map(publicVersion),
    nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
  };
}
const blockColumns = {
  id: blocks.id,
  ordinal: blocks.ordinal,
  parentId: blocks.parentId,
  type: blocks.type,
  content: blocks.content,
  sources: blocks.sources,
  flags: blocks.flags,
};
/** Blocks of one owned version, by ordinal cursor, or the exact blocks a citation names. */
export async function readBlocks(
  db: Db,
  workspaceId: string,
  id: string,
  versionId: string,
  query: { cursor: number; limit: number; ids?: string[] },
) {
  await ownVersion(db, workspaceId, id, versionId);
  const rows = await db
    .select(blockColumns)
    .from(blocks)
    .where(
      and(
        eq(blocks.workspaceId, workspaceId),
        eq(blocks.versionId, versionId),
        query.ids ? inArray(blocks.id, query.ids) : gt(blocks.ordinal, query.cursor),
      ),
    )
    .orderBy(asc(blocks.ordinal))
    .limit(query.ids ? query.ids.length : query.limit + 1);
  const page = query.ids ? rows : rows.slice(0, query.limit);
  return {
    blocks: page as DocumentBlock[],
    nextCursor: !query.ids && rows.length > query.limit ? page.at(-1)!.ordinal : null,
  };
}
/** A citation must name blocks that exist in a usable version of a material in this course. */
export async function validateCitation(tx: Db, workspaceId: string, courseId: string, citation: Citation) {
  const [version] = await tx
    .select({ status: materialVersions.status })
    .from(materialVersions)
    .where(
      and(
        eq(materialVersions.workspaceId, workspaceId),
        eq(materialVersions.courseId, courseId),
        eq(materialVersions.materialId, citation.materialId),
        eq(materialVersions.id, citation.versionId),
      ),
    );
  if (!version || !usableStatus(version.status)) throw notFound();
  const [found] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(blocks)
    .where(
      and(
        eq(blocks.workspaceId, workspaceId),
        eq(blocks.versionId, citation.versionId),
        inArray(blocks.id, citation.blockIds),
      ),
    );
  if (found?.n !== citation.blockIds.length) throw notFound();
}
/** The cited blocks with their material title, in reading order. */
export async function citationBlocks(tx: Db, workspaceId: string, courseId: string, citation: Citation) {
  const rows = await tx
    .select({ ...blockColumns, title: materials.title })
    .from(blocks)
    .innerJoin(materials, eq(materials.id, blocks.materialId))
    .where(
      and(
        eq(blocks.workspaceId, workspaceId),
        eq(blocks.courseId, courseId),
        eq(blocks.materialId, citation.materialId),
        eq(blocks.versionId, citation.versionId),
        inArray(blocks.id, citation.blockIds),
      ),
    )
    .orderBy(asc(blocks.ordinal));
  return { title: rows[0]?.title ?? '', blocks: rows as (DocumentBlock & { title: string })[] };
}
