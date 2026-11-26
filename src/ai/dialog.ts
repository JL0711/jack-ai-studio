// The conversation: turns a visitor's input into the assistant's next turn.
// respond(state, input) → { state, turn } — pure and deterministic, so the
// whole chat can be unit tested (src/__tests__/ai-dialog.test.ts) and saved.

import { SHOWCASE_PROJECTS } from '../data/projects';
import { DEMOS } from '../demos/registry';
import { FEATURES, KINDS, PRICING } from './catalog';
import { estimate } from './estimate';
import { fmtCnyRange, fmtDuration, fmtHours, fmtInt, fmtUsdRange, joinList } from './format';
import { answerFaq, matchFaq, type FaqId } from './knowledge';
import { detectLang, emptyRequirements, mergeRequirements, parseNumber, prepare, toUsd, understand } from './nlu';
import { SLOTS, nextSlot, slotOption } from './slots';
import type { Estimate, FeatureId, Kind, Lang, Range, Requirements, SlotId } from './types';

export const STATE_VERSION = 4;

export interface ChatState {
  v: number;
  req: Requirements;
  /** Language of the conversation: follows the visitor's latest message. */
  lang: Lang;
  asked: SlotId[];
  /** Follow-up suggestions already offered (so they don't repeat). */
  shown: string[];
  /** The question waiting for an answer. */
  pending: SlotId | null;
  /** The budget's currency was guessed from the language. */
  budgetAssumed: boolean;
  turns: number;
  lastUsd: Range | null;
  estimates: number;
  /** Set by the UI once the visitor has sent the estimate to Jack. */
  sent: boolean;
  /** Remarks already made ("budget:over", "deadline:rush"), so they aren't repeated every turn. */
  noted: string[];
}

export type Chip =
  | { t: 'say'; key: string; label: string; text: string }
  | { t: 'link'; key: string; label: string; to: string }
  | { t: 'contact'; key: string; label: string }
  | { t: 'mvp'; key: string; label: string; drop: FeatureId[] }
  | { t: 'currency'; key: string; label: string; currency: 'USD' | 'CNY' };

export type Block =
  | { t: 'text'; text: string }
  | { t: 'estimate'; est: Estimate; req: Requirements }
  | { t: 'links'; items: { label: string; to: string }[] }
  | { t: 'question'; slot: SlotId; text: string; why?: string; options: { value: string; label: string }[] };

export interface Turn {
  lang: Lang;
  blocks: Block[];
  chips: Chip[];
  /** Short "thinking" lines shown while the reply is being put together. */
  trace: string[];
}

export type Input =
  | { t: 'start'; fromSlug?: string; kind?: string }
  | { t: 'text'; text: string }
  | { t: 'answer'; slot: SlotId; value: string }
  | { t: 'toggle'; feature: FeatureId; on: boolean }
  | { t: 'mvp'; drop: FeatureId[] }
  | { t: 'currency'; currency: 'USD' | 'CNY' };

export interface Ctx {
  now: Date;
}

export function initialState(lang: Lang): ChatState {
  return {
    v: STATE_VERSION,
    req: emptyRequirements(),
    lang,
    asked: [],
    shown: [],
    pending: null,
    budgetAssumed: false,
    turns: 0,
    lastUsd: null,
    estimates: 0,
    sent: false,
    noted: [],
  };
}

const T = (lang: Lang, zh: string, en: string) => (lang === 'zh' ? zh : en);
const KIND_IDS = Object.keys(KINDS) as Kind[];

// ---------- small talk ----------

type Small = 'greet' | 'thanks' | 'bye' | 'ok';
function smallTalk(text: string): Small | null {
  const s = prepare(text).low.replace(/[!！.。~～,，?？\s]+$/g, '');
  if (s.length > 24) return null;
  if (/^(你好|您好|嗨|哈喽|hello|hi|hey|在吗|在不在|有人吗|早上好|下午好|晚上好|good (morning|afternoon|evening))/.test(s)) return 'greet';
  if (/(谢谢|感谢|多谢|thanks|thank you|thx|ty)/.test(s)) return 'thanks';
  if (/^(再见|拜拜|bye|goodbye|see you|回头聊)/.test(s)) return 'bye';
  if (/^(好的?|好吧|明白了?|了解|知道了|嗯+|哦+|ok|okay|got it|cool|great|nice|sounds good|alright)$/.test(s)) return 'ok';
  return null;
}

// ---------- starters ----------

