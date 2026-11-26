// Word (.docx) text extraction. word/document.xml is read with a small tag
// scanner instead of DOMParser, so the same code runs in the browser and in
// the unit tests. Pages come from the page breaks Word saves in the file
// (explicit breaks and the "last rendered" page boundaries); without them the
// text is cut into parts, and the demo says "part 3" rather than inventing pages.

import { readZip } from '../../lib/files/zip';
import { splitParts, weightedLength } from './chunk';
import type { PageLabel } from './types';

export interface DocxParagraph {
  /** Text, with "\f" where a page break falls inside the paragraph. */
  text: string;
  heading: boolean;
  /** The paragraph starts on a new page (w:pageBreakBefore). */
  breakBefore: boolean;
  /** A section break that starts a new page follows the paragraph. */
  breakAfter: boolean;
}

export interface DocxScan {
  paragraphs: DocxParagraph[];
  /** Page boundaries Word recorded when it last laid the document out. */
  renderedBreaks: number;
  /** Page breaks typed into the document. */
  explicitBreaks: number;
}

export interface DocxText {
  pages: string[];
  pageLabel: PageLabel;
  headings: string[];
}

const TAG = /<(\/?)([\w.-]+:[\w.-]+|[\w.-]+)((?:\s[^>]*?)?)(\/?)>/g;

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
}

export function decodeXml(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e: string) => {
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'amp') return '&';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

function isHeadingStyle(id: string): boolean {
  return /^(?:heading|title|subtitle)\s*\d*$/i.test(id) || /^[1-9]$/.test(id) || /^标题/.test(id);
}

/** Paragraph texts and break markers of word/document.xml. */
export function scanDocumentXml(xml: string): DocxScan {
  interface Open extends DocxParagraph {
    toc: boolean;
  }
  const paragraphs: DocxParagraph[] = [];
  const stack: Open[] = []; // text boxes nest paragraphs inside paragraphs
  const rows: Array<{ cells: string[]; cell: string[] | null }> = [];
  let inText = false;
  let skip = 0; // inside mc:Fallback (a duplicate of the content for old Word versions)
  let inPPr = 0;
  let inTabs = 0;
  let inSectPr = false;
  let renderedBreaks = 0;
  let explicitBreaks = 0;
  let last = 0;

  const current = (): Open | undefined => stack[stack.length - 1];
  const append = (s: string) => {
    const p = current();
    if (p && !skip) p.text += s;
  };
  const finish = (p: Open) => {
    if (p.toc) return;
    const row = rows[rows.length - 1];
    if (row?.cell) {
      row.cell.push(p.text.replace(/\f/g, ' '));
      return;
    }
    // A table-of-contents line: "第一章 总则 ........ 3"
    if (/(?:[.…·•]{3,}|\t)\s*\d+\s*$/.test(p.text)) return;
    paragraphs.push({ text: p.text, heading: p.heading, breakBefore: p.breakBefore, breakAfter: p.breakAfter });
  };

  for (const m of xml.matchAll(TAG)) {
    const [whole, close, name, attrs, self] = m;
    const at = m.index ?? 0;
    if (inText && at > last) append(decodeXml(xml.slice(last, at)));
    last = at + whole.length;

    switch (name) {
      case 'w:p':
        if (close) {
          const p = stack.pop();
          if (p) finish(p);
        } else if (!self) {
          stack.push({ text: '', heading: false, breakBefore: false, breakAfter: false, toc: false });
        }
        break;
      case 'w:pPr':
        if (!self) inPPr += close ? -1 : 1;
        break;
      case 'w:tabs':
        if (!self) inTabs += close ? -1 : 1;
        break;
      case 'w:pStyle': {
        const val = attr(attrs, 'w:val') ?? '';
        const p = current();
        if (p && inPPr) {
          if (isHeadingStyle(val)) p.heading = true;
          if (/^toc|^目录/i.test(val)) p.toc = true;
        }
        break;
      }
      case 'w:outlineLvl': {
        const p = current();
        const lvl = Number(attr(attrs, 'w:val'));
        if (p && inPPr && lvl >= 0 && lvl <= 8) p.heading = true;
        break;
      }
      case 'w:pageBreakBefore': {
        const p = current();
        const val = attr(attrs, 'w:val');
        if (p && inPPr && val !== '0' && val !== 'false') {
          p.breakBefore = true;
          explicitBreaks++;
        }
        break;
      }
      case 'w:sectPr':
        // Only a section break inside a paragraph splits the text; the body's last sectPr doesn't.
        if (close) inSectPr = false;
        else if (!self && inPPr && current()) {
          inSectPr = true;
          const p = current();
          if (p) p.breakAfter = true;
        }
        break;
      case 'w:type': {
        const p = current();
        const val = attr(attrs, 'w:val');
        if (inSectPr && p && (val === 'continuous' || val === 'nextColumn')) p.breakAfter = false;
        break;
      }
      case 'w:t':
        if (self) break;
        inText = !close;
        break;
      case 'w:tab':
        if (!inTabs && !inPPr) append('\t');
        break;
      case 'w:br': {
        const type = attr(attrs, 'w:type');
        if (type === 'page') {
          append('\f');
          explicitBreaks++;
        } else append(type === 'column' ? ' ' : '\n');
        break;
      }
      case 'w:cr':
        append('\n');
        break;
      case 'w:lastRenderedPageBreak':
        append('\f');
        renderedBreaks++;
        break;
      case 'w:noBreakHyphen':
        append('-');
        break;
      case 'mc:Fallback':
        if (!self) skip += close ? -1 : 1;
        break;
      case 'w:tr':
        if (self) break;
        if (!close) rows.push({ cells: [], cell: null });
        else {
          const row = rows.pop();
          const text = row ? row.cells.filter((c) => c.trim()).join(' | ') : '';
          const outer = rows[rows.length - 1];
          if (outer?.cell) outer.cell.push(text);
          else if (text.trim()) paragraphs.push({ text, heading: false, breakBefore: false, breakAfter: false });
        }
        break;
      case 'w:tc': {
        const row = rows[rows.length - 1];
        if (!row || self) break;
        if (!close) row.cell = [];
        else {
          row.cells.push((row.cell ?? []).join(' ').trim());
          row.cell = null;
        }
        break;
      }
      default:
        break;
    }
  }
  return { paragraphs, renderedBreaks, explicitBreaks };
}

