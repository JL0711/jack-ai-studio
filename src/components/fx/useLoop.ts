import { useEffect, useState } from 'react';

/**
 * Milliseconds into a looping timeline of `duration` ms. Only ticks while `playing`
 * (about 30 times a second), so off-screen or inactive animations cost nothing.
 * `restartKey` starts the loop over (for example when the language changes).
 */
export function useLoop(duration: number, playing: boolean, restartKey: unknown = 0): number {
  const [t, setT] = useState(0);

  useEffect(() => setT(0), [restartKey]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      acc += dt;
      if (acc >= 33) {
        const step = acc;
        acc = 0;
        setT((v) => (v + step) % duration);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  return t;
}

/** 0 → 1 between `from` and `to` (ms), clamped. */
export function phase(t: number, from: number, to: number): number {
  if (t <= from) return 0;
  if (t >= to) return 1;
  return (t - from) / (to - from);
}
