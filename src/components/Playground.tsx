'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import type { LayoutMode, Frame } from '../engine/types';
import { gridLayout } from '../engine/grid';
import { phylloLayout } from '../engine/phyllo';
import { generateImages, CANVAS_RATIOS, CANVAS_BG_COLORS, DEFAULT_CANVAS_BG } from '../data/imageSets';
import ModeSwitch from './ModeSwitch';
import ParameterPanel, { type LayoutParams } from './ParameterPanel';
import CanvasPreview from './CanvasPreview';
import StatsBar from './StatsBar';
import SeedControls from './SeedControls';
import ShuffleButton from './ShuffleButton';

const DEFAULT_PARAMS: LayoutParams = {
  imageCount: 7,
  imageSet: 'mixed',
  canvasRatio: '4:3',
  gapPercent: 4,
  paddingPercent: 6.5,
  areaLimit: 3,
  sizeVar: 0.5,
  rotation: 1,
  density: 0.55,
  maxTrials: 10,
};

const CANVAS_SIZE = 800;

export default function Playground() {
  const [mode, setMode] = useState<LayoutMode>('grid');
  const [seed, setSeed] = useState(42);
  const [params, setParams] = useState<LayoutParams>(DEFAULT_PARAMS);
  const [bgColor, setBgColor] = useState(DEFAULT_CANVAS_BG);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedParams, setDebouncedParams] = useState<LayoutParams>(DEFAULT_PARAMS);

  const handleParamsChange = useCallback((newParams: LayoutParams) => {
    setParams(newParams);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedParams(newParams);
    }, 100);
  }, []);

  const canvasRatioDef = CANVAS_RATIOS[debouncedParams.canvasRatio] ?? CANVAS_RATIOS['4:3'];
  const ratio = canvasRatioDef.width / canvasRatioDef.height;
  const canvasW = ratio >= 1 ? CANVAS_SIZE : CANVAS_SIZE * ratio;
  const canvasH = ratio >= 1 ? CANVAS_SIZE / ratio : CANVAS_SIZE;

  const images = useMemo(
    () => generateImages(debouncedParams.imageSet, debouncedParams.imageCount),
    [debouncedParams.imageSet, debouncedParams.imageCount],
  );

  const { frames, score } = useMemo(() => {
    const shortEdge = Math.min(canvasW, canvasH);
    const gapPx = shortEdge * debouncedParams.gapPercent / 100;
    const padPx = shortEdge * debouncedParams.paddingPercent / 100;

    let result: Frame[];
    if (mode === 'grid') {
      result = gridLayout(images, canvasW, canvasH, gapPx, padPx, seed, {
        areaLimit: debouncedParams.areaLimit,
      });
    } else {
      result = phylloLayout(images, canvasW, canvasH, gapPx, padPx, seed, {
        sizeVar: debouncedParams.sizeVar,
        rotation: debouncedParams.rotation,
        density: debouncedParams.density,
        maxTrials: debouncedParams.maxTrials,
      });
    }

    const bbox = result.length > 0
      ? (() => {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const f of result) {
            minX = Math.min(minX, f.x);
            minY = Math.min(minY, f.y);
            maxX = Math.max(maxX, f.x + f.width);
            maxY = Math.max(maxY, f.y + f.height);
          }
          return { w: maxX - minX, h: maxY - minY };
        })()
      : { w: 0, h: 0 };
    const coverage = (bbox.w * bbox.h) / (canvasW * canvasH);
    return { frames: result, score: Math.min(coverage, 1) };
  }, [mode, seed, images, canvasW, canvasH, debouncedParams]);

  const handleShuffle = useCallback(() => {
    setSeed(Math.floor(Math.random() * 10000));
  }, []);

  return (
    <section
      id="playground"
      className="mx-auto w-full px-4 sm:px-6 lg:px-8"
      style={{ maxWidth: '1100px' }}
      aria-labelledby="playground-title"
    >
      <h2
        id="playground-title"
        className="font-heading mb-6 text-2xl font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        Playground
      </h2>

      {/* Mode switch + bg color */}
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <ModeSwitch mode={mode} onModeChange={setMode} />
        <div className="flex items-center gap-1.5">
          {CANVAS_BG_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => setBgColor(c.value)}
              className="h-5 w-5 cursor-pointer rounded-full transition-all"
              style={{
                background: c.value,
                border: bgColor === c.value
                  ? `2px solid ${mode === 'grid' ? 'var(--accent-grid)' : 'var(--accent-phyllo)'}`
                  : '1.5px solid var(--border-surface)',
                transform: bgColor === c.value ? 'scale(1.2)' : 'scale(1)',
                transitionDuration: 'var(--duration-fast)',
              }}
              aria-label={`Background: ${c.label}`}
              title={c.label}
            />
          ))}
        </div>
      </div>

      {/* Desktop: side-by-side | Mobile: canvas on top, params below */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">

        {/* === LEFT: Parameters (desktop) / Below canvas (mobile) === */}
        {/* On mobile, order-2 pushes params below canvas */}
        <div className="order-2 w-full shrink-0 lg:order-1 lg:w-[340px]">
          <ParameterPanel
            mode={mode}
            params={params}
            onParamsChange={handleParamsChange}
          />
        </div>

        {/* === RIGHT: Canvas + Stats + Controls === */}
        {/* On mobile, order-1 so canvas comes first; sticky so it stays visible */}
        <div className="order-1 flex min-w-0 flex-1 flex-col gap-4 lg:order-2">
          {/* Sticky canvas on mobile */}
          <div className="sticky top-0 z-10 -mx-4 px-4 pb-2 pt-2 lg:static lg:mx-0 lg:px-0 lg:pb-0 lg:pt-0"
            style={{ background: 'var(--bg)' }}
          >
            <CanvasPreview
              frames={frames}
              canvasW={canvasW}
              canvasH={canvasH}
              mode={mode}
              bgColor={bgColor}
            />
          </div>

          {/* Stats */}
          <StatsBar
            frames={frames}
            canvasW={canvasW}
            canvasH={canvasH}
            score={score}
          />

          {/* Seed + Shuffle */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <SeedControls seed={seed} mode={mode} onSeedChange={setSeed} />
            <ShuffleButton mode={mode} onShuffle={handleShuffle} />
          </div>
        </div>
      </div>
    </section>
  );
}
