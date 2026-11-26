// pixel-font: skip (nothing in this file is drawn in the pixel font, so its characters can stay out of the font subset)
// The browser copilot: remembers what was said, picks replies from templates
// and puts together the summary at the end. It only matches rules; the real
// product has a local model read the whole conversation instead.

import { extractEntities, fold } from './entities';
import { detectIntents, primaryIntent } from './intents';
import { formatMoney } from './numbers';
import { TEMPLATES, type Template } from './templates';
import {
  FACT_KEYS,
  type CallSummary,
  type Entity,
  type FactKey,
  type Facts,
  type Heard,
  type Intent,
  type Lang,
  type Memory,
  type ScenarioKind,
  type ScoredIntent,
  type Suggestion,
  type Turn,
  type Who,
} from './types';

export function emptyMemory(): Memory {
  return { facts: {}, intents: [], seen: [], used: [], turn: 0 };
}

/** Which fact an entity fills, given who said it and what the line was about. */
export function factKeyFor(e: Entity, who: Who, intents: ScoredIntent[], before: string): FactKey | null {
  const has = (i: Intent) => intents.some((s) => s.intent === i);
  const top = intents[0]?.intent;
  // Your own lines only count when you name a price or a time to talk again;
  // "我今天下班前发您" is not a project deadline.
  if (who === 'you') return e.kind === 'money' ? 'ourQuote' : e.kind === 'date' && e.clock ? 'meeting' : null;
  switch (e.kind) {
    case 'money':
      // "你们是 2 万 6" / "yours is 9,000": they are quoting our price back.
      if (/(你们|你家|您这边|你这边|贵公司)[^，。,.!！?？]{0,6}$/.test(before) || /\b(you|your|yours)\b[^.,;!?]{0,16}$/.test(before)) {
        return 'ourQuote';
      }
      return has('competitor') ? 'otherQuote' : 'budget';
    case 'date':
      if (e.past) return who === 'them' ? 'since' : null;
      // "我商量一下，周五前给你答复": when they will get back to you, not a project deadline.
      if (top === 'hesitation' || has('goodbye')) return 'meeting';
      if (e.before) return 'deadline';
      // A weekday alone is a meeting only when the line is about meeting ("周日就过生日" is not).
      if (e.clock || top === 'scheduling') return 'meeting';
      return 'deadline';
    case 'duration':
      return 'duration';
    case 'order':
      return 'order';
    case 'count':
      return 'count';
    case 'name':
      return who === 'them' ? 'name' : null;
    case 'org':
      return who === 'them' ? 'org' : null;
  }
}

function factValue(e: Entity, lang: Lang): string {
  if (e.kind === 'money') return formatMoney(e, lang);
  if (e.kind === 'order') return e.text.toUpperCase();
  return e.text.replace(/\s+/g, ' ');
}

const digits = (s: string) => s.replace(/[^\d.–]/g, '');

/** Updates the memory with one line from either side. */
export function hear(memory: Memory, text: string, who: Who, lang: Lang): { memory: Memory; heard: Heard } {
  const intents = detectIntents(text);
  const entities = extractEntities(text);
  const folded = fold(text);
  const facts: Facts = { ...memory.facts };
  const changed: FactKey[] = [];
  for (const e of entities) {
    const key = factKeyFor(e, who, intents, folded.slice(0, e.index));
    if (!key) continue;
    const value = factValue(e, lang);
    // "3 万左右可以做" repeats their budget back; it is not a new quote.
    if (key === 'ourQuote' && facts.budget && digits(facts.budget.value) === digits(value)) continue;
    // "那周五聊" after "周五上午十点半" adds nothing: keep the more precise time.
    const old = facts[key]?.value;
    if ((key === 'meeting' || key === 'deadline') && old && old !== value && old.includes(value)) continue;
    if (facts[key]?.value !== value && !changed.includes(key)) changed.push(key);
    facts[key] = { key, value, turn: memory.turn };
  }
  const primary = intents[0].intent;
  const strong = intents.filter((s) => s.score >= 2 && s.intent !== 'other').map((s) => s.intent);
  const next: Memory = {
    facts,
    intents: who === 'them' ? [...memory.intents, primary] : memory.intents,
    seen: who === 'them' ? [...memory.seen, ...strong.filter((i) => !memory.seen.includes(i))] : memory.seen,
    used: memory.used,
    turn: memory.turn + 1,
  };
  return { memory: next, heard: { intents, primary, entities, changed } };
}

