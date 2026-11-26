// ─────────────────────────────────────────────────────────────────────────
//  The price list behind the AI estimate on the website (AI 估价).
//
//  Jack: this is the file to edit. Every number the assistant shows a client
//  is calculated from what is here:
//    price = hours × PRICING.usdPerHour (rounded), hours = base + features + scale,
//    then a few multipliers (existing code, sensitive data, unclear brief, rush).
//  - PRICING: hourly rate, exchange rate, weekly hours, rush premium…
//  - KINDS:   base hours for each kind of project (new build / changing an existing one).
//  - FEATURES: extra hours per feature.
//  The words that recognise each kind/feature are in the `signals` lists
//  (Chinese is matched as plain text, English with word boundaries).
//  Keep it honest: the site only promises what Jack really does.
// ─────────────────────────────────────────────────────────────────────────

import type { Bi, FeatureId, Kind, Range } from './types';

export const PRICING = {
  /** US dollars per hour of work. */
  usdPerHour: 30,
  /** Shown next to dollar prices in Chinese ("约 ¥…"); matches the contact form's budget labels. */
  cnyPerUsd: 7,
  /** Hours a week Jack normally gives one project (sets the timeline). */
  weeklyHours: 20,
  /** Most hours a week he can give a rushed project. */
  maxWeeklyHours: 35,
  /** Price multiplier when the deadline is shorter than the normal timeline. */
  rushMultiplier: 1.25,
  /** Smallest price ever shown. */
  minimumUsd: 150,
  /** Show "× $30/hour" in the calculation steps. */
  showRate: true,
  /** Payment split for normal projects: plan agreed / first ~30% approved / handover. */
  milestoneSplit: [0.3, 0.4, 0.3] as const,
  /** Below this (top of the range, USD) the plan is two payments: start / delivery. */
  smallJobUsd: 600,
} as const;

export type Pattern = string | RegExp;
/** A word or phrase and how strongly it points at something. */
export type Signal = readonly [Pattern, number];

export interface KindDef {
  label: Bi;
  /** Short form for sentences ("一个{short}"). */
  short: Bi;
  /** Hours for a new build of a typical small version. */
  base: Range;
  /** Hours when changing / fixing an existing system of this kind. */
  modifyBase: Range;
  /** Features the base already covers (shown as "included"). */
  included: FeatureId[];
  /** Features worth offering as "+ add" for this kind, most useful first. */
  suggest: FeatureId[];
  stack: string[];
  inputs: Bi[];
  risks?: Bi[];
  /** Showcase projects (src/data/projects.ts) to point at as related work. */
  similar: string[];
  /** Jack has no showcase work of this kind yet: the reply says so honestly. */
  limited?: boolean;
  signals: Signal[];
}

/** An English word or phrase, matched whole (\b on both ends). */
const W = (s: string) => new RegExp(`\\b(?:${s})\\b`, 'i');

