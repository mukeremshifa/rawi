/**
 * Authentication layer for Rawi (R03).
 *
 * Verifies Supabase-issued JWTs using the Web Crypto API. No npm dependency:
 * @supabase/supabase-js adds Node.js polyfills that are unreliable in the
 * Cloudflare Worker runtime. The Worker validates the token server-side and
 * returns only what the app needs (userId, email).
 *
 * Flow:
 *  1. Browser signs in via Supabase client-side SDK (Google OAuth redirect).
 *  2. Supabase issues a JWT; the browser sends it in Authorization: Bearer.
 *  3. Worker verifies the signature using SUPABASE_JWT_SECRET and extracts
 *     the sub claim (userId).
 *  4. Routes that require auth use requireAuth() to extract the verified user.
 *
 * Enrollment gate:
 *  - After verifying the JWT, routes that create sessions additionally check
 *    isEnrolled() in db.ts. Only invited adult learners can create sessions.
 *    Existing sessions remain readable for any authenticated user so that a
 *    suspended learner can export their evidence.
 *
 * Unconfigured mode:
 *  - When SUPABASE_JWT_SECRET is absent, verifyJwt() returns null for every
 *    token. Routes interpret a null user as "unauthenticated" and fall through
 *    to the in-memory fixture path so the existing tests keep passing.
 */

export interface AuthenticatedUser {
  readonly userId: string;
  readonly email?: string;
}

/**
 * Verify a Supabase JWT and return the authenticated user, or null if the
 * token is invalid, expired, or the secret is not configured.
 *
 * Uses HS256 (HMAC-SHA256) — the default algorithm Supabase uses for project
 * JWTs. RS256 is used only for project-level service keys; learner tokens are
 * HS256.
 */
export async function verifyJwt(
  token: string,
  jwtSecret: string | undefined,
): Promise<AuthenticatedUser | null> {
  if (!jwtSecret || !token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const headerB64 = parts[0]!;
    const payloadB64 = parts[1]!;
    const sigB64 = parts[2]!;

    // Import the HMAC key.
    const keyData = new TextEncoder().encode(jwtSecret);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData.buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    // Verify the signature.
    const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlDecode(sigB64);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature.buffer as ArrayBuffer,
      message.buffer as ArrayBuffer,
    );
    if (!valid) return null;

    // Decode the payload.
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64)),
    ) as Record<string, unknown>;

    // Check expiry.
    const exp = payload['exp'];
    if (typeof exp === 'number' && exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    const sub = payload['sub'];
    if (typeof sub !== 'string' || !sub) return null;

    const email = typeof payload['email'] === 'string' ? payload['email'] : undefined;

    return { userId: sub, email };
  } catch {
    return null;
  }
}

/** Extract the Bearer token from an Authorization header value. */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1] ?? null;
}

/** Decode a base64url string to a Uint8Array. */
function base64UrlDecode(input: string): Uint8Array {
  // Replace URL-safe chars and add padding.
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
