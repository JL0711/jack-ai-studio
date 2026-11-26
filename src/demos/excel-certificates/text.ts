// Every word the certificates demo shows, in Chinese and English.

import type { Lang } from '../../i18n/strings';
import type { Delimiter } from './csv';
import type { ThemeKey } from './draw';
import type { ListErrorCode } from './errors';
import type { FieldKey, Issue } from './roster';

const zh = {
  privacy: '文件只在你的浏览器里处理，不会上传',
  backToSample: '换回示例名单',
  downloadSample: '下载示例 .xlsx',
  downloadSampleTip: '下载后在 Excel 里改一改，再传回来试试',
  dropTitle: '拖入你的 Excel / CSV 名单',
  dropSub: '或点这里选择文件 · .xlsx / .csv · 最大 10 MB',
  dropReading: (name: string) => `正在读取 ${name}…`,

  step1: '名单检查',
  step2: '证书模板',
  step3: '批量生成',
  sourceSample: '示例名单 · 人名和机构都是虚构的',
  sourceFile: (file: string, sheet?: string) => (sheet ? `${file} · 工作表「${sheet}」` : file),
  delimiter: (d: Delimiter) => ({ ',': '逗号分隔', ';': '分号分隔', '\t': '制表符分隔' })[d],

  statRows: '名单行数',
  statOk: '可以生成',
  statStopped: '拦下',
  statSkipped: '跳过',

  tableCaption: '名单检查结果，点一行可以预览这个人的证书',
  rawCaption: '文件里的原始内容，选好列以后开始检查',
  thRow: '行',
  thStatus: '检查',
  thPerson: '姓名 / 课程',
  thDate: '日期',
  thNumber: '证书编号',
  stOk: '通过',
  stSkip: '跳过',
  stStop: '拦下',
  numNew: '自动编号',
  numKept: '名单里原有，保留',
  dateFromIssue: '空 · 用发证日期',
  emptyList: '表头下面还没有名单。',
  tagShrink: '自动缩小',
  showAll: (n: number) => `再显示 ${n} 行`,

  reasonBlank: '空行',
  reasonMissingName: '缺少姓名',
  reasonMissingCourse: '缺少课程',
  reasonBadDate: (v: string) => `日期看不懂：「${v}」`,
  reasonDuplicate: (r: number) => `重复：和第 ${r} 行的姓名、课程相同`,
  reasonDupNumber: (r: number, v: string) => `证书编号 ${v} 和第 ${r} 行重复`,
  reasonJoin: '；',

  mapTitle: '列对应',
  mapAuto: (n: number) => `自动认出了 ${n} 列`,
  mapManual: (n: number) => `已对应 ${n} 列`,
  mapMissing: '没找到姓名或课程在哪一列，请在下面选一下。',
  mapHint: (row: number) => `表头在第 ${row} 行。认错了可以在这里改。`,
  fields: { name: '姓名', course: '课程', grade: '考核等级', date: '日期', number: '证书编号' } as Record<
    FieldKey,
    string
  >,
  required: '必选',
  notUsed: '不使用',
  colOption: (letter: string, header: string) => `${letter} 列：${header || '（空表头）'}`,

  tplTitle: '证书标题',
  tplOrg: '颁发机构',
  tplSigner: '签发人',
  tplRole: '签发人职务',
  tplPrefix: '编号前缀',
  tplIssue: '发证日期',
  tplTheme: '配色',
  resetTemplate: '恢复默认',
  tplIssueHint: '名单里没写日期的行用它，新编号里的年份也取自它',
  tplPrefixHint: (example: string) => `编号为空的行会编成 ${example} 这样`,
  themes: { jade: '青绿', navy: '藏蓝', crimson: '朱红' } as Record<ThemeKey, string>,

  prev: '上一张',
  next: '下一张',
  pickRow: '预览哪一张',
  counter: (i: number, n: number) => `${i} / ${n}`,
  shrunk: (from: number, to: number) => `名字较长，字号从 ${from} pt 自动缩小到 ${to} pt`,
  previewNone: '名单里还没有能生成证书的行，先用占位内容预览模板。',
  placeholder: { name: '张三', course: '课程名称', grade: '' },
  pickColumnsFirst: '先在「列对应」里选好姓名和课程是哪一列。',
  canvasLabel: (name: string, course: string, num: string) => `证书预览：${name}，${course}，编号 ${num}`,

  generate: (n: number) => `生成 ${n} 张证书`,
  outputs: '每人一张 PNG（A4 横版，150 dpi） · 合并好的 PDF · 生成记录',
  stopsNote: (n: number) => `拦下的 ${n} 行不会生成，原因会写进生成记录。`,
  progress: (i: number, n: number, name: string) => `正在生成 ${i} / ${n}：${name}`,
  stop: '停止',
  stopped: '已经停止，没有生成文件。',
  tooMany: (max: number) => `浏览器演示一次最多生成 ${max} 张证书，可以把名单分几次上传。`,
  done: (n: number, secs: string) => `${n} 张证书已生成，用时 ${secs} 秒`,
  measured: '在你的浏览器里实测',
  dlZip: 'PNG 压缩包',
  dlPdf: '合并 PDF',
  dlLog: '生成记录 CSV',
  pngCount: (n: number) => `${n} 张`,
  pdfPages: (n: number) => `${n} 页`,
  logRows: (n: number) => `${n} 行`,
  genError: '生成时出错了，可能是浏览器内存不够。可以试试短一点的名单。',
  thumbs: '生成的证书',
  moreThumbs: (n: number) => `还有 ${n} 张在压缩包里`,
  regenerate: '重新生成',

  errors: {
    too_big: '文件超过 10 MB。演示只打开小一点的名单。',
    xls: '这是旧版 .xls 文件（或者设了打开密码的 Excel）。请在 Excel 里「另存为」.xlsx 或 .csv 再上传。',
    numbers: '这是 Numbers 文件。请在 Numbers 里选「文件 → 导出为 → Excel」，再上传导出的文件。',
    docx: '这是 Word 文件，不是名单。请上传 Excel（.xlsx）或 CSV 文件。',
    not_list: '这个文件不是表格。请上传 Excel（.xlsx）或 CSV 文件。',
    corrupt: '这个 Excel 文件读不出来，可能已经损坏。在 Excel 里另存一份再试试。',
    empty: '文件里没有内容。',
    too_many_rows: '',
  } as Record<ListErrorCode, string>,
  tooManyRows: (n: number, max: number) =>
    `这份名单有 ${n.toLocaleString('zh-CN')} 行，演示最多读取 ${max.toLocaleString('zh-CN')} 行。`,
  errUnknown: '读取文件时出错了。可以把它另存为 .csv 再试一次。',
  loaded: (file: string, rows: number, ok: number) => `已读取 ${file}：${rows} 行，其中 ${ok} 行可以生成证书。`,
  loadedSample: '已换回示例名单。',

  cert: {
    subtitle: 'CERTIFICATE OF COMPLETION',
    intro: '兹证明',
    body: (course: string, grade: string) =>
      grade
        ? `已完成「${course}」全部课程的学习，考核等级：${grade}，特发此证。`
        : `已完成「${course}」全部课程的学习，特发此证。`,
    numberLabel: '证书编号：',
    dateLabel: '日期：',
    sampleTag: '示例',
    seal: '示例章',
  },
  files: {
    zip: (n: number) => `证书PNG-${n}张.zip`,
    pdf: '全部证书.pdf',
    log: '生成记录.csv',
    sample: '证书名单示例.xlsx',
  },
  log: {
    head: ['Excel 行号', '姓名', '课程', '状态', '原因', '证书编号', '文件'],
    ok: '已生成',
    skip: '跳过',
    stop: '拦下',
  },
  pdfTitle: (org: string) => `全部证书 - ${org}`,
  defaults: { title: '结业证书', org: '星河编程学院（示例）', signer: '林晓峰', role: '教务主任', prefix: 'XH' },
};

