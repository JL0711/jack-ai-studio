// What Jack receives when a visitor taps "Send this to Jack": one contact
// message (supabase contact_messages, max 4,000 characters) holding the
// visitor's own words and the estimate, so he can reply without asking again.

import { budgetBucket, FEATURES, KINDS, PRICING, projectTypeFor } from './catalog';
import { estimate } from './estimate';
import { fmtCnyRange, fmtDuration, fmtHours, fmtInt, fmtUsdRange } from './format';
import type { ChatState } from './dialog';
import { toUsd } from './nlu';

export const MESSAGE_LIMIT = 4000;

export interface SummaryInput {
  state: ChatState;
  /** The visitor's own messages, oldest first. */
  said: string[];
  note?: string;
  /** Where they started the chat (page path). */
  from?: string;
}

function clip(s: string, n: number): string {
  const chars = Array.from(s);
  return chars.length <= n ? s : `${chars.slice(0, n - 1).join('')}…`;
}

export function buildSummary({ state, said, note, from }: SummaryInput): string {
  const { req, lang } = state;
  const est = estimate(req);
  const lines: string[] = [];
  lines.push('【网站 AI 估价】');
  lines.push(`客户语言：${lang === 'zh' ? '中文' : '英文'}${from ? ` · 来自页面：${from}` : ''}`);
  if (note?.trim()) lines.push(`客户补充：${clip(note.trim(), 600)}`);

  lines.push('');
  lines.push('客户原话：');
  let budget = 1500;
  for (const s of said) {
    const t = clip(s.replace(/\s+/g, ' ').trim(), 600);
    if (!t) continue;
    if (budget - Array.from(t).length < 0) {
      lines.push('- …');
      break;
    }
    budget -= Array.from(t).length;
    lines.push(`- ${t}`);
  }

  if (est) {
    const kind = KINDS[est.kind].label.zh + (est.modify && est.kind !== 'fix' ? '（修改现有）' : '');
    lines.push('');
    lines.push(`项目类型：${kind}`);
    const facts: string[] = [];
    const q = req.quantities;
    if (q.docs) facts.push(`约 ${fmtInt(q.docs)} 份文件`);
    if (q.pages) facts.push(`约 ${q.pages} 个页面`);
    if (q.users) facts.push(`约 ${fmtInt(q.users)} 人使用`);
    if (q.products) facts.push(`约 ${fmtInt(q.products)} 个商品`);
    if (q.languages) facts.push(`${q.languages} 种语言`);
    if (req.budget) {
      const [, hi] = toUsd(req.budget, PRICING.cnyPerUsd);
      const sym = { USD: '$', CNY: '¥', EUR: '€', GBP: '£' }[req.budget.currency];
      facts.push(`预算 ${sym}${fmtInt(req.budget.max)}${req.budget.currency === 'USD' ? '' : `（约 $${fmtInt(hi)}）`}${state.budgetAssumed ? '（币种是猜的）' : ''}`);
    }
    if (req.deadlineDays) facts.push(`${req.deadlineDays} 天内要`);
    if (req.rush) facts.push('着急');
    if (req.relaxed) facts.push('不着急');
    if (req.hasDesign) facts.push('有设计稿');
    if (req.sensitive) facts.push('涉及敏感数据');
    if (req.hardware) facts.push(req.hardware === 'have' ? '已有显卡电脑' : '需要配置建议');
    if (req.access) facts.push(req.access === 'code' ? '能给代码' : req.access === 'admin' ? '只有后台账号' : '拿不到代码');
    if (req.kind === 'fix' && req.alsoKind && req.alsoKind !== 'fix') facts.push(`问题出在现有的${KINDS[req.alsoKind].short.zh}`);
    if (req.scale) facts.push(req.scale === 'platform' ? '平台级的想法（按第一期估）' : '公司级的大范围需求（建议先评估）');
    const off = Object.entries(req.features)
      .filter(([, v]) => v === false)
      .map(([f]) => FEATURES[f as keyof typeof FEATURES]?.label.zh)
      .filter(Boolean);
    if (off.length) facts.push(`不要：${off.join('、')}`);
    if (facts.length) lines.push(`要点：${facts.join('；')}`);
    lines.push(`估算：${fmtHours(est.hours, 'zh')} · ${fmtUsdRange(est.usd)}（约 ${fmtCnyRange(est.cny)}）· ${fmtDuration(est.days, 'zh')}${est.rush ? ' · 加急' : ''} · 把握：${{ low: '低', medium: '中', high: '高' }[est.confidence]}`);
    lines.push(`明细：${est.lines.map((l) => `${l.label.zh} ${l.included ? '已含' : `${l.hours[0]}–${l.hours[1]}h`}`).join('；')}`);
    if (est.factors.length) lines.push(`系数：${est.factors.map((f) => `${f.label.zh} ×${f.min}–${f.max}`).join('；')}`);
    if (est.budgetFit) {
      const label = { roomy: '预算充足', fits: '预算够', tight: '预算偏紧', over: '预算不够' }[est.budgetFit.status];
      const mvp = est.budgetFit.mvp;
      lines.push(`预算对比：${label}${mvp ? `；精简版 ${fmtUsdRange(mvp.usd)}${mvp.feasible ? '' : '（仍超预算）'}，先不做：${mvp.drop.map((f) => FEATURES[f].label.zh).join('、') || '无'}` : ''}`);
    }
    if (est.deadline) lines.push(`时间：要求 ${est.deadline.days} 天 → ${{ ok: '来得及', rush: '要加急', too_short: '来不及，只能先交核心部分' }[est.deadline.status]}`);
  } else {
    lines.push('');
    lines.push('（还没算出估价：客户没说清楚项目类型）');
  }

  let text = lines.join('\n');
  if (Array.from(text).length > MESSAGE_LIMIT) text = clip(text, MESSAGE_LIMIT);
  return text;
}

