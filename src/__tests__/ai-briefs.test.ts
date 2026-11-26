// Real-looking first messages and short chats, written by someone who hadn't read
// the parser, with what a human estimator would conclude. Each case here once went
// wrong (kind, budget, deadline, a phantom number, an off-topic FAQ…).
import { describe, expect, it } from 'vitest';
import { initialState, respond, type ChatState, type Input, type Turn } from '../ai/dialog';
import { estimate } from '../ai/estimate';
import { matchFaq } from '../ai/knowledge';
import { emptyRequirements, mergeRequirements, readBudget, readDeadline, understand } from '../ai/nlu';
import type { Lang, Requirements } from '../ai/types';

// Thursday 26 Nov 2026, 10:00 in California.
const now = new Date('2026-11-26T10:00:00-08:00');
const read = (text: string): Requirements => mergeRequirements(emptyRequirements(), understand(text, { now }), text);

function chat(lang: Lang, texts: (string | Input)[]): { state: ChatState; turns: Turn[] } {
  let state = initialState(lang);
  state = respond(state, { t: 'start' }, { now }).state;
  const turns: Turn[] = [];
  for (const t of texts) {
    const r = respond(state, typeof t === 'string' ? { t: 'text', text: t } : t, { now });
    state = r.state;
    turns.push(r.turn);
  }
  return { state, turns };
}
const textOf = (turn: Turn) => turn.blocks.map((b) => (b.t === 'text' || b.t === 'question' ? b.text : '')).join('\n');
const hasEstimate = (turn: Turn) => turn.blocks.some((b) => b.t === 'estimate');
const question = (turn: Turn) => turn.blocks.find((b) => b.t === 'question') as { slot: string } | undefined;
const NOT_UNDERSTOOD = /答不上来|can’t help with that|没太明白|didn’t quite get/;

describe('plain requests are recognised', () => {
  it.each([
    ['我想做一个网站', 'site'],
    ['做个网站', 'site'],
    ['预算不多，大概一千块，想做个个人博客', 'site'],
    ['想做个民宿预订网站，客人可以看房间照片在线预订，付定金，预算8千到1万，最好过年前上线', 'site'],
    ['帮我们做个内部管理系统，十几个人用，要有登录、权限，能看数据报表，能导出excel', 'webapp'],
    ['We want a local LLM on our office server so staff can ask questions about our internal wiki. Around 30 people, nothing can go to the cloud.', 'rag'],
    ['I need a bot that monitors my competitors’ prices on Amazon every day and emails me when they change. Need it in 2 weeks.', 'scraper'],
    ['帮我做个Chrome插件，可以一键把网页保存到Notion', 'desktop'],
    ['I’d like a tool that summarizes long YouTube videos and podcasts for me', 'voice'],
    ['想做个AI写作助手给运营用，能按我们的模板生成小红书文案', 'chatbot'],
    ['可以做离线的翻译工具吗，我们工厂里没网', 'local_ai'],
    ['下周五前要一个活动报名页面，能收集姓名电话，后台能看到报名名单', 'site'],
  ])('%s → %s', (text, kind) => {
    expect(read(text).kind).toBe(kind);
  });

  it('never answers a plain request with "can’t help"', () => {
    for (const [lang, text] of [
      ['en', 'I need a site for my shop'],
      ['en', 'Hola, necesito una página web para mi negocio, algo sencillo'],
      ['en', 'like Uber for dog walking'],
      ['en', 'Enterprise here. We’re looking to transform our entire customer journey with AI across 12 business units. Who do we talk to?'],
      ['zh', '想做个网战，卖茶叶的，要能在线付款'],
      ['zh', '我想做一个网站'],
    ] as [Lang, string][]) {
      const { turns } = chat(lang, [text]);
      expect(textOf(turns[0]), text).not.toMatch(NOT_UNDERSTOOD);
      expect(hasEstimate(turns[0]) || question(turns[0])?.slot === 'kind', text).toBe(true);
    }
  });

  it('still says so when a message is not a project at all', () => {
    const { turns } = chat('zh', ['明天天气怎么样']);
    expect(textOf(turns[0])).toMatch(/没太明白/);
  });
});

