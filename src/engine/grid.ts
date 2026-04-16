import type {
  ImageInput,
  Frame,
  TreeNode,
  LeafNode,
  InternalNode,
  GridOptions,
  RNG,
} from './types';
import {
  createRNG,
  shuffle,
  boundingBox,
  scaleToFit,
  nearestNeighborDist,
} from './shared';

// ============================================================
// Deep Clone
// ============================================================

function deepClone(tree: TreeNode): TreeNode {
  return JSON.parse(JSON.stringify(tree));
}

// ============================================================
// 1. Tree Generation
// ============================================================

function buildSubtree(indices: number[], rng: RNG): TreeNode {
  if (indices.length === 1) {
    return { type: 'leaf', imageIndex: indices[0], ratio: 0 } as LeafNode;
  }
  const split = 1 + Math.floor(rng() * (indices.length - 1));
  const cut: 'H' | 'V' = rng() > 0.5 ? 'H' : 'V';
  const left = indices.slice(0, split);
  const right = indices.slice(split);
  return {
    type: 'internal',
    cut,
    children: [buildSubtree(left, rng), buildSubtree(right, rng)],
    ratio: 0,
  } as InternalNode;
}

function randomTree(n: number, rng: RNG): TreeNode {
  const indices = Array.from({ length: n }, (_, i) => i);
  const shuffled = shuffle(indices, rng);
  return buildSubtree(shuffled, rng);
}

function balancedTree(indices: number[], depth: number): TreeNode {
  if (indices.length === 1) {
    return { type: 'leaf', imageIndex: indices[0], ratio: 0 } as LeafNode;
  }
  const mid = Math.ceil(indices.length / 2);
  const cut: 'H' | 'V' = depth % 2 === 0 ? 'H' : 'V';
  const left = indices.slice(0, mid);
  const right = indices.slice(mid);
  return {
    type: 'internal',
    cut,
    children: [balancedTree(left, depth + 1), balancedTree(right, depth + 1)],
    ratio: 0,
  } as InternalNode;
}

// ============================================================
// 2. treeToRows
// ============================================================

function treeToRows(node: TreeNode): number[][] {
  if (node.type === 'leaf') {
    return [[node.imageIndex]];
  }
  const leftRows = treeToRows(node.children[0]);
  const rightRows = treeToRows(node.children[1]);
  if (node.cut === 'H') {
    return leftRows.concat(rightRows);
  }
  // V-cut: merge all into one row
  const merged = leftRows.flat().concat(rightRows.flat());
  return [merged];
}

// ============================================================
// 3. computeRatio (bottom-up)
// ============================================================

function computeRatio(node: TreeNode, images: ImageInput[]): number {
  if (node.type === 'leaf') {
    node.ratio = images[node.imageIndex].aspectRatio;
    return node.ratio;
  }
  const r0 = computeRatio(node.children[0], images);
  const r1 = computeRatio(node.children[1], images);
  if (node.cut === 'H') {
    node.ratio = 1 / (1 / r0 + 1 / r1);
  } else {
    node.ratio = r0 + r1;
  }
  return node.ratio;
}

// ============================================================
// 4. treeAreas
// ============================================================

function distributeArea(
  node: TreeNode,
  area: number,
  result: Map<number, number>,
): void {
  if (node.type === 'leaf') {
    result.set(node.imageIndex, area);
    return;
  }
  const r0 = node.children[0].ratio;
  const r1 = node.children[1].ratio;
  let fraction: number;
  if (node.cut === 'H') {
    fraction = (1 / r0) / (1 / r0 + 1 / r1);
  } else {
    fraction = r0 / (r0 + r1);
  }
  distributeArea(node.children[0], area * fraction, result);
  distributeArea(node.children[1], area * (1 - fraction), result);
}

function treeAreas(
  tree: TreeNode,
  images: ImageInput[],
  canvasW: number,
  canvasH: number,
): Map<number, number> {
  computeRatio(tree, images);
  const totalArea = canvasW * canvasH * 0.55;
  const result = new Map<number, number>();
  distributeArea(tree, totalArea, result);
  return result;
}

