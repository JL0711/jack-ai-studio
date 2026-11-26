// pixel-font: skip (nothing in this file is drawn in the pixel font, so its characters can stay out of the font subset)
// Pulls the facts a salesperson would jot down out of one line of speech:
// amounts of money, dates, durations, order numbers, names, companies and counts.
// Chinese and English rules both run on every line, so mixed speech works too.

import { currencyOf, moneyUnit, parseEnNumber, parseZhNumber } from './numbers';
import type { Entity, EntityKind } from './types';

/** Full-width ASCII → ASCII and A–Z → a–z, one UTF-16 unit for one, so indexes match the original. */
export function fold(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xff01 && c <= 0xff5e) c -= 0xfee0;
    else if (c === 0x3000) c = 0x20;
    else if (c === 0x2019 || c === 0x2018) c = 0x27;
    if (c >= 65 && c <= 90) c += 32;
    out += String.fromCharCode(c);
  }
  return out;
}

type Extra = Partial<Omit<Entity, 'kind' | 'text' | 'index'>>;
interface Candidate extends Entity {
  end: number;
}

const RANK: Record<EntityKind, number> = { order: 0, money: 1, date: 2, duration: 3, count: 4, name: 5, org: 6 };

/* ---------- money ---------- */

const ZN = '(?:\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十百千]+)';
// A counter word after a number means it counts things, not money: 3 万个用户, 两千人.
const ZH_COUNTER = /^\s*[个人次条字件单份家位张部台页名天周年岁号米克斤公]/;
const EN_COUNTER = /^\s*(users?|people|customers|followers|views|visitors|subscribers|downloads|steps|words|miles|km|items|orders|members|students)\b/;
const MONEY_CONTEXT = /预算|报价|报了|价格|价钱|多少钱|费用|花|钱|贵|便宜|收费|成本|打折|优惠|付|退款|budget|quote|price|cost|pay|paid|charge|fee|expensive|cheap|afford|spend|invoice|refund|[$€£¥￥]/;

function moneyMods(folded: string, start: number, end: number): Extra {
  const before = folded.slice(Math.max(0, start - 16), start);
  const after = folded.slice(end, end + 8);
  if (/(不超过|最多|顶多|控制在|不能超过|under|below|less than|up to|max(?:imum)?(?: of)?|at most|no more than|within)\s*$/.test(before) || /^\s*(以内|以下|之内|封顶|内|tops|max\b|at most)/.test(after)) {
    return { cap: true };
  }
  if (/(至少|起码|最少|at least|over|more than|minimum(?: of)?|starting at|from)\s*$/.test(before) || /^\s*(起|以上|or more|plus\b|\+)/.test(after)) {
    return { floor: true };
  }
  if (/(大概|大约|差不多|估计|约|about|around|roughly|approximately|ballpark(?: of)?|~)\s*$/.test(before) || /^\s*(左右|上下|多|or so|-?ish\b)/.test(after)) {
    return { approx: true };
  }
  return {};
}

