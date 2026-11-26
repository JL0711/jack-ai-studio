// Turns Requirements into an Estimate: hours → price → timeline → milestones,
// plus budget fit, an MVP that fits a tight budget, stack, inputs and risks.
// Deterministic: the same requirements always give the same numbers.

import { FEATURE_KINDS, FEATURES, KINDS, PRICING } from './catalog';
import { fmtCnyRange, fmtDuration, fmtHours, fmtUsdRange, roundCny, roundUsd } from './format';
import { toUsd } from './nlu';
import type { Bi, BudgetFit, Estimate, EstimateLine, FeatureId, Kind, Milestone, Range, Requirements } from './types';

const bi = (zh: string, en: string): Bi => ({ zh, en });

/** "Online payments" → "online payments", but "SEO basics" and "WeChat login" keep their capitals. */
export function lowerFirst(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}

/** Can this feature be priced for this kind of project? */
export function applies(f: FeatureId, kind: Kind, features: Requirements['features'] = {}): boolean {
  const only = FEATURE_KINDS[f];
  if (!only || only.includes(kind)) return true;
  // Local models only matter where there is AI: a web app with AI features can run them offline.
  return f === 'offline' && features.ai_chat === true;
}

/** Included features a visitor can take out of the base ("暂时不用支付的商城"). */
const REMOVABLE: FeatureId[] = ['payments', 'auth', 'admin', 'wechat_login', 'uploads'];

export function featureHours(f: FeatureId, kind: Kind): Range {
  return FEATURES[f].byKind?.[kind] ?? FEATURES[f].hours;
}

function add(a: Range, b: Range): Range {
  return [a[0] + b[0], a[1] + b[1]];
}

function docsLine(n: number): [Range, Bi] | null {
  if (n <= 200) return null;
  if (n <= 2000) return [[4, 10], bi(`约 ${n} 份文件：批量导入、断点续传`, `About ${n} files: batch import with resume`)];
  if (n <= 20000) return [[12, 24], bi(`约 ${n} 份文件：批量导入、断点续传、检索调优`, `About ${n} files: batch import, resume, search tuning`)];
  return [[24, 48], bi(`超过 2 万份文件：分批导入、索引和性能调优`, `Over 20,000 files: staged import, indexing and performance work`)];
}

interface Core {
  lines: EstimateLine[];
  base: Range;
  factors: Estimate['factors'];
  hours: Range;
  wanted: FeatureId[];
}

/**
 * How much is known. Deliberately not the number of features: ticking one more
 * in the card must never lower the margin and with it the top price.
 */
function confidenceOf(req: Requirements): Estimate['confidence'] {
  if (req.scale) return 'low';
  let c = 0;
  if (req.kind) c += 2;
  c += Math.min(2, Object.keys(req.quantities).length);
  c += Math.min(1.5, Object.keys(req.features).length * 0.5);
  if (req.budget) c += 0.5;
  if (req.deadlineDays !== undefined) c += 0.5;
  if (req.hasDesign !== undefined) c += 0.5;
  if (req.detail > 30) c += 1;
  if (req.detail > 100) c += 1;
  if (req.detail > 220) c += 1;
  return c >= 6 ? 'high' : c >= 3.5 ? 'medium' : 'low';
}