// ============================================================
// 5. computeSizes
// ============================================================

function computeSizes(
  images: ImageInput[],
  areaMap: Map<number, number>,
): Map<string, { w: number; h: number }> {
  const sizes = new Map<string, { w: number; h: number }>();
  for (let i = 0; i < images.length; i++) {
    const area = areaMap.get(i) ?? 0;
    const ar = images[i].aspectRatio;
    const h = Math.sqrt(area / ar);
    const w = h * ar;
    sizes.set(images[i].id, { w, h });
  }
  return sizes;
}

// ============================================================
// 6. layoutExact
// ============================================================

function layoutExact(
  rows: number[][],
  images: ImageInput[],
  sizes: Map<string, { w: number; h: number }>,
  gapPx: number,
  canvasW: number,
  canvasH: number,
): Frame[] {
  // Build rows: scale all items in each row to same height (maxH in row)
  const rowData: Array<{ ids: string[]; widths: number[]; height: number }> = [];

  for (const row of rows) {
    let maxH = 0;
    for (const idx of row) {
      const s = sizes.get(images[idx].id);
      if (s && s.h > maxH) maxH = s.h;
    }
    const widths: number[] = [];
    const ids: string[] = [];
    for (const idx of row) {
      const s = sizes.get(images[idx].id);
      if (s) {
        // Scale to maxH while preserving aspect ratio
        const scaledW = (maxH / s.h) * s.w;
        widths.push(scaledW);
      } else {
        widths.push(0);
      }
      ids.push(images[idx].id);
    }
    rowData.push({ ids, widths, height: maxH });
  }

  // Measure
  const rowWidths = rowData.map(
    (r) => r.widths.reduce((a, b) => a + b, 0) + gapPx * (r.widths.length - 1),
  );
  const rowHeights = rowData.map((r) => r.height);
  const maxRowW = Math.max(...rowWidths);
  const totalH = rowHeights.reduce((a, b) => a + b, 0) + gapPx * (rowData.length - 1);

  // Scale to fit
  const scale = Math.min(canvasW * 0.88 / maxRowW, canvasH * 0.88 / totalH, 1.0);

  // Place frames
  const frames: Frame[] = [];
  const scaledTotalH =
    rowHeights.reduce((a, b) => a + b * scale, 0) + gapPx * (rowData.length - 1);
  let y = (canvasH - scaledTotalH) / 2;

  for (let ri = 0; ri < rowData.length; ri++) {
    const r = rowData[ri];
    const scaledRowW =
      r.widths.reduce((a, b) => a + b * scale, 0) + gapPx * (r.widths.length - 1);
    let x = (canvasW - scaledRowW) / 2;

    for (let ci = 0; ci < r.ids.length; ci++) {
      const w = r.widths[ci] * scale;
      const h = r.height * scale;
      frames.push({
        id: r.ids[ci],
        x,
        y,
        width: w,
        height: h,
      });
      x += w + gapPx;
    }
    y += r.height * scale + gapPx;
  }

  return frames;
}

// ============================================================
// 7. mutate
// ============================================================

function collectInternalNodes(node: TreeNode): InternalNode[] {
  if (node.type === 'leaf') return [];
  const result: InternalNode[] = [node];
  return result
    .concat(collectInternalNodes(node.children[0]))
    .concat(collectInternalNodes(node.children[1]));
}

function collectLeaves(node: TreeNode): LeafNode[] {
  if (node.type === 'leaf') return [node];
  return collectLeaves(node.children[0]).concat(collectLeaves(node.children[1]));
}

function collectLeafIndices(node: TreeNode): number[] {
  if (node.type === 'leaf') return [node.imageIndex];
  return collectLeafIndices(node.children[0]).concat(
    collectLeafIndices(node.children[1]),
  );
}

