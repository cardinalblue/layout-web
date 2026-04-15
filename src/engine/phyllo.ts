import type { ImageInput, Frame, PhylloOptions, BBox } from './types';
import {
  createRNG,
  shuffle,
  rectDist,
  boundingBox,
  scaleToFit,
  nearestNeighborDist,
  countOverlaps,
  createPerlin2D,
} from './shared';
import type { RNG } from './types';

// ============================================================
// Constants
// ============================================================

const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = (2 * Math.PI) / (PHI * PHI);
const MAX_SOLVER_ITERS = 300;
const POST_SCALE_ITERS = 50;

// ============================================================
// Phase 1 — Size Assignment
// ============================================================

interface SizedImage {
  id: string;
  aspectRatio: number;
  width: number;
  height: number;
}

function assignSizes(
  images: ImageInput[],
  availW: number,
  availH: number,
  density: number,
  sizeVar: number,
  rng: RNG,
): SizedImage[] {
  const n = images.length;
  const order = shuffle(images, rng);
  const totalArea = availW * availH * density;
  const baseArea = totalArea / n;

  const targetAreas: number[] = new Array(n);
  for (let rank = 0; rank < n; rank++) {
    const t = rank / Math.max(n - 1, 1);
    const multiplier = 1 + (1 - t) * sizeVar * 1.2;
    targetAreas[rank] = baseArea * multiplier;
  }

  // Normalize so sum equals totalArea
  let sum = 0;
  for (let i = 0; i < n; i++) sum += targetAreas[i];
  const scale = totalArea / sum;
  for (let i = 0; i < n; i++) targetAreas[i] *= scale;

  const result: SizedImage[] = new Array(n);
  for (let rank = 0; rank < n; rank++) {
    const img = order[rank];
    const h = Math.sqrt(targetAreas[rank] / img.aspectRatio);
    const w = h * img.aspectRatio;
    result[rank] = {
      id: img.id,
      aspectRatio: img.aspectRatio,
      width: w,
      height: h,
    };
  }
  return result;
}

// ============================================================
// Phase 2 — Elliptical Spiral Placement
// ============================================================

function spiralPlace(
  sized: SizedImage[],
  canvasW: number,
  canvasH: number,
  availW: number,
  availH: number,
  rng: RNG,
): Frame[] {
  const n = sized.length;
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const canvasRatio = availW / availH;

  const baseR = Math.min(availW, availH) * 0.35;
  const ellipseRx = baseR * Math.max(1, Math.sqrt(canvasRatio));
  const ellipseRy = baseR * Math.max(1, Math.sqrt(1 / canvasRatio));

  const frames: Frame[] = new Array(n);
  for (let rank = 0; rank < n; rank++) {
    const img = sized[rank];
    const angle = rank * GOLDEN_ANGLE + (rng() * 0.4 - 0.2);
    const t = rank === 0 ? 0 : Math.sqrt(rank / n);
    frames[rank] = {
      id: img.id,
      x: cx + Math.cos(angle) * ellipseRx * t - img.width / 2,
      y: cy + Math.sin(angle) * ellipseRy * t - img.height / 2,
      width: img.width,
      height: img.height,
    };
  }
  return frames;
}

