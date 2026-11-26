import type { Context } from 'hono';
import type { z } from 'zod';
import type { BackendBindings } from './config';
import type { createAuth } from './auth';
import type { ReadDb, SocketDb } from './db/client';
import { ApiError } from './errors';

export type BackendContext = {
  Bindings: BackendBindings;
  Variables: {
    requestId: string;
    db: ReadDb;
    socket: SocketDb;
    workspaceId: string;
    user: { id: string; name: string; email: string; image?: string | null };
    auth: ReturnType<typeof createAuth>;
  };
};
export async function jsonInput<T>(c: Context<BackendContext>, schema: z.ZodType<T>): Promise<T> {
  if (!c.req.header('content-type')?.startsWith('application/json'))
    throw new ApiError(400, 'invalid_input', 'Send a JSON request body.');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'invalid_input', 'The JSON request body could not be read.');
  }
  return schema.parse(body);
}
