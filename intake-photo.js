// Encode to the upload budget independently of the original file size. Browser
// encoders differ, so reduce dimensions as well as quality for detailed photos.
export async function resizePhoto(bitmap, { maxEdge, maxBytes, quality }) {
  const canvas = document.createElement('canvas');
  try {
    for (let edge = maxEdge; ; edge = Math.max(240, Math.floor(edge * .8))) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('photo_encoding_failed');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const level of [quality, quality * .75, quality * .5]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', level));
        if (blob?.type === 'image/jpeg' && blob.size > 0 && blob.size <= maxBytes) return blob;
      }
      if (edge === 240) break;
    }
    throw new Error('photo_encoding_failed');
  } finally {
    // Release canvas backing memory before preparing the next phone photo.
    canvas.width = canvas.height = 0;
  }
}

// Decode locally; only the resized JPEG copies produced by the form are uploaded.
export async function openPhoto(file) {
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const header = new TextDecoder('latin1').decode(bytes);
  const heic = header.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(header.slice(8));
  const standard = (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    || (bytes[0] === 137 && header.slice(1, 4) === 'PNG')
    || (header.slice(0, 4) === 'RIFF' && header.slice(8, 12) === 'WEBP');
  if (!heic && !standard) throw new Error(`${file.name}: please choose a JPG, PNG, WebP, or HEIC photo.`);
  try { return await createImageBitmap(file); }
  catch {
    if (heic) {
      try {
        const { heicTo } = await import('./vendor/heic-to/1.5.2/heic-to.js');
        return await heicTo({ blob: file, type: 'bitmap' });
      } catch { /* Show the same useful recovery message for unsupported or damaged photos. */ }
    }
    throw new Error(`${file.name}: this photo could not be opened. Please choose another image or save it as a JPG.`);
  }
}