export const KINDS: Record<Kind, KindDef> = {
  site: {
    label: { zh: '展示型网站 / 官网', en: 'Website / company site' },
    short: { zh: '网站', en: 'website' },
    base: [14, 28],
    modifyBase: [4, 14],
    included: ['mobile_web'],
    suggest: ['cms', 'i18n', 'seo', 'design', 'notifications'],
    stack: ['React / Next.js', 'Vite', 'Vercel / GitHub Pages / 国内云'],
    inputs: [
      { zh: '网站的文字、图片和 Logo（没有的话可以先用占位内容）', en: 'Text, images and logo (placeholders are fine to start)' },
      { zh: '两三个你喜欢的参考网站', en: 'Two or three websites you like' },
      { zh: '域名（还没有的话可以帮你选）', en: 'A domain name (I can help you pick one)' },
    ],
    similar: [],
    signals: [
      ['官网', 3.5], ['企业网站', 3.5], ['公司网站', 3.5], ['网站', 1.6], ['网页', 1], ['落地页', 3.5], ['着陆页', 3.5],
      ['个人主页', 3.5], ['作品集', 3], ['博客', 1.8], ['单页', 2], ['宣传页', 3], ['介绍页', 2.5], ['展示', 1], ['主页', 1.2],
      [W('website'), 1.6], [W('web ?site'), 0.4], [W('landing ?page'), 3.5], [W('homepage'), 2], [W('company (site|website)'), 3.5],
      [W('portfolio'), 3], [W('blog'), 1.8], [W('marketing (site|website)'), 3.5], [W('brochure'), 2.5], [W('one[- ]page'), 2],
      [W('wordpress'), 2.5], [W('webflow'), 2.5], [W('squarespace'), 2.5], [W('wix'), 2.5], [W('static site'), 3],
    ],
  },
  webapp: {
    label: { zh: 'Web 应用（管理后台 / 客户门户 / 内部工具）', en: 'Web app (admin panel / client portal / internal tool)' },
    short: { zh: 'Web 应用', en: 'web app' },
    base: [40, 70],
    modifyBase: [10, 30],
    included: ['auth', 'admin', 'mobile_web'],
    suggest: ['roles', 'approvals', 'dashboard', 'notifications', 'reports', 'uploads', 'payments', 'tests'],
    stack: ['Next.js / React', 'Supabase 或 PostgreSQL + Prisma', 'Vercel', 'Vitest / Playwright'],
    inputs: [
      { zh: '有哪几类用户、各自能做什么', en: 'The kinds of users and what each can do' },
      { zh: '现在用的表格或流程（Excel、纸质单据都行）', en: 'Whatever you use today (spreadsheets, paper forms)' },
      { zh: '一两个参考界面或草图', en: 'A reference screen or a rough sketch' },
    ],
    similar: ['robotics-ops'],
    signals: [
      ['系统', 1.4], ['平台', 1.4], ['后台', 2.5], ['管理系统', 3.5], ['管理后台', 3.5], ['客户门户', 3.5], ['门户', 2],
      ['saas', 3], ['会员系统', 3], ['权限', 1.5], ['审批', 2], ['工单', 3], ['crm', 3], ['erp', 2], ['oa', 1.2], ['内部工具', 3.5],
      ['仪表盘', 2], ['数据看板', 2], ['排班', 2], ['库存', 2.5], ['进销存', 3.5], ['订单管理', 2.5], ['报名系统', 3], ['预约系统', 3],
      ['课程平台', 2.5], ['在线教育', 2], ['管理平台', 3.5], ['web 应用', 3.5], ['web应用', 3.5], ['网页应用', 3.5], ['网页版', 1.5],
      [W('web ?app(lication)?'), 3.5], [W('dashboard'), 2], [W('admin (panel|dashboard|portal)'), 3.5], [W('portal'), 2.5],
      [W('saas'), 3], [W('platform'), 1.4], [W('crm'), 3], [W('internal tool'), 3.5], [W('management system'), 3.5],
      [W('booking system'), 3], [W('inventory'), 2.5], [W('ticketing'), 2.5], [W('membership'), 1.6], [W('marketplace'), 2],
      [W('mvp'), 1.5], [W('back[- ]?office'), 3], [W('client area'), 3],
    ],
  },
  ecommerce: {
    label: { zh: '电商网站 / 在线商城', en: 'Online store / e-commerce' },
    short: { zh: '在线商城', en: 'online store' },
    base: [30, 60],
    modifyBase: [8, 24],
    included: ['payments', 'admin', 'mobile_web'],
    suggest: ['search', 'i18n', 'notifications', 'subscriptions', 'seo', 'design', 'integrations'],
    stack: ['Shopify（最快）或 Next.js + Stripe', '国内：微信支付 / 支付宝'],
    inputs: [
      { zh: '商品清单（名称、价格、图片，Excel 就行）', en: 'Product list (name, price, photos; a spreadsheet is fine)' },
      { zh: '收款账号（Stripe、微信支付商户号或支付宝）', en: 'A payment account (Stripe, WeChat Pay merchant or Alipay)' },
      { zh: '运费和退换货规则', en: 'Shipping and returns rules' },
    ],
    risks: [{ zh: '支付商户号的审核时间不由我们控制，最好尽早申请。', en: 'Payment account approval is out of our hands; apply early.' }],
    similar: [],
    signals: [
      ['电商', 3.5], ['商城', 3.5], ['网店', 3.5], ['在线商店', 3.5], ['购物车', 3.5], ['卖货', 2.5], ['商品', 1.4], ['独立站', 3.5],
      ['shopify', 3.5], ['woocommerce', 3.5], ['下单', 1.4], ['带货', 2],
      [W('e-?commerce'), 3.5], [W('online (store|shop)'), 3.5], [W('shop'), 1.8], [W('store'), 1.2], [W('cart'), 2.5],
      [W('checkout'), 1.6], [W('products'), 1.4], [W('sell (online|products)'), 3], [W('dropshipping'), 3],
    ],
  },
  miniprogram: {
    label: { zh: '微信小程序', en: 'WeChat mini program' },
    short: { zh: '小程序', en: 'mini program' },
    base: [40, 75],
    modifyBase: [10, 30],
    included: ['wechat_login', 'mobile_web'],
    suggest: ['payments', 'admin', 'notifications', 'booking', 'maps', 'dashboard'],
    stack: ['微信小程序原生 / uni-app', '云开发或 Node.js 后端'],
    inputs: [
      { zh: '已认证的小程序账号（AppID）', en: 'A verified mini program account (AppID)' },
      { zh: '要上线的话：国内服务器和备案好的域名', en: 'To launch: a server in China and an ICP-filed domain' },
    ],
    risks: [{ zh: '小程序审核和备案的时间不由我们控制。', en: 'Mini program review and ICP filing take time we can’t control.' }],
    similar: [],
    limited: true,
    signals: [
      ['小程序', 4.5], ['微信小程序', 5.5], ['公众号', 2.5], ['企业微信', 1.5], ['抖音小程序', 4.5], ['支付宝小程序', 4.5],
      [W('mini ?-?program'), 4.5], [W('wechat mini'), 5.5], [W('wechat official account'), 2.5],
    ],
  },
  mobile: {
    label: { zh: '手机 App（iOS / 安卓）', en: 'Mobile app (iOS / Android)' },
    short: { zh: '手机 App', en: 'mobile app' },
    base: [60, 110],
    modifyBase: [16, 40],
    included: ['mobile_web'],
    suggest: ['auth', 'notifications', 'payments', 'admin', 'maps', 'realtime'],
    stack: ['React Native / Expo', '或先做手机网页版（PWA），省一半时间'],
    inputs: [
      { zh: '苹果和谷歌开发者账号', en: 'Apple and Google developer accounts' },
      { zh: '主要页面的草图', en: 'Rough sketches of the main screens' },
    ],
    risks: [{ zh: '应用商店审核需要时间；很多需求先做手机网页版就够用。', en: 'App store review takes time; a mobile web app is often enough to start.' }],
    similar: [],
    limited: true,
    signals: [
      ['app', 1.2], ['手机app', 3.5], ['app开发', 3], ['开发app', 3], ['做个app', 2.5], ['做一个app', 2.5], ['安卓', 3], ['ios', 2.5], ['苹果应用', 3], ['手机应用', 3.5], ['移动应用', 3.5], ['原生应用', 3], ['应用商店', 2.5],
      [W('mobile app'), 4], [W('ios app'), 4], [W('android( app)?'), 3.5], [W('iphone app'), 4], [W('react native'), 3.5],
      [W('flutter'), 3.5], [W('app store'), 2.5], [W('play store'), 2.5],
    ],
  },
  rag: {
    label: { zh: 'AI 文档问答 / 知识库（RAG）', en: 'AI document Q&A / knowledge base (RAG)' },
    short: { zh: '文档问答系统', en: 'document Q&A system' },
    base: [28, 50],
    modifyBase: [10, 24],
    included: ['uploads', 'search', 'ai_chat'],
    suggest: ['offline', 'ocr', 'auth', 'roles', 'i18n', 'reports'],
    stack: ['Python + FastAPI', 'bge-m3 向量检索', 'Ollama 本地模型（如 qwen3:14b）或云端 API', 'SQLite / PostgreSQL'],
    inputs: [
      { zh: '5–10 份有代表性的文件', en: '5–10 representative files' },
      { zh: '20 个左右真实会问的问题（用来测试准确率）', en: 'About 20 real questions people ask (to test accuracy)' },
    ],
    risks: [{ zh: '扫描件、图片里的文字要先做 OCR，效果取决于扫描质量。', en: 'Scans need OCR first; quality depends on the scans.' }],
    similar: ['local-doc-qa'],
    signals: [
      ['知识库', 4], ['文档问答', 4.5], ['问答', 1.6], ['rag', 4.5], ['检索', 2], ['pdf', 1.8], ['文档', 1.5], ['资料', 1.2],
      ['合同', 1.4], ['手册', 1.4], ['制度', 1.2], ['论文', 1.5], ['出处', 2.5], ['引用', 1.5], ['读文件', 2.5], ['读文档', 3],
      ['根据文件回答', 3.5], ['内部资料', 2.5], ['向量', 2.5], ['语义搜索', 3],
      [W('rag'), 4.5], [W('knowledge ?base'), 4], [W('(doc|document)s? q ?& ?a'), 4.5], [W('pdfs?'), 1.8], [W('documents'), 1.5],
      [W('manuals?'), 1.4], [W('contracts'), 1.4], [W('policies'), 1.2], [W('citations?'), 2], [W('cite'), 2],
      [W('chat with (my|our|your|the|its|their)( [a-z]+)? (docs|documents|pdfs|files|data|policies|manuals|handbooks?|contracts|knowledge)'), 5], [W('(answer|answers|answering) questions (about|from|on) (my|our|the|their)( [a-z]+)? (docs|documents|pdfs|files|policies|manuals)'), 4.5], [W('search (my|our) (files|documents|docs)'), 3.5],
      [W('semantic search'), 3], [W('vector'), 2.5], [W('embeddings?'), 2.5],
    ],
  },
  chatbot: {
    label: { zh: 'AI 客服 / 聊天机器人', en: 'AI chatbot / support assistant' },
    short: { zh: 'AI 客服', en: 'AI chatbot' },
    base: [24, 45],
    modifyBase: [8, 20],
    included: ['ai_chat'],
    suggest: ['integrations', 'offline', 'i18n', 'dashboard', 'notifications'],
    stack: ['Python / Node.js', '本地模型或云端 API', '网站小部件 / 微信 / WhatsApp 接入'],
    inputs: [
      { zh: '常见问题和标准答案（有多少给多少）', en: 'Your FAQs and standard answers' },
      { zh: '要接入的渠道（网站、微信、WhatsApp…）', en: 'Which channels (website, WeChat, WhatsApp…)' },
    ],
    similar: ['local-doc-qa', 'ai-call-copilot'],
    signals: [
      ['客服', 3], ['聊天机器人', 4.5], ['机器人客服', 4.5], ['智能客服', 4.5], ['ai客服', 4.5], ['ai 客服', 4.5], ['自动回复', 3.5],
      ['问答机器人', 4], ['微信机器人', 4], ['对话机器人', 4.5], ['ai助手', 2.5], ['ai 助手', 2.5],
      [W('chat ?bot'), 4.5], [W('support (bot|assistant)'), 4], [W('customer (service|support)'), 2.5], [W('auto[- ]?repl(y|ies)'), 3.5],
      [W('(whatsapp|telegram|discord|slack) bot'), 4], [W('virtual assistant'), 3], [W('ai assistant'), 2.5], [W('conversational'), 2],
    ],
  },
  local_ai: {
    label: { zh: '本地私有化 AI 部署', en: 'Private local AI deployment' },
    short: { zh: '本地 AI 部署', en: 'local AI setup' },
    base: [10, 22],
    modifyBase: [4, 12],
    included: ['offline', 'ai_chat'],
    suggest: ['auth', 'finetune', 'integrations', 'uploads'],
    stack: ['Ollama', 'qwen3 / Llama / DeepSeek 等开源模型', 'Open WebUI 或定制界面', '可选：本地语音（Whisper）'],
    inputs: [
      { zh: '电脑或服务器配置（显卡型号、显存、内存）', en: 'Hardware details (GPU model, VRAM, RAM)' },
      { zh: '想让模型做的三五件具体的事', en: 'Three to five concrete things the model should do' },
    ],
    risks: [{ zh: '模型能力受显存限制：16 GB 显存适合 14B 左右的模型。', en: 'VRAM limits model size: 16 GB suits roughly 14B models.' }],
    similar: ['local-doc-qa', 'mac-windows-bridge'],
    signals: [
      ['本地部署', 4.5], ['私有化', 4.5], ['私有部署', 4.5], ['本地模型', 4.5], ['本地大模型', 5], ['内网', 2.5], ['不联网', 3],
      ['数据不出', 3.5], ['不上云', 3.5], ['ollama', 4.5], ['开源模型', 3.5], ['大模型部署', 4.5], ['部署大模型', 4.5], ['显卡', 2],
      ['gpu', 2], ['qwen', 2.5], ['llama', 2.5], ['deepseek', 2.5], ['lm studio', 3.5], ['vllm', 3.5], ['离线', 1.5],
      [W('local (llm|ai|model)s?'), 5], [W('on[- ]?prem(ise)?'), 4.5], [W('self[- ]?host(ed|ing)?'), 4], [W('private ai'), 4],
      [W('air[- ]?gapped'), 4.5], [W('ollama'), 4.5], [W('open[- ]source (llm|model)s?'), 3.5], [W('llama'), 2.5], [W('qwen'), 2.5],
      [W('deepseek'), 2.5], [W('mistral'), 2.5], [W('gpu'), 2], [W('vllm'), 3.5], [W('lm studio'), 3.5],
    ],
  },
  automation: {
    label: { zh: '自动化脚本 / 工作流', en: 'Automation script / workflow' },
    short: { zh: '自动化脚本', en: 'automation' },
    base: [8, 20],
    modifyBase: [3, 10],
    included: [],
    suggest: ['docgen', 'schedule', 'gui', 'notifications', 'integrations', 'reports'],
    stack: ['Python（openpyxl / python-docx / pandas）', '定时任务', '可选：简单图形界面'],
    inputs: [
      { zh: '几份真实的输入文件（可以打码）', en: 'A few real input files (redacted is fine)' },
      { zh: '一份你想要的结果样子', en: 'One example of the result you want' },
    ],
    similar: ['excel-certificates', 'word-annotation-export'],
    signals: [
      ['自动化', 3], ['脚本', 3], ['批量', 2.5], ['自动生成', 2.5], ['excel', 2.5], ['表格', 1.4], ['word', 1.8], ['报表', 1.8],
      ['数据整理', 3], ['数据清洗', 3], ['重复', 1.4], ['省时间', 1.5], ['定时', 1.8], ['合并', 1.3], ['拆分', 1.3], ['格式转换', 2.5],
      ['转换格式', 2.5], ['证书', 2], ['发票', 1.4], ['群发', 2.5], ['宏', 1.5], ['vba', 3], ['工作流', 2.5], ['rpa', 3.5],
      [W('automat(e|ion|ing)'), 3], [W('script'), 3], [W('batch'), 2.5], [W('excel'), 2.5], [W('spreadsheets?'), 2], [W('csv'), 2],
      [W('word (docs?|files?|documents?)'), 2], [W('reports?'), 1.2], [W('data (cleaning|entry)'), 3], [W('repetitive'), 2],
      [W('bulk'), 2.5], [W('vba'), 3], [W('macros?'), 2], [W('google sheets'), 2.5], [W('workflow'), 2], [W('rpa'), 3.5],
    ],
  },
  scraper: {
    label: { zh: '数据采集（爬虫）', en: 'Web data collection (scraper)' },
    short: { zh: '数据采集工具', en: 'scraper' },
    base: [8, 20],
    modifyBase: [3, 10],
    included: [],
    suggest: ['schedule', 'reports', 'notifications', 'gui'],
    stack: ['Python（httpx / Playwright）', '导出 Excel / CSV', '定时运行'],
    inputs: [
      { zh: '要采集的网站和字段', en: 'Which sites and which fields' },
      { zh: '数据用途（只采公开、允许采集的数据）', en: 'What the data is for (public, permitted data only)' },
    ],
    risks: [{ zh: '目标网站改版或加反爬，脚本需要跟着维护；只做公开且允许采集的数据。', en: 'Sites change and add bot checks, so scrapers need upkeep; public, permitted data only.' }],
    similar: [],
    signals: [
      ['爬虫', 4.5], ['抓取', 3.5], ['采集', 3], ['爬取', 4.5], ['监控价格', 3], ['价格监控', 3], ['批量下载', 2],
      [W('scrap(e|er|ing)'), 4.5], [W('crawl(er|ing)?'), 4], [W('extract data from'), 3], [W('price (monitor|tracking)'), 3],
    ],
  },
  integration: {
    label: { zh: '系统对接 / API 集成', en: 'System integration / API' },
    short: { zh: '系统对接', en: 'integration' },
    base: [8, 18],
    modifyBase: [3, 10],
    included: ['integrations'],
    suggest: ['schedule', 'notifications', 'dashboard'],
    stack: ['Python / Node.js', 'n8n 或脚本', 'Webhook'],
    inputs: [
      { zh: '两边系统的 API 文档或测试账号', en: 'API docs or test accounts for both systems' },
      { zh: '要同步哪些数据、多久一次', en: 'Which data to sync and how often' },
    ],
    similar: ['mac-windows-bridge'],
    signals: [
      ['对接', 3], ['接口', 2], ['api', 1.8], ['集成', 2.5], ['n8n', 4.5], ['zapier', 4.5], ['打通', 3], ['同步', 1.4], ['webhook', 3.5],
      ['飞书', 2.5], ['钉钉', 2.5],
      [W('integrat(e|ion|ions)'), 3], [W('api'), 1.8], [W('n8n'), 4.5], [W('zapier'), 4.5], [W('make\\.com'), 4.5], [W('webhooks?'), 3.5],
      [W('sync'), 1.4], [W('hubspot'), 2.5], [W('salesforce'), 2.5], [W('quickbooks'), 2.5], [W('airtable'), 2.5], [W('notion'), 1.8],
    ],
  },
  voice: {
    label: { zh: '语音转写 / 字幕 / 会议纪要', en: 'Speech-to-text / subtitles / meeting notes' },
    short: { zh: '语音转写工具', en: 'speech-to-text tool' },
    base: [16, 32],
    modifyBase: [6, 16],
    included: ['uploads'],
    suggest: ['offline', 'i18n', 'docgen', 'ai_chat'],
    stack: ['Whisper（本地，Apple Silicon / NVIDIA）', 'Python', '可选：本地模型做摘要和翻译'],
    inputs: [
      { zh: '几段真实录音（几分钟就够）', en: 'A few real recordings (a few minutes is enough)' },
      { zh: '想要的输出：字幕、纪要还是翻译', en: 'What you want out: subtitles, notes or translation' },
    ],
    similar: ['ai-call-copilot'],
    signals: [
      ['语音', 3], ['转写', 4], ['转文字', 4], ['字幕', 3.5], ['录音', 2.5], ['会议纪要', 3.5], ['whisper', 4.5], ['听写', 3.5],
      ['通话', 2], ['口述', 2.5],
      [W('transcri(be|ption|bing)'), 4], [W('speech[- ]to[- ]text'), 4.5], [W('subtitles?'), 3.5], [W('captions?'), 2.5],
      [W('whisper'), 4.5], [W('meeting (notes|minutes)'), 3.5], [W('voice'), 2.5], [W('audio'), 2], [W('call recordings?'), 3.5],
      [W('dictation'), 3],
    ],
  },
  desktop: {
    label: { zh: '桌面软件 / 小工具', en: 'Desktop app / utility' },
    short: { zh: '桌面工具', en: 'desktop app' },
    base: [16, 36],
    modifyBase: [6, 16],
    included: [],
    suggest: ['gui', 'docgen', 'schedule', 'integrations'],
    stack: ['Python + PySide / Tauri / Electron', '打包成免安装 exe / Mac 应用'],
    inputs: [{ zh: '要在哪些系统上用（Windows / Mac）', en: 'Which systems it must run on (Windows / Mac)' }],
    similar: ['mac-windows-bridge'],
    signals: [
      ['桌面软件', 4.5], ['桌面应用', 4.5], ['exe', 3], ['windows软件', 4], ['windows 软件', 4], ['mac软件', 4], ['mac 软件', 4],
      ['小工具', 2.2], ['客户端', 2], ['安装包', 2.5], ['免安装', 3],
      [W('desktop (app|application|tool|software)'), 4.5], [W('windows (app|tool|software)'), 4], [W('mac (app|tool)'), 4],
      [W('exe'), 3], [W('electron'), 3.5], [W('tauri'), 3.5], [W('installer'), 2],
    ],
  },
  fix: {
    label: { zh: '修改 / 维护现有系统', en: 'Changes to an existing system' },
    short: { zh: '现有系统的修改', en: 'changes to an existing system' },
    base: [4, 16],
    modifyBase: [4, 16],
    included: [],
    suggest: ['mobile_web', 'tests', 'migration'],
    stack: ['沿用你现有的技术栈'],
    inputs: [
      { zh: '代码仓库或服务器的访问权限', en: 'Access to the code repository or server' },
      { zh: '要改的问题清单（截图最好）', en: 'A list of what to change (screenshots help)' },
    ],
    risks: [{ zh: '没看到代码之前，范围只能粗估；看过代码后会给准确报价。', en: 'Until I see the code the scope is a rough guess; I quote exactly after a look.' }],
    similar: [],
    signals: [],
  },
  consult: {
    label: { zh: '技术咨询 / 方案评估', en: 'Technical advice / feasibility review' },
    short: { zh: '技术咨询', en: 'consultation' },
    base: [2, 4],
    modifyBase: [2, 4],
    included: [],
    suggest: [],
    stack: ['书面方案：技术选型、成本、风险'],
    inputs: [{ zh: '你的想法或现有方案（文字就行）', en: 'Your idea or current plan, in writing' }],
    similar: [],
    signals: [
      ['咨询', 3], ['方案评估', 3.5], ['评估一下', 3], ['选型', 3.5], ['可行性', 3.5], ['请教', 2.5], ['顾问', 3], ['技术方案', 2.5],
      [W('consult(ing|ation)?'), 3], [W('advice'), 2.5], [W('feasibility'), 3.5], [W('architecture review'), 3.5], [W('code review'), 3],
      [W('which (model|stack|framework|database)'), 2.5],
    ],
  },
};

