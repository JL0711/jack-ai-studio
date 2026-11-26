import { afterEach, describe, expect, it, vi } from 'vitest';
import { understand } from '../ai/nlu';
import { STATE_VERSION } from '../ai/version';
import { formBrief } from '../assistant/refine';
import {
  getAssistant,
  markSent,
  pushAssistantText,
  recalcInPlace,
  resetAssistant,
  sendText,
  start,
  type AssistantMessage,
} from '../assistant/store';

// The store runs in plain Node here: no sessionStorage (saving is skipped) and no
// reduced-motion setting, so replies with a trace take their ~1 s "working it out" pause.
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
async function untilBusy() {
  for (let i = 0; i < 400 && !getAssistant().busy; i++) await tick();
  expect(getAssistant().busy).toBe(true);
}
const texts = () => getAssistant().messages.map((m) => (m.role === 'user' ? `U:${m.text}` : `A:${m.turn.blocks.map((b) => b.t).join('+')}`));
const lastAssistant = () => [...getAssistant().messages].reverse().find((m): m is AssistantMessage => m.role === 'assistant');

describe('assistant store: replies in order', () => {
  it('a reset while a reply is being worked out drops that reply and everything queued before the reset', async () => {
    resetAssistant();
    await start('en');
    const first = sendText('I need a company website with a blog', 'en');
    const queued = sendText('Add online payments with Stripe too', 'en');
    await untilBusy();
    resetAssistant(); // what "New chat" does, then it greets again
    const greet = start('en');
    await Promise.all([first, queued, greet]);
    const { messages, state, busy, thinking } = getAssistant();
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    expect(state?.estimates).toBe(0);
    expect(busy).toBe(false);
    expect(thinking).toBeNull();
  }, 10000);

  it('keeps a message added while a reply is being worked out ("sent!"), and the sent flag', async () => {
    resetAssistant();
    await start('en');
    await sendText('I need a company website', 'en');
    const reply = sendText('Add online payments with Stripe too', 'en');
    await untilBusy();
    markSent();
    pushAssistantText('**Sent to Jack!**', 'en');
    await reply;
    expect(texts().slice(-3)).toEqual(['U:Add online payments with Stripe too', 'A:text', expect.stringContaining('estimate')]);
    expect(getAssistant().state?.sent).toBe(true);
  }, 10000);

  it('recalculating in place keeps the message id (the card stays mounted, focus stays on the chip)', async () => {
    resetAssistant();
    await start('en');
    await sendText('I need a company website', 'en');
    const before = lastAssistant();
    const count = getAssistant().messages.length;
    await recalcInPlace({ t: 'toggle', feature: 'cms', on: true }, 'en');
    const after = lastAssistant();
    expect(getAssistant().messages).toHaveLength(count);
    expect(after?.id).toBe(before?.id);
    expect(after?.turn).not.toBe(before?.turn);
    expect(after?.fresh).toBe(true);
    expect(getAssistant().state?.req.features.cms).toBe(true);
  }, 10000);
});

describe('assistant store: saved chats', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function storageWith(value: unknown) {
    const items = new Map<string, string>([['studio-assistant-v1', JSON.stringify(value)]]);
    return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k) };
  }
  const saved = (v: number) => ({
    v: 1,
    messages: [{ id: 'a', role: 'user', text: 'hello', at: 1 }],
    state: { v, lang: 'en' },
    from: '/contact',
  });

  it('restores a chat saved by this engine version', async () => {
    vi.stubGlobal('sessionStorage', storageWith(saved(STATE_VERSION)));
    vi.resetModules();
    const store = await import('../assistant/store');
    expect(store.getAssistant().messages).toHaveLength(1);
    expect(store.getAssistant().from).toBe('/contact');
  });

  it('starts fresh instead of restoring a chat saved by another engine version', async () => {
    vi.stubGlobal('sessionStorage', storageWith(saved(STATE_VERSION - 1)));
    vi.resetModules();
    const store = await import('../assistant/store');
    expect(store.getAssistant().messages).toHaveLength(0);
    expect(store.getAssistant().state).toBeNull();
  });
});

describe('contact form → estimate chat', () => {
  it('writes the picked type and budget in front of the message, so the chat reads them', () => {
    const msg = 'Hi Jack, we need help processing our monthly supplier invoices, around 200 a month. Can you help?';
    const en = formBrief(msg, 'automation', '500_2000', 'zh');
    expect(en.req.kind).toBe('automation');
    expect(en.chatText).toBe(`Project type: Automation script / workflow; Budget: $500–2,000\n${msg}`);
    const read = understand(en.chatText);
    expect(read.kind).toBe('automation');
    expect(read.budget?.money).toMatchObject({ min: 500, max: 2000, currency: 'USD' });

    const zh = formBrief('我们每个月要整理很多供应商发票，想省点时间', 'automation', 'under_500', 'en');
    expect(zh.chatText.startsWith('项目类型：自动化脚本 / 工作流；预算：500 美元以下\n')).toBe(true);
    const readZh = understand(zh.chatText);
    expect(readZh.kind).toBe('automation');
    expect(readZh.budget?.money).toMatchObject({ max: 500, currency: 'USD' });
  });

  it('adds nothing the message already says', () => {
    const msg = 'I need a company website for my bakery, budget $1,500';
    expect(formBrief(msg, 'web', '500_2000', 'en').chatText).toBe(msg);
    expect(formBrief(msg, 'other', null, 'en').chatText).toBe(msg);
  });
});