/** Chinese text puts a space between Chinese characters and Latin letters or digits ("预算是 3 万"). */
export function spaceOut(text: string): string {
  return text
    .replace(/([\u4e00-\u9fa5])([A-Za-z0-9$¥€£])/g, '$1 $2')
    .replace(/([A-Za-z0-9%])([\u4e00-\u9fa5])/g, '$1 $2');
}

/** Trims a line to `zh` characters or `en` words, with an ellipsis when cut. */
export function shorten(text: string, lang: Lang, size = { zh: 18, en: 9 }): string {
  const t = text.trim().replace(/[。！？!?.,，、…\s]+$/u, '');
  if (lang === 'zh') {
    const chars = Array.from(t);
    return chars.length > size.zh ? `${chars.slice(0, size.zh).join('')}…` : t;
  }
  const words = t.split(/\s+/);
  return words.length > size.en ? `${words.slice(0, size.en).join(' ')}…` : t;
}

interface Ranked {
  template: Template;
  score: number;
  order: number;
  secondary: boolean;
}

/**
 * Two or three replies for their latest line. Replies that use a fact from this
 * line come first, then ones that use a fact from earlier in the call, then
 * general ones. Wording already suggested in this call is avoided when possible.
 */
export function pickReplies(memory: Memory, heard: Heard, text: string, lang: Lang, max = 3): Suggestion[] {
  const [first, second] = heard.intents;
  const intents: { intent: Intent; secondary: boolean }[] = [{ intent: first.intent, secondary: false }];
  if (second && second.intent !== 'other' && second.score >= first.score / 2) intents.push({ intent: second.intent, secondary: true });

  const fresh = new Set(heard.changed);
  const known = memory.facts;
  const ranked: Ranked[] = [];
  let order = 0;
  for (const { intent, secondary } of intents) {
    for (const template of TEMPLATES[intent]) {
      const needs = template.needs ?? [];
      if (!needs.every((k) => known[k])) continue;
      let score = secondary ? 20 : 30;
      for (const k of needs) score += fresh.has(k) ? 15 : 8;
      // Already suggested in this call: push it down, the most recently shown furthest.
      const usedAt = memory.used.lastIndexOf(template.id);
      if (usedAt >= 0) score -= 25 + Math.min(4, memory.used.length - usedAt);
      ranked.push({ template, score, order: order++, secondary });
    }
  }
  ranked.sort((a, b) => b.score - a.score || a.order - b.order);

  const picked: Ranked[] = [];
  for (const r of ranked) {
    if (picked.length >= max) break;
    if (picked.some((p) => p.template.tactic === r.template.tactic)) continue;
    // Keep the answer focused: at most one reply for a side topic.
    if (r.secondary && picked.some((p) => p.secondary)) continue;
    picked.push(r);
  }
  // Fill up with repeats of a tactic if there were not enough distinct ones.
  for (const r of ranked) {
    if (picked.length >= max) break;
    if (!picked.includes(r)) picked.push(r);
  }

  const values: Partial<Record<FactKey, string>> = {};
  for (const k of FACT_KEYS) if (known[k]) values[k] = known[k]?.value;
  const slots = { v: values, fresh, quote: shorten(text, lang) };
  return picked.map(({ template }) => ({
    id: template.id,
    tactic: template.tactic,
    text: lang === 'zh' ? spaceOut(template.zh(slots)) : template.en(slots),
    uses: template.needs ?? [],
  }));
}