function findMoney(folded: string, add: (kind: EntityKind, index: number, len: number, extra?: Extra) => void) {
  const money = (index: number, len: number, amount: number | null, extra: Extra) => {
    if (amount === null || !Number.isFinite(amount) || amount <= 0) return;
    add('money', index, len, { amount, ...moneyMods(folded, index, index + len), ...extra });
  };

  // 2 到 3 万, 两到三万, 5000-8000 块
  const zhRange = new RegExp(`(${ZN})\\s*(万|千)?\\s*(?:到|至|-|–|—|~|～)\\s*(${ZN})\\s*(万|千)?\\s*(块钱?|元|人民币)?`, 'g');
  for (const m of folded.matchAll(zhRange)) {
    const [all, a, u1, b, u2, cur] = m;
    if (ZH_COUNTER.test(folded.slice(m.index! + all.length))) continue;
    const hasUnit = /[万千]/.test(b + (u2 ?? ''));
    if (!cur && !u2 && !(hasUnit && MONEY_CONTEXT.test(folded))) continue;
    const unit = u1 ?? u2 ?? '';
    const low = parseZhNumber(a + unit);
    const high = parseZhNumber(b + (u2 ?? ''));
    if (low === null || high === null || high <= low) continue;
    money(m.index!, all.trimEnd().length, low, { max: high, currency: 'CNY' });
  }
  // 两三万, 三四千 (two neighbouring digits mean a range)
  for (const m of folded.matchAll(/([一二两三四五六七八九])([二三四五六七八九])\s*(千|万)\s*(块钱?|元)?/g)) {
    const a = parseZhNumber(m[1]) ?? 0;
    const b = parseZhNumber(m[2]) ?? 0;
    if (b !== a + 1 || ZH_COUNTER.test(folded.slice(m.index! + m[0].length))) continue;
    const unit = moneyUnit(m[3]);
    money(m.index!, m[0].length, a * unit, { max: b * unit, currency: 'CNY' });
  }
  // 3 万, 两万五, 1.5万块
  for (const m of folded.matchAll(new RegExp(`(${ZN}\\s*万(?:\\s*[零〇一二两三四五六七八九\\d](?![\\d.]))?)\\s*(块钱?|元|人民币)?`, 'g'))) {
    if (ZH_COUNTER.test(folded.slice(m.index! + m[0].length))) continue;
    money(m.index!, m[0].trimEnd().length, parseZhNumber(m[1]), { currency: 'CNY' });
  }
  // 八千块, 5000 元
  for (const m of folded.matchAll(new RegExp(`(${ZN})\\s*(块钱?|元|人民币)(?![旦儿])`, 'g'))) {
    const amount = parseZhNumber(m[1]);
    // "这两块" means "these two parts"; a few yuan is never what a call is about.
    if (amount !== null && amount < 10) continue;
    money(m.index!, m[0].length, amount, { currency: 'CNY' });
  }
  // 八千, 三千五 (only when the line is about money)
  if (MONEY_CONTEXT.test(folded)) {
    for (const m of folded.matchAll(/([零〇一二两三四五六七八九十\d]+\s*千[零〇一二两三四五六七八九]?百?)/g)) {
      if (ZH_COUNTER.test(folded.slice(m.index! + m[0].length))) continue;
      money(m.index!, m[0].length, parseZhNumber(m[1]), { currency: 'CNY' });
    }
  }

  // 报了 18000, a quote of 6500: a bare number right after a money word
  const bare = /(?:预算|报价|报了|花了|收了?|付了?|价格|价钱|budget|quote[ds]?|price|costs?|paid|pay)\s*(?:是|就|只有|大概|大约|差不多|在|of|is|was|about|around)?\s*(\d{1,3}(?:,\d{3})+|\d{3,})(?![\d.]|\s*(?:[个人次条天周年月号%]|k\b|grand|dollars?|bucks|euros?|pounds?|块|元|万|千))/g;
  for (const m of folded.matchAll(bare)) {
    money(m.index! + m[0].length - m[1].length, m[1].length, parseFloat(m[1].replace(/,/g, '')), {});
  }

  const EN_NUM = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?';
  const SYM = '[$€£¥￥]';
  const WORD = 'dollars?|bucks|euros?|pounds?|quid|yuan|rmb|usd|eur|gbp|cny';
  const SUF = 'k|m|grand|thousand|million';
  const num = (s: string) => parseFloat(s.replace(/,/g, ''));

  // $8k to $10k, between 8 and 10 thousand, 5,000-8,000 dollars
  const enRange = new RegExp(
    `(between\\s+)?(${SYM})?\\s*(${EN_NUM})\\s*(${SUF})?\\s*(-|–|—|to|and)\\s*(${SYM})?\\s*(${EN_NUM})\\s*(${SUF})?(?:\\s*(${WORD}))?(?![a-z\\d])`,
    'g',
  );
  for (const m of folded.matchAll(enRange)) {
    const [all, between, s1, a, k1, joiner, s2, b, k2, word] = m;
    if (joiner === 'and' && !between) continue;
    if (!s1 && !s2 && !k1 && !k2 && !word) continue;
    const unit = moneyUnit(k1 ?? k2);
    const low = num(a) * unit;
    const high = num(b) * moneyUnit(k2 ?? k1);
    if (!(high > low)) continue;
    const start = m.index! + (between ? between.length : 0);
    money(start, all.length - (between ? between.length : 0), low, { max: high, currency: currencyOf(s1 ?? s2 ?? word) });
  }
  // $5,000, €3k, 5000 dollars, usd 4000
  for (const m of folded.matchAll(new RegExp(`(${SYM})\\s*(${EN_NUM})\\s*(${SUF})?(?![a-z\\d])`, 'g'))) {
    money(m.index!, m[0].length, num(m[2]) * moneyUnit(m[3]), { currency: currencyOf(m[1]) });
  }
  for (const m of folded.matchAll(new RegExp(`\\b(${EN_NUM})\\s*(${SUF})?\\s*(${WORD})\\b`, 'g'))) {
    money(m.index!, m[0].length, num(m[1]) * moneyUnit(m[2]), { currency: currencyOf(m[3]) });
  }
  // 5k, 10 grand
  for (const m of folded.matchAll(new RegExp(`\\b(${EN_NUM})\\s?(k|grand)\\b`, 'g'))) {
    if (EN_COUNTER.test(folded.slice(m.index! + m[0].length))) continue;
    money(m.index!, m[0].length, num(m[1]) * 1000, {});
  }
  // five thousand dollars, fifteen hundred, a few thousand
  const words = /\b((?:a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|a couple|a few)(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?\s+(?:hundred|thousand|grand))\b(?:\s+(dollars?|bucks|euros?|pounds?))?/g;
  for (const m of folded.matchAll(words)) {
    if (!m[2] && !/grand$/.test(m[1]) && !MONEY_CONTEXT.test(folded)) continue;
    if (EN_COUNTER.test(folded.slice(m.index! + m[0].length))) continue;
    const phrase = m[1].replace(/grand$/, 'thousand');
    const vague = /^a (couple|few)\b/.test(phrase);
    money(m.index!, m[0].length, parseEnNumber(phrase), { currency: currencyOf(m[2]), ...(vague ? { approx: true } : {}) });
  }
}

/* ---------- dates and times ---------- */

const ZH_N = '(?:\\d{1,2}|[一二三四五六七八九十]{1,3})';
const ZH_PART = '(?:早上|上午|中午|下午|晚上|傍晚)';
const ZH_CLOCK = `${ZH_N}\\s*(?:点|:)\\s*(?:\\d{1,2}|半|一刻|三刻)?\\s*分?`;
const ZH_DATE = [
  '大后天|后天|明天|今天|今晚|明早|明晚|今早|昨天|前天',
  '(?:下下|下|这|本|上)(?:个)?(?:周|星期|礼拜)[一二三四五六日天末]?',
  '(?:周|星期|礼拜)[一二三四五六日天]|周末',
  `(?:下|这|本|上)(?:个)?月(?:初|中|底|\\s*${ZH_N}\\s*(?:日|号))?`,
  '(?:今年|明年)?(?:年|月)(?:初|中|底)|今年|明年|年前|年后',
  `${ZH_N}\\s*月份?(?:\\s*${ZH_N}\\s*(?:日|号))?`,
  `${ZH_N}\\s*(?:号|日)(?![元本])`,
  '春节|过年|国庆|五一|中秋|元旦|双十一|双11|618|开学|圣诞节?',
].join('|');
const ZH_DATE_RE = new RegExp(
  `(?:${ZH_DATE})(?:\\s*${ZH_PART})?(?:\\s*${ZH_CLOCK})?|${ZH_PART}\\s*${ZH_CLOCK}|\\d{1,2}\\s*(?::\\d{2}|点(?:半|\\d{1,2}分?)?)`,
  'g',
);

const WD = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
const MON = '(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
const MON_FULL = '(?:january|february|march|april|may|june|july|august|september|october|november|december)';
const ORD = '\\d{1,2}(?:st|nd|rd|th)?';
const PARTD = '(?:morning|afternoon|evening|night)';
const CLOCK = "(?:\\d{1,2}(?::\\d{2})?\\s?(?:am|pm|a\\.m\\.|p\\.m\\.)|noon|midday|\\d{1,2} o'?clock)";
const EN_DATE = [
  'the day after tomorrow',
  'today',
  'tonight',
  `tomorrow(?: ${PARTD})?`,
  'yesterday',
  `(?:(?:this|next|last|coming) )?${WD}(?: ${PARTD})?`,
  '(?:this|next|last) (?:week|month|quarter|year|weekend)',
  '(?:the )?end of (?:the |this |next )?(?:week|month|quarter|year)',
  `(?:early|mid|late)[- ](?:${MON_FULL}|next month)`,
  `${MON}\\.? ${ORD}`,
  `${ORD} (?:of )?${MON}`,
  'the \\d{1,2}(?:st|nd|rd|th)',
  "christmas|thanksgiving|black friday|new year(?:'s)?|easter|the holidays",
  '(?:\\d+|a|one|two|three|four|five|six) (?:days?|weeks?|months?) ago',
].join('|');
const EN_DATE_RE = new RegExp(`\\b(?:(?:${EN_DATE})(?:,?\\s*(?:at\\s*)?${CLOCK})?|${CLOCK})(?![a-z])`, 'g');
const EN_MONTH_RE = new RegExp(`\\b(?:in|by|before|until|end of) (${MON_FULL})\\b`, 'g');

function dateFlags(folded: string, start: number, text: string): Extra {
  const before = folded.slice(Math.max(0, start - 18), start);
  const after = folded.slice(start + text.length, start + text.length + 4);
  const flags: Extra = {};
  if (/(by|before|until|till|no later than|ahead of|in time for|deadline(?: is)?|due|赶在|最晚|最迟|截止到?|之前要)\s*(the\s*)?$/.test(before) || /^\s*(之前|以前|前|为止)/.test(after)) {
    flags.before = true;
  }
  if (/上(个)?(周|星期|礼拜|月)|昨天|前天|去年|\blast\b|yesterday|\bago\b/.test(text)) flags.past = true;
  if (/点|:|am|pm|a\.m\.|p\.m\.|noon|midday|o'?clock|早上|上午|中午|下午|晚上|傍晚|morning|afternoon|evening|tonight|今晚/.test(text)) {
    flags.clock = true;
  }
  return flags;
}

/* ---------- durations and counts ---------- */

const ZH_DUR_RE = /(?:\d+(?:\.\d+)?|[一二两三四五六七八九十几]+|半)\s*个?\s*半?\s*(?:天|周|星期|礼拜|个月|年|小时|工作日)半?|[一二两三四五六七八九十\d]+个半月/g;
const EN_DUR_RE =
  /\b(?:(?:\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a couple of|a few|few)(?:\s*(?:-|to|or)\s*(?:\d+|two|three|four|five|six|seven|eight|nine|ten|twelve))?\s+(?:more\s+)?(?:business\s+|working\s+)?(?:days?|weeks?|months?|years?|hours?)(?:\s+and\s+a\s+half)?|a\s+week\s+and\s+a\s+half)(?![a-z])/g;
const ZH_COUNT_RE = /(?:\d+|[二两三四五六七八九十]十?[一二三四五六七八九]?)\s*个?\s*(?:页面|页|功能|家门店|家店|门店|家分店|分店|校区|用户|人|种语言|语言|账号|款产品|产品|商品|员工|老师|学生)/g;
const EN_COUNT_RE =
  /\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|fifty)\s+(?:[a-z]+\s+)?(?:pages?|screens?|stores?|shops?|locations?|branches?|users?|people|staff|employees|languages?|products?|clinics?|sites?|campuses)\b/g;