/** Words that mean "change something that already exists". */
export const MODIFY_SIGNALS: Signal[] = [
  ['修改', 2], ['改版', 2.5], ['修复', 3], ['bug', 3], ['维护', 2.5], ['升级', 1.8], ['老网站', 3.5], ['旧网站', 3.5], ['现有', 2.2],
  ['已有', 2.2], ['原来的', 2], ['原有', 2], ['二次开发', 4], ['接手', 3.5], ['改造', 3], ['加功能', 3], ['加个功能', 3], ['报错', 3],
  ['重构', 3], ['迁移', 1.5], ['优化', 1.2], ['老系统', 3.5], ['旧系统', 3.5],
  [W('fix(ing|es)?'), 3], [W('bugs?'), 3], [W('broken'), 3], [W('existing'), 2.8], [W('maintain|maintenance'), 2.5],
  [W('redesign'), 2.5], [W('refactor(ing)?'), 3], [W('legacy'), 3], [W('take over'), 3.5], [W('add (a |some )?(new )?features?'), 3],
  [W('improve(ments)?'), 1.4], [W('upgrade'), 1.8], [W('our (current|old) (site|website|app|system)'), 3.5], [W('revamp'), 2.5],
  [W('speed up|slow'), 1.2],
];

export interface FeatureDef {
  label: Bi;
  hours: Range;
  /** Hours for particular kinds, when they differ. */
  byKind?: Partial<Record<Kind, Range>>;
  /** 1 = nice to have … 5 = the project doesn't work without it. MVP cuts start at 1. */
  priority: 1 | 2 | 3 | 4 | 5;
  signals: Signal[];
  input?: Bi;
  risk?: Bi;
}

