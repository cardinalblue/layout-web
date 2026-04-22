import type { Frame, Item, RatioMode, TextRenderOpts } from './types';
import {
  boundingBox,
  countOverlaps,
  createPerlin,
  rectDist,
  rng32,
  scaleUp,
} from './shared';
import { estimateTextLayout, sampleTextRatio } from './text';

// ============================================================
// Phyllo single trial — all computation in normalized units
// ============================================================

export interface PhylloOpts {
  sizeVar: number;
  rotation: number;
  density: number;
}

function phylloTrial(
  items: Item[],
  NW: number,
  NH: number,
  gap: number,
  padding: number,
  seed: number,
  opts: PhylloOpts,
): Frame[] {
  const n = items.length;
  if (n === 0) return [];
  const rng = rng32(seed + 333);
  const perlin = createPerlin(seed + 6666);
  const cx = NW / 2;
  const cy = NH / 2;
  const aW = NW - padding * 2;
  const aH = NH - padding * 2;

  // Shuffle for rank ordering
  const order = items
    .map((item, i) => ({ item, i, key: rng() }))
    .sort((a, b) => b.key - a.key);

  // Phase 1 — area allocation with size hierarchy
  const tA = aW * aH * opts.density;
  const bA = tA / n;
  const areas: number[] = order.map(
    (_, r) => bA * (1 + (1 - r / Math.max(n - 1, 1)) * opts.sizeVar * 1.2),
  );
  const aS = areas.reduce((s, a) => s + a, 0);
  for (let i = 0; i < areas.length; i++) areas[i] *= tA / aS;

  // Phase 2 — minArea boost for text; scale non-text items down to absorb deficit
  let deficit = 0;
  let nonTextTotal = 0;
  for (let r = 0; r < n; r++) {
    const it = order[r].item;
    if (it.isText && it.minArea > 0 && areas[r] < it.minArea) {
      deficit += it.minArea - areas[r];
      areas[r] = it.minArea;
    } else if (!it.isText) {
      nonTextTotal += areas[r];
    }
  }
  if (deficit > 0 && nonTextTotal > 0) {
    const scale = Math.max(0.3, (nonTextTotal - deficit) / nonTextTotal);
    for (let r = 0; r < n; r++) {
      if (!order[r].item.isText) areas[r] *= scale;
    }
  }

  // Phase 3 — elliptical seed placement (Vogel)
  const PHI = (1 + Math.sqrt(5)) / 2;
  const GOLDEN = (2 * Math.PI) / (PHI * PHI);
  const eRx = aW * 0.42;
  const eRy = aH * 0.42;

  interface Node extends Frame {
    rot?: number;
  }
  const nodes: Node[] = order.map(({ item, i }, rank) => {
    const area = areas[rank];
    const h = Math.sqrt(area / item.ratio);
    const w = h * item.ratio;
    const angle = rank * GOLDEN + (rng() - 0.5) * 0.4;
    const t = rank === 0 ? 0 : Math.sqrt(rank / n);
    void i;
    return {
      id: item.id,
      item,
      x: cx + Math.cos(angle) * eRx * t - w / 2,
      y: cy + Math.sin(angle) * eRy * t - h / 2,
      w,
      h,
    };
  });

  const cr = aW / aH;

  // Phase 4 — constraint solver (300 iterations)
  for (let iter = 0; iter < 300; iter++) {
    const decay = Math.max(0.25, 1 - iter / 300);
    let tOv = 0;

    // 4a. Collision
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const sX = (a.w + b.w) / 2 + gap;
        const sY = (a.h + b.h) / 2 + gap;
        const dx = a.x + a.w / 2 - (b.x + b.w / 2);
        const dy = a.y + a.h / 2 - (b.y + b.h / 2);
        const ox = sX - Math.abs(dx);
        const oy = sY - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          tOv += ox * oy;
          const pf = 0.55 * decay;
          if (ox < oy) {
            const p = ox * pf;
            const s2 = dx >= 0 ? 1 : -1;
            a.x += s2 * p;
            b.x -= s2 * p;
          } else {
            const p = oy * pf;
            const s2 = dy >= 0 ? 1 : -1;
            a.y += s2 * p;
            b.y -= s2 * p;
          }
        }
      }
    }

    // 4b. Gravity (anisotropic)
    const gB = 0.035 * decay;
    const gX = gB * (cr < 1 ? 1.1 : 0.7);
    const gY = gB * (cr > 1 ? 1.1 : 0.7);
    for (const nd of nodes) {
      nd.x += (cx - (nd.x + nd.w / 2)) * gX;
      nd.y += (cy - (nd.y + nd.h / 2)) * gY;
    }

    if (iter > 10 && iter < 180) {
      // 4c. Spread
      const bb = boundingBox(nodes);
      const sp = 0.012 * decay;
      const wShort = aW < aH ? 1.2 : 1.0;
      const hShort = aH < aW ? 1.2 : 1.0;
      if (bb.w < aW * 0.75) {
        for (const nd of nodes) {
          nd.x += (nd.x + nd.w / 2 - cx) * sp * 2 * hShort;
        }
      }
      if (bb.h < aH * 0.75) {
        for (const nd of nodes) {
          nd.y += (nd.y + nd.h / 2 - cy) * sp * 2 * wShort;
        }
      }
      // 4d. Aspect correction
      const gR = bb.w / Math.max(bb.h, 1);
      const tR = aW / aH;
      if (Math.abs(gR - tR) > 0.2) {
        const ar = 0.006 * decay;
        if (gR > tR * 1.15) {
          for (const nd of nodes) nd.x += (cx - (nd.x + nd.w / 2)) * ar;
        } else if (gR < tR * 0.85) {
          for (const nd of nodes) nd.y += (cy - (nd.y + nd.h / 2)) * ar;
        }
      }
    }

    // 4e. Gap targeting
    if (iter > 90) {
      const gS = 0.015 * decay;
      for (let i = 0; i < n; i++) {
        let mD = Infinity;
        let mJ = -1;
        for (let j = 0; j < n; j++) {
          if (i !== j) {
            const d = rectDist(nodes[i], nodes[j]);
            if (d < mD) {
              mD = d;
              mJ = j;
            }
          }
        }
        if (mJ >= 0 && mD > gap * 1.8) {
          const a = nodes[i];
          const b = nodes[mJ];
          const ddx = b.x + b.w / 2 - (a.x + a.w / 2);
          const ddy = b.y + b.h / 2 - (a.y + a.h / 2);
          const dist = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dist > 1) {
            const pull = (mD - gap) * gS;
            a.x += (ddx / dist) * pull;
            a.y += (ddy / dist) * pull;
          }
        }
      }
    }

    // 4f. Boundary clamp
    for (const nd of nodes) {
      nd.x = Math.max(padding, Math.min(NW - nd.w - padding, nd.x));
      nd.y = Math.max(padding, Math.min(NH - nd.h - padding, nd.y));
    }

    if (tOv < 0.1 && iter > 40) break;
  }

  // Phase 5 — aesthetic rotation (Perlin)
  const freq = 0.007;
  for (let i = 0; i < n; i++) {
    const nd = nodes[i];
    if (nd.item.isText) {
      nd.rot = 0;
      continue;
    }
    const ncx = nd.x + nd.w / 2;
    const ncy = nd.y + nd.h / 2;
    nd.rot =
      (perlin(ncx * freq, ncy * freq) * 6 + (i % 2 === 0 ? 1 : -1) * 1.5) * opts.rotation;
  }

  return nodes;
}

