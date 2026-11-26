// Reads a visitor's free-text message (Chinese or English) into structured
// signals: kind of project, features (with "no X" negation), quantities,
// budget, deadline and a few flags. Pure functions, no DOM: unit-tested in
// src/__tests__/ai-engine.test.ts and src/__tests__/ai-briefs.test.ts.

import { ALL_FEATURES, ALL_KINDS, BUG_SIGNALS, FEATURES, KINDS, MODIFY_SIGNALS, PRICING, type Pattern, type Signal } from './catalog';
import type { Currency, FeatureId, Kind, Lang, Money, Requirements } from './types';

// ---------- text helpers ----------

export interface Text {
  /** NFKC-normalised (full-width digits/letters → half-width), original case: for quoting back. */
  orig: string;
  /** Lower-case version of `orig` (same length), used for matching. */
  low: string;
}

export function prepare(input: string): Text {
  const orig = input
    .normalize('NFKC')
    // iOS "smart punctuation": don’t → don't
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    // "做个网站 不需要登录 也不用支付": a space between Chinese words separates clauses.
    .replace(/([㐀-鿿]) (?=[㐀-鿿])/g, '$1，');
  const low = orig.toLowerCase();
  return { orig: low.length === orig.length ? orig : low, low };
}

const CJK = /[㐀-鿿豈-﫿]/g;

/**
 * Chinese if the message is mostly Chinese, otherwise English. A Chinese word is
 * about 1.5–2 characters, so "budget 5k RMB, 想做个landing page" stays Chinese.
 * One or two English words ("ok", "yes", "5000") keep the conversation's language.
 */
export function detectLang(text: string, fallback: Lang = 'en'): Lang {
  const cjk = (text.match(CJK) ?? []).length;
  const words = (text.match(/[a-z]{2,}/gi) ?? []).length;
  if (cjk === 0) return words <= 2 ? fallback : 'en';
  return cjk / 1.5 >= words || words <= 2 ? 'zh' : 'en';
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
  /** "不知道要不要做支付", "might need payments": neither wanted nor ruled out. */
  unsure: boolean;
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
    const unsure = isUnsure(t.low, index);
    out.push({ index, length, weight, negated: !unsure && isNegated(t.low, index, length), unsure });
  }
  return out;
}

const CLAUSE_END = /[,，。.;；!！?？\n、]/;
const SENTENCE_END = /[.;；!！?？\n。]/;

