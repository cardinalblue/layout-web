import type { Frame, Item, RatioMode, RNG, TextRenderOpts } from './types';
import {
  boundingBox,
  rectDist,
  rng32,
  scaleUp,
  shuffle,
} from './shared';
import {
  estimateTextLayout,
  mutateRatio,
  sampleTextRatio,
  textRatioRange,
} from './text';

// ============================================================
// Binary tree
// ============================================================

interface LeafNode {
  t: 'L';
  ii: number;
  r?: number;
}
interface InternalNode {
  t: 'N';
  cut: 'H' | 'V';
  c: [TreeNode, TreeNode];
  r?: number;
}
type TreeNode = LeafNode | InternalNode;

function balTree(ids: number[], d: number): TreeNode {
  if (ids.length === 1) return { t: 'L', ii: ids[0] };
  const m = Math.ceil(ids.length / 2);
  return {
    t: 'N',
    cut: d % 2 === 0 ? 'H' : 'V',
    c: [balTree(ids.slice(0, m), d + 1), balTree(ids.slice(m), d + 1)],
  };
}

function rndTree(n: number, rng: RNG): TreeNode {
  const idx = Array.from({ length: n }, (_, i) => i);
  const shuffled = shuffle(idx, rng);
  function build(a: number[]): TreeNode {
    if (a.length === 1) return { t: 'L', ii: a[0] };
    const m = 1 + Math.floor(rng() * (a.length - 1));
    return {
      t: 'N',
      cut: rng() > 0.5 ? 'H' : 'V',
      c: [build(a.slice(0, m)), build(a.slice(m))],
    };
  }
  return build(shuffled);
}

function cloneT(n: TreeNode): TreeNode {
  if (n.t === 'L') return { t: 'L', ii: n.ii };
  return { t: 'N', cut: n.cut, c: [cloneT(n.c[0]), cloneT(n.c[1])] };
}

function leavesT(n: TreeNode): LeafNode[] {
  if (n.t === 'L') return [n];
  return [...leavesT(n.c[0]), ...leavesT(n.c[1])];
}

function nodesT(n: TreeNode): InternalNode[] {
  if (n.t === 'L') return [];
  return [n, ...nodesT(n.c[0]), ...nodesT(n.c[1])];
}

// ============================================================
// Genome (tree + per-text ratio overrides)
// ============================================================

interface Genome {
  tree: TreeNode;
  textRatios: Record<string, number>;
}

function cloneGenome(g: Genome): Genome {
  return { tree: cloneT(g.tree), textRatios: { ...g.textRatios } };
}

function applyRatios(items: Item[], textRatios: Record<string, number>): Item[] {
  return items.map((im) => {
    if (im.isText && textRatios[im.id] !== undefined) {
      return { ...im, ratio: textRatios[im.id] };
    }
    return im;
  });
}

// ============================================================
// Mutation (flipCut 40% / swapLeaves 30% / restructure 30%)
// With text items: 30% ratio mutation, 70% tree mutation
// ============================================================

function mutateGenome(
  g: Genome,
  rng: RNG,
  items: Item[],
  ratioMode: RatioMode,
  enableRatioMutation: boolean,
  NW: number,
  minFS: number,
): Genome {
  const c = cloneGenome(g);
  const textItems = items.filter((im): im is Extract<Item, { isText: true }> => im.isText);
  const hasText = textItems.length > 0 && enableRatioMutation;
  const r = rng();

  if (hasText && r < 0.3) {
    const ti = textItems[Math.floor(rng() * textItems.length)];
    const [lo, hi] = textRatioRange(ti.text, ti.isPaired, ti.subtitle, ratioMode, NW, minFS);
    const current = c.textRatios[ti.id] ?? ti.ratio;
    c.textRatios[ti.id] = mutateRatio(current, lo, hi, rng, 0.25);
    return c;
  }

  const tr = hasText ? (r - 0.3) / 0.7 : r;
  if (tr < 0.4) {
    const ns = nodesT(c.tree);
    if (ns.length) {
      const nd = ns[Math.floor(rng() * ns.length)];
      nd.cut = nd.cut === 'H' ? 'V' : 'H';
    }
  } else if (tr < 0.7) {
    const lv = leavesT(c.tree);
    if (lv.length >= 2) {
      const i = Math.floor(rng() * lv.length);
      let j = Math.floor(rng() * (lv.length - 1));
      if (j >= i) j++;
      [lv[i].ii, lv[j].ii] = [lv[j].ii, lv[i].ii];
    }
  } else {
    const ns = nodesT(c.tree);
    if (ns.length) {
      const nd = ns[Math.floor(rng() * ns.length)];
      const ids = leavesT(nd).map((l) => l.ii);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      function rb(a: number[]): TreeNode {
        if (a.length === 1) return { t: 'L', ii: a[0] };
        const m = 1 + Math.floor(rng() * (a.length - 1));
        return { t: 'N', cut: rng() > 0.5 ? 'H' : 'V', c: [rb(a.slice(0, m)), rb(a.slice(m))] };
      }
      const rebuilt = rb(ids);
      // Replace contents of nd with rebuilt (internal only; leaves ignored as parent is internal)
      if (rebuilt.t === 'N') {
        nd.cut = rebuilt.cut;
        nd.c = rebuilt.c;
      }
    }
  }
  return c;
}

