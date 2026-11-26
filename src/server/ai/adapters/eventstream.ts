/**
 * Decodes the AWS event stream framing that Bedrock streams use: a 12-byte prelude with the total
 * and header lengths, headers, a JSON payload and a CRC. CRCs are not checked, since TLS already
 * guards the bytes. Yields each event's type and parsed payload.
 */
export async function* awsEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ type: string; payload: unknown }> {
  const reader = body.getReader();
  let buffer = new Uint8Array(0);
  const decoder = new TextDecoder();
  // A stopped reply ends this generator early. Cancelling the reader then releases the response
  // body quietly instead of leaving the read to fail later.
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) {
        const next = new Uint8Array(buffer.length + value.length);
        next.set(buffer);
        next.set(value, buffer.length);
        buffer = next;
      }
      while (buffer.length >= 12) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const total = view.getUint32(0),
          headersLength = view.getUint32(4);
        if (buffer.length < total) break;
        const headers: Record<string, string> = {};
        let at = 12;
        const end = 12 + headersLength;
        while (at < end) {
          const nameLength = buffer[at]!;
          at += 1;
          const name = decoder.decode(buffer.subarray(at, at + nameLength));
          at += nameLength;
          const type = buffer[at]!;
          at += 1;
          // Type 7 is a string. Bedrock sends only strings, so other types are skipped by length.
          if (type === 7) {
            const length = view.getUint16(at);
            at += 2;
            headers[name] = decoder.decode(buffer.subarray(at, at + length));
            at += length;
          } else break;
        }
        const payload = buffer.subarray(end, total - 4);
        const type = headers[':event-type'] ?? headers[':exception-type'] ?? 'unknown';
        let parsed: unknown = null;
        try {
          parsed = payload.length ? JSON.parse(decoder.decode(payload)) : null;
        } catch {
          parsed = null;
        }
        yield { type: headers[':message-type'] === 'exception' ? `exception:${type}` : type, payload: parsed };
        buffer = buffer.slice(total);
      }
      if (done) return;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