/* ---------- names and companies ---------- */

const SURNAMES = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤欧';
const NOT_NAMES = /^(方便|高兴|周末|马上|白天|万一|金额|向来|常常|关于|于是|任何|程序|毛病|石头|陆续|安排|龙头|钱的|高端|黄金)/;
const ZH_ORG_SUFFIX = /(有限公司|公司|科技|集团|工作室|网络|传媒|文化|教育|贸易|食品|餐饮|物流|电商|实业|学校|培训|诊所|医院|宠物|设计|咨询|烘焙|健身|口腔|药房|书店|花店|商行)/;
// "我是做电商的" is a line of work, not a company name.
const NOT_ORG_START = /^[一这那个家做搞开卖干在负从帮]/;
const EN_ORG_SUFFIX =
  /\b(Inc|Ltd|LLC|Co|Company|Studio|Studios|Dental|Clinic|Group|Labs|Media|Digital|Bakery|Cafe|Coffee|Store|Shop|Design|Consulting|Logistics|Foods|Pets|Academy|School|Fitness|Agency|Partners|Supplies|Systems|Solutions|Health|Tech|Kitchen|Goods|Outdoors)\b/;
const EN_NOT_NAMES =
  /^(Not|Just|So|Calling|Sorry|Fine|Good|Great|Here|Looking|From|With|In|On|At|Back|Still|Really|Very|Interested|Afraid|Glad|Happy|Sure|Ok|Okay|Going|Trying|Wondering|Thinking|Done|Ready|Free|Busy|Available|The|A|An|I|It|We|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)$/;