/** Lines, multipliers and hours (no money): shared by the estimate and the MVP search. */
function core(req: Requirements, kind: Kind, drop: FeatureId[] = []): Core & { confidence: Estimate['confidence'] } {
  const def = KINDS[kind];
  const modify = req.modify || kind === 'fix';
  const lines: EstimateLine[] = [];
  // Included features the visitor said they don't need come out of the base.
  const removed = modify ? [] : def.included.filter((f) => REMOVABLE.includes(f) && (req.features[f] === false || drop.includes(f)));
  const included = modify ? [] : def.included.filter((f) => !removed.includes(f));
  let baseHours: Range = modify ? def.modifyBase : def.base;
  // A single page (landing page, sign-up page) is a smaller site.
  if (kind === 'site' && !modify && req.quantities.pages === 1) baseHours = [8, 16];
  for (const f of removed) {
    const h = featureHours(f, kind);
    baseHours = [Math.max(Math.ceil(baseHours[0] * 0.5), baseHours[0] - h[0]), Math.max(Math.ceil(baseHours[1] * 0.5), baseHours[1] - h[1])];
  }
  const notes: string[][] = [];
  if (included.length) notes.push([`已包含：${included.map((f) => FEATURES[f].label.zh).join('、')}`, `Includes: ${included.map((f) => lowerFirst(FEATURES[f].label.en)).join(', ')}`]);
  if (removed.length) notes.push([`不含：${removed.map((f) => FEATURES[f].label.zh).join('、')}`, `Without: ${removed.map((f) => lowerFirst(FEATURES[f].label.en)).join(', ')}`]);
  lines.push({
    id: 'base',
    label: modify
      ? bi(kind === 'fix' ? '读懂现有代码、修改、测试' : `修改现有${def.short.zh}：读懂代码、改动、测试`, kind === 'fix' ? 'Reading the existing code, changes, testing' : `Changes to the existing ${def.short.en}: reading the code, changes, testing`)
      : kind === 'site' && req.quantities.pages === 1
        ? bi('单页网站（设计到上线）', 'A one-page site (design to launch)')
        : bi(`${def.short.zh}的基础部分（设计到上线）`, `The core ${def.short.en} (design to launch)`),
    hours: baseHours,
    note: notes.length ? bi(notes.map((n) => n[0]).join('；'), notes.map((n) => n[1]).join('; ')) : undefined,
  });

  const wanted: FeatureId[] = [];
  for (const [f, on] of Object.entries(req.features) as [FeatureId, boolean][]) {
    if (!on || drop.includes(f) || !applies(f, kind, req.features)) continue;
    if (included.includes(f)) {
      lines.push({ id: f, feature: f, label: FEATURES[f].label, hours: [0, 0], included: true });
      continue;
    }
    let h = featureHours(f, kind);
    let label = FEATURES[f].label;
    if (f === 'integrations') {
      const n = Math.max(1, Math.min(6, req.quantities.integrations ?? 1));
      if (kind === 'integration' || kind === 'automation' || kind === 'scraper') {
        // The base covers the first one (a script reads its own sheet / posts to its own chat).
        if (n <= 1) continue;
        h = [h[0] * (n - 1), h[1] * (n - 1)];
        label = bi(`再对接 ${n - 1} 个系统`, `${n - 1} more system${n > 2 ? 's' : ''}`);
      } else if (n > 1) {
        h = [h[0] * n, h[1] * n];
        label = bi(`对接 ${n} 个第三方系统`, `${n} third-party integrations`);
      }
    }
    if (f === 'i18n' && (req.quantities.languages ?? 2) > 2) {
      const extra = Math.min(10, (req.quantities.languages ?? 2) - 2);
      h = add(h, [extra, extra * 3]);
      label = bi(`${req.quantities.languages} 种语言`, `${req.quantities.languages} languages`);
    }
    if (f === 'roles' && (req.quantities.roles ?? 0) > 3) {
      const extra = Math.min(8, (req.quantities.roles ?? 3) - 3);
      h = add(h, [extra * 2, extra * 4]);
      label = bi(`${req.quantities.roles} 种角色和权限`, `${req.quantities.roles} roles & permissions`);
    }
    wanted.push(f);
    lines.push({ id: f, feature: f, label, hours: h });
  }

  const q = req.quantities;
  if (kind === 'site' && q.pages && q.pages > 5) {
    const extra = Math.min(60, q.pages - 5);
    lines.push({ id: 'pages', label: bi(`多出的 ${extra} 个页面`, `${extra} extra pages`), hours: [extra, Math.ceil(extra * 2.5)] });
  }
  if ((kind === 'rag' || kind === 'chatbot') && q.docs) {
    const d = docsLine(q.docs);
    if (d) lines.push({ id: 'docs', label: d[1], hours: d[0] });
  }
  if (['webapp', 'ecommerce', 'miniprogram', 'chatbot', 'rag', 'mobile'].includes(kind) && q.users) {
    if (q.users >= 10000) lines.push({ id: 'users', label: bi('上万用户：性能和安全加固、压力测试', '10,000+ users: performance, security hardening, load tests'), hours: [10, 24] });
    else if (q.users >= 1000) lines.push({ id: 'users', label: bi('上千用户：性能和安全加固', '1,000+ users: performance and security hardening'), hours: [4, 10] });
  }
  if (kind === 'ecommerce' && q.products && q.products > 300) {
    lines.push({ id: 'products', label: bi(`约 ${q.products} 个商品：批量导入`, `About ${q.products} products: bulk import`), hours: [3, 8] });
  }

  const base = lines.reduce<Range>((acc, l) => add(acc, l.hours), [0, 0]);
  const confidence = confidenceOf(req);
  const factors: Estimate['factors'] = [];
  // (A fix's base already is "reading the existing code, changes, testing".)
  if (modify && kind !== 'fix') factors.push({ id: 'modify', label: bi('接手已有代码，先读懂再动手', 'Existing code: time to understand it first'), min: 1, max: 1.25 });
  if (modify && req.access === 'none') factors.push({ id: 'access', label: bi('拿不到原来的代码，部分功能可能要重做', 'No access to the old code: some parts may need rebuilding'), min: 1.1, max: 1.4 });
  if (req.sensitive) factors.push({ id: 'sensitive', label: bi('涉及敏感数据：多做安全措施', 'Sensitive data: extra security work'), min: 1.05, max: 1.15 });
  if (def.limited) factors.push({ id: 'limited', label: bi('这类项目 Jack 做得少，多留余量', 'Less common work for Jack: extra margin'), min: 1, max: 1.15 });
  if (req.scale) factors.push({ id: 'scale', label: bi('平台级的需求：先按第一期估，余量放大', 'Platform-sized idea: priced as a first phase, wider margin'), min: 1, max: 1.4 });
  else if (confidence === 'low') factors.push({ id: 'vague', label: bi('需求还比较概括，留出余量', 'Brief still rough: margin for unknowns'), min: 1, max: 1.25 });
  else if (confidence === 'medium') factors.push({ id: 'vague', label: bi('还有细节没定，留一点余量', 'Some details open: a little margin'), min: 1, max: 1.12 });

  const fmin = factors.reduce((p, f) => p * f.min, 1);
  const fmax = factors.reduce((p, f) => p * f.max, 1);
  const lo = Math.max(1, Math.round(base[0] * fmin));
  const hi = Math.max(lo + 1, Math.round(base[1] * fmax));
  return { lines, base, factors, hours: [lo, hi], wanted, confidence };
}