function mutate(tree: TreeNode, rng: RNG): TreeNode {
  const clone = deepClone(tree);
  const r = rng();

  if (r < 0.4) {
    // FLIP CUT
    const internals = collectInternalNodes(clone);
    if (internals.length > 0) {
      const target = internals[Math.floor(rng() * internals.length)];
      target.cut = target.cut === 'H' ? 'V' : 'H';
    }
  } else if (r < 0.7) {
    // SWAP LEAVES
    const leaves = collectLeaves(clone);
    if (leaves.length >= 2) {
      const i = Math.floor(rng() * leaves.length);
      let j = Math.floor(rng() * (leaves.length - 1));
      if (j >= i) j++;
      const tmp = leaves[i].imageIndex;
      leaves[i].imageIndex = leaves[j].imageIndex;
      leaves[j].imageIndex = tmp;
    }
  } else {
    // RESTRUCTURE
    const internals = collectInternalNodes(clone);
    if (internals.length > 0) {
      const target = internals[Math.floor(rng() * internals.length)];
      const leafIndices = collectLeafIndices(target);
      const shuffled = shuffle(leafIndices, rng);
      const newSubtree = buildSubtree(shuffled, rng);
      // Replace target's contents in-place
      if (newSubtree.type === 'internal') {
        target.cut = newSubtree.cut;
        target.children = newSubtree.children;
      }
      // If newSubtree is a leaf (single element), keep as-is since parent is internal
    }
  }

  return clone;
}

// ============================================================
// 8. gridScore
// ============================================================

function gridScore(
  frames: Frame[],
  canvasW: number,
  canvasH: number,
  gapPx: number,
  areaLimit: number,
): number {
  if (frames.length === 0) return 0;

  const n = frames.length;
  const canvasArea = canvasW * canvasH;
  const canvasRatio = canvasW / canvasH;

  // Factor 1: gap uniformity
  let gapSumSq = 0;
  for (let i = 0; i < n; i++) {
    const nnDist = nearestNeighborDist(frames, i);
    gapSumSq += (nnDist - gapPx) * (nnDist - gapPx);
  }
  const gapRMSE = Math.sqrt(gapSumSq / n);
  const gapScore = 1 / (1 + gapRMSE / (Math.abs(gapPx) || 1));

  // Factor 2: fill
  const bbox = boundingBox(frames);
  const bboxArea = bbox.width * bbox.height;
  const fill = Math.max(0.01, bboxArea / canvasArea);

  // Factor 3: compactness
  const totalImageArea = frames.reduce((s, f) => s + f.width * f.height, 0);
  const compact = bboxArea > 0 ? totalImageArea / bboxArea : 0;

  // Factor 4: aspect match
  const groupRatio = bbox.width / (bbox.height || 1);
  const aspectMatch = 1 / (1 + Math.abs(Math.log(groupRatio / canvasRatio)) * 0.8);

  // Factor 5: row-width consistency (group frames by y)
  const rowMap = new Map<number, number[]>();
  for (const f of frames) {
    const yKey = Math.round(f.y * 100); // group by rounded y
    if (!rowMap.has(yKey)) rowMap.set(yKey, []);
    rowMap.get(yKey)!.push(f.x + f.width - f.x); // width of frame
  }
  // Actually compute row widths as span from leftmost x to rightmost x+w
  const rowWidths: number[] = [];
  const rowFrameMap = new Map<number, Frame[]>();
  for (const f of frames) {
    const yKey = Math.round(f.y * 100);
    if (!rowFrameMap.has(yKey)) rowFrameMap.set(yKey, []);
    rowFrameMap.get(yKey)!.push(f);
  }
  for (const [, rowFrames] of rowFrameMap) {
    const minX = Math.min(...rowFrames.map((f) => f.x));
    const maxXW = Math.max(...rowFrames.map((f) => f.x + f.width));
    rowWidths.push(maxXW - minX);
  }
  const minRowWidth = Math.min(...rowWidths);
  const maxRowWidth = Math.max(...rowWidths);
  const rowWidthScore = maxRowWidth > 0 ? minRowWidth / maxRowWidth : 1;

  // Factor 6: row count balance
  const rowCounts = Array.from(rowFrameMap.values()).map((rf) => rf.length);
  const maxPerRow = Math.max(...rowCounts);
  const idealMaxPerRow = Math.max(3, Math.round(Math.sqrt(n) * Math.sqrt(canvasRatio)));
  const rowCountOK = maxPerRow <= idealMaxPerRow
    ? 1.0
    : Math.max(0.3, 1.0 - (maxPerRow - idealMaxPerRow) * 0.15);

  // Factor 7: area balance
  const areas = frames.map((f) => f.width * f.height);
  const maxArea = Math.max(...areas);
  const minArea = Math.min(...areas);
  const areaRatio = minArea > 0 ? maxArea / minArea : Infinity;
  const areaOK = areaRatio <= areaLimit
    ? 1.0
    : Math.max(0, 1.0 - (areaRatio - areaLimit) * 0.15);

  // Multiplicative formula
  return (
    Math.pow(gapScore, 0.16) *
    Math.pow(fill, 0.16) *
    Math.pow(compact, 0.06) *
    Math.pow(aspectMatch, 0.14) *
    Math.pow(rowWidthScore, 0.18) *
    Math.pow(areaOK, 0.14) *
    Math.pow(rowCountOK, 0.16)
  );
}

