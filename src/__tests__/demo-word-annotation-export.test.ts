import { describe, expect, it } from 'vitest';
import { createZip, readZip } from '../lib/files/zip';
import {
  FONTS,
  buildDocx,
  documentXml,
  readDocx,
  runXml,
  stylesXml,
  type DocxOptions,
} from '../demos/word-annotation-export/docx';
import { articleFileName, buildExport } from '../demos/word-annotation-export/exporting';
import { LoadError, MAX_CHARS, importFile } from '../demos/word-annotation-export/load';
import { parseDocument, parseInline, type ParseWarning } from '../demos/word-annotation-export/parse';
import { sampleText } from '../demos/word-annotation-export/sample';
import { escapeXml, scanXml } from '../demos/word-annotation-export/xml';

const enc = new TextEncoder();
const dec = new TextDecoder();
const FULL_WIDTH_SPACE = String.fromCharCode(0x3000);
const OPTS: DocxOptions = { keepBrackets: true, highlight: 'yellow', font: 'songti', title: '批注导出' };
const NAMES = { combined: 'all.docx', zip: (n: number) => `all-${n}.zip`, untitled: 'Opening', docTitle: 'Doc' };

// ---------- a small, independent XML well-formedness check ----------

const ENTITY = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;
const NAME = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?/;
const ATTR = /\s+([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/y;

/** Returns null when the document is well formed, otherwise what is wrong. */
function wellFormed(xml: string): string | null {
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')) return 'missing XML declaration';
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(xml)) return 'character not allowed in XML';
  let i = xml.indexOf('?>') + 2;
  const stack: string[] = [];
  const prefixes = new Set<string>();
  let rootDone = false;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    const text = xml.slice(i, lt < 0 ? xml.length : lt);
    if (ENTITY.test(text)) return `stray & in text near ${i}`;
    if (text.trim() && !stack.length) return `text outside the root near ${i}`;
    if (lt < 0) break;
    if (xml.startsWith('<!--', lt)) {
      i = xml.indexOf('-->', lt) + 3;
      continue;
    }
    if (xml[lt + 1] === '?' || xml[lt + 1] === '!') return `unexpected markup near ${lt}`;
    const gt = xml.indexOf('>', lt);
    if (gt < 0) return 'unterminated tag';
    const tag = xml.slice(lt + 1, gt);
    i = gt + 1;
    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim();
      const open = stack.pop();
      if (open !== name) return `</${name}> closes <${open}>`;
      if (!stack.length) rootDone = true;
      continue;
    }
    if (rootDone) return 'a second root element';
    const self = tag.endsWith('/');
    const body = self ? tag.slice(0, -1) : tag;
    const m = NAME.exec(body);
    if (!m) return `bad element name in <${body}>`;
    if (m[0].includes(':')) prefixes.add(m[0].split(':')[0]);
    const rest = body.slice(m[0].length);
    const seen = new Set<string>();
    let pos = 0;
    while (pos < rest.length && !/^\s*$/.test(rest.slice(pos))) {
      ATTR.lastIndex = pos;
      const a = ATTR.exec(rest);
      if (!a) return `bad attribute in <${m[0]}${rest}>`;
      if (seen.has(a[1])) return `duplicate attribute ${a[1]}`;
      seen.add(a[1]);
      if (a[1].includes(':') && !a[1].startsWith('xmlns:') && !a[1].startsWith('xml:'))
        prefixes.add(a[1].split(':')[0]);
      if (ENTITY.test(a[2] ?? a[3] ?? '')) return `stray & in attribute ${a[1]}`;
      pos = ATTR.lastIndex;
    }
    if (self) {
      if (!stack.length) rootDone = true;
    } else stack.push(m[0]);
  }
  if (stack.length) return `<${stack[stack.length - 1]}> is never closed`;
  if (!rootDone) return 'no root element';
  for (const p of prefixes) if (!xml.includes(`xmlns:${p}="`)) return `namespace prefix ${p} is not declared`;
  return null;
}

// ---------- child order as the OOXML schema requires ----------