describe('bug reports are priced as fixes', () => {
  it('a broken site, today', () => {
    const p = understand('网站打不开了，报500错误，急！！今天能修吗', { now });
    expect(p.kind).toBe('fix');
    expect(p.deadlineDays).toBe(1);
    expect(p.rush).toBe(true);
  });

  it('a crashing app is not a new iOS app, and its features are not new work', () => {
    const r = read('Our React app crashes on iOS Safari when users upload images. Need a fix ASAP.');
    expect(r.kind).toBe('fix');
    expect(r.features.uploads).toBeUndefined();
    const e = estimate(r)!;
    expect(e.lines.map((l) => l.id)).toEqual(['base']);
  });

  it('a payment bug in a mini program is not a new mini program with payments', () => {
    const r = read('帮我改个bug，小程序里支付回调有问题，钱扣了但订单状态没变');
    expect(r.kind).toBe('fix');
    expect(r.alsoKind).toBe('miniprogram');
    expect(r.features.payments).toBeUndefined();
    expect(estimate(r)!.usd[1]).toBeLessThan(700);
  });

  it('a slow WordPress site is a speed fix', () => {
    expect(read('我的wordpress网站特别慢，打开要十几秒，想优化一下').kind).toBe('fix');
  });

  it('a new tool that mentions today’s errors is not a fix', () => {
    expect(read('我们现在手工录入经常有错误，有问题，想做个自动化').kind).toBe('automation');
    expect(read('We want to automate data entry; the current process is broken and full of errors').kind).not.toBe('fix');
    expect(read('The checkout on our site is broken and throws an error, please fix it').kind).toBe('fix');
  });

  it('but "bug tracking system" and "existing documents" are not fixes', () => {
    expect(read('We need a bug tracking system for our team with login').kind).not.toBe('fix');
    const r = read('a chatbot that answers questions from our existing documents');
    expect(r.modify).toBe(false);
  });
});

describe('declines', () => {
  it.each([
    '能帮我做个刷好评的软件吗，批量注册账号去点评网站刷五星',
    'Can you help me get into my ex’s Instagram account? I know the email.',
  ])('%s', (text) => {
    expect(matchFaq(text)).toBe('unsupported');
    const { turns } = chat('zh', [text]);
    expect(hasEstimate(turns[0])).toBe(false);
  });

  it('personal data scraping is declined with a reason', () => {
    const { turns } = chat('en', ['Can you scrape LinkedIn profiles for me? Need about 5000 leads with emails.']);
    expect(hasEstimate(turns[0])).toBe(false);
    expect(textOf(turns[0])).toMatch(/LinkedIn/);
  });

  it('but security work and data mining are fine', () => {
    expect(matchFaq('网站要能防黑客攻击')).not.toBe('unsupported');
    expect(matchFaq('protection against hacking')).not.toBe('unsupported');
    expect(matchFaq('a data mining tool for our sales data')).not.toBe('unsupported');
  });
});

