import { describe, expect, it } from 'vitest';
import { PRICING, budgetBucket, projectTypeFor } from '../ai/catalog';
import { initialState, respond, type ChatState, type Input, type Turn } from '../ai/dialog';
import { estimate } from '../ai/estimate';
import { matchFaq } from '../ai/knowledge';
import { emptyRequirements, mergeRequirements, parseNumber, readBudget, readDeadline, understand } from '../ai/nlu';
import { MESSAGE_LIMIT, buildSummary, contactFields } from '../ai/summary';
import type { Requirements } from '../ai/types';

const now = new Date('2026-11-26T10:00:00-08:00');
const read = (text: string): Requirements => mergeRequirements(emptyRequirements(), understand(text, { now }), text);

describe('numbers', () => {
  it('reads Arabic, Chinese and rough numbers', () => {
    expect(parseNumber('1,200')).toBe(1200);
    expect(parseNumber('2k')).toBe(2000);
    expect(parseNumber('1.5万')).toBe(15000);
    expect(parseNumber('三千五百')).toBe(3500);
    expect(parseNumber('两千')).toBe(2000);
    expect(parseNumber('十五')).toBe(15);
    expect(parseNumber('几百')).toBe(300);
    expect(parseNumber('上万')).toBe(10000);
    expect(parseNumber('three')).toBe(3);
  });
});

describe('understanding a message', () => {
  it('recognises the kind of project in Chinese and English', () => {
    expect(understand('公司官网，5个页面左右').kind).toBe('site');
    expect(understand('想做一个管理后台，员工登录、审批流程').kind).toBe('webapp');
    expect(understand('微信小程序点餐').kind).toBe('miniprogram');
    expect(understand('帮我写个脚本把Excel汇总成报表').kind).toBe('automation');
    expect(understand('I need a client portal where customers log in').kind).toBe('webapp');
    expect(understand('Build a Shopify online store for my clothing brand').kind).toBe('ecommerce');
    expect(understand('transcribe our meeting recordings with Whisper').kind).toBe('voice');
    expect(understand('scrape product prices from a few e-commerce sites every day').kind).toBe('scraper');
  });

  it('turns "local model + documents" into document Q&A that runs offline', () => {
    const p = understand('Set up a local LLM so staff can chat with our policy documents; data must stay on-prem');
    expect(p.kind).toBe('rag');
    expect(p.features.offline).toBe(true);
    const z = understand('本地部署大模型，读我们的内部资料回答问题，不能上云');
    expect(z.kind).toBe('rag');
    expect(z.features.offline).toBe(true);
  });

  it('respects negation but not "we don’t have"', () => {
    expect(understand('官网，不需要支付').features.payments).toBe(false);
    expect(understand('做个会员系统，登录功能先不做').features.auth).toBe(false);
    expect(understand('a booking site, no need for payments').features.payments).toBe(false);
    expect(understand('我们没有官网，想做一个').kind).toBe('site');
    expect(understand('we don’t have a website yet and need one').kind).toBe('site');
  });

  it('does not match English words inside other words', () => {
    // "app" in "whatsapp", "word" in "password", "rag" in "storage"
    const p = understand('reset password storage whatsapp');
    expect(p.kind === 'mobile' || p.kind === 'rag').toBe(false);
  });

  it('reads quantities', () => {
    expect(understand('大概500份PDF文件').quantities.docs).toBe(500);
    expect(understand('几千份合同').quantities.docs).toBe(3000);
    expect(understand('thousands of documents').quantities.docs).toBe(3000);
    expect(understand('网站 8 个页面').quantities.pages).toBe(8);
    expect(understand('大概三十个人用').quantities.users).toBe(30);
    expect(understand('about 200 users').quantities.users).toBe(200);
    expect(understand('中文、英文、日文三种语言的网站').quantities.languages).toBe(3);
  });

  it('reads budgets with currencies, ranges and guesses', () => {
    expect(readBudget('预算2000美元', 'zh')?.money).toEqual({ min: 2000, max: 2000, currency: 'USD' });
    expect(readBudget('budget around $3k', 'en')?.money.max).toBe(3000);
    expect(readBudget('预算3000元', 'zh')?.money.currency).toBe('CNY');
    const r = readBudget('预算 2-3万', 'zh');
    expect(r?.money).toMatchObject({ min: 20000, max: 30000, currency: 'CNY' });
    expect(readBudget('$2,000-$5,000', 'en')?.money).toMatchObject({ min: 2000, max: 5000, currency: 'USD' });
    // A guess is flagged so the chat can ask
    expect(readBudget('预算2000', 'zh')?.assumed).toBe(true);
    // Counts, years and per-month prices are not budgets
    expect(readBudget('around 500 users', 'en')).toBeUndefined();
    expect(readBudget('2026年上线，3000份文件', 'zh')).toBeUndefined();
    expect(readBudget('we sell a $20/month subscription', 'en')).toBeUndefined();
  });

  it('reads deadlines and urgency', () => {
    expect(readDeadline('两周内上线', now).days).toBe(14);
    expect(readDeadline('一个半月', now).days).toBeUndefined();
    expect(readDeadline('一个半月内完成', now).days).toBe(45);
    expect(readDeadline('within 3 weeks', now).days).toBe(21);
    expect(readDeadline('ASAP please', now).rush).toBe(true);
    expect(readDeadline('不着急，慢慢来', now).relaxed).toBe(true);
    expect(readDeadline('12月15日前上线', now).days).toBe(19);
  });
});

