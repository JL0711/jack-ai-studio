// Opens whatever the visitor dropped: decides by the bytes (not the file
// name) whether it is an .xlsx, a CSV/TSV text file, or something to refuse
// with a helpful message.

import { decodeText } from '../../lib/files/download';
import { readCsv, type Delimiter } from './csv';
import { ListError, MAX_FILE_BYTES, MAX_ROWS } from './errors';
import { readXlsx, type SheetRow } from './xlsx';

export interface LoadedList {
  kind: 'xlsx' | 'csv';
  rows: SheetRow[];
  sheetName?: string;
  delimiter?: Delimiter;
}

/** Control bytes that never appear in text (UTF-16 files are recognised by their BOM first). */
function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8192);
  let odd = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return true;
    if (b < 9 || (b > 13 && b < 32 && b !== 27)) odd++;
  }
  return odd > n / 100;
}

export async function loadListFile(fileName: string, bytes: Uint8Array): Promise<LoadedList> {
  if (bytes.length > MAX_FILE_BYTES) throw new ListError('too_big');
  if (bytes.length === 0) throw new ListError('empty');
  const ext = (/\.([a-z0-9]+)$/i.exec(fileName)?.[1] ?? '').toLowerCase();

  // ZIP: .xlsx (or a .docx / .numbers / other ZIP, which readXlsx names).
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const sheet = await readXlsx(bytes);
    return { kind: 'xlsx', rows: sheet.rows, sheetName: sheet.sheetName };
  }
  // OLE2 compound file: an old .xls, an old .doc, or an .xlsx with a password.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new ListError(ext === 'doc' ? 'docx' : 'xls');
  }
  const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
  if (!utf16 && looksBinary(bytes)) throw new ListError(ext.startsWith('xls') ? 'corrupt' : 'not_list');

  const text = decodeText(bytes);
  // "Excel" exports from some web systems are really HTML tables.
  if (/^\s*</.test(text)) throw new ListError(ext.startsWith('xls') ? 'xls' : 'not_list');
  const { rows, delimiter } = readCsv(text);
  const filled = rows.filter((r) => r.some((c) => c.trim() !== '')).length;
  if (!filled) throw new ListError('empty');
  if (filled > MAX_ROWS + 20) throw new ListError('too_many_rows', filled);
  return { kind: 'csv', rows: rows.map((cells, i) => ({ r: i + 1, cells })), delimiter };
}