// ============================================================
// Tree → layout (all in normalized units)
// ============================================================

function treeToRows(tree: TreeNode, items: Item[]): { id: number; item: Item }[][] {
  function g(nd: TreeNode): { id: number; item: Item }[][] {
    if (nd.t === 'L') return items[nd.ii] ? [[{ id: nd.ii, item: items[nd.ii] }]] : [];
    const l = g(nd.c[0]);
    const r = g(nd.c[1]);
    return nd.cut === 'H' ? [...l, ...r] : [[...l.flat(), ...r.flat()]];
  }
  const rows = g(tree).filter((r) => r.length > 0);
  return rows.length ? rows : [[{ id: 0, item: items[0] }]];
}

function treeAreas(tree: TreeNode, items: Item[], total: number): Record<number, number> {
  function cR(nd: TreeNode): number {
    if (nd.t === 'L') {
      nd.r = items[nd.ii]?.ratio ?? 1;
      return nd.r;
    }
    const r0 = cR(nd.c[0]);
    const r1 = cR(nd.c[1]);
    nd.r = nd.cut === 'H' ? 1 / (1 / r0 + 1 / r1) : r0 + r1;
    return nd.r;
  }
  function lay(nd: TreeNode, a: number, out: Record<number, number>): void {
    if (nd.t === 'L') {
      out[nd.ii] = a;
      return;
    }
    const r0 = nd.c[0].r ?? 1;
    const r1 = nd.c[1].r ?? 1;
    const f = nd.cut === 'H' ? 1 / r0 / (1 / r0 + 1 / r1) : r0 / (r0 + r1);
    lay(nd.c[0], a * f, out);
    lay(nd.c[1], a * (1 - f), out);
  }
  cR(tree);
  const out: Record<number, number> = {};
  lay(tree, total, out);
  return out;
}

function compSizes(items: Item[], areaMap: Record<number, number>): Record<string, { w: number; h: number }> {
  const s: Record<string, { w: number; h: number }> = {};
  for (let i = 0; i < items.length; i++) {
    const im = items[i];
    const a = areaMap[i] ?? 1000;
    const h = Math.sqrt(a / im.ratio);
    s[im.id] = { w: h * im.ratio, h };
  }
  return s;
}

function layoutGrid(
  rows: { id: number; item: Item }[][],
  sizes: Record<string, { w: number; h: number }>,
  gap: number,
  cw: number,
  ch: number,
): Frame[] {
  const br = rows
    .filter((r) => r && r.length > 0)
    .map((row) => {
      const it = row.map((r) => {
        const s = sizes[r.item.id];
        return { ...r, w: s ? s.w : 50, h: s ? s.h : 50 };
      });
      const mH = Math.max(...it.map((i) => i.h));
      return it.map((i) => ({ ...i, w: i.w * (mH / i.h), h: mH }));
    });
  if (!br.length) return [];
  const rW = br.map((r) => r.reduce((s, i) => s + i.w, 0) + gap * (r.length - 1));
  const rH = br.map((r) => (r[0] ? r[0].h : 0));
  const sc = Math.min(
    (cw * 0.88) / Math.max(...rW),
    (ch * 0.88) / (rH.reduce((s, h) => s + h, 0) + gap * (br.length - 1)),
    1,
  );
  const frames: Frame[] = [];
  let y = (ch - (rH.reduce((s, h) => s + h * sc, 0) + gap * (br.length - 1))) / 2;
  for (let ri = 0; ri < br.length; ri++) {
    const row = br[ri];
    const rowW = row.reduce((s, i) => s + i.w * sc, 0) + gap * (row.length - 1);
    let x = (cw - rowW) / 2;
    for (const it of row) {
      frames.push({ id: it.item.id, item: it.item, x, y, w: it.w * sc, h: it.h * sc });
      x += it.w * sc + gap;
    }
    y += rH[ri] * sc + gap;
  }
  return frames;
}