const ORDER: Record<string, string[]> = {
  rPr: [
    'rStyle',
    'rFonts',
    'b',
    'bCs',
    'i',
    'iCs',
    'caps',
    'smallCaps',
    'strike',
    'dstrike',
    'outline',
    'shadow',
    'emboss',
    'imprint',
    'noProof',
    'snapToGrid',
    'vanish',
    'webHidden',
    'color',
    'spacing',
    'w',
    'kern',
    'position',
    'sz',
    'szCs',
    'highlight',
    'u',
    'effect',
    'bdr',
    'shd',
    'fitText',
    'vertAlign',
    'rtl',
    'cs',
    'em',
    'lang',
    'eastAsianLayout',
  ],
  pPr: [
    'pStyle',
    'keepNext',
    'keepLines',
    'pageBreakBefore',
    'framePr',
    'widowControl',
    'numPr',
    'suppressLineNumbers',
    'pBdr',
    'shd',
    'tabs',
    'suppressAutoHyphens',
    'kinsoku',
    'wordWrap',
    'overflowPunct',
    'topLinePunct',
    'autoSpaceDE',
    'autoSpaceDN',
    'bidi',
    'adjustRightInd',
    'snapToGrid',
    'spacing',
    'ind',
    'contextualSpacing',
    'mirrorIndents',
    'suppressOverlap',
    'jc',
    'textDirection',
    'textAlignment',
    'textboxTightWrap',
    'outlineLvl',
    'divId',
    'cnfStyle',
    'rPr',
  ],
  style: [
    'name',
    'aliases',
    'basedOn',
    'next',
    'link',
    'autoRedefine',
    'hidden',
    'uiPriority',
    'semiHidden',
    'unhideWhenUsed',
    'qFormat',
    'locked',
    'personal',
    'personalCompose',
    'personalReply',
    'rsid',
    'pPr',
    'rPr',
  ],
  sectPr: [
    'headerReference',
    'footerReference',
    'footnotePr',
    'endnotePr',
    'type',
    'pgSz',
    'pgMar',
    'paperSrc',
    'pgBorders',
    'lnNumType',
    'pgNumType',
    'cols',
    'formProt',
    'vAlign',
    'noEndnote',
    'titlePg',
    'textDirection',
    'bidi',
    'rtlGutter',
    'docGrid',
  ],
  settings: [
    'writeProtection',
    'view',
    'zoom',
    'removePersonalInformation',
    'defaultTabStop',
    'characterSpacingControl',
    'compat',
  ],
  docDefaults: ['rPrDefault', 'pPrDefault'],
};
/** In a run, rPr comes first; after it t / tab / br repeat in any order. */
const RUN_CONTENT = ['t', 'tab', 'br'];

/** Every element whose children must come in schema order, with its children's names as found. */
function childOrderProblems(xml: string): string[] {
  const problems: string[] = [];
  const stack: { name: string; children: string[] }[] = [];
  scanXml(xml, {
    open(name) {
      stack[stack.length - 1]?.children.push(name);
      stack.push({ name, children: [] });
    },
    close() {
      const el = stack.pop();
      if (!el) return;
      if (el.name === 'r') {
        el.children.forEach((child, i) => {
          if (child === 'rPr' ? i > 0 : !RUN_CONTENT.includes(child)) problems.push(`<${child}> misplaced in <r>`);
        });
        return;
      }
      const order = ORDER[el.name];
      if (!order) return;
      let last = -1;
      for (const child of el.children) {
        const at = order.indexOf(child);
        if (at < 0) problems.push(`<${child}> is not expected in <${el.name}>`);
        else if (at <= last) problems.push(`<${child}> is out of order in <${el.name}>: ${el.children.join(', ')}`);
        last = Math.max(last, at);
      }
    },
  });
  return problems;
}

describe('annotations', () => {
  const inline = (text: string) => {
    const warnings: ParseWarning[] = [];
    const parts = parseInline(text, 7, warnings).map((p) => `${p.kind}:${p.text}`);
    return { parts, warnings: warnings.map((w) => `${w.code}@${w.line}`) };
  };

  it('finds annotations anywhere in a line', () => {
    expect(inline('前文【批注】后文').parts).toEqual(['text:前文', 'note:批注', 'text:后文']);
    expect(inline('【开头】文字').parts).toEqual(['note:开头', 'text:文字']);
    expect(inline('行尾的批注【到这里】').parts).toEqual(['text:行尾的批注', 'note:到这里']);
    expect(inline('【a】【b】').parts).toEqual(['note:a', 'note:b']);
    expect(inline('no notes here').parts).toEqual(['text:no notes here']);
  });

  it('treats nested brackets as one annotation', () => {
    expect(inline('看【外层【内层】外层】完').parts).toEqual(['text:看', 'note:外层【内层】外层', 'text:完']);
  });

  it('keeps unclosed, stray and empty brackets as text, with a warning', () => {
    expect(inline('写到一半【没有闭合')).toEqual({ parts: ['text:写到一半【没有闭合'], warnings: ['unclosed@7'] });
    expect(inline('前【外【内】后')).toEqual({
      parts: ['text:前【外', 'note:内', 'text:后'],
      warnings: ['unclosed@7'],
    });
    expect(inline('多了】一个')).toEqual({ parts: ['text:多了】一个'], warnings: ['stray_close@7'] });
    expect(inline(`a【】b【 ${FULL_WIDTH_SPACE}】c`)).toEqual({
      parts: [`text:a【】b【 ${FULL_WIDTH_SPACE}】c`],
      warnings: ['empty@7', 'empty@7'],
    });
  });
});