function reviewDays(h: number): number {
  return h < 12 ? 1 : h < 40 ? 3 : h < 100 ? 5 : 7;
}

/** Calendar days to build `h` hours at `perWeek` hours a week, plus review rounds. */
export function calendarDays(h: number, perWeek: number): number {
  return Math.ceil((h / perWeek) * 7) + reviewDays(h);
}

function priceOf(hours: Range, rush: boolean): Range {
  const mult = PRICING.usdPerHour * (rush ? PRICING.rushMultiplier : 1);
  const lo = Math.max(PRICING.minimumUsd, roundUsd(hours[0] * mult));
  const hi = Math.max(lo + 50, roundUsd(hours[1] * mult));
  return [lo, hi];
}

function budgetFit(req: Requirements, kind: Kind, usd: Range, rush: boolean): BudgetFit | undefined {
  if (!req.budget) return undefined;
  const b = toUsd(req.budget, PRICING.cnyPerUsd);
  const budgetUsd: Range = [Math.min(b[0], b[1]), b[1]];
  if (budgetUsd[1] >= usd[1]) {
    return { status: budgetUsd[0] > usd[1] * 1.5 ? 'roomy' : 'fits', budgetUsd };
  }
  if (budgetUsd[1] >= usd[0]) return { status: 'tight', budgetUsd };

  // Over budget: drop the least essential features until the low end fits.
  const wanted = core(req, kind).wanted;
  const order = wanted
    .filter((f) => FEATURES[f].priority <= 3)
    .sort((a, b) => FEATURES[a].priority - FEATURES[b].priority || featureHours(b, kind)[1] - featureHours(a, kind)[1]);
  const drop: FeatureId[] = [];
  for (const f of order) {
    drop.push(f);
    const c = core(req, kind, drop);
    const p = priceOf(c.hours, rush);
    if (p[0] <= budgetUsd[1]) return { status: 'over', budgetUsd, mvp: { drop: [...drop], usd: p, hours: c.hours, feasible: true } };
  }
  // Even the leanest version (only the must-haves) is over budget: say so, with its price.
  const c = core(req, kind, order);
  const p = priceOf(c.hours, rush);
  return { status: 'over', budgetUsd, mvp: { drop: order, usd: p, hours: c.hours, feasible: p[0] <= budgetUsd[1] } };
}