function starterChips(lang: Lang, fromSlug?: string): Chip[] {
  const say = (key: string, label: string, text?: string): Chip => ({ t: 'say', key, label, text: text ?? label });
  const bySlug: Record<string, Chip[]> = {
    'local-doc-qa': [
      say('s-rag1', T(lang, '几百份 PDF，要离线问答', 'A few hundred PDFs, offline Q&A'), T(lang, '我们有几百份 PDF 合同和制度文件，想做一个离线的问答系统，回答要注明出处', 'We have a few hundred PDF contracts and policies and want an offline Q&A system that cites its sources')),
      say('s-rag2', T(lang, '给客户用的知识库', 'A knowledge base for customers'), T(lang, '想给客户做一个网页版的知识库问答，资料是产品手册', 'We want a web knowledge base where customers ask questions about our product manuals')),
    ],
    'robotics-ops': [
      say('s-ops1', T(lang, '团队管理后台', 'A team admin panel'), T(lang, '想给我们团队做一个管理后台：角色权限、审批流程和扫码签到，大概 50 人用', 'We need an admin panel for our team: roles, approvals and QR check-in, about 50 people')),
    ],
    'excel-certificates': [
      say('s-xl1', T(lang, '批量生成证书 / 文件', 'Bulk certificates / documents'), T(lang, '想把 Excel 名单批量生成证书，还要导出 PDF', 'I want to turn an Excel list into certificates in bulk, with PDF export')),
    ],
    'word-annotation-export': [
      say('s-wd1', T(lang, 'Word 文档批量处理', 'Batch Word processing'), T(lang, '我们有很多 Word 文档要按模板批量排版和导出', 'We have many Word documents to format with a template and export in bulk')),
    ],
    'mac-windows-bridge': [
      say('s-br1', T(lang, '两台电脑之间的工具', 'A tool between two computers'), T(lang, '想做一个小工具，在两台电脑之间同步文件、远程跑命令', 'I want a small tool to sync files between two computers and run commands remotely')),
    ],
    'ai-call-copilot': [
      say('s-cc1', T(lang, '通话 / 会议实时建议', 'Live suggestions in calls'), T(lang, '想要一个在通话时实时转写、给出回复建议的工具，最好本地运行', 'I want a tool that transcribes calls live and suggests replies, ideally running locally')),
    ],
  };
  const general: Chip[] = [
    say('s-site', T(lang, '做一个公司官网', 'A company website'), T(lang, '我想做一个公司官网', 'I need a company website')),
    say('s-rag', T(lang, '让 AI 读 PDF 回答问题', 'AI that answers from my PDFs'), T(lang, '我想让 AI 读我们的 PDF 资料回答问题', 'I want AI to answer questions from our PDF documents')),
    say('s-local', T(lang, '部署本地大模型', 'A private local LLM'), T(lang, '想在公司电脑上部署本地大模型，资料不能上云', 'I want a local LLM on our office machine; our data can’t go to the cloud')),
    say('s-auto', T(lang, '自动处理 Excel / Word', 'Automate Excel / Word work'), T(lang, '我有一些重复的 Excel 和 Word 工作想自动化', 'I have repetitive Excel and Word work I want automated')),
    say('s-fix', T(lang, '修改现有网站', 'Changes to my existing site'), T(lang, '我有一个现成的网站，想改版并且适配手机', 'I have an existing website that needs a refresh and mobile support')),
    say('s-price', T(lang, '怎么收费？', 'How do you charge?')),
  ];
  return fromSlug && bySlug[fromSlug] ? [...bySlug[fromSlug], ...general.slice(0, 3), general[5]] : general;
}

function contactChip(lang: Lang): Chip {
  return { t: 'contact', key: 'contact', label: T(lang, '把估价发给 Jack', 'Send this to Jack') };
}

// ---------- describing what was understood ----------

function moneyText(m: Requirements['budget'], lang: Lang): string {
  if (!m) return '';
  const [lo, hi] = toUsd(m, PRICING.cnyPerUsd);
  if (m.currency === 'CNY') {
    const v = m.min === m.max || m.min < m.max * 0.7 ? `¥${fmtInt(m.max)}` : `¥${fmtInt(m.min)}–${fmtInt(m.max)}`;
    return T(lang, `${v}（约 $${fmtInt(hi)}）`, `${v} (about $${fmtInt(hi)})`);
  }
  return lo < hi * 0.7 || lo === hi ? `$${fmtInt(hi)}` : `$${fmtInt(lo)}–${fmtInt(hi)}`;
}

function quantityBits(req: Requirements, lang: Lang): string[] {
  const q = req.quantities;
  const out: string[] = [];
  if (q.docs) out.push(T(lang, `约 ${fmtInt(q.docs)} 份文件`, `about ${fmtInt(q.docs)} files`));
  if (q.pages && req.kind === 'site') out.push(T(lang, `约 ${q.pages} 个页面`, `about ${q.pages} pages`));
  if (q.users) out.push(T(lang, `约 ${fmtInt(q.users)} 人使用`, `about ${fmtInt(q.users)} users`));
  if (q.products) out.push(T(lang, `约 ${fmtInt(q.products)} 个商品`, `about ${fmtInt(q.products)} products`));
  if (q.languages && q.languages > 2) out.push(T(lang, `${q.languages} 种语言`, `${q.languages} languages`));
  return out;
}

function featureNames(est: Estimate, req: Requirements, lang: Lang): string[] {
  const names: string[] = [];
  for (const l of est.lines) {
    if (!l.feature) continue;
    const label = l.label[lang];
    names.push(lang === 'en' ? label.charAt(0).toLowerCase() + label.slice(1) : label);
  }
  void req;
  return names;
}

