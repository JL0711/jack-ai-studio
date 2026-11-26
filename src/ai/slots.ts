// Clarifying questions the assistant can ask, each answerable with one tap.
// A slot is asked only when its answer is still unknown and it matters for the
// kind of project; answering one changes the requirements (and so the price).

import { KINDS, PRICING } from './catalog';
import type { Bi, Kind, Requirements, SlotId } from './types';

export interface SlotOption {
  value: string;
  label: Bi;
  apply: (req: Requirements) => Requirements;
}

export interface SlotDef {
  question: Bi;
  /** Why it matters, shown under the question. */
  why?: Bi;
  known: (req: Requirements) => boolean;
  options: (req: Requirements) => SlotOption[];
}

const bi = (zh: string, en: string): Bi => ({ zh, en });

function withFeature(req: Requirements, f: keyof Requirements['features'], on: boolean): Requirements {
  return { ...req, features: { ...req.features, [f]: on }, inferred: (req.inferred ?? []).filter((x) => x !== f) };
}
function withQty(req: Requirements, k: keyof Requirements['quantities'], n: number): Requirements {
  return { ...req, quantities: { ...req.quantities, [k]: n } };
}
const under = (usd: number): Bi =>
  bi(`${usd.toLocaleString('en-US')} 美元以下（约 ${(usd * PRICING.cnyPerUsd).toLocaleString('en-US')} 元以下）`, `Under $${usd.toLocaleString('en-US')}`);