/** Contact-form fields derived from the conversation. */
export function contactFields(state: ChatState): { project_type: string; budget: string | null } {
  const est = estimate(state.req);
  const budget = state.req.budget ? budgetBucket(toUsd(state.req.budget, PRICING.cnyPerUsd)[1]) : est ? 'unsure' : null;
  return { project_type: projectTypeFor(state.req.kind), budget };
}

/** A plain-text copy of the estimate in the visitor's language (for "copy"). */
export function estimateText(state: ChatState): string {
  const est = estimate(state.req);
  if (!est) return '';
  const zh = state.lang === 'zh';
  const kind = KINDS[est.kind].label[state.lang];
  const out: string[] = [];
  out.push(zh ? `Jack AI Studio · 粗估` : `Jack AI Studio · rough estimate`);
  out.push(zh ? `项目：${kind}` : `Project: ${kind}`);
  out.push(zh ? `工作量：${fmtHours(est.hours, 'zh')}` : `Effort: ${fmtHours(est.hours, 'en')}`);
  out.push(zh ? `价格：${fmtUsdRange(est.usd)}（约 ${fmtCnyRange(est.cny)}）` : `Price: ${fmtUsdRange(est.usd)}`);
  out.push(zh ? `时间：${fmtDuration(est.days, 'zh')}，第一版约第 ${est.firstVersionDay[0]}–${est.firstVersionDay[1]} 天` : `Timeline: ${fmtDuration(est.days, 'en')}, first version around day ${est.firstVersionDay[0]}–${est.firstVersionDay[1]}`);
  out.push(zh ? '明细：' : 'Breakdown:');
  for (const l of est.lines) out.push(`- ${l.label[state.lang]}: ${l.included ? (zh ? '已包含' : 'included') : fmtHours(l.hours, state.lang)}`);
  out.push(zh ? '付款节点：' : 'Payments:');
  for (const m of est.milestones) out.push(`- ${m.label[state.lang]}: ${Math.round(m.share * 100)}% (${fmtUsdRange(m.usd)})`);
  out.push(zh ? '这是网站自动算出的粗估，价格和付款方式都可以协商，以 Jack 书面确认为准。' : 'An automatic rough estimate; price and payment terms are negotiable, and what is agreed in writing is final.');
  return out.join('\n');
}