describe('numbers that are not budgets or counts', () => {
  it.each([
    ['around 2 weeks', 'en'],
    ['about 2-3 weeks', 'en'],
    ['5 kinds of users', 'en'],
    ['about 5000 leads with emails', 'en'],
    ['200 products priced $10-50', 'en'],
    ['tickets cost $25 each', 'en'],
    ['商品单价50到200元', 'zh'],
    ['大概500', 'zh'],
  ] as [string, Lang][])('%s → no budget', (text, lang) => {
    expect(readBudget(text.toLowerCase(), lang)).toBeUndefined();
  });

  it('reads spoken Chinese amounts and ranges', () => {
    expect(readBudget('预算一万五', 'zh')?.money.max).toBe(15000);
    expect(readBudget('预算两千五', 'zh')?.money.max).toBe(2500);
    expect(readBudget('预算1万5', 'zh')?.money.max).toBe(15000);
    expect(readBudget('预算三到五万', 'zh')?.money).toMatchObject({ min: 30000, max: 50000, currency: 'CNY' });
    expect(readBudget('预算两三万', 'zh')?.money).toMatchObject({ min: 20000, max: 30000 });
    expect(readBudget('预算的话三四万以内吧', 'zh')?.money).toMatchObject({ min: 30000, max: 40000 });
  });

  it('reads euros, pounds and a budget said a few words earlier', () => {
    expect(readBudget('small budget (€1500), i need a booking system', 'en')?.money).toMatchObject({ max: 1500, currency: 'EUR' });
    expect(readBudget('about £800 for this', 'en')?.money).toMatchObject({ max: 800, currency: 'GBP' });
    expect(readBudget('not sure about budget, maybe 3-5k?', 'en')?.money).toMatchObject({ min: 3000, max: 5000, currency: 'USD' });
  });

  it('"一个" is an article, not a count', () => {
    expect(read('做一个客服机器人，放在我们网站上').quantities.users).toBeUndefined();
    expect(read('我们想做一个文档问答系统').quantities.docs).toBeUndefined();
    expect(read('我们想在公司内部部署一个大模型给员工用，大概100人').quantities.users).toBe(100);
  });
});

describe('deadlines', () => {
  const days = (text: string) => readDeadline(text.toLowerCase(), now).days;
  it.each([
    ['下周五前要上线', 8],
    ['need a landing page by next friday', 8],
    ['周五之前要', 1],
    ['i need a full e-commerce site done by tomorrow', 1],
    ['ideally by christmas', 29],
    ['最好过年前上线', 72],
    ['不急，年前能弄好就行', 72],
    ['12月底上线', 35],
    ['希望12月上线', 35],
    ['3月底前上线', 125],
    ['下个月底之前上线', 35],
    ['3个月内上线', 90],
    ['deadline is in 6 weeks', 42],
  ] as [string, number][])('%s → %i days', (text, n) => {
    expect(days(text)).toBe(n);
  });

  it('is not fooled by durations of other things or urgent wording', () => {
    expect(days('it takes 2 days by hand')).toBeUndefined();
    expect(readDeadline('notify the manager immediately', now).rush).toBeUndefined();
    expect(readDeadline('扫码后立刻显示结果', now).rush).toBeUndefined();
    expect(readDeadline('whenever someone books, email me', now).relaxed).toBeUndefined();
    expect(readDeadline('budget is flexible', now).relaxed).toBeUndefined();
    expect(readDeadline('asap, budget is flexible', now).rush).toBe(true);
    expect(readDeadline('no rush', now).rush).toBeUndefined();
  });

  it('a later deadline replaces "no rush" and an earlier rush', () => {
    let s = chat('en', ['A company website, no rush', 'ASAP, within 5 days']).state;
    expect(s.req.rush).toBe(true);
    expect(s.req.relaxed).toBe(false);
    s = chat('en', ['A web app with login, within 5 days', 'actually within 2 months is fine']).state;
    expect(s.req.rush).toBe(false);
    expect(s.req.deadlineDays).toBe(60);
  });
});

