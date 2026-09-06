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
