// ─────────────────────────────────────────────────────────────────────────
//  Showcase projects (展览馆). Edit this file to add, change or remove a card.
//
//  - Every text field has a Chinese (zh) and an English (en) version.
//  - status: 'live' = 已上线, 'in_progress' = 开发中, 'demo' = 演示
//  - images: put the file in public/portfolio/ and reference it as
//    'portfolio/<file>.png' (no leading slash). Only use screenshots that
//    show no real person's name, email or photo.
//  - Order in this list = order on the page.
//  - Only write facts that are true. No invented numbers or clients.
// ─────────────────────────────────────────────────────────────────────────

export type ShowcaseStatus = 'live' | 'in_progress' | 'demo';

export interface Bilingual<T = string> {
  zh: T;
  en: T;
}

export interface ShowcaseImage {
  src: string;
  alt: Bilingual;
}

export interface ShowcaseProject {
  slug: string;
  status: ShowcaseStatus;
  /** Optional small label, e.g. 个人项目 / Personal project */
  kind?: Bilingual;
  title: Bilingual;
  summary: Bilingual;
  highlights: Bilingual<string[]>;
  stack: string[];
  images?: ShowcaseImage[];
  /** Built-in inline SVG diagram instead of a screenshot. */
  diagram?: 'bridge';
}

export const SHOWCASE_PROJECTS: ShowcaseProject[] = [
  {
    slug: 'local-doc-qa',
    status: 'live',
    kind: { zh: '个人项目', en: 'Personal project' },
    title: { zh: '本地文档问答系统', en: 'Local AI Document Q&A' },
    summary: {
      zh: '完全离线运行的文档问答：导入 PDF / Word，提问后回答会注明出处的文件名和页码。',
      en: 'Fully offline document Q&A: import PDF / Word files, ask questions, and every answer cites the file name and page.',
    },
    highlights: {
      zh: [
        'Python + FastAPI + Ollama + SQLite，全程离线，不调用云端 API。',
        '批量导入 PDF / Word，导入中断后可以从断点继续。',
        '回答引用出处文件名和页码，方便核对原文。',
        '在 24 道中英文测试题中，每一题的正确出处都出现在检索结果前 3 名里。',
      ],
      en: [
        'Python + FastAPI + Ollama + SQLite, fully offline with no cloud API calls.',
        'Batch-imports PDF / Word files and resumes an interrupted import.',
        'Answers cite the source file name and page so they can be checked.',
        'In a 24-question Chinese/English test set, the correct source was in the top 3 results for every question.',
      ],
    },
    stack: ['Python', 'FastAPI', 'Ollama', 'SQLite'],
    images: [
      {
        src: 'portfolio/local-ai-overview.png',
        alt: {
          zh: '系统概览：文件按页切分、本地检索、本地模型生成带引用的回答',
          en: 'Overview: files split by page, local search, a local model writes a cited answer',
        },
      },
      {
        src: 'portfolio/local-ai-sample-answer.png',
        alt: {
          zh: '一次测试运行的真实回答，带有引用编号和出处文件',
          en: 'A real answer from a test run, with citation numbers and the source file',
        },
      },
    ],
  },
  {
    slug: 'robotics-ops',
    status: 'live',
    title: { zh: '机器人队运营系统', en: 'Robotics Team Operations System' },
    summary: {
      zh: '一个机器人队的运营系统，大约 30 人在使用：管理后台、角色权限、审批流程和二维码签到。',
      en: 'Operations system for a robotics team, used by about 30 people: admin backend, role permissions, approvals and QR-code check-in.',
    },
    highlights: {
      zh: [
        'Next.js + Prisma + PostgreSQL，部署在 Vercel。',
        '管理后台与基于角色的权限控制。',
        '审批流程。',
        '二维码签到。',
        '使用 Vitest 和 Playwright 做自动化测试。',
      ],
      en: [
        'Next.js + Prisma + PostgreSQL, deployed on Vercel.',
        'Admin backend with role-based permissions.',
        'Approval workflow.',
        'QR-code check-in.',
        'Automated tests with Vitest and Playwright.',
      ],
    },
    stack: ['Next.js', 'Prisma', 'PostgreSQL', 'Vercel', 'Vitest', 'Playwright'],
  },
  {
    slug: 'mac-windows-bridge',
    status: 'live',
    kind: { zh: '个人工具', en: 'Personal tool' },
    title: { zh: 'Mac ↔ Windows Bridge', en: 'Mac ↔ Windows Bridge' },
    summary: {
      zh: '只用 Python 标准库写的局域网桥接工具，用来在 Mac 上操作一台 RTX 5070 Ti 的 Windows 电脑。',
      en: 'A LAN bridge written with only the Python standard library, used to drive a Windows RTX 5070 Ti machine from a Mac.',
    },
    highlights: {
      zh: [
        '只依赖 Python 标准库，无需安装第三方包。',
        '局域网配对，使用令牌认证。',
        '同步剪贴板、文本和文件。',
        '在配对的电脑上执行命令，实时回传输出和退出码。',
      ],
      en: [
        'Python standard library only, no third-party packages.',
        'LAN pairing with token authentication.',
        'Clipboard, text and file sync.',
        'Runs commands on the paired PC with live streamed output and exit codes.',
      ],
    },
    stack: ['Python (stdlib)'],
    diagram: 'bridge',
  },
  {
    slug: 'ai-call-copilot',
    status: 'in_progress',
    title: { zh: 'AI 通话助手', en: 'AI Call Copilot' },
    summary: {
      zh: '通话时实时给出「接下来可以怎么说」的建议，语音识别和模型都在本地运行。',
      en: 'Suggests what to say next during a live call, with speech-to-text and the model both running locally.',
    },
    highlights: {
      zh: [
        '本地语音转文字：在 Apple Silicon 上运行 Whisper。',
        '本地大模型（Ollama）根据对话实时给出回复建议。',
        '隐私优先：默认不保存录音。',
      ],
      en: [
        'Local speech-to-text: Whisper running on Apple Silicon.',
        'A local LLM (Ollama) suggests replies live, based on the conversation.',
        'Privacy-first: no audio is saved by default.',
      ],
    },
    stack: ['Whisper', 'Apple Silicon', 'Ollama'],
  },
  {
    slug: 'word-annotation-export',
    status: 'demo',
    title: { zh: 'Word 批量批注导出', en: 'Word Batch Annotation Export' },
    summary: {
      zh: 'Word 文档批量处理与导出：保留原模板样式，行内批注醒目标出。',
      en: 'Batch Word processing and export that keeps the original template’s styles and makes inline annotations stand out.',
    },
    highlights: {
      zh: [
        '用 python-docx 向模板注入内容，保留原模板的样式。',
        '行内【…】批注渲染为红色文字加黄色高亮。',
        '把一个合并的 docx 拆分成单篇文章。',
        '批量调用 Gemini，并统计缓存命中情况。',
      ],
      en: [
        'python-docx template injection that keeps the original template’s styles.',
        'Inline 【…】 annotations rendered as red text with yellow highlight.',
        'Splits a combined docx into separate articles.',
        'Batch Gemini calls with cache-hit statistics.',
      ],
    },
    stack: ['Python', 'python-docx', 'Gemini API'],
  },
];

export function findShowcaseProject(slug: string | undefined): ShowcaseProject | undefined {
  return SHOWCASE_PROJECTS.find((p) => p.slug === slug);
}