// ============================================================
// Scoring — v9.2 weights (sum = 1.00)
// ============================================================

function rowScore(
  frames: Frame[],
  NW: number,
  NH: number,
  gap: number,
  tOpts: TextRenderOpts,
): number {
  if (!frames.length) return 0;
  let nnS = 0;
  let nnC = 0;
  for (let i = 0; i < frames.length; i++) {
    let m = Infinity;
    for (let j = 0; j < frames.length; j++) {
      if (i !== j) m = Math.min(m, rectDist(frames[i], frames[j]));
    }
    nnS += (m - gap) ** 2;
    nnC++;
  }
  const gs = 1 / (1 + Math.sqrt(nnS / Math.max(nnC, 1)) / (Math.abs(gap) || 1));

  const bb = boundingBox(frames);
  const bA = Math.max(bb.w * bb.h, 1);
  const fl = Math.max(bA / (NW * NH), 0.01);
  const co = frames.reduce((s, f) => s + f.w * f.h, 0) / bA;

  // v9.2: multiplier 1.0 (was 0.8)
  const am = 1 / (1 + Math.abs(Math.log(bb.w / Math.max(bb.h, 1) / (NW / NH))) * 1.0);

  // Rows grouped by y (rounded × 10 — in normalized units, this is a fine bucket)
  const rM: Record<number, { l: number; r: number; cnt: number }> = {};
  for (const f of frames) {
    const ry = Math.round(f.y * 10);
    if (!rM[ry]) rM[ry] = { l: f.x, r: f.x + f.w, cnt: 1 };
    else {
      rM[ry].l = Math.min(rM[ry].l, f.x);
      rM[ry].r = Math.max(rM[ry].r, f.x + f.w);
      rM[ry].cnt++;
    }
  }
  const rws = Object.values(rM).map((r) => r.r - r.l);
  const rwS = rws.length >= 2 ? Math.min(...rws) / Math.max(...rws) : 1;
  const maxPR = Math.max(...Object.values(rM).map((r) => r.cnt));
  const cR = NW / NH;

  // v9.2: idealMax floor 2 (was 3)
  const idealMax = Math.max(2, Math.round(Math.sqrt(frames.length) * Math.sqrt(cR)));
  const rcOK = maxPR <= idealMax ? 1 : Math.max(0.3, 1 - (maxPR - idealMax) * 0.15);

  const areas = frames.map((f) => f.w * f.h);
  const aR = Math.max(...areas) / Math.max(Math.min(...areas), 0.01);
  const aOK = aR <= 3 ? 1 : Math.max(0, 1 - (aR - 3) * 0.15);

  // Text-block scoring tB — multiplies all text frames' penalty factors
  const tBS = tOpts.textBoxSize;
  const mFS = tOpts.maxFS;
  let tB = 1;
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
    const textStr = item.text;
    const wc = item.isPaired ? 99 : textStr.split(/\s+/).filter((w) => w.length > 0).length;
    const fsFloorBase = wc > 12 ? 14 : 18;
    const fsFloor = Math.max(5, Math.round(fsFloorBase * tBS));
    if (est.fontSize < fsFloor) tB *= 0.3;
    else if (est.fontSize < fsFloor + 3) tB *= 0.7;

    const fillBoth = Math.sqrt(est.fillH * Math.max(est.fillW, 0.3));
    if (fillBoth < 0.4) tB *= 0.75;
    else if (fillBoth < 0.55) tB *= 0.9;

    if (item.minArea > 0) {
      const areaRatio = (f.w * f.h) / item.minArea;
      if (areaRatio > 2.0) tB *= Math.max(0.55, 1 - (areaRatio - 2.0) * 0.12);
    }
    if (item.maxArea > 0 && est.fontSize > mFS) {
      const overshoot = est.fontSize / mFS;
      tB *= Math.max(0.5, 1 - (overshoot - 1) * 0.4);
    }
    if (item.maxArea > 0) {
      const ar = (f.w * f.h) / item.maxArea;
      if (ar > 1.0) tB *= Math.max(0.55, 1 - (ar - 1.0) * 0.2);
    }
  }

  // v9.2 weights (sum = 1.00)
  return (
    gs ** 0.13 *
    fl ** 0.15 *
    co ** 0.05 *
    am ** 0.15 *
    rwS ** 0.13 *
    aOK ** 0.09 *
    rcOK ** 0.13 *
    tB ** 0.17
  );
}

