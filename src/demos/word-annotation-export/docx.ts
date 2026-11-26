// Writing a real .docx (WordprocessingML in a ZIP) and reading the text back
// out of one. The writer produces the smallest package Word, WPS, LibreOffice
// and Pages open without a repair prompt: every part is listed in
// [Content_Types].xml, styles and settings are linked from the document, and
// child elements appear in the order the OOXML schema requires.

import { ZipError, createZip, extractEntry, listZip, type ZipEntry } from '../../lib/files/zip';
import { inlineText, OPEN, CLOSE, type Para } from './parse';
import { attr, escapeXml, scanXml } from './xml';

// ---------- options ----------

export type HighlightKey = 'yellow' | 'green' | 'cyan';
/** Word's own highlight colours (ST_HighlightColor), for the preview. */
export const HIGHLIGHT_CSS: Record<HighlightKey, string> = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff' };
export const HIGHLIGHTS: HighlightKey[] = ['yellow', 'green', 'cyan'];

export type FontKey = 'songti' | 'fangsong' | 'yahei' | 'calibri' | 'times';
export const FONT_KEYS: FontKey[] = ['songti', 'fangsong', 'yahei', 'calibri', 'times'];

export interface FontPreset {
  /** Latin text. */
  ascii: string;
  /** Chinese text. */
  eastAsia: string;
  /** Chinese layout: two-character first-line indent, justified, centred headings. */
  chinese: boolean;
  /** Body size in half-points (24 = 12 pt). */
  size: number;
  /** The closest fonts a browser has, for the preview. */
  css: string;
}

export const FONTS: Record<FontKey, FontPreset> = {
  songti: {
    ascii: 'Times New Roman',
    eastAsia: '宋体',
    chinese: true,
    size: 24,
    css: '"Times New Roman", "Songti SC", STSong, SimSun, "Noto Serif CJK SC", "Source Han Serif SC", serif',
  },
  fangsong: {
    ascii: 'Times New Roman',
    eastAsia: '仿宋',
    chinese: true,
    size: 24,
    css: '"Times New Roman", FangSong, STFangsong, "FangSong_GB2312", "Songti SC", SimSun, serif',
  },
  yahei: {
    ascii: 'Calibri',
    eastAsia: '微软雅黑',
    chinese: true,
    size: 24,
    css: 'Calibri, Carlito, "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif',
  },
  calibri: {
    ascii: 'Calibri',
    eastAsia: 'Microsoft YaHei',
    chinese: false,
    size: 22,
    css: 'Calibri, Carlito, "Segoe UI", "Helvetica Neue", Arial, "PingFang SC", sans-serif',
  },
  times: {
    ascii: 'Times New Roman',
    eastAsia: 'SimSun',
    chinese: false,
    size: 24,
    css: '"Times New Roman", Times, "Songti SC", SimSun, serif',
  },
};

export interface DocxOptions {
  keepBrackets: boolean;
  highlight: HighlightKey;
  font: FontKey;
  /** Shown as the document title in Word's file properties. */
  title: string;
}

// ---------- writing ----------

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
export const NOTE_COLOR = 'FF0000';

/** <w:t>, keeping spaces Word would otherwise collapse. */
function textXml(text: string): string {
  const space = /^\s|\s$|\s\s/.test(text) ? ' xml:space="preserve"' : '';
  return `<w:t${space}>${escapeXml(text)}</w:t>`;
}

/** One run. Tabs become <w:tab/>; an annotation gets red text and a highlight (color before highlight, as the schema orders them). */
export function runXml(text: string, note: boolean, highlight: HighlightKey): string {
  if (!text) return '';
  const rPr = note ? `<w:rPr><w:color w:val="${NOTE_COLOR}"/><w:highlight w:val="${highlight}"/></w:rPr>` : '';
  const content = text
    .split('\t')
    .map((part, i) => (i ? '<w:tab/>' : '') + (part ? textXml(part) : ''))
    .join('');
  return `<w:r>${rPr}${content}</w:r>`;
}

