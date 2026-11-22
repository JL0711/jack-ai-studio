import { useEffect, useRef } from 'react';
import { hasFinePointer, prefersReducedMotion } from '../../lib/motion';

const MAX_TILT = 7; // degrees
const MAGNET = 7; // px

/**
 * Site-wide effects, set up once:
 *  - a thin reading-progress bar and `is-scrolled` on <html> (the header turns to glass);
 *  - a soft glow that follows the mouse;
 *  - pointer effects for any element with data-fx: "spot" (light follows the mouse),
 *    "tilt" (3D tilt toward the mouse), "magnet" (leans toward the mouse).
 * Pointer effects are off on touch screens and with reduced motion.
 */
export function GlobalFx() {
  const barRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;
      doc.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // Page height changes as content loads; re-measure now and then.
    const ro = new ResizeObserver(onScroll);
    ro.observe(document.body);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!hasFinePointer() || prefersReducedMotion()) return;
    document.documentElement.classList.add('fx-pointer');
    let raf = 0;
    let last: PointerEvent | null = null;
    let current: HTMLElement | null = null;

    const reset = (el: HTMLElement) => {
      el.classList.remove('fx-hover');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      el.style.setProperty('--tx', '0px');
      el.style.setProperty('--ty', '0px');
    };

    const apply = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const glow = glowRef.current;
      if (glow) {
        glow.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
        glow.style.opacity = '1';
      }
      const target = e.target instanceof Element ? (e.target.closest('[data-fx]') as HTMLElement | null) : null;
      if (current && current !== target) reset(current);
      current = target;
      if (!target) return;
      const r = target.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const px = r.width ? x / r.width - 0.5 : 0;
      const py = r.height ? y / r.height - 0.5 : 0;
      const fx = target.dataset.fx ?? '';
      target.classList.add('fx-hover');
      target.style.setProperty('--mx', `${x}px`);
      target.style.setProperty('--my', `${y}px`);
      if (fx.includes('tilt')) {
        target.style.setProperty('--rx', `${(-py * MAX_TILT).toFixed(2)}deg`);
        target.style.setProperty('--ry', `${(px * MAX_TILT).toFixed(2)}deg`);
      }
      if (fx.includes('magnet')) {
        target.style.setProperty('--tx', `${(px * MAGNET * 2).toFixed(1)}px`);
        target.style.setProperty('--ty', `${(py * MAGNET * 2).toFixed(1)}px`);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      last = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      if (current) reset(current);
      current = null;
      if (glowRef.current) glowRef.current.style.opacity = '0';
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.documentElement.classList.remove('fx-pointer');
    };
  }, []);

  return (
    <>
      <div className="scroll-progress" ref={barRef} aria-hidden="true" />
      <div className="cursor-glow" ref={glowRef} aria-hidden="true" />
    </>
  );
}
