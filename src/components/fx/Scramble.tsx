import { useEffect, useRef, useState } from 'react';
import { allowsTextScramble } from '../../lib/motion';

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/';
// Chinese positions get full-width symbols, never real characters: random Chinese
// characters read as garbled text (乱码), not as a decoding effect. Full-width keeps
// every character the same width, so the line doesn't shift while it decodes.
const CJK = '＃＊＋＝％＆／＜＞＠～';
const isCjk = (ch: string) => /[㐀-鿿豈-﫿]/.test(ch);

/** The stand-in shown for one character while it is still "encoded". Exported for tests. */
export function randomFor(ch: string): string {
  if (/\s/.test(ch) || /[，。、：；！？,.:;!?·—\-()（）]/.test(ch)) return ch;
  const pool = isCjk(ch) ? CJK : LATIN;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Text that "decodes" from random characters into the real text, left to right.
 * Starts when it scrolls into view (or when `trigger` changes). The final text
 * keeps its place in the layout the whole time, so nothing around it jumps.
 * Only on a wide screen with a mouse (see allowsTextScramble): phones, screen
 * readers and reduced-motion visitors get the plain text.
 */
export function Scramble({
  text,
  duration = 900,
  delay = 0,
  trigger,
  className,
}: {
  text: string;
  duration?: number;
  delay?: number;
  /** Change this to play the effect again. */
  trigger?: unknown;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // No effect at all: `seen` stays false, so only the plain text is ever shown.
    if (!el || !allowsTextScramble() || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!seen || !allowsTextScramble()) {
      setShown(null);
      return;
    }
    const chars = Array.from(text);
    let raf = 0;
    let start = 0;
    let lastSwap = 0;
    let noise = chars.map(randomFor);
    const frame = (now: number) => {
      if (!start) start = now + delay;
      const p = Math.max(0, (now - start) / duration);
      if (now - lastSwap > 55) {
        noise = chars.map(randomFor);
        lastSwap = now;
      }
      const solved = Math.floor(p * chars.length * 1.15 - 0.15 * chars.length);
      if (p >= 1) {
        setShown(null);
        return;
      }
      setShown(chars.map((c, i) => (i < solved ? c : noise[i])).join(''));
      raf = requestAnimationFrame(frame);
    };
    setShown(chars.map(randomFor).join(''));
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [seen, text, duration, delay, trigger]);

  return (
    <span ref={ref} className={`scramble${shown !== null ? ' is-running' : ''}${className ? ` ${className}` : ''}`}>
      <span className="scramble-final">{text}</span>
      {shown !== null && (
        <span className="scramble-live" aria-hidden="true">
          {shown}
        </span>
      )}
    </span>
  );
}
