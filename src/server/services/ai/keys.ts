import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { BackendBindings } from '../../config';
import type { ReadDb, SocketDb } from '../../db/client';
import { fundingSources, workspaces } from '../../db/schema';
import { ApiError } from '../../errors';
import { forgetFunding, seal, type Credentials } from '../../ai/funding';

/**
 * A student's own API key, as a funding source of their workspace. The key is sealed before it is
 * stored and never returned or logged. Metering still records every call against it, and only
 * the cap the student sets can block one.
 */
export const ownKeyInput = z.strictObject({
  credentials: z.strictObject({
    vendor: z.literal('openrouter'),
    apiKey: z
      .string()
      .trim()
      .regex(/^sk-or-[A-Za-z0-9_-]{20,200}$/, 'Paste the OpenRouter key, which starts with sk-or-.'),
  }),
  monthlyCapUsd: z.number().min(1).max(10_000).nullable(),
});
export const useSourceInput = z.strictObject({ source: z.enum(['own', 'platform']) });

export async function fundingView(db: ReadDb | SocketDb, workspaceId: string) {
  const [ws] = await db
    .select({ source: workspaces.fundingSourceId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  const [own] = await db
    .select()
    .from(fundingSources)
    .where(and(eq(fundingSources.ownerWorkspaceId, workspaceId), eq(fundingSources.kind, 'user')));
  const [assigned] = ws?.source
    ? await db
        .select({ kind: fundingSources.kind, label: fundingSources.label })
        .from(fundingSources)
        .where(eq(fundingSources.id, ws.source))
    : [];
  return {
    using: own?.active ? ('user' as const) : (assigned?.kind ?? ('platform' as const)),
    fallback: assigned?.label ?? 'Rawi',
    ownKey: own
      ? {
          vendor: own.vendors[0]!,
          active: own.active,
          monthlyCapUsd: own.limits.monthlyMicros === null ? null : own.limits.monthlyMicros / 1e6,
          savedAt: own.updatedAt.toISOString(),
        }
      : null,
  };
}

export async function saveOwnKey(
  env: BackendBindings,
  db: SocketDb,
  workspaceId: string,
  input: z.infer<typeof ownKeyInput>,
) {
  const credentials: Credentials = input.credentials;
  const sealed = await seal(env, [credentials]);
  const values = {
    kind: 'user' as const,
    label: 'Your own key',
    ownerWorkspaceId: workspaceId,
    credentials: sealed,
    vendors: [credentials.vendor],
    routes: null,
    limits: {
      dailyMicros: null,
      monthlyMicros: input.monthlyCapUsd === null ? null : Math.round(input.monthlyCapUsd * 1e6),
      concurrent: 4,
    },
    perWorkspace: null,
    // Requests keep no prompts, and student writing goes only to cleared routes, whatever the key.
    retention: 'none' as const,
    studentRetention: 'none' as const,
    active: true,
    updatedAt: new Date(),
  };
  const [saved] = await db
    .insert(fundingSources)
    .values({ id: crypto.randomUUID(), ...values })
    .onConflictDoUpdate({ target: [fundingSources.ownerWorkspaceId, fundingSources.kind], set: values })
    .returning({ id: fundingSources.id });
  forgetFunding(workspaceId, saved!.id);
  return fundingView(db, workspaceId);
}

export async function removeOwnKey(db: SocketDb, workspaceId: string) {
  const rows = await db
    .delete(fundingSources)
    .where(and(eq(fundingSources.ownerWorkspaceId, workspaceId), eq(fundingSources.kind, 'user')))
    .returning({ id: fundingSources.id });
  forgetFunding(workspaceId, rows[0]?.id);
  return fundingView(db, workspaceId);
}

/** Switch between the student's own key and the workspace's usual source. The key stays stored. */
export async function useSource(db: SocketDb, workspaceId: string, input: z.infer<typeof useSourceInput>) {
  const rows = await db
    .update(fundingSources)
    .set({ active: input.source === 'own', updatedAt: new Date() })
    .where(and(eq(fundingSources.ownerWorkspaceId, workspaceId), eq(fundingSources.kind, 'user')))
    .returning({ id: fundingSources.id });
  if (input.source === 'own' && !rows.length) throw new ApiError(409, 'no_key', 'Add your own key first.');
  forgetFunding(workspaceId, rows[0]?.id);
  return fundingView(db, workspaceId);
}
