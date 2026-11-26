// Splitting text: pages into sentences, sentences into passages of about
// 200–450 characters (the unit that gets searched and cited), and long texts
// without real pages into "parts". All offsets point into the page text, so a
// citation can highlight exactly what was quoted.

import { foldCode, hasCjk, isCjk, normalizeCjkForms } from './tokenize';

export interface Span {
  start: number;
  end: number;
}

export interface Sentence extends Span {
  /** A short line without closing punctuation: a section title rather than prose. */
  heading: boolean;
}

export interface Passage extends Span {
  /** The section title this passage sits under (helps "what does the policy say about hotels"). */
  heading: string;
}

const NBSP = String.fromCharCode(0xa0);
const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);
const CJK_END = new Set(['。', '！', '？', '；', '…']);
const CLOSERS = new Set(['”', '’', '」', '』', '）', ')', '】', ']', '"', "'", '》']);
const LATIN_END = new Set(['.', '!', '?', ';']);
// Abbreviations whose dot ends a sentence only when a capital letter follows.
const ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'vs', 'no', 'nos', 'approx', 'ext', 'fig', 'sec', 'p', 'pp', 'incl', 'dept', 'tel', 'min', 'max', 'mr', 'mrs', 'ms', 'dr', 'st', 'co', 'ltd', 'inc']);

function isSpace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === NBSP || ch === IDEOGRAPHIC_SPACE;
}