export const SLOTS: Record<SlotId, SlotDef> = {
  kind: {
    question: bi('你想做的更接近哪一种？', 'Which is closest to what you need?'),
    known: (r) => r.kind !== null,
    options: () =>
      (
        ['site', 'webapp', 'ecommerce', 'rag', 'chatbot', 'local_ai', 'automation', 'scraper', 'integration', 'voice', 'desktop', 'miniprogram', 'mobile', 'fix'] as Kind[]
      ).map((k) => ({
        value: k,
        label: KINDS[k].label,
        apply: (r: Requirements) => ({ ...r, kind: k, modify: k === 'fix' ? true : r.modify }),
      })),
  },
  docs: {
    question: bi('大概有多少份文件？', 'Roughly how many files?'),
    why: bi('文件越多，导入和检索调优的工作越多。', 'More files means more import and search tuning work.'),
    known: (r) => r.quantities.docs !== undefined,
    options: () => [
      { value: '50', label: bi('100 份以内', 'Under 100'), apply: (r) => withQty(r, 'docs', 50) },
      { value: '400', label: bi('几百份', 'A few hundred'), apply: (r) => withQty(r, 'docs', 400) },
      { value: '3000', label: bi('几千份', 'A few thousand'), apply: (r) => withQty(r, 'docs', 3000) },
      { value: '30000', label: bi('上万份', 'Tens of thousands'), apply: (r) => withQty(r, 'docs', 30000) },
    ],
  },
  offline: {
    question: bi('资料能不能交给云端 AI 处理？', 'Can the files go to a cloud AI service?'),
    why: bi('必须离线的话，模型要部署在你自己的电脑或服务器上。', 'If not, the model runs on your own computer or server.'),
    known: (r) => r.features.offline !== undefined,
    options: () => [
      { value: 'local', label: bi('不行，必须离线', 'No, it must stay offline'), apply: (r) => withFeature(r, 'offline', true) },
      { value: 'cloud', label: bi('可以用云端 API', 'Yes, a cloud API is fine'), apply: (r) => withFeature(r, 'offline', false) },
    ],
  },
  pages: {
    question: bi('网站大概几个页面？', 'About how many pages?'),
    known: (r) => r.quantities.pages !== undefined,
    options: () => [
      { value: '1', label: bi('一页就够', 'Just one page'), apply: (r) => withQty(r, 'pages', 1) },
      { value: '5', label: bi('3–5 页', '3–5 pages'), apply: (r) => withQty(r, 'pages', 5) },
      { value: '8', label: bi('6–10 页', '6–10 pages'), apply: (r) => withQty(r, 'pages', 8) },
      { value: '15', label: bi('10 页以上', 'More than 10'), apply: (r) => withQty(r, 'pages', 15) },
    ],
  },
  cms: {
    question: bi('以后要自己改文字、发新闻吗？', 'Will you update text or post news yourself later?'),
    known: (r) => r.features.cms !== undefined,
    options: () => [
      { value: 'yes', label: bi('要，自己能改', 'Yes, I want to edit it'), apply: (r) => withFeature(r, 'cms', true) },
      { value: 'no', label: bi('不用，很少改', 'No, it rarely changes'), apply: (r) => withFeature(r, 'cms', false) },
    ],
  },
  languages: {
    question: bi('网站要几种语言？', 'How many languages?'),
    known: (r) => r.quantities.languages !== undefined || r.features.i18n !== undefined,
    options: () => [
      { value: '1', label: bi('一种就行', 'Just one'), apply: (r) => withFeature(withQty(r, 'languages', 1), 'i18n', false) },
      { value: '2', label: bi('中英双语', 'Two (e.g. English + Chinese)'), apply: (r) => withFeature(withQty(r, 'languages', 2), 'i18n', true) },
      { value: '3', label: bi('三种或更多', 'Three or more'), apply: (r) => withFeature(withQty(r, 'languages', 3), 'i18n', true) },
    ],
  },
  design: {
    question: bi('界面有现成的设计稿吗？', 'Do you have designs already?'),
    known: (r) => r.hasDesign !== undefined || r.features.design !== undefined,
    options: () => [
      { value: 'have', label: bi('有设计稿', 'Yes, designs are ready'), apply: (r) => ({ ...withFeature(r, 'design', false), hasDesign: true }) },
      { value: 'need', label: bi('没有，需要设计', 'No, design it too'), apply: (r) => ({ ...withFeature(r, 'design', true), hasDesign: false }) },
      { value: 'simple', label: bi('简洁好用就行', 'Clean and simple is fine'), apply: (r) => withFeature(r, 'design', false) },
    ],
  },
  payments: {
    question: bi('需要在线收款吗？', 'Do you need online payments?'),
    known: (r) => r.features.payments !== undefined,
    options: () => [
      { value: 'yes', label: bi('需要', 'Yes'), apply: (r) => withFeature(r, 'payments', true) },
      { value: 'no', label: bi('不需要', 'No'), apply: (r) => withFeature(r, 'payments', false) },
    ],
  },
  roles: {
    question: bi('有几类用户？（比如客户、员工、管理员）', 'How many kinds of users? (e.g. clients, staff, admins)'),
    known: (r) => r.quantities.roles !== undefined || r.features.roles !== undefined,
    options: () => [
      { value: '1', label: bi('一类', 'One'), apply: (r) => withFeature(withQty(r, 'roles', 1), 'roles', false) },
      { value: '3', label: bi('两三类', 'Two or three'), apply: (r) => withFeature(withQty(r, 'roles', 3), 'roles', true) },
      { value: '5', label: bi('更多', 'More'), apply: (r) => withFeature(withQty(r, 'roles', 5), 'roles', true) },
    ],
  },
  users: {
    question: bi('大概多少人会用？', 'About how many people will use it?'),
    known: (r) => r.quantities.users !== undefined,
    options: () => [
      { value: '50', label: bi('100 人以内', 'Under 100'), apply: (r) => withQty(r, 'users', 50) },
      { value: '400', label: bi('几百人', 'A few hundred'), apply: (r) => withQty(r, 'users', 400) },
      { value: '3000', label: bi('上千人', 'Thousands'), apply: (r) => withQty(r, 'users', 3000) },
      { value: '20000', label: bi('上万人', 'Tens of thousands'), apply: (r) => withQty(r, 'users', 20000) },
    ],
  },
  channel: {
    question: bi('客服放在哪里用？', 'Where should the assistant answer?'),
    known: (r) => r.features.integrations !== undefined,
    options: () => [
      { value: 'web', label: bi('网站上', 'On my website'), apply: (r) => withFeature(r, 'integrations', false) },
      { value: 'wechat', label: bi('微信 / 企业微信', 'WeChat'), apply: (r) => withFeature(withQty(r, 'integrations', 1), 'integrations', true) },
      { value: 'whatsapp', label: bi('WhatsApp / Telegram', 'WhatsApp / Telegram'), apply: (r) => withFeature(withQty(r, 'integrations', 1), 'integrations', true) },
      { value: 'multi', label: bi('好几个渠道', 'Several channels'), apply: (r) => withFeature(withQty(r, 'integrations', 2), 'integrations', true) },
    ],
  },
  hardware: {
    question: bi('跑模型的电脑定了吗？', 'Do you have the hardware yet?'),
    known: (r) => r.hardware !== undefined,
    options: () => [
      { value: 'have', label: bi('有带显卡的电脑', 'Yes, a machine with a GPU'), apply: (r) => ({ ...r, hardware: 'have' }) },
      { value: 'need', label: bi('还没有，需要建议', 'No, I need advice'), apply: (r) => ({ ...r, hardware: 'need_advice' }) },
    ],
  },
  access: {
    question: bi('现在的代码能给到吗？', 'Can you share the existing code?'),
    known: (r) => r.access !== undefined,
    options: () => [
      { value: 'code', label: bi('能给代码仓库', 'Yes, the repository'), apply: (r) => ({ ...r, access: 'code' }) },
      { value: 'admin', label: bi('只有后台账号', 'Only an admin login'), apply: (r) => ({ ...r, access: 'admin' }) },
      { value: 'none', label: bi('都没有', 'Neither'), apply: (r) => ({ ...r, access: 'none' }) },
    ],
  },
  frequency: {
    question: bi('多久运行一次？', 'How often does it run?'),
    known: (r) => r.features.schedule !== undefined || r.features.gui !== undefined,
    options: () => [
      { value: 'once', label: bi('一次性', 'Just once'), apply: (r) => withFeature(r, 'schedule', false) },
      { value: 'auto', label: bi('每天 / 每周自动跑', 'Automatically, daily or weekly'), apply: (r) => withFeature(r, 'schedule', true) },
      { value: 'button', label: bi('需要时点一下就跑', 'Whenever someone clicks a button'), apply: (r) => withFeature(withFeature(r, 'gui', true), 'schedule', false) },
    ],
  },
  products: {
    question: bi('大概多少个商品？', 'About how many products?'),
    known: (r) => r.quantities.products !== undefined,
    options: () => [
      { value: '30', label: bi('50 个以内', 'Under 50'), apply: (r) => withQty(r, 'products', 30) },
      { value: '300', label: bi('几百个', 'A few hundred'), apply: (r) => withQty(r, 'products', 300) },
      { value: '1500', label: bi('上千个', 'Thousands'), apply: (r) => withQty(r, 'products', 1500) },
    ],
  },
  deadline: {
    question: bi('希望多久完成？', 'When do you need it?'),
    known: (r) => r.deadlineDays !== undefined || !!r.rush || !!r.relaxed,
    options: () => [
      { value: '7', label: bi('一周内', 'Within a week'), apply: (r) => ({ ...r, deadlineDays: 7, rush: true, relaxed: false }) },
      { value: '28', label: bi('一个月内', 'Within a month'), apply: (r) => ({ ...r, deadlineDays: 28, rush: false, relaxed: false }) },
      { value: '60', label: bi('一两个月', 'One or two months'), apply: (r) => ({ ...r, deadlineDays: 60, rush: false, relaxed: false }) },
      { value: 'none', label: bi('不着急', 'No rush'), apply: (r) => ({ ...r, deadlineDays: undefined, rush: false, relaxed: true }) },
    ],
  },
  budget: {
    question: bi('预算大概在哪个范围？', 'Roughly what budget do you have in mind?'),
    why: bi('知道预算，我可以直接告诉你够不够，不够的话先做哪些。', 'With a budget I can tell you if it fits, and what to build first if not.'),
    known: (r) => r.budget !== undefined,
    options: () => [
      { value: '450', label: under(500), apply: (r) => ({ ...r, budget: { min: 250, max: 450, currency: 'USD' } }) },
      { value: '2000', label: bi('500–2,000 美元（约 3,500–14,000 元）', '$500–2,000'), apply: (r) => ({ ...r, budget: { min: 500, max: 2000, currency: 'USD' } }) },
      { value: '5000', label: bi('2,000–5,000 美元（约 1.4–3.5 万元）', '$2,000–5,000'), apply: (r) => ({ ...r, budget: { min: 2000, max: 5000, currency: 'USD' } }) },
      { value: '9000', label: bi('5,000 美元以上', 'Over $5,000'), apply: (r) => ({ ...r, budget: { min: 5000, max: 9000, currency: 'USD' } }) },
    ],
  },
};

