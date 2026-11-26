// Build helpers used by vite.config.ts. Plain JS on purpose: they need Node APIs,
// and the app's TypeScript config only knows about the browser.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import subsetFont from 'subset-font';

// ── Pixel font ────────────────────────────────────────────────────────────
// Labels use Fusion Pixel (OFL, see fonts/fusion-pixel/). The full Chinese font
// is about 700 KB, so every build and dev start cuts it down to the characters
// that appear in src/ (about 20 KB). Text added later gets its glyphs on the
// next save (dev) or build.
const PIXEL_SOURCE = 'fonts/fusion-pixel/fusion-pixel-12px-proportional-zh_hans.otf.woff2';
export const PIXEL_OUTPUT = 'src/assets/generated/pixel-subset.woff2';

// Text that is never drawn in the pixel font stays out of the subset, so the font
// every page preloads doesn't grow with it: the estimate engine's sentences
// (src/ai), tests, and the demos' sample data (in src/demos only the UI files —
// *.tsx, *.css, text.ts and registry.ts — are scanned).
function scanned(full) {
  const rel = path.relative('src', full).split(path.sep).join('/');
  if (rel.startsWith('ai/') || rel.startsWith('__tests__/')) return false;
  if (rel.startsWith('demos/')) return /(^|\/)(text|registry)\.ts$|\.(tsx|css)$/.test(rel);
  return true;
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(full);
    return /\.(tsx?|css)$/.test(entry.name) && scanned(full) ? [full] : [];
  });
}

/** Every character used anywhere in src/, plus all printable ASCII. */
function usedCharacters() {
  const chars = new Set();
  for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
  for (const file of sourceFiles('src')) {
    for (const ch of fs.readFileSync(file, 'utf8')) if ((ch.codePointAt(0) ?? 0) >= 0x20) chars.add(ch);
  }
  return [...chars].sort().join('');
}

/** Vite plugin: writes the pixel-font subset before anything imports it. */
export function pixelFontSubset() {
  let last = '';
  const generate = async () => {
    const text = usedCharacters();
    if (text === last && fs.existsSync(PIXEL_OUTPUT)) return;
    last = text;
    const font = await subsetFont(fs.readFileSync(PIXEL_SOURCE), text, { targetFormat: 'woff2' });
    fs.mkdirSync(path.dirname(PIXEL_OUTPUT), { recursive: true });
    fs.writeFileSync(PIXEL_OUTPUT, font);
  };
  return {
    name: 'pixel-font-subset',
    enforce: 'pre',
    async buildStart() {
      if (!process.env.VITEST) await generate();
    },
    async handleHotUpdate({ file }) {
      if (/[\\/]src[\\/](?!assets[\\/]generated).*\.(tsx?|css)$/.test(file)) await generate();
    },
  };
}

// ── Font preloads ──────────────────────────────────────────────────────────
// Fonts are normally requested only once the page has rendered text that uses
// them. On a slow phone that is a second later, and when they arrive the text
// reflows: the status line above the headline drops from two lines to one and
// everything below jumps. Preloading the small fonts the first screen needs
// starts them together with the script, so they are ready before the first render.
/** Vite plugin: <link rel="preload"> for built font files whose names match `patterns`. */
export function preloadFonts(patterns) {
  return {
    name: 'preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((file) => patterns.some((p) => p.test(file)));
        // crossorigin: fonts are always fetched in CORS mode; without it the preload is wasted.
        return files.map((file) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `./${file}`, crossorigin: '' },
          injectTo: 'head',
        }));
      },
    },
  };
}

// ── Build stamp shown in the footer ──────────────────────────────────────
export function buildStamp() {
  let sha = 'dev';
  if (process.env.GITHUB_SHA) sha = process.env.GITHUB_SHA.slice(0, 7);
  else {
    try {
      sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      /* not a git checkout */
    }
  }
  return { sha, date: new Date().toISOString().slice(0, 10) };
}