function understandingLead(s: ChatState, est: Estimate): string {
  const { req, lang } = s;
  const def = KINDS[est.kind];
  const what =
    est.kind === 'fix'
      ? T(lang, '你想改一个现有的系统', 'you want changes to an existing system')
      : est.modify
        ? T(lang, `你想改一个现有的${def.short.zh}`, `you want changes to an existing ${def.short.en}`)
        : T(lang, `你想做一个${def.short.zh}`, `you want ${/^[aeiou]/i.test(def.short.en) ? 'an' : 'a'} ${def.short.en}`);
  const feats = featureNames(est, req, lang).slice(0, 4);
  const qty = quantityBits(req, lang);
  let line = T(lang, `明白了：${what}`, `Got it: ${what}`);
  if (feats.length) line += T(lang, `，包括${joinList(feats, 'zh')}`, `, with ${joinList(feats, 'en')}`);
  if (qty.length) line += T(lang, `（${qty.join('，')}）`, ` (${qty.join(', ')})`);
  line += T(lang, '。我在网页里按价目表算了一下：', '. Here is how it adds up, calculated right here in the page:');
  return line;
}

function describeChanges(a: Requirements, b: Requirements, lang: Lang): string[] {
  const out: string[] = [];
  if (a.kind !== b.kind && b.kind) out.push(T(lang, `改成${KINDS[b.kind].short.zh}`, `a ${KINDS[b.kind].short.en} instead`));
  for (const f of Object.keys(FEATURES) as FeatureId[]) {
    const was = a.features[f] === true;
    const now = b.features[f] === true;
    if (was === now) continue;
    const name = FEATURES[f].label[lang];
    out.push(now ? T(lang, `加上「${name}」`, `adding “${name}”`) : T(lang, `去掉「${name}」`, `without “${name}”`));
  }
  const qa = a.quantities;
  const qb = b.quantities;
  if (qb.docs !== qa.docs && qb.docs) out.push(T(lang, `文件约 ${fmtInt(qb.docs)} 份`, `about ${fmtInt(qb.docs)} files`));
  if (qb.pages !== qa.pages && qb.pages) out.push(T(lang, `约 ${qb.pages} 个页面`, `about ${qb.pages} pages`));
  if (qb.users !== qa.users && qb.users) out.push(T(lang, `约 ${fmtInt(qb.users)} 人使用`, `about ${fmtInt(qb.users)} users`));
  if (qb.products !== qa.products && qb.products) out.push(T(lang, `约 ${fmtInt(qb.products)} 个商品`, `about ${fmtInt(qb.products)} products`));
  if (qb.roles !== qa.roles && qb.roles) out.push(T(lang, `${qb.roles} 类用户`, `${qb.roles} kinds of users`));
  if (JSON.stringify(a.budget) !== JSON.stringify(b.budget) && b.budget) out.push(T(lang, `预算 ${moneyText(b.budget, 'zh')}`, `a budget of ${moneyText(b.budget, 'en')}`));
  if (a.deadlineDays !== b.deadlineDays && b.deadlineDays) out.push(T(lang, `${b.deadlineDays} 天内完成`, `done within ${b.deadlineDays} days`));
  if (!a.relaxed && b.relaxed) out.push(T(lang, '时间不着急', 'no rush'));
  if (a.hasDesign !== b.hasDesign && b.hasDesign) out.push(T(lang, '已有设计稿', 'designs ready'));
  if (a.hardware !== b.hardware && b.hardware) out.push(b.hardware === 'have' ? T(lang, '已有显卡电脑', 'hardware ready') : T(lang, '需要配置建议', 'hardware advice needed'));
  if (a.access !== b.access && b.access) out.push(T(lang, b.access === 'code' ? '能给代码' : b.access === 'admin' ? '只有后台账号' : '拿不到代码', b.access === 'code' ? 'code access' : b.access === 'admin' ? 'admin login only' : 'no code access'));
  if (a.modify !== b.modify) out.push(b.modify ? T(lang, '是修改现有系统', 'changing an existing system') : T(lang, '是新做', 'a new build'));
  return out;
}

// ---------- remarks under an estimate ----------

/** Chinese spacing: a space after a Latin/number run, none after full-width punctuation. */
const sp = (s: string) => (/[）)]$/.test(s) ? '' : ' ');

