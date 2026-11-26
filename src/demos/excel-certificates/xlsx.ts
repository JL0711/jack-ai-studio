// Reading and writing .xlsx files without a library (an .xlsx is a ZIP of XML).
//
// Reading takes the first visible worksheet and turns every cell into the text
// the visitor sees in Excel: shared and inline strings, numbers, TRUE/FALSE,
// and dates (stored as serial numbers with a date format) as YYYY-MM-DD.
// Writing produces the smallest package Excel, Numbers and WPS all open:
// inline strings, a bold header row, one real date format.

import { ZipError, createZip, extractEntry, listZip, type ZipEntry } from '../../lib/files/zip';
import { ListError, MAX_ROWS } from './errors';
import { attr, decodeExcelEscapes, escapeXml, scanXml } from './xml';

export interface SheetRow {
  /** Row number as Excel shows it (1-based). */
  r: number;
  /** Cell text by column (A = 0). Trailing empty cells are left out. */
  cells: string[];
}

export interface SheetData {
  sheetName: string;
  rows: SheetRow[];
}

/** Columns beyond this are ignored (a certificate list never needs them). */
const MAX_COLS = 100;
/** Title and header rows allowed above MAX_ROWS data rows before giving up early. */
const ROW_SLACK = 20;

// ---------- cell references ----------

