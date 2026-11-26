// A minimal PDF writer: one page per certificate, each page a full-bleed JPEG
// (PDF readers decode JPEG natively via /DCTDecode, so the bytes from the
// canvas go in unchanged). Enough for a print-ready merged file; no fonts,
// no compression, no library.

import { crc32 } from '../../lib/files/zip';

export interface PdfImagePage {
  jpeg: Uint8Array;
  /** Pixel size of the JPEG. */
  width: number;
  height: number;
}

export interface PdfInfo {
  title: string;
  author?: string;
  producer?: string;
  date?: Date;
}

/** A4 landscape in points (1/72 inch). */
export const A4_LANDSCAPE: readonly [number, number] = [841.89, 595.28];

const enc = new TextEncoder();

/** A PDF text string: (literal) for plain ASCII, <FEFF…> UTF-16BE hex for anything else. */
export function pdfString(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/[\\()]/g, '\\$&')})`;
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

/** D:YYYYMMDDHHmmSSZ (UTC). */
export function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

const num = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Builds the PDF. Objects: 1 catalog, 2 page tree, 3 info, then three per
 * page (page, content stream, image). The cross-reference table records the
 * byte offset of every object, so it is computed while writing.
 */
export function buildPdf(
  pages: PdfImagePage[],
  info: PdfInfo,
  pageSize: readonly [number, number] = A4_LANDSCAPE,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, body: string) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };
  const pageObj = (i: number) => 4 + i * 3;
  const [w, h] = pageSize;
  const date = info.date ?? new Date();

  push('%PDF-1.4\n');
  // A comment with high bytes tells transfer tools the file is binary.
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  const infoParts = [`/Title ${pdfString(info.title)}`];
  if (info.author) infoParts.push(`/Author ${pdfString(info.author)}`);
  infoParts.push(
    `/Producer ${pdfString(info.producer ?? 'Browser demo')}`,
    `/CreationDate ${pdfString(pdfDate(date))}`,
  );
  object(3, `<< ${infoParts.join(' ')} >>`);

  pages.forEach((p, i) => {
    const pg = pageObj(i);
    object(
      pg,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(w)} ${num(h)}] ` +
        `/Resources << /XObject << /Im0 ${pg + 2} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${pg + 1} 0 R >>`,
    );
    const ops = `q ${num(w)} 0 0 ${num(h)} 0 0 cm /Im0 Do Q`;
    object(pg + 1, `<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`);
    offsets[pg + 2] = length;
    push(
      `${pg + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
    );
    push(p.jpeg);
    push('\nendstream\nendobj\n');
  });

  const size = 4 + pages.length * 3;
  const xrefAt = length;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let n = 1; n < size; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  // A file ID: two copies of a hash of the content (only needs to be unlikely to repeat).
  const seed = enc.encode(`${info.title}|${date.toISOString()}|${pages.length}|${length}`);
  const id = [0, 1, 2, 3]
    .map((k) =>
      crc32(new Uint8Array([...seed, k]))
        .toString(16)
        .padStart(8, '0'),
    )
    .join('')
    .toUpperCase();
  push(`trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
