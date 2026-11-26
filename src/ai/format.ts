// Number formatting for estimates, in both languages.

import type { Bi, Lang, Range } from './types';

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtUsd(n: number): string {
  return `$${fmtInt(n)}`;
}

/** "$1,250–2,650" (or a single value when both ends match). */
export function fmtUsdRange([a, b]: Range): string {
  return a === b ? fmtUsd(a) : `$${fmtInt(a)}–${fmtInt(b)}`;
}

export function fmtCnyRange([a, b]: Range): string {
  return a === b ? `¥${fmtInt(a)}` : `¥${fmtInt(a)}–${fmtInt(b)}`;
}

export function fmtRange([a, b]: Range): string {
  return a === b ? fmtInt(a) : `${fmtInt(a)}–${fmtInt(b)}`;
}

export function fmtHours(r: Range, lang: Lang): string {
  return lang === 'zh' ? `${fmtRange(r)} 小时` : `${fmtRange(r)} hours`;
}

function ceilHalf(n: number): number {
  return Math.ceil(n * 2) / 2;
}

/** Calendar days as days, weeks or months, whichever reads naturally. */
export function fmtDuration([a, b]: Range, lang: Lang): string {
  if (b <= 10) return lang === 'zh' ? `${fmtRange([a, b])} 天` : `${fmtRange([a, b])} ${b === 1 ? 'day' : 'days'}`;
  if (b <= 100) {
    const w: Range = [Math.max(0.5, ceilHalf(a / 7)), ceilHalf(b / 7)];
    const s = w[0] === w[1] ? `${w[0]}` : `${w[0]}–${w[1]}`;
    return lang === 'zh' ? `${s} 周` : `${s} ${w[1] === 1 ? 'week' : 'weeks'}`;
  }
  const m: Range = [Math.max(1, ceilHalf(a / 30)), ceilHalf(b / 30)];
  const s = m[0] === m[1] ? `${m[0]}` : `${m[0]}–${m[1]}`;
  return lang === 'zh' ? `${s} 个月` : `${s} months`;
}

export function pickBi(b: Bi, lang: Lang): string {
  return b[lang];
}

/** Rounds a price so it doesn't look falsely precise. */
export function roundUsd(v: number): number {
  const step = v < 1000 ? 50 : v < 5000 ? 100 : v < 20000 ? 500 : 1000;
  return Math.max(step, Math.round(v / step) * step);
}

export function roundCny(v: number): number {
  const step = v < 10000 ? 100 : v < 100000 ? 500 : 1000;
  return Math.max(step, Math.round(v / step) * step);
}

/** A Chinese or English list: "A、B 和 C" / "A, B and C". */
export function joinList(items: string[], lang: Lang): string {
  if (items.length <= 1) return items[0] ?? '';
  const head = items.slice(0, -1);
  const last = items[items.length - 1];
  return lang === 'zh' ? `${head.join('、')}和${last}` : `${head.join(', ')} and ${last}`;
}
