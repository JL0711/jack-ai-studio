// Reads a visitor's free-text message (Chinese or English) into structured
// signals: kind of project, features (with "no X" negation), quantities,
// budget, deadline and a few flags. Pure functions, no DOM: unit-tested in
// src/__tests__/ai-nlu.test.ts.

import { ALL_FEATURES, ALL_KINDS, FEATURES, KINDS, MODIFY_SIGNALS, type Pattern, type Signal } from './catalog';
import type { FeatureId, Kind, Lang, Money, Requirements } from './types';

// ---------- text helpers ----------

export interface Text {
  /** NFKC-normalised (full-width digits/letters → half-width), original case: for quoting back. */
  orig: string;
  /** Lower-case version of `orig` (same length), used for matching. */
  low: string;
}

export function prepare(input: string): Text {
  const orig = input.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const low = orig.toLowerCase();
  return { orig: low.length === orig.length ? orig : low, low };
}

const CJK = /[㐀-鿿豈-﫿]/g;

/** Chinese if the message is mostly Chinese characters, otherwise English. */
export function detectLang(text: string, fallback: Lang = 'en'): Lang {
  const cjk = (text.match(CJK) ?? []).length;
  const words = (text.match(/[a-z]{2,}/gi) ?? []).length;
  if (cjk === 0 && words === 0) return fallback;
  return cjk >= 2 && cjk >= words ? 'zh' : cjk > 0 && words <= 2 ? 'zh' : 'en';
}

// Patterns from the catalog: plain strings match as text, but ASCII words must
// not match inside longer words ('app' must not hit 'whatsapp'). No lookbehind:
// older Safari can't compile it, so the boundary is consumed and the index fixed.
const compiled = new Map<Pattern, RegExp>();
function toRegExp(p: Pattern): RegExp {
  let re = compiled.get(p);
  if (re) return re;
  if (p instanceof RegExp) {
    re = new RegExp(p.source, p.flags.includes('g') ? p.flags : `${p.flags}g`);
  } else {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const head = /^[a-z0-9]/i.test(p) ? '(?:^|[^a-z0-9])' : '';
    const tail = /[a-z0-9]$/i.test(p) ? '(?![a-z0-9])' : '';
    re = new RegExp(`${head}(${esc})${tail}`, 'gi');
  }
  compiled.set(p, re);
  return re;
}

export interface Hit {
  index: number;
  length: number;
  weight: number;
  negated: boolean;
}

function hitsFor(t: Text, p: Pattern, weight: number): Hit[] {
  const re = toRegExp(p);
  re.lastIndex = 0;
  const out: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t.low))) {
    let index = m.index;
    let length = m[0].length;
    if (typeof p === 'string' && m[1] !== undefined) {
      index += m[0].length - m[1].length;
      length = m[1].length;
    }
    if (length === 0) {
      re.lastIndex++;
      continue;
    }
    out.push({ index, length, weight, negated: isNegated(t.low, index, length) });
  }
  return out;
}

const CLAUSE_END = /[,，。.;；!！?？\n、]/;

/** The part of the clause before / after a match (stops at punctuation). */
function clauseBefore(s: string, index: number, max: number): string {
  let start = Math.max(0, index - max);
  for (let i = index - 1; i >= start; i--) {
    if (CLAUSE_END.test(s[i])) {
      start = i + 1;
      break;
    }
  }
  return s.slice(start, index);
}
function clauseAfter(s: string, end: number, max: number): string {
  const chunk = s.slice(end, end + max);
  const cut = chunk.search(CLAUSE_END);
  return cut >= 0 ? chunk.slice(0, cut) : chunk;
}

// "没有X" / "we don't have X" means they lack it (and often want it), so it is not a negation.
const NEG_BEFORE_ZH = /(不需要|不要|不用|无需|不必|不做|去掉|免去|暂时不|先不|不想要|不考虑|不包括|不含|用不着)[^不]{0,4}$/;
const NEG_AFTER_ZH = /^.{0,4}?(不需要|不要|不用|先不做|暂时不要|就不用了|不用了|不做|不必|可以不要|去掉|没有必要|用不着)/;
const NEG_BEFORE_EN = /\b(no|without|don'?t need|do not need|doesn'?t need|does not need|don'?t want|do not want|won'?t need|will not need|no need (for|to)|skip|except|excluding|remove|not including|never)\b[^.]{0,22}$/;
const NEG_AFTER_EN = /^\s*(is|are|isn'?t|aren'?t)?\s*(not needed|not required|unnecessary|not necessary|isn'?t needed|aren'?t needed|can wait)/;