export function paragraphXml(p: Para, o: Pick<DocxOptions, 'keepBrackets' | 'highlight'>): string {
  const pPr = p.kind === 'heading' ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : '';
  const runs = p.inlines.map((i) => runXml(inlineText(i, o.keepBrackets), i.kind === 'note', o.highlight)).join('');
  return `<w:p>${pPr}${runs}</w:p>`;
}

export function documentXml(paras: Para[], o: DocxOptions): string {
  const f = FONTS[o.font];
  const body = paras.length ? paras.map((p) => paragraphXml(p, o)).join('') : '<w:p/>';
  // A4 with Word's default margins (Chinese Word: 3.17 cm left/right, 2.54 cm top/bottom).
  const grid = f.chinese ? '<w:docGrid w:type="lines" w:linePitch="312"/>' : '<w:docGrid w:linePitch="360"/>';
  return (
    HEAD +
    `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>${body}` +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="851" w:footer="992" w:gutter="0"/>' +
    `<w:cols w:space="425"/>${grid}</w:sectPr></w:body></w:document>`
  );
}

export function stylesXml(o: DocxOptions): string {
  const f = FONTS[o.font];
  const fonts = `<w:rFonts w:ascii="${escapeXml(f.ascii)}" w:eastAsia="${escapeXml(f.eastAsia)}" w:hAnsi="${escapeXml(f.ascii)}" w:cs="${escapeXml(f.ascii)}"/>`;
  // Latin text proofed as English, Chinese as Chinese (what Chinese Word writes too).
  const lang = '<w:lang w:val="en-US" w:eastAsia="zh-CN" w:bidi="ar-SA"/>';
  // Chinese: 1.5 line spacing, two-character first-line indent, justified. English: 1.15, space after.
  const normalPPr = f.chinese
    ? '<w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:ind w:firstLineChars="200" w:firstLine="480"/><w:jc w:val="both"/></w:pPr>'
    : '<w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr>';
  const headingPPr = f.chinese
    ? '<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="240" w:line="240" w:lineRule="auto"/><w:ind w:firstLineChars="0" w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr>'
    : '<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="120" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="0"/></w:pPr>';
  return (
    HEAD +
    `<w:styles xmlns:w="${W_NS}">` +
    `<w:docDefaults><w:rPrDefault><w:rPr>${fonts}<w:sz w:val="${f.size}"/><w:szCs w:val="${f.size}"/>${lang}</w:rPr></w:rPrDefault>` +
    '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>${normalPPr}</w:style>` +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>' +
    `<w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>${headingPPr}` +
    '<w:rPr><w:b/><w:bCs/><w:kern w:val="44"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>' +
    '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/>' +
    '<w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>' +
    '</w:styles>'
  );
}

export function settingsXml(o: DocxOptions): string {
  const tab = FONTS[o.font].chinese ? 420 : 720;
  return (
    HEAD +
    `<w:settings xmlns:w="${W_NS}"><w:zoom w:percent="100"/><w:defaultTabStop w:val="${tab}"/>` +
    '<w:characterSpacingControl w:val="compressPunctuation"/>' +
    '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
    '</w:settings>'
  );
}