/** "2. Hotels", "第三条 住宿标准", "## Overview", "三、不在保修范围内的情况" */
const NUMBERED = /^(?:#{1,6}\s|第[一二三四五六七八九十百零〇\d]+[章节条部分篇]|[一二三四五六七八九十]+[、.．]|\(?[0-9]{1,2}(?:\.[0-9]{1,2})*[.)、．]?\s|[A-Z]\.\s)/;

/** True for a line that reads like a title: short and without closing punctuation. */
export function isHeadingLine(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  if (/^#{1,6}\s/.test(s)) return true;
  if (/[。.！!？?；;，,：:、]$/.test(s)) return false;
  if (!/[\p{L}]/u.test(s)) return false;
  const cjk = hasCjk(s);
  const limit = cjk ? 30 : 70;
  if (s.length > limit) return false;
  // "- Daily: check the oil" is a list item, not a title.
  if (/^[-•·*–]\s/.test(s)) return false;
  if (/[:：]/.test(s) && !NUMBERED.test(s)) return false;
  return true;
}

/** The heading text without its numbering: "第三条 住宿标准" → "住宿标准". */
export function headingText(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^第[一二三四五六七八九十百零〇\d]+[章节条部分篇]\s*/, '')
    .replace(/^[一二三四五六七八九十]+[、.．]\s*/, '')
    .replace(/^\(?[0-9]{1,2}(?:\.[0-9]{1,2})*[.)、．]?\s+/, '')
    .replace(/^[A-Z]\.\s+/, '')
    .trim();
}

/** Line-start list markers like "1." or "(b)" whose dot is not a full stop. */
function isListMarker(text: string, lineStart: number, dot: number): boolean {
  const before = text.slice(lineStart, dot).trim();
  return /^(?:\(?\d{1,2}(?:\.\d{1,2})*|\(?[a-zA-Z]|[ivxIVX]{1,4})$/.test(before);
}

function wordBefore(text: string, at: number): string {
  let k = at;
  while (k > 0 && /[A-Za-z.]/.test(text[k - 1])) k--;
  return text.slice(k, at).toLowerCase();
}

/**
 * Splits a page into sentences. Every line break ends a sentence too.
 * Semicolons split as well for chunking; quotes keep "…; …" clauses together
 * (`semicolons: false`) so a quote never stops halfway through a rule.
 */
export function splitSentences(text: string, semicolons = true): Sentence[] {
  const out: Sentence[] = [];
  const n = text.length;
  let start = 0;
  let lineStart = 0;

  const push = (from: number, to: number) => {
    let a = from;
    let b = to;
    while (a < b && (isSpace(text[a]) || text[a] === '\n' || text[a] === '\r')) a++;
    while (b > a && (isSpace(text[b - 1]) || text[b - 1] === '\n' || text[b - 1] === '\r')) b--;
    if (b > a) out.push({ start: a, end: b, heading: false });
  };

  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (ch === '\n') {
      push(start, i);
      start = i + 1;
      lineStart = i + 1;
      continue;
    }
    let end = -1;
    if (!semicolons && (ch === '；' || ch === ';')) continue;
    if (CJK_END.has(ch)) end = i + 1;
    else if (LATIN_END.has(ch)) {
      const next = text[i + 1];
      const nextIsBreak = next === undefined || isSpace(next) || next === '\n' || CLOSERS.has(next) || isCjk(next.charCodeAt(0));
      if (nextIsBreak && (ch !== '.' || !isListMarker(text, lineStart, i))) {
        end = i + 1;
        if (ch === '.') {
          // "ext. 8100", "Co. (sample)": an abbreviation, unless a capital letter starts the next sentence.
          let k = i + 1;
          while (k < n && (isSpace(text[k]) || CLOSERS.has(text[k]))) k++;
          const word = wordBefore(text, i).replace(/\.$/, '');
          if (ABBREVIATIONS.has(word) && !/[A-Z]/.test(text[k] ?? '')) end = -1;
        }
      }
    }
    if (end > 0) {
      while (end < n && (CLOSERS.has(text[end]) || CJK_END.has(text[end]))) end++;
      push(start, end);
      start = end;
      i = end - 1;
    }
  }
  push(start, n);

  // A sentence that is a whole line and reads like a title is a heading.
  for (const s of out) {
    const ls = text.lastIndexOf('\n', s.start - 1) + 1;
    let le = text.indexOf('\n', s.end);
    if (le < 0) le = n;
    const wholeLine = text.slice(ls, s.start).trim() === '' && text.slice(s.end, le).trim() === '';
    s.heading = wholeLine && isHeadingLine(text.slice(s.start, s.end));
  }
  return out;
}

/** Length that counts a Chinese character like about two and a half Latin letters. */
export function weightedLength(text: string, from = 0, to = text.length): number {
  let w = 0;
  for (let i = from; i < to; i++) w += isCjk(text.charCodeAt(i)) ? 2.4 : 1;
  return w;
}

export interface ChunkOptions {
  min: number;
  max: number;
}

const DEFAULT_CHUNK: ChunkOptions = { min: 200, max: 450 };

/**
 * Packs sentences into passages of roughly min…max characters, starting a new
 * passage at headings and carrying the last sentence over (a small overlap) so
 * an answer that straddles two passages is still found whole in one of them.
 */
export function chunkPage(text: string, opts: ChunkOptions = DEFAULT_CHUNK): Passage[] {
  const passages: Passage[] = [];
  // Chinese packs more meaning per character, so it counts a little more towards the size.
  const len = (s: Span) => {
    const raw = s.end - s.start;
    return hasCjk(text.slice(s.start, s.end)) ? raw * 1.6 : raw;
  };

  let section = '';
  let cur: Sentence[] = [];
  let curLen = 0;
  let curSection = '';

  const flush = (carry: boolean) => {
    if (!cur.length) return;
    passages.push({ start: cur[0].start, end: cur[cur.length - 1].end, heading: curSection });
    const last = cur[cur.length - 1];
    if (carry && cur.length > 1 && !last.heading && len(last) <= opts.max * 0.35) {
      cur = [last];
      curLen = len(last);
    } else {
      cur = [];
      curLen = 0;
    }
    curSection = section;
  };

  for (const sentence of splitSentences(text)) {
    for (const s of splitLong(text, sentence, opts.max)) {
      const l = len(s);
      if (s.heading) {
        if (cur.some((c) => !c.heading)) flush(false);
        section = headingText(text.slice(s.start, s.end));
        if (cur.every((c) => c.heading)) curSection = section;
      } else if (cur.length && curLen + l > opts.max && curLen >= opts.min * 0.5) {
        flush(true);
      }
      if (!cur.length) curSection = section;
      cur.push(s);
      curLen += l;
    }
  }
  flush(false);

  // A carried-over sentence followed by a heading would make a passage that is
  // only a copy of the previous one's end: drop passages inside the previous one.
  return passages.filter((p, i) => i === 0 || !(p.start >= passages[i - 1].start && p.end <= passages[i - 1].end));
}

/** Cuts a very long sentence (a table row, a PDF line with no punctuation) at commas or spaces. */
function splitLong(text: string, s: Sentence, max: number): Sentence[] {
  const limit = hasCjk(text.slice(s.start, s.end)) ? Math.round(max / 1.6) : max;
  if (s.end - s.start <= limit * 1.4) return [s];
  const out: Sentence[] = [];
  let a = s.start;
  while (s.end - a > limit * 1.4) {
    let cut = -1;
    for (let k = a + limit; k > a + limit * 0.5; k--) {
      const ch = text[k];
      if (ch === '，' || ch === '、' || ch === ',' || ch === '：' || ch === ':') {
        cut = k + 1;
        break;
      }
      if (cut < 0 && isSpace(ch)) cut = k;
    }
    if (cut < 0) cut = a + limit;
    out.push({ start: a, end: cut, heading: false });
    a = cut;
    while (a < s.end && isSpace(text[a])) a++;
  }
  if (a < s.end) out.push({ start: a, end: s.end, heading: false });
  return out;
}

// ---------- PDF lines → paragraphs ----------

export interface PdfLine {
  text: string;
  /** Baseline position (PDF units, larger is higher on the page), if known. */
  y?: number;
  /** Font size of the line, if known. */
  size?: number;
}

const LIST_START = /^(?:\d{1,2}(?:\.\d{1,2})*[.、)．]\s?|[（(]\d{1,2}[)）]|[一二三四五六七八九十]+[、.．]|第[一二三四五六七八九十百\d]+[章节条]|[•·\-–—*▪●]\s|[a-zA-Z][.)]\s)/;

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * PDF text comes as visual lines; sentences run across them. Lines are joined
 * back into paragraphs unless the line is short (a paragraph's last line or a
 * title), the next line starts a list item, or there's a bigger vertical gap.
 */
