import { useEffect, useRef, useState } from 'react';

/** True when the visitor asked the OS for less motion. Every effect checks this. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** True on a device with a mouse or trackpad (hover effects make no sense on touch). */
export function hasFinePointer(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
}

/**
 * True only with a mouse or trackpad on a wide screen (and motion allowed). The text
 * "decode" effect runs only there: on a phone the random characters read as garbled
 * text (乱码), and a phone that is still busy loading stretches the effect to seconds.
 */
export function allowsTextScramble(): boolean {
  return !prefersReducedMotion() && hasFinePointer() && !!window.matchMedia?.('(min-width: 980px)').matches;
}

/** Tracks a CSS media query. */
export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return match;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

// One shared observer for every "show once when scrolled into view" element.
type Callback = () => void;
let onceObserver: IntersectionObserver | null = null;
const onceCallbacks = new Map<Element, Callback>();

function getOnceObserver(): IntersectionObserver {
  if (!onceObserver) {
    onceObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const cb = onceCallbacks.get(entry.target);
          onceCallbacks.delete(entry.target);
          onceObserver?.unobserve(entry.target);
          cb?.();
        }
      },
      // Fire when the top of the element is a little above the bottom edge.
      { rootMargin: '0px 0px -8% 0px', threshold: 0 },
    );
  }
  return onceObserver;
}

function whenVisible(el: Element, cb: Callback): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    cb();
    return () => undefined;
  }
  onceCallbacks.set(el, cb);
  getOnceObserver().observe(el);
  return () => {
    onceCallbacks.delete(el);
    onceObserver?.unobserve(el);
  };
}

/** `inView` turns true the first time the element scrolls into view (at once with reduced motion). */
export function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setInView(true);
      return;
    }
    return whenVisible(el, () => setInView(true));
  }, []);
  return { ref, inView };
}

/** Class names for a scroll-reveal element: `reveal` plus `is-visible` once seen. */
export function revealClass(inView: boolean, extra = ''): string {
  return `${extra ? `${extra} ` : ''}reveal${inView ? ' is-visible' : ''}`;
}

/** Like useInView, but keeps tracking: true while on screen and the tab is visible. */
export function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setOnScreen(true);
      return;
    }
    let intersecting = false;
    const update = () => setOnScreen(intersecting && !document.hidden);
    const io = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      update();
    });
    io.observe(el);
    document.addEventListener('visibilitychange', update);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return { ref, onScreen };
}

/** Class names for a group whose children reveal one after another. */
export function groupClass(inView: boolean, extra = ''): string {
  return `${extra ? `${extra} ` : ''}reveal-group${inView ? ' is-visible' : ''}`;
}
