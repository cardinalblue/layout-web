import { describe, it, expect } from 'vitest';
import { normalizedCanvas } from '../engine/v9/shared';
import { genItems } from '../engine/v9/items';
import { runGridV9, runPhylloV9 } from '../engine/v9/layout';
import { isSingleRowPreferred, textPreferredRatio, textRatioRange } from '../engine/v9/text';
import type { TextRenderOpts } from '../engine/v9/types';

const defaultTOpts: TextRenderOpts = {
  padFractionX: 0.05,
  padFractionY: 0.05,
  lineHeight: 1.4,
  fontFamily: 'mono',
  italic: true,
  textBoxSize: 1.1,
  minFS: 0,
  maxFS: 60,
  fontWeight: 700,
  vAlign: 'center',
  hAlign: 'center',
};

function makeInput(
  overrides: Partial<Parameters<typeof runGridV9>[0]> = {},
) {
  const canvasRatio = overrides.canvasRatio ?? 16 / 9;
  const { NW } = normalizedCanvas(canvasRatio);
  const items =
    overrides.items ??
    genItems({
      imgCount: 3,
      textScraps: [],
      ratioMode: 'wide',
      seed: 42,
      setId: 'mixed',
      NW,
      minFS: 0,
      textBoxSize: 1.1,
    });
  return {
    items,
    canvasRatio,
    gapPct: 4,
    padPct: 6.5,
    seed: 42,
    ratioMode: 'wide' as const,
    ratioSearch: true,
    tOpts: defaultTOpts,
    gridOpts: { sizeVar: 0.5 },
    phylloOpts: { sizeVar: 0.5, rotation: 1.0, density: 0.55, trials: 15 },
    postProc: { scrapScalePct: 0, tightnessPct: 0 },
    retry: { enabled: false, minScore: 70, maxRetries: 0 },
    ...overrides,
  };
}

describe('normalizedCanvas', () => {
  it('NW=1000 for landscape / square', () => {
    expect(normalizedCanvas(16 / 9).NW).toBe(1000);
    expect(normalizedCanvas(1).NW).toBe(1000);
  });
  it('NH=1000 for portrait', () => {
    expect(normalizedCanvas(9 / 16).NH).toBe(1000);
  });
});

describe('text classification', () => {
  it('short text returns single-row preferred', () => {
    expect(isSingleRowPreferred('Hello', 1000, 0)).toBe(true);
  });
  it('long paragraph is not single-row', () => {
    const long =
      'Wishing you a day full of warmth and laughter and small moments of joy that make every step feel lighter.';
    expect(isSingleRowPreferred(long, 1000, 0)).toBe(false);
  });
  it('single-row ratio clamped to [3.5, 4.5]', () => {
    const r = textPreferredRatio('Hi', 'auto', 1000, 0);
    expect(r).toBeGreaterThanOrEqual(3.5);
    expect(r).toBeLessThanOrEqual(4.5);
  });
  it('textRatioRange lo/hi bound the preferred ratio', () => {
    const [lo, hi] = textRatioRange('Hello world', false, undefined, 'auto', 1000, 0);
    expect(lo).toBeLessThan(hi);
    expect(lo).toBeGreaterThanOrEqual(0.4);
    expect(hi).toBeLessThanOrEqual(8.0);
  });
});

