import { afterEach, describe, expect, it } from 'vitest';
import { randomFor } from '../components/fx/Scramble';
import { allowsTextScramble } from '../lib/motion';

const HAN = /[㐀-鿿豈-﫿]/;

describe('text decode effect', () => {
  it('never shows real Chinese characters while decoding (they read as garbled text)', () => {
    for (const ch of '数据不出门的和真正上线的软件我能帮你做的事') {
      for (let i = 0; i < 50; i++) {
        const out = randomFor(ch);
        expect(out).not.toMatch(HAN);
        // Full-width, so the line keeps its width while it decodes.
        expect(out.codePointAt(0)).toBeGreaterThanOrEqual(0xff00);
      }
    }
  });

  it('keeps spaces and punctuation in place', () => {
    for (const ch of ' ，。、：；！？,.:;!?·—-()（）') expect(randomFor(ch)).toBe(ch);
  });

  it('uses ASCII noise for Latin letters', () => {
    for (let i = 0; i < 50; i++) expect(randomFor('A')).toMatch(/^[A-Z0-9#%&*+=<>/]$/);
  });
});

describe('where the decode effect runs', () => {
  const realWindow = globalThis.window;
  afterEach(() => {
    globalThis.window = realWindow;
  });

  function fakeWindow(matching: string[]) {
    globalThis.window = {
      matchMedia: (q: string) => ({ matches: matching.includes(q) }),
    } as unknown as Window & typeof globalThis;
  }

  const MOUSE = '(hover: hover) and (pointer: fine)';
  const WIDE = '(min-width: 980px)';
  const REDUCED = '(prefers-reduced-motion: reduce)';

  it('runs on a wide screen with a mouse', () => {
    fakeWindow([MOUSE, WIDE]);
    expect(allowsTextScramble()).toBe(true);
  });

  it('does not run on a phone or tablet (touch)', () => {
    fakeWindow([WIDE]);
    expect(allowsTextScramble()).toBe(false);
    fakeWindow([]);
    expect(allowsTextScramble()).toBe(false);
  });

  it('does not run in a narrow window', () => {
    fakeWindow([MOUSE]);
    expect(allowsTextScramble()).toBe(false);
  });

  it('does not run when the visitor asked for less motion', () => {
    fakeWindow([MOUSE, WIDE, REDUCED]);
    expect(allowsTextScramble()).toBe(false);
  });
});
