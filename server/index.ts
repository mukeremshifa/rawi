import { promptKey } from '../src/shared/prompt-key';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type {
  AiErrorBody,
  AiErrorCode,
  AiStatus,
  GenerateResponse,
  GradeResponse,
  TutorStreamEvent,
} from '../src/shared/ai.ts';
import { finishTutorText } from '../src/shared/tutor-output.ts';
import { config, missingConfiguration } from './config.ts';
import { snapshot } from './ledger.ts';
import { generatePrompts, gradePrompts, tutorPrompts } from './prompts.ts';
import * as validate from './validate.ts';
import { AiError, generateJson, streamText } from './vertex.ts';

/**
 * Rawi's local API. Bound to loopback, answers only the dev server's origins,
 * and exists only to keep Vertex AI credentials out of the browser.
 */

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, status: number, code: AiErrorCode, message: string) {
  const body: AiErrorBody = { error: { code, message } };
  sendJson(res, status, body);
}

/** Refuses anything not from the dev server, including DNS-rebinding hosts. */
function checkOrigin(req: IncomingMessage) {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new HttpError(403, 'bad-request', 'Requests must be addressed to localhost.');
  }
  const origin = req.headers.origin;
  if (origin && !config.allowedOrigins.includes(origin)) {
    throw new HttpError(403, 'bad-request', 'This origin is not allowed to use the Rawi API.');
  }
  if (req.method === 'POST' && !origin) {
    throw new HttpError(403, 'bad-request', 'Requests must come from the Rawi app.');
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
    throw new HttpError(415, 'bad-request', 'Send JSON.');
  }
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > config.maxBodyBytes) {
    throw new HttpError(413, 'too-large', 'The request is too large.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > config.maxBodyBytes) throw new HttpError(413, 'too-large', 'The request is too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'bad-request', 'The request body is not valid JSON.');
  }
}

/** An AbortSignal that fires when the browser goes away. */
function clientSignal(req: IncomingMessage, res: ServerResponse): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  req.on('aborted', () => controller.abort());
  return controller.signal;
}

function parseModelJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError('invalid-output', 'The model returned output that could not be read. Nothing was saved. Try again.', 502);
  }
}

/* ── Tutor ──────────────────────────────────────────────────────────────── */

async function tutor(req: IncomingMessage, res: ServerResponse) {
  const body = validate.tutorRequest(await readJson(req));
  const missing = missingConfiguration();
  if (missing.length > 0) throw new AiError('not-configured', missing.join(' '), 503);
  const signal = clientSignal(req, res);
  const { system, prompt } = tutorPrompts(body);

  res.writeHead(200, {
    'content-type': 'application/x-ndjson',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  const emit = (event: TutorStreamEvent) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    const { value, usage } = await streamText(
      { task: 'tutor', system, prompt, signal },
      (text) => emit({ type: 'delta', text }),
    );
    const done = finishTutorText(value, new Set(body.passages.map((p) => p.id)), body.stage);
    if (!done.text) throw new AiError('invalid-output', 'The model returned an empty reply.', 502);
    emit({
      type: 'done',
      text: done.text,
      citations: done.citations,
      droppedCitations: done.dropped,
      meta: done.meta,
      usage,
    });
  } catch (error) {
    const e = error instanceof AiError ? error : new AiError('upstream', String(error), 502);
    emit({ type: 'error', code: e.code, message: e.message });
  } finally {
    res.end();
  }
}

/* ── Generation and feedback ────────────────────────────────────────────── */

async function generate(req: IncomingMessage, res: ServerResponse) {
  const body = validate.generateRequest(await readJson(req));
  const signal = clientSignal(req, res);
  const { system, prompt, schema } = generatePrompts(body);
  const { value, usage } = await generateJson({ task: 'generate', system, prompt, json: { schema }, signal });

  const parsed = parseModelJson(value) as { questions?: unknown };
  const rows = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const seen = new Set<string>();
  const questions = [];
  for (const row of rows) {
    const q = validate.generatedQuestion(row, body);
    if (!q) continue;
    const key = promptKey(q.prompt);
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(q);
    if (questions.length >= body.count) break;
  }
  if (questions.length === 0) {
    throw new AiError('invalid-output', 'None of the generated questions passed the checks, so nothing was saved. Try again or choose different material.', 502);
  }
  const response: GenerateResponse = { questions, rejected: rows.length - questions.length, usage };
  sendJson(res, 200, response);
}

async function grade(req: IncomingMessage, res: ServerResponse) {
  const body = validate.gradeRequest(await readJson(req));
  const signal = clientSignal(req, res);
  const { system, prompt, schema } = gradePrompts(body);
  const { value, usage } = await generateJson({ task: 'grade', system, prompt, json: { schema }, signal });
  const checked = validate.gradeOutput(parseModelJson(value), body);
  if (!checked) {
    throw new AiError('invalid-output', 'The feedback did not match the rubric, so it was not used. Your answer is kept. Try again.', 502);
  }
  const response: GradeResponse = { ...checked, usage };
  sendJson(res, 200, response);
}

function status(res: ServerResponse) {
  const body: AiStatus = {
    configured: missingConfiguration().length === 0,
    missing: missingConfiguration(),
    models: { main: config.mainModel, lite: config.liteModel },
    location: config.project ? config.location : null,
    budget: snapshot(),
  };
  sendJson(res, 200, body);
}

/* ── Routing ────────────────────────────────────────────────────────────── */

const server = createServer(async (req, res) => {
  try {
    checkOrigin(req);
    const route = `${req.method} ${(req.url ?? '').split('?')[0]}`;
    switch (route) {
      case 'GET /api/status':
        return sendJson(res, 200, { mode: 'local', configured: false, missing: ['Start npm run dev:backend to use online mode.'] });
      case 'GET /api/ai/status':
        return status(res);
      case 'POST /api/ai/tutor':
        return await tutor(req, res);
      case 'POST /api/ai/generate':
        return await generate(req, res);
      case 'POST /api/ai/grade':
        return await grade(req, res);
      default:
        return sendError(res, 404, 'bad-request', 'Not found.');
    }
  } catch (error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (error instanceof HttpError) return sendError(res, error.status, error.code, error.message);
    if (error instanceof validate.InvalidBody) return sendError(res, 400, 'bad-request', error.message);
    if (error instanceof AiError) return sendError(res, error.status, error.code, error.message);
    console.error(error);
    return sendError(res, 500, 'upstream', 'The Rawi API hit an unexpected error.');
  }
});

server.requestTimeout = 180_000;
server.listen(config.port, config.host, () => {
  const missing = missingConfiguration();
  console.log(`Rawi API on http://${config.host}:${config.port} using ${config.mainModel} in ${config.location}`);
  if (missing.length > 0) console.log(`AI is not configured yet: ${missing.join(' ')}`);
});
