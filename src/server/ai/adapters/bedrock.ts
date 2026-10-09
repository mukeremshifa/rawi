import { AwsClient } from 'aws4fetch';
import type { Route } from '../catalog';
import { noUsage, type Usage } from '../types';
import { awsEvents } from './eventstream';
import { ProviderError, refused, type Adapter, type ModelRequest, type ModelResult } from './types';

type Content = { text: string } | { image: { format: string; source: { bytes: string } } } | { cachePoint: { type: 'default' } };
type Message = { role: 'user' | 'assistant'; content: Content[] };

const base64 = (data: Uint8Array) => { let s = ''; for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000)); return btoa(s); };

/**
 * The Converse API, signed with aws4fetch so it runs on Workers. Structured output is a forced
 * tool call, which every listed Bedrock route accepts. Flex and cache points are passed through.
 */
export function bedrockAdapter(credentials: { accessKeyId: string; secretAccessKey: string }): Adapter {
  const clients = new Map<string, AwsClient>();
  const client = (region: string) => {
    if (!clients.has(region)) clients.set(region, new AwsClient({ ...credentials, service: 'bedrock', region }));
    return clients.get(region)!;
  };

  function body(route: Route, req: ModelRequest) {
    const system: Content[] = [{ text: req.system }];
    if (req.context) system.push({ text: req.context });
    if (req.cache !== 'none' && route.cache === 'explicit') system.push({ cachePoint: { type: 'default' } });
    // Converse needs alternating turns that start with the student. Neighbours with one role merge.
    const messages: Message[] = [];
    const push = (role: Message['role'], content: Content[]) => {
      const last = messages.at(-1);
      if (last?.role === role) last.content.push(...content); else messages.push({ role, content });
    };
    for (const turn of req.history ?? []) {
      if (!messages.length && turn.role === 'assistant') push('user', [{ text: '(The session started with the tutor.)' }]);
      push(turn.role, [{ text: turn.text }]);
    }
    push('user', [...(req.images ?? []).map(i => ({ image: { format: i.mime.split('/')[1] ?? 'png', source: { bytes: base64(i.data) } } })), { text: req.prompt }]);
    return {
      system, messages,
      inferenceConfig: { maxTokens: req.maxOutput, ...(req.temperature === undefined ? {} : { temperature: req.temperature }) },
      ...(req.schema ? { toolConfig: { tools: [{ toolSpec: { name: 'answer', description: 'Return the answer in this shape.', inputSchema: { json: req.schema } } }], toolChoice: { tool: { name: 'answer' } } } } : {}),
      ...(req.serviceTier === 'flex' && route.flex ? { serviceTier: { type: 'flex' } } : {}),
      ...(route.reasoning === 'gpt-oss-low' ? { additionalModelRequestFields: { reasoning_effort: 'low' } } : {}),
    };
  }

  const usageOf = (u: Record<string, number> | undefined): Usage => ({ ...noUsage(), input: u?.inputTokens ?? 0, output: u?.outputTokens ?? 0, cacheRead: u?.cacheReadInputTokens ?? 0, cacheWrite: u?.cacheWriteInputTokens ?? 0 });
  const stopOf = (reason: string | undefined): ModelResult['stop'] => reason === 'end_turn' || reason === 'tool_use' || reason === 'stop_sequence' ? 'end' : reason === 'max_tokens' ? 'max_tokens' : reason === 'content_filtered' || reason === 'guardrail_intervened' ? 'refusal' : 'other';

  async function send(route: Route, req: ModelRequest, path: 'converse' | 'converse-stream', signal?: AbortSignal) {
    let response: Response;
    try {
      response = await client(route.region).fetch(`https://bedrock-runtime.${route.region}.amazonaws.com/model/${encodeURIComponent(route.model)}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body(route, req)), signal });
    } catch (error) { throw new ProviderError(`bedrock_unreachable: ${String(error).slice(0, 120)}`, false); }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ProviderError(`bedrock_${response.status}: ${detail.slice(0, 200)}`, refused(response.status), response.status);
    }
    return response;
  }

  return {
    async generate(route, req, signal) {
      const started = Date.now();
      const response = await send(route, req, 'converse', signal);
      const j = await response.json() as { output?: { message?: { content?: { text?: string; toolUse?: { input: unknown } }[] } }; usage?: Record<string, number>; stopReason?: string };
      const content = j.output?.message?.content ?? [];
      const tool = content.find(c => c.toolUse)?.toolUse?.input;
      const text = content.map(c => c.text ?? '').join('');
      return { text, ...(req.schema ? { json: tool ?? parseJson(text) } : {}), usage: usageOf(j.usage), stop: stopOf(j.stopReason), latencyMs: Date.now() - started, ttftMs: null };
    },
    async *stream(route, req, signal) {
      const started = Date.now();
      const response = await send(route, req, 'converse-stream', signal);
      let text = '', ttft: number | null = null, usage = noUsage(), stop: ModelResult['stop'] = 'other';
      try {
        for await (const event of awsEvents(response.body!)) {
          const p = event.payload as Record<string, any> | null;
          if (event.type.startsWith('exception:')) throw new ProviderError(`bedrock_stream_${event.type.slice(10)}`, !text);
          if (event.type === 'contentBlockDelta' && typeof p?.delta?.text === 'string') {
            ttft ??= Date.now() - started; text += p.delta.text; yield p.delta.text;
          } else if (event.type === 'messageStop') stop = stopOf(p?.stopReason);
          else if (event.type === 'metadata') usage = usageOf(p?.usage);
        }
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(`bedrock_stream_broken: ${String(error).slice(0, 120)}`, false);
      }
      return { text, usage, stop, latencyMs: Date.now() - started, ttftMs: ttft };
    },
    async embed() { throw new ProviderError('bedrock_embed_unsupported', true); },
  };
}

export function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(trimmed); } catch { return undefined; }
}