// ============================================================
// GA Main Loop
// ============================================================

export interface RunGAResult {
  frames: Frame[];
  textRatios: Record<string, number>;
  score: number;
}

export interface RunGAArgs {
  items: Item[];
  NW: number;
  NH: number;
  gap: number;
  pad: number;
  seed: number;
  tOpts: TextRenderOpts;
  ratioMode: RatioMode;
  enableRatioMutation: boolean;
  minFS: number;
  population?: number;
  generations?: number;
}

export function runGA(args: RunGAArgs): RunGAResult {
  const {
    items,
    NW,
    NH,
    gap,
    pad,
    seed,
    tOpts,
    ratioMode,
    enableRatioMutation,
    minFS,
    population = 50,
    generations = 40,
  } = args;
  if (items.length === 0) {
    return { frames: [], textRatios: {}, score: 0 };
  }

  const rng = rng32(seed + 555);
  const n = items.length;
  const idxArr = Array.from({ length: n }, (_, i) => i);

  const makeGenome = (tree: TreeNode): Genome => ({ tree, textRatios: {} });
  let pop: Genome[] = [
    makeGenome(balTree(idxArr, 0)),
    makeGenome(balTree(idxArr, 1)),
    ...Array.from({ length: Math.max(0, population - 2) }, () => makeGenome(rndTree(n, rng))),
  ];

  if (enableRatioMutation) {
    const textItems = items.filter((im): im is Extract<Item, { isText: true }> => im.isText);
    for (let i = Math.floor(population / 2); i < pop.length; i++) {
      const g = pop[i];
      for (const ti of textItems) {
        g.textRatios[ti.id] = sampleTextRatio(ti.text, ti.isPaired, ti.subtitle, ratioMode, rng, NW, minFS);
      }
    }
  }

  let bestGenome = pop[0];
  let bestS = -Infinity;

  for (let g = 0; g < generations; g++) {
    const scored = pop
      .map((genome) => {
        const effItems = applyRatios(items, genome.textRatios);
        const rows = treeToRows(genome.tree, effItems);
        const ar = treeAreas(genome.tree, effItems, NW * NH * 0.55);
        const sz = compSizes(effItems, ar);
        const fr = scaleUp(layoutGrid(rows, sz, gap, NW, NH), NW, NH, pad);
        return { genome, fr, sc: rowScore(fr, NW, NH, gap, tOpts) };
      })
      .sort((a, b) => b.sc - a.sc);

    if (scored[0].sc > bestS) {
      bestS = scored[0].sc;
      bestGenome = cloneGenome(scored[0].genome);
    }

    const survivorCount = Math.max(1, Math.floor(population * 0.3));
    const surv = scored.slice(0, survivorCount).map((x) => x.genome);
    pop = surv.map(cloneGenome);
    while (pop.length < population) {
      const parent = surv[Math.floor(rng() * surv.length)];
      pop.push(mutateGenome(parent, rng, items, ratioMode, enableRatioMutation, NW, minFS));
    }
  }

  const effItems = applyRatios(items, bestGenome.textRatios);
  const rows = treeToRows(bestGenome.tree, effItems);
  const ar = treeAreas(bestGenome.tree, effItems, NW * NH * 0.55);
  const sz = compSizes(effItems, ar);
  const finalFrames = scaleUp(layoutGrid(rows, sz, gap, NW, NH), NW, NH, pad);
  const finalScore = rowScore(finalFrames, NW, NH, gap, tOpts);

  return { frames: finalFrames, textRatios: bestGenome.textRatios, score: finalScore };
}
