import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

/*
 * The hero figure: a graphics card (the RTX 5070 Ti workstation the local models
 * run on), ray-marched on the GPU and printed as ASCII characters, live.
 *
 * Pass 1 ray-marches a signed-distance model of the card into a tiny texture with
 * one texel per character cell (brightness + "accent" flag).
 * Pass 2 draws the full-size canvas: each cell looks up its brightness and draws
 * the matching glyph from a font atlas. The mouse is a "decoder lens" that
 * scrambles the characters under it.
 *
 * No libraries; WebGL2 only. Without WebGL2 the figure is simply left out.
 */

const RAMP = ' .:-=+*#%@';
const NOISE = '01<>/[]{}#$&?ABCDEF';
const CELL_W = 8;
const CELL_H = 12;

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const SCENE_FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uAspect;
uniform float uZoom;
uniform float uYaw;
uniform float uPitch;
uniform float uFan;
uniform float uLed;
out vec4 outColor;

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }

float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdRBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float sdCylZ(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xy), p.z)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

const float FAN_STEP = 0.98;
const float FAN_R = 0.44;

vec3 fanLocal(vec3 p) {
  float cx = clamp(floor(p.x / FAN_STEP + 0.5), -1.0, 1.0) * FAN_STEP;
  return vec3(p.x - cx, p.y, p.z);
}