export function isNegated(low: string, index: number, length: number): boolean {
  const before = clauseBefore(low, index, 14);
  const after = clauseAfter(low, index + length, 12);
  const cjk = /[㐀-鿿]/.test(before + low.slice(index, index + length) + after);
  if (cjk) {
    if (NEG_BEFORE_ZH.test(before) || NEG_AFTER_ZH.test(after)) return true;
  }
  return NEG_BEFORE_EN.test(before) || NEG_AFTER_EN.test(after);
}

/** Total weight of the distinct patterns found (each pattern counts once). */
function score(t: Text, signals: readonly Signal[]): { pos: number; neg: number; hits: (Hit & { p: Pattern })[] } {
  let pos = 0;
  let neg = 0;
  const hits: (Hit & { p: Pattern })[] = [];
  for (const [p, w] of signals) {
    const found = hitsFor(t, p, w);
    if (!found.length) continue;
    const positive = found.find((h) => !h.negated);
    if (positive) {
      pos += w;
      hits.push({ ...positive, p });
    } else {
      neg += w;
      hits.push({ ...found[0], p });
    }
  }
  return { pos, neg, hits };
}

// ---------- numbers ----------

const ZH_DIGITS: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 俩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const ZH_UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
const EN_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fifty: 50, hundred: 100, several: 3, few: 3, couple: 2, dozen: 12,
};

/** Chinese numerals, including rough ones (几百 ≈ 300, 上万 ≈ 10000, 十几 ≈ 15). */
export function parseZhNumber(s: string): number | null {
  const rough: Record<string, number> = {
    几十: 30, 数十: 30, 十几: 15, 几百: 300, 数百: 300, 上百: 100, 几千: 3000, 数千: 3000, 上千: 1000,
    几万: 30000, 数万: 30000, 上万: 10000, 十几万: 150000, 几十万: 300000, 一两百: 150, 两三百: 250, 三五百: 400,
    一两千: 1500, 两三千: 2500, 三五千: 4000, 一两万: 15000, 两三万: 25000, 三五万: 40000, 几: 3, 一两: 2, 两三: 3, 三五: 4,
  };
  if (rough[s] !== undefined) return rough[s];
  if (!/^[零〇一二两俩三四五六七八九十百千万]+$/.test(s)) return null;
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const ch of s) {
    if (ch in ZH_DIGITS) {
      digit = ZH_DIGITS[ch];
    } else if (ch === '万') {
      section = (section + digit) * 10000;
      total += section;
      section = 0;
      digit = 0;
    } else {
      const unit = ZH_UNITS[ch];
      section += (digit || (unit === 10 ? 1 : 0)) * unit;
      digit = 0;
    }
  }
  return total + section + digit;
}

/** "1,200" "1.5k" "2w" "3万" "五百" "1.2万" "几千" "two" → number. */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  const m = s.match(/^(\d+(?:,\d{3})*(?:\.\d+)?|\d*\.\d+)(k|w|千|万|百|m)?$/);
  if (m) {
    const n = Number(m[1].replace(/,/g, ''));
    const mult = { k: 1000, 千: 1000, w: 10000, 万: 10000, 百: 100, m: 1_000_000 }[m[2] as 'k'] ?? 1;
    return Number.isFinite(n) ? n * mult : null;
  }
  const mixed = s.match(/^(\d+(?:\.\d+)?)(十|百|千|万)$/);
  if (mixed) return Number(mixed[1]) * ZH_UNITS[mixed[2]];
  if (EN_WORDS[s] !== undefined) return EN_WORDS[s];
  return parseZhNumber(s);
}

const NUM = '(\\d+(?:,\\d{3})*(?:\\.\\d+)?\\s*(?:k|w|千|万|百)?|[零〇一二两俩三四五六七八九十百千万几数上]+)';
const EN_NUM = '(\\d+(?:,\\d{3})*(?:\\.\\d+)?k?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|fifty|a hundred|hundreds of|thousands of|dozens of|several|a few|a couple of)';

