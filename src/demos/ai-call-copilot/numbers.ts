// pixel-font: skip (nothing in this file is drawn in the pixel font, so its characters can stay out of the font subset)
// Spoken numbers and money, in Chinese and English: "两万五" → 25000,
// "fifteen hundred" → 1500, and back to "2.5 万元" / "$1,500" for display.

import type { Currency, Entity, Lang } from './types';

const ZH_DIGIT: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};
const ZH_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

function digitOf(ch: string): number | undefined {
  if (/^[0-9]$/.test(ch)) return Number(ch);
  return ZH_DIGIT[ch];
}

/** A Chinese number below 10,000: "三千五" → 3500, "十二" → 12, "两百零五" → 205. */
function parseSection(s: string): number | null {
  let total = 0;
  let digit: number | null = null;
  let lastUnit = 0;
  let zero = false;
  for (const ch of Array.from(s)) {
    if (ch === '零' || ch === '〇') {
      zero = true;
      continue;
    }
    const d = digitOf(ch);
    if (d !== undefined) {
      if (digit !== null) return null; // "两三" is a range, not a number
      digit = d;
      continue;
    }
    const unit = ZH_UNIT[ch];
    if (!unit) return null;
    total += (digit ?? 1) * unit;
    digit = null;
    lastUnit = unit;
    zero = false;
  }
  if (digit !== null) {
    // A digit right after 百/千 means the next unit down: 三千五 = 3500, 两百五 = 250.
    total += !zero && lastUnit >= 100 ? digit * (lastUnit / 10) : digit;
  }
  return total;
}

/** "3万" "1.5万" "2万5" "两万五" "一万二" "八千" "十二万" "8000" → a number (null if it is not one). */
export function parseZhNumber(raw: string): number | null {
  const s = raw.replace(/[\s,，]/g, '');
  if (!s) return null;
  const arabic = /^(\d+(?:\.\d+)?)([十百千万])?([0-9一二两三四五六七八九])?$/.exec(s);
  if (arabic) {
    const unit = arabic[2] === '万' ? 10000 : arabic[2] ? ZH_UNIT[arabic[2]] : 1;
    const tail = arabic[3] && unit >= 100 ? (digitOf(arabic[3]) ?? 0) * (unit / 10) : 0;
    if (arabic[3] && unit < 100) return null;
    return Math.round(parseFloat(arabic[1]) * unit + tail);
  }
  const parts = s.split('万');
  if (parts.length > 2) return null;
  if (parts.length === 2) {
    const high = parts[0] ? parseSection(parts[0]) : 1;
    if (high === null) return null;
    let low = 0;
    if (parts[1]) {
      const single = Array.from(parts[1]);
      if (single.length === 1 && digitOf(single[0]) !== undefined) low = (digitOf(single[0]) ?? 0) * 1000; // 两万五
      else {
        const v = parseSection(parts[1]);
        if (v === null) return null;
        low = v;
      }
    }
    return high * 10000 + low;
  }
  return parseSection(s);
}

const EN_WORDS: Record<string, number> = {
  zero: 0,
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  couple: 2,
  few: 3,
};

/** "8,500" "twenty-five" "fifteen hundred" "a couple" → a number (null if it is not one). */
export function parseEnNumber(raw: string): number | null {
  const s = raw.toLowerCase().replace(/,/g, '').trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  let total = 0;
  let current = 0;
  let any = false;
  for (const w of s.split(/[\s-]+/)) {
    if (w === 'and' || w === 'of') continue;
    if (w in EN_WORDS) current += EN_WORDS[w];
    else if (w === 'hundred') current = (current || 1) * 100;
    else if (w === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
    } else return null;
    any = true;
  }
  return any ? total + current : null;
}

/** Multiplier for a money suffix: k / grand / thousand / m / 万 / 千. */
export function moneyUnit(suffix: string | undefined): number {
  if (!suffix) return 1;
  const s = suffix.toLowerCase().trim();
  if (s === 'k' || s === 'grand' || s === 'thousand' || s === '千') return 1000;
  if (s === 'm' || s === 'million') return 1_000_000;
  if (s === '万') return 10000;
  return 1;
}

export function currencyOf(marker: string | undefined): Currency | undefined {
  if (!marker) return undefined;
  const m = marker.toLowerCase().trim();
  if (/^(¥|￥|元|块|块钱|人民币|rmb|cny)$/.test(m)) return 'CNY';
  if (/^(\$|usd|dollars?|bucks|美元|美金)$/.test(m)) return 'USD';
  if (/^(€|eur|euros?|欧元)$/.test(m)) return 'EUR';
  if (/^(£|gbp|pounds?|quid|英镑)$/.test(m)) return 'GBP';
  return undefined;
}

function zhAmount(n: number): string {
  if (n >= 10000 && n % 1000 === 0) return `${Number((n / 10000).toFixed(1))} 万`;
  return String(n);
}

const ZH_CURRENCY: Record<Currency, string> = { CNY: '元', USD: '美元', EUR: '欧元', GBP: '英镑' };
const EN_SYMBOL: Record<Currency, string> = { CNY: '¥', USD: '$', EUR: '€', GBP: '£' };

/** A money entity for display: "2–3 万元", "3 万元以内", "$8,000–10,000", "about $5,000". */
export function formatMoney(e: Pick<Entity, 'amount' | 'max' | 'currency' | 'approx' | 'cap' | 'floor'>, lang: Lang): string {
  const low = e.amount ?? 0;
  if (lang === 'zh') {
    const unit = ZH_CURRENCY[e.currency ?? 'CNY'];
    let core: string;
    if (e.max !== undefined) {
      const a = zhAmount(low);
      const b = zhAmount(e.max);
      // "2–3 万元" reads better than "2 万–3 万元"
      core = a.endsWith(' 万') && b.endsWith(' 万') ? `${a.slice(0, -2)}–${b}${unit}` : `${a}–${b} ${unit}`;
    } else {
      const a = zhAmount(low);
      core = a.endsWith(' 万') ? `${a}${unit}` : `${a} ${unit}`;
    }
    if (e.cap) return `${core}以内`;
    if (e.floor) return `${core}起`;
    if (e.approx) return `${core}左右`;
    return core;
  }
  const sym = e.currency ? EN_SYMBOL[e.currency] : '';
  const fmt = (n: number) => n.toLocaleString('en-US');
  const core = e.max !== undefined ? `${sym}${fmt(low)}–${fmt(e.max)}` : `${sym}${fmt(low)}`;
  if (e.cap) return `up to ${core}`;
  if (e.floor) return `at least ${core}`;
  if (e.approx) return `about ${core}`;
  return core;
}