// ============================================================
// Phase 3 — Constraint Solver
// ============================================================

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function constraintSolver(
  frames: Frame[],
  canvasW: number,
  canvasH: number,
  availW: number,
  availH: number,
  gapPx: number,
  padPx: number,
): void {
  const n = frames.length;
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const canvasRatio = availW / availH;

  for (let iter = 0; iter < MAX_SOLVER_ITERS; iter++) {
    const decay = Math.max(0.25, 1 - iter / MAX_SOLVER_ITERS);
    const progress = iter / MAX_SOLVER_ITERS;

    // --- 3a. Collision Resolution ---
    let totalOverlapArea = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const A = frames[i];
        const B = frames[j];
        const sepX = (A.width + B.width) / 2 + gapPx;
        const sepY = (A.height + B.height) / 2 + gapPx;
        const dx = (A.x + A.width / 2) - (B.x + B.width / 2);
        const dy = (A.y + A.height / 2) - (B.y + B.height / 2);
        const overlapX = sepX - Math.abs(dx);
        const overlapY = sepY - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          totalOverlapArea += overlapX * overlapY;
          const pushFactor = 0.55 * decay;
          if (overlapX < overlapY) {
            const push = overlapX * pushFactor;
            const sign = dx >= 0 ? 1 : -1;
            A.x += sign * push;
            B.x -= sign * push;
          } else {
            const push = overlapY * pushFactor;
            const sign = dy >= 0 ? 1 : -1;
            A.y += sign * push;
            B.y -= sign * push;
          }
        }
      }
    }

    // --- 3b. Anisotropic Center Gravity ---
    const gravBase = 0.035 * decay;
    const gravX = gravBase * (canvasRatio < 1 ? 1.2 : 0.8);
    const gravY = gravBase * (canvasRatio > 1 ? 1.2 : 0.8);
    for (let i = 0; i < n; i++) {
      const f = frames[i];
      f.x += (cx - (f.x + f.width / 2)) * gravX;
      f.y += (cy - (f.y + f.height / 2)) * gravY;
    }

    // --- 3c. Canvas Spread Force (active 10% to 60%) ---
    if (progress >= 0.1 && progress <= 0.6) {
      const groupBBox = boundingBox(frames);
      const targetW = availW * 0.85;
      const targetH = availH * 0.85;
      const spreadStr = 0.008 * decay;

      if (groupBBox.width < targetW * 0.7) {
        for (let i = 0; i < n; i++) {
          const f = frames[i];
          const fromCenter = (f.x + f.width / 2) - cx;
          f.x += fromCenter * spreadStr * 2;
        }
      }
      if (groupBBox.height < targetH * 0.7) {
        for (let i = 0; i < n; i++) {
          const f = frames[i];
          const fromCenter = (f.y + f.height / 2) - cy;
          f.y += fromCenter * spreadStr * 2;
        }
      }

      // --- 3d. Aspect Ratio Correction (same window as spread) ---
      const groupR = groupBBox.width / groupBBox.height;
      const targetR = availW / availH;
      const arStr = 0.006 * decay;

      if (groupR > targetR * 1.15) {
        for (let i = 0; i < n; i++) {
          const f = frames[i];
          f.x += (cx - (f.x + f.width / 2)) * arStr;
        }
      } else if (groupR < targetR * 0.85) {
        for (let i = 0; i < n; i++) {
          const f = frames[i];
          f.y += (cy - (f.y + f.height / 2)) * arStr;
        }
      }
    }

    // --- 3e. Gap Targeting (active after 30% of iterations) ---
    if (progress > 0.3) {
      const gapStr = 0.015 * decay;
      for (let i = 0; i < n; i++) {
        const A = frames[i];
        // Find nearest neighbor by rectDist
        let minDist = Infinity;
        let nearestIdx = -1;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const d = rectDist(A, frames[j]);
          if (d < minDist) {
            minDist = d;
            nearestIdx = j;
          }
        }
        if (nearestIdx >= 0 && minDist > gapPx * 1.8) {
          const B = frames[nearestIdx];
          const dirX = (B.x + B.width / 2) - (A.x + A.width / 2);
          const dirY = (B.y + B.height / 2) - (A.y + A.height / 2);
          const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
          if (dirLen > 0) {
            const pull = (minDist - gapPx) * gapStr;
            A.x += (dirX / dirLen) * pull;
            A.y += (dirY / dirLen) * pull;
          }
        }
      }
    }

    // --- 3f. Boundary Clamp ---
    for (let i = 0; i < n; i++) {
      const f = frames[i];
      f.x = clamp(f.x, padPx, canvasW - f.width - padPx);
      f.y = clamp(f.y, padPx, canvasH - f.height - padPx);
    }

    // --- Early exit ---
    if (totalOverlapArea < 0.1 && iter > 40) break;
  }
}

// ============================================================
// Phase 5 — Post-Scale Overlap Fix
// ============================================================

function postScaleOverlapFix(
  frames: Frame[],
  canvasW: number,
  canvasH: number,
  padPx: number,
): void {
  const n = frames.length;
  const relaxedPad = padPx * 0.5;

  for (let iter = 0; iter < POST_SCALE_ITERS; iter++) {
    let anyOverlap = false;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const A = frames[i];
        const B = frames[j];
        const sepX = (A.width + B.width) / 2 + 1;
        const sepY = (A.height + B.height) / 2 + 1;
        const dx = (A.x + A.width / 2) - (B.x + B.width / 2);
        const dy = (A.y + A.height / 2) - (B.y + B.height / 2);
        const overlapX = sepX - Math.abs(dx);
        const overlapY = sepY - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          anyOverlap = true;
          const pushFactor = 0.52;
          if (overlapX < overlapY) {
            const push = overlapX * pushFactor;
            const sign = dx >= 0 ? 1 : -1;
            A.x += sign * push;
            B.x -= sign * push;
          } else {
            const push = overlapY * pushFactor;
            const sign = dy >= 0 ? 1 : -1;
            A.y += sign * push;
            B.y -= sign * push;
          }
        }
      }
    }

    // Clamp with relaxed padding
    for (let i = 0; i < n; i++) {
      const f = frames[i];
      f.x = clamp(f.x, relaxedPad, canvasW - f.width - relaxedPad);
      f.y = clamp(f.y, relaxedPad, canvasH - f.height - relaxedPad);
    }

    if (!anyOverlap) break;
  }
}

