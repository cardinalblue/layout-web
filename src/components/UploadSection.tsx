'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import type { LayoutMode, Frame } from '../engine/types';
import { gridLayout } from '../engine/grid';
import { phylloLayout } from '../engine/phyllo';
import { CANVAS_RATIOS, DEFAULT_CANVAS_BG } from '../data/imageSets';
import ModeSwitch from './ModeSwitch';
import ParameterPanel, { type LayoutParams } from './ParameterPanel';
import CanvasPreview from './CanvasPreview';
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

  const frames: Frame[] = useMemo(() => {
    if (images.length === 0) return [];
    const shortEdge = Math.min(canvasW, canvasH);
    const gapPx = shortEdge * debouncedParams.gapPercent / 100;
    const padPx = shortEdge * debouncedParams.paddingPercent / 100;
    if (mode === 'grid') {
      return gridLayout(images, canvasW, canvasH, gapPx, padPx, seed, {
        areaLimit: debouncedParams.areaLimit,
      });
    }
    return phylloLayout(images, canvasW, canvasH, gapPx, padPx, seed, {
      sizeVar: debouncedParams.sizeVar,
      rotation: debouncedParams.rotation,
      density: debouncedParams.density,
      maxTrials: debouncedParams.maxTrials,
    });
  }, [mode, seed, images, canvasW, canvasH, debouncedParams]);

  const handleShuffle = useCallback(() => {
    setSeed(Math.floor(Math.random() * 10000));
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
            <div className="order-2 w-full shrink-0 lg:order-1 lg:w-[340px]">
              <ParameterPanel
                mode={mode}
                params={params}
                onParamsChange={handleParamsChange}
                compact
                canvasRatio={canvasRatio}
                onCanvasRatioChange={setCanvasRatio}
                bgColor={bgColor}
                onBgColorChange={setBgColor}
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
                />
              </div>
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
