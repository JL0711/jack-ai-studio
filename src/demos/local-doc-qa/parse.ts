// Reading a visitor's file into pages of text, in the browser. PDF support
// (pdf.js) is downloaded only when the first PDF is added.

import { readFileBytes, decodeText } from '../../lib/files/download';
import { ZipError } from '../../lib/files/zip';
import { headingText, isHeadingLine, reflowLines, splitParts } from './chunk';
import { DocxError, parseDocx } from './docx';
import { normalizeCjkForms } from './tokenize';
import type { DocKind, PageLabel } from './types';

export const LIMITS = {
  files: 40,
  bytes: 25 * 1024 * 1024,
  /** Characters across all uploaded files (about 1,000 pages of Chinese text). */
  chars: 2_000_000,
};

export type ParseErrorCode =
  | 'too_big'
  | 'unsupported'
  | 'old_word'
  | 'encrypted'
  | 'scanned'
  | 'empty'
  | 'corrupt'
  | 'pdf_engine'
  | 'cancelled';

export class ParseError extends Error {
  code: ParseErrorCode;
  constructor(code: ParseErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ParseError';
    this.code = code;
  }
}

export interface Parsed {
  kind: FileKind;
  pages: string[];
  pageLabel: PageLabel;
  /** Word pages taken from the page breaks in the file. */
  approxPages?: boolean;
  /** Section titles (for suggesting questions). */
  headings: string[];
  /** PDF pages that had no text layer (scanned pages). */
  emptyPages?: number;
}

export type FileKind = Exclude<DocKind, 'sample'>;

export interface ParseHooks {
  onProgress?: (done: number, total: number) => void;
  cancelled?: () => boolean;
}

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

/** What a file is, from its name and first bytes (a renamed file is still recognised). */
export function detectKind(name: string, head: Uint8Array): FileKind | 'doc' | 'unknown' {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  let pdfAt = -1;
  for (let i = 0; i + 4 < Math.min(head.length, 1024); i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) {
      pdfAt = i;
      break;
    }
  }
  if (pdfAt >= 0) return 'pdf';
  // Old Word (.doc), and password-protected .docx files, are OLE containers.
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'doc';
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return ext === 'docx' || ext === 'docm' || ext === 'dotx' || ext === '' ? 'docx' : 'unknown';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'txt' || ext === 'text' || ext === 'log' || ext === 'csv') return looksLikeText(head) ? 'txt' : 'unknown';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'doc' || ext === 'wps') return 'doc';
  return 'unknown';
}

function looksLikeText(head: Uint8Array): boolean {
  if (head[0] === 0xff && head[1] === 0xfe) return true;
  if (head[0] === 0xfe && head[1] === 0xff) return true;
  let zeros = 0;
  for (let i = 0; i < head.length; i++) if (head[i] === 0) zeros++;
  return zeros <= head.length * 0.01;
}