function enNumber(raw: string): number | null {
  const s = raw.toLowerCase().trim();
  if (s === 'hundreds of') return 300;
  if (s === 'thousands of') return 3000;
  if (s === 'dozens of') return 36;
  if (s === 'a hundred') return 100;
  if (s === 'a few') return 3;
  if (s === 'a couple of') return 2;
  return parseNumber(s);
}

function firstQuantity(low: string, zh: RegExp, en: RegExp): number | undefined {
  const a = low.match(zh);
  if (a) {
    const n = parseNumber(a[1]);
    if (n !== null && n > 0) return n;
  }
  const b = low.match(en);
  if (b) {
    const n = enNumber(b[1]);
    if (n !== null && n > 0) return n;
  }
  return undefined;
}

// ---------- quantities ----------

const DOCS_ZH = new RegExp(`${NUM}\\s*(?:多|余|来)?\\s*(?:份|个|篇|本|套)?\\s*(?:pdf|文件|文档|合同|资料|论文|手册|报告|word|制度|案例|标书)`, 'i');
const DOCS_EN = new RegExp(`\\b${EN_NUM}\\+?\\s*(?:pdfs?|documents?|docs|files|contracts|manuals|papers|reports|policies)\\b`, 'i');
const PAGES_ZH = new RegExp(`${NUM}\\s*(?:个)?\\s*(?:页面|网页|板块|栏目)`);
const PAGES_ZH2 = new RegExp(`${NUM}\\s*(?:个)?\\s*页(?!\\s*(?:pdf|文档|的pdf|的文档|的合同|word))`, 'i');
const PAGES_EN = new RegExp(`\\b${EN_NUM}\\s*(?:pages?|sections?|screens?)\\b(?![- ]*(?:pdf|document|doc))`, 'i');
const USERS_ZH = new RegExp(`${NUM}\\s*(?:多|余|来)?\\s*(?:个|名|位)?\\s*(?:用户|员工|学员|会员|客户|老师|学生|成员|队员|销售|同事|律师|医生|护士|会计|工程师|设计师|客服|店员|家长|志愿者|人在用|人使用|人用)`);
// "十几个律师用" / "五十名员工在用": N + measure word + who + 用
const USERS_ZH2 = new RegExp(`${NUM}\\s*(?:多|余|来)?\\s*(?:个|名|位)\\s*[\\u4e00-\\u9fff]{1,3}?(?:在)?(?:用|使用)`);
const USERS_EN = new RegExp(`\\b${EN_NUM}\\+?\\s*(?:users?|people|employees|staff|members|customers|students|clients|seats|team members)\\b`, 'i');
const LANGS_ZH = /([一二两三四五六七八九十几\d]+)\s*(?:种|门|个)?\s*语言/;
const LANGS_EN = new RegExp(`\\b${EN_NUM}\\s+languages\\b`, 'i');
const PRODUCTS_ZH = new RegExp(`${NUM}\\s*(?:多|余|来)?\\s*(?:个|款|件)?\\s*(?:商品|产品|sku)`, 'i');
const PRODUCTS_EN = new RegExp(`\\b${EN_NUM}\\+?\\s*(?:products|skus|items)\\b`, 'i');
const ROLES_ZH = new RegExp(`${NUM}\\s*(?:种|类|个)\\s*(?:角色|身份|用户类型|权限)`);
const ROLES_EN = new RegExp(`\\b${EN_NUM}\\s+(?:roles|user types|kinds of users|types of users)\\b`, 'i');

const LANGUAGE_NAMES = [
  ['中文', 'chinese', '汉语', '普通话', '国语'], ['英文', 'english', '英语'], ['日文', 'japanese', '日语'], ['韩文', 'korean', '韩语'],
  ['西班牙', 'spanish'], ['法语', 'french', '法文'], ['德语', 'german', '德文'], ['阿拉伯', 'arabic'], ['越南', 'vietnamese'],
  ['泰语', 'thai', '泰文'], ['葡萄牙', 'portuguese'], ['俄语', 'russian', '俄文'], ['繁体', 'traditional chinese', '粤语', 'cantonese'],
];

