// Draws one certificate on a canvas. The layout is in quarter millimetres of
// an A4 landscape page (1188 × 840), so the same drawing serves the sharp
// on-screen preview and the 150 dpi PNG/PDF output. Only system fonts: the
// demo downloads nothing.

export const CERT_W = 1188;
export const CERT_H = 840;
/** A4 landscape at 150 dpi. */
export const OUTPUT_W = 1754;
export const OUTPUT_H = 1240;
/** One layout unit (0.25 mm) in points, for telling the visitor font sizes. */
export const UNIT_PT = 72 / 25.4 / 4;

export type ThemeKey = 'jade' | 'navy' | 'crimson';

export interface CertTheme {
  paper: string;
  primary: string;
  gold: string;
  ink: string;
  body: string;
  muted: string;
}

export const THEMES: Record<ThemeKey, CertTheme> = {
  jade: { paper: '#fbf8f0', primary: '#1f5c47', gold: '#b38a3e', ink: '#1d2a33', body: '#3b3a36', muted: '#6e6a60' },
  navy: { paper: '#f8f7f2', primary: '#1f3a5f', gold: '#a8844c', ink: '#16243a', body: '#383a3f', muted: '#666a72' },
  crimson: { paper: '#fcf6ec', primary: '#8e1f22', gold: '#b5893f', ink: '#3a1f1c', body: '#43352f', muted: '#76675c' },
};
export const THEME_KEYS: ThemeKey[] = ['jade', 'navy', 'crimson'];

const SEAL = '#c62f2a';
const SANS =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif';
const SERIF =
  'Georgia, "Times New Roman", "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", "Noto Serif SC", serif';
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

export interface CertContent {
  org: string;
  title: string;
  /** Small line under a Chinese title ("CERTIFICATE OF COMPLETION"); empty for none. */
  subtitle: string;
  intro: string;
  name: string;
  body: string;
  numberLine: string;
  dateLine: string;
  signer: string;
  role: string;
  /** The red "示例 / SAMPLE" tag: these are demo certificates. */
  sampleTag: string;
  sealText: string;
}

export interface DrawResult {
  /** Font size the name was drawn at, and the size it starts from (layout units). */
  nameSize: number;
  nameBaseSize: number;
}

// ---------- text fitting (pure: tested with a fake measure) ----------

/** Largest size from `base` down to `min` at which the text fits `maxWidth`. */
export function fitFontSize(measure: (size: number) => number, maxWidth: number, base: number, min: number): number {
  const w = measure(base);
  if (w <= maxWidth) return base;
  let size = Math.max(min, Math.floor((base * maxWidth) / w));
  while (size > min && measure(size) > maxWidth) size -= 1;
  return size;
}

const NO_LINE_START = /^[，。、；：！？）」』”’,.;:!?)\]]/;

/** Chinese breaks between any two characters, other text between words. */
export function tokenize(text: string): string[] {
  return (
    text.match(
      /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]|[^\s\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]+\s*|\s+/g,
    ) ?? []
  );
}

