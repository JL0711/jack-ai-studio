import { describe, expect, it } from 'vitest';
import { CHAT_STRINGS, chatT } from '../assistant/strings';

describe('chat strings', () => {
  it('has the same non-empty keys in Chinese and English', () => {
    expect(Object.keys(CHAT_STRINGS.en).sort()).toEqual(Object.keys(CHAT_STRINGS.zh).sort());
    for (const lang of ['zh', 'en'] as const) {
      for (const [k, v] of Object.entries(CHAT_STRINGS[lang])) expect(v, `${lang}:${k}`).not.toBe('');
    }
  });
  it('fills placeholders', () => {
    expect(chatT('en', 'est.firstDay', { a: 3, b: 5 })).toBe('Day 3–5');
    expect(chatT('zh', 'est.firstDay', { a: 3, b: 5 })).toBe('第 3–5 天');
  });
});
