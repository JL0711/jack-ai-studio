import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

/** Characters the 7-segment font can show; everything else is drawn in the normal font. */
const SEGMENT = /^[0-9.\-: ]+$/;

/** The unlit "8" pattern behind each digit, like a real LED panel. */
const ghostOf = (s: string) => s.replace(/[0-9]/g, '8').replace(/[-:]/g, (c) => c);

/**
 * An instrument readout: 7-segment digits with unlit segments behind them.
 * When it scrolls into view the display runs a short self-test (all segments,
 * then random digits) and settles on the real value.
 * `parts` lets one readout mix digits and plain text, e.g. ["24", "/", "24"].
 */
export function Readout({ parts, unit, label }: { parts: string[]; unit?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'idle' | 'test' | 'spin' | 'done'>('idle');
  const [noise, setNoise] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setPhase('done');
      return;
    }
    let timers: number[] = [];
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        setPhase('test');
        timers.push(window.setTimeout(() => setPhase('spin'), 380));
        timers.push(window.setTimeout(() => setPhase('done'), 1150));
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(window.clearTimeout);
      timers = [];
    };
  }, []);

  useEffect(() => {
    if (phase !== 'spin') return;
    const id = window.setInterval(() => setNoise((n) => n + 1), 60);
    return () => window.clearInterval(id);
  }, [phase]);

  const show = (part: string, i: number) => {
    if (!SEGMENT.test(part)) return part;
    if (phase === 'test') return ghostOf(part);
    if (phase === 'spin') return part.replace(/[0-9]/g, (_d, k: number) => String((noise * 7 + k * 3 + i * 5) % 10));
    if (phase === 'idle') return part.replace(/[0-9]/g, '0');
    return part;
  };

  return (
    <div ref={ref} className={`readout is-${phase}`}>
      <div className="readout-display" aria-hidden="true">
        {parts.map((part, i) =>
          SEGMENT.test(part) ? (
            <span key={i} className="seg">
              <span className="seg-ghost">{ghostOf(part)}</span>
              <span className="seg-lit">{show(part, i)}</span>
            </span>
          ) : (
            <span key={i} className="seg-sep">
              {part}
            </span>
          ),
        )}
        {unit && <span className="readout-unit">{unit}</span>}
      </div>
      <p className="readout-label">
        <span className="visually-hidden">
          {parts.join('')}
          {unit ? ` ${unit}` : ''}{' '}
        </span>
        {label}
      </p>
    </div>
  );
}