export function reflowLines(lines: PdfLine[]): string {
  const rows = lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text);
  if (!rows.length) return '';
  const typical = median(rows.filter((r) => r.text.length >= 8).map((r) => weightedLength(r.text))) || 1;
  const gaps: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].y;
    const b = rows[i].y;
    if (a !== undefined && b !== undefined && a > b) gaps.push(a - b);
  }
  const lineGap = median(gaps);

  let out = rows[0].text;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    const prevLen = weightedLength(prev.text);
    const gap = prev.y !== undefined && cur.y !== undefined ? prev.y - cur.y : 0;
    const bigGap = lineGap > 0 && (gap > lineGap * 1.45 || gap < 0);
    const shortLine = prevLen < typical * 0.72;
    const sizeChange = prev.size && cur.size ? Math.abs(prev.size - cur.size) > Math.max(prev.size, cur.size) * 0.15 : false;
    // "infor-" + "mation": a word broken across lines always continues.
    const hyphenated = /[a-z]-$/.test(prev.text) && /^[a-z]/.test(cur.text);
    const titleLine = isHeadingLine(cur.text) && weightedLength(cur.text) < typical * 0.6;
    const newBlock = !hyphenated && (bigGap || shortLine || sizeChange || titleLine || LIST_START.test(cur.text));
    if (newBlock) {
      out += `\n${cur.text}`;
      continue;
    }
    const a = prev.text[prev.text.length - 1];
    const b = cur.text[0];
    if (a === '-' && /[a-z]/.test(prev.text[prev.text.length - 2] ?? '') && /[a-z]/.test(b)) {
      out = out.slice(0, -1) + cur.text; // re-join a hyphenated word
    } else if (isCjk(a.charCodeAt(0)) || isCjk(b.charCodeAt(0)) || /[，。、；：！？（）]/.test(a)) {
      out += cur.text;
    } else {
      out += ` ${cur.text}`;
    }
  }
  return out;
}