/** Greedy line breaking; closing punctuation never starts a line. */
export function wrapText(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const tok of tokenize(text)) {
    const next = line + tok;
    if (line.trim() && measure(next.trimEnd()) > maxWidth && !NO_LINE_START.test(tok)) {
      lines.push(line.trimEnd());
      line = tok.trimStart();
    } else line = next;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

/** Wraps into at most `maxLines`, shrinking the font first; an ellipsis only as a last resort. */
export function fitParagraph(
  measure: (s: string, size: number) => number,
  text: string,
  maxWidth: number,
  base: number,
  min: number,
  maxLines: number,
): { size: number; lines: string[] } {
  for (let size = base; size >= min; size--) {
    const lines = wrapText((s) => measure(s, size), text, maxWidth);
    if (lines.length <= maxLines) return { size, lines };
  }
  const lines = wrapText((s) => measure(s, min), text, maxWidth).slice(0, maxLines);
  let last = lines[maxLines - 1] ?? '';
  while (last && measure(`${last}…`, min) > maxWidth) last = Array.from(last).slice(0, -1).join('');
  lines[maxLines - 1] = `${last}…`;
  return { size: min, lines };
}

// ---------- drawing ----------

type Ctx = CanvasRenderingContext2D;

const font = (style: string, size: number, family: string) => `${style} ${size}px ${family}`;

function measureSpaced(ctx: Ctx, text: string, spacing: number): number {
  if (!spacing) return ctx.measureText(text).width;
  const chars = Array.from(text);
  return chars.reduce((w, ch) => w + ctx.measureText(ch).width, 0) + spacing * (chars.length - 1);
}

/** Centered text with letter spacing (drawn character by character, so it works in every browser). */
function drawSpaced(ctx: Ctx, text: string, cx: number, y: number, spacing: number, maxWidth: number): number {
  const width = measureSpaced(ctx, text, spacing);
  ctx.textAlign = 'center';
  if (!spacing || width > maxWidth) {
    ctx.fillText(text, cx, y, maxWidth);
    return Math.min(width, maxWidth);
  }
  ctx.textAlign = 'left';
  let x = cx - width / 2;
  for (const ch of Array.from(text)) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = 'center';
  return width;
}

/** Sets the font at the largest size that fits and returns that size. */
function fitFont(
  ctx: Ctx,
  text: string,
  style: string,
  family: string,
  base: number,
  min: number,
  maxWidth: number,
  spacingEm = 0,
): number {
  const measure = (size: number) => {
    ctx.font = font(style, size, family);
    return measureSpaced(ctx, text, spacingEm * size);
  };
  const size = fitFontSize(measure, maxWidth, base, min);
  ctx.font = font(style, size, family);
  return size;
}

function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function star(ctx: Ctx, cx: number, cy: number, outer: number, inner: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
}

/** Text along the top of a circle, like the name on a round seal. */
function arcText(ctx: Ctx, text: string, radius: number, base: number, family: string) {
  const maxAngle = (Math.PI * 4) / 3;
  let chars = Array.from(text);
  let size = base;
  const gap = 0.12;
  const widthAt = (s: number) => {
    ctx.font = font('700', s, family);
    return chars.reduce((w, ch) => w + ctx.measureText(ch).width + s * gap, 0);
  };
  while (size > 8 && widthAt(size) / radius > maxAngle) size -= 0.5;
  while (chars.length > 1 && widthAt(size) / radius > maxAngle) chars = [...chars.slice(0, -2), '…'];
  const total = widthAt(size) / radius;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let angle = -Math.PI / 2 - total / 2;
  for (const ch of chars) {
    const w = ctx.measureText(ch).width + size * gap;
    const a = angle + w / radius / 2;
    ctx.save();
    ctx.translate(radius * Math.cos(a), radius * Math.sin(a));
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    angle += w / radius;
  }
  ctx.textBaseline = 'alphabetic';
}

function seal(ctx: Ctx, cx: number, cy: number, r: number, org: string, center: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.14);
  ctx.globalAlpha = 0.86;
  ctx.strokeStyle = SEAL;
  ctx.fillStyle = SEAL;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, r - 8, 0, Math.PI * 2);
  ctx.stroke();
  star(ctx, 0, -2, 17, 7);
  ctx.font = font('700', 15, SANS);
  ctx.textAlign = 'center';
  ctx.fillText(center, 0, 36, r * 1.2);
  arcText(ctx, org, r - 22, 14, SANS);
  ctx.restore();
}

