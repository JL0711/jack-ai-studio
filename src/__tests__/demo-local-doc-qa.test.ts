import { describe, expect, it } from 'vitest';
import { createZip } from '../lib/files/zip';
import { markSpans, segments } from '../demos/local-doc-qa/answer';
import { chunkPage, pdfItemsToText, reflowLines, splitParts, splitSentences, tightenCjkSpacing } from '../demos/local-doc-qa/chunk';
import { docxToPages, parseDocx, scanDocumentXml } from '../demos/local-doc-qa/docx';
import { cleanMarkdown, detectKind, textToPages } from '../demos/local-doc-qa/parse';
import { SAMPLE_SETS } from '../demos/local-doc-qa/samples';
import { Engine } from '../demos/local-doc-qa/search';
import { deriveSuggestions, usableHeading } from '../demos/local-doc-qa/suggest';
import { TEXT, fmt } from '../demos/local-doc-qa/text';
import { normalizeCjkForms, normalizeNumber, stem, tokenize } from '../demos/local-doc-qa/tokenize';
import type { SourceDoc } from '../demos/local-doc-qa/types';

const terms = (text: string, kind?: string) =>
  tokenize(text)
    .filter((t) => !kind || t.kind === kind)
    .map((t) => t.term);

function doc(id: string, pages: string[], title = id): SourceDoc {
  return { id, title, origin: 'upload', kind: 'txt', pageLabel: 'page', pages };
}

function engineWith(...docs: SourceDoc[]): Engine {
  const e = new Engine();
  for (const d of docs) e.addDoc(d);
  e.setActive(docs.map((d) => d.id));
  return e;
}

describe('doc-qa tokenizer', () => {
  it('cuts Chinese into overlapping bigrams plus single characters', () => {
    expect(terms('年假天数', 'bi')).toEqual(['年假', '假天', '天数']);
    expect(terms('年假天数', 'uni')).toEqual(['年', '假', '天', '数']);
    // The commonest particles are not indexed on their own.
    expect(terms('员工的年假', 'uni')).not.toContain('的');
    // Offsets point back into the original text.
    const t = tokenize('出差：酒店').find((x) => x.term === '酒店');
    expect(t && '出差：酒店'.slice(t.start, t.end)).toBe('酒店');
  });

  it('lowercases, stems and drops stopwords in English', () => {
    expect(terms('The Reimbursed expenses of the trip', 'word')).toEqual([stem('reimburse'), stem('expense'), 'trip']);
    const same = [
      ['reimburse', 'reimbursed', 'reimbursement', 'reimbursable'],
      ['policy', 'policies'],
      ['approve', 'approved', 'approval'],
      ['submit', 'submitted', 'submitting'],
      ['change', 'changed', 'changing', 'changes'],
      ['agree', 'agreed', 'agreement'],
      ['travel', 'travelled', 'travelling'],
      ['night', 'nightly', 'nights'],
      ['use', 'used', 'using'],
    ];
    for (const group of same) expect(new Set(group.map(stem)).size, group.join('/')).toBe(1);
    expect(stem('warranty')).not.toBe(stem('warn'));
  });

  it('keeps numbers, amounts and codes as tokens', () => {
    expect(normalizeNumber('2,000')).toEqual(['2000']);
    expect(normalizeNumber('45.00')).toEqual(['45']);
    expect(normalizeNumber('12.50')).toEqual(['12.5']);
    expect(terms('上限 600 元，¥600，CNY 3,000', 'num')).toEqual(['600', '600', '3000']);
    expect(terms('故障代码 E03')).toContain('e03');
    expect(terms('SC-22 compressor')).toEqual(expect.arrayContaining(['sc', '22', 'sc22']));
    expect(terms('380V supply')).toEqual(expect.arrayContaining(['380v', '380']));
    // Full-width digits and letters count as plain ones.
    expect(terms('ＥＸＴ ８１００')).toEqual(expect.arrayContaining(['ext', '8100']));
  });

  it('maps look-alike radicals from PDF fonts back to normal characters', () => {
    const lookalike = [0x2f00, 0x2f64, 0x2ed4].map((c) => String.fromCharCode(c)); // radicals "one", "use", simplified "gate"
    expect(normalizeCjkForms(`${lookalike[0]}、适${lookalike[1]}范围，部${lookalike[2]}负责人`)).toBe('一、适用范围，部门负责人');
    const text = '（示例）…';
    expect(normalizeCjkForms(text)).toBe(text);
  });

  it('marks negated words so "not covered" differs from "covered"', () => {
    expect(terms('What isn’t covered?')).toContain('not:cover');
    expect(terms('does not cover', 'neg')).toEqual(['not:cover']);
    expect(terms('is covered', 'neg')).toEqual([]);
    expect(terms('IT Service Desk', 'word')).toContain('it');
  });
});

