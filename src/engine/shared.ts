import type { Frame, BBox, RNG } from './types';

// ============================================================
// Seeded RNG — Weyl-sequence hash (32-bit)
// ============================================================

export function createRNG(seed: number): RNG {
  let state = seed | 0;
  return function next(): number {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// Shuffle (Fisher-Yates)
// ============================================================

export function shuffle<T>(arr: T[], rng: RNG): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// Rectangle edge-to-edge distance
// ============================================================

export function rectDist(a: Frame, b: Frame): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.sqrt(dx * dx + dy * dy);
}

// ============================================================
// Bounding Box
// ============================================================

export function boundingBox(frames: Frame[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of frames) {
    minX = Math.min(minX, f.x);
    minY = Math.min(minY, f.y);
    maxX = Math.max(maxX, f.x + f.width);
    maxY = Math.max(maxY, f.y + f.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ============================================================
// Scale group to fit canvas padding
// ============================================================

export function scaleToFit(
  frames: Frame[],
  canvasW: number,
  canvasH: number,
  padPx: number,
): Frame[] {
  if (frames.length === 0) return frames;

  const bbox = boundingBox(frames);
  if (bbox.width <= 0 || bbox.height <= 0) return frames;

  const scaleX = (canvasW - padPx * 2) / bbox.width;
  const scaleY = (canvasH - padPx * 2) / bbox.height;
  const scale = Math.min(scaleX, scaleY);

  if (scale <= 1.01) return frames;

  const gcx = bbox.x + bbox.width / 2;
  const gcy = bbox.y + bbox.height / 2;
  const ccx = canvasW / 2;
  const ccy = canvasH / 2;

  return frames.map((f) => ({
    ...f,
    x: ccx + (f.x - gcx) * scale,
    y: ccy + (f.y - gcy) * scale,
    width: f.width * scale,
    height: f.height * scale,
  }));
}

// ============================================================
// Perlin Noise 2D — minimal seeded implementation
// ============================================================

export function createPerlin2D(seed: number): (x: number, y: number) => number {
  // Build seeded permutation table
  const rng = createRNG(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  // Gradient vectors (8 directions)
  const grads = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];

  function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  function grad(hash: number, x: number, y: number): number {
    const g = grads[hash & 7];
    return g[0] * x + g[1] * y;
  }

  return function noise2D(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];

    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v,
    );
  };
}

// ============================================================
// Overlap detection
// ============================================================

export function countOverlaps(frames: Frame[]): number {
  let count = 0;
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const a = frames[i], b = frames[j];
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (overlapX > 0.5 && overlapY > 0.5) count++;
    }
  }
  return count;
}

// ============================================================
// Nearest neighbor distance
// ============================================================

export function nearestNeighborDist(frames: Frame[], index: number): number {
  let minDist = Infinity;
  for (let j = 0; j < frames.length; j++) {
    if (j === index) continue;
    const d = rectDist(frames[index], frames[j]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// ============================================================
// Scrap Scale — inflate each frame in-place
// ============================================================

export function applyScrapScale(frames: Frame[], scalePx: number): Frame[] {
  if (scalePx <= 0 || frames.length < 2) return frames;
  const shortEdge = Math.min(
    ...frames.map((f) => Math.min(f.width, f.height)),
  );
  const grow = 1 + (scalePx / (shortEdge || 1)) * 2;
  return frames.map((f) => {
    const newW = f.width * grow;
    const newH = f.height * grow;
    return {
      ...f,
      x: f.x - (newW - f.width) / 2,
      y: f.y - (newH - f.height) / 2,
      width: newW,
      height: newH,
    };
  });
}

// ============================================================
// Tightness — pull toward center + re-scale to fill
// ============================================================

export function applyTightness(
  frames: Frame[],
  tightPx: number,
  canvasW: number,
  canvasH: number,
): Frame[] {
  if (tightPx <= 0 || frames.length < 2) return frames;
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const shrink = tightPx / Math.min(canvasW, canvasH);
  const pullScale = Math.max(0.4, 1 - shrink * 4);

  // Step 1: pull positions toward center
  const pulled = frames.map((f) => ({
    ...f,
    x: cx + ((f.x + f.width / 2) - cx) * pullScale - f.width / 2,
    y: cy + ((f.y + f.height / 2) - cy) * pullScale - f.height / 2,
  }));

  // Step 2: re-scale group back to original bounding area
  const origBBox = boundingBox(frames);
  const newBBox = boundingBox(pulled);
  if (newBBox.width <= 0 || newBBox.height <= 0) return pulled;

  const reScale = Math.min(
    origBBox.width / newBBox.width,
    origBBox.height / newBBox.height,
  );
  const ncx = newBBox.x + newBBox.width / 2;
  const ncy = newBBox.y + newBBox.height / 2;
  const ocx = origBBox.x + origBBox.width / 2;
  const ocy = origBBox.y + origBBox.height / 2;

  return pulled.map((f) => ({
    ...f,
    x: ocx + ((f.x + f.width / 2) - ncx) * reScale - (f.width * reScale) / 2,
    y: ocy + ((f.y + f.height / 2) - ncy) * reScale - (f.height * reScale) / 2,
    width: f.width * reScale,
    height: f.height * reScale,
  }));
}