const NAMED_SYSTEMS = [
  'quickbooks', 'shopify', 'hubspot', 'salesforce', 'airtable', 'notion', 'slack', 'google sheets', 'stripe', 'xero', 'zoho',
  'gmail', 'outlook', 'whatsapp', 'telegram', 'discord', 'prestashop', 'woocommerce', 'sap', 'odoo', 'jira', 'trello',
  '飞书', '钉钉', '企业微信', '用友', '金蝶', '有赞', '微店', '抖音', '小红书', '淘宝', '京东', 'erp', 'crm',
];

function countNamed(low: string, names: string[]): number {
  let n = 0;
  for (const name of names) if (hitsFor({ low, orig: low }, name, 1).some((h) => !h.negated)) n++;
  return n;
}

// ---------- money ----------

const CUR_BEFORE = '(us\\$|usd|\\$|¥|rmb|cny|人民币)?';
const AMOUNT = '(\\d+(?:,\\d{3})*(?:\\.\\d+)?\\s*(?:k|w|千|万)?|[一二两三四五六七八九十百千万几]+[十百千万])';
const CUR_AFTER = '\\s*(美元|美金|刀|dollars?|bucks|usd|元|块钱|块|人民币|rmb|cny)?';
const MONEY_RANGE = new RegExp(`${CUR_BEFORE}\\s*${AMOUNT}${CUR_AFTER}\\s*(?:-|–|—|~|～|到|至|to)\\s*${CUR_BEFORE}\\s*${AMOUNT}${CUR_AFTER}`, 'gi');
const MONEY_ONE = new RegExp(`${CUR_BEFORE}\\s*${AMOUNT}${CUR_AFTER}`, 'gi');
const BUDGET_WORDS = /(预算|大概|大约|左右|以内|以下|上限|最多|不超过|能出|价位|费用|报价|出价|budget|around|about|under|max(imum)?|up to|no more than|less than|willing to pay|can pay|can spend|spend|price range|cost)/i;
const PER_UNIT_AFTER = /^\s*(\/|每|per\b|一个月|一年|\/月|\/年|一份|一次|a month|a year|monthly|per month|an hour|\/h|\/hr|每小时)/i;

function currencyOf(...marks: (string | undefined)[]): 'USD' | 'CNY' | null {
  for (const m of marks) {
    if (!m) continue;
    const s = m.toLowerCase();
    if (/us\$|usd|\$|美元|美金|刀|dollar|buck/.test(s)) return 'USD';
    if (/¥|rmb|cny|人民币|元|块/.test(s)) return 'CNY';
  }
  return null;
}

export interface BudgetRead {
  money: Money;
  /** No currency given: guessed from the message language. */
  assumed: boolean;
  raw: string;
}

export function readBudget(low: string, lang: Lang): BudgetRead | undefined {
  const candidates: { money: Money; assumed: boolean; raw: string; index: number; context: boolean }[] = [];
  const consider = (m: RegExpExecArray, min: number, max: number, cur: 'USD' | 'CNY' | null, upto: boolean) => {
    const before = low.slice(Math.max(0, m.index - 12), m.index);
    const after = low.slice(m.index + m[0].length, m.index + m[0].length + 10);
    const context = BUDGET_WORDS.test(before) || /^\s*(以内|以下|左右|上下|之内)/.test(after);
    if (PER_UNIT_AFTER.test(after) && !/预算|budget/i.test(before)) return;
    if (!cur && !context) return;
    // Bare small numbers are usually counts, not money.
    if (!cur && max < 100) return;
    const currency = cur ?? (lang === 'zh' ? 'CNY' : 'USD');
    const lowEnd = upto || /以内|以下|under|less than|up to|max|不超过|最多/i.test(before + after) ? Math.round(max * 0.6) : min;
    candidates.push({ money: { min: lowEnd, max, currency }, assumed: !cur, raw: m[0].trim(), index: m.index, context });
  };

  MONEY_RANGE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const covered: [number, number][] = [];
  while ((m = MONEY_RANGE.exec(low))) {
    const a = parseNumber(m[2]);
    let b = parseNumber(m[5]);
    if (a === null || b === null) continue;
    // "2-3千" / "3~5万": the unit on the second number applies to both.
    let lo = a;
    const unit = m[5].match(/(k|w|千|万)\s*$/i)?.[1];
    if (unit && !/(k|w|千|万)\s*$/i.test(m[2])) lo = parseNumber(`${m[2]}${unit}`) ?? a;
    if (b < lo) [lo, b] = [b, lo];
    const cur = currencyOf(m[1], m[3], m[4], m[6]);
    consider(m, lo, b, cur, false);
    covered.push([m.index, m.index + m[0].length]);
  }
  MONEY_ONE.lastIndex = 0;
  while ((m = MONEY_ONE.exec(low))) {
    const at = m.index;
    if (covered.some(([s, e]) => at >= s && at < e)) continue;
    const n = parseNumber(m[2]);
    if (n === null || n <= 0) continue;
    const cur = currencyOf(m[1], m[3]);
    // A year ("2026年") or a count ("3000份") is not money.
    const after = low.slice(at + m[0].length, at + m[0].length + 16);
    if (!cur && /^\s*(年|份|个|页|人|天|周|月|小时|篇|款|种|位|名|次|条|张|%|号|日)/.test(after)) continue;
    if (!cur && /^\s*\+?\s*(users?|people|pages?|docs?|documents?|files?|pdfs?|products?|items?|skus?|hours?|days?|weeks?|months?|years?|employees|members|customers|students|languages?|sites?|records?|rows?|questions?|times?|%)\b/i.test(after)) continue;
    consider(m, n, n, cur, false);
  }
  if (!candidates.length) return undefined;
  // Prefer an amount said in a budget context, then the largest.
  candidates.sort((x, y) => Number(y.context) - Number(x.context) || y.money.max - x.money.max);
  const best = candidates[0];
  return { money: best.money, assumed: best.assumed, raw: best.raw };
}