function budgetRemark(s: ChatState, est: Estimate): { key: string; text: string; chips: Chip[] } | null {
  const fit = est.budgetFit;
  const { lang, req } = s;
  if (!fit || !req.budget) return null;
  const b = moneyText(req.budget, lang);
  const chips: Chip[] = [];
  if (s.budgetAssumed) {
    const other = req.budget.currency === 'CNY' ? 'USD' : 'CNY';
    chips.push({
      t: 'currency',
      key: `cur-${other}`,
      label: other === 'USD' ? T(lang, '我说的是美元', 'I meant US dollars') : T(lang, '我说的是人民币', 'I meant RMB'),
      currency: other,
    });
  }
  const assumedNote = s.budgetAssumed
    ? req.budget.currency === 'CNY'
      ? T(lang, '（我按人民币理解了你的预算，如果是美元点下面改一下。）', ' (I read your budget as RMB; if you meant dollars, tap below.)')
      : T(lang, '（我按美元理解了你的预算，如果是人民币点下面改一下。）', ' (I read your budget as US dollars; if you meant RMB, tap below.)')
    : '';
  let text: string;
  switch (fit.status) {
    case 'roomy': {
      const extra = est.suggested.slice(0, 2).map((f) => FEATURES[f].label[lang]);
      text = T(
        lang,
        `你的预算 ${b}${sp(b)}比估价高不少，够用。${extra.length ? `如果想用足预算，可以考虑把${joinList(extra, 'zh')}也做进去。` : ''}`,
        `Your budget of ${b} is comfortably above the estimate.${extra.length ? ` If you'd like to use it, ${joinList(extra, 'en').toLowerCase()} could be added.` : ''}`,
      );
      break;
    }
    case 'fits':
      text = T(lang, `你的预算 ${b}${sp(b)}够用。`, `Your budget of ${b} covers it.`);
      break;
    case 'tight':
      text = T(
        lang,
        `你的预算 ${b}${sp(b)}落在区间偏下的位置：可以做，但范围要先定清楚，细节分批做。`,
        `Your budget of ${b} sits in the lower part of the range: doable, with the scope pinned down first and the extras done in batches.`,
      );
      break;
    case 'over': {
      const mvp = fit.mvp;
      if (mvp && mvp.feasible && mvp.drop.length) {
        const dropped = mvp.drop.map((f) => FEATURES[f].label[lang]);
        text = T(
          lang,
          `你的预算 ${b}${sp(b)}比估价低。可以先做精简版：先不做${joinList(dropped, 'zh')}，约 **${fmtUsdRange(mvp.usd)}**，其余功能以后再加。`,
          `Your budget of ${b} is below the estimate. A lean first version without ${joinList(dropped, 'en').toLowerCase()} comes to about **${fmtUsdRange(mvp.usd)}**; the rest can follow later.`,
        );
        chips.unshift({ t: 'mvp', key: 'mvp', label: T(lang, '按精简版重算', 'Recalculate as lean version'), drop: mvp.drop });
      } else {
        const floor = mvp ? mvp.usd : est.usd;
        text = T(
          lang,
          `坦白说，预算 ${b}${sp(b)}比较紧：就算只保留最核心的部分，也要约 **$${fmtInt(floor[0])}** 起。可以考虑分期做、调整预算，或者先付费做一次需求评估（约 $${PRICING.minimumUsd} 起），把最值得先做的部分找出来。`,
          `To be straight with you, ${b} is tight: even the leanest useful version starts at about **$${fmtInt(floor[0])}**. Options: build it in phases, adjust the budget, or start with a paid requirements review (from $${PRICING.minimumUsd}) to find what's worth building first.`,
        );
      }
      break;
    }
  }
  const key = `budget:${fit.status}:${fit.mvp?.feasible ?? ''}:${s.budgetAssumed}`;
  return { key, text: text + assumedNote, chips };
}

function deadlineRemark(est: Estimate, lang: Lang): { key: string; text: string } | null {
  const d = est.deadline;
  if (d?.status === 'too_short') {
    const h = d.mvpHours ?? [1, 1];
    return { key: `deadline:short:${d.days}`, text: T(
      lang,
      `**${d.days} 天做完全部来不及。** 这个时间里可以先交付最核心的一部分（约 ${fmtHours(h, 'zh')}的工作量），其余的接着补上。`,
      `**${d.days} days isn't enough for all of it.** In that time the most essential part (about ${fmtHours(h, 'en')} of work) can be delivered, with the rest following.`,
    ) };
  }
  if (est.rush) {
    return { key: 'deadline:rush', text: T(
      lang,
      `你要的时间比正常节奏紧，可以按加急做：每周投入约 ${PRICING.maxWeeklyHours} 小时，价格 ×${PRICING.rushMultiplier}（上面已经算进去了）。`,
      `Your timing is tighter than the normal pace, so this is priced as a rush: about ${PRICING.maxWeeklyHours} hours a week at ×${PRICING.rushMultiplier} (already included above).`,
    ) };
  }
  if (d?.status === 'ok') {
    return { key: `deadline:ok:${d.days}`, text: T(lang, `你说的 ${d.days} 天来得及。`, `Your ${d.days}-day timeline works.`) };
  }
  return null;
}

// ---------- follow-up suggestions ----------

