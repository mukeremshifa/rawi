import { Hono } from 'hono';
import { z } from 'zod';
import { preferencesPatch } from '../../shared/contracts/workspace';
import * as service from '../services/workspace';
import { deleteAccount, recordConsent } from '../services/account';
import { jsonInput, type BackendContext } from '../http';

export const accountRoutes = new Hono<BackendContext>();
accountRoutes.get('/me', async c => {
  const user = c.get('user');
  return c.json({
    user: { id: user.id, name: user.name, email: user.email, image: user.image ?? null },
    ...((await service.findAccount(c.get('db'), user.id)) ?? (await service.bootstrap(c.get('socket'), user.id))),
  });
});
accountRoutes.patch('/profile', async c => {
  const body = await jsonInput(c, z.strictObject({ name: z.string().trim().min(1).max(80) }));
  const { headers } = await c.get('auth').api.updateUser({ body, headers: c.req.raw.headers, returnHeaders: true });
  for (const cookie of headers.getSetCookie()) c.header('Set-Cookie', cookie, { append: true });
  const user = c.get('user');
  return c.json({ id: user.id, name: body.name, email: user.email, image: user.image ?? null });
});
accountRoutes.get('/preferences', async c => c.json(await service.getPreferences(c.get('db'), c.get('workspaceId'))));
accountRoutes.patch('/preferences', async c =>
  c.json(await service.updatePreferences(c.get('socket'), c.get('workspaceId'), await jsonInput(c, preferencesPatch))),
);
/** Agree to the current pilot terms. */
accountRoutes.post('/consent', async c => c.json(await recordConsent(c.get('socket'), c.get('workspaceId'))));
/**
 * Delete the account and everything in it. The student types DELETE to confirm, so a stray request
 * cannot do it. Sign-in records go with the user, so the session ends here too.
 */
accountRoutes.post('/account/delete', async c => {
  await jsonInput(c, z.strictObject({ confirm: z.literal('DELETE') }));
  return c.json(await deleteAccount(c.env, c.get('socket'), c.get('user').id));
});