export function toUsd(m: Money, cnyPerUsd: number): [number, number] {
  const f = m.currency === 'USD' ? 1 : 1 / cnyPerUsd;
  return [Math.round(m.min * f), Math.round(m.max * f)];
}

// ---------- deadline ----------

const DEADLINE_ZH = /([\d.]+|[一二两三四五六七八九十半几]+)\s*(个)?\s*(半)?\s*(天|日|周|星期|礼拜|个月|月)\s*(内|之内|以内|完成|上线|交付|做完|搞定|左右|里|就要|必须)/;
const DEADLINE_EN = new RegExp(`\\b(?:within|in|under|less than|by|takes?|needs? to be done in)\\s+${EN_NUM}\\s+(days?|weeks?|months?)\\b`, 'i');
const RUSH = /(尽快|越快越好|加急|很急|比较急|急用|马上要|立刻|今天要|明天要|这周要|本周要|\basap\b|\burgent(ly)?\b|\brush\b|as soon as possible|right away|immediately|by tomorrow|this week)/i;
const RELAXED = /(不急|不着急|慢慢来|时间充裕|没有截止|\bno rush\b|\bno hurry\b|\bflexible\b|no (hard )?deadline|whenever)/i;
const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function daysUntil(now: Date, month: number, day: number): number {
  const target = new Date(now.getFullYear(), month, day);
  if (target.getTime() < now.getTime() - 86400000) target.setFullYear(target.getFullYear() + 1);
  return Math.max(1, Math.round((target.getTime() - now.getTime()) / 86400000));
}

export function readDeadline(low: string, now: Date): { days?: number; rush?: boolean; relaxed?: boolean } {
  const out: { days?: number; rush?: boolean; relaxed?: boolean } = {};
  if (RELAXED.test(low)) out.relaxed = true;
  if (RUSH.test(low)) out.rush = true;
  const zh = low.match(DEADLINE_ZH);
  if (zh) {
    let n = zh[1] === '半' ? 0.5 : parseNumber(zh[1]);
    if (n !== null) {
      if (zh[3] === '半') n += 0.5;
      const unit = zh[4];
      out.days = Math.round(n * (unit === '天' || unit === '日' ? 1 : unit === '周' || unit === '星期' || unit === '礼拜' ? 7 : 30));
    }
  }
  if (out.days === undefined) {
    const en = low.match(DEADLINE_EN);
    if (en) {
      const n = enNumber(en[1]);
      if (n !== null) out.days = Math.round(n * (en[2].startsWith('day') ? 1 : en[2].startsWith('week') ? 7 : 30));
    }
  }
  if (out.days === undefined) {
    const date = low.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?\s*(?:前|之前|以前|上线|完成|交付)/);
    if (date) out.days = daysUntil(now, Number(date[1]) - 1, Number(date[2]));
    const en = low.match(/\b(?:by|before|until|due)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/);
    if (!date && en) out.days = daysUntil(now, MONTHS_EN.indexOf(en[1]), Number(en[2]));
  }
  if (out.days === undefined) {
    if (/下周|下个星期|next week/.test(low)) out.days = 10;
    else if (/这周|本周|this week/.test(low)) out.days = 5;
    else if (/月底|end of (the|this) month/.test(low)) {
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      out.days = Math.max(3, Math.round((end.getTime() - now.getTime()) / 86400000));
    } else if (/下个月|下月|next month/.test(low)) out.days = 35;
    else if (/年底|年前|end of (the )?year/.test(low)) out.days = daysUntil(now, 11, 31);
    else if (/春节前|过年前|chinese new year/.test(low)) out.days = daysUntil(now, 0, 25);
  }
  if (out.days !== undefined && out.days <= 7) out.rush = true;
  return out;
}