function followUps(s: ChatState, est: Estimate | null): Chip[] {
  const { lang } = s;
  const kind = est?.kind ?? s.req.kind;
  const cands: { key: string; label: string; when: boolean }[] = [
    { key: 'f-pay', label: T(lang, '怎么付款？', 'How would I pay?'), when: !!est },
    { key: 'f-first', label: T(lang, '第一版多久能看到？', 'When would I see a first version?'), when: !!est },
    { key: 'f-mvp', label: T(lang, '能先做个精简版吗？', 'Could we start with a lean version?'), when: !!est && (est.confidence === 'low' || est.budgetFit?.status === 'tight') && !est.budgetFit?.mvp },
    { key: 'f-privacy', label: T(lang, '资料安全吗？', 'Is my data safe?'), when: !!kind && (['rag', 'local_ai', 'chatbot', 'voice'].includes(kind) || !!s.req.sensitive) },
    { key: 'f-source', label: T(lang, '源码归谁？', 'Who owns the code?'), when: !!est },
    { key: 'f-process', label: T(lang, '接下来怎么合作？', 'What happens next?'), when: !!est },
    { key: 'f-maint', label: T(lang, '交付后出问题怎么办？', 'What if something breaks later?'), when: !!est && s.estimates > 0 },
    { key: 'f-hardware', label: T(lang, '需要什么配置的电脑？', 'What hardware would I need?'), when: kind === 'local_ai' },
  ];
  const chips: Chip[] = [];
  for (const c of cands) {
    if (!c.when || s.shown.includes(c.key)) continue;
    chips.push({ t: 'say', key: c.key, label: c.label, text: c.label });
    if (chips.length >= 3) break;
  }
  const slug = est?.similar.find((x) => DEMOS[x]);
  if (slug && !s.shown.includes(`l-${slug}`)) {
    const p = SHOWCASE_PROJECTS.find((x) => x.slug === slug);
    if (p) chips.push({ t: 'link', key: `l-${slug}`, label: T(lang, `试试「${p.title.zh}」演示`, `Try the “${p.title.en}” demo`), to: `/showcase/${slug}` });
  }
  if (est) chips.push(contactChip(lang));
  return chips;
}

function remember(s: ChatState, chips: Chip[]): ChatState {
  const keys = chips.filter((c) => c.t === 'say' || c.t === 'link').map((c) => c.key);
  return { ...s, shown: [...s.shown, ...keys.filter((k) => !s.shown.includes(k))] };
}

// ---------- turns ----------

function trace(s: ChatState, est: Estimate | null, text?: string): string[] {
  const { lang, req } = s;
  const out: string[] = [];
  if (text) out.push(T(lang, `读取你的描述（${Array.from(text).length} 个字）`, `Reading your message (${text.split(/\s+/).filter(Boolean).length} words)`));
  if (req.kind) out.push(T(lang, `识别类型：${KINDS[req.kind].label.zh}`, `Type: ${KINDS[req.kind].label.en}`));
  const bits = [
    ...((est?.lines ?? []).filter((l) => l.feature).map((l) => l.label[lang])),
    ...quantityBits(req, lang),
  ].slice(0, 4);
  if (bits.length) out.push(T(lang, `识别到：${bits.join(' · ')}`, `Found: ${bits.join(' · ')}`));
  if (est) {
    out.push(T(lang, `估算工时：${fmtHours(est.hours, 'zh')}`, `Estimating hours: ${fmtHours(est.hours, 'en')}`));
    out.push(T(lang, '换算价格、时间和付款节点', 'Working out price, timing and payments'));
  }
  return out;
}

function askTurn(s: ChatState, slot: SlotId, lead?: string): { state: ChatState; turn: Turn } {
  const def = SLOTS[slot];
  const lang = s.lang;
  const blocks: Block[] = [];
  if (lead) blocks.push({ t: 'text', text: lead });
  blocks.push({
    t: 'question',
    slot,
    text: def.question[lang],
    why: def.why?.[lang],
    options: def.options(s.req).map((o) => ({ value: o.value, label: o.label[lang] })),
  });
  const state = { ...s, pending: slot, asked: s.asked.includes(slot) ? s.asked : [...s.asked, slot] };
  const chips = followUps(state, null);
  return { state: remember(state, chips), turn: { lang, blocks, chips, trace: trace(state, null) } };
}