function milestonesFor(usd: Range, days: Range, first: Range): Milestone[] {
  const part = (share: number): Range => [Math.round((usd[0] * share) / 10) * 10, Math.round((usd[1] * share) / 10) * 10];
  // The last payment is whatever is left, so the payments always add up to the price.
  const rest = (...paid: Range[]): Range => [usd[0] - paid.reduce((s, r) => s + r[0], 0), usd[1] - paid.reduce((s, r) => s + r[1], 0)];
  if (usd[1] < PRICING.smallJobUsd) {
    const first = part(0.5);
    return [
      { label: bi('确认需求后开工', 'Start, once the brief is agreed'), share: 0.5, usd: first, days: [0, 1] },
      { label: bi('交付、你验收', 'Delivery and your sign-off'), share: 0.5, usd: rest(first), days },
    ];
  }
  const [a, b, c] = PRICING.milestoneSplit;
  const pa = part(a);
  const pb = part(b);
  return [
    { label: bi('书面需求和计划确认', 'Written brief and plan agreed'), share: a, usd: pa, days: [0, 2] },
    { label: bi('第一版（约 30% 功能）验收', 'First version (~30%) approved'), share: b, usd: pb, days: first },
    { label: bi('全部完成、部署上线、交付源码', 'Everything done, deployed, source handed over'), share: c, usd: rest(pa, pb), days },
  ];
}

function similarFor(req: Requirements, kind: Kind): string[] {
  const out = [...KINDS[kind].similar];
  const f = req.features;
  if ((f.qr || f.approvals || f.roles) && !out.includes('robotics-ops')) out.push('robotics-ops');
  if (f.docgen && kind === 'automation' && !out.includes('excel-certificates')) out.push('excel-certificates');
  if (kind === 'voice' && !out.includes('ai-call-copilot')) out.push('ai-call-copilot');
  if (f.offline && !out.includes('local-doc-qa')) out.push('local-doc-qa');
  return out.slice(0, 3);
}

const STACK_EXTRA: Partial<Record<FeatureId, string>> = {
  payments: 'Stripe / 微信支付 / 支付宝',
  offline: 'Ollama 本地模型',
  ocr: 'PaddleOCR / Tesseract',
  realtime: 'WebSocket / Supabase Realtime',
  tests: 'Vitest / Playwright',
  maps: '高德 / Google Maps',
  finetune: 'LoRA 微调',
  wechat_login: '微信开放平台',
};

export interface EstimateOptions {
  /** Drop these features (used by the "MVP" view). */
  drop?: FeatureId[];
}

