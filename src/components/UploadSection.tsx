'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { LayoutMode, Frame } from '../engine/types';
import { gridLayout } from '../engine/grid';
import { phylloLayout } from '../engine/phyllo';
import { applyScrapScale, applyTightness } from '../engine/shared';
import { CANVAS_RATIOS, DEFAULT_CANVAS_BG } from '../data/imageSets';
import ModeSwitch from './ModeSwitch';
import ParameterPanel, { type LayoutParams } from './ParameterPanel';
import CanvasPreview from './CanvasPreview';
import StatsBar from './StatsBar';
import SeedControls from './SeedControls';
import ShuffleButton from './ShuffleButton';
import DropZone from './DropZone';
import ThumbnailRow from './ThumbnailRow';

interface UploadedPhoto {
  id: string;
  src: string;
  aspectRatio: number;
  filename: string;
}

const MAX_IMAGE_SIZE = 1200;
const JPEG_QUALITY = 0.85;

const DEFAULT_PARAMS: LayoutParams = {
  imageCount: 0,
  imageSet: 'mixed',
  canvasRatio: '4:3',
  gapPercent: 4,
  paddingPercent: 6.5,
  scrapScale: 0,
  tightness: 0,
  borderWidth: 0,
  borderOpacity: 0.3,
  shadowOpacity: 0.25,
  areaLimit: 3,
  sizeVar: 0.5,
  rotation: 1,
  density: 0.55,
  maxTrials: 10,
};

const CANVAS_SIZE = 800;

function resizeImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > MAX_IMAGE_SIZE || h > MAX_IMAGE_SIZE) {
        const scale = MAX_IMAGE_SIZE / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve({ blob, width: w, height: h });
          else reject(new Error('Failed to compress image'));
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

export default function UploadSection() {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [mode, setMode] = useState<LayoutMode>('grid');
  const [seed, setSeed] = useState(100);
  const [params, setParams] = useState<LayoutParams>(DEFAULT_PARAMS);
  const [bgColor, setBgColor] = useState(DEFAULT_CANVAS_BG);
  const [canvasRatio, setCanvasRatio] = useState('4:3');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedParams, setDebouncedParams] = useState<LayoutParams>(DEFAULT_PARAMS);

  const handleParamsChange = useCallback((newParams: LayoutParams) => {
    setParams(newParams);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedParams(newParams);
    }, 100);
  }, []);

  const processFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      try {
        const { blob, width, height } = await resizeImage(file);
        const src = URL.createObjectURL(blob);
        const photo: UploadedPhoto = {
          id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          src,
          aspectRatio: width / height,
          filename: file.name,
        };
        setPhotos((prev) => [...prev, photo]);
      } catch {
        // Skip failed images
      }
    }
  }, []);

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => {
      const removed = prev.find((p) => p.id === id);
      if (removed) URL.revokeObjectURL(removed.src);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    setPhotos((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.src);
      return [];
    });
  }, []);

  const canvasRatioDef = CANVAS_RATIOS[canvasRatio] ?? CANVAS_RATIOS['4:3'];
  const ratio = canvasRatioDef.width / canvasRatioDef.height;
  const canvasW = ratio >= 1 ? CANVAS_SIZE : CANVAS_SIZE * ratio;
  const canvasH = ratio >= 1 ? CANVAS_SIZE / ratio : CANVAS_SIZE;

  const images = useMemo(
    () => photos.map((p) => ({ id: p.id, aspectRatio: p.aspectRatio })),
    [photos],
  );

  const imageSources = useMemo(
    () => photos.map((p) => ({ id: p.id, src: p.src })),
    [photos],
  );

  const { frames, score } = useMemo(() => {
    if (images.length === 0) return { frames: [] as Frame[], score: 0 };
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
    // Post-processing: scrap scale + tightness
    const shortEdge2 = Math.min(canvasW, canvasH);
    const scalePx = shortEdge2 * debouncedParams.scrapScale / 100;
    const tightPx = shortEdge2 * debouncedParams.tightness / 100;
    result = applyScrapScale(result, scalePx);
    result = applyTightness(result, tightPx, canvasW, canvasH);

    const coverage = (bbox.w * bbox.h) / (canvasW * canvasH);
    return { frames: result, score: Math.min(coverage, 1) };
  }, [mode, seed, images, canvasW, canvasH, debouncedParams]);

  // Auto-retry when score < 50%
  const retryRef = useRef(0);
  useEffect(() => {
    if (frames.length > 0 && score < 0.5 && retryRef.current < 5) {
      retryRef.current += 1;
      setSeed((s) => s + 1);
    } else {
      retryRef.current = 0;
    }
  }, [frames, score]);

  const handleShuffle = useCallback(() => {
    setSeed(Math.floor(Math.random() * 10000));
  }, []);

  const handleReset = useCallback(() => {
    setParams(DEFAULT_PARAMS);
    setDebouncedParams(DEFAULT_PARAMS);
    setCanvasRatio('4:3');
    setBgColor(DEFAULT_CANVAS_BG);
  }, []);

  const photoCountHint = photos.length < 3
    ? photos.length === 0 ? null : `Add ${3 - photos.length} more for best results`
    : null;

  return (
    <section
      className="mx-auto w-full px-4 sm:px-6 lg:px-8"
      style={{ maxWidth: '1100px' }}
      aria-labelledby="upload-title"
    >
      <h2
        id="upload-title"
        className="font-heading mb-6 text-2xl font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        Try With Your Photos
      </h2>

      <div className="mb-4">
        <DropZone onFilesSelected={processFiles} />
      </div>

      <ThumbnailRow
        photos={photos.map((p) => ({ id: p.id, src: p.src, filename: p.filename }))}
        onRemove={removePhoto}
        onClearAll={clearAll}
        onAddMore={processFiles}
      />

      {photoCountHint && (
        <p className="font-body mt-2 mb-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          ℹ {photoCountHint}
        </p>
      )}

      {photos.length > 0 && (
        <div className="mt-6">
          {/* Mode switch only */}
          <div className="mb-5">
            <ModeSwitch mode={mode} onModeChange={setMode} />
          </div>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
            {/* Parameters — canvas ratio + bg + sliders all inside the card */}
            <div className="order-2 w-full shrink-0 lg:order-1 lg:w-[380px]">
              <ParameterPanel
                mode={mode}
                params={params}
                onParamsChange={handleParamsChange}
                compact
                canvasRatio={canvasRatio}
                onCanvasRatioChange={setCanvasRatio}
                bgColor={bgColor}
                onBgColorChange={setBgColor}
                onReset={handleReset}
              />
            </div>

            {/* Canvas + controls */}
            <div className="order-1 flex min-w-0 flex-1 flex-col gap-4 lg:order-2">
              <div className="sticky top-0 z-10 -mx-4 px-4 pb-2 pt-2 lg:static lg:mx-0 lg:px-0 lg:pb-0 lg:pt-0"
                style={{ background: 'var(--bg)' }}
              >
                <CanvasPreview
                  frames={frames}
                  canvasW={canvasW}
                  canvasH={canvasH}
                  mode={mode}
                  images={imageSources}
                  bgColor={bgColor}
                  borderWidth={debouncedParams.borderWidth}
                  borderOpacity={debouncedParams.borderOpacity}
                  shadowOpacity={debouncedParams.shadowOpacity}
                />
              </div>

              <StatsBar
                frames={frames}
                canvasW={canvasW}
                canvasH={canvasH}
                score={score}
              />

              <div className="flex flex-wrap items-center justify-center gap-4">
                <SeedControls seed={seed} mode={mode} onSeedChange={setSeed} />
                <ShuffleButton mode={mode} onShuffle={handleShuffle} />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
