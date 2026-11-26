// pixel-font: skip (nothing in this file is drawn in the pixel font, so its characters can stay out of the font subset)
import { describe, expect, it } from 'vitest';
import { extractEntities } from '../demos/ai-call-copilot/entities';
import { detectIntents, isQuestion, primaryIntent } from '../demos/ai-call-copilot/intents';
import { formatMoney, parseEnNumber, parseZhNumber } from '../demos/ai-call-copilot/numbers';
import { agreedFromTurns, emptyMemory, hear, respond, spaceOut, summarize } from '../demos/ai-call-copilot/suggest';
import { TEMPLATES } from '../demos/ai-call-copilot/templates';
import { TEXT } from '../demos/ai-call-copilot/text';
import { FACT_KEYS, INTENTS, TACTICS, type Entity, type Intent, type Lang, type Memory } from '../demos/ai-call-copilot/types';

/** Runs their lines through the copilot in order and returns the final memory and the last answer. */
function call(lang: Lang, lines: string[]) {
  let memory: Memory = emptyMemory();
  let last = respond(memory, lines[0], lang);
  for (const line of lines) {
    last = respond(memory, line, lang);
    memory = last.memory;
  }
  return { memory, last };
}

const kinds = (text: string) => extractEntities(text).map((e) => `${e.kind}:${e.text}`);
const find = (text: string, kind: Entity['kind']) => extractEntities(text).find((e) => e.kind === kind);

describe('call copilot: intent rules', () => {
  const cases: [string, Intent][] = [
    ['你们做一个小程序大概多少钱？', 'price'],
    ['How much would a booking app cost?', 'price'],
    ['这个价格有点贵了，能不能便宜点？', 'too_expensive'],
    ["Honestly that's a bit pricey.", 'too_expensive'],
    ['大概多久能上线？我们想赶在双十一之前。', 'timeline'],
    ['How long would it take? We need it live by March 15.', 'timeline'],
    ['包括后台管理吗？能不能加个会员功能？', 'scope'],
    ['Does the package include hosting pages for each location?', 'scope'],
    ['数据会存在哪里？安全吗？', 'technical'],
    ['Where would our data be stored? Is it secure?', 'technical'],
    ['别家才报 1 万 5，差这么多。', 'competitor'],
    ['Another agency quoted us 6,500 dollars.', 'competitor'],
    ['我得跟老板商量一下，再考虑考虑。', 'hesitation'],
    ['Let me think about it and get back to you next week.', 'hesitation'],
    ['订单号 B7720 到现在还没发货，太过分了！', 'complaint'],
    ["My order still hasn't arrived and nobody answers. This is ridiculous.", 'complaint'],
    ['我要退款！', 'refund'],
    ['I want my money back.', 'refund'],
    ['下周三下午有空吗？', 'scheduling'],
    ['Are you free next Wednesday afternoon?', 'scheduling'],
    ['喂，你好，听得到吗？', 'small_talk'],
    ['Hi, how are you doing?', 'small_talk'],
    ['好的，那就先这样，再见！', 'goodbye'],
    ['Thanks so much, talk soon!', 'goodbye'],
    ['好的，那就这么定了。', 'agreement'],
    ['Sounds good, let’s do it.', 'agreement'],
    ['嗯，那个，怎么说呢。', 'other'],
  ];
  for (const [line, intent] of cases) {
    it(`"${line}" → ${intent}`, () => expect(primaryIntent(line)).toBe(intent));
  }

  it('never treats a question as a yes', () => {
    expect(isQuestion('可以做小程序吗？')).toBe(true);
    expect(detectIntents('可以做小程序吗？').map((s) => s.intent)).not.toContain('agreement');
    expect(detectIntents('Can you do that?').map((s) => s.intent)).not.toContain('agreement');
  });

  it('ignores a negated objection and polite thanks', () => {
    expect(primaryIntent('不贵')).toBe('other');
    expect(detectIntents('not too expensive actually').map((s) => s.intent)).not.toContain('too_expensive');
    expect(detectIntents('Thanks so much!').map((s) => s.intent)).not.toContain('too_expensive');
    // "happen" contains "app": not a scope question
    expect(detectIntents("please don't let this happen again").map((s) => s.intent)).not.toContain('scope');
  });

  it('keeps the objection ahead of the price it mentions', () => {
    const list = detectIntents('预算就 2 万，太贵了');
    expect(list[0].intent).toBe('too_expensive');
    expect(list.map((s) => s.intent)).toContain('price');
  });
});