// ---------- flags ----------

const SENSITIVE = /(医疗|病历|病人|患者|诊所|医院|hipaa|金融|银行|证券|保险|法律|律所|律师|保密|机密|隐私|个人信息|身份证|\bmedical\b|\bpatients?\b|\bhealth(care)?\b|\bclinic\b|\bfinanc(e|ial)\b|\bbank(ing)?\b|\blegal\b|\blaw firm\b|\bconfidential\b|\bprivacy\b|\bgdpr\b|\bpii\b|\bsensitive\b)/i;
const HAS_DESIGN = /(有设计稿|已有设计|设计稿已|有ui稿|有 ui 稿|有figma|有 figma|设计好了|有原型|有效果图|有设计图|设计已经做好|\bhave (a |the |our )?(designs?|figma|mockups?|wireframes?)\b|\bdesigns? (is|are) (ready|done)\b|\bfigma (file )?(is )?ready\b)/i;
const NEEDS_DESIGN = /(没有设计|需要设计|帮我设计|从零设计|没设计稿|没有ui|\bno designs?\b|\bneed (a |some )?designs?\b|\bdesign (it )?from scratch\b|\bdon'?t have (a )?designs?\b)/i;

// ---------- the reader ----------

export interface Parsed {
  lang: Lang;
  kindScores: Partial<Record<Kind, number>>;
  kind: Kind | null;
  /** 0–1: how clearly the text points at `kind`. */
  kindConfidence: number;
  modify: boolean;
  features: Partial<Record<FeatureId, boolean>>;
  quantities: Requirements['quantities'];
  budget?: BudgetRead;
  deadlineDays?: number;
  rush?: boolean;
  relaxed?: boolean;
  hasDesign?: boolean;
  sensitive?: boolean;
  /** Snippets of the visitor's own words that were recognised, strongest first. */
  heard: string[];
  /** How much real project information the message carried (0 = none). */
  signal: number;
  /** Features assumed from context rather than said (e.g. a shop needs payments). */
  inferred: FeatureId[];
}

export function understand(input: string, opts: { now?: Date; fallbackLang?: Lang } = {}): Parsed {
  const now = opts.now ?? new Date();
  const t = prepare(input);
  const lang = detectLang(t.low, opts.fallbackLang ?? 'en');
  const heardHits: { s: string; w: number; i: number }[] = [];
  const remember = (h: Hit) => {
    if (!h.negated) heardHits.push({ s: t.orig.slice(h.index, h.index + h.length), w: h.weight, i: h.index });
  };
  const kindHits: Partial<Record<Kind, Hit[]>> = {};

  // Kinds
  const kindScores: Partial<Record<Kind, number>> = {};
  for (const k of ALL_KINDS) {
    const { pos, hits } = score(t, KINDS[k].signals);
    if (pos > 0) {
      kindScores[k] = Math.round(pos * 10) / 10;
      kindHits[k] = hits;
    }
  }
  const mod = score(t, MODIFY_SIGNALS);
  let modify = mod.pos >= 2.5;
  if (modify) mod.hits.forEach(remember);

  // Combinations: local + documents = document Q&A that runs offline, etc.
  const features: Partial<Record<FeatureId, boolean>> = {};
  const ks = (k: Kind) => kindScores[k] ?? 0;
  if (ks('local_ai') >= 2.5 && (ks('rag') >= 2.5 || ks('chatbot') >= 2.5 || ks('voice') >= 3)) {
    features.offline = true;
    kindScores.local_ai = Math.min(ks('local_ai'), Math.max(ks('rag'), ks('chatbot'), ks('voice')) - 0.5);
  }
  if (ks('ecommerce') >= 3) kindScores.site = Math.min(ks('site'), ks('ecommerce') - 0.5);
  if (ks('webapp') >= 3 && ks('site') > 0 && ks('site') < ks('webapp') + 1.5) kindScores.site = Math.min(ks('site'), ks('webapp') - 0.5);
  if (ks('scraper') >= 3.5) {
    // The shop / site is what gets scraped, not what gets built.
    for (const k of ['automation', 'ecommerce', 'site', 'webapp'] as Kind[]) if (kindScores[k]) kindScores[k] = Math.min(ks(k), ks('scraper') - 0.5);
  }
  if (ks('chatbot') >= 3 && ks('rag') >= 3 && !/(客服|support|customer|whatsapp|微信|wechat)/i.test(t.low)) {
    kindScores.chatbot = Math.min(ks('chatbot'), ks('rag') - 0.2);
  }
  // A mobile app mentioned only as "app" next to "web app" / "小程序" is not a native app.
  if (ks('mobile') < 2 && (ks('webapp') >= 3 || ks('miniprogram') >= 4)) delete kindScores.mobile;

  const ranked = (Object.entries(kindScores) as [Kind, number][]).sort((a, b) => b[1] - a[1]);
  let kind: Kind | null = null;
  let kindConfidence = 0;
  if (ranked.length && ranked[0][1] >= 2) {
    kind = ranked[0][0];
    const second = ranked[1]?.[1] ?? 0;
    kindConfidence = Math.min(1, (ranked[0][1] / 6) * (second ? Math.min(1, 0.55 + (ranked[0][1] - second) / ranked[0][1]) : 1));
    // "Advice" words are weak; a real project kind wins over them.
    if (kind === 'consult' && ranked[1] && ranked[1][1] >= 2.5) kind = ranked[1][0];
  }
  if (!kind && modify) {
    kind = 'fix';
    kindConfidence = 0.4;
  }
  if (kind === 'fix') modify = true;
  if (kind) (kindHits[kind] ?? []).filter((h) => h.weight >= 1.5).forEach(remember);
  if (kind === 'rag' && features.offline) (kindHits.local_ai ?? []).filter((h) => h.weight >= 2.5).forEach(remember);

  // Features
  for (const f of ALL_FEATURES) {
    const { pos, neg, hits } = score(t, FEATURES[f].signals);
    if (pos >= 2) {
      features[f] = true;
      hits.forEach(remember);
    } else if (neg >= 2 && pos === 0) {
      features[f] = false;
    }
  }
  const hasDesign = HAS_DESIGN.test(t.low) ? true : NEEDS_DESIGN.test(t.low) ? false : undefined;
  if (hasDesign === true) features.design = false;
  if (hasDesign === false) features.design = true;
  // "AI" inside an AI kind is the product itself, not an add-on.
  if (kind && KINDS[kind].included.includes('ai_chat')) delete features.ai_chat;
  // A shop built as a mini program / web app / app still takes payments and needs product management.
  const inferred: FeatureId[] = [];
  if (kind && ['miniprogram', 'webapp', 'mobile'].includes(kind) && ks('ecommerce') >= 3) {
    for (const f of ['payments', 'admin'] as FeatureId[]) {
      if (features[f] === undefined) {
        features[f] = true;
        inferred.push(f);
      }
    }
  }

  // Quantities
  const quantities: Requirements['quantities'] = {};
  const docs = firstQuantity(t.low, DOCS_ZH, DOCS_EN);
  if (docs) quantities.docs = docs;
  const pages = firstQuantity(t.low, PAGES_ZH, PAGES_EN) ?? (kind === 'site' ? firstQuantity(t.low, PAGES_ZH2, /$^/) : undefined);
  if (pages && pages < 500) quantities.pages = pages;
  const users = firstQuantity(t.low, USERS_ZH, USERS_EN) ?? firstQuantity(t.low, USERS_ZH2, /$^/);
  if (users) quantities.users = users;
  const products = firstQuantity(t.low, PRODUCTS_ZH, PRODUCTS_EN);
  if (products) quantities.products = products;
  const roles = firstQuantity(t.low, ROLES_ZH, ROLES_EN);
  if (roles && roles < 20) {
    quantities.roles = roles;
    if (roles >= 2) features.roles = true;
  }
  let languages = firstQuantity(t.low, LANGS_ZH, LANGS_EN);
  const named = LANGUAGE_NAMES.filter((names) => names.some((n) => hitsFor(t, n, 1).length)).length;
  if (!languages && named >= 2 && /(版|网站|界面|多语|双语|翻译|version|site|website|languages?|translat|bilingual|interface)/i.test(t.low)) languages = named;
  if (languages && languages < 30) {
    quantities.languages = languages;
    if (languages >= 2 && features.i18n !== false) features.i18n = true;
  }
  const systems = countNamed(t.low, NAMED_SYSTEMS);
  if (systems >= 1 && (features.integrations || kind === 'integration')) quantities.integrations = Math.max(1, systems);

  // Budget, deadline, flags
  const budget = readBudget(t.low, lang);
  const dl = readDeadline(t.low, now);
  const sensitive = SENSITIVE.test(t.low) || undefined;

  heardHits.sort((a, b) => b.w - a.w || a.i - b.i);
  const heard: string[] = [];
  for (const h of heardHits) {
    const s = h.s.trim();
    if (s.length >= 2 && !heard.some((x) => x.toLowerCase() === s.toLowerCase() || x.includes(s))) heard.push(s);
    if (heard.length >= 6) break;
  }

  const signal =
    (kind ? 2 : 0) +
    // A feature switched off ("no SMS") is information too.
    Object.keys(features).length +
    Object.keys(quantities).length +
    (budget ? 1 : 0) +
    (dl.days !== undefined || dl.rush ? 1 : 0) +
    (modify ? 1 : 0);

  return {
    lang,
    kindScores,
    kind,
    kindConfidence,
    modify,
    features,
    quantities,
    budget,
    deadlineDays: dl.days,
    rush: dl.rush,
    relaxed: dl.relaxed,
    hasDesign,
    sensitive,
    heard,
    signal,
    inferred,
  };
}

/** Folds a newly read message into what is already known. Newer facts win. */
export function mergeRequirements(prev: Requirements, p: Parsed, text: string): Requirements {
  const next: Requirements = {
    ...prev,
    features: { ...prev.features },
    quantities: { ...prev.quantities, ...p.quantities },
    heard: [...prev.heard],
    inferred: [...(prev.inferred ?? [])],
  };
  const prevScore = prev.kind ? 3 : 0;
  if (p.kind && (p.kind !== 'fix' || !prev.kind)) {
    const strong = (p.kindScores[p.kind] ?? 0) >= 3 || p.kind === 'fix';
    if (!prev.kind || strong || (p.kindScores[p.kind] ?? 0) > prevScore) {
      if (prev.kind && prev.kind !== p.kind && prev.kind !== 'fix') next.alsoKind = prev.kind;
      next.kind = p.kind;
    }
  }
  if (p.modify) next.modify = true;
  for (const [f, v] of Object.entries(p.features) as [FeatureId, boolean][]) {
    if (p.inferred.includes(f)) {
      // A guess never overrides what the visitor said earlier.
      if (next.features[f] === undefined) {
        next.features[f] = v;
        if (!next.inferred?.includes(f)) next.inferred?.push(f);
      }
      continue;
    }
    next.features[f] = v;
    next.inferred = next.inferred?.filter((x) => x !== f);
  }
  if (p.budget) next.budget = p.budget.money;
  if (p.deadlineDays !== undefined) next.deadlineDays = p.deadlineDays;
  if (p.rush) next.rush = true;
  if (p.relaxed) {
    next.relaxed = true;
    next.rush = false;
  }
  if (p.hasDesign !== undefined) next.hasDesign = p.hasDesign;
  if (p.sensitive) next.sensitive = true;
  for (const h of p.heard) if (!next.heard.includes(h)) next.heard.push(h);
  next.heard = next.heard.slice(-12);
  next.detail = prev.detail + Array.from(text.trim()).length;
  return next;
}

export function emptyRequirements(): Requirements {
  return { kind: null, features: {}, modify: false, quantities: {}, heard: [], detail: 0, inferred: [] };
}