// ============================================================
// Scoring — v9.2 weights (sum 1.00)
// ============================================================

function scorePhyllo(
  frames: Frame[],
  NW: number,
  NH: number,
  gap: number,
  tOpts: TextRenderOpts,
): number {
  void gap;
  if (!frames.length) return -Infinity;
  const overlaps = countOverlaps(frames);
  if (overlaps > 0) return -overlaps;

  const bb = boundingBox(frames);
  const am = 1 / (1 + Math.abs(Math.log(bb.w / Math.max(bb.h, 1) / (NW / NH))) * 1.5);
  const cov = Math.min((bb.w * bb.h) / (NW * NH), 1);

  const fillX = Math.min(bb.w / NW, 1);
  const fillY = Math.min(bb.h / NH, 1);
  const axisFill = Math.min(fillX, fillY);

  const totalItemArea = frames.reduce((s, f) => s + f.w * f.h, 0);
  const bboxArea = Math.max(bb.w * bb.h, 1);
  const co = Math.min(totalItemArea / bboxArea, 1);

  const gaps: number[] = [];
  for (let i = 0; i < frames.length; i++) {
    let m = Infinity;
    for (let j = 0; j < frames.length; j++) {
      if (i !== j) m = Math.min(m, rectDist(frames[i], frames[j]));
    }
    if (m < Infinity) gaps.push(m);
  }
  let gh2 = 1;
  if (gaps.length > 1) {
    const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const cv =
      Math.sqrt(gaps.reduce((s, g) => s + (g - avg) ** 2, 0) / gaps.length) / Math.max(avg, 1);
    gh2 = 1 / (1 + cv * 2);
  }

  const tBS = tOpts.textBoxSize;
  const mFS = tOpts.maxFS;
  let ts = 1;
  for (const f of frames) {
    if (!f.item.isText) continue;
    const item = f.item;
    const est = estimateTextLayout(item.text, f.w, f.h, {
      padFractionX: tOpts.padFractionX,
      padFractionY: tOpts.padFractionY,
      lineHeight: tOpts.lineHeight,
      fontFamily: tOpts.fontFamily,
      italic: tOpts.italic,
    });
    const wc = item.isPaired ? 99 : item.text.split(/\s+/).filter((w) => w.length > 0).length;
    const fsFloorBase = wc > 12 ? 14 : 18;
    const fsFloor = Math.max(5, Math.round(fsFloorBase * tBS));
    if (est.fontSize < fsFloor) ts *= 0.3;
    else if (est.fontSize < fsFloor + 3) ts *= 0.7;

    const fillBoth = Math.sqrt(est.fillH * Math.max(est.fillW, 0.3));
    if (fillBoth < 0.4) ts *= 0.75;
    else if (fillBoth < 0.55) ts *= 0.9;

    if (item.minArea > 0) {
      const areaRatio = (f.w * f.h) / item.minArea;
      if (areaRatio > 2.0) ts *= Math.max(0.55, 1 - (areaRatio - 2.0) * 0.12);
    }
    if (item.maxArea > 0 && est.fontSize > mFS) {
      const overshoot = est.fontSize / mFS;
      ts *= Math.max(0.5, 1 - (overshoot - 1) * 0.4);
    }
    if (item.maxArea > 0) {
      const ar = (f.w * f.h) / item.maxArea;
      if (ar > 1.0) ts *= Math.max(0.55, 1 - (ar - 1.0) * 0.2);
    }
  }

  return am ** 0.1 * cov ** 0.15 * axisFill ** 0.08 * co ** 0.3 * gh2 ** 0.17 * ts ** 0.2;
}