function estimateTurn(s0: ChatState, before: Requirements, opts: { now: Date; text?: string; faq?: FaqId | null; answered?: boolean }): { state: ChatState; turn: Turn } {
  let s = s0;
  const est = estimate(s.req);
  if (!est) return askTurn(s, 'kind', T(s.lang, '我还不太确定你想做的是哪一类。', 'I’m not sure yet what kind of project this is.'));
  const lang = s.lang;
  const blocks: Block[] = [];
  const chips: Chip[] = [];

  if (s.estimates > 0 && s.lastUsd) {
    const changes = describeChanges(before, s.req, lang);
    const same = s.lastUsd[0] === est.usd[0] && s.lastUsd[1] === est.usd[1];
    blocks.push({
      t: 'text',
      text: changes.length
        ? T(
            lang,
            `好的，已按你说的更新（${changes.join('，')}）：现在约 **${fmtUsdRange(est.usd)}**${same ? '，价格没变' : `（之前 ${fmtUsdRange(s.lastUsd)}）`}，${fmtDuration(est.days, 'zh')}。`,
            `Updated (${changes.join(', ')}): now about **${fmtUsdRange(est.usd)}**${same ? ', unchanged' : ` (was ${fmtUsdRange(s.lastUsd)})`}, ${fmtDuration(est.days, 'en')}.`,
          )
        : T(lang, `重新算了一遍：约 **${fmtUsdRange(est.usd)}**，${fmtDuration(est.days, 'zh')}。`, `Recalculated: about **${fmtUsdRange(est.usd)}**, ${fmtDuration(est.days, 'en')}.`),
    });
  } else {
    blocks.push({ t: 'text', text: understandingLead(s, est) });
  }
  blocks.push({ t: 'estimate', est, req: s.req });

  const notes: string[] = [];
  const inferred = (s.req.inferred ?? []).filter((f) => s.req.features[f]);
  if (inferred.length && s.estimates === 0) {
    notes.push(
      T(
        lang,
        `我先按需要${joinList(inferred.map((f) => `「${FEATURES[f].label.zh}」`), 'zh')}算了（这类项目一般都要），不需要的话在卡片里点掉。`,
        `I've assumed ${joinList(inferred.map((f) => `“${FEATURES[f].label.en}”`), 'en')} (projects like this usually need it); untick it in the card if not.`,
      ),
    );
  }
  const noted = new Set(s.noted);
  const br = budgetRemark(s, est);
  const budgetChanged = JSON.stringify(before.budget) !== JSON.stringify(s.req.budget);
  if (br && (!noted.has(br.key) || budgetChanged)) {
    notes.push(br.text);
    noted.add(br.key);
  }
  if (br) chips.push(...br.chips);
  const dr = deadlineRemark(est, lang);
  if (dr && (!noted.has(dr.key) || before.deadlineDays !== s.req.deadlineDays)) {
    notes.push(dr.text);
    noted.add(dr.key);
  }
  s = { ...s, noted: [...noted] };
  if (KINDS[est.kind].limited && s.estimates === 0) {
    notes.push(
      T(
        lang,
        `说明一下：${KINDS[est.kind].short.zh}可以做，但展览馆里还没有 Jack 做过的同类作品，所以区间放宽了一些。`,
        `To be upfront: Jack can build a ${KINDS[est.kind].short.en}, but there's no showcase work of this kind yet, so the range is wider.`,
      ),
    );
  }
  if (est.confidence === 'low' && s.estimates === 0) {
    notes.push(T(lang, '需求还比较概括，所以区间比较宽；多告诉我一点细节，能算得更准。', 'The brief is still rough, so the range is wide; a few more details will narrow it.'));
  }
  if (notes.length) blocks.push({ t: 'text', text: notes.join('\n') });

  // Something else asked in the same message ("…, and how do I pay?")
  if (opts.faq && !['price', 'timeline', 'first'].includes(opts.faq)) {
    const a = answerFaq(opts.faq, { lang, now: opts.now, estimate: est, req: s.req });
    blocks.push({ t: 'text', text: a.text });
    if (a.links?.length) blocks.push({ t: 'links', items: a.links });
  }

  s = { ...s, lastUsd: est.usd, estimates: s.estimates + 1 };

  const slot = s.asked.length < 4 ? nextSlot(s.req, s.asked) : null;
  if (slot && slot !== 'kind') {
    const def = SLOTS[slot];
    blocks.push({
      t: 'question',
      slot,
      text: def.question[lang],
      why: def.why?.[lang],
      options: def.options(s.req).map((o) => ({ value: o.value, label: o.label[lang] })),
    });
    s = { ...s, pending: slot, asked: [...s.asked, slot] };
  } else {
    s = { ...s, pending: null };
    if (s.estimates >= 2 || est.confidence === 'high') {
      blocks.push({
        t: 'text',
        text: T(
          lang,
          '估得差不多了。想正式开始，就点「把估价发给 Jack」：他会看你的原话和这份估价，在回复时段 2 小时内回复，然后一起把需求写清楚。',
          'That’s a solid estimate. To get started, tap “Send this to Jack”: he’ll read your words and this estimate, reply within 2 hours during reply hours, and you’ll pin down the brief together.',
        ),
      });
    }
  }
  const more = followUps(s, est);
  const all = [...chips, ...more];
  s = remember(s, all);
  return { state: s, turn: { lang, blocks, chips: all, trace: trace(s, est, opts.text) } };
}

function faqTurn(s0: ChatState, id: FaqId, now: Date): { state: ChatState; turn: Turn } {
  const s = s0;
  const est = estimate(s.req);
  const a = answerFaq(id, { lang: s.lang, now, estimate: s.estimates > 0 ? est : null, req: s.req });
  const blocks: Block[] = [{ t: 'text', text: a.text }];
  if (a.links?.length) blocks.push({ t: 'links', items: a.links });
  const chips: Chip[] = (a.ask ?? []).map((text, i) => ({ t: 'say', key: `ask-${id}-${i}`, label: text, text }));
  if (a.contact || s.estimates > 0) chips.push(contactChip(s.lang));
  const state = remember({ ...s, shown: [...s.shown, `faq-${id}`] }, chips);
  return { state, turn: { lang: s.lang, blocks, chips, trace: [T(s.lang, '查找相关说明…', 'Looking that up…')] } };
}