// x: distance, y: material (1 shroud, 2 blade, 3 hub, 4 plate, 5 bracket, 6 gold, 7 led)
vec2 map(vec3 p) {
  vec3 fp = fanLocal(p);
  float shroud = sdRBox(p, vec3(1.5, 0.56, 0.17), 0.05);
  float hole = sdCylZ(fp - vec3(0.0, 0.0, 0.17), FAN_R, 0.1);
  shroud = max(shroud, -hole);
  vec2 res = vec2(shroud, 1.0);

  float r = length(fp.xy);
  float a = atan(fp.y, fp.x) + uFan;
  float sector = 6.2831853 / 9.0;
  float sa = mod(a + sector * 0.5, sector) - sector * 0.5;
  vec2 v = vec2(cos(sa), sin(sa)) * r;
  v.y += 0.55 * (r - 0.12) * (r - 0.12);
  float pz = fp.z - 0.12;
  vec2 w = vec2(0.85 * v.y - 0.52 * pz, 0.52 * v.y + 0.85 * pz);
  float blade = sdBox(vec3(v.x - 0.28, w.x, w.y), vec3(0.155, 0.072, 0.007)) * 0.7;
  blade = max(blade, r - 0.425);
  float hub = sdCylZ(fp - vec3(0.0, 0.0, 0.125), 0.11, 0.03);
  if (blade < res.x) res = vec2(blade, 2.0);
  if (hub < res.x) res = vec2(hub, 3.0);

  float back = sdBox(p - vec3(0.0, 0.0, -0.205), vec3(1.49, 0.55, 0.014));
  if (back < res.x) res = vec2(back, 4.0);
  float bracket = sdBox(p - vec3(1.6, 0.03, -0.05), vec3(0.013, 0.68, 0.27));
  if (bracket < res.x) res = vec2(bracket, 5.0);
  float pcb = sdBox(p - vec3(-0.15, -0.6, -0.13), vec3(1.25, 0.05, 0.011));
  if (pcb < res.x) res = vec2(pcb, 4.0);
  float gold = sdBox(p - vec3(-0.45, -0.67, -0.13), vec3(0.55, 0.028, 0.012));
  if (gold < res.x) res = vec2(gold, 6.0);
  float led = sdBox(p - vec3(-0.35, 0.567, 0.03), vec3(0.95, 0.008, 0.055));
  if (led < res.x) res = vec2(led, 7.0);
  return res;
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0009;
  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 4; i++) {
    float h = 0.02 + 0.07 * float(i);
    occ += (h - map(p + n * h).x) * sca;
    sca *= 0.75;
  }
  return clamp(1.0 - 2.2 * occ, 0.25, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  uv.x *= uAspect;
  mat3 R = rotY(uYaw) * rotX(uPitch);
  mat3 Ri = transpose(R);
  vec3 ro = Ri * vec3(0.0, 0.0, uZoom);
  vec3 rd = Ri * normalize(vec3(uv * 0.42, -1.0));
  float t = 0.0;
  vec2 h = vec2(1.0, 0.0);
  bool hit = false;
  for (int i = 0; i < 110; i++) {
    h = map(ro + rd * t);
    if (h.x < 0.0015) { hit = true; break; }
    t += h.x * 0.85;
    if (t > uZoom + 4.0) break;
  }
  if (!hit) { outColor = vec4(0.0); return; }
  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p);
  vec3 L1 = Ri * normalize(vec3(-0.55, 0.75, 0.6));
  vec3 L2 = Ri * normalize(vec3(0.9, -0.25, 0.35));
  float dif = max(dot(n, L1), 0.0);
  float fill = max(dot(n, L2), 0.0) * 0.3;
  float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * 0.45;
  float spec = pow(max(dot(reflect(-L1, n), -rd), 0.0), 26.0) * 0.55;
  float lum = (0.06 + dif * 0.78 + fill + rim) * calcAO(p, n) + spec;
  float accent = 0.0;
  float m = h.y;
  if (m < 1.5) {
    vec3 fp = fanLocal(p);
    float r = length(fp.xy);
    if (p.z < 0.1 && r < FAN_R + 0.01) {
      // Dark fan wells, with a hint of heatsink fins.
      lum = 0.05 + 0.16 * dif * step(0.5, fract(p.x * 20.0));
    } else {
      lum *= 0.58;
      // Bright bezel ring around each fan.
      float ring = abs(r - (FAN_R + 0.035));
      if (p.z > 0.15 && ring < 0.03) lum = max(lum, 0.62 + 0.38 * dif);
    }
  } else if (m < 2.5) {
    lum = 0.42 + 0.58 * dif + spec;
  } else if (m < 3.5) {
    accent = 1.0;
    lum = 0.7 + 0.3 * dif;
  } else if (m < 4.5) {
    lum *= 0.55;
  } else if (m < 5.5) {
    lum *= 0.8;
  } else if (m < 6.5) {
    accent = 1.0;
    lum = 0.45 + dif * 0.55;
  } else {
    accent = 1.0;
    lum = 0.55 + 0.45 * uLed;
  }
  outColor = vec4(clamp(lum, 0.0, 1.0), accent, 0.0, 1.0);
}`;

const ASCII_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform vec2 uCanvas;
uniform vec2 uCell;
uniform vec2 uGrid;
uniform float uRamp;
uniform float uNoise;
uniform vec3 uInk;
uniform vec3 uDim;
uniform vec3 uAccent;
uniform vec2 uMouse;
uniform float uLensR;
uniform float uTime;
uniform float uBoot;
uniform float uScan;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 cell = floor(frag / uCell);
  if (cell.x >= uGrid.x || cell.y >= uGrid.y) { outColor = vec4(0.0); return; }
  vec2 inCell = fract(frag / uCell);
  vec4 s = texelFetch(uScene, ivec2(int(cell.x), int(uGrid.y - 1.0 - cell.y)), 0);
  float lum = s.r;
  bool onObject = s.a > 0.5;
  float total = uRamp + uNoise;
  float tick = floor(uTime * 16.0);

  float glyph = 0.0;
  vec3 col = uInk;
  float alpha = 1.0;

  if (onObject) {
    glyph = floor(clamp(lum, 0.0, 1.0) * (uRamp - 1.0) + 0.5);
    glyph = max(glyph, 1.0);
    col = mix(uDim, uInk, smoothstep(0.08, 0.85, lum));
    // A slow scan line that brightens what it passes.
    float band = 1.0 - smoothstep(0.0, 2.2, abs(cell.y - uScan));
    if (band > 0.0) {
      glyph = min(uRamp - 1.0, glyph + floor(band * 2.0 + 0.5));
      col = mix(col, uAccent, band * 0.55);
    }
    if (s.g > 0.5) col = uAccent;
  } else if (hash(cell * 1.31) > 0.988) {
    // Sparse dust in the empty space.
    glyph = 1.0;
    col = uDim;
    alpha = 0.6;
  }

  // Decoder lens under the mouse.
  float dist = length((cell + 0.5 - uMouse) * uCell);
  float lens = 1.0 - smoothstep(uLensR * 0.55, uLensR, dist);
  if (lens > 0.0) {
    float r = hash(cell + tick);
    if (onObject && r < 0.35 + lens * 0.6) {
      glyph = uRamp + floor(hash(cell * 3.7 + tick) * uNoise);
      col = uAccent;
    } else if (!onObject && r < lens * 0.22) {
      glyph = uRamp + floor(hash(cell * 5.3 + tick) * uNoise);
      col = uAccent;
      alpha = 0.45;
    }
  }

  // Boot: rows switch on from the top, led by a band of noise.
  float row = (cell.y + 0.5) / uGrid.y;
  float edge = uBoot * 1.25 - 0.12;
  if (row > edge) {
    alpha = 0.0;
  } else if (row > edge - 0.1 && (onObject || hash(cell + tick) > 0.7)) {
    glyph = uRamp + floor(hash(cell * 7.1 + tick) * uNoise);
    col = uAccent;
  }

  float a = texture(uAtlas, vec2((glyph + inCell.x) / total, inCell.y)).a * alpha;
  outColor = vec4(col * a, a);
}`;