describe('articles', () => {
  it('splits at "# " headings, including a full-width ＃ and space', () => {
    const doc = parseDocument(
      [
        'Intro line.',
        '',
        '# First【shorter?】',
        'Body 1',
        '',
        `＃${FULL_WIDTH_SPACE}第二篇`,
        '#hashtag stays text',
        '## also text',
        '  Body 2  ',
      ].join('\r\n'),
    );
    expect(doc.paras.map((p) => `${p.kind}@${p.line}`)).toEqual([
      'para@1',
      'heading@3',
      'para@4',
      'heading@6',
      'para@7',
      'para@8',
      'para@9',
    ]);
    expect(doc.articles.map((a) => [a.title, a.paras.length])).toEqual([
      [null, 1],
      ['First', 2],
      ['第二篇', 4],
    ]);
    expect(doc.notes).toBe(1);
    expect(doc.paras[6].inlines).toEqual([{ kind: 'text', text: 'Body 2' }]);
  });

  it('counts the sample: three articles with six annotations each way', () => {
    for (const lang of ['zh', 'en'] as const) {
      const doc = parseDocument(sampleText(lang));
      expect(doc.articles).toHaveLength(3);
      expect(doc.notes).toBe(6);
      expect(doc.warnings).toEqual([]);
    }
  });
});

describe('xml escaping', () => {
  it('escapes markup and drops what XML forbids', () => {
    expect(escapeXml('<a href="x">Tom & Jerry</a>')).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;');
    expect(escapeXml(`a${String.fromCharCode(1)}b${String.fromCharCode(0xffff)}c`)).toBe('abc');
    expect(escapeXml(`${String.fromCharCode(0xd800)}x`)).toBe(`${String.fromCharCode(0xfffd)}x`);
    expect(escapeXml('emoji 😀 stays')).toBe('emoji 😀 stays');
    expect(escapeXml('tab\tand\nline')).toBe('tab\tand\nline');
  });

  it('writes runs: red + highlight for notes, preserved spaces, tabs', () => {
    expect(runXml('批注', true, 'cyan')).toBe(
      '<w:r><w:rPr><w:color w:val="FF0000"/><w:highlight w:val="cyan"/></w:rPr><w:t>批注</w:t></w:r>',
    );
    expect(runXml(' lead', false, 'yellow')).toBe('<w:r><w:t xml:space="preserve"> lead</w:t></w:r>');
    expect(runXml('a\tb', false, 'yellow')).toBe('<w:r><w:t>a</w:t><w:tab/><w:t>b</w:t></w:r>');
    expect(runXml('', true, 'yellow')).toBe('');
  });
});