function greetTurn(s: ChatState, fromSlug?: string, kind?: string): { state: ChatState; turn: Turn } {
  const lang = s.lang;
  const p = fromSlug ? SHOWCASE_PROJECTS.find((x) => x.slug === fromSlug) : undefined;
  let req = s.req;
  if (p) req = { ...req, fromSlug: p.slug };
  if (kind && (KIND_IDS as string[]).includes(kind) && !req.kind) req = { ...req, kind: kind as Kind };
  const text = p
    ? T(
        lang,
        `你好！看到你在看「${p.title.zh}」。想做一个类似的？说说你的情况：做什么、给谁用、大概多少资料或用户、什么时候要。我会在网页里直接算出工作量、价格和时间。`,
        `Hi! I see you were looking at “${p.title.en}”. Want something similar? Tell me about your case: what it should do, who uses it, roughly how much data or how many users, and when you need it. I'll work out the effort, price and timeline right here.`,
      )
    : T(
        lang,
        '你好！我是 Jack 的 AI 估价助手。说说你想做什么、给谁用、大概什么时候要，我会在网页里直接算出工作量、价格和时间，告诉你接下来怎么做。价格是代码按价目表算的，不联网、不调用大模型。',
        'Hi! I’m Jack’s estimate assistant. Tell me what you want built, who it’s for and when you need it, and I’ll work out the effort, price and timeline right here, plus what happens next. The numbers come from code and a price list, not from an AI service.',
      );
  const state = { ...s, req };
  const chips = starterChips(lang, p?.slug);
  return { state: remember(state, chips), turn: { lang, blocks: [{ t: 'text', text }], chips, trace: [] } };
}

const YES = /^(要|需要|是|是的|对|对的|可以|能|有|有的|好|好的|嗯|行|需要的|要的|必须|当然|yes|yeah|yep|yup|sure|of course|definitely|correct|right|we do|i do|need it)\b/i;
const NO = /^(不|不要|不需要|不用|没有|没|不行|不能|无|no|nope|nah|not really|don'?t|we don'?t|none)\b/i;

/** A typed answer to the pending question ("3000", "要", "两周") → that slot's option, if it clearly is one. */
function typedAnswer(s: ChatState, text: string): Requirements | null {
  const slot = s.pending;
  if (!slot) return null;
  const { low } = prepare(text);
  const short = low.length <= 16;
  const yes = short && YES.test(low);
  const no = short && NO.test(low);
  const pick = (value: string) => slotOption(slot, value, s.req)?.apply(s.req) ?? null;
  const qty = (k: keyof Requirements['quantities']) => {
    const m = low.match(/(\d+(?:,\d{3})*(?:\.\d+)?\s*(?:k|w|千|万)?|[一二两三四五六七八九十百千万几]+)/);
    const n = m ? parseNumber(m[1]) : null;
    return n && n > 0 ? { ...s.req, quantities: { ...s.req.quantities, [k]: Math.round(n) } } : null;
  };
  switch (slot) {
    case 'offline':
      return no || /离线|本地|不能上云|不行/.test(low) ? pick('local') : yes || /云端|可以用/.test(low) ? pick('cloud') : null;
    case 'payments':
    case 'cms':
      return yes ? pick('yes') : no ? pick('no') : null;
    case 'design':
      return /有设计|有稿|have/.test(low) || yes ? pick('have') : no ? pick('need') : null;
    case 'hardware':
      return yes ? pick('have') : no ? pick('need') : null;
    case 'docs':
      return short ? qty('docs') : null;
    case 'pages':
      return short ? qty('pages') : null;
    case 'users':
      return short ? qty('users') : null;
    case 'products':
      return short ? qty('products') : null;
    case 'budget': {
      if (!short) return null;
      const m = low.match(/(\d+(?:,\d{3})*(?:\.\d+)?\s*(?:k|w|千|万)?)/);
      const n = m ? parseNumber(m[1]) : null;
      if (!n || n < 50) return null;
      const usd = /\$|usd|美元|美金|dollar/.test(low);
      const cny = /¥|元|块|rmb|人民币/.test(low);
      const currency = usd ? 'USD' : cny ? 'CNY' : s.lang === 'zh' ? 'CNY' : 'USD';
      return { ...s.req, budget: { min: n, max: n, currency } };
    }
    default:
      return null;
  }
}

