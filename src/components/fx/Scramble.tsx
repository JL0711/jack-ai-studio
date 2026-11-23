import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/';
const CJK = '数据模型本地检索生成文档网页脚本自动化部署测试代码终端信号';
const isCjk = (ch: string) => /[㐀-鿿豈-﫿]/.test(ch);

function randomFor(ch: string): string {
  if (/\s/.test(ch) || /[，。、：；！？,.:;!?·—\-()（）]/.test(ch)) return ch;
  const pool = isCjk(ch) ? CJK : LATIN;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Text that "decodes" from random characters into the real text, left to right.
 * Starts when it scrolls into view (or when `trigger` changes). The final text
 * keeps its place in the layout the whole time, so nothing around it jumps.
 * Screen readers and reduced-motion visitors get the plain text.
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
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
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
    if (!seen || prefersReducedMotion()) {
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