/** "B7" → 1, "AA3" → 26. */
export function colIndex(ref: string): number | null {
  const m = /^\$?([A-Za-z]{1,3})\$?\d*$/.exec(ref);
  if (!m) return null;
  let n = 0;
  for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 0 → "A", 26 → "AA". */
export function colLetter(index: number): string {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ---------- numbers and dates ----------

const DAY_MS = 86_400_000;
const EPOCH = Date.UTC(1899, 11, 30);

/**
 * Excel serial number → "YYYY-MM-DD". The 1900 date system counts a
 * 29 February 1900 that never existed (serial 60), so earlier serials are
 * shifted by a day. The 1904 system (old Mac workbooks) starts on 1904-01-01.
 */
export function serialToIso(serial: number, date1904 = false): string | null {
  if (!Number.isFinite(serial)) return null;
  let days = Math.floor(serial);
  if (date1904) {
    if (days < 0) return null;
    days += 1462;
  } else {
    if (days < 1 || days === 60) return null;
    if (days < 60) days += 1;
  }
  if (days > 2958465) return null;
  return new Date(EPOCH + days * DAY_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → Excel serial number (1900 system, dates from March 1900 on). */
export function isoToSerial(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const serial = Math.round((t - EPOCH) / DAY_MS);
  return serial >= 61 ? serial : null;
}

/** 0.1 + 0.2 shows as 0.3 in Excel (15 significant digits), and so here. */
export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toPrecision(15)));
}

function formatTime(serial: number): string {
  const secs = Math.round((serial - Math.floor(serial)) * 86400) % 86400;
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}`;
}

export type NumKind = 'num' | 'date' | 'time';

// Built-in formats: 14–17 and 22 everywhere, 27–31/36/50/51/54/57/58 in Chinese and Japanese Excel.
const DATE_IDS = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 36, 50, 51, 54, 57, 58]);
const TIME_IDS = new Set([18, 19, 20, 21, 32, 33, 34, 35, 45, 46, 47, 52, 53, 55, 56]);

/** What a custom number format shows: "yyyy/m/d" is a date, "h:mm" a time, "0.00" a number. */
export function codeKind(code: string): NumKind {
  const bare = code
    .replace(/"[^"]*"/g, '') // literal text: "年"
    .replace(/\\./g, '') // escaped characters
    .replace(/[_*]./g, '') // padding and repeat characters
    .replace(/\[[^\]]*\]/g, '') // [Red], [$-804], [DBNum1]
    .toLowerCase();
  const section = bare.split(';')[0];
  if (/[yd]/.test(section)) return 'date';
  if (/[hs]/.test(section)) return 'time';
  if (/m/.test(section)) return 'date';
  return 'num';
}

export function formatKind(numFmtId: number, code?: string): NumKind {
  if (code !== undefined) return codeKind(code);
  if (DATE_IDS.has(numFmtId)) return 'date';
  if (TIME_IDS.has(numFmtId)) return 'time';
  return 'num';
}

// ---------- reading the parts ----------

/** sharedStrings.xml → the strings in order. Rich text runs are joined; phonetic guides are left out. */
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  let cur: string | null = null;
  let inT = false;
  let phonetic = 0;
  scanXml(xml, {
    open(name, _a, selfClosing) {
      if (name === 'si') cur = '';
      else if (name === 'rPh') phonetic++;
      else if (name === 't' && !selfClosing) inT = true;
    },
    close(name) {
      if (name === 'si') {
        out.push(decodeExcelEscapes(cur ?? ''));
        cur = null;
      } else if (name === 'rPh') phonetic--;
      else if (name === 't') inT = false;
    },
    text(t) {
      if (cur !== null && inT && phonetic === 0) cur += t;
    },
  });
  return out;
}

/** styles.xml → for each cell style (the "s" attribute), whether it shows a date, a time or a number. */
export function parseStyles(xml: string): NumKind[] {
  const codes = new Map<number, string>();
  const kinds: NumKind[] = [];
  let inCellXfs = false;
  scanXml(xml, {
    open(name, a) {
      if (name === 'numFmt') {
        const id = Number(attr(a, 'numFmtId'));
        const code = attr(a, 'formatCode');
        if (Number.isFinite(id) && code !== undefined) codes.set(id, code);
      } else if (name === 'cellXfs') inCellXfs = true;
      else if (name === 'xf' && inCellXfs) {
        const id = Number(attr(a, 'numFmtId') ?? 0);
        kinds.push(formatKind(id, codes.get(id)));
      }
    },
    close(name) {
      if (name === 'cellXfs') inCellXfs = false;
    },
  });
  return kinds;
}

interface RawCell {
  col: number;
  type: string;
  style: number;
  v: string;
  inline: string;
}

function cellText(c: RawCell, shared: string[], kinds: NumKind[], date1904: boolean): string {
  const v = c.v.trim();
  switch (c.type) {
    case 's': {
      const i = Number(v);
      return v !== '' && Number.isInteger(i) ? (shared[i] ?? '') : '';
    }
    case 'inlineStr':
      return decodeExcelEscapes(c.inline);
    case 'str':
      return decodeExcelEscapes(c.v);
    case 'b':
      return v === '1' || v === 'true' ? 'TRUE' : 'FALSE';
    case 'e':
      return v;
    case 'd':
      return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : v;
    default: {
      if (v === '') return decodeExcelEscapes(c.inline);
      const n = Number(v);
      if (!Number.isFinite(n)) return v;
      const kind = kinds[c.style] ?? 'num';
      if (kind === 'date') return serialToIso(n, date1904) ?? formatNumber(n);
      if (kind === 'time') return formatTime(n);
      return formatNumber(n);
    }
  }
}

/** A worksheet's XML → its non-empty rows, in order. Stops early on a list that is far too long. */
export function parseSheet(
  xml: string,
  shared: string[],
  kinds: NumKind[],
  date1904 = false,
  maxRows = MAX_ROWS,
): SheetRow[] {
  const rows: SheetRow[] = [];
  let rowNum = 0;
  let cells: string[] = [];
  let col = -1;
  let cell: RawCell | null = null;
  let into: '' | 'v' | 't' = '';
  let inIs = false;
  let phonetic = 0;

  scanXml(xml, {
    open(name, a, selfClosing) {
      switch (name) {
        case 'row': {
          const r = Number(attr(a, 'r'));
          rowNum = Number.isInteger(r) && r > 0 ? r : rowNum + 1;
          cells = [];
          col = -1;
          break;
        }
        case 'c': {
          const ref = attr(a, 'r');
          const fromRef = ref ? colIndex(ref) : null;
          col = fromRef ?? col + 1;
          cell = { col, type: attr(a, 't') ?? 'n', style: Number(attr(a, 's') ?? 0) || 0, v: '', inline: '' };
          break;
        }
        case 'v':
          if (!selfClosing) into = 'v';
          break;
        case 'is':
          inIs = true;
          break;
        case 'rPh':
          phonetic++;
          break;
        case 't':
          if (inIs && !selfClosing) into = 't';
          break;
      }
    },
    close(name) {
      switch (name) {
        case 'v':
        case 't':
          into = '';
          break;
        case 'is':
          inIs = false;
          break;
        case 'rPh':
          phonetic--;
          break;
        case 'c':
          if (cell && cell.col < MAX_COLS) {
            const text = cellText(cell, shared, kinds, date1904);
            if (text !== '') {
              while (cells.length < cell.col) cells.push('');
              cells[cell.col] = text;
            }
          }
          cell = null;
          break;
        case 'row':
          if (cells.some((c) => c.trim() !== '')) {
            rows.push({ r: rowNum, cells });
            if (rows.length > maxRows + ROW_SLACK) throw new ListError('too_many_rows', rows.length);
          }
          break;
      }
    },
    text(t) {
      if (!cell) return;
      if (into === 'v') cell.v += t;
      else if (into === 't' && phonetic === 0) cell.inline += t;
    },
  });
  rows.sort((a, b) => a.r - b.r);
  return rows;
}

/** Resolves a relationship target ("worksheets/sheet1.xml", "/xl/…", "../…") against a folder. */
function resolvePart(folder: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const out: string[] = [];
  for (const p of (folder + target).split('/')) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
}

/** Reads the first visible worksheet of an .xlsx file. Throws ListError for anything unusable. */
export async function readXlsx(bytes: Uint8Array, maxRows = MAX_ROWS): Promise<SheetData> {
  let entries: ZipEntry[];
  try {
    entries = listZip(bytes);
  } catch (e) {
    throw new ListError(e instanceof ZipError && e.code === 'encrypted' ? 'xls' : 'corrupt');
  }
  const byName = new Map(entries.map((e) => [e.name.toLowerCase(), e]));
  if (!byName.has('xl/workbook.xml')) {
    if (byName.has('word/document.xml')) throw new ListError('docx');
    if (entries.some((e) => /^index\/.*\.iwa$/i.test(e.name))) throw new ListError('numbers');
    throw new ListError('not_list');
  }
  const read = async (name: string): Promise<string | null> => {
    const entry = byName.get(name.toLowerCase());
    if (!entry) return null;
    try {
      return new TextDecoder('utf-8').decode(await extractEntry(bytes, entry));
    } catch {
      throw new ListError('corrupt');
    }
  };

  const sheets: { name: string; rid: string; hidden: boolean }[] = [];
  let date1904 = false;
  scanXml((await read('xl/workbook.xml')) ?? '', {
    open(name, a) {
      if (name === 'sheet') {
        sheets.push({
          name: attr(a, 'name') ?? '',
          rid: attr(a, 'id') ?? '',
          hidden: (attr(a, 'state') ?? 'visible') !== 'visible',
        });
      } else if (name === 'workbookPr') {
        const v = attr(a, 'date1904');
        date1904 = v === '1' || v === 'true';
      }
    },
  });

  const rels = new Map<string, { target: string; type: string }>();
  scanXml((await read('xl/_rels/workbook.xml.rels')) ?? '', {
    open(name, a) {
      if (name === 'Relationship')
        rels.set(attr(a, 'Id') ?? '', { target: attr(a, 'Target') ?? '', type: attr(a, 'Type') ?? '' });
    },
  });
  const relOfType = (suffix: string) => [...rels.values()].find((r) => r.type.endsWith(suffix));

  const isSheet = (s: { rid: string }) => rels.get(s.rid)?.type.endsWith('/worksheet') ?? false;
  const chosen = sheets.find((s) => !s.hidden && isSheet(s)) ?? sheets.find(isSheet);
  let sheetPath = chosen ? resolvePart('xl/', rels.get(chosen.rid)?.target ?? '') : '';
  let sheetName = chosen?.name ?? '';
  if (!sheetPath || !byName.has(sheetPath.toLowerCase())) {
    const fallback = entries
      .map((e) => e.name)
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
      .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))[0];
    if (!fallback) throw new ListError('empty');
    sheetPath = fallback;
    sheetName = sheetName || 'Sheet1';
  }

  const sharedRel = relOfType('/sharedStrings');
  const stylesRel = relOfType('/styles');
  const shared = parseSharedStrings(
    (await read(sharedRel ? resolvePart('xl/', sharedRel.target) : 'xl/sharedStrings.xml')) ?? '',
  );
  const kinds = parseStyles((await read(stylesRel ? resolvePart('xl/', stylesRel.target) : 'xl/styles.xml')) ?? '');
  const rows = parseSheet((await read(sheetPath)) ?? '', shared, kinds, date1904, maxRows);
  return { sheetName, rows };
}

// ---------- writing ----------

/** A cell to write: text, a number, a real date ({ date: 'YYYY-MM-DD' }), or nothing. */
export type CellValue = string | number | { date: string } | null | undefined;

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Excel's rules for sheet names: up to 31 characters, none of []:*?/\ . */
export function cleanSheetName(name: string): string {
  const s = name
    .replace(/[[\]:*?/\\]/g, ' ')
    .trim()
    .replace(/^'+|'+$/g, '')
    .slice(0, 31)
    .trim();
  return s && s.toLowerCase() !== 'history' ? s : 'Sheet1';
}

function cellXml(ref: string, v: CellValue, header: boolean): string {
  const style = header ? ' s="1"' : '';
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${style}><v>${formatNumber(v)}</v></c>` : '';
  if (typeof v === 'object') {
    const serial = isoToSerial(v.date);
    if (serial !== null) return `<c r="${ref}" s="2"><v>${serial}</v></c>`;
    return cellXml(ref, v.date, header);
  }
  const space = /^\s|\s$|\n/.test(v) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}"${style} t="inlineStr"><is><t${space}>${escapeXml(v)}</t></is></c>`;
}