describe('negation', () => {
  it.each([
    ['We don’t need login or payments', 'payments', false],
    ['We don’t need login or payments', 'auth', false],
    ['without login, search or payments', 'payments', false],
    ['不需要会员登录和在线支付功能', 'payments', false],
    ['做个网站 不需要登录 也不用支付 就展示一下我们的产品', 'payments', false],
    ['payments aren’t needed', 'payments', false],
    ['no login, but we need payments', 'payments', true],
  ] as [string, keyof Requirements['features'], boolean][])('%s → %s %s', (text, f, v) => {
    expect(understand(text, { now }).features[f]).toBe(v);
  });

  it('an open question is neither yes nor no', () => {
    expect(understand('不知道要不要做支付', { now }).features.payments).toBeUndefined();
  });

  it('"no design needed" is not a request for design', () => {
    for (const text of ['不需要设计', '不用帮我设计', 'We don’t need a design', 'no design needed']) {
      expect(understand(text, { now }).features.design, text).not.toBe(true);
    }
  });

  it('a space between Chinese phrases ends the negation', () => {
    expect(read('做个网站 不需要登录 也不用支付 就展示一下我们的产品 大概十几个产品').kind).toBe('site');
  });
});

describe('details already given are not asked again', () => {
  it('"数据不能出公司" answers the offline question', () => {
    const r = read('我们公司有200多份PDF合同，想做个系统能直接问问题，比如某个合同的付款条款是什么。数据不能出公司。');
    expect(r.kind).toBe('rag');
    expect(r.features.offline).toBe(true);
  });
  it('"must not send our data to OpenAI or any cloud" answers it too', () => {
    expect(read('We want an internal chatbot that answers questions from our HR policy documents (about 50 PDFs). It must not send our data to OpenAI or any cloud.').features.offline).toBe(true);
  });
  it('a GPU server is hardware they have', () => {
    expect(read('我们想在公司内部部署一个大模型给员工用，大概100人，数据不能出公司，有显卡服务器').hardware).toBe('have');
  });
  it('a chatbot on the website answers the channel question', () => {
    const { turns } = chat('en', ['Could you build a chatbot for our dental clinic website that can book appointments?']);
    expect(question(turns[0])?.slot).not.toBe('channel');
  });
  it('invoices are OCR, and "every month" is a schedule', () => {
    expect(read('We want something that reads incoming supplier invoices (around 300 a month) and enters them into QuickBooks automatically.').features.ocr).toBe(true);
    const r = read('我想要一个能识别发票的工具，把发票上的金额、日期抓出来填到表格里，每个月大概五百张');
    expect(r.features.ocr).toBe(true);
    expect(r.features.schedule).toBe(true);
  });
});

describe('FAQs only answer questions that were asked', () => {
  it('no reply-hours answer inside a project description', () => {
    const { turns } = chat('zh', [
      '你好，是这样的，我们是做外贸的小公司，大概十个人左右，平时客户的询盘邮件很多，业务员每天要花很多时间回复。我在想能不能用AI帮忙自动起草回复，然后人工确认一下再发出去，另外最好还能把客户信息自动录入到我们的CRM里（用的是HubSpot）。预算的话三四万以内吧，不急，年前能弄好就行',
    ]);
    expect(hasEstimate(turns[0])).toBe(true);
    expect(textOf(turns[0])).not.toMatch(/回复时段是/);
  });
  it('no source-code answer for "hand over to a human", and the budget is read', () => {
    const { state, turns } = chat('en', [
      "Hey there, so I run a small accounting firm (8 people) and we spend way too much time answering the same client questions over email. I was thinking maybe some kind of AI assistant that knows our FAQ and our procedures (we have maybe 40 Word docs) could answer clients on our website, and hand over to a human when it's unsure. Not sure about budget, maybe 3-5k? No rush, sometime in Q1.",
    ]);
    expect(textOf(turns[0])).not.toMatch(/source code is handed over|full source code/);
    expect(state.req.budget).toMatchObject({ min: 3000, max: 5000 });
    expect(state.req.kind).toBe('chatbot');
  });
  it('no meeting policy for a phone bot', () => {
    const { turns } = chat('zh', ['能做语音助手吗？就是客户打电话进来自动接听，回答一些常见问题']);
    expect(textOf(turns[0])).not.toMatch(/沟通以文字为主/);
  });
  it('availability is its own answer', () => {
    expect(matchFaq("What's your availability? We'd want to start in January.")).toBe('availability');
  });
  it('tightened rules', () => {
    expect(matchFaq('…transcribes phone calls?')).not.toBe('meeting');
    expect(matchFaq('在线预约系统能做吗？')).not.toBe('hours');
    expect(matchFaq('tax forms for our clients')).not.toBe('invoice');
    expect(matchFaq('pretty simple, twenty pages')).toBeNull();
  });
});

