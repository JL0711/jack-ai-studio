import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}
interface Pulse {
  from: number;
  to: number;
  t: number;
  speed: number;
  hops: number;
}

const LINK = 132; // px: nodes closer than this are joined by a line
const POINTER_LINK = 175;
const POINTER_PUSH = 95;

function readRgb(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  return v.split(/[\s,]+/).join(', ');
}

/**
 * Decorative "neural network" behind the home hero: drifting nodes, links between
 * near neighbours, signals hopping along the links, and links to the mouse.
 * Pauses when off screen or in a hidden tab; draws one still frame with reduced motion.
 */
export function NeuralField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduced = prefersReducedMotion();
    let w = 0;
    let h = 0;
    let nodes: Node[] = [];
    const pulses: Pulse[] = [];
    let nodeRgb = '';
    let lineRgb = '';
    const pointer = { x: 0, y: 0, active: false };
    let raf = 0;
    let running = false;
    let onScreen = true;

    const readColors = () => {
      nodeRgb = readRgb('--fx-node-rgb', '13 110 90');
      lineRgb = readRgb('--fx-line-rgb', '14 116 144');
    };

    const makeNode = (): Node => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: 0.9 + Math.random() * 1.7,
    });
    /** Keeps the density steady when the hero changes size: adds or drops nodes. */
    const fit = () => {
      const count = Math.round(Math.min(110, Math.max(26, (w * h) / 11000)));
      while (nodes.length < count) nodes.push(makeNode());
      if (nodes.length > count) {
        nodes.length = count;
        pulses.length = 0;
      }
    };

    const near = (i: number): number[] => {
      const a = nodes[i];
      const out: number[] = [];
      for (let j = 0; j < nodes.length; j++) {
        if (j === i) continue;
        const b = nodes[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < LINK * 0.92) out.push(j);
      }
      return out;
    };

    const spawn = (from: number, hops = 0) => {
      if (!nodes[from]) return;
      const options = near(from);
      if (!options.length) return;
      pulses.push({
        from,
        to: options[Math.floor(Math.random() * options.length)],
        t: 0,
        speed: 0.014 + Math.random() * 0.014,
        hops,
      });
    };

    // Lines are grouped into a few opacity levels so each frame is a handful of
    // stroke() calls instead of hundreds.
    const LEVELS = 5;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      const links = Array.from({ length: LEVELS }, () => new Path2D());
      const toPointer = new Path2D();
      const dots = new Path2D();
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK * LINK) continue;
          const level = Math.min(LEVELS - 1, Math.floor((1 - Math.sqrt(d2) / LINK) * LEVELS));
          links[level].moveTo(a.x, a.y);
          links[level].lineTo(b.x, b.y);
        }
        if (pointer.active && Math.hypot(a.x - pointer.x, a.y - pointer.y) < POINTER_LINK) {
          toPointer.moveTo(a.x, a.y);
          toPointer.lineTo(pointer.x, pointer.y);
        }
        dots.moveTo(a.x + a.r, a.y);
        dots.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      }
      for (let level = 0; level < LEVELS; level++) {
        ctx.strokeStyle = `rgba(${lineRgb}, ${(((level + 0.5) / LEVELS) * 0.32).toFixed(3)})`;
        ctx.stroke(links[level]);
      }
      if (pointer.active) {
        ctx.strokeStyle = `rgba(${nodeRgb}, 0.35)`;
        ctx.stroke(toPointer);
      }
      ctx.fillStyle = `rgba(${nodeRgb}, 0.8)`;
      ctx.fill(dots);
      for (const p of pulses) {
        const a = nodes[p.from];
        const b = nodes[p.to];
        if (!a || !b) continue;
        const x = a.x + (b.x - a.x) * p.t;
        const y = a.y + (b.y - a.y) * p.t;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, `rgba(${lineRgb}, 0.95)`);
        g.addColorStop(1, `rgba(${lineRgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - 9, y - 9, 18, 18);
      }
      if (pointer.active) {
        const g = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 60);
        g.addColorStop(0, `rgba(${nodeRgb}, 0.18)`);
        g.addColorStop(1, `rgba(${nodeRgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(pointer.x - 60, pointer.y - 60, 120, 120);
      }
    };

    const step = () => {
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (pointer.active) {
          const dx = n.x - pointer.x;
          const dy = n.y - pointer.y;
          const d = Math.hypot(dx, dy);
          if (d > 1 && d < POINTER_PUSH) {
            const f = (1 - d / POINTER_PUSH) * 0.9;
            n.x += (dx / d) * f;
            n.y += (dy / d) * f;
          }
        }
        if (n.x < -20) n.x = w + 20;
        else if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        else if (n.y > h + 20) n.y = -20;
      }
      for (let k = pulses.length - 1; k >= 0; k--) {
        const p = pulses[k];
        p.t += p.speed;
        const a = nodes[p.from];
        const b = nodes[p.to];
        const broken = !a || !b || Math.hypot(a.x - b.x, a.y - b.y) > LINK;
        if (p.t >= 1 || broken) {
          pulses.splice(k, 1);
          // A signal that arrives hops on to a neighbour, a few times.
          if (!broken && p.hops < 7) spawn(p.to, p.hops + 1);
        }
      }
      if (pulses.length < 5 && Math.random() < 0.025) spawn(Math.floor(Math.random() * nodes.length));
    };

    const frame = () => {
      step();
      draw();
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (running || reduced || !onScreen || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const nw = Math.max(1, Math.round(rect.width));
      const nh = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (w && h) {
        for (const n of nodes) {
          n.x *= nw / w;
          n.y *= nh / h;
        }
      }
      w = nw;
      h = nh;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fit();
      if (!running) draw();
    };

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= rect.width && pointer.y <= rect.height;
    };
    const onLeave = () => {
      pointer.active = false;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onTheme = () => {
      readColors();
      if (!running) draw();
    };

    readColors();
    resize();
    start();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    io.observe(canvas);
    const mo = new MutationObserver(onTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener?.('change', onTheme);
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      scheme.removeEventListener?.('change', onTheme);
      window.removeEventListener('pointermove', onPointer);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="neural-field" aria-hidden="true" />;
}
