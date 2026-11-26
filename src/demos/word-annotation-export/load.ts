// Opens a file the visitor imports into the editor: a .docx (by its bytes,
// not its name), or plain text / Markdown in any common encoding.

import { decodeText } from '../../lib/files/download';
import { ImportError, readDocx } from './docx';
import type { LoadErrorCode } from './text';

export class LoadError extends Error {
  code: LoadErrorCode;
  constructor(code: LoadErrorCode) {
    super(code);
    this.name = 'LoadError';
    this.code = code;
  }
}

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
/** The editor keeps up to this many characters (about 60 pages of Chinese text). */
export const MAX_CHARS = 100_000;

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

export async function importFile(name: string, bytes: Uint8Array): Promise<{ text: string; truncated: boolean }> {
  if (bytes.length > MAX_IMPORT_BYTES) throw new LoadError('too_big');
  if (!bytes.length) throw new LoadError('empty');
  let text: string;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      text = await readDocx(bytes);
    } catch (e) {
      throw new LoadError(e instanceof ImportError ? e.code : 'corrupt');
    }
  } else if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new LoadError('doc');
  } else {
    const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
    // RTF, PDF and anything binary are not plain text.
    const head = String.fromCharCode(...bytes.subarray(0, 5));
    if ((!utf16 && looksBinary(bytes)) || head === '%PDF-' || head.startsWith('{\\rtf')) {
      throw new LoadError(/\.doc$/i.test(name) ? 'doc' : 'unsupported');
    }
    text = decodeText(bytes).replace(/\r\n?/g, '\n');
  }
  if (!text.trim()) throw new LoadError('empty');
  const truncated = text.length > MAX_CHARS;
  return { text: truncated ? text.slice(0, MAX_CHARS) : text, truncated };
}