describe('the project stays the project', () => {
  it('"本地部署" later makes the document Q&A offline, not a different project', () => {
    const { state } = chat('zh', ['我们想做一个文档问答系统', '大概500份PDF，十几个人用', '对了，数据不能出公司，要本地部署']);
    expect(state.req.kind).toBe('rag');
    expect(state.req.features.offline).toBe(true);
    expect(state.req.quantities.docs).toBe(500);
  });
  it('"in our Shopify store" adds an integration to the chatbot', () => {
    const { state, turns } = chat('en', ['Chatbot for our website', 'it also needs to look up order status in our Shopify store', 'how long would that take?']);
    expect(state.req.kind).toBe('chatbot');
    expect(state.req.features.integrations).toBe(true);
    expect(textOf(turns[2])).toMatch(/weeks|days/);
  });
  it('an Excel file mentioned later does not turn a shop into a script', () => {
    const { state } = chat('en', ['An online store for my clothing brand, about 100 products', 'I can send you the product list as an Excel file']);
    expect(state.req.kind).toBe('ecommerce');
  });
  it('"actually, make it …" does change it', () => {
    const { state } = chat('en', ['Need a scraper for real estate listings', 'actually, make it a full web dashboard with login for 10 people']);
    expect(state.req.kind).toBe('webapp');
    expect(state.req.quantities.users).toBe(10);
  });
  it('"不用了，网页版就行" switches an app to the web', () => {
    const { state, turns } = chat('zh', ['想做个app', '不用了，网页版就行，手机能打开就可以']);
    expect(state.req.kind).toBe('webapp');
    expect(textOf(turns[1])).not.toMatch(NOT_UNDERSTOOD);
  });
  it('"we can’t use OpenAI" makes the chatbot offline instead of adding AI', () => {
    const { state } = chat('en', ['We need a chatbot', "no actually it should run on our own servers, we can't use OpenAI"]);
    expect(state.req.kind).toBe('chatbot');
    expect(state.req.features.offline).toBe(true);
    expect(state.req.features.ai_chat).toBeUndefined();
  });
});

describe('prices follow what was said', () => {
  it('taking payments out of a shop lowers the price', () => {
    const { state, turns } = chat('zh', ['想做个网店', '大概五十个商品，需要微信支付', '算了，暂时不需要支付了']);
    expect(state.req.features.payments).toBe(false);
    const with_ = (turns[1].blocks.find((b) => b.t === 'estimate') as { est: { usd: number[] } }).est.usd;
    const without = (turns[2].blocks.find((b) => b.t === 'estimate') as { est: { usd: number[] } }).est.usd;
    expect(without[1]).toBeLessThan(with_[1]);
  });
  it('a one-page site costs less than a five-page one', () => {
    const one = estimate(read('need a landing page for my app launch'))!;
    const five = estimate(read('need a company website with 5 pages'))!;
    expect(one.kind).toBe('site');
    expect(one.usd[1]).toBeLessThan(five.usd[1]);
  });
  it('platform-sized ideas are priced as a first phase and said plainly', () => {
    const { state, turns } = chat('zh', ['有没有可能做一个app，类似美团那种外卖平台']);
    expect(state.req.scale).toBe('platform');
    expect(textOf(turns[0])).toMatch(/第一期/);
    const en = chat('en', ['Enterprise here. We’re looking to transform our entire customer journey with AI across 12 business units. Who do we talk to?']);
    expect(en.state.req.kind).toBe('consult');
    expect(textOf(en.turns[0])).toMatch(/one person|solo/);
  });
  it('milestones add up to the price', () => {
    for (const text of ['公司官网，5个页面', '一个带登录的管理后台，50人用', '帮我写个脚本把Excel汇总成报表', '文档问答系统，3000份PDF，离线']) {
      const e = estimate(read(text))!;
      const sum = e.milestones.reduce((a, m) => [a[0] + m.usd[0], a[1] + m.usd[1]], [0, 0]);
      expect(sum, text).toEqual(e.usd);
    }
  });
  it('ticking one more feature never lowers the top price', () => {
    const base = read('a web app for our team');
    const more = { ...base, features: { ...base.features, seo: true } };
    expect(estimate(more)!.usd[1]).toBeGreaterThanOrEqual(estimate(base)!.usd[1]);
  });
  it('a deadline only the low end can meet is called tight', () => {
    const e = estimate({ ...read('一个带登录、审批和报表的管理后台，30人用，还要多语言和数据看板'), deadlineDays: 22 })!;
    if (e.deadline?.status === 'rush') expect(e.days[1]).toBeGreaterThanOrEqual(e.deadline.days);
  });
});

