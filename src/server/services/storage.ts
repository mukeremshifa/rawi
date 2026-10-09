import { AwsClient } from 'aws4fetch';
import type { BackendBindings } from '../config';
import { ApiError } from '../errors';
import { readableText } from './materials';

export const mimeTypes: Record<string, string> = { txt: 'text/plain', md: 'text/markdown', pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
export async function storageDeadline<T>(operation: Promise<T>, milliseconds = 60000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new ApiError(503, 'storage_timeout', 'Private storage timed out. Check upload status and retry.')), milliseconds);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
export function limits(env: BackendBindings) {
  const value = (s: string | undefined, fallback: number, maximum: number) => {
    const n = s === undefined ? fallback : Number(s);
    if (!Number.isSafeInteger(n) || n < 1 || n > maximum) throw new ApiError(503, 'invalid_limits', 'Material storage limits are not configured correctly.');
    return n;
  };
  return { file: value(env.MATERIAL_MAX_FILE_BYTES, 25 * 1048576, 25 * 1048576), text: value(env.MATERIAL_MAX_TEXT_BYTES, 1048576, 1048576), workspace: value(env.MATERIAL_WORKSPACE_BYTES, 1073741824, Number.MAX_SAFE_INTEGER), pending: value(env.MATERIAL_PENDING_LIMIT, 10, 100) };
}
export function storage(env: BackendBindings) {
  if (!env.MATERIALS_BUCKET || !env.R2_ACCOUNT_ID || !env.R2_BUCKET_NAME || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ENVIRONMENT) throw new ApiError(503, 'storage_not_configured', 'Private file storage is not configured. You can still save pasted text.');
  if (!/^[a-f0-9]{32}$/.test(env.R2_ACCOUNT_ID) || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET_NAME)) throw new ApiError(503, 'storage_not_configured', 'Private file storage configuration is invalid.');
  return env.MATERIALS_BUCKET;
}
export async function signedUrl(env: BackendBindings, key: string, method: 'PUT' | 'GET', seconds: number, type?: string, attachment?: string) {
  storage(env);
  const client = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, service: 's3', region: 'auto' });
  const url = new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key.split('/').map(encodeURIComponent).join('/')}`);
  url.searchParams.set('X-Amz-Expires', String(Math.max(1, Math.min(300, seconds))));
  if (attachment) { url.searchParams.set('response-content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`); url.searchParams.set('response-content-type', 'application/octet-stream'); }
  const request = await client.sign(url, { method, headers: type ? { 'Content-Type': type } : {}, aws: { signQuery: true, allHeaders: true } });
  return request.url;
}
// A verified target stays verified in this isolate for a few minutes, so a batch of uploads checks once.
let verified: { target: string; until: number } | null = null;
export async function verifyStorageTarget(env: BackendBindings) {
  const bucket = storage(env);
  const expected = `${env.R2_ACCOUNT_ID}/${env.R2_BUCKET_NAME}/${env.R2_ENVIRONMENT}`;
  if (verified?.target === expected && verified.until > Date.now()) return;
  // A read-only identity marker proves that the binding and signed endpoint see the same environment.
  let marker: R2ObjectBody | null;
  try { marker = await storageDeadline(bucket.get('_rawi/environment'), 10000); }
  catch { throw new ApiError(503, 'storage_unavailable', 'The private bucket binding is unavailable. Check the development storage connection.'); }
  if (!marker || marker.size > 512 || (await marker.text()).trim() !== expected) throw new ApiError(503, 'storage_target_mismatch', 'The private storage environment has not been verified.');
  let response: Response;
  try {
    // Internal verification uses signed headers so request traces never contain bearer URLs.
    const client = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, service: 's3', region: 'auto' });
    const request = await client.sign(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/_rawi/environment`, { method: 'GET' });
    response = await fetch(request, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
  }
  catch { throw new ApiError(503, 'storage_unavailable', 'The private storage signing endpoint is unavailable. Retry shortly.'); }
  if (!response.ok || Number(response.headers.get('content-length')) > 512) { await response.body?.cancel(); throw new ApiError(503, 'storage_target_mismatch', 'The private storage signing target could not be verified.'); }
  const bytes = await boundedBytes(response.body!, 512);
  if (new TextDecoder().decode(bytes).trim() !== expected) throw new ApiError(503, 'storage_target_mismatch', 'The private storage binding and signing target do not match.');
  verified = { target: expected, until: Date.now() + 5 * 60_000 };
}
export async function boundedBytes(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new ApiError(400, 'invalid_file', 'The file exceeds the permitted size.'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
const invalid = () => new ApiError(400, 'invalid_file', 'The file is malformed, encrypted, or does not match its declared format.');
async function inspectOffice(bytes: Uint8Array, type: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (n: number) => view.getUint16(n, true), u32 = (n: number) => view.getUint32(n, true);
  let eocd = bytes.length - 22;
  while (eocd >= Math.max(0, bytes.length - 65557) && u32(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0 || u32(eocd) !== 0x06054b50 || eocd + 22 + u16(eocd + 20) !== bytes.length || u16(eocd + 4) || u16(eocd + 6)) throw invalid();
  const count = u16(eocd + 10); let pos = u32(eocd + 16); const end = pos + u32(eocd + 12);
  if (!count || count > 4096 || count !== u16(eocd + 8) || end !== eocd) throw invalid();
  const names = new Set<string>(); const markers = new Map<string, string>(); let expanded = 0;
  const required = ['[Content_Types].xml', '_rels/.rels', type === 'docx' ? 'word/document.xml' : 'ppt/presentation.xml'];
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || u32(pos) !== 0x02014b50) throw invalid();
    const flags = u16(pos + 8), method = u16(pos + 10), compressed = u32(pos + 20), size = u32(pos + 24), nameLength = u16(pos + 28), local = u32(pos + 42);
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    expanded += size;
    if (flags & 0x41 || ![0, 8].includes(method) || expanded > 100 * 1048576 || size > 25 * 1048576 || names.has(name) || /(^\/|\\|(^|\/)\.\.(\/|$)|\x00)/.test(name) || /vbaProject|encryption|encryptedpackage/i.test(name)) throw invalid();
    names.add(name);
    if (local + 30 > u32(eocd + 16) || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method) throw invalid();
    const dataStart = local + 30 + u16(local + 26) + u16(local + 28);
    if (dataStart + compressed > u32(eocd + 16) || new TextDecoder().decode(bytes.subarray(local + 30, local + 30 + u16(local + 26))) !== name) throw invalid();
    if (required.includes(name)) {
      if (size > 2 * 1048576 || (method === 0 && compressed !== size)) throw invalid();
      const packed = bytes.subarray(dataStart, dataStart + compressed);
      const unpacked = method === 0 ? packed : await boundedBytes(new Blob([new Uint8Array(packed)]).stream().pipeThrough(new DecompressionStream('deflate-raw')), size);
      if (unpacked.length !== size) throw invalid();
      let crc = 0xffffffff;
      for (const byte of unpacked) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
      if (((crc ^ 0xffffffff) >>> 0) !== u32(pos + 16)) throw invalid();
      const xml = new TextDecoder('utf-8', { fatal: true }).decode(unpacked);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw invalid();
      markers.set(name, xml);
    }
    pos += 46 + nameLength + u16(pos + 30) + u16(pos + 32);
  }
  if (pos !== end || required.some(name => !markers.has(name))) throw invalid();
  const contentTypes = markers.get('[Content_Types].xml')!;
  const expected = type === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';
  if (!contentTypes.includes(expected) || /macroEnabled/i.test(contentTypes) || !(type === 'docx' ? /<(?:\w+:)?document\b/ : /<(?:\w+:)?presentation\b/).test(markers.get(required[2]!)!)) throw invalid();
}
export async function validateFile(bytes: Uint8Array, type: string, textLimit: number) {
  if (type === 'txt' || type === 'md') {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { throw new ApiError(400, 'invalid_text', 'The file is not valid UTF-8 text.'); }
    return { text: readableText(text, textLimit) };
  }
  try {
    if (type === 'pdf') {
      const header = new TextDecoder('latin1').decode(bytes.subarray(0, 16));
      const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
      if (!/^%PDF-(1\.[0-7]|2\.0)/.test(header) || !/%%EOF\s*$/.test(tail)) throw invalid();
      // Basic format validation only. This is not a parser or malware scanner.
      let hasObject = false;
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        const source = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, offset - 100), offset + 8192));
        if (/\/Encrypt\b/.test(source.replace(/#([a-f\d]{2})/gi, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16))))) throw invalid();
        hasObject ||= /\bobj\b/.test(source);
      }
      if (!hasObject || !/startxref\s+\d+/.test(tail)) throw invalid();
    } else if (type === 'docx' || type === 'pptx') await inspectOffice(bytes, type);
    else throw invalid();
  } catch { throw invalid(); }
  return {};
}
