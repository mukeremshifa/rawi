import type { Route } from '../catalog';
import { noUsage, type Usage } from '../types';
import { parseJson } from './bedrock';
import { ProviderError, refused, type Adapter, type ModelRequest, type ModelResult } from './types';

export interface VertexCredentials { project: string; clientEmail: string; privateKey: string }

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const base64 = (data: Uint8Array) => { let s = ''; for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000)); return btoa(s); };

/** A service-account access token, signed with WebCrypto and reused until shortly before expiry. */
function tokens(creds: VertexCredentials) {
  let cached: { token: string; expires: number } | null = null;
  let key: Promise<CryptoKey> | null = null;
  return async () => {
    if (cached && cached.expires > Date.now() + 60_000) return cached.token;
    key ??= (async () => {
      const pem = creds.privateKey.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
      const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
      return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    })();
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: creds.clientEmail, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await key, new TextEncoder().encode(unsigned));
    let response: Response;
    try {
      response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${b64url(signature)}` });
    } catch { throw new ProviderError('vertex_auth_unreachable', true); }
    if (!response.ok) throw new ProviderError(`vertex_auth_${response.status}`, true, response.status);
    const j = await response.json() as { access_token: string; expires_in: number };
    cached = { token: j.access_token, expires: Date.now() + j.expires_in * 1000 };
    return cached.token;
  };
}

/** Gemini on Vertex. Implicit caching discounts a stable prefix, so the request keeps its order. */
export function vertexAdapter(creds: VertexCredentials): Adapter {
  const token = tokens(creds);
  const endpoint = (route: Route, method: string) => {
    const host = route.region === 'global' ? 'aiplatform.googleapis.com' : `${route.region}-aiplatform.googleapis.com`;
    return `https://${host}/v1/projects/${creds.project}/locations/${route.region}/publishers/google/models/${route.model}:${method}`;
  };

  function body(route: Route, req: ModelRequest) {
    type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
    const contents: { role: 'user' | 'model'; parts: Part[] }[] = [];
    const push = (role: 'user' | 'model', parts: Part[]) => { const last = contents.at(-1); if (last?.role === role) last.parts.push(...parts); else contents.push({ role, parts }); };
    for (const turn of req.history ?? []) push(turn.role === 'assistant' ? 'model' : 'user', [{ text: turn.text }]);
    push('user', [...(req.images ?? []).map(i => ({ inlineData: { mimeType: i.mime, data: base64(i.data) } })), { text: req.prompt }]);
    return {
      systemInstruction: { parts: [{ text: req.system }, ...(req.context ? [{ text: req.context }] : [])] },
      contents,
      generationConfig: {
        maxOutputTokens: req.maxOutput, ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
        ...(req.schema ? { responseMimeType: 'application/json', responseJsonSchema: req.schema } : {}),
        ...(route.reasoning === 'gemini-off' ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    };
  }

  const usageOf = (u: Record<string, number> | undefined): Usage => {
    const cached = u?.cachedContentTokenCount ?? 0;
    return { ...noUsage(), input: Math.max(0, (u?.promptTokenCount ?? 0) - cached), cacheRead: cached, output: u?.candidatesTokenCount ?? 0, reasoning: u?.thoughtsTokenCount ?? 0 };
  };
  const stopOf = (reason: string | undefined): ModelResult['stop'] => reason === 'STOP' ? 'end' : reason === 'MAX_TOKENS' ? 'max_tokens' : reason && /SAFETY|PROHIBITED|BLOCKLIST|RECITATION|SPII/.test(reason) ? 'refusal' : 'other';
  type Chunk = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]; usageMetadata?: Record<string, number> };
  const textOf = (c: Chunk) => (c.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join('');

  async function send(url: string, payload: unknown, signal?: AbortSignal) {
    const auth = await token();
    let response: Response;
    try { response = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' }, body: JSON.stringify(payload), signal }); }
    catch (error) { throw new ProviderError(`vertex_unreachable: ${String(error).slice(0, 120)}`, false); }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ProviderError(`vertex_${response.status}: ${detail.slice(0, 200)}`, refused(response.status), response.status);
    }
    return response;
  }

  return {
    async generate(route, req, signal) {
      const started = Date.now();
      const j = await (await send(endpoint(route, 'generateContent'), body(route, req), signal)).json() as Chunk;
      const text = textOf(j);
      return { text, ...(req.schema ? { json: parseJson(text) } : {}), usage: usageOf(j.usageMetadata), stop: stopOf(j.candidates?.[0]?.finishReason), latencyMs: Date.now() - started, ttftMs: null };
    },
    async *stream(route, req, signal) {
      const started = Date.now();
      const response = await send(`${endpoint(route, 'streamGenerateContent')}?alt=sse`, body(route, req), signal);
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '', text = '', ttft: number | null = null, usage = noUsage(), stop: ModelResult['stop'] = 'other';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          buffer += value ?? '';
          let at: number;
          while ((at = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, at).trim(); buffer = buffer.slice(at + 1);
            if (!line.startsWith('data:')) continue;
            const chunk = JSON.parse(line.slice(5)) as Chunk;
            const delta = textOf(chunk);
            if (delta) { ttft ??= Date.now() - started; text += delta; yield delta; }
            if (chunk.usageMetadata) usage = usageOf(chunk.usageMetadata);
            if (chunk.candidates?.[0]?.finishReason) stop = stopOf(chunk.candidates[0].finishReason);
          }
          if (done) break;
        }
      } catch (error) { throw new ProviderError(`vertex_stream_broken: ${String(error).slice(0, 120)}`, false); }
      finally { reader.cancel().catch(() => undefined); }
      return { text, usage, stop, latencyMs: Date.now() - started, ttftMs: ttft };
    },
    async embed(route, texts, purpose, signal) {
      const started = Date.now();
      const task = purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
      const j = await (await send(endpoint(route, 'predict'), { instances: texts.map(content => ({ content, task_type: task })), parameters: { outputDimensionality: 768 } }, signal)).json() as { predictions: { embeddings: { values: number[] } }[] };
      return { vectors: j.predictions.map(p => p.embeddings.values), chars: texts.reduce((n, t) => n + t.length, 0), latencyMs: Date.now() - started };
    },
  };
}