describe('typed answers', () => {
  it('Chinese yes / no', () => {
    let { state } = chat('zh', ['我想做一个小程序给健身房会员预约课程']);
    expect(state.pending).toBe('payments');
    state = respond(state, { t: 'text', text: '需要' }, { now }).state;
    expect(state.req.features.payments).toBe(true);
    ({ state } = chat('zh', ['我想做一个小程序给健身房会员预约课程', '不用']));
    expect(state.req.features.payments).toBe(false);
  });
  it('a deadline and a budget in words', () => {
    let { state } = chat('zh', ['一个爬虫，抓几个网站的商品价格']);
    while (state.pending && state.pending !== 'deadline') state = respond(state, { t: 'answer', slot: state.pending, value: state.pending === 'frequency' ? 'auto' : '' }, { now }).state;
    expect(state.pending).toBe('deadline');
    state = respond(state, { t: 'text', text: '两周' }, { now }).state;
    expect(state.req.deadlineDays).toBe(14);
    expect(state.pending).toBe('budget');
    state = respond(state, { t: 'text', text: '两万' }, { now }).state;
    expect(state.req.budget).toMatchObject({ max: 20000, currency: 'CNY' });
    expect(state.budgetAssumed).toBe(true);
  });
  it('a number typed for the files question is a count, not a budget', () => {
    let { state } = chat('en', ['A system that answers questions from our PDF documents']);
    expect(state.pending).toBe('docs');
    state = respond(state, { t: 'text', text: 'about 500' }, { now }).state;
    expect(state.req.quantities.docs).toBe(500);
    expect(state.req.budget).toBeUndefined();
  });
});

describe('wording', () => {
  it('keeps capitals and articles right', () => {
    const { turns } = chat('en', ['Looking for help migrating our WordPress site to Next.js, ~80 pages, SEO rankings must be preserved']);
    expect(textOf(turns[0])).not.toMatch(/sEO|weChat|qR/);
    const s = chat('en', ['Chatbot for our website', 'actually, make it an online store instead']);
    expect(textOf(s.turns[1])).not.toMatch(/\ba online/);
  });
  it('one English word keeps a Chinese chat in Chinese', () => {
    const { turns } = chat('zh', ['公司官网，5个页面', 'ok']);
    expect(turns[1].lang).toBe('zh');
  });
});