describe('doc-qa chunking', () => {
  it('splits sentences in Chinese and English, keeping offsets', () => {
    const zh = '第一句。第二句！第三句？\n标题\n最后一句；还有';
    const s = splitSentences(zh).map((x) => zh.slice(x.start, x.end));
    expect(s).toEqual(['第一句。', '第二句！', '第三句？', '标题', '最后一句；', '还有']);
    expect(splitSentences(zh, false).map((x) => zh.slice(x.start, x.end))).toContain('最后一句；还有');

    const en = 'Call ext. 8100 now. Spruce Equipment Co. (sample) sells 1.5 kW units.\n1. Hotels\nSee e.g. the list. Done!';
    const parts = splitSentences(en).map((x) => en.slice(x.start, x.end));
    expect(parts).toEqual(['Call ext. 8100 now.', 'Spruce Equipment Co. (sample) sells 1.5 kW units.', '1. Hotels', 'See e.g. the list.', 'Done!']);
    expect(splitSentences(en).find((x) => en.slice(x.start, x.end) === '1. Hotels')?.heading).toBe(true);
  });

  it('packs sentences into passages of about 200–450 characters, starting at headings', () => {
    const body = Array.from({ length: 24 }, (_, i) => `This is sentence number ${i + 1} of a long policy page about travel.`).join(' ');
    const text = `1. Travel\n${body}\n2. Meals\nShort section about meals.`;
    const passages = chunkPage(text);
    expect(passages.length).toBeGreaterThan(3);
    for (const p of passages.slice(0, -1)) {
      expect(p.end - p.start).toBeLessThanOrEqual(520);
      expect(p.end - p.start).toBeGreaterThanOrEqual(100);
    }
    const last = passages[passages.length - 1];
    expect(text.slice(last.start, last.end)).toBe('2. Meals\nShort section about meals.');
    expect(passages[1].heading).toBe('Travel');
    // Neighbouring passages overlap by a sentence.
    expect(passages[1].start).toBeLessThan(passages[0].end);
  });

  it('splits long texts without pages into parts at paragraph boundaries', () => {
    const paras = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}. ${'Lorem ipsum dolor sit amet. '.repeat(6).trim()}`);
    const parts = splitParts(paras.join('\n'));
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.join('\n')).toBe(paras.join('\n'));
  });

  it('rejoins PDF lines into paragraphs', () => {
    const text = reflowLines([
      { text: 'Hotel costs on business trips are reimbursed up to a', y: 700 },
      { text: 'nightly limit per person that depends on the city.', y: 686 },
      { text: 'Short last line.', y: 672 },
      { text: '- Beijing: CNY 600 a night', y: 658 },
      { text: 'A hyphen-', y: 600 },
      { text: 'ated word continues here and then the paragraph goes on.', y: 586 },
    ]);
    expect(text.split('\n')).toEqual([
      'Hotel costs on business trips are reimbursed up to a nightly limit per person that depends on the city. Short last line.',
      '- Beijing: CNY 600 a night',
      'A hyphenated word continues here and then the paragraph goes on.',
    ]);
    expect(reflowLines([{ text: '出差住宿按城市分档，每人每晚的报销' }, { text: '上限如下：' }])).toBe('出差住宿按城市分档，每人每晚的报销上限如下：');
    expect(tightenCjkSpacing('员 工 手 册 第 3 页')).toBe('员工手册第 3 页');
    expect(tightenCjkSpacing('第三条 住宿标准')).toBe('第三条 住宿标准');
    expect(
      pdfItemsToText([
        { str: '第三条 住宿标准', hasEOL: true, transform: [16, 0, 0, 16, 72, 720] },
        { str: '出差住宿按城市分档，', hasEOL: false, transform: [12, 0, 0, 12, 72, 690] },
        { str: '每人每晚的报销上限如下。', hasEOL: true, transform: [12, 0, 0, 12, 200, 690] },
      ]),
    ).toBe('第三条 住宿标准\n出差住宿按城市分档，每人每晚的报销上限如下。');
    // A numbered heading written with a look-alike radical ("⼆" for 二) still starts a new paragraph.
    const two = String.fromCharCode(0x2f06);
    expect(
      pdfItemsToText([
        { str: '本制度适用于公司各部门的物资和服务采购，包括设备、备件、办公用品和外包服务。', hasEOL: true, transform: [11, 0, 0, 11, 72, 709] },
        { str: `${two}、采购申请`, hasEOL: true, transform: [11, 0, 0, 11, 72, 685] },
        { str: '单笔金额 5000 元以下的采购，由部门负责人审批。', hasEOL: true, transform: [11, 0, 0, 11, 72, 661] },
      ]),
    ).toBe('本制度适用于公司各部门的物资和服务采购，包括设备、备件、办公用品和外包服务。\n二、采购申请\n单笔金额 5000 元以下的采购，由部门负责人审批。');
  });
});

describe('doc-qa search (BM25)', () => {
  it('ranks the passage that matches more and rarer terms first', () => {
    const e = engineWith(
      doc('a', ['The hotel limit in Beijing is CNY 600 a night for every business trip.']),
      doc('b', ['Meals are covered with a daily allowance on every business trip.']),
      doc('c', ['The office opens at nine. The hotel nearby has a gym.']),
    );
    const r = e.ask('hotel limit per night');
    expect(r.hits.map((h) => h.doc.id)).toEqual(['a', 'c']);
    expect(r.hits[0].rel).toBe(1);
    expect(r.hits[1].rel).toBeLessThan(1);
    expect(r.answer.status).toBe('ok');
    expect(r.answer.citations[0]).toMatchObject({ n: 1, page: 0 });
    expect(r.timings.search).toBeGreaterThanOrEqual(0);
  });

  it('finds Chinese text without a dictionary and uses synonyms', () => {
    const e = engineWith(
      doc('x', ['公司笔记本电脑丢失的，必须在 2 小时内报告 IT 服务台。']),
      doc('y', ['出差住宿的报销上限是每晚 600 元。']),
    );
    expect(e.ask('电脑丢了怎么办？').hits[0].doc.id).toBe('x');
    // 酒店 is not in the text; its synonym 住宿 is.
    expect(e.ask('酒店每晚能报多少？').hits[0].doc.id).toBe('y');
  });

  for (const lang of ['zh', 'en'] as const) {
    it(`answers every suggested ${lang} question from the right document and page`, () => {
      const set = SAMPLE_SETS[lang];
      const e = engineWith(...set.docs);
      expect(set.questions.length).toBeGreaterThanOrEqual(6);
      for (const sq of set.questions) {
        const r = e.ask(sq.q);
        const top3 = r.hits.slice(0, 3).map((h) => `${h.doc.id}#${h.page + 1}`);
        // As in the real product's test set: the right source is in the top 3 …
        expect(top3, sq.q).toContain(`${sq.doc}#${sq.page}`);
        // … and here the quoted answer also cites it first.
        expect(r.answer.status, sq.q).toBe('ok');
        expect(`${r.answer.citations[0].doc.id}#${r.answer.citations[0].page + 1}`, sq.q).toBe(`${sq.doc}#${sq.page}`);
      }
    });
  }

  it('still finds the right page with both sample languages loaded', () => {
    const e = engineWith(...SAMPLE_SETS.zh.docs, ...SAMPLE_SETS.en.docs);
    for (const sq of [...SAMPLE_SETS.zh.questions, ...SAMPLE_SETS.en.questions]) {
      const top3 = e.ask(sq.q).hits.slice(0, 3).map((h) => `${h.doc.id}#${h.page + 1}`);
      expect(top3, sq.q).toContain(`${sq.doc}#${sq.page}`);
    }
  });

  it('answers paraphrased questions too', () => {
    const cases: Array<[string, string, number]> = [
      ['去上海出差，酒店标准是多少？', 'zh-travel', 2],
      ['加班费怎么算？', 'zh-handbook', 3],
      ['保修期多长？', 'zh-warranty', 1],
      ['口令多久换一次？', 'zh-security', 1],
      ['When is payday?', 'en-handbook', 3],
      ['How long is the warranty?', 'en-warranty', 1],
      ['Do I need the VPN when working from home?', 'en-security', 3],
    ];
    const e = engineWith(...SAMPLE_SETS.zh.docs, ...SAMPLE_SETS.en.docs);
    for (const [q, d, p] of cases) {
      const r = e.ask(q);
      expect(r.answer.status, q).toBe('ok');
      expect(`${r.answer.citations[0].doc.id}#${r.answer.citations[0].page + 1}`, q).toBe(`${d}#${p}`);
    }
  });

  it('says so instead of answering when the documents do not cover a question', () => {
    const e = engineWith(...SAMPLE_SETS.zh.docs, ...SAMPLE_SETS.en.docs);
    for (const q of ['公司食堂的菜单是什么？', '明天北京天气怎么样？', '股票期权怎么行权？', 'What is the capital of France?', 'How do I bake sourdough bread?', 'What’s the weather in Beijing tomorrow?']) {
      const r = e.ask(q);
      expect(r.answer.status, q).toBe('none');
      expect(r.answer.quotes).toEqual([]);
      expect(r.coverage, q).toBeLessThan(0.5);
    }
    expect(e.ask('公司是什么？').answer.status).toBe('vague');
    expect(e.ask('这是什么？').answer.status).toBe('empty');
  });

  it('quotes a list after its lead-in, and both halves of a two-part question', () => {
    const e = engineWith(...SAMPLE_SETS.zh.docs);
    const hotel = e.ask('出差住酒店，每晚最多能报多少？').answer;
    const text = hotel.quotes.map((q) => q.doc.pages[q.page].slice(q.span.start, q.span.end)).join('\n');
    expect(text).toContain('600 元');
    expect(text).toContain('350 元');

    const leave = e.ask('年假有几天？没休完怎么办？').answer;
    const quoted = leave.quotes.map((q) => q.doc.pages[q.page].slice(q.span.start, q.span.end)).join('\n');
    expect(quoted).toContain('7 天带薪年假');
    expect(quoted).toContain('顺延到次年 3 月 31 日');
    expect(leave.citations).toHaveLength(1);
  });

  it('removes documents from the index', () => {
    const e = engineWith(doc('a', ['Overtime is paid at 1.5 times the normal rate.']), doc('b', ['Annual leave is 7 days.']));
    expect(e.ask('overtime pay').hits[0].doc.id).toBe('a');
    e.removeDoc('a');
    e.setActive(['b']);
    expect(e.ask('overtime pay').hits.every((h) => h.doc.id === 'b')).toBe(true);
    expect(e.stats()).toMatchObject({ docs: 1, pages: 1, parts: 0 });
  });
});