/** Callouts pinned to points on the card (object space). */
export interface AsciiLabel {
  text: string;
  at: [number, number, number];
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('shader');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'compile');
  return sh;
}

function program(gl: WebGL2RenderingContext, frag: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error('program');
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

/** "rgb(1, 2, 3)" or "#rrggbb" → [0..1, 0..1, 0..1], via the browser's own parser. */
function cssColor(name: string, el: HTMLElement): [number, number, number] {
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  probe.style.display = 'none';
  el.appendChild(probe);
  const rgb = getComputedStyle(probe).color.match(/[\d.]+/g)?.map(Number) ?? [200, 200, 200];
  probe.remove();
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
}

async function pixelFontReady(): Promise<boolean> {
  try {
    const timeout = new Promise<FontFace[]>((resolve) => window.setTimeout(() => resolve([]), 1500));
    const faces = await Promise.race([document.fonts.load('12px "Fusion Pixel"'), timeout]);
    return faces.length > 0;
  } catch {
    return false;
  }
}

function buildAtlas(cellW: number, cellH: number, scale: number, pixel: boolean): HTMLCanvasElement {
  const chars = RAMP + NOISE;
  const c = document.createElement('canvas');
  c.width = cellW * chars.length;
  c.height = cellH;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = pixel ? `${12 * scale}px "Fusion Pixel"` : `${Math.round(11 * scale)}px ui-monospace, Menlo, Consolas, monospace`;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], i * cellW + cellW / 2, Math.round(cellH * 0.8));
  }
  return c;
}

const smooth = (from: number, to: number, k: number) => from + (to - from) * k;