export const FEATURES: Record<FeatureId, FeatureDef> = {
  auth: {
    label: { zh: '注册登录', en: 'Accounts & login' },
    hours: [6, 10],
    priority: 4,
    signals: [['登录', 2], ['注册', 2], ['账号', 1.5], ['用户系统', 2], ['会员登录', 2], [W('log ?in'), 2], [W('sign[- ]?(in|up)'), 2], [W('user accounts?'), 2], [W('accounts'), 1.2], [W('authentication|auth'), 2]],
  },
  roles: {
    label: { zh: '角色和权限', en: 'Roles & permissions' },
    hours: [6, 12],
    priority: 3,
    signals: [['权限', 2], ['角色', 2], ['管理员', 1.2], ['多角色', 2.5], ['不同身份', 2], [W('roles?'), 2], [W('permissions?'), 2], [W('rbac'), 2.5], [W('admin(istrator)?s? and (users|staff|members)'), 2]],
  },
  admin: {
    label: { zh: '管理后台', en: 'Admin panel' },
    hours: [8, 16],
    priority: 4,
    signals: [['后台', 2], ['管理后台', 2.5], ['管理端', 2.5], [W('admin (panel|dashboard|area|side)'), 2.5], [W('back[- ]?office'), 2.5], [W('backend dashboard'), 2]],
  },
  payments: {
    label: { zh: '在线支付', en: 'Online payments' },
    hours: [8, 16],
    byKind: { miniprogram: [10, 18] },
    priority: 4,
    signals: [['支付', 2], ['付款', 1.6], ['收款', 2], ['微信支付', 2.5], ['支付宝', 2.5], ['stripe', 2.5], ['paypal', 2.5], ['在线支付', 2.5], ['收费', 1], [W('payments?'), 2], [W('pay(ing)? online'), 2], [W('checkout'), 1.5], [W('stripe'), 2.5], [W('paypal'), 2.5], [W('billing'), 1.6]],
    input: { zh: '收款账号（Stripe、微信支付商户号或支付宝）', en: 'A payment account (Stripe, WeChat Pay merchant or Alipay)' },
    risk: { zh: '支付账号的审核时间不由我们控制。', en: 'Payment account approval takes time we can’t control.' },
  },
  subscriptions: {
    label: { zh: '订阅 / 会员付费', en: 'Subscriptions' },
    hours: [6, 12],
    priority: 2,
    signals: [['订阅', 2], ['会员费', 2.5], ['月费', 2.5], ['年费', 2.5], ['包月', 2.5], ['付费会员', 2.5], [W('subscriptions?'), 2.5], [W('recurring (payments?|billing)'), 2.5], [W('monthly plans?'), 2.5], [W('membership fees?'), 2.5]],
  },
  uploads: {
    label: { zh: '文件上传', en: 'File uploads' },
    hours: [3, 6],
    priority: 3,
    signals: [['上传', 2], ['附件', 1.8], [W('uploads?'), 2], [W('attachments?'), 1.8]],
  },
  search: {
    label: { zh: '搜索和筛选', en: 'Search & filters' },
    hours: [4, 8],
    priority: 2,
    signals: [['搜索', 1.6], ['筛选', 2], ['查询', 1.2], [W('search'), 1.4], [W('filters?'), 1.8]],
  },
  notifications: {
    label: { zh: '邮件 / 短信通知', en: 'Email & SMS notifications' },
    hours: [4, 8],
    priority: 2,
    signals: [['通知', 2], ['提醒', 1.6], ['短信', 2.2], ['邮件通知', 2.5], ['推送', 2], ['发邮件', 2.2], ['邮件发送', 2.2], ['自动发邮件', 2.5], [W('send (an )?emails?'), 2.2], [W('email (it|them|the report)'), 2.2], [W('notifications?'), 2], [W('reminders?'), 1.6], [W('sms'), 2.2], [W('email (alerts?|notifications?)'), 2.5], [W('push'), 1.5]],
  },
  realtime: {
    label: { zh: '实时消息 / 在线协作', en: 'Real-time chat & updates' },
    hours: [10, 18],
    priority: 2,
    signals: [['实时', 1.8], ['即时通讯', 2.5], ['在线聊天', 2.5], ['聊天功能', 2.5], ['协作', 1.8], ['私信', 2], [W('real[- ]?time'), 2], [W('live chat'), 2.5], [W('messaging'), 2], [W('chat feature'), 2.5], [W('collaborat(e|ion|ive)'), 1.8], [W('websockets?'), 2.5]],
  },
  i18n: {
    label: { zh: '多语言', en: 'Multiple languages' },
    hours: [6, 12],
    byKind: { site: [3, 6] },
    priority: 2,
    signals: [['多语言', 2.5], ['中英文', 2.5], ['中英双语', 2.5], ['双语', 2.2], ['英文版', 2.2], ['国际化', 2.2], ['多国语言', 2.5], [W('multi[- ]?lingual'), 2.5], [W('multiple languages'), 2.5], [W('bilingual'), 2.5], [W('i18n'), 2.5], [W('translations?'), 1.6], [W('(english|chinese) (and|&) (english|chinese|spanish)'), 2.5]],
    input: { zh: '各语言的文案（或同意先用机器翻译）', en: 'Text in each language (or OK to start with machine translation)' },
  },
  dashboard: {
    label: { zh: '数据看板和图表', en: 'Dashboard & charts' },
    hours: [6, 12],
    priority: 2,
    signals: [['看板', 2], ['仪表盘', 2], ['图表', 2], ['统计', 1.6], ['数据分析', 2], [W('dashboards?'), 1.6], [W('charts?'), 2], [W('analytics'), 2], [W('statistics|stats'), 1.6], [W('kpis?'), 2]],
  },
  reports: {
    label: { zh: '报表导出', en: 'Reports & export' },
    hours: [4, 8],
    priority: 2,
    signals: [['报表', 2], ['导出', 2], ['导出excel', 2.5], ['生成报告', 2], [W('reports?'), 1.6], [W('export'), 2], [W('csv export'), 2.5]],
  },
  maps: {
    label: { zh: '地图和定位', en: 'Maps & location' },
    hours: [4, 10],
    priority: 2,
    signals: [['地图', 2.5], ['定位', 2], ['导航', 1.6], ['高德', 2.5], ['百度地图', 2.5], [W('maps?'), 2], [W('locations?'), 1.2], [W('gps'), 2.5], [W('geolocation'), 2.5]],
  },
  booking: {
    label: { zh: '预约和排班', en: 'Booking & scheduling' },
    hours: [8, 16],
    priority: 3,
    signals: [['预约', 2.5], ['预订', 2.5], ['排班', 2.5], ['日历', 1.6], ['挂号', 2.5], [W('booking'), 2.5], [W('appointments?'), 2.5], [W('reservations?'), 2.5], [W('scheduling'), 2], [W('calendar'), 1.6]],
  },
  cms: {
    label: { zh: '自己更新内容的后台', en: 'Content you can update yourself' },
    hours: [5, 10],
    priority: 3,
    signals: [['文章', 1.4], ['博客', 1.6], ['内容管理', 2.5], ['自己更新', 2.5], ['自己改内容', 2.5], ['新闻动态', 2], ['发布新闻', 2.2], [W('cms'), 2.5], [W('content management'), 2.5], [W('blog'), 1.6], [W('update (the )?(content|text|news) (myself|ourselves)'), 2.5], [W('news section'), 2]],
  },
  seo: {
    label: { zh: 'SEO 基础优化', en: 'SEO basics' },
    hours: [3, 6],
    priority: 1,
    signals: [['seo', 2.5], ['搜索引擎', 2], ['百度收录', 2.5], ['谷歌排名', 2.5], [W('seo'), 2.5], [W('search engines?'), 2], [W('google ranking'), 2.5]],
  },
  design: {
    label: { zh: '从零设计界面', en: 'Custom UI design' },
    hours: [8, 16],
    priority: 1,
    signals: [['ui设计', 2.5], ['界面设计', 2.5], ['帮我设计', 2.5], ['需要设计', 2.5], ['视觉设计', 2.5], ['品牌设计', 2], [W('ui ?/ ?ux'), 2.5], [W('design (from scratch|it for me)'), 2.5], [W('need (a )?designs?'), 2.5], [W('mock ?ups?'), 1.5], [W('branding'), 2]],
  },
  integrations: {
    label: { zh: '对接第三方系统', en: 'Third-party integrations' },
    hours: [6, 14],
    priority: 3,
    signals: [['对接', 2], ['第三方', 2], ['接口', 1.2], ['接入微信', 2.5], ['接微信', 2.5], ['接入企业微信', 2.5], ['接入飞书', 2.5], ['接入钉钉', 2.5], ['打印小票', 2.5], ['小票', 2], ['打印机', 2], ['飞鹅', 2.5], [W('receipt printers?'), 2.5], [W('(connect|integrate) (it )?(with|to) (wechat|whatsapp|slack|teams|telegram)'), 2.5], ['erp', 2], ['crm', 1.5], ['飞书', 2], ['钉钉', 2], ['企业微信', 2], ['quickbooks', 2.5], [W('integrat(e|ion|ions)'), 2], [W('third[- ]party'), 2], [W('quickbooks|hubspot|salesforce|airtable|zapier|slack|notion|google sheets|shopify api'), 2.5], [W('api'), 1]],
    input: { zh: '要对接系统的 API 文档或测试账号', en: 'API docs or a test account for the systems to connect' },
  },
  migration: {
    label: { zh: '旧数据迁移', en: 'Data migration' },
    hours: [4, 10],
    priority: 3,
    signals: [['迁移', 2], ['导入旧数据', 2.5], ['老数据', 2.2], ['历史数据', 2], ['导入数据', 2], [W('migrat(e|ion)'), 2], [W('import (the )?(old|existing|legacy) data'), 2.5], [W('legacy data'), 2.5]],
  },
  ocr: {
    label: { zh: '扫描件文字识别（OCR）', en: 'OCR for scanned files' },
    hours: [8, 16],
    priority: 3,
    signals: [['ocr', 3], ['扫描件', 3], ['扫描版', 3], ['图片识别', 2.5], ['识别文字', 2.5], ['手写', 2.2], ['拍照', 1.4], [W('ocr'), 3], [W('scanned'), 3], [W('handwrit(ten|ing)'), 2.5], [W('image to text'), 2.5]],
    risk: { zh: 'OCR 的准确率取决于扫描质量。', en: 'OCR accuracy depends on scan quality.' },
  },
  ai_chat: {
    label: { zh: 'AI 功能（大模型）', en: 'AI features (LLM)' },
    hours: [8, 16],
    priority: 3,
    signals: [['大模型', 2], ['ai功能', 2.5], ['ai 功能', 2.5], ['chatgpt', 2], ['gpt', 1.8], ['claude', 1.8], ['智能问答', 2], ['ai生成', 2], ['ai 生成', 2], ['接入ai', 2.5], ['接入 ai', 2.5], [W('ai (features?|powered)'), 2.5], [W('llms?'), 2], [W('gpt'), 1.8], [W('chatgpt'), 2], [W('claude'), 1.8], [W('openai'), 2], [W('ai'), 1]],
  },
  wechat_login: {
    label: { zh: '微信登录', en: 'WeChat login' },
    hours: [6, 10],
    priority: 3,
    signals: [['微信登录', 3], ['微信授权', 3], [W('wechat (login|sign[- ]?in)'), 3]],
    input: { zh: '微信开放平台或公众平台账号', en: 'A WeChat Open Platform / Official Account' },
  },
  qr: {
    label: { zh: '二维码 / 扫码签到', en: 'QR codes & check-in' },
    hours: [4, 8],
    priority: 2,
    signals: [['二维码', 2.5], ['扫码', 2.5], ['签到', 2.5], ['核销', 2.5], [W('qr( codes?)?'), 2.5], [W('check[- ]?ins?'), 2.2], [W('scan'), 1.2]],
  },
  approvals: {
    label: { zh: '审批流程', en: 'Approval workflow' },
    hours: [8, 14],
    priority: 3,
    signals: [['审批', 2.5], ['审核流程', 2.5], ['流程审核', 2.2], ['报销', 1.6], ['请假', 2], [W('approvals?'), 2.5], [W('approval (flow|workflow|process)'), 2.5], [W('sign[- ]?offs?'), 2]],
  },
  docgen: {
    label: { zh: '自动生成文档（Word / PDF / Excel）', en: 'Generated Word / PDF / Excel files' },
    hours: [4, 10],
    priority: 3,
    signals: [['生成word', 2.5], ['生成 word', 2.5], ['生成pdf', 2.5], ['生成 pdf', 2.5], ['生成合同', 2.5], ['生成报告', 2.2], ['生成证书', 2.5], ['证书', 1.5], ['出报告', 2], ['合同模板', 2.2], [W('generate (word|pdf|docx|excel|reports?|invoices?|certificates?|contracts?)'), 2.5], [W('pdf generation'), 2.5], [W('certificates?'), 1.5], [W('templates?'), 1]],
  },
  schedule: {
    label: { zh: '定时自动运行', en: 'Runs on a schedule' },
    hours: [3, 6],
    priority: 2,
    signals: [['定时', 2.5], ['每天自动', 2.5], ['每周自动', 2.5], ['每天跑', 2.2], ['自动运行', 2], ['每天早上', 1.6], ['每天更新', 2.2], ['每日更新', 2.2], ['每天抓', 2.2], ['每小时', 2], [W('scheduled?'), 2], [W('every (day|morning|night|week|hour)'), 2], [W('daily|nightly|hourly'), 1.6], [W('cron'), 2.5]],
  },
  finetune: {
    label: { zh: '模型微调', en: 'Model fine-tuning' },
    hours: [20, 40],
    priority: 2,
    signals: [['微调', 3], ['训练模型', 2.8], ['训练一个模型', 3], ['lora', 3], [W('fine[- ]?tun(e|ing)'), 3], [W('train (a|the|my|our) (own )?model'), 3], [W('lora'), 3]],
    risk: { zh: '微调的效果取决于训练数据的质量和数量。', en: 'Fine-tuning results depend on the quality and amount of training data.' },
  },
  offline: {
    label: { zh: '完全离线 / 本地模型', en: 'Runs offline on local models' },
    hours: [8, 16],
    priority: 4,
    signals: [['离线', 2.5], ['本地运行', 2.5], ['不联网', 3], ['内网', 2.2], ['数据不出', 3], ['不上云', 3], ['本地部署', 2.5], ['私有化', 2.5], ['保密', 1.4], [W('offline'), 2.5], [W('on[- ]?prem(ise)?'), 2.5], [W('air[- ]?gapped'), 3], [W('local(ly)? (only|hosted|models?)'), 2.5], [W('no internet'), 3], [W('(data|files) (stay|stays|must stay)'), 2.5], [W('self[- ]?hosted'), 2.2]],
  },
  mobile_web: {
    label: { zh: '手机适配', en: 'Mobile-friendly' },
    hours: [4, 8],
    priority: 3,
    signals: [['手机适配', 3], ['移动端适配', 3], ['响应式', 2.5], ['手机上', 1.4], ['手机端', 2], [W('mobile[- ]friendly'), 3], [W('responsive'), 2.5], [W('works on (phones|mobile)'), 2.5]],
  },
  multitenant: {
    label: { zh: '多租户（给多家公司用）', en: 'Multi-tenant (many companies)' },
    hours: [10, 20],
    priority: 3,
    signals: [['多租户', 3], ['多家公司', 2.5], ['多个公司', 2.5], ['白标', 2.5], ['saas', 1.2], [W('multi[- ]?tenant'), 3], [W('white[- ]?label'), 2.5], [W('multiple (companies|clients|organizations)'), 2.5]],
  },
  tests: {
    label: { zh: '自动化测试', en: 'Automated tests' },
    hours: [4, 10],
    priority: 2,
    signals: [['自动化测试', 3], ['单元测试', 3], ['测试用例', 2.5], [W('(automated|unit|e2e|end[- ]to[- ]end) tests?'), 3], [W('playwright|vitest|jest|pytest'), 2.5]],
  },
  gui: {
    label: { zh: '图形界面（不用敲命令）', en: 'Simple GUI (no command line)' },
    hours: [6, 12],
    priority: 2,
    signals: [['界面', 1.2], ['图形界面', 3], ['点一下', 2], ['一键', 1.6], ['不懂技术', 2], ['不会编程', 2], [W('gui'), 3], [W('(simple|easy) (interface|ui)'), 2.5], [W('non[- ]technical'), 2], [W('one[- ]click'), 1.6]],
  },
  deploy_cn: {
    label: { zh: '国内服务器部署和备案', en: 'Hosting in mainland China (ICP filing)' },
    hours: [4, 8],
    priority: 3,
    signals: [['国内服务器', 3], ['阿里云', 2.5], ['腾讯云', 2.5], ['华为云', 2.5], ['备案', 3], ['国内访问', 2.5], [W('icp'), 3], [W('aliyun|alibaba cloud|tencent cloud'), 2.5], [W('(accessible|hosted|hosting) in china'), 3]],
    risk: { zh: '备案一般要几周，最好提前开始。', en: 'ICP filing usually takes weeks; start early.' },
  },
};