describe('doc-qa highlighting', () => {
  it('marks matched words and cuts text into plain, marked and quoted pieces', () => {
    const e = engineWith(...SAMPLE_SETS.en.docs);
    const q = e.analyze('hotel limit');
    const text = 'The hotel limit applies.';
    const marks = markSpans(text, 10, q);
    expect(marks.map((m) => text.slice(m.start - 10, m.end - 10))).toEqual(['hotel', 'limit']);
    const segs = segments(text, 10, marks, [{ start: 14, end: 25 }]);
    expect(segs.map((s) => s.text).join('')).toBe(text);
    expect(segs.find((s) => s.text === 'hotel')).toMatchObject({ mark: true, quote: true });
    expect(segs[0]).toMatchObject({ text: 'The ', mark: false, quote: false });
  });
});

// ---------- files ----------

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const para = (text: string, style = '') =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
function documentXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;
}
function docxBytes(body: string): Uint8Array {
  return createZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: 'word/document.xml', data: documentXml(body) },
  ]);
}

describe('doc-qa Word files', () => {
  it('reads paragraphs, headings, tabs, tables and page breaks from a .docx', async () => {
    const body = [
      para('差旅制度', 'Title'),
      para('住宿标准', '1'),
      '<w:p><w:r><w:t>北京每晚 600 元</w:t></w:r><w:r><w:tab/><w:t>上海 &amp; 广州同样</w:t></w:r></w:p>',
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>城市</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>上限</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
      para('伙食补助', 'Heading2'),
      '<w:p><w:r><mc:AlternateContent xmlns:mc="x"><mc:Choice><w:t>每天 100 元</w:t></mc:Choice><mc:Fallback><w:t>每天 100 元</w:t></mc:Fallback></mc:AlternateContent></w:r></w:p>',
      '<w:p><w:r><w:t>第一章 总则</w:t></w:r><w:r><w:tab/><w:t>3</w:t></w:r></w:p>',
    ].join('');
    const result = await parseDocx(docxBytes(body));
    expect(result.pageLabel).toBe('page');
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]).toBe('差旅制度\n住宿标准\n北京每晚 600 元 上海 & 广州同样\n城市 | 上限');
    // The old-Word fallback copy is skipped, and a table-of-contents line is left out.
    expect(result.pages[1]).toBe('伙食补助\n每天 100 元');
    expect(result.headings).toEqual(['差旅制度', '住宿标准', '伙食补助']);
  });

  it('uses Word’s own page boundaries, and calls the text "parts" when there are none', () => {
    const rendered = scanDocumentXml(
      documentXml(`${para('Page one text.')}<w:p><w:r><w:lastRenderedPageBreak/><w:t>Page two text.</w:t></w:r></w:p>`),
    );
    expect(rendered.renderedBreaks).toBe(1);
    expect(docxToPages(rendered)).toMatchObject({ pageLabel: 'page', pages: ['Page one text.', 'Page two text.'] });

    const plain = scanDocumentXml(documentXml(Array.from({ length: 60 }, (_, i) => para(`Paragraph ${i + 1}. ${'Some words here. '.repeat(10)}`)).join('')));
    const parts = docxToPages(plain);
    expect(parts.pageLabel).toBe('part');
    expect(parts.pages.length).toBeGreaterThan(1);
  });

  it('refuses a ZIP that is not a Word document', async () => {
    await expect(parseDocx(createZip([{ name: 'hello.txt', data: 'hi' }]))).rejects.toMatchObject({ code: 'not_docx' });
  });
});

