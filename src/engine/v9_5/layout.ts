import type { LayoutV9Input, LayoutV9Result } from './types';
import {
  applyScrapScale,
  applyTightness,
  normalizedCanvas,
  retrySeed,
} from './shared';
import { runGA } from './grid';
import { bestPhyllo } from './phyllo';

function resolveRetry(
  input: LayoutV9Input,
): { enabled: boolean; minScore: number; maxRetries: number } {
  const r = input.retry;
  return {
    enabled: r?.enabled ?? true,
    minScore: r?.minScore ?? 70,
    maxRetries: r?.maxRetries ?? 60,
  };
}

function resolvePost(
  input: LayoutV9Input,
): { scrapScalePct: number; tightnessPct: number } {
  const p = input.postProc;
  return {
    scrapScalePct: p?.scrapScalePct ?? 0,
    tightnessPct: p?.tightnessPct ?? 0,
  };
}

function pctToUnits(pct: number, NW: number, NH: number): number {
  return (Math.min(NW, NH) * pct) / 100;
}

export function runGridV9(input: LayoutV9Input): LayoutV9Result {
  const { NW, NH } = normalizedCanvas(input.canvasRatio);
  const gap = pctToUnits(input.gapPct, NW, NH);
  const pad = pctToUnits(input.padPct, NW, NH);
  const retry = resolveRetry(input);
  const post = resolvePost(input);
  const sizeVar = input.gridOpts?.sizeVar ?? 0.5;

  const originalSeed = input.seed;
  let seed = originalSeed;
  let tries = 0;
  let result = runGA({
    items: input.items,
    NW,
    NH,
    gap,
    pad,
    seed,
    tOpts: input.tOpts,
    ratioMode: input.ratioMode,
    enableRatioMutation: input.ratioSearch,
    minFS: input.tOpts.minFS,
  });
  // Keep sizeVar as a placeholder until Grid uses it more directly;
  // currently size hierarchy lives in treeAreas scaling.
  void sizeVar;

  while (retry.enabled && tries < retry.maxRetries) {
    if (result.score * 100 >= retry.minScore) break;
    tries++;
    seed = retrySeed(originalSeed, tries);
    result = runGA({
      items: input.items,
      NW,
      NH,
      gap,
      pad,
      seed,
      tOpts: input.tOpts,
      ratioMode: input.ratioMode,
      enableRatioMutation: input.ratioSearch,
      minFS: input.tOpts.minFS,
    });
  }

  const scrapScaleUnits = pctToUnits(post.scrapScalePct, NW, NH);
  const tightUnits = pctToUnits(post.tightnessPct, NW, NH);
  let frames = applyScrapScale(result.frames, scrapScaleUnits);
  frames = applyTightness(frames, tightUnits, NW, NH);

  return {
    NW,
    NH,
    frames,
    score: result.score,
    retries: tries,
    capHit: retry.enabled && tries >= retry.maxRetries && result.score * 100 < retry.minScore,
    textRatios: result.textRatios,
  };
}

export function runPhylloV9(input: LayoutV9Input): LayoutV9Result {
  const { NW, NH } = normalizedCanvas(input.canvasRatio);
  const gap = pctToUnits(input.gapPct, NW, NH);
  const pad = pctToUnits(input.padPct, NW, NH);
  const retry = resolveRetry(input);
  const post = resolvePost(input);
  const opts = {
    sizeVar: input.phylloOpts?.sizeVar ?? 0.5,
    rotation: input.phylloOpts?.rotation ?? 1.0,
    density: input.phylloOpts?.density ?? 0.55,
  };
  const trials = input.phylloOpts?.trials ?? 30;

  const originalSeed = input.seed;
  let seed = originalSeed;
  let tries = 0;
  let result = bestPhyllo({
    items: input.items,
    NW,
    NH,
    gap,
    pad,
    seed,
    opts,
    trials,
    tOpts: input.tOpts,
    ratioMode: input.ratioMode,
    enableRatioSearch: input.ratioSearch,
    minFS: input.tOpts.minFS,
  });

  while (retry.enabled && tries < retry.maxRetries) {
    if (result.score * 100 >= retry.minScore) break;
    tries++;
    seed = retrySeed(originalSeed, tries);
    result = bestPhyllo({
      items: input.items,
      NW,
      NH,
      gap,
      pad,
      seed,
      opts,
      trials,
      tOpts: input.tOpts,
      ratioMode: input.ratioMode,
      enableRatioSearch: input.ratioSearch,
      minFS: input.tOpts.minFS,
    });
  }

  const scrapScaleUnits = pctToUnits(post.scrapScalePct, NW, NH);
  const tightUnits = pctToUnits(post.tightnessPct, NW, NH);
  let frames = applyScrapScale(result.frames, scrapScaleUnits);
  frames = applyTightness(frames, tightUnits, NW, NH);

  return {
    NW,
    NH,
    frames,
    score: result.score,
    retries: tries,
    capHit: retry.enabled && tries >= retry.maxRetries && result.score * 100 < retry.minScore,
    textRatios: result.textRatios,
  };
}