/** The part of the clause before / after a match (stops at punctuation). */
function clauseBefore(s: string, index: number, max: number, end = CLAUSE_END): string {
  let start = Math.max(0, index - max);
  for (let i = index - 1; i >= start; i--) {
    if (end.test(s[i])) {
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
/** Back to the start of the sentence: lists ("no login, search or payments") cross commas. */
function sentenceBefore(s: string, index: number, max: number): string {
  return clauseBefore(s, index, max, SENTENCE_END);
}

// "没有X" / "we don't have X" means they lack it (and often want it), so it is not a negation.
const NEG_BEFORE_ZH = /(不需要|不要|不用|无需|不必|不做|去掉|免去|暂时不|先不|不想要|不考虑|不包括|不含|用不着|没必要)([^不]{0,10})$/;
const NEG_AFTER_ZH = /^.{0,4}?(不需要|不要|不用|先不做|暂时不要|就不用了|不用了|不做|不必|可以不要|去掉|没有必要|用不着)/;
// "不需要登录，但要支付": what follows the pivot is wanted again. (Not "需要": it ends "暂时不需要".)
const ZH_PIVOT = /(但|可是|不过|而是|还要|得要)/;
// Longest phrases first: "no need for" must not stop at "no" (and leave "need" to look like a pivot).
const NEG_BEFORE_EN =
  /\b(no need (?:for|to)|don't need|do not need|doesn't need|does not need|don't want|do not want|won't need|will not need|can't use|cannot use|can not use|not allowed to use|don't use|do not use|not including|without|excluding|except|remove|skip|never|no)\b([^.!?;]{0,30})$/;
const EN_PIVOT = /\b(but|however|though|although|also|plus|need|want|must|should)\b/;
const NEG_AFTER_EN = /^\s*(?:is|are)?\s*(?:not needed|not required|unnecessary|not necessary|isn't needed|aren't needed|can wait)/;
const UNSURE_ZH = /(要不要|需不需要|用不用|做不做|是不是|不知道|不确定|看情况|还没想好)[^，,。.!！?？]{0,8}$/;
const UNSURE_EN = /\b(not sure (?:if|whether|about)|don't know (?:if|whether)|maybe|might|whether|possibly|perhaps)\b[^.!?;,]{0,20}$/;

function isUnsure(low: string, index: number): boolean {
  return UNSURE_ZH.test(clauseBefore(low, index, 16)) || UNSURE_EN.test(sentenceBefore(low, index, 40));
}

export function isNegated(low: string, index: number, length: number): boolean {
  const word = low.slice(index, index + length);
  const zhBefore = clauseBefore(low, index, 16);
  const zhAfter = clauseAfter(low, index + length, 12);
  if (/[㐀-鿿]/.test(zhBefore + word + zhAfter)) {
    const m = NEG_BEFORE_ZH.exec(zhBefore);
    if (m && !ZH_PIVOT.test(m[2])) return true;
    if (NEG_AFTER_ZH.test(zhAfter)) return true;
  }
  const e = NEG_BEFORE_EN.exec(sentenceBefore(low, index, 48));
  if (e && !EN_PIVOT.test(e[2])) return true;
  return NEG_AFTER_EN.test(clauseAfter(low, index + length, 24));
}

/**
 * Total weight of what was found. Each pattern counts once, and each stretch of
 * text counts once, for its strongest pattern: "公司网站" is not also "网站", and
 * a word listed twice can't count double. `skipUnsure` (for features): "maybe
 * payments" is neither a yes nor a no; for the kind of project it still counts.
 */
function score(t: Text, signals: readonly Signal[], skipUnsure = false): { pos: number; neg: number; hits: (Hit & { p: Pattern })[] } {
  const found: (Hit & { p: Pattern })[] = [];
  for (const [p, w] of signals) for (const h of hitsFor(t, p, w)) if (!(skipUnsure && h.unsure)) found.push({ ...h, p });
  found.sort((a, b) => b.weight - a.weight || a.index - b.index);
  const taken: [number, number][] = [];
  const counted = new Set<Pattern>();
  const overlaps = (h: Hit) => taken.some(([s, e]) => h.index < e && h.index + h.length > s);
  let pos = 0;
  let neg = 0;
  const hits: (Hit & { p: Pattern })[] = [];
  for (const wantNegated of [false, true]) {
    for (const h of found) {
      if (h.negated !== wantNegated || counted.has(h.p) || overlaps(h)) continue;
      taken.push([h.index, h.index + h.length]);
      counted.add(h.p);
      hits.push(h);
      if (wantNegated) neg += h.weight;
      else pos += h.weight;
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

/** Chinese numerals, including rough ones (几百 ≈ 300, 上万 ≈ 10000, 十几 ≈ 15) and "一万五" = 15000. */
export function parseZhNumber(s: string): number | null {
  const rough: Record<string, number> = {
    几十: 30, 数十: 30, 十几: 15, 几百: 300, 数百: 300, 上百: 100, 几千: 3000, 数千: 3000, 上千: 1000,
    几万: 30000, 数万: 30000, 上万: 10000, 十几万: 150000, 几十万: 300000, 一两百: 150, 两三百: 250, 三五百: 400,
    一两千: 1500, 两三千: 2500, 三五千: 4000, 一两万: 15000, 两三万: 25000, 三五万: 40000, 几: 3, 一两: 2, 两三: 3, 三五: 4,
  };
  if (rough[s] !== undefined) return rough[s];
  if (!/^[零〇一二两俩三四五六七八九十百千万]+$/.test(s)) return null;
  // Spoken shorthand: "一万五" = 15,000, "两千五" = 2,500, "三百二" = 320.
  const trail = s.match(/^(.*[百千万])([一二两三四五六七八九])$/);
  if (trail) {
    const base = parseZhNumber(trail[1]);
    if (base !== null) return base + ZH_DIGITS[trail[2]] * (ZH_UNITS[trail[1].slice(-1)] / 10);
  }
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

/** "两三万" → 20,000–30,000; "三四千" → 3,000–4,000. */
function parseZhRange(s: string): [number, number] | null {
  const m = s.match(/^([一二两三四五六七八九])([二两三四五六七八九])([十百千万])$/);
  if (!m) return null;
  const a = ZH_DIGITS[m[1]];
  const b = ZH_DIGITS[m[2]];
  if (b <= a || b - a > 2) return null;
  const unit = ZH_UNITS[m[3]];
  return [a * unit, b * unit];
}

/** "1,200" "1.5k" "2w" "3万" "1万5" "五百" "1.2万" "几千" "two" → number. */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  const m = s.match(/^(\d+(?:,\d{3})*(?:\.\d+)?|\d*\.\d+)(k|w|千|万|百|m)?$/);
  if (m) {
    const n = Number(m[1].replace(/,/g, ''));
    const mult = { k: 1000, 千: 1000, w: 10000, 万: 10000, 百: 100, m: 1_000_000 }[m[2] as 'k'] ?? 1;
    return Number.isFinite(n) ? n * mult : null;
  }
  const tail = s.match(/^(\d+(?:\.\d+)?)(万|千)(\d)$/);
  if (tail) return Number(tail[1]) * ZH_UNITS[tail[2]] + (Number(tail[3]) * ZH_UNITS[tail[2]]) / 10;
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

function allMatches(low: string, re: RegExp): RegExpMatchArray[] {
  return [...low.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))];
}

/** "一个客服机器人" / "a chatbot": the article is not a count. */
const ARTICLE = /^(一|a|an|one)$/;

function firstQuantity(low: string, zh: RegExp, en: RegExp, skipArticle = true): number | undefined {
  const tries: [RegExp, (s: string) => number | null][] = [
    [zh, parseNumber],
    [en, enNumber],
  ];
  for (const [re, conv] of tries) {
    for (const m of allMatches(low, re)) {
      const raw = m[1].trim();
      if (skipArticle && ARTICLE.test(raw)) continue;
      const n = conv(raw);
      if (n !== null && n > 0) return n;
    }
  }
  return undefined;
}

// ---------- quantities ----------

const DOCS_ZH = new RegExp(`${NUM}\\s*(?:多|余|来)?\\s*(?:份|个|篇|本|套)?\\s*(?:pdf|文件|文档|合同|资料|论文|手册|报告|word|制度|案例|标书)`, 'i');
const DOCS_EN = new RegExp(`\\b${EN_NUM}\\+?\\s*(?:(?:word|pdf|excel|text|scanned)\\s+)?(?:pdfs?|documents?|docs|files|contracts|manuals|papers|reports|policies)\\b`, 'i');
const PAGES_ZH = new RegExp(`${NUM}\\s*(?:个)?\\s*(?:页面|网页|板块|栏目)`);
const PAGES_ZH2 = new RegExp(`${NUM}\\s*(?:个)?\\s*页(?!\\s*(?:pdf|文档|的pdf|的文档|的合同|word))`, 'i');
const PAGES_EN = new RegExp(`\\b${EN_NUM}\\s*(?:pages?|sections?|screens?)\\b(?![- ]*(?:pdf|document|doc))`, 'i');
const USERS_ZH = new RegExp(
  `${NUM}\\s*(?:多|余|来)?\\s*(?:个|名|位)?\\s*(?:用户|员工|学员|会员|客户|老师|学生|成员|队员|销售|同事|律师|医生|护士|会计|工程师|设计师|客服|店员|家长|志愿者|人在用|人使用|人用|人(?![民工事力]))`,
);
// "十几个律师用" / "五十名员工在用": N + measure word + who + 用
const USERS_ZH2 = new RegExp(`${NUM}\\s*(?:多|余|来)?\\s*(?:个|名|位)\\s*[\\u4e00-\\u9fff]{1,3}?(?:在)?(?:用|使用)`);
const USERS_EN = new RegExp(`\\b${EN_NUM}\\+?\\s*(?:users?|people|employees|staff|members|customers|students|clients|seats|team members|persons)\\b`, 'i');
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
  '飞书', '钉钉', '企业微信', '用友', '金蝶', '有赞', '微店', '抖音', '小红书', '淘宝', '京东', 'erp', 'crm', 'microsoft 365', 'office 365',
];

function countNamed(low: string, names: string[]): number {
  let n = 0;
  for (const name of names) if (hitsFor({ low, orig: low }, name, 1).some((h) => !h.negated)) n++;
  return n;
}

// ---------- money ----------

const CUR_BEFORE = '(us\\$|usd|\\$|¥|rmb|cny|人民币|€|eur|£|gbp)?';
// Units stick to the number ("5k", "3万", "1万5"); "2 weeks" is not 20,000 and "5 kinds" not 5,000.
const AMOUNT =
  '(\\d+(?:,\\d{3})*(?:\\.\\d+)?(?:(?:k|w)(?![a-z])|\\s?(?:千|万)(?:\\d(?!\\d))?)?|[一二两三四五六七八九十百千万几]*[十百千万][一二两三四五六七八九]?)';
// The low end of a range may leave its unit to the high end: "三到五万", "2-3千".
const AMOUNT_LO = '(\\d+(?:,\\d{3})*(?:\\.\\d+)?(?:(?:k|w)(?![a-z])|\\s?(?:千|万))?|[一二两三四五六七八九十百千万几]+)';
const CUR_AFTER = '\\s*(美元|美金|刀|dollars?|bucks|usd|元|块钱|块|人民币|rmb|cny|欧元|euros?|eur|英镑|pounds?|gbp)?';
const MONEY_RANGE = new RegExp(`${CUR_BEFORE}\\s*${AMOUNT_LO}${CUR_AFTER}\\s*(?:-|–|—|~|～|到|至|to)\\s*${CUR_BEFORE}\\s*${AMOUNT}${CUR_AFTER}`, 'gi');
const MONEY_ONE = new RegExp(`${CUR_BEFORE}\\s*${AMOUNT}${CUR_AFTER}`, 'gi');
/** Words that make a bare number a budget (with a currency, no word is needed). */
const BUDGET_WORDS = /(预算|上限|能出|能花|想花|只想花|愿意花|花|价位|费用|报价|出价|成本|budget|willing to pay|can pay|can spend|to spend|spend|price range|\bpay(?:ing)?\b|\bcost)/i;
const LIMIT_WORDS = /(以内|以下|之内|最多|不超过|上限|under|less than|up to|max(?:imum)?|no more than|at most|below)/i;
const PER_UNIT_AFTER =
  /^\s*(\/|每|per\b|一个月|一年|\/月|\/年|一份|一次|一件|一张|一个|每个|每件|每张|起|a month|a year|monthly|per month|an hour|\/h|\/hr|每小时|each\b|apiece|a piece|a head|per person)/i;
const PER_UNIT_BEFORE = /(单价|售价|标价|定价|零售价|卖|售|priced(?: at)?|retails? (?:at|for)|each|per|tickets?(?: cost)?|costs?|charges?)\s*[:：]?\s*(?:us\$|\$|¥|€|£)?\s*$/i;
const COUNT_AFTER_ZH = /^\s*(年|份|个|页|人|天|周|月|小时|篇|款|种|位|名|次|条|张|单|台|家|间|套|节|课|场|期|批|项|岁|分钟|秒|字|%|号|日)/;
const COUNT_AFTER_EN =
  /^\s*\+?\s*(users?|people|pages?|docs?|documents?|files?|pdfs?|products?|items?|skus?|hours?|days?|weeks?|months?|years?|employees|members|customers|students|languages?|sites?|records?|rows?|questions?|times?|leads?|profiles?|contacts?|emails?|listings?|posts?|images?|photos?|videos?|invoices?|orders?|messages?|calls?|tickets?|units?|branches|stores?|kinds?|types?|locations?|clients?|staff|%)\b/i;

function currencyOf(...marks: (string | undefined)[]): Currency | null {
  for (const m of marks) {
    if (!m) continue;
    const s = m.toLowerCase();
    if (/€|eur|欧元/.test(s)) return 'EUR';
    if (/£|gbp|英镑|pound/.test(s)) return 'GBP';
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
  const candidates: { money: Money; assumed: boolean; raw: string; context: boolean }[] = [];
  const consider = (m: RegExpExecArray, min: number, max: number, cur: Currency | null) => {
    const end = m.index + m[0].length;
    const near = low.slice(Math.max(0, m.index - 14), m.index);
    const wide = sentenceBefore(low, m.index, 36);
    const after = low.slice(end, end + 16);
    const budgetWord = /预算|budget/i.test(wide) || /^\s*(的)?(预算|budget)/i.test(after);
    // A price inside the brief ("商品单价50到200元", "tickets cost $25 each") is not the budget.
    if ((PER_UNIT_AFTER.test(after) || PER_UNIT_BEFORE.test(near)) && !budgetWord) return;
    const context = budgetWord || BUDGET_WORDS.test(wide);
    if (!cur && !context) return;
    // Bare small numbers are usually counts, not money.
    if (!cur && max < 100) return;
    const currency = cur ?? (lang === 'zh' ? 'CNY' : 'USD');
    // "under $1,000": the visitor's range ends there.
    const upto = min === max && LIMIT_WORDS.test(near + after.slice(0, 6));
    candidates.push({ money: { min: upto ? Math.round(max * 0.6) : min, max, currency }, assumed: !cur, raw: m[0].trim(), context });
  };

  MONEY_RANGE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const covered: [number, number][] = [];
  while ((m = MONEY_RANGE.exec(low))) {
    const a = parseNumber(m[2]);
    let b = parseNumber(m[5]);
    if (a === null || b === null) continue;
    // "2-3千" / "三到五万": the unit on the second number applies to both.
    let lo = a;
    const unit = m[5].match(/(k|w|千|万)\s*\d?$/i)?.[1];
    if (unit && !/(k|w|千|万)\s*$/i.test(m[2])) lo = parseNumber(`${m[2]}${unit}`) ?? a;
    if (b < lo) [lo, b] = [b, lo];
    consider(m, lo, b, currencyOf(m[1], m[3], m[4], m[6]));
    covered.push([m.index, m.index + m[0].length]);
  }
  MONEY_ONE.lastIndex = 0;
  while ((m = MONEY_ONE.exec(low))) {
    const at = m.index;
    if (covered.some(([s, e]) => at >= s && at < e)) continue;
    const range = parseZhRange(m[2]);
    const n = range ? range[1] : parseNumber(m[2]);
    if (n === null || n <= 0) continue;
    const cur = currencyOf(m[1], m[3]);
    // A year ("2026年") or a count ("3000份", "5000 leads") is not money.
    const after = low.slice(at + m[0].length, at + m[0].length + 16);
    if (!cur && (COUNT_AFTER_ZH.test(after) || COUNT_AFTER_EN.test(after))) continue;
    consider(m, range ? range[0] : n, n, cur);
  }
  if (!candidates.length) return undefined;
  // Prefer an amount said as a budget, then one with a currency, then the largest.
  candidates.sort((x, y) => Number(y.context) - Number(x.context) || Number(x.assumed) - Number(y.assumed) || y.money.max - x.money.max);
  const best = candidates[0];
  return { money: best.money, assumed: best.assumed, raw: best.raw };
}

/** Rough USD value of a budget, for comparing it with the estimate. */
export function toUsd(m: Money, cnyPerUsd: number = PRICING.cnyPerUsd): [number, number] {
  const f = m.currency === 'USD' ? 1 : m.currency === 'CNY' ? 1 / cnyPerUsd : m.currency === 'EUR' ? PRICING.usdPerEur : PRICING.usdPerGbp;
  return [Math.round(m.min * f), Math.round(m.max * f)];
}

// ---------- deadline ----------

const DURATION_ZH = /([\d.]+|[一二两三四五六七八九十半几]+)\s*(个)?\s*(半)?\s*(天|日|周|星期|礼拜|个月|月)\s*(内|之内|以内|完成|上线|交付|做完|搞定|左右|里|就要|必须)/;
const DURATION_EN = new RegExp(`\\b(?:within|in|under|less than|by|needs? to be done in)\\s+(?:about |around )?${EN_NUM}\\s+(days?|weeks?|months?)\\b`, 'i');
const RELAXED =
  /(不急|不着急|慢慢来|时间充裕|时间宽裕|不赶时间|不赶|没有截止|没有deadline|\bno rush\b|\bno hurry\b|\bnot in a (?:rush|hurry)\b|\bno (?:hard |fixed |strict )?deadline\b|\b(?:timeline|schedule|deadline|timing|dates?) (?:is |are )?flexible\b|\bflexible (?:timeline|deadline|schedule|timing)\b|\bwhenever (?:you(?:'re| are)? ready|it'?s ready|works|you can)\b|\btake your time\b)/i;
const RUSH =
  /(尽快|越快越好|加急|很急|比较急|特别急|非常急|急用|急需|急[!！]|马上要|马上就要|今天要|明天要|这周要|本周要|\basap\b|\burgent(?:ly)?\b|\brush\b|as soon as possible|as fast as possible|by tomorrow|this week|make (?:it )?fast)/i;
const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ZH_MONTH: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
const WEEKDAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_ZH: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
/** Spring Festival (春节) dates: "过年前" / "年前" means before this. */
const SPRING_FESTIVAL: [number, number, number][] = [
  [2026, 1, 17], [2027, 1, 6], [2028, 0, 26], [2029, 1, 13], [2030, 1, 3], [2031, 0, 23],
];

const DAY = 86400000;
function daysTo(now: Date, target: Date): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.round((target.getTime() - start.getTime()) / DAY));
}
/** Days until a calendar date this year, or next year if it has passed. */
function daysUntil(now: Date, month: number, day: number): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(now.getFullYear(), month, day);
  if (target.getTime() < today.getTime()) target.setFullYear(target.getFullYear() + 1);
  return daysTo(now, target);
}
function endOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}
/** Days until weekday `w` (0 = Sunday); `nextWeek` = in the week after this one (weeks start on Monday). */
function daysToWeekday(now: Date, w: number, nextWeek: boolean): number {
  const dow = now.getDay();
  if (nextWeek) {
    const toMonday = ((8 - dow) % 7) || 7;
    return toMonday + (w === 0 ? 6 : w - 1);
  }
  return Math.max(1, (w - dow + 7) % 7);
}

/** A bare duration typed as an answer: "两周", "一个月", "2 weeks", "10天". */
export function readDuration(low: string): number | undefined {
  const zh = low.match(/^(?:大概|大约|差不多|最好)?\s*([\d.]+|[一二两三四五六七八九十半几]+)\s*(个)?\s*(半)?\s*(天|日|周|星期|礼拜|个月|月)/);
  if (zh) {
    let n = zh[1] === '半' ? 0.5 : parseNumber(zh[1]);
    if (n !== null) {
      if (zh[3] === '半') n += 0.5;
      const u = zh[4];
      return Math.max(1, Math.round(n * (u === '天' || u === '日' ? 1 : u === '周' || u === '星期' || u === '礼拜' ? 7 : 30)));
    }
  }
  const en = low.match(new RegExp(`^(?:in |within |about |around |maybe )?${EN_NUM}\\s+(days?|weeks?|months?)\\b`, 'i'));
  if (en) {
    const n = enNumber(en[1]);
    if (n !== null) return Math.max(1, Math.round(n * (en[2].startsWith('day') ? 1 : en[2].startsWith('week') ? 7 : 30)));
  }
  return undefined;
}

export function readDeadline(low: string, now: Date): { days?: number; rush?: boolean; relaxed?: boolean } {
  const out: { days?: number; rush?: boolean; relaxed?: boolean } = {};
  if (RELAXED.test(low)) out.relaxed = true;
  // "no rush" must not count as "rush".
  if (RUSH.test(low.replace(new RegExp(RELAXED.source, 'gi'), ' '))) out.rush = true;

  const set = (d: number | undefined) => {
    if (out.days === undefined && d !== undefined && Number.isFinite(d)) out.days = Math.max(1, Math.round(d));
  };

  // 1. A duration: "两周内", "3个月内上线", "within 6 weeks".
  const zh = low.match(DURATION_ZH);
  // "12月上线" is a month, not twelve months: only "个月" / "半月" are durations.
  if (zh && !(zh[4] === '月' && !zh[2] && !zh[3])) {
    let n = zh[1] === '半' ? 0.5 : parseNumber(zh[1]);
    if (n !== null) {
      if (zh[3] === '半') n += 0.5;
      const unit = zh[4];
      set(n * (unit === '天' || unit === '日' ? 1 : unit === '周' || unit === '星期' || unit === '礼拜' ? 7 : 30));
    }
  }
  const en = low.match(DURATION_EN);
  if (en) {
    const n = enNumber(en[1]);
    if (n !== null) set(n * (en[2].startsWith('day') ? 1 : en[2].startsWith('week') ? 7 : 30));
  }

  // 2. A calendar date: "12月20日前", "by March 15".
  const date = low.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?\s*(?:前|之前|以前|上线|完成|交付)/);
  if (date) set(daysUntil(now, Number(date[1]) - 1, Number(date[2])));
  const enDate = low.match(/\b(?:by|before|until|due)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/);
  if (enDate) set(daysUntil(now, MONTHS_EN.indexOf(enDate[1]), Number(enDate[2])));
  const enMonth = low.match(/\b(?:by|before|until|in|end of)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b(?!\s*\d)/);

  // 3. A month: "12月底上线", "3月前", "希望12月上线".
  const mz = low.match(/(?:^|[^\d个])(1[0-2]|[1-9]|十[一二]?|[一二三四五六七八九])\s*月\s*(底|末|初|中旬|上旬|下旬|中|份)?\s*(前|之前|以前|上线|完成|交付|做完|搞定|能|要|内|之内|以内)?/);
  if (mz && (mz[2] || mz[3])) {
    const month = (/^\d+$/.test(mz[1]) ? Number(mz[1]) : ZH_MONTH[mz[1]]) - 1;
    const part = mz[2];
    if (!part && /^(前|之前|以前)$/.test(mz[3] ?? '')) {
      // "3月前" = before March starts.
      set(daysUntil(now, month, 1) - 1);
    } else {
      const day = part === '初' ? 5 : part === '上旬' ? 10 : part === '中' || part === '中旬' ? 15 : part === '下旬' ? 25 : 0;
      if (day) set(daysUntil(now, month, day));
      else {
        const thisYear = endOfMonth(now.getFullYear(), month);
        const target = thisYear.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() ? endOfMonth(now.getFullYear() + 1, month) : thisYear;
        set(daysTo(now, target));
      }
    }
  }
  if (enMonth) {
    const month = MONTHS_EN.indexOf(enMonth[1]);
    const thisYear = endOfMonth(now.getFullYear(), month);
    set(daysTo(now, thisYear.getTime() < now.getTime() - DAY ? endOfMonth(now.getFullYear() + 1, month) : thisYear));
  }

  // 4. A weekday: "下周五前", "周五之前", "by next Friday".
  const wz = low.match(/(下|这|本)?\s*(?:个)?\s*(?:周|星期|礼拜)([一二三四五六日天])\s*(前|之前|以前|上线|完成|交付|能|要|内)?/);
  if (wz && (wz[1] || wz[3])) set(daysToWeekday(now, WEEKDAY_ZH[wz[2]], wz[1] === '下'));
  const we = low.match(/\b(by|before|until|due|on)?\s*(next|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (we && (we[1] || we[2])) set(daysToWeekday(now, WEEKDAYS_EN.indexOf(we[3]), we[2] === 'next'));

  // 5. Today / tomorrow.
  if (/(今天|今晚|今日)(就要|就得|就|能|内|之内|要|必须|搞定|上线|修好|完成|交)|\b(?:by|before|until|due|need (?:it|this)(?: by)?|done|ready|fixed|live|finished)\s+(?:today|tonight|end of (?:the )?day|eod)\b/.test(low)) set(1);
  if (/(明天|明早|明晚)(就要|就得|前|之前|以前|要|能|上线|完成|交|必须|搞定)|\b(?:by|before|until|due|done|ready|live|finished|delivered|need (?:it|this)(?: by)?)\s+tomorrow\b/.test(low)) set(1);
  if (/后天(就要|前|之前|要|能|上线|完成|交)|\bday after tomorrow\b/.test(low)) set(2);

  // 6. Holidays.
  if (/(?:\b(?:by|before|until|for)\s+(?:christmas|xmas)\b)|(?:圣诞节?|平安夜)(?:前|之前|以前)/.test(low)) set(daysUntil(now, 11, 25));
  if (/(春节|过年|chinese new year|lunar new year|\bcny\b)|(?:^|[^\d一二两三四五六七八九十几多去今明前])年前/.test(low)) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const next = SPRING_FESTIVAL.map(([y, mo, d]) => new Date(y, mo, d)).find((d) => d.getTime() > today);
    if (next) set(daysTo(now, next));
  } else if (/(元旦|新年)(前|之前|以前)|\b(?:by|before|until)\s+(?:the\s+)?new year\b/.test(low)) {
    set(daysUntil(now, 0, 1));
  }

  // 7. Relative: 下个月底 before 月底, 下个月 before 月.
  if (/下个?月底|下个?月末|end of next month/.test(low)) set(daysTo(now, endOfMonth(now.getFullYear(), now.getMonth() + 1)));
  if (/下周|下个星期|下礼拜|next week/.test(low)) set(10);
  if (/这周|本周|this week/.test(low)) set(5);
  if (/月底|月末|end of (?:the |this )?month/.test(low)) set(Math.max(3, daysTo(now, endOfMonth(now.getFullYear(), now.getMonth()))));
  if (/下个月|下月|next month/.test(low)) set(35);
  if (/年底|年末|end of (?:the |this )?year/.test(low)) set(daysUntil(now, 11, 31));
  const q = low.match(/\b(?:by |in |before |end of )?q([1-4])\b/);
  if (q) {
    const quarterEnd = Number(q[1]) * 3 - 1;
    set(daysTo(now, endOfMonth(quarterEnd < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear(), quarterEnd)));
  }

  if (out.days !== undefined && out.days <= 7) out.rush = true;
  return out;
}

// ---------- flags ----------

const SENSITIVE = /(医疗|病历|病人|患者|诊所|医院|hipaa|金融|银行|证券|保险|法律|律所|律师|保密|机密|隐私|个人信息|身份证|\bmedical\b|\bpatients?\b|\bhealth(care)?\b|\bclinic\b|\bfinanc(e|ial)\b|\bbank(ing)?\b|\blegal\b|\blaw firm\b|\bconfidential\b|\bprivacy\b|\bgdpr\b|\bpii\b|\bsensitive\b)/i;
const HAS_DESIGN = /(有设计稿|已有设计|设计稿已|有ui稿|有 ui 稿|有figma|有 figma|设计好了|有原型|有效果图|有设计图|设计已经做好|\bhave (a |the |our )?(designs?|figma|mockups?|wireframes?)\b|\bdesigns? (is|are) (ready|done)\b|\bfigma (file )?(is )?ready\b)/i;
const NEEDS_DESIGN = /(没有设计|需要设计|帮我设计|从零设计|没设计稿|没有ui|\bno designs?(?! (?:needed|required|necessary|work))\b|\bneed (a |some )?designs?\b|\bdesign (it )?from scratch\b|\bdon'?t have (a )?designs?\b)/i;
const NO_DESIGN_WORK = /(不需要设计|不用设计|不要设计|不需要帮我设计|不用帮我设计|设计不用|设计不需要|\bno design (?:needed|required|work)\b|\b(?:don't|do not) need (?:a |any )?design|\bdesign (?:is )?not needed\b)/i;
/** "We already have a GPU server", "有显卡服务器", "我们用的是Mac". */
const HW_HAVE =
  /((有|已经有|已有|配了|买了|自己有|公司有|我们有)[^，,。.!?]{0,6}(显卡|gpu|服务器|工作站|rtx|4090|3090|5090|a100|h100|mac ?studio)|显卡服务器|gpu ?服务器|用的是\s*(mac|macbook|imac|mac ?studio|windows)|\b(we|i) (already )?(have|own|got|run)\b[^.!?]{0,30}\b(gpus?|servers?|workstations?|rtx|nvidia|a100|h100|4090|3090|mac ?studio)\b|\bwe('re| are) (on|using) (macs?|macbooks?|mac ?studios?)\b|\bon (our )?(windows|mac) (laptops|pcs|computers|machines)\b)/i;
/** "like Uber for…", "类似美团的外卖平台": a platform big companies built over years. */
const PLATFORM =
  /((类似|像|跟|和|仿|学)\s*(美团|淘宝|京东|拼多多|滴滴|饿了么|闲鱼|携程|大众点评|抖音|快手|小红书|知乎|b站|亚马逊|chatgpt)|外卖平台|打车平台|多商户|多商家|商家入驻|撮合平台|\b(?:like|similar to|clone of|copy of|version of)\s+(?:an? )?(?:uber|airbnb|amazon|ebay|etsy|facebook|instagram|tiktok|doordash|fiverr|upwork|netflix|twitter|youtube|linkedin)\b|\b(?:uber|airbnb) (?:for|of)\b|\bmarketplace\b|\bmulti[- ]?vendor\b|\btwo[- ]sided\b)/i;
/** "全部重做", "transform … across 12 business units": a programme, not a project. */
const ENTERPRISE =
  /(全部重做|全部推翻|数字化转型|全面上ai|所有部门|各个部门|全集团|\bdigital transformation\b|\b(?:across|for) (?:all|every|our|\d+|twelve|ten|several|multiple) (?:business units|departments|divisions|subsidiaries)\b|\bentire (?:company|organi[sz]ation|customer journey|business)\b|\benterprise[- ]wide\b)/i;
/** Their own store on a platform: a data source to connect, not a shop to build. */
const OWN_PLATFORM = /(\b(?:our|my)\s+|我们的?|我的|公司的?)(shopify|woocommerce|淘宝|京东|有赞|微店|amazon|ebay|etsy)/i;
const NEW_BUILD = /(想做|新做|做一个|做个|开发一个|搭一个|建一个|重新做|\bbuild (?:a|an|me|us)\b|\bcreate (?:a|an)\b|\bnew (?:site|website|app|system|store|tool)\b|\bmake (?:a|an|me)\b)/i;
const ONE_PAGE = /(落地页|着陆页|单页|报名页|活动页|宣传页|\blanding ?page\b|\bone[- ]page\b|\bsingle[- ]page\b|\b(?:sign[- ]?up|registration|event) page\b)/i;
const DATA_DASHBOARD = /(看板|仪表盘|dashboard|可视化|visuali[sz]|charts?|图表)/i;

// ---------- the reader ----------

export interface Parsed {
  lang: Lang;
  kindScores: Partial<Record<Kind, number>>;
  kind: Kind | null;
  /** 0–1: how clearly the text points at `kind`. */
  kindConfidence: number;
  /** A bug report: the platform it is about ("小程序", "React app"). */
  alsoKind?: Kind;
  modify: boolean;
  /** Something is broken (priced as a fix, see BUG_SIGNALS). */
  bug: boolean;
  features: Partial<Record<FeatureId, boolean>>;
  quantities: Requirements['quantities'];
  budget?: BudgetRead;
  deadlineDays?: number;
  rush?: boolean;
  relaxed?: boolean;
  hasDesign?: boolean;
  sensitive?: boolean;
  hardware?: 'have';
  scale?: Requirements['scale'];
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
  const bugScore = score(t, BUG_SIGNALS);
  // "之前的网站打不开了，想重新做一个" is a new build that mentions a bug.
  const bug = bugScore.pos >= 3 && !(NEW_BUILD.test(t.low) && bugScore.pos < 5);
  let modify = mod.pos >= 2.5 || bug;
  if (modify) mod.hits.forEach(remember);
  if (bug) bugScore.hits.forEach(remember);

  // Combinations: local + documents = document Q&A that runs offline, etc.
  const features: Partial<Record<FeatureId, boolean>> = {};
  const ks = (k: Kind) => kindScores[k] ?? 0;
  if (ks('local_ai') >= 2.5 && (ks('rag') >= 2.5 || ks('chatbot') >= 2.5 || ks('voice') >= 3)) {
    features.offline = true;
    kindScores.local_ai = Math.min(ks('local_ai'), Math.max(ks('rag'), ks('chatbot'), ks('voice')) - 0.5);
  }
  const ownPlatform = OWN_PLATFORM.test(t.low);
  if (ownPlatform && kindScores.ecommerce) kindScores.ecommerce = Math.min(ks('ecommerce'), 1.5);
  if (ks('ecommerce') >= 3) kindScores.site = Math.min(ks('site'), ks('ecommerce') - 0.5);
  if (ks('webapp') >= 3 && ks('site') > 0 && ks('site') < ks('webapp') + 1.5) kindScores.site = Math.min(ks('site'), ks('webapp') - 0.5);
  if (ks('scraper') >= 3.5) {
    // The shop / site is what gets scraped, not what gets built.
    for (const k of ['automation', 'ecommerce', 'site', 'webapp'] as Kind[]) if (kindScores[k]) kindScores[k] = Math.min(ks(k), ks('scraper') - 0.5);
  }
  if (ks('chatbot') >= 3 && ks('rag') >= 3 && !/(客服|support|customer|whatsapp|微信|wechat)/i.test(t.low)) {
    kindScores.chatbot = Math.min(ks('chatbot'), ks('rag') - 0.2);
  }
  // A browser extension is its own small tool, whatever page it works on.
  if (ks('desktop') >= 4 && ks('site') > 0) kindScores.site = Math.min(ks('site'), ks('desktop') - 1);
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
  let alsoKind: Kind | undefined;
  if (bug) {
    // Priced as a fix of what exists, not as a new build of what it mentions.
    if (kind && kind !== 'fix') alsoKind = kind;
    kind = 'fix';
    kindConfidence = 0.5;
  } else if (!kind && modify) {
    kind = 'fix';
    kindConfidence = 0.4;
  }
  if (kind === 'fix') modify = true;
  if (kind && kind !== 'fix') (kindHits[kind] ?? []).filter((h) => h.weight >= 1.5).forEach(remember);
  if (kind === 'rag' && features.offline) (kindHits.local_ai ?? []).filter((h) => h.weight >= 2.5).forEach(remember);

  // Features (a bug report's features are what's broken, not what to build)
  if (!bug) {
    for (const f of ALL_FEATURES) {
      const { pos, neg, hits } = score(t, FEATURES[f].signals, true);
      if (pos >= 2) {
        features[f] = true;
        hits.forEach(remember);
      } else if (neg >= 2 && pos === 0) {
        features[f] = false;
      }
    }
  } else {
    delete features.offline;
  }
  let hasDesign: boolean | undefined;
  if (NO_DESIGN_WORK.test(t.low)) {
    features.design = false;
  } else {
    hasDesign = HAS_DESIGN.test(t.low) ? true : NEEDS_DESIGN.test(t.low) ? false : undefined;
    if (hasDesign === true) features.design = false;
    if (hasDesign === false && !bug) features.design = true;
  }
  // "卖茶叶的，要能在线付款": selling with payments is a shop, even without the word.
  if (!kind && features.payments && /(卖|商品|产品|货|\bsell|\bshop\b|\bstore\b)/i.test(t.low)) {
    kind = 'ecommerce';
    kindConfidence = 0.4;
  }
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
  let pages = firstQuantity(t.low, PAGES_ZH, PAGES_EN, false) ?? (kind === 'site' ? firstQuantity(t.low, PAGES_ZH2, /$^/, false) : undefined);
  if (!pages && kind === 'site' && ONE_PAGE.test(t.low)) pages = 1;
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
  let languages = firstQuantity(t.low, LANGS_ZH, LANGS_EN, false);
  const named = LANGUAGE_NAMES.filter((names) => names.some((n) => hitsFor(t, n, 1).length)).length;
  if (!languages && named >= 2 && /(版|网站|界面|多语|双语|翻译|version|site|website|languages?|translat|bilingual|interface)/i.test(t.low)) languages = named;
  if (languages && languages < 30 && !bug) {
    quantities.languages = languages;
    if (languages >= 2 && features.i18n !== false) features.i18n = true;
  }
  const systems = countNamed(t.low, NAMED_SYSTEMS);
  if (ownPlatform && !bug && features.integrations === undefined) features.integrations = true;
  if (systems >= 1 && (features.integrations || kind === 'integration')) quantities.integrations = Math.max(1, systems);

  // Scale
  let scale: Parsed['scale'];
  if (ENTERPRISE.test(t.low)) {
    scale = 'enterprise';
    // A programme across a whole company starts with an assessment, not a build.
    kind = 'consult';
    kindConfidence = 0.4;
  } else if (PLATFORM.test(t.low) && !bug) {
    scale = 'platform';
    if (!kind || kind === 'consult') {
      kind = /(淘宝|京东|拼多多|亚马逊|amazon|ebay|etsy|商城|电商|\bshop|\bstore|e-?commerce)/i.test(t.low)
        ? 'ecommerce'
        : /(\bapp\b|ios|android|安卓|手机)/i.test(t.low)
          ? 'mobile'
          : 'webapp';
      kindConfidence = 0.3;
    }
  }

  // A data dashboard on top of a store or other system: an integration with charts,
  // not a whole web app with accounts and an admin panel.
  if (kind === 'webapp' && DATA_DASHBOARD.test(t.low) && (systems >= 1 || ownPlatform) && !features.auth && !features.roles && !features.admin && !quantities.users) {
    const strongWebapp = (kindHits.webapp ?? []).some((h) => !DATA_DASHBOARD.test(t.low.slice(h.index, h.index + h.length)) && h.weight >= 2.5);
    if (!strongWebapp) {
      kind = 'integration';
      features.dashboard = true;
      if (!quantities.integrations) quantities.integrations = Math.max(1, systems);
    }
  }
  // A chatbot "on our website" with no other channel: the channel question is answered.
  if (kind === 'chatbot' && features.integrations === undefined && /(网站|官网|网页|website|web ?site|\bsite\b)/i.test(t.low) && !/(微信|公众号|whatsapp|telegram|discord|slack|飞书|钉钉|\bline\b|messenger|电话|phone)/i.test(t.low)) {
    features.integrations = false;
  }

  // Budget, deadline, flags
  const budget = readBudget(t.low, lang);
  const dl = readDeadline(t.low, now);
  const sensitive = SENSITIVE.test(t.low) || undefined;
  const hardware = HW_HAVE.test(t.low) ? ('have' as const) : undefined;

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
    (modify ? 1 : 0) +
    (hardware ? 1 : 0);

  return {
    lang,
    kindScores,
    kind,
    kindConfidence,
    alsoKind,
    modify,
    bug,
    features,
    quantities,
    budget,
    deadlineDays: dl.days,
    rush: dl.rush,
    relaxed: dl.relaxed,
    hasDesign,
    sensitive,
    hardware,
    scale,
    heard,
    signal,
    inferred,
  };
}

/** "改成…", "actually…", "算了…就行": the visitor is changing what the project is. */
const SWITCH =
  /(改成|换成|改为|换为|其实|实际上|还是做|还是要|不做.{0,8}了|算了|就行|就好|就可以|而是|\binstead\b|\bactually\b|\brather\b|\bswitch (?:it )?to\b|\bchange (?:it )?to\b|\bmake it\b|\blet'?s (?:do|go with|make)\b|\bnever ?mind\b|\bon second thought\b|\bscratch that\b)/i;
const AI_KINDS: Kind[] = ['rag', 'chatbot', 'voice'];

/**
 * Folds a newly read message into what is already known. Newer facts win, but
 * the kind of project only changes when the visitor says so ("改成…", "actually…")
 * or answers the kind question: a later "要本地部署" or "in our Shopify store"
 * adds to the project instead of replacing it.
 */
export function mergeRequirements(prev: Requirements, p: Parsed, text: string, opts: { kindAsked?: boolean } = {}): Requirements {
  const next: Requirements = {
    ...prev,
    features: { ...prev.features },
    quantities: { ...prev.quantities, ...p.quantities },
    heard: [...prev.heard],
    inferred: [...(prev.inferred ?? [])],
  };
  if (p.kind) {
    const sc = p.kindScores[p.kind] ?? 0;
    const switching = p.kind !== prev.kind && SWITCH.test(prepare(text).low) && (sc >= 2 || p.kind === 'fix');
    if (!prev.kind || opts.kindAsked || switching || (p.scale && p.kind !== prev.kind)) {
      if (prev.kind && prev.kind !== p.kind && prev.kind !== 'fix') next.alsoKind = prev.kind;
      next.kind = p.kind;
      if (p.alsoKind) next.alsoKind = p.alsoKind;
    } else if (p.kind === 'local_ai' && AI_KINDS.includes(prev.kind) && p.features.offline !== false) {
      // "…要本地部署" for a document Q&A / chatbot: the same project, run offline.
      next.features.offline = true;
    }
  }
  if (p.modify && (!prev.kind || next.kind === p.kind || p.bug)) next.modify = true;
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
  // The product itself is AI: "AI" / "OpenAI" said later is not an add-on.
  if (next.kind && KINDS[next.kind].included.includes('ai_chat')) delete next.features.ai_chat;
  if (p.budget) next.budget = p.budget.money;
  if (p.deadlineDays !== undefined) {
    next.deadlineDays = p.deadlineDays;
    next.rush = !!p.rush;
    next.relaxed = false;
  } else if (p.rush) {
    next.rush = true;
    next.relaxed = false;
  } else if (p.relaxed) {
    next.relaxed = true;
    next.rush = false;
  }
  if (p.hasDesign !== undefined) next.hasDesign = p.hasDesign;
  if (p.sensitive) next.sensitive = true;
  if (p.hardware) next.hardware = p.hardware;
  if (p.scale) next.scale = p.scale;
  for (const h of p.heard) if (!next.heard.includes(h)) next.heard.push(h);
  next.heard = next.heard.slice(-12);
  next.detail = prev.detail + Array.from(text.trim()).length;
  return next;
}

export function emptyRequirements(): Requirements {
  return { kind: null, features: {}, modify: false, quantities: {}, heard: [], detail: 0, inferred: [] };
}