/** Roughly how much text fits on a printed page (weighted: a Chinese character counts 2.4). */
const PAGE_CAPACITY = 3500;

/** Turns paragraphs into pages (when the breaks are trustworthy) or parts. */
export function docxToPages(scan: DocxScan): DocxText {
  const pages: string[] = [];
  let lines: string[] = [];
  let line = '';
  const headings: string[] = [];
  const newPage = () => {
    if (line) {
      lines.push(line);
      line = '';
    }
    const text = cleanLines(lines);
    if (text) pages.push(text);
    lines = [];
  };

  for (const p of scan.paragraphs) {
    if (p.breakBefore) newPage();
    const pieces = p.text.split('\f');
    pieces.forEach((piece, i) => {
      if (i > 0) newPage();
      line += piece;
    });
    lines.push(line);
    line = '';
    if (p.heading) {
      const h = p.text.replace(/\f/g, '').replace(/\s+/g, ' ').trim();
      if (h && h.length <= 60) headings.push(h);
    }
    if (p.breakAfter) newPage();
  }
  newPage();

  const breaks = scan.renderedBreaks + scan.explicitBreaks;
  const plausible = pages.every((t) => weightedLength(t) <= PAGE_CAPACITY * 1.6);
  if (pages.length > 1 && breaks > 0 && (scan.renderedBreaks > 0 || plausible)) return { pages, pageLabel: 'page', headings };
  return { pages: splitParts(pages.join('\n')), pageLabel: 'part', headings };
}

function cleanLines(lines: string[]): string {
  return lines
    .map((l) => l.replace(/\t+/g, ' ').replace(/[ \xa0]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class DocxError extends Error {
  code: 'not_docx' | 'empty';
  constructor(code: DocxError['code']) {
    super(code);
    this.name = 'DocxError';
    this.code = code;
  }
}

/** Reads the text of a .docx file. Throws DocxError or ZipError for files it can't read. */
export async function parseDocx(bytes: Uint8Array): Promise<DocxText> {
  const files = await readZip(bytes, (name) => name === 'word/document.xml');
  const xml = files.get('word/document.xml');
  if (!xml) throw new DocxError('not_docx');
  const result = docxToPages(scanDocumentXml(new TextDecoder('utf-8').decode(xml)));
  if (!result.pages.some((p) => p.trim())) throw new DocxError('empty');
  return result;
}
