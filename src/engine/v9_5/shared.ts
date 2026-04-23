import type { Frame, NormalizedCanvas, RNG } from './types';

// ============================================================
// Seeded RNG — Weyl-sequence 32-bit hash
// ============================================================

export function rng32(seed: number): RNG {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic seed dispersion for retry loops.
// Without this, consecutive user seeds (100, 101, 102) all converge to the
// same successful seed when the retry loop walks forward by 1 — the UI then
// appears "stuck" because clicking ◀/▶ is a no-op against the retry step.
export function retrySeed(originalSeed: number, tries: number): number {
  // splitmix32 applied to (seed, tries)
  let h = (originalSeed | 0) ^ Math.imul(tries | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function shuffle<T>(arr: T[], rng: RNG): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// Normalized canvas — NW=1000 (landscape/square), NH=1000 (portrait)
// ============================================================

const NORMALIZED_EDGE = 1000;

export function normalizedCanvas(canvasRatio: number): NormalizedCanvas {
  if (canvasRatio >= 1) {
    return { NW: NORMALIZED_EDGE, NH: Math.round(NORMALIZED_EDGE / canvasRatio) };
  }
  return { NW: Math.round(NORMALIZED_EDGE * canvasRatio), NH: NORMALIZED_EDGE };
}

// ============================================================
// Rectangle edge-to-edge distance
// ============================================================

export function rectDist(a: Frame, b: Frame): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.sqrt(dx * dx + dy * dy);
}

export function countOverlaps(frames: Frame[]): number {
  let c = 0;
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const a = frames[i];
      const b = frames[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        c++;
      }
    }
  }
  return c;
}

export function nearestNeighborDist(frames: Frame[], index: number): number {
  let m = Infinity;
  for (let j = 0; j < frames.length; j++) {
    if (j === index) continue;
    const d = rectDist(frames[index], frames[j]);
    if (d < m) m = d;
  }
  return m;
}

// ============================================================
// Bounding box
// ============================================================

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boundingBox(frames: Frame[]): BBox {
  if (frames.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of frames) {
    if (f.x < minX) minX = f.x;
    if (f.y < minY) minY = f.y;
    if (f.x + f.w > maxX) maxX = f.x + f.w;
    if (f.y + f.h > maxY) maxY = f.y + f.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ============================================================
// Scale group to fit canvas (enlarge only; keeps pad budget)
// ============================================================

export function scaleUp(frames: Frame[], NW: number, NH: number, pad: number): Frame[] {
  if (frames.length === 0) return frames;
  const bb = boundingBox(frames);
  if (bb.w < 1 || bb.h < 1) return frames;
  const s = Math.min((NW - pad * 2) / bb.w, (NH - pad * 2) / bb.h);
  if (s <= 1.01) return frames;
  const gcx = bb.x + bb.w / 2;
  const gcy = bb.y + bb.h / 2;
  const cx = NW / 2;
  const cy = NH / 2;

  const scaled: Frame[] = frames.map((f) => ({
    ...f,
    x: cx + (f.x - gcx) * s,
    y: cy + (f.y - gcy) * s,
    w: f.w * s,
    h: f.h * s,
  }));

  // Collision-aware clamp — matches reference scaleUp behaviour
  for (let iter = 0; iter < 50; iter++) {
    let any = false;
    for (let i = 0; i < scaled.length; i++) {
      for (let j = i + 1; j < scaled.length; j++) {
        const a = scaled[i];
        const b = scaled[j];
        const sx = (a.w + b.w) / 2 + 1;
        const sy = (a.h + b.h) / 2 + 1;
        const dx = a.x + a.w / 2 - (b.x + b.w / 2);
        const dy = a.y + a.h / 2 - (b.y + b.h / 2);
        const ox = sx - Math.abs(dx);
        const oy = sy - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          any = true;
          if (ox < oy) {
            const p = ox * 0.52;
            const sg = dx >= 0 ? 1 : -1;
            a.x += sg * p;
            b.x -= sg * p;
          } else {
            const p = oy * 0.52;
            const sg = dy >= 0 ? 1 : -1;
            a.y += sg * p;
            b.y -= sg * p;
          }
        }
      }
    }
    for (const f of scaled) {
      f.x = Math.max(pad * 0.5, Math.min(NW - f.w - pad * 0.5, f.x));
      f.y = Math.max(pad * 0.5, Math.min(NH - f.h - pad * 0.5, f.y));
    }
    if (!any) break;
  }
  return scaled;
}

// ============================================================
// Perlin 2D (seeded)
// ============================================================

export function createPerlin(seed: number): (x: number, y: number) => number {
  const rng = rng32(seed);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  const grad = (h: number, x: number, y: number) => {
    const hh = h & 3;
    const u = hh < 2 ? x : y;
    const v = hh < 2 ? y : x;
    return ((hh & 1) ? -u : u) + ((hh & 2) ? -v : v);
  };
  return (x: number, y: number) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    return lerp(
      lerp(grad(p[p[X] + Y], xf, yf), grad(p[p[X + 1] + Y], xf - 1, yf), u),
      lerp(grad(p[p[X] + Y + 1], xf, yf - 1), grad(p[p[X + 1] + Y + 1], xf - 1, yf - 1), u),
      v,
    );
  };
}

// ============================================================
// Post-processing (normalized units in, normalized units out)
// ============================================================

// spec 0423-1 §Post-Processing → applyScrapScale: constant-px inflation.
// Each frame grows by scaleUnits on every side (2*scaleUnits total in w/h),
// independent of frame size — replaces the multiplicative form that
// disproportionately blew up large frames.
export function applyScrapScale(frames: Frame[], scaleUnits: number): Frame[] {
  if (!frames.length || scaleUnits <= 0) return frames;
  return frames.map((f) => ({
    ...f,
    x: f.x - scaleUnits,
    y: f.y - scaleUnits,
    w: f.w + 2 * scaleUnits,
    h: f.h + 2 * scaleUnits,
  }));
}

export function applyTightness(frames: Frame[], tightUnits: number, NW: number, NH: number): Frame[] {
  if (!frames.length || tightUnits <= 0) return frames;
  const short = Math.min(NW, NH);
  if (short <= 0) return frames;
  const shrink = tightUnits / short;
  const pullScale = Math.max(0.4, 1 - shrink * 4);
  const cx = NW / 2;
  const cy = NH / 2;

  const orig = boundingBox(frames);
  const pulled = frames.map((f) => {
    const fcx = f.x + f.w / 2;
    const fcy = f.y + f.h / 2;
    const nCx = cx + (fcx - cx) * pullScale;
    const nCy = cy + (fcy - cy) * pullScale;
    return { ...f, x: nCx - f.w / 2, y: nCy - f.h / 2 };
  });

  const nb = boundingBox(pulled);
  if (nb.w < 1 || nb.h < 1) return pulled;
  const reScale = Math.min(orig.w / nb.w, orig.h / nb.h);
  if (reScale <= 1.001) return pulled;

  const nCx = nb.x + nb.w / 2;
  const nCy = nb.y + nb.h / 2;
  const oCx = orig.x + orig.w / 2;
  const oCy = orig.y + orig.h / 2;
  return pulled.map((f) => {
    const fcx = f.x + f.w / 2;
    const fcy = f.y + f.h / 2;
    const relX = fcx - nCx;
    const relY = fcy - nCy;
    const sCx = oCx + relX * reScale;
    const sCy = oCy + relY * reScale;
    const sw = f.w * reScale;
    const sh = f.h * reScale;
    return { ...f, w: sw, h: sh, x: sCx - sw / 2, y: sCy - sh / 2 };
  });
}
