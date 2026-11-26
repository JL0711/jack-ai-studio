// PDF text extraction with pdf.js. This module is imported only when a visitor
// adds a PDF, so pdf.js (and its worker) stay out of the demo's first download.
//
// The legacy build is used because the modern one needs Promise.withResolvers
// and friends (Safari 17.4+); the site supports Safari 16 and older in-app
// browsers. Chinese PDFs that rely on Adobe's predefined CMaps (common in
// files made by Chinese office software) need those CMap files to map glyphs
// to text: the GB/CNS ones are bundled here as static assets and fetched from
// this site only when a PDF asks for one.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { headingText, isHeadingLine, pdfItemsToText, type PdfTextItem } from './chunk';
import { ParseError, type ParseHooks } from './parse';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const CMAP_FILES = import.meta.glob(
  [
    '/node_modules/pdfjs-dist/cmaps/Adobe-*-UCS2.bcmap',
    '/node_modules/pdfjs-dist/cmaps/Adobe-GB1-*.bcmap',
    '/node_modules/pdfjs-dist/cmaps/Adobe-CNS1-*.bcmap',
    '/node_modules/pdfjs-dist/cmaps/UniGB-*.bcmap',
    '/node_modules/pdfjs-dist/cmaps/UniCNS-*.bcmap',
    '/node_modules/pdfjs-dist/cmaps/GB*.bcmap',
    '/node_modules/pdfjs-dist/cmaps/B5*.bcmap',
    '/node_modules/pdfjs-dist/cmaps/ETen*.bcmap',
    '/node_modules/pdfjs-dist/cmaps/ETHK*.bcmap',
    '/node_modules/pdfjs-dist/cmaps/CNS*.bcmap',
    '/node_modules/pdfjs-dist/cmaps/HK*.bcmap',
  ],
  { query: '?url', import: 'default', eager: true, exhaustive: true },
) as Record<string, string>;

const CMAP_URLS = new Map<string, string>();
for (const [path, url] of Object.entries(CMAP_FILES)) {
  const name = /([^/]+)\.bcmap$/.exec(path)?.[1];
  if (name) CMAP_URLS.set(name, url);
}

/** Gives pdf.js the bundled CMap files (it asks by name, e.g. "UniGB-UCS2-H"). */
class BundledCMapReaderFactory {
  constructor(_options: { baseUrl?: string | null; isCompressed?: boolean }) {}

  async fetch({ name }: { name: string }): Promise<{ cMapData: Uint8Array; isCompressed: boolean }> {
    const url = CMAP_URLS.get(name);
    if (!url) throw new Error(`CMap "${name}" is not bundled`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CMap "${name}": HTTP ${res.status}`);
    return { cMapData: new Uint8Array(await res.arrayBuffer()), isCompressed: true };
  }
}

let sharedWorker: pdfjs.PDFWorker | null = null;

/** One worker for all PDFs of the session (starting one per file costs time). */
function worker(): pdfjs.PDFWorker {
  if (!sharedWorker || sharedWorker.destroyed) sharedWorker = new pdfjs.PDFWorker();
  return sharedWorker;
}

/** Stops the pdf.js worker (when the demo is closed). */
export function disposePdf(): void {
  sharedWorker?.destroy();
  sharedWorker = null;
}

export interface PdfText {
  pages: string[];
  headings: string[];
  /** Pages without any text layer (scanned images). */
  emptyPages: number;
}

function errorName(e: unknown): string {
  return e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
}

/** Extracts the text of every page. Throws ParseError('encrypted' | 'scanned' | 'corrupt' | 'cancelled'). */
export async function extractPdf(bytes: Uint8Array, hooks: ParseHooks = {}): Promise<PdfText> {
  const task = pdfjs.getDocument({
    data: bytes,
    worker: worker(),
    CMapReaderFactory: BundledCMapReaderFactory,
    cMapPacked: true,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    disableAutoFetch: true,
    disableStream: true,
    verbosity: 0,
  });
  let doc: pdfjs.PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy().catch(() => undefined);
    const name = errorName(e);
    if (name === 'PasswordException') throw new ParseError('encrypted');
    throw new ParseError('corrupt', e instanceof Error ? e.message : String(e));
  }

  try {
    const pages: string[] = [];
    const headings: string[] = [];
    let emptyPages = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      if (hooks.cancelled?.()) throw new ParseError('cancelled');
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const item of content.items) {
        if ('str' in item) items.push({ str: item.str, hasEOL: item.hasEOL, transform: item.transform.map(Number), height: item.height });
      }
      page.cleanup();

      const pageText = pdfItemsToText(items);
      if (pageText.replace(/\s/g, '').length < 3) emptyPages++;
      pages.push(pageText);
      for (const line of pageText.split('\n')) {
        if (headings.length < 200 && isHeadingLine(line) && line.trim().length >= 2) headings.push(headingText(line));
      }
      hooks.onProgress?.(n, doc.numPages);
    }
    if (emptyPages === pages.length) throw new ParseError('scanned');
    return { pages, headings, emptyPages };
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}