describe('doc-qa text files', () => {
  it('detects file types by content, not only by name', () => {
    const enc = new TextEncoder();
    expect(detectKind('report.pdf', enc.encode('%PDF-1.7\n...'))).toBe('pdf');
    expect(detectKind('renamed.txt', enc.encode('%PDF-1.4'))).toBe('pdf');
    expect(detectKind('old.doc', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe('doc');
    expect(detectKind('new.docx', new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('docx');
    expect(detectKind('notes.md', enc.encode('# Title'))).toBe('md');
    expect(detectKind('notes.txt', enc.encode('plain text'))).toBe('txt');
    expect(detectKind('photo.jpg', new Uint8Array([0xff, 0xd8, 0xff]))).toBe('unknown');
  });

  it('turns Markdown into readable text and collects headings', () => {
    const md = cleanMarkdown('---\ntitle: x\n---\n# Travel **policy**\nSee [the form](https://example.com) and `OA`.\n\n| City | Limit |\n|---|---|\n| Beijing | 600 |');
    expect(md.headings).toEqual(['Travel policy']);
    expect(md.text).toBe('Travel policy\nSee the form and OA.\n\nCity | Limit\nBeijing | 600');
  });

  it('keeps form-feed pages, otherwise cuts parts', () => {
    expect(textToPages('Page one.\fPage two.', 'txt')).toMatchObject({ pageLabel: 'page', pages: ['Page one.', 'Page two.'] });
    const long = textToPages(Array.from({ length: 50 }, (_, i) => `Line ${i}: ${'text '.repeat(20)}`).join('\n\n'), 'txt');
    expect(long.pageLabel).toBe('part');
    expect(long.pages.length).toBeGreaterThan(1);
  });
});

describe('doc-qa suggestions for uploaded files', () => {
  it('asks about real section titles and checks the answer comes from that file', () => {
    const upload = doc('up:1', [
      'Field Service Guide\n1. Contents\nSee below.\n2. Pump maintenance\nGrease the pump bearings every 300 hours with lithium grease.\n3. Valve inspection\nInspect the relief valves every 6 months and replace worn seals.\n4. Night shift handover\nThe night shift writes the handover log before 06:00.',
    ]);
    const e = engineWith(upload);
    const qs = deriveSuggestions(e, [{ id: 'up:1', title: 'guide.txt', headings: ['Field Service Guide', 'Contents', 'Pump maintenance', 'Valve inspection', 'Night shift handover'] }]);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.some((q) => q.includes('Contents') || q.includes('Field Service Guide'))).toBe(false);
    for (const q of qs) expect(e.ask(q).hits[0].doc.id).toBe('up:1');
    expect(usableHeading('目录')).toBe(false);
    expect(usableHeading('2026-01-01')).toBe(false);
    expect(usableHeading('报销流程')).toBe(true);
  });
});

describe('doc-qa text', () => {
  it('has the same keys in Chinese and English', () => {
    expect(Object.keys(TEXT.en).sort()).toEqual(Object.keys(TEXT.zh).sort());
    for (const [k, v] of Object.entries(TEXT.en)) expect(v, k).not.toBe('');
  });

  it('fills placeholders and picks singular or plural', () => {
    expect(fmt(TEXT.en.docs, { n: 1 })).toBe('1 document');
    expect(fmt(TEXT.en.docs, { n: 5 })).toBe('5 documents');
    expect(fmt(TEXT.zh.docs, { n: 5 })).toBe('5 份文档');
  });
});
