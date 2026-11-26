// Turns the editor text into paragraphs: "# " lines are headings (each one
// starts a new article), 【…】 marks an annotation. No React, no DOM, so all of
// it is unit tested.

export type Inline = { kind: 'text'; text: string } | { kind: 'note'; text: string };

export interface Para {
  kind: 'heading' | 'para';
  inlines: Inline[];
  /** 1-based line in the editor, for pointing at problems. */
  line: number;
}

export interface Article {
  /** Heading text without annotations; null for text before the first heading. */
  title: string | null;
  paras: Para[];
}

export type WarningCode = 'unclosed' | 'stray_close' | 'empty';

export interface ParseWarning {
  code: WarningCode;
  line: number;
}

export interface ParsedDoc {
  paras: Para[];
  articles: Article[];
  warnings: ParseWarning[];
  notes: number;
}

export const OPEN = '【';
export const CLOSE = '】';

/**
 * Splits one line into plain text and annotations. Brackets nest: in
 * 【a【b】c】 the whole outer pair is one annotation. A 【 that is never closed,
 * a 】 that was never opened and an empty 【】 stay as plain text, each with a
 * warning, so nothing the visitor typed disappears.
 */
export function parseInline(text: string, line: number, warnings: ParseWarning[] = []): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ kind: 'text', text: plain });
    plain = '';
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === OPEN) {
      let depth = 0;
      let j = i;
      for (; j < text.length; j++) {
        if (text[j] === OPEN) depth++;
        else if (text[j] === CLOSE && --depth === 0) break;
      }
      if (j >= text.length) {
        warnings.push({ code: 'unclosed', line });
        plain += ch;
        i++;
        continue;
      }
      const inner = text.slice(i + 1, j);
      if (!inner.trim()) {
        warnings.push({ code: 'empty', line });
        plain += text.slice(i, j + 1);
      } else {
        flush();
        out.push({ kind: 'note', text: inner });
      }
      i = j + 1;
      continue;
    }
    if (ch === CLOSE) warnings.push({ code: 'stray_close', line });
    plain += ch;
    i++;
  }
  flush();
  return out;
}

/** "# Title" or "＃ 标题" (full-width, as a Chinese keyboard types it). */
const HEADING = /^[#＃]\s+(.*)$/;

export function parseDocument(text: string): ParsedDoc {
  const paras: Para[] = [];
  const warnings: ParseWarning[] = [];
  text.split(/\r\n|\r|\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const heading = HEADING.exec(trimmed);
    if (heading) {
      const title = heading[1].trim();
      if (title) paras.push({ kind: 'heading', inlines: parseInline(title, line, warnings), line });
      return;
    }
    paras.push({ kind: 'para', inlines: parseInline(trimmed, line, warnings), line });
  });

  const articles: Article[] = [];
  for (const p of paras) {
    if (p.kind === 'heading' || !articles.length)
      articles.push({ title: p.kind === 'heading' ? plainTitle(p) : null, paras: [] });
    articles[articles.length - 1].paras.push(p);
  }
  const notes = paras.reduce((n, p) => n + p.inlines.filter((i) => i.kind === 'note').length, 0);
  return { paras, articles, warnings, notes };
}

/** A heading's text without its annotations (for file names); all of it if that leaves nothing. */
export function plainTitle(p: Para): string {
  const plain = p.inlines
    .filter((i) => i.kind === 'text')
    .map((i) => i.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return (
    plain ||
    p.inlines
      .map((i) => i.text)
      .join('')
      .trim()
  );
}

/** The text of an inline as it ends up in the document. */
export function inlineText(i: Inline, keepBrackets: boolean): string {
  return i.kind === 'note' && keepBrackets ? `${OPEN}${i.text}${CLOSE}` : i.text;
}
