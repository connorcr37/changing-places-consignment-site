export const INTAKE_RETENTION_SECONDS = 30 * 86400;
export const photoKey = (uploadId, ordinal, preview = false) => `${uploadId}/${ordinal}${preview ? '-email' : ''}.jpg`;

export async function readBoundedBody(source, maxBytes) {
  if (Number(source.headers.get('content-length')) > maxBytes) throw new Error('body_too_large');
  if (!source.body) return new Uint8Array();
  const reader = source.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('body_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
