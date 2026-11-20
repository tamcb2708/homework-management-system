/** Content sniffing (magic bytes) – the declared extension/MIME is never trusted (S10, S11). */
const ZIP_KINDS: Record<string, string> = { docx: 'word/', xlsx: 'xl/', pptx: 'ppt/' };

export const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
};

export function detectType(buf: Buffer, ext: string): string | null {
  const e = ext.toLowerCase();
  const starts = (...bytes: number[]) => bytes.every((b, i) => buf[i] === b);
  if (e === 'pdf') return buf.subarray(0, 5).toString('latin1') === '%PDF-' ? 'pdf' : null;
  if (e === 'png') return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ? 'png' : null;
  if (e === 'jpg' || e === 'jpeg') return starts(0xff, 0xd8, 0xff) ? 'jpg' : null;
  if (e in ZIP_KINDS) {
    if (!starts(0x50, 0x4b, 0x03, 0x04)) return null;
    // OOXML: the package must contain the part folder for its kind and [Content_Types].xml.
    const s = buf.toString('latin1');
    return s.includes('[Content_Types].xml') && s.includes(ZIP_KINDS[e]) ? e : null;
  }
  if (e === 'txt') return buf.subarray(0, 4096).includes(0) ? null : 'txt';
  return null;
}

export function safeFilename(name: string): string {
  const base = name.normalize('NFC').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, '_').replace(/^\.+/, '').trim();
  return (base || 'tep').slice(0, 150);
}