// ============================================================
// Grid Pipeline (tree → frames)
// ============================================================

function gridPipeline(
  tree: TreeNode,
  images: ImageInput[],
  canvasW: number,
  canvasH: number,
  gapPx: number,
): Frame[] {
  const areaMap = treeAreas(tree, images, canvasW, canvasH);
  const sizes = computeSizes(images, areaMap);
  const rows = treeToRows(tree);
  return layoutExact(rows, images, sizes, gapPx, canvasW, canvasH);
}

// ============================================================
// 9. GA Main Loop
// ============================================================

export function gridLayout(
  images: ImageInput[],
  canvasW: number,
  canvasH: number,
  gapPx: number,
  padPx: number,
  seed: number,
  options?: GridOptions,
): Frame[] {
  if (images.length === 0) return [];

  const rng = createRNG(seed);
  const POP = options?.population ?? 50;
  const GENS = options?.generations ?? 40;
  const areaLimit = options?.areaLimit ?? 3;

  const n = images.length;

  // Handle single image
  if (n === 1) {
    const ar = images[0].aspectRatio;
    const maxW = canvasW * 0.88;
    const maxH = canvasH * 0.88;
    let w: number, h: number;
    if (maxW / maxH > ar) {
      h = maxH;
      w = h * ar;
    } else {
      w = maxW;
      h = w / ar;
    }
    const frame: Frame = {
      id: images[0].id,
      x: (canvasW - w) / 2,
      y: (canvasH - h) / 2,
      width: w,
      height: h,
    };
    return scaleToFit([frame], canvasW, canvasH, padPx);
  }

  // Initial population: 2 balanced trees + rest random
  const indices = Array.from({ length: n }, (_, i) => i);
  const population: TreeNode[] = [];

  population.push(balancedTree(indices, 0));
  population.push(balancedTree(indices, 1));

  for (let i = 2; i < POP; i++) {
    population.push(randomTree(n, rng));
  }

  let bestTree = population[0];
  let bestScore = -Infinity;

  for (let gen = 0; gen < GENS; gen++) {
    // Score all
    const scored: Array<{ tree: TreeNode; score: number }> = [];
    for (const tree of population) {
      const frames = gridPipeline(tree, images, canvasW, canvasH, gapPx);
      const score = gridScore(frames, canvasW, canvasH, gapPx, areaLimit);
      scored.push({ tree, score });

      if (score > bestScore) {
        bestScore = score;
        bestTree = deepClone(tree);
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Keep top 30%
    const keepCount = Math.max(1, Math.floor(POP * 0.3));
    const survivors = scored.slice(0, keepCount).map((s) => s.tree);

    // Refill population
    population.length = 0;
    for (const s of survivors) {
      population.push(s);
    }
    while (population.length < POP) {
      const parent = survivors[Math.floor(rng() * survivors.length)];
      population.push(mutate(parent, rng));
    }
  }

  // Final layout with best tree
  const finalFrames = gridPipeline(bestTree, images, canvasW, canvasH, gapPx);
  return scaleToFit(finalFrames, canvasW, canvasH, padPx);
}