export function AsciiGpu({ labels = [], caption }: { labels?: AsciiLabel[]; caption?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [failed, setFailed] = useState(false);
  const [booted, setBooted] = useState(false);
  const labelKey = labels.map((l) => l.text).join('|');

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' });
    if (!gl) {
      setFailed(true);
      return;
    }

    let disposed = false;
    let raf = 0;
    const reduced = prefersReducedMotion();

    let sceneProg: WebGLProgram;
    let asciiProg: WebGLProgram;
    try {
      sceneProg = program(gl, SCENE_FRAG);
      asciiProg = program(gl, ASCII_FRAG);
    } catch (err) {
      console.warn('[ascii] WebGL setup failed', err);
      setFailed(true);
      return;
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const su = (n: string) => gl.getUniformLocation(sceneProg, n);
    const au = (n: string) => gl.getUniformLocation(asciiProg, n);
    const S = {
      res: su('uRes'), aspect: su('uAspect'), zoom: su('uZoom'), yaw: su('uYaw'),
      pitch: su('uPitch'), fan: su('uFan'), led: su('uLed'),
    };
    const A = {
      scene: au('uScene'), atlas: au('uAtlas'), canvas: au('uCanvas'), cell: au('uCell'), grid: au('uGrid'),
      ramp: au('uRamp'), noise: au('uNoise'), ink: au('uInk'), dim: au('uDim'), accent: au('uAccent'),
      mouse: au('uMouse'), lensR: au('uLensR'), time: au('uTime'), boot: au('uBoot'), scan: au('uScan'),
    };

    const sceneTex = gl.createTexture();
    const atlasTex = gl.createTexture();
    const fbo = gl.createFramebuffer();

    let dpr = 1;
    let cssW = 0;
    let cssH = 0;
    let cols = 1;
    let rows = 1;
    let cellW = CELL_W;
    let cellH = CELL_H;
    let colors = { ink: [0.85, 0.84, 0.8], dim: [0.36, 0.37, 0.4], accent: [1, 0.7, 0.14] } as Record<string, number[]>;
    let pixelFont = false;

    const readColors = () => {
      colors = { ink: cssColor('--ascii-ink', wrap), dim: cssColor('--ascii-dim', wrap), accent: cssColor('--accent', wrap) };
    };

    const uploadAtlas = () => {
      const atlas = buildAtlas(cellW, cellH, dpr, pixelFont);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, Math.max(1, Math.round((window.devicePixelRatio || 1) * 2) / 2));
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, rect.height);
      cellW = Math.round(CELL_W * dpr);
      cellH = Math.round(CELL_H * dpr);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      cols = Math.max(1, Math.floor(canvas.width / cellW));
      rows = Math.max(1, Math.floor(canvas.height / cellH));
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      uploadAtlas();
    };

    // Pointer: rotation target and the lens position (in cells).
    const pointer = { x: 0, y: 0, nx: 0, ny: 0, inside: false };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.inside = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= r.width && pointer.y <= r.height;
      pointer.nx = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
      pointer.ny = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1));
    };
    const onLeave = () => {
      pointer.inside = false;
    };

    const state = { yaw: -0.74, pitch: 0.36, fanSpeed: 2.6, fan: 0, lensX: -999, lensY: -999 };
    const flipped: boolean[] = [];
    let start = 0;
    let last = 0;

    // Same camera as the shader, so the callouts can follow points on the card.
    const project = (p: [number, number, number], zoom: number) => {
      const [x0, y0, z0] = p;
      const cp = Math.cos(state.pitch);
      const sp = Math.sin(state.pitch);
      const y1 = cp * y0 - sp * z0;
      const z1 = sp * y0 + cp * z0;
      const cy = Math.cos(state.yaw);
      const sy = Math.sin(state.yaw);
      const x2 = cy * x0 + sy * z1;
      const z2 = -sy * x0 + cy * z1;
      const k = 1 / ((zoom - z2) * 0.42);
      // The character grid can be a fraction of a cell smaller than the canvas.
      const gridW = (cols * cellW) / dpr;
      const gridH = (rows * cellH) / dpr;
      const u = (x2 * k) / (gridW / gridH);
      const v = y1 * k;
      return { x: (u * 0.5 + 0.5) * gridW, y: (0.5 - v * 0.5) * gridH };
    };

    const draw = (now: number) => {
      if (!start) start = now;
      const t = (now - start) / 1000;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      const aspect = (cols * cellW) / (rows * cellH);
      // Pull the camera back on narrow screens so the whole card fits.
      const zoom = 3.75 * Math.max(1, 1.35 / aspect);

      if (!reduced) {
        const yawTarget = -0.74 + 0.16 * Math.sin(t * 0.21) + pointer.nx * 0.3;
        const pitchTarget = 0.36 + 0.05 * Math.sin(t * 0.29) + pointer.ny * 0.14;
        state.yaw = smooth(state.yaw, yawTarget, Math.min(1, dt * 2.4));
        state.pitch = smooth(state.pitch, pitchTarget, Math.min(1, dt * 2.4));
        state.fanSpeed = smooth(state.fanSpeed, pointer.inside ? 7.5 : 2.6, Math.min(1, dt * 1.5));
        state.fan = (state.fan + state.fanSpeed * dt) % (Math.PI * 2);
        const tx = pointer.inside ? pointer.x / CELL_W : -999;
        const ty = pointer.inside ? pointer.y / CELL_H : -999;
        state.lensX = tx;
        state.lensY = ty;
      }

      // Pass 1: the card, one texel per character cell.
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, cols, rows);
      gl.useProgram(sceneProg);
      gl.uniform2f(S.res, cols, rows);
      gl.uniform1f(S.aspect, (cols * cellW) / (rows * cellH));
      gl.uniform1f(S.zoom, zoom);
      gl.uniform1f(S.yaw, state.yaw);
      gl.uniform1f(S.pitch, state.pitch);
      gl.uniform1f(S.fan, state.fan);
      gl.uniform1f(S.led, 0.5 + 0.5 * Math.sin(t * 1.8));
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Pass 2: characters.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(asciiProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(A.scene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(A.atlas, 1);
      gl.uniform2f(A.canvas, canvas.width, canvas.height);
      gl.uniform2f(A.cell, cellW, cellH);
      gl.uniform2f(A.grid, cols, rows);
      gl.uniform1f(A.ramp, RAMP.length);
      gl.uniform1f(A.noise, NOISE.length);
      gl.uniform3fv(A.ink, colors.ink);
      gl.uniform3fv(A.dim, colors.dim);
      gl.uniform3fv(A.accent, colors.accent);
      gl.uniform2f(A.mouse, state.lensX, state.lensY);
      gl.uniform1f(A.lensR, 78 * dpr);
      gl.uniform1f(A.time, t);
      gl.uniform1f(A.boot, reduced ? 1 : Math.min(1, t / 1.6));
      const sweep = (t * 9) % (rows * 2.6);
      gl.uniform1f(A.scan, reduced ? -99 : sweep - rows * 0.3);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Callouts follow their points. One that would run off the right edge
      // flips to the left of its point instead of being cut off.
      labels.forEach((label, i) => {
        const el = labelRefs.current[i];
        if (!el) return;
        const pt = project(label.at, zoom);
        const w = el.offsetWidth;
        const flip = pt.x + w > cssW - 6;
        if (flip !== !!flipped[i]) {
          flipped[i] = flip;
          el.classList.toggle('is-flipped', flip);
        }
        const x = flip ? pt.x - w : pt.x;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${pt.y.toFixed(1)}px, 0)`;
      });
    };

    let running = false;
    let visible = true;
    const loop = (now: number) => {
      if (disposed) return;
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const startLoop = () => {
      if (running || reduced || !visible || document.hidden) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(loop);
    };
    const stopLoop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (!running) draw(performance.now());
    });
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) startLoop();
      else stopLoop();
    });
    const mo = new MutationObserver(() => {
      readColors();
      if (!running) draw(performance.now());
    });
    const scheme = window.matchMedia('(prefers-color-scheme: light)');
    const onScheme = () => {
      readColors();
      if (!running) draw(performance.now());
    };
    const onVisibility = () => (document.hidden ? stopLoop() : startLoop());

    (async () => {
      pixelFont = await pixelFontReady();
      if (disposed) return;
      readColors();
      resize();
      ro.observe(canvas);
      io.observe(canvas);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      scheme.addEventListener?.('change', onScheme);
      window.addEventListener('pointermove', onPointer, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
      document.addEventListener('visibilitychange', onVisibility);
      setBooted(true);
      if (reduced) draw(performance.now());
      else startLoop();
    })();

    return () => {
      disposed = true;
      stopLoop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      scheme.removeEventListener?.('change', onScheme);
      window.removeEventListener('pointermove', onPointer);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteTexture(sceneTex);
      gl.deleteTexture(atlasTex);
      gl.deleteFramebuffer(fbo);
      gl.deleteProgram(sceneProg);
      gl.deleteProgram(asciiProg);
      gl.deleteVertexArray(vao);
    };
    // labels only change with the language; their text is in labelKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelKey]);

  if (failed) return null;

  return (
    <figure className={`ascii-gpu${booted ? ' is-booted' : ''}`} ref={wrapRef}>
      <canvas ref={canvasRef} className="ascii-canvas" aria-hidden="true" />
      <div className="ascii-labels" aria-hidden="true">
        {labels.map((l, i) => (
          <div
            key={l.text}
            className="ascii-label"
            style={{ ['--d' as string]: `${0.9 + i * 0.25}s` }}
            ref={(el) => {
              labelRefs.current[i] = el;
            }}
          >
            <span className="ascii-label-mark" />
            <span className="ascii-label-line" />
            <span className="ascii-label-text">{l.text}</span>
          </div>
        ))}
      </div>
      {caption && <figcaption className="ascii-caption">{caption}</figcaption>}
    </figure>
  );
}