function findNames(text: string, add: (kind: EntityKind, index: number, len: number) => void) {
  for (const m of text.matchAll(/我是|我叫|我这边是|这边是/g)) {
    const start = m.index! + m[0].length;
    const clause = /^[^，,。.！!？?；;：:\s]*/.exec(text.slice(start))?.[0] ?? '';
    let namePart = clause;
    let offset = 0;
    const de = clause.lastIndexOf('的');
    if (de > 0) {
      const org = clause.slice(0, de);
      if (ZH_ORG_SUFFIX.test(org) && !NOT_ORG_START.test(org) && org.length <= 10) add('org', start, org.length);
      namePart = clause.slice(de + 1);
      offset = de + 1;
    }
    const nm = /^(?:小|老)?[一-龥]{1,3}/.exec(namePart);
    if (!nm) continue;
    const name = nm[0].replace(/[啊呀哈呢吧嘛哦是在想要打来给跟和就也这那有做从刚今找问说讲]+$/, '');
    const first = /^[小老]/.test(name) ? name[1] : name[0];
    if (name.length < 2 || !first || !SURNAMES.includes(first) || NOT_NAMES.test(name)) continue;
    add('name', start + offset, name.length);
  }
  // Not "我在…": "我在外面培训" is a place, not a company.
  for (const m of text.matchAll(/来自|我们是|我们公司是|公司叫/g)) {
    const start = m.index! + m[0].length;
    const clause = /^[^，,。.！!？?；;：:\s的]*/.exec(text.slice(start))?.[0] ?? '';
    const suffix = ZH_ORG_SUFFIX.exec(clause);
    if (!suffix) continue;
    const org = clause.slice(0, suffix.index + suffix[0].length);
    if (org.length >= 3 && org.length <= 10 && !NOT_ORG_START.test(org)) add('org', start, org.length);
  }

  let hasName = false;
  const intro = /(?:\b[Ii]['’]m|\b[Ii] am|\b[Tt]his is|\b[Mm]y name is|\b[Nn]ame['’]s)\s+([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?)/g;
  for (const m of text.matchAll(intro)) {
    const words = m[1].split(/\s+/);
    if (EN_NOT_NAMES.test(words[0])) continue;
    const name = words.length > 1 && EN_NOT_NAMES.test(words[1]) ? words[0] : m[1];
    add('name', m.index! + m[0].length - m[1].length, name.length);
    hasName = true;
  }
  for (const m of text.matchAll(/\b([A-Z][a-z]+) here\b/g)) {
    if (EN_NOT_NAMES.test(m[1])) continue;
    add('name', m.index!, m[1].length);
    hasName = true;
  }
  for (const m of text.matchAll(/\b(?:from|at|with)\s+([A-Z][\w&'’-]*(?:\s+(?:[A-Z][\w&'’-]*|&|of))*)/g)) {
    const org = m[1].replace(/(?:\s+(?:&|of))+$|['’-]+$/, '');
    if (EN_NOT_NAMES.test(org.split(/\s+/)[0])) continue;
    if (!hasName && !EN_ORG_SUFFIX.test(org)) continue;
    add('org', m.index! + m[0].length - m[1].length, org.length);
  }
}

/* ---------- all together ---------- */

/** Everything worth noting in one utterance, in the order it was said. Overlaps keep the more specific kind. */
export function extractEntities(text: string): Entity[] {
  const folded = fold(text);
  const found: Candidate[] = [];
  const add = (kind: EntityKind, index: number, len: number, extra: Extra = {}) => {
    const raw = text.slice(index, index + len);
    const trimmed = raw.trim();
    if (!trimmed) return;
    const at = index + raw.indexOf(trimmed);
    found.push({ kind, text: trimmed, index: at, end: at + trimmed.length, ...extra });
  };

  for (const m of folded.matchAll(/(?:订单号?|单号|工单号?|运单号?|快递单号|编号)\s*(?:是|为|:)?\s*([a-z]{0,3}-?\d[\d-]{2,}[a-z0-9]*)/g)) {
    add('order', m.index! + m[0].length - m[1].length, m[1].length);
  }
  for (const m of folded.matchAll(
    /\b(?:order|ticket|case|tracking|reference|ref|invoice)(?:\s*(?:number|no\.?|num|id))?\s*(?:is\s*)?[:#]?\s*#?([a-z]{0,3}-?\d[\d-]{2,}[a-z0-9]*)/g,
  )) {
    add('order', m.index! + m[0].length - m[1].length, m[1].length);
  }
  for (const m of folded.matchAll(/#(\d{3,})\b/g)) add('order', m.index! + 1, m[1].length);

  findMoney(folded, add);

  for (const m of folded.matchAll(ZH_DATE_RE)) add('date', m.index!, m[0].length, dateFlags(folded, m.index!, m[0]));
  for (const m of folded.matchAll(EN_DATE_RE)) add('date', m.index!, m[0].length, dateFlags(folded, m.index!, m[0]));
  for (const m of folded.matchAll(EN_MONTH_RE)) {
    const at = m.index! + m[0].length - m[1].length;
    add('date', at, m[1].length, dateFlags(folded, at, m[1]));
  }

  for (const m of folded.matchAll(ZH_DUR_RE)) {
    if (folded[m.index! - 1] === '第') continue;
    // 三天前 is a moment in the past, not a length of time.
    const ago = /^\s*(?:以前|之前|前)/.exec(folded.slice(m.index! + m[0].length));
    if (ago) add('date', m.index!, m[0].length + ago[0].length, { past: true });
    else add('duration', m.index!, m[0].length);
  }
  for (const m of folded.matchAll(EN_DUR_RE)) add('duration', m.index!, m[0].length);
  for (const m of folded.matchAll(ZH_COUNT_RE)) add('count', m.index!, m[0].length);
  for (const m of folded.matchAll(EN_COUNT_RE)) add('count', m.index!, m[0].length);

  findNames(text, add);

  // Keep the best of overlapping spans: more specific kind first, then the longer one.
  found.sort((a, b) => RANK[a.kind] - RANK[b.kind] || b.end - b.index - (a.end - a.index) || a.index - b.index);
  const kept: Candidate[] = [];
  for (const c of found) {
    if (kept.some((k) => c.index < k.end && k.index < c.end)) continue;
    kept.push(c);
  }
  return kept.sort((a, b) => a.index - b.index).map(({ end: _end, ...e }) => e);
}
