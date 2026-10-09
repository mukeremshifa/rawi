import { z } from 'zod';
import { uuid } from './workspace';

/**
 * The document model Rawi owns. Every conversion adapter produces these
 * blocks, they are validated here before insert, and the Reader renders
 * nothing else. Inline content is a typed span list, never HTML.
 *
 * Block ids are stable only within one version. A reconversion produces new
 * blocks with new ids, so citations always name the version too.
 */
export const DOCUMENT_SCHEMA_VERSION = 1;

export const marks = ['bold', 'italic', 'code', 'sub', 'sup'] as const;
const text = z.string().max(20000);
const markList = z.array(z.enum(marks)).max(5).refine(list => new Set(list).size === list.length).optional();
const webUrl = z.string().max(2000).refine(value => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } });

export const textSpan = z.strictObject({ type: z.literal('text'), text, marks: markList });
export const span = z.discriminatedUnion('type', [
  textSpan,
  z.strictObject({ type: z.literal('link'), href: webUrl, text, marks: markList }),
  z.strictObject({ type: z.literal('math'), latex: z.string().min(1).max(4000) }),
]);
export const spans = z.array(span).max(2000);
export type Span = z.infer<typeof span>;

export type ListContent = { ordered: boolean; items: { spans: Span[]; children?: ListContent }[] };
const listContent: z.ZodType<ListContent, ListContent> = z.lazy(() => z.strictObject({
  ordered: z.boolean(),
  items: z.array(z.strictObject({ spans, children: listContent.optional() })).min(1).max(1000),
}));
const cell = z.strictObject({ spans, colspan: z.number().int().min(1).max(100).optional(), rowspan: z.number().int().min(1).max(1000).optional(), header: z.boolean().optional() });

/** Where a block came from. Pages start at 1. A bbox is [x0, y0, x1, y1] as fractions of the page. */
export const blockSource = z.strictObject({ page: z.number().int().min(1).max(100000), bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional() });
export const blockFlags = z.strictObject({ interpreted: z.boolean().optional(), uncertain: z.boolean().optional() });

const meta = { sources: z.array(blockSource).max(50).default([]), flags: blockFlags.default({}) };
export const blockInput = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('heading'), content: z.strictObject({ level: z.number().int().min(1).max(4), spans }), ...meta }),
  z.strictObject({ type: z.literal('paragraph'), content: z.strictObject({ spans }), ...meta }),
  z.strictObject({ type: z.literal('list'), content: listContent, ...meta }),
  z.strictObject({ type: z.literal('table'), content: z.strictObject({ rows: z.array(z.strictObject({ cells: z.array(cell).max(200) })).min(1).max(2000) }), ...meta }),
  z.strictObject({ type: z.literal('equation'), content: z.strictObject({ latex: z.string().min(1).max(20000) }), ...meta }),
  z.strictObject({ type: z.literal('figure'), content: z.strictObject({ assetId: uuid.nullable(), caption: spans }), ...meta }),
  z.strictObject({ type: z.literal('code'), content: z.strictObject({ text: z.string().max(200000), language: z.string().max(40).optional() }), ...meta }),
  z.strictObject({ type: z.literal('quote'), content: z.strictObject({ spans }), ...meta }),
]);
export type BlockInput = z.input<typeof blockInput>;
export type ParsedBlock = z.infer<typeof blockInput>;
export type BlockType = ParsedBlock['type'];
/** Type and content only, still discriminated by type. */
export type BlockBody = ParsedBlock extends infer B ? B extends ParsedBlock ? Pick<B, 'type' | 'content'> : never : never;
export type DocumentBlock = ParsedBlock & { id: string; ordinal: number; parentId: string | null };

/** A citation names exact blocks of one immutable version. */
export const citationInput = z.strictObject({ materialId: uuid, versionId: uuid, blockIds: z.array(uuid).min(1).max(200).refine(ids => new Set(ids).size === ids.length) });
export type Citation = z.infer<typeof citationInput>;

export const conversionStatuses = ['pending', 'processing', 'ready', 'partial', 'failed'] as const;
export type ConversionStatus = typeof conversionStatuses[number];
export type Pagination = 'source' | 'slides' | 'converted' | 'none';
export type ConversionWarning = { code: string; message: string; page?: number };
/** Versions whose blocks can be read and used as AI context. */
export const usableStatus = (status: ConversionStatus | null | undefined) => status === 'ready' || status === 'partial';

export interface BlockPage { blocks: DocumentBlock[]; nextCursor: number | null }
