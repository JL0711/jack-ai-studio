// "Try it" demos for the showcase projects (展览馆 → 在线试用).
//
// Each demo lives in src/demos/<slug>/ and is a separate file that is only
// downloaded when someone opens that project. The text here is shown before
// the demo itself has loaded, so it stays short. Be honest in `note`: say what
// is real, what is simulated, and how the real product differs.

import type { ComponentType } from 'react';
import type { Bilingual } from '../data/projects';

export interface DemoInfo {
  title: Bilingual;
  note: Bilingual;
  /** Simulated demos say so in the header (the output is canned, nothing real runs). */
  simulated?: boolean;
  /** Kind of project for "get a quote for something like this" (see src/ai/catalog.ts). */
  quoteKind: string;
  load: () => Promise<{ default: ComponentType }>;
}

export const DEMOS: Record<string, DemoInfo> = {
  'local-doc-qa': {
    title: { zh: '在线试用：带出处的文档问答', en: 'Try it: document Q&A with sources' },
    note: {
      zh: '用示例文档，或者你自己的 PDF / Word / TXT 提问，每个回答都标出文件和页码。文件只在你的浏览器里处理，不会上传。浏览器版用关键词检索、摘录原文作答；正式版用 bge-m3 向量检索，由本地 qwen3:14b 写回答，全程离线。',
      en: 'Ask questions about the sample documents, or your own PDF / Word / TXT files; every answer cites the file and page. Files are processed in your browser and never uploaded. This browser version uses keyword search and quotes the source; the real system uses bge-m3 vector search and a local qwen3:14b model to write the answer, fully offline.',
    },
    quoteKind: 'rag',
    load: () => import('./local-doc-qa'),
  },
  'robotics-ops': {
    title: { zh: '在线试用：队伍运营后台', en: 'Try it: team operations console' },
    note: {
      zh: '一个能动手操作的缩小版：切换身份看权限变化，提交和审批申请，生成签到二维码。名单是虚构的，数据只存在这个页面里，刷新就重置。',
      en: 'A hands-on miniature: switch roles to see permissions change, submit and approve requests, and generate a check-in QR code. The roster is made up, and everything lives in this page only (a reload resets it).',
    },
    quoteKind: 'webapp',
    load: () => import('./robotics-ops'),
  },
  'mac-windows-bridge': {
    title: { zh: '在线试用：桥接控制台（模拟）', en: 'Try it: bridge console (simulated)' },
    note: {
      zh: '模拟一次完整的使用过程：配对、同步剪贴板、发送文件、在 Windows 上跑命令。命令输出是事先准备好的示例，不会连接任何电脑；只有文件的 SHA-256 是在你的浏览器里真实计算的，文件不会上传。',
      en: 'A simulated session: pairing, clipboard sync, sending a file and running commands on the Windows PC. Command output is prepared in advance and nothing connects to any computer; only a file’s SHA-256 is really computed, in your browser, and the file is never uploaded.',
    },
    simulated: true,
    quoteKind: 'automation',
    load: () => import('./mac-windows-bridge'),
  },
  'ai-call-copilot': {
    title: { zh: '在线试用：通话助手（模拟）', en: 'Try it: call copilot (simulated)' },
    note: {
      zh: '这个项目还在开发中。这里用文字模拟一通电话：对方说一句，右边马上给出可以怎么回。也可以自己输入对方说的话。正式版用本地 Whisper 实时转写，不保存录音。',
      en: 'This project is still in progress. Here a call is simulated in text: the other side says something and suggested replies appear on the right. You can also type what they say. The real version transcribes live with a local Whisper model and saves no audio.',
    },
    simulated: true,
    quoteKind: 'voice',
    load: () => import('./ai-call-copilot'),
  },
  'word-annotation-export': {
    title: { zh: '在线试用：Word 批注导出', en: 'Try it: Word annotation export' },
    note: {
      zh: '粘贴带【批注】的文字，看红字加黄色高亮的效果，再下载真正的 .docx 文件；也可以按标题拆成多篇。文件在你的浏览器里生成，不会上传。',
      en: 'Paste text with 【annotations】, preview the red text and yellow highlight, then download a real .docx file, or split it into several articles by heading. Files are generated in your browser and never uploaded.',
    },
    quoteKind: 'automation',
    load: () => import('./word-annotation-export'),
  },
  'excel-certificates': {
    title: { zh: '在线试用：Excel 名单批量生成证书', en: 'Try it: certificates from an Excel list' },
    note: {
      zh: '用示例名单，或者上传你自己的 Excel / CSV：先检查问题行，再给每个人生成一张证书，可以下载 PNG 压缩包、合并好的 PDF 和生成记录。文件不会上传。',
      en: 'Use the sample list or upload your own Excel / CSV: bad rows are checked first, then everyone gets a certificate. Download a ZIP of PNGs, one merged PDF and a log. Files are never uploaded.',
    },
    quoteKind: 'automation',
    load: () => import('./excel-certificates'),
  },
};

export function demoFor(slug: string | undefined): DemoInfo | undefined {
  return slug ? DEMOS[slug] : undefined;
}