/** Features that only make sense for some kinds (others ignore the match). */
export const FEATURE_KINDS: Partial<Record<FeatureId, Kind[]>> = {
  offline: ['rag', 'chatbot', 'voice', 'local_ai', 'webapp', 'desktop', 'automation'],
  finetune: ['local_ai', 'rag', 'chatbot'],
  ocr: ['rag', 'automation', 'webapp', 'chatbot'],
  gui: ['automation', 'scraper', 'desktop', 'integration', 'voice', 'local_ai'],
  schedule: ['automation', 'scraper', 'integration', 'webapp', 'chatbot'],
  cms: ['site', 'webapp', 'ecommerce', 'miniprogram'],
  seo: ['site', 'ecommerce', 'webapp'],
  design: ['site', 'webapp', 'ecommerce', 'miniprogram', 'mobile', 'desktop', 'chatbot', 'rag'],
  wechat_login: ['webapp', 'site', 'ecommerce', 'mobile', 'chatbot', 'rag'],
  multitenant: ['webapp', 'rag', 'chatbot'],
  mobile_web: ['site', 'webapp', 'ecommerce', 'fix', 'rag', 'chatbot'],
  deploy_cn: ['site', 'webapp', 'ecommerce', 'miniprogram', 'rag', 'chatbot'],
};

/** Labels for the budget options of the contact form (src/lib/validation.ts BUDGETS). */
export function budgetBucket(usdMax: number | undefined): 'under_500' | '500_2000' | '2000_5000' | 'over_5000' | 'unsure' {
  if (usdMax === undefined || !Number.isFinite(usdMax)) return 'unsure';
  if (usdMax < 500) return 'under_500';
  if (usdMax <= 2000) return '500_2000';
  if (usdMax <= 5000) return '2000_5000';
  return 'over_5000';
}

/** Contact-form project type (src/lib/validation.ts PROJECT_TYPES) for a kind. */
export function projectTypeFor(kind: Kind | null): 'web' | 'rag' | 'local_ai' | 'automation' | 'other' {
  switch (kind) {
    case 'site':
    case 'webapp':
    case 'ecommerce':
    case 'miniprogram':
      return 'web';
    case 'rag':
    case 'chatbot':
      return 'rag';
    case 'local_ai':
    case 'voice':
      return 'local_ai';
    case 'automation':
    case 'scraper':
    case 'integration':
      return 'automation';
    default:
      return 'other';
  }
}

export const ALL_KINDS = Object.keys(KINDS) as Kind[];
export const ALL_FEATURES = Object.keys(FEATURES) as FeatureId[];