/** Which questions matter for each kind, most valuable first. */
const ORDER: Record<Kind, SlotId[]> = {
  rag: ['docs', 'offline', 'users', 'deadline', 'budget'],
  chatbot: ['channel', 'offline', 'deadline', 'budget'],
  site: ['pages', 'cms', 'languages', 'design', 'deadline', 'budget'],
  webapp: ['roles', 'payments', 'users', 'design', 'deadline', 'budget'],
  ecommerce: ['products', 'languages', 'design', 'deadline', 'budget'],
  miniprogram: ['payments', 'design', 'deadline', 'budget'],
  mobile: ['payments', 'design', 'deadline', 'budget'],
  local_ai: ['hardware', 'users', 'deadline', 'budget'],
  automation: ['frequency', 'deadline', 'budget'],
  scraper: ['frequency', 'deadline', 'budget'],
  integration: ['frequency', 'deadline', 'budget'],
  voice: ['offline', 'deadline', 'budget'],
  desktop: ['deadline', 'budget'],
  fix: ['access', 'deadline', 'budget'],
  consult: [],
};

/** The most useful question still open, or null. */
export function nextSlot(req: Requirements, asked: SlotId[]): SlotId | null {
  if (!req.kind) return asked.includes('kind') ? null : 'kind';
  for (const id of ORDER[req.kind]) {
    if (asked.includes(id)) continue;
    if (!SLOTS[id].known(req)) return id;
  }
  return null;
}

export function slotOption(slot: SlotId, value: string, req: Requirements): SlotOption | undefined {
  return SLOTS[slot].options(req).find((o) => o.value === value);
}
