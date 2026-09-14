import { beforeAll, describe, expect, it, vi } from 'vitest';
import { extractBearerToken, verifyJwt } from './auth.js';

const projectUrl = 'https://example-project.supabase.co';
const keyId = 'test-signing-key';

let privateKey: CryptoKey;
let publicJwk: JsonWebKey & { alg: string; kid: string; use: string };

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  privateKey = pair.privateKey;
  publicJwk = {
    ...(await crypto.subtle.exportKey('jwk', pair.publicKey)),
    alg: 'ES256',
    kid: keyId,
    use: 'sig',
  };
});

function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function signToken(overrides: Record<string, unknown> = {}): Promise<string> {
  const header = encode({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const payload = encode({
    aud: 'authenticated',
    email: 'learner@example.test',
    exp: Math.floor(Date.now() / 1000) + 300,
    iss: `${projectUrl}/auth/v1`,
    role: 'authenticated',
    sub: '11111111-1111-4111-8111-111111111111',
    ...overrides,
  });
  const message = new TextEncoder().encode(`${header}.${payload}`);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      message,
    ),
  );
  let binary = '';
  for (const byte of signature) binary += String.fromCharCode(byte);
  const encodedSignature = btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.${encodedSignature}`;
}

function jwksFetch(): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify({ keys: [publicJwk] }), {
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
}

describe('verifyJwt', () => {
  it('verifies an ES256 learner token against the project JWKS', async () => {
    const fetcher = jwksFetch();
    const user = await verifyJwt(await signToken(), `${projectUrl}/`, fetcher);

    expect(user).toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'learner@example.test',
    });
    expect(fetcher).toHaveBeenCalledWith(
      `${projectUrl}/auth/v1/.well-known/jwks.json`,
      { headers: { Accept: 'application/json' } },
    );
  });

  it('rejects expired and wrongly scoped tokens', async () => {
    const expired = await signToken({ exp: Math.floor(Date.now() / 1000) - 1 });
    const wrongIssuer = await signToken({ iss: 'https://other.example/auth/v1' });
    const serviceRole = await signToken({ role: 'service_role' });

    await expect(verifyJwt(expired, projectUrl, jwksFetch())).resolves.toBeNull();
    await expect(verifyJwt(wrongIssuer, projectUrl, jwksFetch())).resolves.toBeNull();
    await expect(verifyJwt(serviceRole, projectUrl, jwksFetch())).resolves.toBeNull();
  });

  it('rejects a token whose signed payload was changed', async () => {
    const token = await signToken();
    const parts = token.split('.');
    parts[1] = encode({
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 300,
      iss: `${projectUrl}/auth/v1`,
      role: 'authenticated',
      sub: 'attacker',
    });

    await expect(verifyJwt(parts.join('.'), projectUrl, jwksFetch())).resolves.toBeNull();
  });

  it('fails closed when the project URL or signing key is unavailable', async () => {
    const token = await signToken();
    const emptyJwks = vi.fn(async () => new Response('{"keys":[]}')) as unknown as typeof fetch;

    await expect(verifyJwt(token, undefined, jwksFetch())).resolves.toBeNull();
    await expect(verifyJwt(token, projectUrl, emptyJwks)).resolves.toBeNull();
  });
});

describe('extractBearerToken', () => {
  it('extracts only a non-empty Bearer credential', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerToken('bearer token')).toBe('token');
    expect(extractBearerToken('Basic token')).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
  });
});
