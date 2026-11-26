// A tiny streaming XML reader for the parts of an .xlsx file. DOMParser would
// be simpler in the browser, but it does not exist in the Node test
// environment, and an event scanner also copes with large sheets.

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decodes &amp; &lt; &#20013; &#x4E2D; … (unknown entities are left as they are). */
export function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, ent: string) => {
    if (ent[0] !== '#') return NAMED[ent] ?? m;
    const hex = ent[1] === 'x' || ent[1] === 'X';
    const code = parseInt(ent.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return m;
    return String.fromCodePoint(code);
  });
}

/** Excel writes control characters in strings as _x000D_ (and a literal "_x" as _x005F_x). */
export function decodeExcelEscapes(s: string): string {
  if (s.indexOf('_x') < 0) return s;
  return s.replace(/_x([0-9a-fA-F]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** "x:row" → "row": some writers put a prefix on every SpreadsheetML element. */
export function localName(name: string): string {
  const i = name.indexOf(':');
  return i < 0 ? name : name.slice(i + 1);
}

export type Attrs = Record<string, string>;

/** Looks an attribute up by its local name, so "r:id" and "id" both work with attr(a, 'id'). */
export function attr(attrs: Attrs, local: string): string | undefined {
  if (local in attrs) return attrs[local];
  for (const key of Object.keys(attrs)) if (localName(key) === local) return attrs[key];
  return undefined;
}

export interface XmlHandler {
  open?(name: string, attrs: Attrs, selfClosing: boolean): void;
  close?(name: string): void;
  text?(text: string): void;
}

const ATTR_RE = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function parseAttrs(src: string): Attrs {
  const out: Attrs = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(src))) out[m[1]] = decodeEntities(m[2] ?? m[3] ?? '');
  return out;
}

/**
 * Walks through an XML document and reports elements (by local name) and text.
 * It trusts the input to be well formed, which Office files are; anything odd is
 * skipped rather than thrown on. DOCTYPEs are ignored, so no entity expansion
 * (and no "billion laughs") can happen.
 */
export function scanXml(xml: string, h: XmlHandler): void {
  const n = xml.length;
  let i = 0;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    const textEnd = lt < 0 ? n : lt;
    if (textEnd > i && h.text) h.text(decodeEntities(xml.slice(i, textEnd)));
    if (lt < 0) break;
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      const stop = end < 0 ? n : end;
      if (h.text) h.text(xml.slice(lt + 9, stop));
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (xml[lt + 1] === '?' || xml[lt + 1] === '!') {
      const end = xml.indexOf('>', lt + 2);
      i = end < 0 ? n : end + 1;
      continue;
    }
    // Find the end of the tag, stepping over quoted attribute values (which may contain ">").
    let j = lt + 1;
    let quote = '';
    for (; j < n; j++) {
      const c = xml[j];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (j >= n) break;
    const inner = xml.slice(lt + 1, j);
    i = j + 1;
    if (inner[0] === '/') {
      h.close?.(localName(inner.slice(1).trim()));
      continue;
    }
    const selfClosing = inner.endsWith('/');
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const sp = body.search(/[\s]/);
    const name = localName(sp < 0 ? body : body.slice(0, sp));
    const attrs = sp < 0 ? {} : parseAttrs(body.slice(sp));
    h.open?.(name, attrs, selfClosing);
    if (selfClosing) h.close?.(name);
  }
}

/**
 * Drops characters XML 1.0 forbids (control characters, U+FFFE/FFFF) and turns
 * unpaired surrogates into U+FFFD. Excel refuses a file with any of these.
 */
export function xmlSafe(s: string): string {
  let out = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        i++;
        continue;
      }
    }
    const surrogate = c >= 0xd800 && c <= 0xdfff;
    const ok = !surrogate && (c === 9 || c === 10 || c === 13 || (c >= 0x20 && c !== 0xfffe && c !== 0xffff));
    if (!ok) {
      out += s.slice(start, i) + (surrogate ? '\ufffd' : '');
      start = i + 1;
    }
  }
  return start === 0 ? s : out + s.slice(start);
}

/** Escapes text for an XML text node or a double-quoted attribute. */
export function escapeXml(s: string): string {
  return xmlSafe(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