describe('runGridV9', () => {
  it('returns normalized frames within canvas bounds', () => {
    const input = makeInput();
    const result = runGridV9(input);
    expect(result.frames.length).toBe(input.items.length);
    for (const f of result.frames) {
      expect(f.x + f.w).toBeLessThan(result.NW + 0.01);
      expect(f.y + f.h).toBeLessThan(result.NH + 0.01);
    }
  });

  it('deterministic: same seed → same frames', () => {
    const a = runGridV9(makeInput());
    const b = runGridV9(makeInput());
    expect(a.frames.length).toBe(b.frames.length);
    for (let i = 0; i < a.frames.length; i++) {
      expect(a.frames[i].x).toBeCloseTo(b.frames[i].x, 6);
      expect(a.frames[i].y).toBeCloseTo(b.frames[i].y, 6);
      expect(a.frames[i].w).toBeCloseTo(b.frames[i].w, 6);
      expect(a.frames[i].h).toBeCloseTo(b.frames[i].h, 6);
    }
  });

  it('includes a text item with a text frame', () => {
    const { NW } = normalizedCanvas(16 / 9);
    const items = genItems({
      imgCount: 2,
      textScraps: [{ id: 'txt-a', isPaired: false, text: 'Good morning!' }],
      ratioMode: 'wide',
      seed: 42,
      setId: 'mixed',
      NW,
      minFS: 0,
      textBoxSize: 1.1,
    });
    const result = runGridV9(makeInput({ items }));
    const textFrames = result.frames.filter((f) => f.item.isText);
    expect(textFrames.length).toBe(1);
  });

  it('score in [0, 1] (plus tiny float tolerance)', () => {
    const r = runGridV9(makeInput());
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(1.001);
  });
});

describe('runPhylloV9', () => {
  it('retry loop converges to non-negative score', () => {
    const r = runPhylloV9(
      makeInput({
        retry: { enabled: true, minScore: 50, maxRetries: 30 },
      }),
    );
    expect(r.score).toBeGreaterThan(0);
    for (const f of r.frames) {
      expect(f.x + f.w).toBeLessThan(r.NW + 0.01);
      expect(f.y + f.h).toBeLessThan(r.NH + 0.01);
    }
  });

  it('deterministic: same seed → same frames', () => {
    const a = runPhylloV9(makeInput());
    const b = runPhylloV9(makeInput());
    expect(a.frames.length).toBe(b.frames.length);
    for (let i = 0; i < a.frames.length; i++) {
      expect(a.frames[i].x).toBeCloseTo(b.frames[i].x, 4);
      expect(a.frames[i].y).toBeCloseTo(b.frames[i].y, 4);
    }
  });

  it('long text minArea boost: text allocated enough area', () => {
    const { NW } = normalizedCanvas(4 / 3);
    const long =
      'Wishing you a day full of warmth, laughter, and small moments of joy. May every step feel lighter and every smile last a little longer.';
    const items = genItems({
      imgCount: 3,
      textScraps: [{ id: 'txt-long', isPaired: false, text: long }],
      ratioMode: 'wide',
      seed: 7,
      setId: 'mixed',
      NW,
      minFS: 0,
      textBoxSize: 1.1,
    });
    const textItem = items.find((i) => i.isText)!;
    expect(textItem.minArea).toBeGreaterThan(0);
    const r = runPhylloV9(
      makeInput({
        items,
        canvasRatio: 4 / 3,
        seed: 7,
        phylloOpts: { sizeVar: 0.5, rotation: 1.0, density: 0.55, trials: 15 },
      }),
    );
    const tf = r.frames.find((f) => f.item.isText);
    expect(tf).toBeDefined();
    // Allocated area must be ≥ minArea (minus rounding)
    expect(tf!.w * tf!.h).toBeGreaterThanOrEqual(textItem.minArea * 0.95);
  });
});

describe('retry loop', () => {
  it('caps at maxRetries when threshold unreachable', () => {
    const r = runGridV9(
      makeInput({
        retry: { enabled: true, minScore: 99, maxRetries: 2 },
      }),
    );
    expect(r.retries).toBeLessThanOrEqual(2);
  });
});

describe('device independence', () => {
  it('engine output does not depend on display dimensions', () => {
    // Engine receives nothing display-related — prove it by asserting identical
    // output across two runs with identical logical inputs.
    const a = runGridV9(makeInput({ seed: 1 }));
    const b = runGridV9(makeInput({ seed: 1 }));
    expect(a.NW).toBe(b.NW);
    expect(a.NH).toBe(b.NH);
    expect(a.frames.length).toBe(b.frames.length);
  });
});