describe('docx package', () => {
  const hostile =
    '# Title <&> "quotes"\nText with <tags>, & ampersands, 【a note with "quotes" & <brackets>】\tand a tab.';

  it('has every part, typed and linked, and every XML part is well formed', async () => {
    for (const font of ['songti', 'calibri'] as const) {
      const doc = parseDocument(`${sampleText('zh')}\n${hostile}`);
      const files = await readZip(buildDocx(doc.paras, { ...OPTS, font, title: 'Title <&> "x"' }));
      const names = [...files.keys()];
      expect(names.sort()).toEqual(
        [
          '[Content_Types].xml',
          '_rels/.rels',
          'docProps/app.xml',
          'docProps/core.xml',
          'word/_rels/document.xml.rels',
          'word/document.xml',
          'word/settings.xml',
          'word/styles.xml',
        ].sort(),
      );
      const text = (n: string) => dec.decode(files.get(n));
      for (const n of names) expect([n, wellFormed(text(n))]).toEqual([n, null]);

      // [Content_Types].xml covers every part, and names only parts that exist.
      const types = text('[Content_Types].xml');
      const defaults = [...types.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => m[1]);
      const overrides = [...types.matchAll(/<Override PartName="\/([^"]+)"/g)].map((m) => m[1]);
      for (const n of names.filter((x) => x !== '[Content_Types].xml')) {
        expect([n, overrides.includes(n) || defaults.includes(n.split('.').pop() ?? '')]).toEqual([n, true]);
      }
      for (const o of overrides) expect(names).toContain(o);
      expect(types).toContain('wordprocessingml.document.main+xml');

      // Every relationship points at a part in the package.
      for (const [relsPart, folder] of [
        ['_rels/.rels', ''],
        ['word/_rels/document.xml.rels', 'word/'],
      ] as const) {
        for (const m of text(relsPart).matchAll(/Target="([^"]+)"/g)) expect(names).toContain(folder + m[1]);
      }

      // Children in schema order everywhere it matters.
      for (const n of ['word/document.xml', 'word/styles.xml', 'word/settings.xml']) {
        expect([n, childOrderProblems(text(n))]).toEqual([n, []]);
      }
      expect(text('word/styles.xml')).toContain(`w:eastAsia="${FONTS[font].eastAsia}"`);
      expect(text('docProps/core.xml')).toContain('<dc:title>Title &lt;&amp;&gt; &quot;x&quot;</dc:title>');
      expect(text('docProps/core.xml')).toMatch(
        /<dcterms:created xsi:type="dcterms:W3CDTF">\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ</,
      );
    }
  });

  it('marks headings with Heading1 and notes with red text on the chosen highlight', () => {
    const doc = parseDocument('# 标题【改短一点】\n正文【批注】结束');
    const xml = documentXml(doc.paras, { ...OPTS, highlight: 'green' });
    expect(xml).toContain('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>标题</w:t></w:r>');
    expect(xml).toContain(
      '<w:r><w:rPr><w:color w:val="FF0000"/><w:highlight w:val="green"/></w:rPr><w:t>【批注】</w:t></w:r>',
    );
    const bare = documentXml(doc.paras, { ...OPTS, keepBrackets: false });
    expect(bare).toContain('<w:t>批注</w:t>');
    expect(bare).not.toContain('【');
    const styles = stylesXml(OPTS);
    expect(styles).toContain('<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>');
    expect(styles).toContain('<w:ind w:firstLineChars="200" w:firstLine="480"/>');
    expect(stylesXml({ ...OPTS, font: 'times' })).not.toContain('firstLineChars="200"');
    // An empty document still has one paragraph.
    expect(documentXml([], OPTS)).toContain('<w:body><w:p/><w:sectPr>');
  });
});