export function estimate(req: Requirements, opts: EstimateOptions = {}): Estimate | null {
  const kind = req.kind;
  if (!kind) return null;
  const def = KINDS[kind];
  const c = core(req, kind, opts.drop);
  const weekly = PRICING.weeklyHours;
  const normalDays: Range = [calendarDays(c.hours[0], weekly), calendarDays(c.hours[1], weekly)];
  const rushDays: Range = [calendarDays(c.hours[0], PRICING.maxWeeklyHours), calendarDays(c.hours[1], PRICING.maxWeeklyHours)];

  let rush = false;
  let days = normalDays;
  let deadline: Estimate['deadline'];
  if (req.deadlineDays !== undefined && !req.relaxed) {
    const d = req.deadlineDays;
    if (d >= normalDays[1]) deadline = { days: d, status: 'ok' };
    else if (d >= rushDays[0]) {
      rush = d < normalDays[0] || !!req.rush;
      // Only the low end of the work fits at a rush pace: say so instead of shrinking the range.
      const tight = d < rushDays[1];
      days = tight ? rushDays : [Math.min(rushDays[0], d), Math.min(Math.max(rushDays[0], d), normalDays[1])];
      deadline = { days: d, status: rush || tight ? 'rush' : 'ok', tight: tight || undefined };
      if (tight) rush = true;
    } else {
      const doable = Math.max(1, Math.floor((d * PRICING.maxWeeklyHours) / 7));
      deadline = { days: d, status: 'too_short', mvpHours: [Math.max(1, Math.round(doable * 0.6)), doable] };
      rush = true;
      days = rushDays;
    }
  } else if (req.rush && !req.relaxed) {
    rush = true;
    days = rushDays;
  }

  const usd = priceOf(c.hours, rush);
  const cny: Range = [roundCny(usd[0] * PRICING.cnyPerUsd), roundCny(usd[1] * PRICING.cnyPerUsd)];
  const firstVersionDay: Range = [Math.max(2, Math.round(days[0] * 0.35)), Math.max(3, Math.round(days[1] * 0.4))];
  const milestones = milestonesFor(usd, days, firstVersionDay);

  const stack = [...def.stack];
  for (const f of c.wanted) if (STACK_EXTRA[f] && !stack.includes(STACK_EXTRA[f] as string)) stack.push(STACK_EXTRA[f] as string);

  const inputs: Bi[] = [...def.inputs];
  for (const f of c.wanted) {
    const i = FEATURES[f].input;
    if (i && !inputs.some((x) => x.zh === i.zh)) inputs.push(i);
  }
  const risks: Bi[] = [...(def.risks ?? [])];
  for (const f of c.wanted) {
    const r = FEATURES[f].risk;
    if (r && !risks.some((x) => x.zh === r.zh)) risks.push(r);
  }
  if (req.modify && kind !== 'fix') risks.push(KINDS.fix.risks?.[0] ?? bi('', ''));
  if (kind === 'local_ai' && req.hardware === 'need_advice') {
    inputs.unshift(bi('预算和使用人数（用来推荐显卡或整机配置）', 'Budget and number of users (to recommend a GPU or machine)'));
  }
  if (rush) risks.push(bi('赶工期时范围要先定死，中途加需求会顺延。', 'On a rush timeline the scope is frozen; additions move the date.'));
  if (def.limited) risks.push(bi('这类项目展览馆里还没有 Jack 的作品，报价多留了余量。', 'Jack has no showcase work of this kind yet, so the range is wider.'));

  // Offered as "+ add": features not chosen yet, including ones taken out (so they can come back).
  const takenOut = def.included.filter((f) => REMOVABLE.includes(f) && req.features[f] === false);
  const suggested = [...takenOut, ...def.suggest.filter((f) => req.features[f] !== true && !takenOut.includes(f) && applies(f, kind, req.features))].slice(0, 6);

  // The calculation log, shown under "how this was worked out".
  const steps: Bi[] = [];
  const kindLine = `${def.label.zh}${req.modify && kind !== 'fix' ? '（修改现有）' : ''}`;
  const kindLineEn = `${def.label.en}${req.modify && kind !== 'fix' ? ' (changing an existing one)' : ''}`;
  steps.push(bi(`项目类型：${kindLine}`, `Project type: ${kindLineEn}`));
  for (const l of c.lines) {
    if (l.included) steps.push(bi(`· ${l.label.zh}：基础部分已包含`, `· ${l.label.en}: already in the core`));
    else steps.push(bi(`+ ${l.label.zh}：${fmtHours(l.hours, 'zh')}`, `+ ${l.label.en}: ${fmtHours(l.hours, 'en')}`));
  }
  steps.push(bi(`小计：${fmtHours(c.base, 'zh')}`, `Subtotal: ${fmtHours(c.base, 'en')}`));
  for (const f of c.factors) {
    steps.push(bi(`× ${f.label.zh}（×${f.min}–${f.max}）`, `× ${f.label.en} (×${f.min}–${f.max})`));
  }
  if (c.factors.length) steps.push(bi(`= ${fmtHours(c.hours, 'zh')}`, `= ${fmtHours(c.hours, 'en')}`));
  const rushZh = rush ? ` × ${PRICING.rushMultiplier}（加急）` : '';
  const rushEn = rush ? ` × ${PRICING.rushMultiplier} (rush)` : '';
  if (PRICING.showRate) {
    steps.push(
      bi(
        `× $${PRICING.usdPerHour}/小时${rushZh} = ${fmtUsdRange(usd)}（约 ${fmtCnyRange(cny)}，按 1 美元 ≈ ${PRICING.cnyPerUsd} 元）`,
        `× $${PRICING.usdPerHour}/hour${rushEn} = ${fmtUsdRange(usd)}`,
      ),
    );
  } else {
    steps.push(bi(`= ${fmtUsdRange(usd)}（约 ${fmtCnyRange(cny)}）`, `= ${fmtUsdRange(usd)}`));
  }
  steps.push(
    rush
      ? bi(`加急：每周约 ${PRICING.maxWeeklyHours} 小时 → ${fmtDuration(days, 'zh')}`, `Rush: about ${PRICING.maxWeeklyHours} hours a week → ${fmtDuration(days, 'en')}`)
      : bi(`按每周约 ${weekly} 小时 → ${fmtDuration(days, 'zh')}（含你看版本、提意见的时间）`, `At about ${weekly} hours a week → ${fmtDuration(days, 'en')} (including your review rounds)`),
  );

  const est: Estimate = {
    kind,
    modify: req.modify || kind === 'fix',
    lines: c.lines,
    base: c.base,
    factors: c.factors,
    hours: c.hours,
    usd,
    cny,
    rate: PRICING.usdPerHour,
    days,
    firstVersionDay,
    rush,
    deadline,
    milestones,
    confidence: c.confidence,
    stack: stack.slice(0, 6),
    inputs: inputs.slice(0, 5),
    risks: risks.filter((r) => r.zh).slice(0, 4),
    similar: similarFor(req, kind),
    steps,
    wanted: c.wanted,
    suggested,
  };
  est.budgetFit = budgetFit(req, kind, usd, rush);
  return est;
}