describe('call copilot: numbers', () => {
  it('reads spoken Chinese amounts', () => {
    expect(parseZhNumber('两万五')).toBe(25000);
    expect(parseZhNumber('一万二')).toBe(12000);
    expect(parseZhNumber('1.5万')).toBe(15000);
    expect(parseZhNumber('1 万 8')).toBe(18000);
    expect(parseZhNumber('三千五')).toBe(3500);
    expect(parseZhNumber('十二万')).toBe(120000);
    expect(parseZhNumber('两百零五')).toBe(205);
    expect(parseZhNumber('两三')).toBeNull();
  });

  it('reads spoken English amounts', () => {
    expect(parseEnNumber('fifteen hundred')).toBe(1500);
    expect(parseEnNumber('twenty-five')).toBe(25);
    expect(parseEnNumber('8,500')).toBe(8500);
    expect(parseEnNumber('lots')).toBeNull();
  });

  it('formats money for each language', () => {
    expect(formatMoney({ amount: 20000, max: 30000, currency: 'CNY' }, 'zh')).toBe('2–3 万元');
    expect(formatMoney({ amount: 30000, currency: 'CNY', cap: true }, 'zh')).toBe('3 万元以内');
    expect(formatMoney({ amount: 8000, currency: 'CNY', approx: true }, 'zh')).toBe('8000 元左右');
    expect(formatMoney({ amount: 8000, max: 10000, currency: 'USD', approx: true }, 'en')).toBe('about $8,000–10,000');
    expect(formatMoney({ amount: 5000, currency: 'USD', cap: true }, 'en')).toBe('up to $5,000');
  });
});

describe('call copilot: facts in a line', () => {
  it('finds money with currency, ranges and limits', () => {
    expect(find('我们预算大概 3 到 5 万', 'money')).toMatchObject({ amount: 30000, max: 50000, currency: 'CNY', approx: true });
    expect(find('预算就两三万，能做吗？', 'money')).toMatchObject({ amount: 20000, max: 30000 });
    expect(find('预算控制在 3 万以内', 'money')).toMatchObject({ amount: 30000, cap: true });
    expect(find('人家报了 1 万 8', 'money')).toMatchObject({ amount: 18000, text: '1 万 8' });
    expect(find('Our budget is around $8k to $10k', 'money')).toMatchObject({ amount: 8000, max: 10000, currency: 'USD', approx: true });
    expect(find('Another agency quoted us 6,500 dollars.', 'money')).toMatchObject({ amount: 6500, currency: 'USD' });
    expect(find("It's about ten grand, tops.", 'money')).toMatchObject({ amount: 10000 });
    // "这两块" means "these two parts", "3 万个用户" counts people
    expect(find('先做这两块', 'money')).toBeUndefined();
    expect(find('我们有 3 万个用户', 'money')).toBeUndefined();
  });

  it('finds dates, deadlines, meeting times and past dates', () => {
    expect(find('最好下个月底之前能上线', 'date')).toMatchObject({ text: '下个月底', before: true });
    expect(find('那下周三下午三点再聊？', 'date')).toMatchObject({ text: '下周三下午三点', clock: true });
    expect(find('我上周五下的单', 'date')).toMatchObject({ text: '上周五', past: true });
    expect(find('三天前下的单', 'date')).toMatchObject({ text: '三天前', past: true });
    expect(find('we need it live by March 15', 'date')).toMatchObject({ text: 'March 15', before: true });
    expect(find('Can we talk Thursday at 3 pm?', 'date')).toMatchObject({ text: 'Thursday at 3 pm', clock: true });
    expect(find('便宜一点行吗', 'date')).toBeUndefined();
    expect(find('最好下个月 15 号之前能用上', 'date')).toMatchObject({ text: '下个月 15 号', before: true });
  });

  it('finds durations, counts, order numbers, names and companies', () => {
    expect(kinds('大概一个半月能做完吗？')).toEqual(['duration:一个半月']);
    expect(kinds("My order #48213 still hasn't arrived, it's been two weeks!")).toEqual(['order:48213', 'duration:two weeks']);
    expect(kinds('订单号 A20931，说好三天到的')).toEqual(['order:A20931', 'duration:三天']);
    expect(kinds('我是星河科技的王磊，我们有 5 个页面要做。')).toEqual(['org:星河科技', 'name:王磊', 'count:5 个页面']);
    expect(kinds('Hi, this is Dana from Brightline Dental. How much?')).toEqual(['name:Dana', 'org:Brightline Dental']);
    expect(kinds('We have three clinics and about six pages.')).toEqual(['count:three clinics', 'count:six pages']);
  });

  it('does not take a line of work or a place for a name or company', () => {
    expect(kinds('我是做电商的，便宜一点行吗')).toEqual([]);
    expect(kinds('周四我在外面培训')).toEqual(['date:周四']);
    expect(kinds("I'm not sure, I'm calling from Monday's list").filter((k) => /^(name|org)/.test(k))).toEqual([]);
  });

  it('reports positions that match the original text', () => {
    const line = '人家报了 1 万 8，你们是 2 万 6。';
    for (const e of extractEntities(line)) expect(line.slice(e.index, e.index + e.text.length)).toBe(e.text);
  });
});