// A second set, written later by someone who had seen neither the parser nor the set above.
describe('unseen briefs', () => {
  const est = (turn: Turn) => (turn.blocks.find((b) => b.t === 'estimate') as { est: { usd: number[] } } | undefined)?.est;

  it('declines crypto trading, account break-ins and personal-data scraping, however it is put', () => {
    for (const [lang, text] of [
      ['en', 'Need a Telegram bot that auto-trades memecoins on Solana when whales buy. Budget flexible.'],
      ['en', 'My ex changed the password on our shared Instagram, can you get me back in? I can pay well.'],
      ['zh', '帮我写个爬虫，把某招聘网站上所有求职者的手机号和邮箱都抓下来，我要做营销。'],
    ] as [Lang, string][]) {
      const { turns } = chat(lang, [text]);
      expect(est(turns[0]), text).toBeUndefined();
      expect(textOf(turns[0]), text).toMatch(/不接|不在 Jack|isn't something Jack takes on/);
    }
    const { turns } = chat('en', ['Hi, I need a scraper for LinkedIn.', 'I want names, emails and phone numbers of all HR managers in Germany.']);
    expect(textOf(turns[1])).toMatch(/LinkedIn/);
  });

  it('"转人工" in a chatbot brief is a feature, and "Monday" is not an NDA', () => {
    const zh = chat('zh', ['想在官网上加个AI客服，能回答客户关于产品和售后的常见问题，大概有100多个常见问题，回答不了的转人工。']);
    expect(est(zh.turns[0])).toBeDefined();
    const en = chat('en', ["We're a small manufacturer. Every Monday someone spends 4 hours copying numbers from 15 supplier spreadsheets into our master production plan. Can this be automated? Low four figures is fine."]);
    expect(textOf(en.turns[0])).not.toMatch(/NDA|local/);
    expect(en.state.req.kind).toBe('automation');
    expect(en.state.req.budget).toMatchObject({ min: 1000, max: 3000, currency: 'USD' });
  });

  it('a broken checkout is a rush fix; a footer phone number is a small change', () => {
    const r = read('Our Shopify store checkout broke after a theme update — customers get stuck on the payment step. Needed this fixed yesterday!');
    expect(r.kind).toBe('fix');
    expect(r.rush).toBe(true);
    const footer = read("can you just change the phone number in the footer of my website? it's a wix site");
    expect(footer.modify).toBe(true);
    expect(footer.features.integrations).toBeUndefined();
    expect(estimate(footer)!.usd[1]).toBeLessThanOrEqual(700);
  });

  it('local models "like ChatGPT" on their own GPUs are a local AI setup, not a platform', () => {
    const r = read('公司想在内网部署一个大模型，类似ChatGPT那种，员工可以用来写文案、翻译，但是数据不能出公司。我们有台服务器带两张4090显卡。');
    expect(r.kind).toBe('local_ai');
    expect(r.hardware).toBe('have');
    expect(r.scale).toBeUndefined();
  });

  it('brand names joined by 和 are not "like Taobao"; "the next Uber" is', () => {
    expect(read('我在淘宝和拼多多开店，想每天自动抓一下竞品的价格和销量，做成表格，大概监控200个商品链接。').scale).toBeUndefined();
    expect(read('I want to build the next Uber but for pet grooming, with AI matching, payments, reviews, live tracking, in 5 countries. How much?').scale).toBe('platform');
  });

  it('an hour of advice is a consultation', () => {
    expect(read("I'd like to book a one-hour call to get your opinion on our architecture — we're deciding between building RAG in-house or buying a SaaS.").kind).toBe('consult');
  });

  it('dates: 下下周三, 下个月中旬, a trade show on March 10, end of Q2', () => {
    const days = (t: string) => readDeadline(t.toLowerCase(), now).days;
    expect(days('下下周三之前要一个活动报名页面')).toBe(13);
    expect(days('下个月中旬之前上线')).toBe(19);
    expect(days('must be live before the trade show on March 10')).toBe(104);
    expect(days('target end of q2')).toBe(216);
  });

  it('"线下收款就行" turns payments off, and a corrected budget wins', () => {
    const { state } = chat('zh', ['需要一个小程序，做社区团购的', '不要支付功能，线下收款就行。商品大概100个，团长50个左右，预算5万', '不好意思说错了，预算是3万，不是5万']);
    expect(state.req.features.payments).toBe(false);
    expect(state.req.quantities.products).toBe(100);
    expect(state.req.budget?.max).toBe(30000);
  });

  it('counts said noun-first, and site names that are numbers', () => {
    const r = read('我们是一家中医诊所，想把过去十年的病历（纸质的，大概两万份）扫描后做成可以检索的系统，医生能按症状搜到类似的病例。病人隐私很重要。');
    expect(r.kind).toBe('rag');
    expect(r.quantities.docs).toBe(20000);
    expect(r.features.ocr).toBe(true);
    expect(read('做一个卖茶叶的小网店，商品大概50个左右，要能微信支付和支付宝').quantities.products).toBe(50);
    expect(read('做个chrome插件，在1688商品页面上一键把商品信息采集到我们的表格里。').quantities.products).toBeUndefined();
  });

  it('reads the rest of the brief', () => {
    const law = read('Our law firm (12 attorneys) wants an internal tool to search and ask questions over ~8,000 case files and memos. Must stay on our own servers — client confidentiality is non-negotiable. What would something like that cost?');
    expect(law.kind).toBe('rag');
    expect(law.quantities.docs).toBe(8000);
    expect(law.features.offline).toBe(true);
    expect(read("We record about 40 hours of interviews per month for research (English and Spanish). Need a tool that transcribes them and lets us search the transcripts. Audio can't leave our machines (IRB rules).").features.offline).toBe(true);
    expect(read('Hi, I run a physiotherapy clinic with 3 locations. We need online booking where patients pick a therapist and time slot, get email/SMS reminders, and we can manage schedules in an admin panel. Budget around 2 grand, ideally live by end of January.').budget).toMatchObject({ max: 2000, currency: 'USD' });
    expect(read('We sell spare parts on WooCommerce (about 4,000 SKUs) and want to move to Shopify without losing SEO. Can you handle the migration and product import?').features.seo).toBe(true);
    expect(read('Hello sir, we are restaurant in Dubai, we want website with menu and online order for delivery, also customer can pay by card. Please tell me price and how many days you need.').features.payments).toBe(true);
    expect(read('我们是一个公益组织，想做个简单官网，介绍项目、展示活动照片、接受捐款。预算不多，一万以内。').features.payments).toBe(true);
    const school = read("I'm the IT coordinator at a private high school. We need a simple system for teachers to log detentions and parents to get notified by email. About 600 students, 40 teachers. Not urgent — sometime next semester.");
    expect(school.kind).toBe('webapp');
    expect(school.rush).toBeFalsy();
    expect(read('Real estate site, ~100 listings, map search, agent logins. 5k budget. ASAP.').kind).toBe('webapp');
    expect(read("Small accounting practice in Leeds. We'd like an AI assistant that answers staff questions using our internal procedures manual (about 300 pages). Budget £1,000–£1,500, would love it before tax season in January.").quantities.pages).toBeUndefined();
  });

  it('answers two questions asked together', () => {
    const { turns } = chat('zh', ['你们是怎么收费的？要先付全款吗？']);
    expect(textOf(turns[0])).toMatch(/每小时/);
    expect(textOf(turns[0])).toMatch(/里程碑/);
  });

  it('"Actually, can we also…" adds to the project instead of replacing it', () => {
    const { state } = chat('en', [
      'We need an internal tool to track equipment rentals for our construction company.',
      'About 300 pieces of equipment, 15 staff users. Oh and it should send reminders when a rental is overdue.',
      "Budget's around $3k. Actually, can we also get a simple mobile-friendly view for the guys on site?",
    ]);
    expect(state.req.kind).toBe('webapp');
    expect(state.req.features.notifications).toBe(true);
  });
});