/** Markdown to readable text: headings without #, links and emphasis unwrapped. */
export function cleanMarkdown(md: string): { text: string; headings: string[] } {
  const src = md.replace(/^---\n[\s\S]*?\n---\n/, '');
  const out: string[] = [];
  const headings: string[] = [];
  let fence = false;
  for (const raw of src.split('\n')) {
    if (/^\s*(?:```|~~~)/.test(raw)) {
      fence = !fence;
      continue;
    }
    if (fence) {
      out.push(raw);
      continue;
    }
    const h = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(raw);
    if (h) {
      const title = unwrapInline(h[1]);
      if (title) {
        headings.push(title);
        out.push(title);
      }
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(raw)) continue; // horizontal rule
    if (/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(raw)) continue; // table separator row
    let line = raw.replace(/^\s{0,3}>\s?/, '');
    if (/^\s*\|.*\|\s*$/.test(line)) {
      line = line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim())
        .join(' | ');
    }
    out.push(unwrapInline(line));
  }
  return { text: out.join('\n'), headings };
}

function unwrapInline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** True when most lines are cut at about the same length (a hard-wrapped .txt). */
function hardWrapped(lines: string[]): boolean {
  const lens = lines.map((l) => l.trim().length).filter((n) => n > 0);
  if (lens.length < 8) return false;
  const sorted = [...lens].sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length * 0.75)];
  if (typical < 40) return false;
  const near = lens.filter((n) => n >= typical * 0.8 && n <= typical * 1.1).length;
  return near >= lens.length * 0.5;
}

/** Title-like lines of a text (short, no closing punctuation), without their numbering. */
export function headingsFromText(pages: string[], max = 200): string[] {
  const out: string[] = [];
  for (const page of pages) {
    for (const line of page.split('\n')) {
      if (out.length >= max) return out;
      if (isHeadingLine(line) && line.trim().length >= 2) out.push(headingText(line));
    }
  }
  return out;
}

/** Plain text or Markdown into pages (form feeds) or parts. */
export function textToPages(raw: string, kind: 'txt' | 'md'): Parsed {
  let text = raw.replace(/\r\n?/g, '\n');
  let headings: string[] = [];
  if (kind === 'md') {
    const md = cleanMarkdown(text);
    text = md.text;
    headings = md.headings;
  }
  const tidy = (t: string) => {
    const lines = t.split('\n');
    if (kind === 'txt' && hardWrapped(lines)) {
      // Re-join hard-wrapped lines into paragraphs (blank lines still separate them).
      return t
        .split(/\n\s*\n/)
        .map((block) => reflowLines(block.split('\n').map((l) => ({ text: l }))))
        .filter(Boolean)
        .join('\n');
    }
    return lines
      .map((l) => l.replace(/\s+$/, ''))
      .filter((l) => l.trim())
      .join('\n');
  };
  if (kind === 'txt') headings = headingsFromText([text]);
  if (text.includes('\f')) {
    const pages = text.split('\f').map(tidy);
    if (pages.some((p) => p.trim())) return { kind, pages: pages.map((p) => p || ' '), pageLabel: 'page', headings };
  }
  const body = tidy(text);
  return { kind, pages: splitParts(body), pageLabel: 'part', headings };
}

/** Reads one file into pages of text. Throws ParseError with a reason the UI can explain. */
export async function parseFile(file: File, hooks: ParseHooks = {}): Promise<Parsed> {
  const parsed = await readPages(file, hooks);
  return { ...parsed, pages: parsed.pages.map(normalizeCjkForms), headings: parsed.headings.map((h) => headingText(normalizeCjkForms(h))) };
}

async function readPages(file: File, hooks: ParseHooks): Promise<Parsed> {
  if (file.size > LIMITS.bytes) throw new ParseError('too_big');
  if (file.size === 0) throw new ParseError('empty');
  const head = await readFileBytes(file.slice(0, 1024));
  const kind = detectKind(file.name, head);
  if (kind === 'doc') throw new ParseError('old_word');
  if (kind === 'unknown') throw new ParseError('unsupported');
  if (hooks.cancelled?.()) throw new ParseError('cancelled');
  const bytes = await readFileBytes(file);

  if (kind === 'pdf') {
    let mod: PdfModule;
    try {
      mod = await import('./pdf');
      pdfModule = mod;
    } catch {
      throw new ParseError('pdf_engine');
    }
    const result = await mod.extractPdf(bytes, hooks);
    return { kind, pages: result.pages, pageLabel: 'page', headings: result.headings, emptyPages: result.emptyPages };
  }

  if (kind === 'docx') {
    try {
      const doc = await parseDocx(bytes);
      // Many Word files use bold text instead of heading styles: fall back to title-like lines.
      const headings = doc.headings.length ? doc.headings : headingsFromText(doc.pages);
      return { kind, pages: doc.pages, pageLabel: doc.pageLabel, approxPages: doc.pageLabel === 'page', headings };
    } catch (e) {
      if (e instanceof DocxError) throw new ParseError(e.code === 'empty' ? 'empty' : 'corrupt');
      if (e instanceof ZipError) throw new ParseError(e.code === 'encrypted' ? 'encrypted' : 'corrupt');
      throw new ParseError('corrupt');
    }
  }

  const text = decodeText(bytes);
  const parsed = textToPages(text, kind);
  if (!parsed.pages.some((p) => p.trim())) throw new ParseError('empty');
  return parsed;
}

type PdfModule = typeof import('./pdf');
let pdfModule: PdfModule | null = null;

/** True once pdf.js has been downloaded in this session. */
export function pdfReaderLoaded(): boolean {
  return pdfModule !== null;
}

/** Stops the pdf.js worker if it was ever started (never downloads pdf.js just to stop it). */
export function disposePdfReader(): void {
  pdfModule?.disposePdf();
}

export function fileKindOf(name: string): FileKind | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'txt') return 'txt';
  return null;
}
