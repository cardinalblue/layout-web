import { describe, it, expect } from 'vitest';
import { createRNG, rectDist, scaleToFit, boundingBox, countOverlaps } from '../engine/shared';
import { gridLayout } from '../engine/grid';
import { phylloLayout } from '../engine/phyllo';
import type { ImageInput, Frame } from '../engine/types';

// ============================================================
// Test fixtures
// ============================================================

const MIXED_IMAGES: ImageInput[] = [
  { id: 'a', aspectRatio: 4 / 3 },
  { id: 'b', aspectRatio: 3 / 4 },
  { id: 'c', aspectRatio: 1 },
  { id: 'd', aspectRatio: 16 / 9 },
  { id: 'e', aspectRatio: 3 / 2 },
  { id: 'f', aspectRatio: 9 / 16 },
  { id: 'g', aspectRatio: 5 / 4 },
];

const CANVAS_W = 800;
const CANVAS_H = 600;
const GAP_PX = Math.min(CANVAS_W, CANVAS_H) * 0.04; // 4% of short edge = 24px
const PAD_PX = Math.min(CANVAS_W, CANVAS_H) * 0.065; // 6.5% of short edge = 39px
const SEED = 42;

// ============================================================
// Shared Utilities
// ============================================================

describe('createRNG', () => {
  it('produces values in [0, 1)', () => {
    const rng = createRNG(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic (same seed = same sequence)', () => {
    const rng1 = createRNG(999);
    const rng2 = createRNG(999);
    for (let i = 0; i < 100; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('produces roughly uniform distribution', () => {
    const rng = createRNG(77);
    const buckets = new Array(10).fill(0);
    const N = 10000;
    for (let i = 0; i < N; i++) {
      const v = rng();
      buckets[Math.floor(v * 10)]++;
    }
    // Each bucket should be roughly N/10 = 1000 ± 200
    for (const count of buckets) {
      expect(count).toBeGreaterThan(700);
      expect(count).toBeLessThan(1300);
    }
  });
});

describe('rectDist', () => {
  it('returns 0 for overlapping rectangles', () => {
    const a: Frame = { id: 'a', x: 0, y: 0, width: 100, height: 100 };
    const b: Frame = { id: 'b', x: 50, y: 50, width: 100, height: 100 };
    expect(rectDist(a, b)).toBe(0);
  });

  it('returns correct distance for adjacent rectangles', () => {
    const a: Frame = { id: 'a', x: 0, y: 0, width: 100, height: 100 };
    const b: Frame = { id: 'b', x: 110, y: 0, width: 100, height: 100 };
    expect(rectDist(a, b)).toBeCloseTo(10);
  });

  it('returns correct diagonal distance', () => {
    const a: Frame = { id: 'a', x: 0, y: 0, width: 100, height: 100 };
    const b: Frame = { id: 'b', x: 103, y: 104, width: 100, height: 100 };
    // dx = 3, dy = 4 → distance = 5
    expect(rectDist(a, b)).toBeCloseTo(5);
  });
});

describe('scaleToFit', () => {
  it('scales frames to fit within padding', () => {
    const frames: Frame[] = [
      { id: 'a', x: 390, y: 290, width: 20, height: 20 },
    ];
    const result = scaleToFit(frames, 800, 600, 40);
    // Should scale up to fill 800-80=720 x 600-80=520
    const bbox = boundingBox(result);
    expect(bbox.width).toBeLessThanOrEqual(720 + 1);
    expect(bbox.height).toBeLessThanOrEqual(520 + 1);
  });

  it('returns unchanged frames if already filling', () => {
    const frames: Frame[] = [
      { id: 'a', x: 40, y: 40, width: 720, height: 520 },
    ];
    const result = scaleToFit(frames, 800, 600, 40);
    // Scale would be ~1.0, so no change
    expect(result[0].width).toBeCloseTo(720, 0);
  });
});

// ============================================================
// Grid Layout
// ============================================================

describe('gridLayout', () => {
  it('produces correct number of frames', () => {
    const frames = gridLayout(MIXED_IMAGES, CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED);
    expect(frames).toHaveLength(7);
  });

  it('produces zero overlap for 7 mixed images on 4:3 canvas', () => {
    const frames = gridLayout(MIXED_IMAGES, CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED);
    const overlaps = countOverlaps(frames);
    expect(overlaps).toBe(0);
  });

  it('is deterministic (same seed = same output)', () => {
    const frames1 = gridLayout(MIXED_IMAGES, CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED);
    const frames2 = gridLayout(MIXED_IMAGES, CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED);
    expect(frames1).toEqual(frames2);
  });

  it('places all frames within canvas bounds', () => {
    const frames = gridLayout(MIXED_IMAGES, CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED);
    for (const f of frames) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.width).toBeLessThanOrEqual(CANVAS_W + 1);
      expect(f.y + f.height).toBeLessThanOrEqual(CANVAS_H + 1);
    }
  });

  it('preserves all image IDs', () => {
    const frames = gridLayout(MIXED_IMAGES, CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED);
    const ids = new Set(frames.map((f) => f.id));
    for (const img of MIXED_IMAGES) {
      expect(ids.has(img.id)).toBe(true);
    }
  });

  it('handles single image', () => {
    const single = [{ id: 'solo', aspectRatio: 16 / 9 }];
    const frames = gridLayout(single, CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED);
    expect(frames).toHaveLength(1);
    expect(frames[0].width).toBeGreaterThan(0);
    expect(frames[0].height).toBeGreaterThan(0);
  });

  it('handles empty input', () => {
    const frames = gridLayout([], CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED);
    expect(frames).toHaveLength(0);
  });
});

// ============================================================
// Phyllo Layout
// ============================================================

describe('phylloLayout', () => {
  it('produces correct number of frames', () => {
    const frames = phylloLayout(MIXED_IMAGES, CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED);
    expect(frames).toHaveLength(7);
  });

  it('produces zero overlap for 7 mixed images on 4:3 canvas', () => {
    const frames = phylloLayout(MIXED_IMAGES, CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED);
    const overlaps = countOverlaps(frames);
    expect(overlaps).toBe(0);
  });

  it('is deterministic (same seed = same output)', () => {
    const frames1 = phylloLayout(MIXED_IMAGES, CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED);
    const frames2 = phylloLayout(MIXED_IMAGES, CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED);
    expect(frames1).toEqual(frames2);
  });

  it('applies rotation when rotation strength > 0', () => {
    const frames = phylloLayout(MIXED_IMAGES, CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED, {
      rotation: 1.0,
    });
    const hasRotation = frames.some((f) => f.rotation !== undefined && f.rotation !== 0);
    expect(hasRotation).toBe(true);
  });

  it('applies no rotation when rotation strength = 0', () => {
    const frames = phylloLayout(MIXED_IMAGES, CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED, {
      rotation: 0,
    });
    for (const f of frames) {
      expect(Math.abs(f.rotation ?? 0)).toBeLessThan(0.001);
    }
  });

  it('preserves all image IDs', () => {
    const frames = phylloLayout(MIXED_IMAGES, CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED);
    const ids = new Set(frames.map((f) => f.id));
    for (const img of MIXED_IMAGES) {
      expect(ids.has(img.id)).toBe(true);
    }
  });

  it('handles empty input', () => {
    const frames = phylloLayout([], CANVAS_W, CANVAS_H, GAP_PX, PAD_PX, SEED);
    expect(frames).toHaveLength(0);
  });
});
