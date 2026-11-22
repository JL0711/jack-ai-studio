import { useEffect, useState } from 'react';
import { prefersReducedMotion, useInView } from '../../lib/motion';

/** A number that counts up from 0 the first time it scrolls into view. */
export function CountUp({
  to,
  prefix = '',
  suffix = '',
  duration = 1700,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const [value, setValue] = useState(() => (prefersReducedMotion() ? to : 0));

  useEffect(() => {
    if (!inView) return;
    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(Math.round(to * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return (
    <span ref={ref} className="count-up">
      <span className="visually-hidden">{`${prefix}${to}${suffix}`}</span>
      <span aria-hidden="true">
        {prefix}
        {value}
        {suffix}
      </span>
    </span>
  );
}
