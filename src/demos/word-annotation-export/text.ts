// Every word the Word annotation demo shows, in Chinese and English.

import type { Lang } from '../../i18n/strings';
import type { FontKey, HighlightKey, ImportErrorCode } from './docx';
import type { WarningCode } from './parse';

export type LoadErrorCode = ImportErrorCode | 'too_big' | 'unsupported' | 'empty';

const zh = {
  privacy: '文字只在你的浏览器里处理，生成 .docx 也不经过任何服务器',
  sample: '恢复示例文字',
  importFile: '导入 .docx / .txt',
  importing: (name: string) => `正在读取 ${name}…`,
  clear: '清空',
  wrap: '标为批注【】',
  wrapPlaceholder: '批注',
  wrapTip: '选中一段文字再点，就会用【】包起来',
  dropHere: '松开鼠标，导入这个文件',

  editorTitle: '原文',
  editorLabel: '原文：以「# 」开头的行是标题，【】里是批注',
  editorHint: '以「# 」开头的行是标题，每个标题开始一篇文章；【】里的文字是批注。',
  chars: (n: number) => `${n.toLocaleString('zh-CN')} 字`,
  previewTitle: 'Word 预览',
  previewNote: '和下载的 .docx 内容一致（字体以你电脑上装的为准）',
  previewEmpty: '编辑框是空的。粘贴一段带【批注】的文字，或者点「恢复示例文字」。',

  optBrackets: '【】括号',
  keep: '保留',
  remove: '去掉',
  optHighlight: '高亮颜色',
  highlights: { yellow: '黄色', green: '鲜绿', cyan: '青绿' } as Record<HighlightKey, string>,
  optSplit: '按「# 标题」拆成多篇',
  optFont: '正文字体',
  fonts: {
    songti: '宋体 + Times New Roman',
    fangsong: '仿宋 + Times New Roman',
    yahei: '微软雅黑 + Calibri',
    calibri: 'Calibri（英文文档）',
    times: 'Times New Roman（英文文档）',
  } as Record<FontKey, string>,

  warnings: {
    unclosed: (line: number) => `第 ${line} 行有一个「【」没有闭合，按普通文字导出`,
    stray_close: (line: number) => `第 ${line} 行多了一个「】」，按普通文字导出`,
    empty: (line: number) => `第 ${line} 行的【】里是空的，按普通文字导出`,
  } as Record<WarningCode, (line: number) => string>,
  moreWarnings: (n: number) => `还有 ${n} 处类似问题`,
  jumpTo: '定位到这一行',

  exportTitle: '导出',
  download: '下载 .docx',
  downloadZip: (n: number) => `下载全部（.zip，${n} 个文件）`,
  downloadOne: '下载',
  stats: (notes: number, articles: number, paras: number) =>
    `批注 ${notes} 处 · 文章 ${articles} 篇 · 段落 ${paras} 个`,
  size: (size: string) => `文件 ${size}`,
  built: (ms: string) => `生成用时 ${ms} 毫秒`,
  measured: '在你的浏览器里实测',
  nothingToExport: '先写点内容再导出。',
  wordNote: '下载的是真正的 Word 文件，Word、WPS、LibreOffice 和 Pages 都能直接打开。',

  untitled: '开头部分',
  fileCombined: '批注导出.docx',
  fileZip: (n: number) => `批注导出-${n}篇.zip`,
  docTitle: '批注导出',

  importErrors: {
    doc: '这是旧版 .doc 文件。请在 Word 里「另存为」.docx 再导入。',
    not_docx: '这个文件里没有 Word 正文，可能是别的 Office 文件。',
    corrupt: '这个 .docx 文件读不出来，可能已经损坏。',
    too_big: '文件超过 10 MB，演示只导入小一点的文件。',
    unsupported: '只能导入 .docx、.txt 或 .md 文件。',
    empty: '文件里没有文字。',
  } as Record<LoadErrorCode, string>,
  truncated: (n: number) => `文字太长，只导入了前 ${n.toLocaleString('zh-CN')} 个字。`,
  imported: (name: string) => `已导入 ${name}`,
  sampleRestored: '已恢复示例文字',
};