/** Draws the whole certificate. `scale` maps layout units to canvas pixels. */
export function drawCertificate(ctx: Ctx, scale: number, c: CertContent, themeKey: ThemeKey): DrawResult {
  const t = THEMES[themeKey];
  const W = CERT_W;
  const H = CERT_H;
  const cx = W / 2;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.lineCap = 'butt';

  // Flat paper: a gradient here would make every PNG several times bigger.
  ctx.fillStyle = t.paper;
  ctx.fillRect(0, 0, W, H);

  // Double gold frame and corner brackets.
  ctx.strokeStyle = t.gold;
  ctx.lineWidth = 3;
  ctx.strokeRect(34, 34, W - 68, H - 68);
  ctx.lineWidth = 1;
  ctx.strokeRect(45, 45, W - 90, H - 90);
  ctx.strokeStyle = t.primary;
  ctx.lineWidth = 5;
  ctx.lineCap = 'square';
  const arm = 60;
  const ins = 62;
  for (const [x, y, dx, dy] of [
    [ins, ins, 1, 1],
    [W - ins, ins, -1, 1],
    [ins, H - ins, 1, -1],
    [W - ins, H - ins, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * arm);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * arm, y);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // "Sample" tag: these certificates come from a demo.
  ctx.font = font('700', 13, SANS);
  const tagW = ctx.measureText(c.sampleTag).width + 18;
  ctx.fillStyle = SEAL;
  ctx.fillRect(80, 80, tagW, 24);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(c.sampleTag, 89, 97);
  ctx.textAlign = 'center';

  // Organisation.
  ctx.fillStyle = t.primary;
  const orgSpacing = CJK.test(c.org) ? 0.3 : 0.16;
  const orgSize = fitFont(ctx, c.org, '600', SANS, 19, 12, 700, orgSpacing);
  drawSpaced(ctx, c.org, cx, 132, orgSpacing * orgSize, 760);

  // Title (a short Chinese title gets wide letter spacing, as printed certificates do).
  const titleCjk = CJK.test(c.title);
  const titleSpacing = titleCjk && Array.from(c.title).length <= 6 ? 0.32 : 0;
  const titleSize = fitFont(ctx, c.title, '700', SERIF, titleCjk ? 70 : 60, 30, 900, titleSpacing);
  ctx.fillStyle = t.primary;
  drawSpaced(ctx, c.title, cx, 222, titleSpacing * titleSize, 900);

  const y = 292;
  if (c.subtitle) {
    ctx.fillStyle = t.gold;
    ctx.font = font('500', 14, SANS);
    drawSpaced(ctx, c.subtitle, cx, 262, 6, 700);
  }
  // Divider with a small diamond.
  ctx.strokeStyle = t.gold;
  ctx.lineWidth = 1.2;
  line(ctx, cx - 140, y, cx - 14, y);
  line(ctx, cx + 14, y, cx + 140, y);
  ctx.fillStyle = t.gold;
  ctx.beginPath();
  ctx.moveTo(cx, y - 6);
  ctx.lineTo(cx + 6, y);
  ctx.lineTo(cx, y + 6);
  ctx.lineTo(cx - 6, y);
  ctx.closePath();
  ctx.fill();

  // "This is to certify that"
  const introCjk = CJK.test(c.intro);
  ctx.fillStyle = t.muted;
  ctx.font = font(introCjk ? '400' : 'italic 400', 22, introCjk ? SANS : SERIF);
  ctx.fillText(c.intro, cx, 350, 800);

  // The name: shrinks until it fits. Short Chinese names are spaced out.
  const name = fitName(ctx, c.name);
  ctx.fillStyle = t.ink;
  const nameW = drawSpaced(ctx, c.name, cx, 442, name.spacing * name.size, NAME_MAX);
  ctx.strokeStyle = t.gold;
  ctx.lineWidth = 1.5;
  const underline = Math.max(nameW + 100, 440);
  line(ctx, cx - underline / 2, 468, cx + underline / 2, 468);

  // What they completed: up to two lines.
  const bodyCjk = CJK.test(c.body);
  const bodyFamily = bodyCjk ? SANS : SERIF;
  const body = fitParagraph(
    (s, size) => {
      ctx.font = font('400', size, bodyFamily);
      return ctx.measureText(s).width;
    },
    c.body,
    880,
    23,
    16,
    2,
  );
  ctx.font = font('400', body.size, bodyFamily);
  ctx.fillStyle = t.body;
  const bodyTop = body.lines.length > 1 ? 516 : 528;
  body.lines.forEach((l, i) => ctx.fillText(l, cx, bodyTop + i * body.size * 1.6, 900));

  // Number and date, bottom left.
  ctx.textAlign = 'left';
  ctx.fillStyle = t.muted;
  ctx.font = font('400', 17, SANS);
  ctx.fillText(c.numberLine, 132, 680, 400);
  ctx.fillText(c.dateLine, 132, 712, 400);

  // Signature.
  const sigX = 716;
  ctx.textAlign = 'center';
  ctx.fillStyle = t.ink;
  const signerCjk = CJK.test(c.signer);
  fitFont(ctx, c.signer, signerCjk ? '400' : 'italic 400', SERIF, 30, 16, 240);
  ctx.fillText(c.signer, sigX, 674, 250);
  ctx.strokeStyle = t.muted;
  ctx.lineWidth = 1;
  line(ctx, sigX - 125, 690, sigX + 125, 690);
  ctx.fillStyle = t.muted;
  fitFont(ctx, c.role, '400', SANS, 16, 11, 260);
  ctx.fillText(c.role, sigX, 716, 270);

  seal(ctx, 968, 664, 76, c.org, c.sealText);
  ctx.restore();
  return { nameSize: name.size, nameBaseSize: name.base };
}

const NAME_MAX = 780;

/**
 * Sets the font for a name at the size it will be printed and returns that
 * size. Also used on its own to flag, in the list, the names that will shrink.
 */
export function fitName(ctx: Ctx, text: string): { size: number; base: number; spacing: number } {
  const cjk = CJK.test(text);
  const len = Array.from(text).length;
  const spacing = cjk ? (len <= 2 ? 0.6 : len === 3 ? 0.3 : 0.05) : 0;
  const base = cjk ? 68 : 66;
  const size = fitFont(ctx, text, cjk ? '700' : 'italic 700', SERIF, base, 26, NAME_MAX, spacing);
  return { size, base, spacing };
}
