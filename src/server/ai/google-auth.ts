/**
 * A service-account access token, minted with Web Crypto. No SDK.
 *
 * ── Why this file exists at all ───────────────────────────────────────────
 *
 * The obvious move is `new GoogleGenAI({ vertexai: true })`, and it does not
 * work here. `@google/genai`'s Node build pulls in `google-auth-library`,
 * `protobufjs` and `ws`, and its Vertex path authenticates through
 * **Application Default Credentials** — that is, the developer's local `gcloud`
 * login. There is no `gcloud` in a deployed Worker, and there never will be.
 * The web build is roughly a megabyte and is API-key oriented, which is the
 * wrong credential for Vertex. Neither survives production.
 *
 * What the SDK was doing underneath is a signed JWT exchanged for an access
 * token, which is about sixty lines of Web Crypto — available in the Workers
 * runtime with no dependency at all. So that is what this is.
 *
 * ── The private key, and the form it arrives in ───────────────────────────
 *
 * The downloaded service-account JSON stores the PEM as a single line with
 * literal `\n` sequences. Asking the owner to copy that value *exactly* — no
 * reformatting — removes the step most likely to be got wrong. `wrangler secret
 * put` also accepts a genuine multi-line paste, so both forms are normalised on
 * read and either works.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

/**
 * Cached in module scope, reused until 60 seconds before expiry.
 *
 * An isolate that loses this just mints another, which is why it is not
 * persisted anywhere: a token in KV or Postgres is a credential with a lifetime
 * you now have to manage, in exchange for saving one cheap request.
 */
let cached: { token: string; expiresAt: number } | null = null;

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/** PEM (either form) to the DER bytes `importKey` wants. */
function pemToDer(privateKey: string): ArrayBuffer {
  const normalised = privateKey.replace(/\\n/g, '\n');
  const body = normalised
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  if (!body) throw new GoogleAuthError('GOOGLE_SA_PRIVATE_KEY is empty or malformed');

  const binary = atob(body);
  const der = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    der[index] = binary.charCodeAt(index);
  }
  return der.buffer;
}

async function signJwt(clientEmail: string, privateKey: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = base64UrlJson({
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  });

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );

  return `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;
}

export interface ServiceAccountCredentials {
  clientEmail: string;
  privateKey: string;
}

/** A cloud-platform access token for the configured service account. */
export async function getAccessToken(
  credentials: ServiceAccountCredentials,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) return cached.token;

  if (!credentials.clientEmail || !credentials.privateKey) {
    throw new GoogleAuthError(
      'GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY are both required for live AI.',
    );
  }

  const assertion = await signJwt(credentials.clientEmail, credentials.privateKey);

  const response = await fetcher(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new GoogleAuthError(
      `Google rejected the service-account assertion (${response.status}). ` +
        `Check GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY. ${detail.slice(0, 200)}`,
    );
  }

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    throw new GoogleAuthError('Google returned no access token.');
  }

  cached = {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

/** Test seam. Not exported anywhere a route can reach. */
export function __resetTokenCache(): void {
  cached = null;
}
