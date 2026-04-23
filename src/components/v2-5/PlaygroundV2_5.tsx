'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutV9Input, TextRenderOpts, TextScrapInput } from '../../engine/v9_5/types';
import { genItems } from '../../engine/v9_5/items';
import { runGridV9, runPhylloV9 } from '../../engine/v9_5/layout';
import { normalizedCanvas } from '../../engine/v9_5/shared';
import { V9_CANVAS_RATIOS } from '../../data/v9/imageSets';
import { DEFAULT_CANVAS_BG } from '../../data/imageSets';
import ParameterPanelV9, { DEFAULT_PARAMS_V9, type ParamsV9 } from '../v9/ParameterPanelV9';
import DualCanvasView from '../v9/DualCanvasView';
import SeedControls from '../SeedControls';
import ShuffleButton from '../ShuffleButton';

const DEFAULT_SCRAPS: TextScrapInput[] = [
  { id: 'txt-greet-a', isPaired: false, text: 'Good morning!' },
  {
    id: 'txt-greet-b',
    isPaired: false,
    text:
      'Wishing you a day full of warmth, laughter, and small moments of joy. May every step feel lighter and every smile last a little longer.',
  },
];

export default function PlaygroundV2_5() {
  const [seed, setSeed] = useState(42);
  const [params, setParams] = useState<ParamsV9>(DEFAULT_PARAMS_V9);
  const [debouncedParams, setDebouncedParams] = useState<ParamsV9>(DEFAULT_PARAMS_V9);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_CANVAS_BG);
  const [scraps, setScraps] = useState<TextScrapInput[]>(DEFAULT_SCRAPS);
  const [debouncedScraps, setDebouncedScraps] = useState<TextScrapInput[]>(DEFAULT_SCRAPS);
  const paramTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleParams = useCallback((next: ParamsV9) => {
    setParams(next);
    if (paramTimer.current) clearTimeout(paramTimer.current);
    paramTimer.current = setTimeout(() => setDebouncedParams(next), 100);
  }, []);

  const handleScraps = useCallback((next: TextScrapInput[]) => {
    setScraps(next);
    if (scrapTimer.current) clearTimeout(scrapTimer.current);
    scrapTimer.current = setTimeout(() => setDebouncedScraps(next), 300);
  }, []);

  const handleShuffle = useCallback(() => setSeed(Math.floor(Math.random() * 10000)), []);
  const handleReset = useCallback(() => {
    setParams(DEFAULT_PARAMS_V9);
    setDebouncedParams(DEFAULT_PARAMS_V9);
    setBgColor(DEFAULT_CANVAS_BG);
    setScraps(DEFAULT_SCRAPS);
    setDebouncedScraps(DEFAULT_SCRAPS);
  }, []);

  const tOpts: TextRenderOpts = useMemo(
    () => ({
      padFractionX: debouncedParams.padFractionX,
      padFractionY: debouncedParams.padFractionY,
      lineHeight: debouncedParams.lineHeight,
      fontFamily: debouncedParams.fontFamily,
      italic: debouncedParams.italic,
      textBoxSize: debouncedParams.textBoxSize,
      minFS: debouncedParams.minFS,
      maxFS: debouncedParams.maxFS,
      fontWeight: debouncedParams.fontWeight,
      vAlign: 'center',
      hAlign: 'center',
    }),
    [debouncedParams],
  );

  const canvasRatio =
    V9_CANVAS_RATIOS[debouncedParams.canvasRatio]?.ratio ?? V9_CANVAS_RATIOS['16:9'].ratio;

  const items = useMemo(() => {
    const { NW } = normalizedCanvas(canvasRatio);
    return genItems({
      imgCount: debouncedParams.imgCount,
      textScraps: debouncedScraps.filter((s) =>
        s.isPaired ? (s.title ?? '').length > 0 || (s.subtitle ?? '').length > 0 : s.text.length > 0,
      ),
      ratioMode: debouncedParams.ratioMode,
      seed,
      setId: debouncedParams.imgSet,
      NW,
      minFS: debouncedParams.minFS,
      textBoxSize: debouncedParams.textBoxSize,
    });
  }, [canvasRatio, debouncedParams, debouncedScraps, seed]);

  const layoutInput: LayoutV9Input = useMemo(
    () => ({
      items,
      canvasRatio,
      gapPct: debouncedParams.gapPct,
      padPct: debouncedParams.padPct,
      seed,
      ratioMode: debouncedParams.ratioMode,
      ratioSearch: debouncedParams.ratioSearch,
      tOpts,
      gridOpts: { sizeVar: debouncedParams.gridSizeVar },
      phylloOpts: {
        sizeVar: debouncedParams.phylloSizeVar,
        rotation: debouncedParams.phylloRotation,
        density: debouncedParams.phylloDensity,
        trials: debouncedParams.phylloTrials,
      },
      postProc: {
        scrapScalePct: debouncedParams.scrapScalePct,
        tightnessPct: debouncedParams.tightnessPct,
      },
      retry: {
        enabled: debouncedParams.autoRetry,
        minScore: debouncedParams.minScore,
        maxRetries: debouncedParams.maxRetries,
      },
    }),
    [items, canvasRatio, debouncedParams, seed, tOpts],
  );

  const grid = useMemo(() => runGridV9(layoutInput), [layoutInput]);
  const phyllo = useMemo(() => runPhylloV9(layoutInput), [layoutInput]);

  const isDarkBg = useMemo(() => isColorDark(bgColor), [bgColor]);

  // Cleanup debounce timers on unmount
  useEffect(
    () => () => {
      if (paramTimer.current) clearTimeout(paramTimer.current);
      if (scrapTimer.current) clearTimeout(scrapTimer.current);
    },
    [],
  );

  return (
    <section
      id="playground-v2-5"
      className="mx-auto w-full px-4 sm:px-6 lg:px-8"
      style={{ maxWidth: '1200px' }}
      aria-labelledby="playground-v2-5-title"
    >
      <h2
        id="playground-v2-5-title"
        className="font-heading mb-6 text-2xl font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        Playground
      </h2>
      <p className="font-body mb-5 max-w-2xl text-sm" style={{ color: 'var(--text-secondary)' }}>
        Adjust any parameter — both engines re-run together. Text scraps participate in the search the
        same way images do.
      </p>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <DualCanvasView
            grid={grid}
            phyllo={phyllo}
            tOpts={tOpts}
            bgColor={bgColor}
            borderWidth={debouncedParams.borderWidth}
            textBorderOpacity={debouncedParams.textBorderOpacity}
            shadowOpacity={debouncedParams.shadowOpacity}
            isDarkBg={isDarkBg}
          />

          <div className="flex flex-wrap items-center justify-center gap-4">
            <SeedControls seed={seed} mode="grid" onSeedChange={setSeed} />
            <ShuffleButton mode="grid" onShuffle={handleShuffle} />
          </div>
        </div>

        <div className="mx-auto w-full" style={{ maxWidth: '960px' }}>
          <ParameterPanelV9
            params={params}
            onChange={handleParams}
            bgColor={bgColor}
            onBgColorChange={setBgColor}
            scraps={scraps}
            onScrapsChange={handleScraps}
            onReset={handleReset}
          />
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function isColorDark(hex: string): boolean {
  const parsed = hex.startsWith('#') ? hex.slice(1) : hex;
  if (parsed.length < 6) return true;
  const r = parseInt(parsed.slice(0, 2), 16);
  const g = parseInt(parsed.slice(2, 4), 16);
  const b = parseInt(parsed.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.6;
}