describe('estimate', () => {
  it('prices a typical document Q&A project', () => {
    const e = estimate(read('我想做一个能回答公司内部PDF问题的系统，大概500份文件，要离线运行'));
    expect(e?.kind).toBe('rag');
    expect(e?.lines.map((l) => l.id)).toEqual(['base', 'offline', 'docs']);
    // hours × rate, rounded
    expect(e!.usd[0]).toBeGreaterThanOrEqual(e!.hours[0] * PRICING.usdPerHour - 50);
    expect(e!.usd[1]).toBeLessThanOrEqual(e!.hours[1] * PRICING.usdPerHour + 50);
    expect(e!.usd[0]).toBeLessThan(e!.usd[1]);
    expect(e!.cny[1]).toBeGreaterThan(e!.usd[1] * 6);
  });

  it('is deterministic', () => {
    const req = read('client portal with login, file uploads and Stripe payments, about 200 users');
    expect(estimate(req)).toEqual(estimate(req));
  });

  it('counts included features as free and extra features as hours', () => {
    const e = estimate(read('a web app with login and an admin panel, plus approvals and a dashboard'))!;
    expect(e.lines.find((l) => l.id === 'auth')?.included).toBe(true);
    expect(e.lines.find((l) => l.id === 'approvals')?.hours[0]).toBeGreaterThan(0);
  });

  it('charges a rush premium only when the deadline needs it', () => {
    const normal = estimate(read('公司官网，5个页面'))!;
    const rush = estimate(read('公司官网，5个页面，3天内上线'))!;
    expect(normal.rush).toBe(false);
    expect(rush.rush).toBe(true);
    expect(rush.usd[1]).toBeGreaterThan(normal.usd[1]);
  });

  it('suggests a lean version that fits a tight budget', () => {
    const e = estimate(read('client portal with login, approvals, dashboard, reports, SMS notifications and multiple languages. Budget $1500'))!;
    expect(e.budgetFit?.status).toBe('over');
    expect(e.budgetFit?.mvp?.feasible).toBe(true);
    expect(e.budgetFit!.mvp!.usd[0]).toBeLessThanOrEqual(1500);
    // Core features are never dropped
    expect(e.budgetFit!.mvp!.drop).not.toContain('auth');
  });

  it('says honestly when even the leanest version is over budget', () => {
    const e = estimate(read('预算3000元，想做个小程序商城'))!;
    expect(e.budgetFit?.status).toBe('over');
    expect(e.budgetFit?.mvp?.feasible).toBe(false);
  });

  it('never goes below the minimum price', () => {
    const e = estimate({ ...emptyRequirements(), kind: 'consult', detail: 300 })!;
    expect(e.usd[0]).toBeGreaterThanOrEqual(PRICING.minimumUsd);
  });

  it('plans 30/40/30 milestones that add up', () => {
    const e = estimate(read('a web app for 300 users with login, roles and approvals'))!;
    expect(e.milestones.map((m) => m.share)).toEqual([0.3, 0.4, 0.3]);
    const total = e.milestones.reduce((n, m) => n + m.usd[1], 0);
    expect(Math.abs(total - e.usd[1])).toBeLessThanOrEqual(30);
  });

  it('maps to the contact form fields', () => {
    expect(projectTypeFor('rag')).toBe('rag');
    expect(projectTypeFor('site')).toBe('web');
    expect(projectTypeFor('consult')).toBe('other');
    expect(budgetBucket(450)).toBe('under_500');
    expect(budgetBucket(2000)).toBe('500_2000');
    expect(budgetBucket(undefined)).toBe('unsure');
  });
});

function run(lang: 'zh' | 'en', inputs: Input[]): { state: ChatState; turns: Turn[] } {
  let state = initialState(lang);
  const turns: Turn[] = [];
  for (const i of inputs) {
    const r = respond(state, i, { now });
    state = r.state;
    turns.push(r.turn);
  }
  return { state, turns };
}
const texts = (t: Turn) => t.blocks.filter((b) => b.t === 'text').map((b) => (b.t === 'text' ? b.text : '')).join('\n');