/**
 * Builds an .xlsx with one sheet. The first row is the header (bold, frozen).
 * Empty rows are left out, as Excel itself does.
 */
export function writeXlsx(sheetName: string, rows: CellValue[][], colWidths: number[] = []): Uint8Array {
  let maxCol = 0;
  const rowXml: string[] = [];
  rows.forEach((row, ri) => {
    const cells = row.map((v, ci) => cellXml(`${colLetter(ci)}${ri + 1}`, v, ri === 0));
    const last = cells.reduce((acc, c, i) => (c ? i + 1 : acc), 0);
    if (!last) return;
    maxCol = Math.max(maxCol, last);
    rowXml.push(`<row r="${ri + 1}">${cells.join('')}</row>`);
  });
  const dimension = maxCol ? `A1:${colLetter(maxCol - 1)}${rows.length}` : 'A1';
  const cols = colWidths.length
    ? `<cols>${colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';

  const sheet =
    XML_HEAD +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<dimension ref="${dimension}"/>` +
    '<sheetViews><sheetView tabSelected="1" workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="18"/>' +
    cols +
    `<sheetData>${rowXml.join('')}</sheetData>` +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '</worksheet>';

  const workbook =
    XML_HEAD +
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="16000" windowHeight="9000"/></bookViews>' +
    `<sheets><sheet name="${escapeXml(cleanSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>';

  const styles =
    XML_HEAD +
    `<styleSheet xmlns="${NS_MAIN}">` +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>' +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE7EFEA"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  const contentTypes =
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  const rootRels =
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
    '</Relationships>';

  const workbookRels =
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/>` +
    '</Relationships>';

  return createZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
    { name: 'xl/styles.xml', data: styles },
  ]);
}
