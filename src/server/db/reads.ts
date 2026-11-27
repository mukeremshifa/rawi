import * as orm from 'drizzle-orm';
import { sql, type SQLWrapper } from 'drizzle-orm';
import type { ReadDb, SocketDb, Transaction } from './client';

type Db = ReadDb | SocketDb | Transaction;
/** A drizzle select, not yet run. */
export type Select = SQLWrapper & PromiseLike<unknown>;
/** What `reads` returns for a set of selects. */
export type Rows<T extends Record<string, Select>> = { [K in keyof T]: Awaited<T[K]> };
/** Drizzle's own row decoder. It is exported at runtime but marked internal in its types. */
const { mapResultRow, orderSelectedFields } = orm as unknown as {
  orderSelectedFields(fields: Record<string, unknown>): unknown[];
  mapResultRow(fields: unknown[], row: unknown[], joinsNotNullableMap?: Record<string, boolean>): unknown;
};
type Internals = { config: { fields: Record<string, unknown> }; joinsNotNullableMap?: Record<string, boolean> };

/**
 * Run several independent selects in one round trip, and read them from one snapshot.
 *
 * Each select becomes a subquery whose rows are folded into a JSON array, so the database returns a
 * single row holding every result. The rows are then decoded by drizzle's own mapper, so each result
 * has the same shape and types as awaiting the select by itself. Use it for reads that do not depend
 * on each other. The driver sends one query at a time, so separate awaits cost one round trip each.
 */
export async function reads<T extends Record<string, Select>>(
  db: Db,
  queries: T,
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const keys = Object.keys(queries);
  if (!keys.length) return {} as { [K in keyof T]: Awaited<T[K]> };
  // row(q.*) names the columns f1, f2 and so on, so two columns with the same name stay apart.
  const columns = keys.map(
    (key, i) =>
      sql`(select coalesce(json_agg(row_to_json(row(q.*))), '[]'::json) from (${queries[key]!}) q) as ${sql.identifier(`r${i}`)}`,
  );
  const [row] = (await db.execute(sql`select ${sql.join(columns, sql`, `)}`)).rows as Record<
    string,
    Record<string, unknown>[]
  >[];
  return Object.fromEntries(
    keys.map((key, i) => {
      const query = queries[key] as unknown as Internals;
      const fields = orderSelectedFields(query.config.fields);
      const list = row![`r${i}`]!.map(r =>
        mapResultRow(
          fields,
          fields.map((_, j) => r[`f${j + 1}`]),
          query.joinsNotNullableMap,
        ),
      );
      return [key, list];
    }),
  ) as { [K in keyof T]: Awaited<T[K]> };
}