describe('conversation', () => {
  it('greets with starter suggestions', () => {
    const { turns } = run('zh', [{ t: 'start' }]);
    expect(turns[0].chips.length).toBeGreaterThan(3);
  });

  it('estimates, asks one follow-up question and re-estimates on the answer', () => {
    const { state, turns } = run('zh', [
      { t: 'text', text: '我想做一个能回答公司内部PDF问题的系统，要离线运行' },
      { t: 'answer', slot: 'docs', value: '3000' },
    ]);
    expect(turns[0].blocks.some((b) => b.t === 'estimate')).toBe(true);
    expect(turns[0].blocks.find((b) => b.t === 'question')).toMatchObject({ slot: 'docs' });
    expect(texts(turns[1])).toContain('3,000');
    expect(state.req.quantities.docs).toBe(3000);
  });

  it('keeps everything in a message that also answers the pending question', () => {
    const { state } = run('zh', [
      { t: 'text', text: '我想做一个能回答公司内部PDF问题的系统' },
      { t: 'answer', slot: 'docs', value: '400' },
      { t: 'text', text: '还要能识别扫描件，大概三十个人用' },
    ]);
    expect(state.req.features.ocr).toBe(true);
    expect(state.req.quantities.users).toBe(30);
  });

  it('accepts a bare typed answer to the pending question', () => {
    const { state } = run('zh', [{ t: 'text', text: '公司官网' }, { t: 'text', text: '8' }]);
    expect(state.req.quantities.pages).toBe(8);
  });

  it('removes a feature when told "no need for X"', () => {
    const { state, turns } = run('en', [
      { t: 'text', text: 'An admin portal for our clinic: staff login, appointment booking and SMS reminders.' },
      { t: 'text', text: 'no need for SMS' },
    ]);
    expect(state.req.features.notifications).toBe(false);
    expect(texts(turns[1])).toMatch(/Updated/);
  });

  it('answers FAQs and replies in the visitor’s language', () => {
    const { turns } = run('zh', [{ t: 'text', text: 'How do you charge?' }]);
    expect(turns[0].lang).toBe('en');
    expect(texts(turns[0])).toContain(`$${PRICING.usdPerHour}`);
    expect(matchFaq('怎么付款？')).toBe('payment');
    expect(matchFaq('你们回复快吗')).toBe('hours');
    expect(matchFaq('are you a bot?')).toBe('bot');
  });

  it('declines out-of-scope work and off-topic questions politely', () => {
    const { turns } = run('zh', [{ t: 'text', text: '能帮我做游戏外挂吗' }, { t: 'text', text: '明天天气怎么样' }]);
    expect(texts(turns[0])).toContain('不在');
    expect(texts(turns[1])).toContain('答不上来');
  });

  it('offers the currency switch when the budget currency was guessed', () => {
    const { turns, state } = run('zh', [{ t: 'text', text: '公司官网，预算2000' }]);
    expect(state.budgetAssumed).toBe(true);
    expect(turns[0].chips.some((c) => c.t === 'currency')).toBe(true);
    const next = respond(state, { t: 'currency', currency: 'USD' }, { now });
    expect(next.state.req.budget?.currency).toBe('USD');
    expect(next.state.budgetAssumed).toBe(false);
  });

  it('does not repeat the same budget remark every turn', () => {
    const { turns } = run('en', [
      { t: 'text', text: 'A company website with a blog, budget $200' },
      { t: 'answer', slot: 'pages', value: '5' },
    ]);
    expect(texts(turns[0])).toMatch(/budget|tight/i);
    expect(texts(turns[1])).not.toMatch(/To be straight with you/);
  });
});

describe('message to Jack', () => {
  it('holds the visitor’s words and the estimate, within the database limit', () => {
    const { state } = run('en', [{ t: 'text', text: 'Client portal with login and Stripe payments for about 200 users, budget $3k' }]);
    const text = buildSummary({ state, said: ['Client portal with login and Stripe payments for about 200 users, budget $3k'], note: 'Call me after 5pm' });
    expect(text).toContain('【网站 AI 估价】');
    expect(text).toContain('Client portal');
    expect(text).toContain('Call me after 5pm');
    expect(text).toMatch(/\$[\d,]+–[\d,]+/);
    const long = buildSummary({ state, said: Array.from({ length: 40 }, () => 'x'.repeat(500)) });
    expect(Array.from(long).length).toBeLessThanOrEqual(MESSAGE_LIMIT);
    expect(contactFields(state)).toEqual({ project_type: 'web', budget: '2000_5000' });
  });
});