describe('call copilot: memory and suggestions', () => {
  it('remembers the budget and uses it when they object to the price later', () => {
    const { last } = call('zh', ['我们预算大概 3 万左右。', '这个价格有点贵了，能不能便宜点？']);
    expect(last.heard.primary).toBe('too_expensive');
    expect(last.suggestions[0].uses).toContain('budget');
    expect(last.suggestions[0].text).toContain('您之前说预算是 3 万元左右');

    const en = call('en', ['Our budget is around $5,000.', "Honestly that's a bit pricey."]).last;
    expect(en.suggestions[0].text).toContain('You mentioned a budget of about $5,000');
  });

  it('weaves facts from the same line into the first suggestion', () => {
    const complaint = call('zh', ['订单号 B7720 到现在还没发货，太过分了！']).last;
    expect(complaint.suggestions[0].tactic).toBe('empathise');
    expect(complaint.suggestions[0].text).toContain('B7720');

    const refund = call('en', ["My order #48213 still hasn't arrived.", 'I want a refund.']).last;
    expect(refund.suggestions[0].text).toContain('order 48213');

    const rival = call('zh', ['别家才报 1 万 5，你们怎么这么贵？']).last;
    expect(rival.suggestions.some((s) => s.text.includes('1.5 万元'))).toBe(true);

    const meeting = call('en', ['Can we talk Thursday at 3 pm?']).last;
    expect(meeting.suggestions[0].text).toBe("Great, Thursday at 3 pm it is. I'll send a calendar invite with the points we'll cover.");
  });

  it('gives 2–3 different replies and fresh wording when a topic comes back', () => {
    const first = call('zh', ['多少钱？']).last;
    expect(first.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(first.suggestions.length).toBeLessThanOrEqual(3);
    expect(new Set(first.suggestions.map((s) => s.tactic)).size).toBe(first.suggestions.length);
    const again = call('zh', ['多少钱？', '我就想知道多少钱。']).last;
    expect(again.suggestions[0].id).not.toBe(first.suggestions[0].id);
  });

  it('files money by who quoted it', () => {
    const { memory } = call('zh', ['人家报了 1 万 8，你们是 2 万 6。']);
    expect(memory.facts.otherQuote?.value).toBe('1.8 万元');
    expect(memory.facts.ourQuote?.value).toBe('2.6 万元');
    const en = call('en', ['Another agency quoted us $6,500, and yours is $9,000.']).memory;
    expect(en.facts.otherQuote?.value).toBe('$6,500');
    expect(en.facts.ourQuote?.value).toBe('$9,000');
  });

  it('files dates as a deadline, the next call or an earlier date', () => {
    const { memory } = call('zh', ['我上周五下的单。', '最好下个月底之前能上线。', '我商量一下，周五前给你答复。']);
    expect(memory.facts.since?.value).toBe('上周五');
    expect(memory.facts.deadline?.value).toBe('下个月底');
    expect(memory.facts.meeting?.value).toBe('周五');
  });

  it('only takes prices and meeting times from your own lines', () => {
    let m = emptyMemory();
    m = hear(m, '最好双十一之前能上线。', 'them', 'zh').memory;
    m = hear(m, '我今天下班前把报价发您，周五上午再给您打电话。', 'you', 'zh').memory;
    expect(m.facts.deadline?.value).toBe('双十一');
    expect(m.facts.meeting?.value).toBe('周五上午');
  });

  it('keeps the more precise time when a vaguer one follows', () => {
    let m = emptyMemory();
    m = hear(m, '那就周五上午十点半。', 'you', 'zh').memory;
    m = hear(m, '好，那周五聊。再见！', 'them', 'zh').memory;
    expect(m.facts.meeting?.value).toBe('周五上午十点半');
  });

  it('puts spaces between Chinese and numbers in replies', () => {
    expect(spaceOut('预算是3万元，订单B7720')).toBe('预算是 3 万元，订单 B7720');
  });
});

describe('call copilot: summary', () => {
  it('lists facts in a fixed order and follow-ups from rules', () => {
    const { memory } = call('zh', ['我是林晓。我们预算 3 万左右，最好双十一之前上线。', '太贵了。']);
    const summary = summarize(memory, 'zh', []);
    expect(summary.facts.map((f) => f.key)).toEqual(['name', 'budget', 'deadline']);
    expect(summary.followUps[0]).toBe('今天发一份书面报价，写清范围和价格，附上分两期的方案（对方预算：3 万元左右）');
    expect(summary.followUps[1]).toBe('附一份按「双十一」倒排的计划');
  });

  it('turns a yes after your suggestion into an agreement', () => {
    const turns = [
      { who: 'them' as const, text: 'Can we start small?', entities: [] },
      { who: 'you' as const, text: 'How about a two-week pilot with just sign-ups and reminders?', entities: [] },
      { who: 'them' as const, text: 'Sounds good.', entities: [] },
    ];
    expect(agreedFromTurns(turns, 'en')).toEqual(['They agreed: How about a two-week pilot with just sign-ups and reminders']);
    const zh = [
      { who: 'you' as const, text: '好的。2 万元以内的预算可以做。我建议先把钱花在最要紧的功能上。', entities: [] },
      { who: 'them' as const, text: '行，就按你说的来。', entities: [] },
    ];
    expect(agreedFromTurns(zh, 'zh')).toEqual(['对方同意：2 万元以内的预算可以做']);
    expect(summarize(emptyMemory(), 'en', []).followUps).toEqual(['Send a thank-you note with the main points from today']);
  });
});

describe('call copilot: text and templates', () => {
  it('has the same keys in Chinese and English, with labels for every intent, tactic and fact', () => {
    expect(Object.keys(TEXT.en).sort()).toEqual(Object.keys(TEXT.zh).sort());
    for (const lang of ['zh', 'en'] as const) {
      const T = TEXT[lang];
      for (const i of INTENTS) expect(T.intents[i], `${lang} intent ${i}`).toBeTruthy();
      for (const t of TACTICS) expect(T.tactics[t], `${lang} tactic ${t}`).toBeTruthy();
      for (const k of FACT_KEYS) expect(T.factLabels[k], `${lang} fact ${k}`).toBeTruthy();
      expect(T.examplesList.length).toBe(TEXT.zh.examplesList.length);
    }
  });

  it('has replies for every intent, with unique ids and no empty or unfilled text', () => {
    const ids = new Set<string>();
    const v = { budget: 'B', otherQuote: 'O', deadline: 'D', duration: 'U', count: 'C', meeting: 'M', since: 'S', order: 'R', name: 'N' };
    for (const intent of INTENTS) {
      const list = TEMPLATES[intent];
      expect(list.filter((t) => !t.needs?.length).length, intent).toBeGreaterThanOrEqual(2);
      for (const t of list) {
        expect(ids.has(t.id), t.id).toBe(false);
        ids.add(t.id);
        for (const lang of ['zh', 'en'] as const) {
          const text = t[lang]({ v, fresh: new Set(), quote: 'Q' });
          expect(text.trim().length, `${t.id} ${lang}`).toBeGreaterThan(5);
          expect(text, `${t.id} ${lang}`).not.toMatch(/undefined|\{|\}/);
        }
      }
    }
  });
});
