/**
 * Authentication layer for Rawi (R03).
 *
 * Supabase Auth signs learner access tokens with an asymmetric project key.
 * The Worker verifies those tokens against the project's public JWKS endpoint,
 * then returns only the identity fields the application needs.
 *
 * The configured Supabase project uses ES256. Keeping verification on the
 * Worker avoids trusting browser-supplied identity and does not require a
 * shared JWT secret in the environment.
 */

export interface AuthenticatedUser {
  readonly userId: string;
  readonly email?: string;
}

interface JwtHeader {
  readonly alg?: unknown;
  readonly kid?: unknown;
}

interface ProjectJsonWebKey extends JsonWebKey {
  readonly alg?: string;
  readonly crv?: string;
  readonly kid?: string;
  readonly kty?: string;
}

interface JsonWebKeySet {
  readonly keys?: ProjectJsonWebKey[];
}

/**
 * Verify a Supabase learner JWT and return its authenticated identity.
 * Invalid, expired, wrongly scoped, or unverifiable tokens return null.
 */
export async function verifyJwt(
  token: string,
  supabaseUrl: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<AuthenticatedUser | null> {
  if (!supabaseUrl || !token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const headerB64 = parts[0]!;
    const payloadB64 = parts[1]!;
    const sigB64 = parts[2]!;

    const header = decodeJson<JwtHeader>(headerB64);

    if (header.alg !== 'ES256' || typeof header.kid !== 'string' || !header.kid) {
      return null;
    }

    const projectUrl = supabaseUrl.replace(/\/+$/, '');
    const jwksResponse = await fetcher(
      `${projectUrl}/auth/v1/.well-known/jwks.json`,
      { headers: { Accept: 'application/json' } },
    );
    if (!jwksResponse.ok) return null;

    const jwks = (await jwksResponse.json()) as JsonWebKeySet;
    const jwk = jwks.keys?.find(
      (candidate) =>
        candidate.kid === header.kid &&
        candidate.kty === 'EC' &&
        candidate.crv === 'P-256' &&
        candidate.alg === 'ES256',
    );
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );

    const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlDecode(sigB64);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature.buffer as ArrayBuffer,
      message.buffer as ArrayBuffer,
    );
    if (!valid) return null;

    const payload = decodeJson<Record<string, unknown>>(payloadB64);
    const now = Math.floor(Date.now() / 1000);
    const exp = payload['exp'];
    const nbf = payload['nbf'];
    const audience = payload['aud'];

    if (typeof exp !== 'number' || exp <= now) return null;
    if (typeof nbf === 'number' && nbf > now) return null;
    if (payload['iss'] !== `${projectUrl}/auth/v1`) return null;
    if (!hasAuthenticatedAudience(audience)) return null;
    if (payload['role'] !== 'authenticated') return null;

    const sub = payload['sub'];
    if (typeof sub !== 'string' || !sub) return null;

    const email = typeof payload['email'] === 'string' ? payload['email'] : undefined;

    return { userId: sub, email };
  } catch {
    return null;
  }
}

function hasAuthenticatedAudience(audience: unknown): boolean {
  return audience === 'authenticated' ||
    (Array.isArray(audience) && audience.includes('authenticated'));
}

function decodeJson<T>(input: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(input))) as T;
}

/** Extract the Bearer token from an Authorization header value. */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1] ?? null;
}

/** Decode a base64url string to a Uint8Array. */
function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