// ============================================================
// Phase 6 — Aesthetic Rotation
// ============================================================

function applyRotation(
  frames: Frame[],
  seed: number,
  rotationStrength: number,
): void {
  const perlin = createPerlin2D(seed);
  const freq = 0.007;

  for (let index = 0; index < frames.length; index++) {
    const f = frames[index];
    const ncx = f.x + f.width / 2;
    const ncy = f.y + f.height / 2;
    const baseRot = perlin(ncx * freq, ncy * freq) * 6;
    const altBias = (index % 2 === 0 ? 1 : -1) * 1.5;
    f.rotation = (baseRot + altBias) * rotationStrength;
  }
}

// ============================================================
// Phyllo Scoring
// ============================================================

function phylloScore(
  frames: Frame[],
  canvasW: number,
  canvasH: number,
  gapPx: number,
): number {
  const overlapCount = countOverlaps(frames);
  if (overlapCount > 0) return -overlapCount;

  const bbox = boundingBox(frames);
  const groupR = bbox.width / bbox.height;
  const canvasR = canvasW / canvasH;
  const aspectMatch = 1 / (1 + Math.abs(Math.log(groupR / canvasR)) * 1.5);

  const bboxArea = bbox.width * bbox.height;
  const canvasArea = canvasW * canvasH;
  const coverage = Math.min(bboxArea / canvasArea, 1);

  // Gap harmony
  const n = frames.length;
  const gaps: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    gaps[i] = nearestNeighborDist(frames, i);
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += gaps[i];
  mean /= n;

  let variance = 0;
  for (let i = 0; i < n; i++) {
    const diff = gaps[i] - mean;
    variance += diff * diff;
  }
  const stddev = Math.sqrt(variance / n);
  const cv = mean > 0 ? stddev / mean : 0;
  const gapHarmony = 1 / (1 + cv * 2);

  return Math.pow(aspectMatch, 0.35) * Math.pow(coverage, 0.30) * Math.pow(gapHarmony, 0.35);
}

// ============================================================
// Phyllo Pipeline (single trial)
// ============================================================

function phylloPipeline(
  images: ImageInput[],
  canvasW: number,
  canvasH: number,
  gapPx: number,
  padPx: number,
  seed: number,
  options: Required<PhylloOptions>,
): Frame[] {
  const rng = createRNG(seed);
  const availW = canvasW - padPx * 2;
  const availH = canvasH - padPx * 2;

  // Phase 1 — Size Assignment
  const sized = assignSizes(images, availW, availH, options.density, options.sizeVar, rng);

  // Phase 2 — Elliptical Spiral Placement
  const frames = spiralPlace(sized, canvasW, canvasH, availW, availH, rng);

  // Phase 3 — Constraint Solver
  constraintSolver(frames, canvasW, canvasH, availW, availH, gapPx, padPx);

  // Phase 4 — Scale to Fit
  const scaled = scaleToFit(frames, canvasW, canvasH, padPx);

  // Phase 5 — Post-Scale Overlap Fix (mutates in place)
  postScaleOverlapFix(scaled, canvasW, canvasH, padPx);

  // Phase 6 — Aesthetic Rotation
  applyRotation(scaled, seed, options.rotation);

  return scaled;
}

// ============================================================
// Multi-Trial Selector — public API
// ============================================================

export function phylloLayout(
  images: ImageInput[],
  canvasW: number,
  canvasH: number,
  gapPx: number,
  padPx: number,
  seed: number,
  options?: PhylloOptions,
): Frame[] {
  if (images.length === 0) return [];

  const opts: Required<PhylloOptions> = {
    sizeVar: options?.sizeVar ?? 0.5,
    rotation: options?.rotation ?? 1.0,
    density: options?.density ?? 0.55,
    maxTrials: options?.maxTrials ?? 10,
  };

  let bestFrames: Frame[] = [];
  let bestScore = -Infinity;

  for (let trial = 0; trial < opts.maxTrials; trial++) {
    const trialSeed = seed * 1000 + trial * 7 + 1;
    const frames = phylloPipeline(images, canvasW, canvasH, gapPx, padPx, trialSeed, opts);
    const score = phylloScore(frames, canvasW, canvasH, gapPx);

    if (score > bestScore) {
      bestScore = score;
      bestFrames = frames;
    }

    if (score > 0.7) break;
  }

  // Return immutable copies
  return bestFrames.map((f) => ({ ...f }));
}