// ============================================================
// Multi-trial selector with text ratio search
// ============================================================

function applyRatios(items: Item[], textRatios: Record<string, number>): Item[] {
  return items.map((im) => {
    if (im.isText && textRatios[im.id] !== undefined) return { ...im, ratio: textRatios[im.id] };
    return im;
  });
}

export interface BestPhylloResult {
  frames: Frame[];
  score: number;
  textRatios: Record<string, number>;
}

export interface BestPhylloArgs {
  items: Item[];
  NW: number;
  NH: number;
  gap: number;
  pad: number;
  seed: number;
  opts: PhylloOpts;
  trials: number;
  tOpts: TextRenderOpts;
  ratioMode: RatioMode;
  enableRatioSearch: boolean;
  minFS: number;
}

export function bestPhyllo(args: BestPhylloArgs): BestPhylloResult {
  const {
    items,
    NW,
    NH,
    gap,
    pad,
    seed,
    opts,
    trials,
    tOpts,
    ratioMode,
    enableRatioSearch,
    minFS,
  } = args;
  let bf: Frame[] = [];
  let bs = -Infinity;
  let bestRatios: Record<string, number> = {};
  const textItems = items.filter((im): im is Extract<Item, { isText: true }> => im.isText);
  const ratioRng = rng32(seed + 8888);

  const n = Math.max(1, trials);
  for (let t = 0; t < n; t++) {
    const ts = seed * 1000 + t * 7 + 1;
    let trialItems = items;
    let trialRatios: Record<string, number> = {};
    if (enableRatioSearch && textItems.length > 0) {
      for (const ti of textItems) {
        trialRatios[ti.id] =
          t === 0
            ? ti.ratio
            : sampleTextRatio(ti.text, ti.isPaired, ti.subtitle, ratioMode, ratioRng, NW, minFS);
      }
      trialItems = applyRatios(items, trialRatios);
    }

    const raw = phylloTrial(trialItems, NW, NH, gap, pad, ts, opts);
    const scaled = scaleUp(raw, NW, NH, pad);
    const sc = scorePhyllo(scaled, NW, NH, gap, tOpts);
    if (sc > bs) {
      bs = sc;
      bf = scaled;
      bestRatios = trialRatios;
      if (sc > 0.75) break;
    }
  }

  return { frames: bf, score: bs, textRatios: bestRatios };
}