/** W3CDTF without milliseconds, which is what Word writes and accepts. */
function w3cdtf(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function corePropsXml(title: string, now: Date): string {
  const when = w3cdtf(now);
  return (
    HEAD +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(title)}</dc:title><dc:creator>Jack AI Studio demo</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

const APP_XML =
  HEAD +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
  'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
  '<Application>Jack AI Studio browser demo</Application><DocSecurity>0</DocSecurity></Properties>';

const CONTENT_TYPES =
  HEAD +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
  '</Types>';

const ROOT_RELS =
  HEAD +
  `<Relationships xmlns="${PKG_REL_NS}">` +
  `<Relationship Id="rId1" Type="${R_NS}/officeDocument" Target="word/document.xml"/>` +
  `<Relationship Id="rId2" Type="${PKG_REL_NS}/metadata/core-properties" Target="docProps/core.xml"/>` +
  `<Relationship Id="rId3" Type="${R_NS}/extended-properties" Target="docProps/app.xml"/>` +
  '</Relationships>';

const DOCUMENT_RELS =
  HEAD +
  `<Relationships xmlns="${PKG_REL_NS}">` +
  `<Relationship Id="rId1" Type="${R_NS}/styles" Target="styles.xml"/>` +
  `<Relationship Id="rId2" Type="${R_NS}/settings" Target="settings.xml"/>` +
  '</Relationships>';

/** A complete .docx holding these paragraphs. */
export function buildDocx(paras: Para[], o: DocxOptions, now: Date = new Date()): Uint8Array {
  return createZip(
    [
      { name: '[Content_Types].xml', data: CONTENT_TYPES },
      { name: '_rels/.rels', data: ROOT_RELS },
      { name: 'word/document.xml', data: documentXml(paras, o) },
      { name: 'word/_rels/document.xml.rels', data: DOCUMENT_RELS },
      { name: 'word/styles.xml', data: stylesXml(o) },
      { name: 'word/settings.xml', data: settingsXml(o) },
      { name: 'docProps/core.xml', data: corePropsXml(o.title, now) },
      { name: 'docProps/app.xml', data: APP_XML },
    ],
    now,
  );
}

// ---------- reading ----------

export type ImportErrorCode = 'doc' | 'not_docx' | 'corrupt';

export class ImportError extends Error {
  code: ImportErrorCode;
  constructor(code: ImportErrorCode) {
    super(code);
    this.name = 'ImportError';
    this.code = code;
  }
}

interface StyleInfo {
  name: string;
  outline: number;
}

/** Heading level from a style: Title → 0, "heading 2" / "标题 2" / outline level 1 → 2; -1 for body text. */
function headingLevel(styleId: string, styles: Map<string, StyleInfo>, outline: number): number {
  if (outline >= 0 && outline < 9) return outline + 1;
  const style = styles.get(styleId);
  if (style && style.outline >= 0 && style.outline < 9) return style.outline + 1;
  const name = (style?.name ?? styleId).trim().toLowerCase();
  if (name === 'title' || name === '标题') return 0;
  const m = /^(?:heading|标题)\s*(\d)$/.exec(name) ?? /^heading(\d)$/i.exec(styleId);
  return m ? Number(m[1]) : -1;
}

function parseStyles(xml: string): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>();
  let current: { id: string; info: StyleInfo } | null = null;
  scanXml(xml, {
    open(name, a) {
      if (name === 'style') current = { id: attr(a, 'styleId') ?? '', info: { name: '', outline: -1 } };
      else if (current && name === 'name') current.info.name = attr(a, 'val') ?? '';
      else if (current && name === 'outlineLvl') current.info.outline = Number(attr(a, 'val') ?? -1);
    },
    close(name) {
      if (name === 'style' && current) {
        styles.set(current.id, current.info);
        current = null;
      }
    },
  });
  return styles;
}

interface RawPara {
  styleId: string;
  outline: number;
  /** [text, highlighted] pieces. */
  runs: [string, boolean][];
}

/**
 * Reads the text of a .docx into editor form: one line per paragraph, the top
 * heading level as "# ", highlighted runs wrapped in 【】 (so a file exported
 * here comes back with its annotations). Deleted tracked changes, field codes
 * and duplicate fallback copies of text boxes are left out.
 */
export async function readDocx(bytes: Uint8Array): Promise<string> {
  let entries: ZipEntry[];
  try {
    entries = listZip(bytes);
  } catch (e) {
    throw new ImportError(e instanceof ZipError && e.code === 'encrypted' ? 'doc' : 'corrupt');
  }
  const byName = new Map(entries.map((e) => [e.name.toLowerCase(), e]));
  const read = async (name: string): Promise<string | null> => {
    const entry = byName.get(name.toLowerCase());
    if (!entry) return null;
    try {
      return new TextDecoder('utf-8').decode(await extractEntry(bytes, entry));
    } catch {
      throw new ImportError('corrupt');
    }
  };
  let mainPath = 'word/document.xml';
  scanXml((await read('_rels/.rels')) ?? '', {
    open(name, a) {
      if (name === 'Relationship' && (attr(a, 'Type') ?? '').endsWith('/officeDocument')) {
        mainPath = (attr(a, 'Target') ?? mainPath).replace(/^\/+/, '');
      }
    },
  });
  const main = (await read(mainPath)) ?? (await read('word/document.xml'));
  if (main === null) throw new ImportError('not_docx');
  const styles = parseStyles((await read('word/styles.xml')) ?? '');

  const paras: RawPara[] = [];
  const stack: RawPara[] = [];
  let run: { text: string; highlight: boolean } | null = null;
  let inPPr = 0;
  let inText = false;
  let skip = 0; // inside <w:del>, <w:instrText>, <mc:Fallback>…
  scanXml(main, {
    open(name, a, selfClosing) {
      if (name === 'del' || name === 'moveFrom' || name === 'instrText' || name === 'delText' || name === 'Fallback') {
        if (!selfClosing) skip++;
        return;
      }
      if (skip) return;
      const cur = stack[stack.length - 1];
      switch (name) {
        case 'p':
          stack.push({ styleId: '', outline: -1, runs: [] });
          if (selfClosing) paras.push(stack.pop() as RawPara);
          break;
        case 'pPr':
          inPPr++;
          break;
        case 'pStyle':
          if (cur && inPPr) cur.styleId = attr(a, 'val') ?? '';
          break;
        case 'outlineLvl':
          if (cur && inPPr) cur.outline = Number(attr(a, 'val') ?? -1);
          break;
        case 'r':
          run = { text: '', highlight: false };
          break;
        case 'highlight':
          if (run && !inPPr) run.highlight = (attr(a, 'val') ?? 'none') !== 'none';
          break;
        case 't':
          inText = !selfClosing;
          break;
        case 'tab':
          if (run && !inPPr) run.text += '\t';
          break;
        case 'br':
        case 'cr':
          if (run) run.text += '\n';
          break;
        case 'noBreakHyphen':
          if (run) run.text += '-';
          break;
      }
    },
    close(name) {
      if (name === 'del' || name === 'moveFrom' || name === 'instrText' || name === 'delText' || name === 'Fallback') {
        if (skip) skip--;
        return;
      }
      if (skip) return;
      switch (name) {
        case 't':
          inText = false;
          break;
        case 'pPr':
          inPPr = Math.max(0, inPPr - 1);
          break;
        case 'r': {
          const cur = stack[stack.length - 1];
          if (run && cur && run.text) cur.runs.push([run.text, run.highlight]);
          run = null;
          break;
        }
        case 'p': {
          const done = stack.pop();
          if (done) paras.push(done);
          break;
        }
      }
    },
    text(t) {
      if (!skip && inText && run) run.text += t;
    },
  });

  const levels = paras.map((p) => headingLevel(p.styleId, styles, p.outline));
  const used = levels.filter((l) => l >= 0);
  // Article titles: Title and Heading 1 when the file has Heading 1, otherwise its top heading level.
  const top = used.includes(1) ? 1 : used.length ? Math.min(...used) : -1;
  const lines: string[] = [];
  paras.forEach((p, i) => {
    let text = '';
    let note = '';
    for (const [piece, highlighted] of p.runs) {
      if (highlighted) note += piece;
      else {
        text += wrapNote(note) + piece;
        note = '';
      }
    }
    text += wrapNote(note);
    const isTitle = levels[i] >= 0 && levels[i] <= top;
    const body = text.replace(/\s+$/g, '');
    if (!body.trim()) {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      return;
    }
    if (isTitle) {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      lines.push(`# ${body.replace(/\n+/g, ' ').trim()}`);
    } else lines.push(...body.split('\n'));
  });
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

/** Highlighted text becomes 【…】 again, unless it already carries its brackets. */
function wrapNote(note: string): string {
  if (!note) return '';
  return note.startsWith(OPEN) && note.endsWith(CLOSE) ? note : `${OPEN}${note}${CLOSE}`;
}