/** The parts of a pdf.js text item this demo uses. */
export interface PdfTextItem {
  str: string;
  hasEOL: boolean;
  /** [a, b, c, d, e, f]: d is about the font size, f the baseline position. */
  transform: number[];
  height?: number;
}

/** One PDF page's text items → readable page text (lines rejoined into paragraphs). */
export function pdfItemsToText(items: PdfTextItem[]): string {
  const lines: PdfLine[] = [];
  let text = '';
  let y: number | undefined;
  let size: number | undefined;
  for (const item of items) {
    if (!text.trim() && item.str.trim()) {
      y = Number(item.transform[5]);
      size = Math.abs(Number(item.transform[3])) || item.height || undefined;
    }
    // Before rejoining lines: a look-alike "⼆、" would hide a numbered heading.
    text += normalizeCjkForms(item.str);
    if (item.hasEOL) {
      lines.push({ text, y, size });
      text = '';
      y = undefined;
    }
  }
  if (text) lines.push({ text, y, size });
  return tightenCjkSpacing(reflowLines(lines));
}

/**
 * Removes the spaces some PDFs put between every Chinese character ("员 工 手 册"),
 * line by line, and only where most characters are spaced out: a normal
 * "第三条 住宿标准" keeps its space.
 */
export function tightenCjkSpacing(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      let cjk = 0;
      let spaced = 0;
      for (let i = 0; i < line.length; i++) {
        if (!isCjk(line.charCodeAt(i))) continue;
        cjk++;
        if ((line[i + 1] === ' ' || line[i + 1] === IDEOGRAPHIC_SPACE) && i + 2 < line.length && isCjk(foldCode(line.charCodeAt(i + 2)))) spaced++;
      }
      if (cjk < 4 || spaced < cjk * 0.5) return line;
      let out = '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if ((ch === ' ' || ch === IDEOGRAPHIC_SPACE) && i > 0 && i + 1 < line.length && isCjk(line.charCodeAt(i - 1)) && isCjk(line.charCodeAt(i + 1))) continue;
        out += ch;
      }
      return out;
    })
    .join('\n');
}

// ---------- long texts without pages → parts ----------

/**
 * Splits a long text into parts of about `target` weighted characters at
 * paragraph boundaries, preferring to start a part at a heading. Used when a
 * file has no real pages (TXT, Markdown, Word without page breaks); the parts
 * are then cited as "part 3", never as "page 3".
 */
export function splitParts(text: string, target = 2200): string[] {
  const paras: string[] = [];
  for (const p of text.split(/\n/)) {
    if (weightedLength(p) <= target * 1.5) {
      paras.push(p);
      continue;
    }
    // One enormous paragraph (a TXT file without line breaks): cut it between sentences.
    let piece = '';
    for (const s of splitSentences(p)) {
      const sentence = p.slice(s.start, s.end);
      if (piece && weightedLength(piece) + weightedLength(sentence) > target) {
        paras.push(piece);
        piece = '';
      }
      piece += (piece ? ' ' : '') + sentence;
    }
    if (piece) paras.push(piece);
  }

  const parts: string[] = [];
  let cur: string[] = [];
  let curLen = 0;
  for (const p of paras) {
    const l = weightedLength(p) + 1;
    if (cur.length && ((curLen >= target * 0.6 && isHeadingLine(p)) || curLen + l > target * 1.35)) {
      parts.push(cur.join('\n').trim());
      cur = [];
      curLen = 0;
    }
    cur.push(p);
    curLen += l;
  }
  if (cur.length) parts.push(cur.join('\n').trim());
  return parts.filter((p) => p.length > 0);
}

/** Line spans of a page (for the viewer, which renders line by line). */
export function lineSpans(text: string): Span[] {
  const out: Span[] = [];
  let a = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      out.push({ start: a, end: i });
      a = i + 1;
    }
  }
  return out;
}