export function respond(prev: ChatState, input: Input, ctx: Ctx): { state: ChatState; turn: Turn } {
  let s: ChatState = { ...prev, turns: prev.turns + 1 };
  switch (input.t) {
    case 'start':
      return greetTurn(s, input.fromSlug, input.kind);
    case 'answer': {
      const opt = slotOption(input.slot, input.value, s.req);
      if (!opt) return estimateTurn(s, s.req, { now: ctx.now });
      const before = s.req;
      s = { ...s, req: { ...opt.apply(s.req), detail: s.req.detail + 15 }, pending: null };
      if (input.slot === 'kind') s = { ...s, asked: s.asked.includes('kind') ? s.asked : [...s.asked, 'kind'] };
      return estimateTurn(s, before, { now: ctx.now, answered: true });
    }
    case 'toggle': {
      const before = s.req;
      const features = { ...s.req.features, [input.feature]: input.on };
      s = { ...s, req: { ...s.req, features, inferred: (s.req.inferred ?? []).filter((f) => f !== input.feature) } };
      return estimateTurn(s, before, { now: ctx.now });
    }
    case 'mvp': {
      const before = s.req;
      const features = { ...s.req.features };
      for (const f of input.drop) features[f] = false;
      s = { ...s, req: { ...s.req, features } };
      return estimateTurn(s, before, { now: ctx.now });
    }
    case 'currency': {
      const before = s.req;
      if (s.req.budget) s = { ...s, req: { ...s.req, budget: { ...s.req.budget, currency: input.currency } }, budgetAssumed: false };
      return estimateTurn(s, before, { now: ctx.now });
    }
    case 'text': {
      const text = input.text.trim().slice(0, 2000);
      if (!text) return greetTurn(s);
      s = { ...s, lang: detectLang(text, s.lang) };
      const parsed = understand(text, { now: ctx.now, fallbackLang: s.lang });
      // A bare answer to the pending question ("3000", "要", "不用"), only when the
      // message carries nothing else: "还要 OCR，三十个人用" must not shrink to "30".
      const bare = parsed.signal === 0 || (parsed.signal === 1 && Object.keys(parsed.quantities).length === 1);
      const typed = bare ? typedAnswer(s, text) : null;
      if (typed) {
        const before = s.req;
        s = { ...s, req: { ...typed, detail: typed.detail + Array.from(text).length }, pending: null };
        return estimateTurn(s, before, { now: ctx.now, text });
      }
      const faq = matchFaq(text);
      const hasProject = !!parsed.kind || parsed.signal >= 2 || (!!s.req.kind && parsed.signal >= 1);
      if (hasProject && faq !== 'unsupported' && faq !== 'bot') {
        const before = s.req;
        s = { ...s, req: mergeRequirements(s.req, parsed, text), pending: null };
        if (parsed.budget) s = { ...s, budgetAssumed: parsed.budget.assumed };
        if (!s.req.kind) return askTurn(s, 'kind', T(s.lang, '收到。还想确认一下项目类型：', 'Thanks. One thing first, the kind of project:'));
        return estimateTurn(s, before, { now: ctx.now, text, faq });
      }
      if (faq) return faqTurn(s, faq, ctx.now);
      const small = smallTalk(text);
      if (small === 'greet') return greetTurn(s, s.req.fromSlug);
      if (small === 'thanks' || small === 'bye' || small === 'ok') {
        const lang = s.lang;
        const msg =
          small === 'thanks'
            ? T(lang, '不客气！还有什么想算的，直接说就行。', 'You’re welcome! Ask away if there’s anything else to work out.')
            : small === 'bye'
              ? T(lang, '好的，再见！这段对话会保留在这个页面里，随时回来接着聊。', 'Bye for now! This chat stays in this page, so you can pick it up any time.')
              : s.estimates > 0
                ? T(lang, '好的。还想调整哪里，直接告诉我；觉得差不多了，就把估价发给 Jack。', 'OK. Tell me anything you’d like to adjust, or send the estimate to Jack when you’re ready.')
                : T(lang, '好的。说说你的项目吧：做什么、给谁用、大概什么时候要。', 'OK. Tell me about your project: what it does, who it’s for and when you need it.');
        const chips = s.estimates > 0 ? [contactChip(lang)] : starterChips(lang).slice(0, 4);
        return { state: remember(s, chips), turn: { lang, blocks: [{ t: 'text', text: msg }], chips, trace: [] } };
      }
      if (parsed.signal >= 1) {
        s = { ...s, req: mergeRequirements(s.req, parsed, text) };
        return askTurn(s, 'kind', T(s.lang, '收到。你想做的更接近哪一种？', 'Thanks. Which of these is closest?'));
      }
      const lang = s.lang;
      const chips = s.estimates > 0 ? [contactChip(lang), ...starterChips(lang).slice(5)] : starterChips(lang);
      return {
        state: remember(s, chips),
        turn: {
          lang,
          blocks: [
            {
              t: 'text',
              text: T(
                lang,
                '这个我答不上来。我负责估算项目、回答合作相关的问题。可以说说你想做的东西，比如：「做一个带登录的会员网站，大概 200 人用，一个月内上线」。想直接问 Jack，就点「把估价发给 Jack」或去联系页。',
                'I can’t help with that one. I estimate projects and answer questions about working with Jack. Try describing what you need, e.g. “a members site with login for about 200 people, live within a month”. To ask Jack directly, use “Send this to Jack” or the contact page.',
              ),
            },
          ],
          chips,
          trace: [],
        },
      };
    }
  }
}

/** For the UI: the latest estimate in the conversation, recomputed from the requirements. */
export function currentEstimate(s: ChatState): Estimate | null {
  return s.estimates > 0 ? estimate(s.req) : null;
}

export { fmtCnyRange, fmtUsdRange };
