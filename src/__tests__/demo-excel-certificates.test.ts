import { describe, expect, it } from 'vitest';
import { crc32, createZip } from '../lib/files/zip';
import { detectDelimiter, guardFormula, parseCsv, toCsv } from '../demos/excel-certificates/csv';
import { fitFontSize, fitParagraph, wrapText } from '../demos/excel-certificates/draw';
import { ListError } from '../demos/excel-certificates/errors';
import { loadListFile } from '../demos/excel-certificates/load';
import { buildLogCsv, pngFileName, uniqueNames } from '../demos/excel-certificates/log';
import { buildPdf, pdfString } from '../demos/excel-certificates/pdf';
import {
  EMPTY_MAPPING,
  assignNumbers,
  buildRoster,
  checkRoster,
  cleanPrefix,
  detectMapping,
  parseDate,
  type Mapping,
} from '../demos/excel-certificates/roster';
import { cellsToRows, sampleList } from '../demos/excel-certificates/sample';
import { TEXT } from '../demos/excel-certificates/text';
import { decodeEntities, scanXml } from '../demos/excel-certificates/xml';
import {
  codeKind,
  colIndex,
  colLetter,
  isoToSerial,
  parseSharedStrings,
  readXlsx,
  serialToIso,
  writeXlsx,
  type SheetRow,
} from '../demos/excel-certificates/xlsx';