export type DemoText = typeof zh;

const en: DemoText = {
  privacy: 'Your files are processed in this browser and never uploaded',
  backToSample: 'Back to the sample list',
  downloadSample: 'Download the sample .xlsx',
  downloadSampleTip: 'Edit it in Excel, then upload it back',
  dropTitle: 'Drop your Excel / CSV list here',
  dropSub: 'or click to choose a file · .xlsx / .csv · up to 10 MB',
  dropReading: (name) => `Reading ${name}…`,

  step1: 'Check the list',
  step2: 'Certificate template',
  step3: 'Generate',
  sourceSample: 'Sample list · made-up people and organisation',
  sourceFile: (file, sheet) => (sheet ? `${file} · sheet “${sheet}”` : file),
  delimiter: (d) => ({ ',': 'comma-separated', ';': 'semicolon-separated', '\t': 'tab-separated' })[d],

  statRows: 'Rows',
  statOk: 'Will be made',
  statStopped: 'Stopped',
  statSkipped: 'Skipped',

  tableCaption: 'List check results; click a row to preview that certificate',
  rawCaption: 'The file as it is; checking starts once the columns are picked',
  thRow: 'Row',
  thStatus: 'Check',
  thPerson: 'Name / course',
  thDate: 'Date',
  thNumber: 'Certificate No.',
  stOk: 'OK',
  stSkip: 'Skipped',
  stStop: 'Stopped',
  numNew: 'auto-numbered',
  numKept: 'from the list, kept',
  dateFromIssue: 'empty · issue date used',
  emptyList: 'There are no names under the header yet.',
  tagShrink: 'shrinks to fit',
  showAll: (n) => `Show ${n} more rows`,

  reasonBlank: 'Blank row',
  reasonMissingName: 'Name is missing',
  reasonMissingCourse: 'Course is missing',
  reasonBadDate: (v) => `Can’t read the date “${v}”`,
  reasonDuplicate: (r) => `Duplicate: same name and course as row ${r}`,
  reasonDupNumber: (r, v) => `Certificate No. ${v} is already used in row ${r}`,
  reasonJoin: '; ',

  mapTitle: 'Columns',
  mapAuto: (n) => `${n} columns recognised automatically`,
  mapManual: (n) => `${n} columns matched`,
  mapMissing: 'Couldn’t tell which column has the names or the courses. Please pick them below.',
  mapHint: (row) => `The header is on row ${row}. Change anything that was guessed wrong.`,
  fields: { name: 'Name', course: 'Course', grade: 'Grade', date: 'Date', number: 'Certificate No.' },
  required: 'required',
  notUsed: 'Not used',
  colOption: (letter, header) => `Column ${letter}: ${header || '(no header)'}`,

  tplTitle: 'Title',
  tplOrg: 'Organisation',
  tplSigner: 'Signed by',
  tplRole: 'Signer’s role',
  tplPrefix: 'Number prefix',
  tplIssue: 'Issue date',
  tplTheme: 'Colours',
  resetTemplate: 'Reset',
  tplIssueHint: 'Used for rows without a date; new numbers take their year from it',
  tplPrefixHint: (example) => `Rows without a number get one like ${example}`,
  themes: { jade: 'Jade', navy: 'Navy', crimson: 'Crimson' },

  prev: 'Previous',
  next: 'Next',
  pickRow: 'Certificate to preview',
  counter: (i, n) => `${i} / ${n}`,
  shrunk: (from, to) => `Long name: the font shrank from ${from} pt to ${to} pt to fit`,
  previewNone: 'No row in the list can get a certificate yet; the preview uses placeholder text.',
  placeholder: { name: 'Jane Doe', course: 'Course name', grade: '' },
  pickColumnsFirst: 'First pick which columns hold the names and the courses (under “Columns”).',
  canvasLabel: (name, course, num) => `Certificate preview: ${name}, ${course}, number ${num}`,

  generate: (n) => `Generate ${n} certificate${n === 1 ? '' : 's'}`,
  outputs: 'One PNG per person (A4 landscape, 150 dpi) · a merged PDF · a log',
  stopsNote: (n) => `The ${n} stopped row${n === 1 ? '' : 's'} won’t get a certificate; the log says why.`,
  progress: (i, n, name) => `Making ${i} of ${n}: ${name}`,
  stop: 'Stop',
  stopped: 'Stopped. No files were made.',
  tooMany: (max) => `The browser demo makes up to ${max} certificates at a time. Try the list in parts.`,
  done: (n, secs) => `${n} certificate${n === 1 ? '' : 's'} made in ${secs} s`,
  measured: 'measured in your browser',
  dlZip: 'PNG files (ZIP)',
  dlPdf: 'Merged PDF',
  dlLog: 'Log (CSV)',
  pngCount: (n) => `${n} PNG${n === 1 ? '' : 's'}`,
  pdfPages: (n) => `${n} page${n === 1 ? '' : 's'}`,
  logRows: (n) => `${n} row${n === 1 ? '' : 's'}`,
  genError: 'Something went wrong while generating, possibly the browser ran out of memory. Try a shorter list.',
  thumbs: 'The generated certificates',
  moreThumbs: (n) => `${n} more in the ZIP`,
  regenerate: 'Generate again',

  errors: {
    too_big: 'The file is over 10 MB. The demo only opens smaller lists.',
    xls: 'This is an old .xls file (or a password-protected workbook). In Excel, use Save As to make an .xlsx or .csv and upload that.',
    numbers: 'This is a Numbers file. In Numbers, choose File → Export To → Excel, then upload the exported file.',
    docx: 'This is a Word document, not a list. Please upload an Excel (.xlsx) or CSV file.',
    not_list: 'This file isn’t a spreadsheet. Please upload an Excel (.xlsx) or CSV file.',
    corrupt: 'This Excel file can’t be read; it may be damaged. Save a fresh copy in Excel and try again.',
    empty: 'The file is empty.',
    too_many_rows: '',
  },
  tooManyRows: (n, max) =>
    `This list has ${n.toLocaleString('en-US')} rows; the demo reads up to ${max.toLocaleString('en-US')}.`,
  errUnknown: 'Something went wrong reading the file. Try saving it as .csv.',
  loaded: (file, rows, ok) => `Read ${file}: ${rows} rows, ${ok} can get a certificate.`,
  loadedSample: 'Back to the sample list.',

  cert: {
    subtitle: 'CERTIFICATE OF COMPLETION',
    intro: 'This is to certify that',
    body: (course, grade) =>
      grade
        ? `has completed the course “${course}” with a grade of ${grade}.`
        : `has successfully completed the course “${course}”.`,
    numberLabel: 'Certificate No.: ',
    dateLabel: 'Date: ',
    sampleTag: 'SAMPLE',
    seal: 'SAMPLE',
  },
  files: {
    zip: (n) => `certificates-png-${n}.zip`,
    pdf: 'all-certificates.pdf',
    log: 'certificate-log.csv',
    sample: 'certificate-list-sample.xlsx',
  },
  log: {
    head: ['Excel row', 'Name', 'Course', 'Status', 'Reason', 'Certificate No.', 'File'],
    ok: 'generated',
    skip: 'skipped',
    stop: 'stopped',
  },
  pdfTitle: (org) => `All certificates - ${org}`,
  defaults: {
    title: 'Certificate of Completion',
    org: 'Northwind Coding Academy (sample)',
    signer: 'Morgan Ellis',
    role: 'Director of Studies',
    prefix: 'NCA',
  },
};

export const TEXT: Record<Lang, DemoText> = { zh, en };

export function describeIssue(t: DemoText, issue: Issue): string {
  switch (issue.code) {
    case 'blank':
      return t.reasonBlank;
    case 'missing_name':
      return t.reasonMissingName;
    case 'missing_course':
      return t.reasonMissingCourse;
    case 'bad_date':
      return t.reasonBadDate(issue.value);
    case 'duplicate':
      return t.reasonDuplicate(issue.of);
    case 'dup_number':
      return t.reasonDupNumber(issue.of, issue.value);
  }
}

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-11-08" → "2026年11月8日" / "November 8, 2026". */
export function formatCertDate(iso: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return lang === 'zh' ? `${y}年${mo}月${d}日` : `${MONTHS_EN[mo - 1]} ${d}, ${y}`;
}

export function errorText(t: DemoText, code: ListErrorCode, count: number | undefined, maxRows: number): string {
  return code === 'too_many_rows' ? t.tooManyRows(count ?? maxRows + 1, maxRows) : t.errors[code];
}