export type DemoText = typeof zh;

const en: DemoText = {
  privacy: 'Your text is processed in this browser; the .docx is made here too, with no server involved',
  sample: 'Restore the sample',
  importFile: 'Import .docx / .txt',
  importing: (name) => `Reading ${name}…`,
  clear: 'Clear',
  wrap: 'Mark as annotation 【】',
  wrapPlaceholder: 'note',
  wrapTip: 'Select some text, then press this to wrap it in 【】',
  dropHere: 'Drop to import this file',

  editorTitle: 'Text',
  editorLabel: 'Text: lines starting with "# " are headings, text in 【】 is an annotation',
  editorHint:
    'Lines starting with "# " are headings, and each heading starts an article. Text in 【】 is an annotation.',
  chars: (n) => `${n.toLocaleString('en-US')} characters`,
  previewTitle: 'Word preview',
  previewNote: 'Same content as the downloaded .docx (fonts depend on what your computer has)',
  previewEmpty: 'The editor is empty. Paste some text with 【annotations】, or restore the sample.',

  optBrackets: '【】 brackets',
  keep: 'Keep',
  remove: 'Remove',
  optHighlight: 'Highlight',
  highlights: { yellow: 'Yellow', green: 'Bright green', cyan: 'Turquoise' },
  optSplit: 'Split into articles at “# ” headings',
  optFont: 'Body font',
  fonts: {
    songti: 'SimSun 宋体 + Times New Roman',
    fangsong: 'FangSong 仿宋 + Times New Roman',
    yahei: 'Microsoft YaHei 微软雅黑 + Calibri',
    calibri: 'Calibri (English documents)',
    times: 'Times New Roman (English documents)',
  },

  warnings: {
    unclosed: (line) => `Line ${line}: a “【” is never closed, so it is exported as plain text`,
    stray_close: (line) => `Line ${line}: an extra “】”, exported as plain text`,
    empty: (line) => `Line ${line}: an empty 【】, exported as plain text`,
  },
  moreWarnings: (n) => `${n} more like this`,
  jumpTo: 'Go to this line',

  exportTitle: 'Export',
  download: 'Download .docx',
  downloadZip: (n) => `Download all (.zip, ${n} files)`,
  downloadOne: 'Download',
  stats: (notes, articles, paras) =>
    `${notes} annotation${notes === 1 ? '' : 's'} · ${articles} article${articles === 1 ? '' : 's'} · ${paras} paragraph${paras === 1 ? '' : 's'}`,
  size: (size) => size,
  built: (ms) => `built in ${ms} ms`,
  measured: 'measured in your browser',
  nothingToExport: 'Write something first, then export.',
  wordNote: 'This is a real Word file: it opens in Word, WPS, LibreOffice and Pages.',

  untitled: 'Opening',
  fileCombined: 'annotated.docx',
  fileZip: (n) => `annotated-${n}-articles.zip`,
  docTitle: 'Annotated document',

  importErrors: {
    doc: 'This is an old .doc file. In Word, use Save As to make a .docx and import that.',
    not_docx: 'There is no Word text in this file; it may be another kind of Office file.',
    corrupt: 'This .docx file can’t be read; it may be damaged.',
    too_big: 'The file is over 10 MB. The demo imports smaller files only.',
    unsupported: 'Only .docx, .txt and .md files can be imported.',
    empty: 'There is no text in this file.',
  },
  truncated: (n) => `The text is long, so only the first ${n.toLocaleString('en-US')} characters were imported.`,
  imported: (name) => `Imported ${name}`,
  sampleRestored: 'Sample text restored',
};

export const TEXT: Record<Lang, DemoText> = { zh, en };