describe('import', () => {
  it('round-trips its own export, with or without brackets', async () => {
    for (const lang of ['zh', 'en'] as const) {
      const source = sampleText(lang);
      const doc = parseDocument(source);
      for (const keepBrackets of [true, false]) {
        const back = await readDocx(buildDocx(doc.paras, { ...OPTS, keepBrackets }));
        expect(back).toBe(source);
      }
    }
  });

  it('reads headings, highlights, tabs and breaks from a Word-made file, skipping deleted text and field codes', async () => {
    const W =
      'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
    const document =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>` +
      '<w:p><w:pPr><w:pStyle w:val="1"/><w:rPr><w:highlight w:val="yellow"/></w:rPr></w:pPr><w:r><w:t>第一篇</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">正文 </w:t></w:r><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>批</w:t></w:r>' +
      '<w:r><w:rPr><w:color w:val="FF0000"/><w:highlight w:val="yellow"/></w:rPr><w:t>注</w:t></w:r><w:r><w:t>。</w:t></w:r></w:p>' +
      '<w:p><w:del w:id="1" w:author="x"><w:r><w:delText>删掉的</w:delText></w:r></w:del><w:ins w:id="2" w:author="x"><w:r><w:t>新加的</w:t></w:r></w:ins>' +
      '<w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C</w:t></w:r></w:p>' +
      '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>3</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' +
      '<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><w:txbxContent><w:p><w:r><w:t>文本框</w:t></w:r></w:p></w:txbxContent></w:drawing></mc:Choice>' +
      '<mc:Fallback><w:pict><w:txbxContent><w:p><w:r><w:t>文本框</w:t></w:r></w:p></w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>' +
      '<w:p/><w:p/>' +
      '<w:p><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:r><w:t>Second &amp; last</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="2"/></w:pPr><w:r><w:t>小标题</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    const styles =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>` +
      '<w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="2"><w:name w:val="heading 2"/></w:style></w:styles>';
    const file = createZip([
      { name: 'word/document.xml', data: document },
      { name: 'word/styles.xml', data: styles },
    ]);
    expect((await readDocx(file)).split('\n')).toEqual([
      '# 第一篇',
      '正文 【批注】。',
      '新加的A\tB',
      'C',
      '3',
      '文本框',
      '',
      '# Second & last',
      '小标题',
    ]);
  });

  it('opens text files and refuses what it cannot read', async () => {
    const code = async (name: string, bytes: Uint8Array) => {
      try {
        await importFile(name, bytes);
        return 'ok';
      } catch (e) {
        return e instanceof LoadError ? e.code : 'other';
      }
    };
    // "第一行\r\n【批注】" in GBK
    const gbk = new Uint8Array([
      0xb5, 0xda, 0xd2, 0xbb, 0xd0, 0xd0, 0x0d, 0x0a, 0xa1, 0xbe, 0xc5, 0xfa, 0xd7, 0xa2, 0xa1, 0xbf,
    ]);
    expect(await importFile('稿子.txt', gbk)).toEqual({ text: '第一行\n【批注】', truncated: false });
    const long = await importFile('long.md', enc.encode('字'.repeat(MAX_CHARS + 10)));
    expect(long.truncated).toBe(true);
    expect(long.text).toHaveLength(MAX_CHARS);
    expect(await code('old.doc', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe('doc');
    expect(await code('list.xlsx', createZip([{ name: 'xl/workbook.xml', data: '<workbook/>' }]))).toBe('not_docx');
    expect(await code('broken.docx', enc.encode('PK but not a zip archive at all'))).toBe('corrupt');
    expect(await code('scan.pdf', enc.encode('%PDF-1.7 binary'))).toBe('unsupported');
    expect(await code('photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe('unsupported');
    expect(await code('empty.txt', enc.encode('  \n \n'))).toBe('empty');
    expect(await code('huge.txt', new Uint8Array(11 * 1024 * 1024))).toBe('too_big');
  });
});

describe('export', () => {
  it('builds one file, or one per article plus a ZIP', async () => {
    const doc = parseDocument(sampleText('zh'));
    const one = buildExport(doc, { keepBrackets: true, highlight: 'yellow', font: 'songti', split: false }, NAMES);
    expect(one.files.map((f) => [f.name, f.title])).toEqual([['all.docx', '春季读书会招募启事']]);
    expect(one.bundle).toBeNull();
    expect(one.size).toBe(one.files[0].bytes.length);
    expect(one.ms).toBeGreaterThanOrEqual(0);

    const split = buildExport(doc, { keepBrackets: true, highlight: 'yellow', font: 'songti', split: true }, NAMES);
    expect(split.files.map((f) => f.name)).toEqual([
      '01 春季读书会招募启事.docx',
      '02 三月社区活动回顾.docx',
      '03 致志愿者的一封感谢信.docx',
    ]);
    expect(split.bundle?.name).toBe('all-3.zip');
    const inZip = await readZip(split.bundle?.bytes ?? new Uint8Array());
    expect([...inZip.keys()]).toEqual(split.files.map((f) => f.name));
    const articles = sampleText('zh').split('\n\n');
    for (let i = 0; i < 3; i++) expect(await readDocx(split.files[i].bytes)).toBe(articles[i]);
  });

  it('names article files safely and uniquely', () => {
    const taken = new Set<string>();
    expect(articleFileName(0, 'A/B: "C"?', taken)).toBe('01 A-B - C.docx');
    expect(articleFileName(1, 'Spring Book Club: Call for Members', taken)).toBe(
      '02 Spring Book Club - Call for Members.docx',
    );
    expect(articleFileName(2, '标题：副标题', taken)).toBe('03 标题：副标题.docx');
    expect(articleFileName(9, 'Same', taken)).toBe('10 Same.docx');
    expect(articleFileName(9, 'same', taken)).toBe('10 same (2).docx');
  });

  it('keeps text before the first heading as its own article when splitting', () => {
    const doc = parseDocument('Preface\n# One\nA\n# Two\nB');
    const built = buildExport(doc, { keepBrackets: true, highlight: 'yellow', font: 'calibri', split: true }, NAMES);
    expect(built.files.map((f) => f.name)).toEqual(['01 Opening.docx', '02 One.docx', '03 Two.docx']);
  });
});