const enc = new TextEncoder();
const TODAY = new Date(2026, 10, 26); // 26 November 2026, local time

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A ZIP whose entries are DEFLATE-compressed, the way Excel writes them. */
async function deflatedZip(files: Record<string, string>): Promise<Uint8Array> {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = enc.encode(text);
    const comp = await deflateRaw(data);
    const nameBytes = enc.encode(name);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(14, crc32(data), true);
    lv.setUint32(18, comp.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc32(data), true);
    cv.setUint32(20, comp.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local, comp);
    centrals.push(central);
    offset += local.length + comp.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

/** A hand-built workbook: a hidden first sheet, rich text, phonetic runs, dates, sparse cells, x: prefixes. */
function handBuiltWorkbook(): Record<string, string> {
  return {
    '[Content_Types].xml':
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<workbookPr defaultThemeVersion="164011"/><sheets>' +
      '<sheet name="说明" sheetId="3" state="hidden" r:id="rId9"/>' +
      '<sheet name="结业名单 &amp; 备注" sheetId="1" r:id="rId1"/>' +
      '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet9.xml"/>' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
      '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>',
    'xl/sharedStrings.xml':
      '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="6" uniqueCount="6">' +
      '<si><t>姓名</t></si>' +
      '<si><t xml:space="preserve">课程 </t></si>' +
      '<si><r><rPr><b/></rPr><t>Python</t></r><r><t xml:space="preserve"> 数据分析</t></r></si>' +
      '<si><t>王子涵</t><rPh sb="0" eb="3"><t>ワン</t></rPh><phoneticPr fontId="1"/></si>' +
      '<si><t>A &amp; B &lt;C&gt; &#x4E2D;&#25991;_x000D_</t></si>' +
      '<si><t/></si>' +
      '</sst>',
    'xl/styles.xml':
      '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="2"><numFmt numFmtId="176" formatCode="yyyy&quot;年&quot;m&quot;月&quot;d&quot;日&quot;;@"/>' +
      '<numFmt numFmtId="177" formatCode="0.00_);[Red]\\(0.00\\)"/></numFmts>' +
      '<cellStyleXfs count="1"><xf numFmtId="14"/></cellStyleXfs>' +
      '<cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="176"/><xf numFmtId="177"/><xf numFmtId="20"/></cellXfs>' +
      '</styleSheet>',
    'xl/worksheets/sheet9.xml':
      '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>hidden</t></is></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet1.xml':
      '<?xml version="1.0"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>' +
      '<x:row r="1" spans="1:27"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="C1" t="s"><x:v>1</x:v></x:c><x:c r="AA1" t="inlineStr"><x:is><x:t>备注</x:t></x:is></x:c></x:row>' +
      '<x:row r="2"><x:c r="A2" t="s"><x:v>3</x:v></x:c><x:c r="C2" t="s"><x:v>2</x:v></x:c><x:c r="D2" s="1"><x:v>46334</x:v></x:c><x:c r="E2" s="2"><x:v>46335.75</x:v></x:c></x:row>' +
      '<x:row r="3"/>' +
      '<x:row r="5"><x:c r="A5" t="s"><x:v>4</x:v></x:c><x:c r="B5" t="b"><x:v>1</x:v></x:c><x:c r="C5" s="3"><x:v>0.30000000000000004</x:v></x:c>' +
      '<x:c r="D5" t="str"><x:f>A1&amp;"x"</x:f><x:v>姓名x</x:v></x:c><x:c r="E5" t="e"><x:v>#N/A</x:v></x:c><x:c r="F5" s="4"><x:v>0.5</x:v></x:c><x:c r="G5" t="s"><x:v>5</x:v></x:c></x:row>' +
      '<x:row><x:c t="inlineStr"><x:is><x:r><x:t>no </x:t></x:r><x:r><x:t>refs</x:t></x:r></x:is></x:c><x:c><x:v>12</x:v></x:c></x:row>' +
      '</x:sheetData></x:worksheet>',
  };
}

describe('xml helpers', () => {
  it('decodes entities and leaves unknown ones', () => {
    expect(decodeEntities('&lt;a&gt; &amp;amp; &#20013;&#x6587; &quot;&apos; &nbsp;')).toBe(
      '<a> &amp; 中文 "\' &nbsp;',
    );
  });

  it('scans elements, self-closing tags, CDATA and comments', () => {
    const events: string[] = [];
    scanXml('<?xml version="1.0"?><!-- note --><a x="1>2"><b/><![CDATA[<raw>]]>t&amp;</a>', {
      open: (n, a, self) => events.push(`open ${n}${a.x ? `[${a.x}]` : ''}${self ? '/' : ''}`),
      close: (n) => events.push(`close ${n}`),
      text: (t) => events.push(`text ${t}`),
    });
    expect(events).toEqual(['open a[1>2]', 'open b/', 'close b', 'text <raw>', 'text t&', 'close a']);
  });
});

describe('xlsx', () => {
  it('converts serial numbers to dates in both date systems', () => {
    expect(serialToIso(1)).toBe('1900-01-01');
    expect(serialToIso(59)).toBe('1900-02-28');
    expect(serialToIso(60)).toBeNull(); // Excel's 29 February 1900 never existed
    expect(serialToIso(61)).toBe('1900-03-01');
    expect(serialToIso(46334)).toBe('2026-11-08');
    expect(serialToIso(46334.99)).toBe('2026-11-08');
    expect(serialToIso(0, true)).toBe('1904-01-01');
    expect(serialToIso(44872, true)).toBe('2026-11-08');
    expect(isoToSerial('2026-11-08')).toBe(46334);
    expect(serialToIso(isoToSerial('2024-02-29') ?? 0)).toBe('2024-02-29');
  });

  it('tells date formats from number formats', () => {
    expect(codeKind('yyyy"年"m"月"d"日";@')).toBe('date');
    expect(codeKind('[$-F800]dddd\\,\\ mmmm\\ dd\\,\\ yyyy')).toBe('date');
    expect(codeKind('m/d/yy')).toBe('date');
    expect(codeKind('mmm-yy')).toBe('date');
    expect(codeKind('h:mm AM/PM')).toBe('time');
    expect(codeKind('[h]:mm:ss')).toBe('time');
    expect(codeKind('0.00_);[Red]\\(0.00\\)')).toBe('num');
    expect(codeKind('#,##0 "元"')).toBe('num');
    expect(codeKind('General')).toBe('num');
  });

  it('maps column letters both ways', () => {
    expect(colIndex('A1')).toBe(0);
    expect(colIndex('Z9')).toBe(25);
    expect(colIndex('AA10')).toBe(26);
    expect(colIndex('$C$3')).toBe(2);
    expect([0, 25, 26, 701, 702].map(colLetter)).toEqual(['A', 'Z', 'AA', 'ZZ', 'AAA']);
  });

  it('reads shared strings with rich text, phonetic guides and escapes', () => {
    const xml = handBuiltWorkbook()['xl/sharedStrings.xml'];
    expect(parseSharedStrings(xml)).toEqual(['姓名', '课程 ', 'Python 数据分析', '王子涵', 'A & B <C> 中文\r', '']);
  });

  it('reads a hand-built, DEFLATE-compressed workbook', async () => {
    const data = await readXlsx(await deflatedZip(handBuiltWorkbook()));
    expect(data.sheetName).toBe('结业名单 & 备注');
    const byRow = new Map(data.rows.map((r) => [r.r, r.cells]));
    expect(data.rows.map((r) => r.r)).toEqual([1, 2, 5, 6]);
    const header = byRow.get(1) ?? [];
    expect(header[0]).toBe('姓名');
    expect(header[1]).toBe('');
    expect(header[2]).toBe('课程 ');
    expect(header[26]).toBe('备注');
    expect(byRow.get(2)).toEqual(['王子涵', '', 'Python 数据分析', '2026-11-08', '2026-11-09']);
    expect(byRow.get(5)).toEqual(['A & B <C> 中文\r', 'TRUE', '0.3', '姓名x', '#N/A', '12:00']);
    expect(byRow.get(6)).toEqual(['no refs', '12']);
  });

  it('round-trips the sample list through its own writer and reader', async () => {
    for (const lang of ['zh', 'en'] as const) {
      const sample = sampleList(lang, TODAY, lang === 'zh' ? 'XH' : 'NCA');
      const file = writeXlsx(sample.sheetName, sample.cells, sample.colWidths);
      const back = await readXlsx(file);
      expect(back.sheetName).toBe(sample.sheetName);
      expect(back.rows).toEqual(cellsToRows(sample.cells));
    }
  });

  it('writes the parts every spreadsheet app expects', async () => {
    const file = writeXlsx('A/B:[名单]', [
      ['姓名', ' 前后空格 '],
      ['<&>"', 3.5],
      [null, { date: '2026-11-08' }],
    ]);
    const { readZip } = await import('../lib/files/zip');
    const parts = await readZip(file);
    expect([...parts.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
      'xl/styles.xml',
    ]);
    const text = (n: string) => new TextDecoder().decode(parts.get(n));
    expect(text('xl/workbook.xml')).toContain('name="A B  名单"');
    const sheet = text('xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<t xml:space="preserve"> 前后空格 </t>');
    expect(sheet).toContain('&lt;&amp;&gt;&quot;');
    expect(sheet).toContain('<c r="B3" s="2"><v>46334</v></c>');
    expect(sheet).toContain('<dimension ref="A1:B3"/>');
    const back = await readXlsx(file);
    expect(back.rows).toEqual([
      { r: 1, cells: ['姓名', ' 前后空格 '] },
      { r: 2, cells: ['<&>"', '3.5'] },
      { r: 3, cells: ['', '2026-11-08'] },
    ]);
  });
});

describe('csv', () => {
  it('handles quotes, doubled quotes, line breaks inside fields and CRLF', () => {
    const text = 'name,course\r\n"Carter, Emma","Intro ""Python"""\r\n"Line\nbreak",x\r\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'course'],
      ['Carter, Emma', 'Intro "Python"'],
      ['Line\nbreak', 'x'],
    ]);
  });

  it('keeps blank lines as empty rows and ignores the final line break', () => {
    expect(parseCsv('a,b\n\nc,d\n')).toEqual([['a', 'b'], [], ['c', 'd']]);
    expect(parseCsv('a,b\nc,')).toEqual([
      ['a', 'b'],
      ['c', ''],
    ]);
    expect(parseCsv('"unclosed,quote')).toEqual([['unclosed,quote']]);
    expect(parseCsv('"",x')).toEqual([['', 'x']]);
  });

  it('detects comma, semicolon and tab delimiters, and the sep= hint', () => {
    expect(detectDelimiter('姓名,课程\n王子涵,Python\n')).toBe(',');
    expect(detectDelimiter('Name;Score\nAnna;4,5\nBen;3,0\n')).toBe(';');
    expect(detectDelimiter('Name\tCourse\nA, B\tC\n')).toBe('\t');
    expect(parseCsv('sep=;\nName;Course\nA,B;C\n')).toEqual([
      ['Name', 'Course'],
      ['A,B', 'C'],
    ]);
    expect(parseCsv('\ufeffname,course\n')).toEqual([['name', 'course']]);
  });

  it('writes CSV that quotes only what it must and defuses formulas', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', ' x', 'line\nbreak']])).toBe('a,"b,c","say ""hi"""," x","line\nbreak"\r\n');
    expect(guardFormula('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
    expect(guardFormula('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(guardFormula('-12.5')).toBe('-12.5');
    expect(guardFormula('Anna')).toBe('Anna');
  });

  it('opens GBK, UTF-16 and BOM CSV files', async () => {
    // "姓名,课程\n张三,Excel" in GBK
    const gbk = new Uint8Array([
      0xd0,
      0xd5,
      0xc3,
      0xfb,
      0x2c,
      0xbf,
      0xce,
      0xb3,
      0xcc,
      0x0a,
      0xd5,
      0xc5,
      0xc8,
      0xfd,
      0x2c,
      ...enc.encode('Excel'),
    ]);
    expect((await loadListFile('名单.csv', gbk)).rows).toEqual([
      { r: 1, cells: ['姓名', '课程'] },
      { r: 2, cells: ['张三', 'Excel'] },
    ]);
    const text = 'Name\tCourse\nAva\tAI\n';
    const utf16 = new Uint8Array(2 + text.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) utf16[2 + i * 2] = text.charCodeAt(i);
    const loaded = await loadListFile('list.txt', utf16);
    expect(loaded.delimiter).toBe('\t');
    expect(loaded.rows[1].cells).toEqual(['Ava', 'AI']);
  });
});

describe('opening files', () => {
  const fail = async (name: string, bytes: Uint8Array) => {
    try {
      await loadListFile(name, bytes);
    } catch (e) {
      return e instanceof ListError ? e.code : 'other';
    }
    return 'ok';
  };

  it('refuses what it cannot read with a reason', async () => {
    expect(await fail('old.xls', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]))).toBe('xls');
    expect(await fail('a.docx', createZip([{ name: 'word/document.xml', data: '<w:document/>' }]))).toBe('docx');
    expect(await fail('a.numbers', createZip([{ name: 'Index/Document.iwa', data: 'x' }]))).toBe('numbers');
    expect(await fail('photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]))).toBe(
      'not_list',
    );
    expect(await fail('broken.xlsx', enc.encode('PK not really a zip file at all, just text'))).toBe('corrupt');
    expect(await fail('export.xls', enc.encode('<html><table><tr><td>a</td></tr></table></html>'))).toBe('xls');
    expect(await fail('empty.csv', new Uint8Array())).toBe('empty');
    expect(await fail('blank.csv', enc.encode('\n\n , \n'))).toBe('empty');
    expect(await fail('huge.csv', new Uint8Array(11 * 1024 * 1024).fill(0x41))).toBe('too_big');
    expect(await fail('long.csv', enc.encode('name,course\n' + 'Ann,AI\n'.repeat(2100)))).toBe('too_many_rows');
  });

  it('stops reading an .xlsx that is far too long', async () => {
    const rows = [['Name', 'Course'], ...Array.from({ length: 2100 }, (_, i) => [`P${i}`, 'AI'])];
    await expect(readXlsx(writeXlsx('Long', rows))).rejects.toMatchObject({ code: 'too_many_rows' });
  });
});

describe('roster', () => {
  const rows = (...lines: string[][]): SheetRow[] => lines.map((cells, i) => ({ r: i + 1, cells }));

  it('finds the header under a title row and fills in missing rows', () => {
    const roster = buildRoster([
      { r: 1, cells: ['2026 年秋季班结业名单'] },
      { r: 2, cells: ['序号', '姓名', '课程名称', '结业日期'] },
      { r: 3, cells: ['1', '王子涵', 'Python'] },
      { r: 6, cells: ['2', '李雨桐', 'Excel'] },
    ]);
    expect(roster.headerRow).toBe(2);
    expect(roster.rows.map((r) => r.r)).toEqual([3, 4, 5, 6]);
    expect(roster.rows[1].cells).toEqual([]);
  });

  it('falls back to the widest early row when no header is recognised', () => {
    const roster = buildRoster([
      { r: 1, cells: ['Kursliste Herbst 2026'] },
      { r: 2, cells: ['Teilnehmer', 'Kurs', 'Datum'] },
      { r: 3, cells: ['Müller, Anna', 'Excel', '08.11.2026'] },
    ]);
    expect(roster.headerRow).toBe(2);
    expect(roster.rows).toEqual([{ r: 3, cells: ['Müller, Anna', 'Excel', '08.11.2026'] }]);
    expect(detectMapping(roster.headers)).toEqual(EMPTY_MAPPING);
  });

  it('refuses an empty list and one that is too long', () => {
    expect(() => buildRoster([])).toThrow(ListError);
    const long = [
      { r: 1, cells: ['Name'] },
      { r: 5000, cells: ['x'] },
    ];
    expect(() => buildRoster(long)).toThrow(expect.objectContaining({ code: 'too_many_rows', count: 4999 }));
  });

  it('guesses columns from Chinese and English headers', () => {
    expect(detectMapping(['序号', '姓名', '课程名称', '考核等级', '结业日期', '证书编号'])).toEqual({
      name: 1,
      course: 2,
      grade: 3,
      date: 4,
      number: 5,
    });
    expect(detectMapping(['#', 'Full Name', 'Program', 'Result', 'Completion date', 'Certificate No.'])).toEqual({
      name: 1,
      course: 2,
      grade: 3,
      date: 4,
      number: 5,
    });
    // A row index or a student number is never taken for the certificate number.
    expect(detectMapping(['No.', 'Name', 'Course', 'Student ID'])).toEqual({ ...EMPTY_MAPPING, name: 1, course: 2 });
    expect(detectMapping(['学员编号', '学员姓名', '培训项目'])).toEqual({ ...EMPTY_MAPPING, name: 1, course: 2 });
    expect(detectMapping(['甲', '乙'])).toEqual(EMPTY_MAPPING);
  });

  it('reads the date formats people type', () => {
    const cases: [string, string | null][] = [
      ['2026-11-08', '2026-11-08'],
      ['2026/11/8', '2026-11-08'],
      ['2026.11.08', '2026-11-08'],
      ['2026年11月8日', '2026-11-08'],
      ['2026 年 11 月 8 日', '2026-11-08'],
      ['２０２６－１１－０８', '2026-11-08'],
      ['20261108', '2026-11-08'],
      ['2026-11-08 00:00:00', '2026-11-08'],
      ['2026-11-08T09:30:00Z', '2026-11-08'],
      ['11/8/2026', '2026-11-08'],
      ['13/11/2026', '2026-11-13'],
      ['8.11.2026', '2026-11-08'],
      ['11/8/26', '2026-11-08'],
      ['Nov 8, 2026', '2026-11-08'],
      ['November 8th, 2026', '2026-11-08'],
      ['8 November 2026', '2026-11-08'],
      ['8-Nov-2026', '2026-11-08'],
      ['Sept 3 2026', '2026-09-03'],
      ['46334', '2026-11-08'],
      ['2026-02-30', null],
      ['2026-13-01', null],
      ['Novembr 8, 2026', null],
      ['下周五', null],
      ['TBD', null],
      ['12345', null],
    ];
    for (const [input, expected] of cases) expect([input, parseDate(input)]).toEqual([input, expected]);
  });

  const mapping: Mapping = { name: 0, course: 1, grade: -1, date: 2, number: 3 };
  const opts = { prefix: 'NCA', issueDate: '2026-11-26' };

  it('applies every rule and gives the reason', () => {
    const roster = buildRoster(
      rows(
        ['Name', 'Course', 'Date', 'Certificate No.'],
        ['Emma Carter', 'Python', '2026-11-08'],
        [],
        ['', 'Python', '2026-11-08'],
        ['Liam', '', ''],
        ['', '', '', 'NCA-2026-0099'],
        ['Ava Kim', 'AI', 'next Friday'],
        ['  emma   CARTER ', 'python', '11/8/2026'],
        ['Noah', 'AI', '', 'X-1'],
        ['Mia', 'AI', '', 'x-1'],
        ['Olivia', 'Excel', '', '', 'only an unused column'],
      ),
    );
    const { rows: checked, stats } = checkRoster(roster, mapping, opts);
    const summary = checked.map((r) => [r.r, r.status, r.issues.map((i) => i.code).join('+')]);
    expect(summary).toEqual([
      [2, 'ok', ''],
      [3, 'skip', 'blank'],
      [4, 'stop', 'missing_name'],
      [5, 'stop', 'missing_course'],
      [6, 'stop', 'missing_name+missing_course'],
      [7, 'stop', 'bad_date'],
      [8, 'stop', 'duplicate'],
      [9, 'ok', ''],
      [10, 'stop', 'dup_number'],
      [11, 'ok', ''],
    ]);
    expect(checked[6].issues[0]).toEqual({ code: 'duplicate', of: 2 });
    expect(checked[8].issues[0]).toEqual({ code: 'dup_number', of: 9, value: 'x-1' });
    expect(stats).toEqual({ rows: 10, ok: 3, stopped: 6, skipped: 1 });
    // A row without a date uses the issue date.
    expect(checked[9]).toMatchObject({ date: '2026-11-26', dateFromIssue: true });
    expect(checked[0]).toMatchObject({ date: '2026-11-08', dateFromIssue: false });
    // Reasons in the visitor's language.
    const log = buildLogCsv(checked, new Map([[2, 'NCA-2026-0001 Emma Carter.png']]), TEXT.zh);
    expect(log).toContain('8,emma   CARTER,python,拦下,重复：和第 2 行的姓名、课程相同,,');
    expect(log).toContain('6,,,拦下,缺少姓名；缺少课程,,');
    expect(log.split('\r\n')[0]).toBe('Excel 行号,姓名,课程,状态,原因,证书编号,文件');
  });

  it('numbers certificates without collisions', () => {
    expect(assignNumbers([null, null, 'NCA-2026-0002', null, 'nca-2026-0004 ', null], 'NCA', 2026)).toEqual([
      'NCA-2026-0001',
      'NCA-2026-0003',
      'NCA-2026-0002',
      'NCA-2026-0005',
      'nca-2026-0004 ',
      'NCA-2026-0006',
    ]);
    expect(assignNumbers([null], '', 2027)).toEqual(['2027-0001']);
    const many = assignNumbers(
      Array.from({ length: 10001 }, () => null),
      'A',
      2026,
    );
    expect(many[9999]).toBe('A-2026-10000');
    expect(new Set(many).size).toBe(many.length);
    expect(cleanPrefix(' nca 2026/ ')).toBe('NCA2026');
    expect(cleanPrefix('星河-XH-')).toBe('XH');
  });

  it('checks the sample list the way the page shows it', () => {
    for (const lang of ['zh', 'en'] as const) {
      const prefix = lang === 'zh' ? 'XH' : 'NCA';
      const roster = buildRoster(cellsToRows(sampleList(lang, TODAY, prefix).cells));
      const map = detectMapping(roster.headers);
      expect(map).toEqual({ name: 1, course: 2, grade: 3, date: 4, number: 5 });
      const { rows: checked, stats } = checkRoster(roster, map, { prefix, issueDate: '2026-11-26' });
      expect(stats).toEqual({ rows: 14, ok: 11, stopped: 2, skipped: 1 });
      expect(checked.filter((r) => r.status === 'stop').map((r) => r.issues[0].code)).toEqual([
        'missing_course',
        'duplicate',
      ]);
      const numbers = checked.filter((r) => r.status === 'ok').map((r) => r.number);
      expect(numbers.slice(0, 6)).toEqual(
        [1, 2, 4, 5, 3, 6].map((n) => `${prefix}-2026-${String(n).padStart(4, '0')}`),
      );
      expect(new Set(numbers).size).toBe(11);
      // Every date in the sample is understood.
      expect(
        checked.filter((r) => r.status === 'ok' && !r.dateFromIssue).every((r) => /^2026-11-(08|11|14)$/.test(r.date)),
      ).toBe(true);
    }
  });
});

describe('output files', () => {
  it('names PNG files safely and uniquely', () => {
    expect(pngFileName('NCA-2026-0001', 'Emma Carter')).toBe('NCA-2026-0001 Emma Carter.png');
    expect(pngFileName('A/1', '王:子?涵')).toBe('A_1 王_子_涵.png');
    expect(uniqueNames(['a.png', 'A.png', 'a.png', 'b'])).toEqual(['a.png', 'A (2).png', 'a (3).png', 'b']);
  });

  it('fits text: shrinks a long name, wraps a long sentence', () => {
    const measure = (text: string, size: number) => Array.from(text).length * size * 0.5;
    expect(fitFontSize((s) => measure('Emma Carter', s), 780, 66, 26)).toBe(66);
    const long = 'Maximiliana Alexandra Fitzgerald-Montgomery';
    const size = fitFontSize((s) => measure(long, s), 780, 66, 26);
    expect(size).toBeLessThan(66);
    expect(measure(long, size)).toBeLessThanOrEqual(780);
    expect(fitFontSize((s) => measure('x'.repeat(500), s), 780, 66, 26)).toBe(26);

    const cn = '已完成「Python 数据分析入门训练营」全部课程的学习，考核等级：优秀，特发此证。';
    const lines = wrapText((s) => measure(s, 20), cn, 300);
    expect(lines.join('').replace(/\s/g, '')).toBe(cn.replace(/\s/g, ''));
    expect(lines.every((l) => !/^[，。」]/.test(l))).toBe(true);
    const fitted = fitParagraph(measure, 'word '.repeat(80), 200, 23, 16, 2);
    expect(fitted.size).toBe(16);
    expect(fitted.lines).toHaveLength(2);
    expect(fitted.lines[1].endsWith('…')).toBe(true);
  });
});

describe('pdf', () => {
  const fakeJpeg = (n: number) =>
    new Uint8Array([0xff, 0xd8, ...Array.from({ length: n }, (_, i) => i % 251), 0xff, 0xd9]);

  it('writes a valid structure with correct cross-reference offsets', () => {
    const pages = [fakeJpeg(300), fakeJpeg(10), fakeJpeg(7000)].map((jpeg) => ({ jpeg, width: 1754, height: 1240 }));
    const pdf = buildPdf(pages, {
      title: '全部证书 - 星河编程学院（示例）',
      date: new Date(Date.UTC(2026, 10, 26, 8, 30)),
    });
    const text = Array.from(pdf, (b) => String.fromCharCode(b)).join('');
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.endsWith('%%EOF\n')).toBe(true);

    const size = 4 + pages.length * 3;
    expect(text.match(/^\d+ 0 obj$/gm)).toHaveLength(size - 1);
    const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 5)).toBe('xref\n');
    const table = text.slice(startxref).split('\n');
    expect(table[1]).toBe(`0 ${size}`);
    expect(table[2]).toBe('0000000000 65535 f ');
    for (let n = 1; n < size; n++) {
      const entry = table[2 + n];
      expect(entry).toMatch(/^\d{10} 00000 n $/);
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + `${n} 0 obj`.length)).toBe(`${n} 0 obj`);
    }
    expect(text).toMatch(
      new RegExp(`trailer\\n<< /Size ${size} /Root 1 0 R /Info 3 0 R /ID \\[<[0-9A-F]{32}> <[0-9A-F]{32}>\\] >>`),
    );
    expect(text).toContain('/Count 3');
    expect(text).toContain('/Kids [4 0 R 7 0 R 10 0 R]');
    expect(text).toContain('/MediaBox [0 0 841.89 595.28]');
    expect(text).toContain('/Filter /DCTDecode /Length 7004 >>');
    expect(text).toContain(`/Title ${pdfString('全部证书 - 星河编程学院（示例）')}`);
    expect(text).toContain('/CreationDate (D:20261126083000Z)');
    // Each image stream holds exactly the JPEG bytes.
    const at = text.indexOf('/Length 14 >>\nstream\n') + '/Length 14 >>\nstream\n'.length;
    expect(Array.from(pdf.subarray(at, at + 14))).toEqual(Array.from(pages[1].jpeg));
    expect(text.slice(at + 14, at + 24)).toBe('\nendstream');
  });

  it('encodes PDF strings', () => {
    expect(pdfString('All (sample) \\ certificates')).toBe('(All \\(sample\\) \\\\ certificates)');
    expect(pdfString('证书')).toBe('<FEFF8BC14E66>');
  });
});