/** Hears their line and suggests replies, remembering which wording was used. */
export function respond(memory: Memory, text: string, lang: Lang): { memory: Memory; heard: Heard; suggestions: Suggestion[] } {
  const { memory: next, heard } = hear(memory, text, 'them', lang);
  const suggestions = pickReplies(next, heard, text, lang);
  return { memory: { ...next, used: [...next.used, ...suggestions.map((s) => s.id)] }, heard, suggestions };
}

/** The first real sentence of a reply ("好的。" alone says nothing). */
function gist(text: string, lang: Lang): string {
  const sentences = text.match(/[^。！？!?.]+[。！？!?.]?/gu) ?? [text];
  const long = sentences.find((x) => (lang === 'zh' ? Array.from(x.trim()).length > 6 : x.trim().split(/\s+/).length > 3));
  return shorten(long ?? text, lang, { zh: 30, en: 16 });
}

/** "They agreed: …" for each yes that follows something you said. */
export function agreedFromTurns(turns: Turn[], lang: Lang): string[] {
  const out: string[] = [];
  turns.forEach((turn, i) => {
    const prev = turns[i - 1];
    if (turn.who !== 'them' || prev?.who !== 'you' || primaryIntent(turn.text) !== 'agreement') return;
    out.push(lang === 'zh' ? `对方同意：${gist(prev.text, lang)}` : `They agreed: ${gist(prev.text, lang)}`);
  });
  return out;
}

/** Follow-ups from simple rules over what was heard. */
export function followUps(memory: Memory, lang: Lang, kind: ScenarioKind = 'sales'): string[] {
  const f = memory.facts;
  const seen = (i: Intent) => memory.seen.includes(i);
  const zh = lang === 'zh';
  const out: string[] = [];
  const val = (k: FactKey) => f[k]?.value;

  if (kind === 'sales' && (seen('price') || seen('too_expensive') || seen('competitor') || f.budget || f.ourQuote)) {
    const phases = seen('too_expensive') || seen('competitor');
    const budget = val('budget');
    out.push(
      zh
        ? `今天发一份书面报价，写清范围和价格${phases ? '，附上分两期的方案' : ''}${budget ? `（对方预算：${budget}）` : ''}`
        : `Send a written quote today with the scope and price${phases ? ', plus a two-phase option' : ''}${budget ? ` (their budget: ${budget})` : ''}`,
    );
  }
  if (f.deadline && kind === 'sales') {
    out.push(zh ? `附一份按「${val('deadline')}」倒排的计划` : `Attach a plan that works back from ${val('deadline')}`);
  }
  if (seen('complaint') || f.order) {
    const order = val('order');
    out.push(
      zh
        ? `${order ? `订单 ${order}：` : ''}今天之内再跟对方确认一次处理结果`
        : `${order ? `Order ${order}: ` : ''}check back with them today to confirm it's sorted`,
    );
  }
  if (seen('refund')) {
    out.push(zh ? '确认退款或补发已经提交，告诉对方什么时候到' : 'Confirm the refund or replacement is submitted, and tell them when to expect it');
  }
  if (seen('technical')) out.push(zh ? '写一页技术说明，发给对方的技术负责人' : 'Write a one-page technical note for their tech lead');
  if (seen('hesitation')) {
    const when = val('meeting');
    out.push(
      zh
        ? `${when ? `${when}` : '两天后'}主动跟进，先回答对方最拿不准的那一点`
        : `Follow up ${when ?? 'in two days'}, starting with whatever they were unsure about`,
    );
  } else if (f.meeting) {
    out.push(zh ? `发日历邀请：${val('meeting')}` : `Send a calendar invite for ${val('meeting')}`);
  }
  if (!out.length) out.push(zh ? '发一条消息感谢对方，附上今天聊的要点' : 'Send a thank-you note with the main points from today');
  return out.slice(0, 3);
}

export function summarize(memory: Memory, lang: Lang, agreed: string[], kind: ScenarioKind = 'sales'): CallSummary {
  const facts = FACT_KEYS.flatMap((k) => (memory.facts[k] ? [memory.facts[k]!] : []));
  return { facts, agreed, followUps: followUps(memory, lang, kind) };
}
