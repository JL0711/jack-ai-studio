// Minimal ZIP reading and writing, done in the browser with no library.
//
// .docx and .xlsx files are ZIP archives of XML files, so this is all the
// demos need to read a visitor's Word / Excel file and to hand back a real
// .docx or a .zip of certificates. Nothing is uploaded anywhere.
//
//  - readZip:   STORE and DEFLATE entries (DEFLATE via the browser's own
//               DecompressionStream). ZIP64 and encrypted archives are refused.
//  - createZip: STORE only (no compression). Office files and PNGs open fine;
//               PNG and JPEG are already compressed anyway.

export class ZipError extends Error {
  code: 'not_zip' | 'zip64' | 'encrypted' | 'method' | 'unsupported' | 'corrupt';
  constructor(code: ZipError['code'], message?: string) {
    super(message ?? code);
    this.name = 'ZipError';
    this.code = code;
  }
}

// ---------- CRC-32 (needed by every ZIP entry) ----------

let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

export function crc32(data: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- helpers ----------

const utf8 = new TextEncoder();

export function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === 'string' ? utf8.encode(data) : data;
}

/** DOS date/time fields used by ZIP headers (local time, 2-second resolution). */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, Math.min(2107, d.getFullYear()));
  return {
    time: ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() >> 1) & 31),
    date: (((year - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31),
  };
}

// ---------- writing ----------

export interface ZipInput {
  /** Path inside the archive, with forward slashes (e.g. "word/document.xml"). Any language is fine. */
  name: string;
  data: Uint8Array | string;
  date?: Date;
}

/** Builds a ZIP archive (STORE method). File names are UTF-8, flagged as such. */
export function createZip(files: ZipInput[], now: Date = new Date()): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const seen = new Set<string>();

  for (const f of files) {
    const name = f.name.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!name || seen.has(name)) throw new ZipError('corrupt', `duplicate or empty name: ${name}`);
    seen.add(name);
    const nameBytes = utf8.encode(name);
    const data = toBytes(f.data);
    const crc = crc32(data);
    const { time, date } = dosDateTime(f.date ?? now);
    const flags = 0x0800; // bit 11: names are UTF-8

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, flags, true);
    lv.setUint16(8, 0, true); // method: store
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, flags, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // disk
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

// ---------- reading ----------

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  crc: number;
  offset: number;
  isDirectory: boolean;
}

/** True if the browser (or Node 18+) can inflate DEFLATE data natively. */
export function canInflate(): boolean {
  return typeof DecompressionStream !== 'undefined';
}

export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (!canInflate()) throw new ZipError('unsupported', 'DecompressionStream is not available');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function decodeName(bytes: Uint8Array, utf8Flag: boolean): string {
  // Without the UTF-8 flag the spec says CP437, but Chinese Windows zips use GBK.
  // Try strict UTF-8 first (covers modern tools), then GB18030, then Latin-1.
  if (utf8Flag) return new TextDecoder('utf-8').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('gb18030').decode(bytes);
    } catch {
      return Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    }
  }
}

/** Lists the entries of a ZIP archive (reads the central directory only). */
export function listZip(data: Uint8Array): ZipEntry[] {
  if (data.length < 22) throw new ZipError('not_zip');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // The end-of-central-directory record sits in the last 22 + up to 65535 (comment) bytes.
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('not_zip');
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) throw new ZipError('zip64');
  if (cdOffset + cdSize > data.length) throw new ZipError('corrupt');

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > data.length || view.getUint32(p, true) !== 0x02014b50) throw new ZipError('corrupt');
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const compressedSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    if (flags & 1) throw new ZipError('encrypted');
    if (compressedSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) throw new ZipError('zip64');
    const name = decodeName(data.subarray(p + 46, p + 46 + nameLen), (flags & 0x0800) !== 0);
    entries.push({ name, method, compressedSize, size, crc, offset, isDirectory: name.endsWith('/') });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** The uncompressed bytes of one entry. */
export async function extractEntry(data: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const p = entry.offset;
  if (p + 30 > data.length || view.getUint32(p, true) !== 0x04034b50) throw new ZipError('corrupt');
  const nameLen = view.getUint16(p + 26, true);
  const extraLen = view.getUint16(p + 28, true);
  const start = p + 30 + nameLen + extraLen;
  const raw = data.subarray(start, start + entry.compressedSize);
  if (raw.length !== entry.compressedSize) throw new ZipError('corrupt');
  if (entry.method === 0) return raw.slice();
  if (entry.method === 8) return inflateRaw(raw);
  throw new ZipError('method', `compression method ${entry.method}`);
}

/**
 * Reads the archive into a name → bytes map. `filter` limits which entries are
 * extracted (e.g. only the XML parts of an .xlsx), which keeps big files fast.
 */
export async function readZip(
  data: Uint8Array,
  filter: (name: string) => boolean = () => true,
): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (const entry of listZip(data)) {
    if (entry.isDirectory || !filter(entry.name)) continue;
    out.set(entry.name, await extractEntry(data, entry));
  }
  return out;
}

/** Reads a single file from the archive as UTF-8 text, or null if it isn't there. */
export async function readZipText(data: Uint8Array, name: string): Promise<string | null> {
  const entry = listZip(data).find((e) => e.name === name);
  if (!entry) return null;
  return new TextDecoder('utf-8').decode(await extractEntry(data, entry));
}
