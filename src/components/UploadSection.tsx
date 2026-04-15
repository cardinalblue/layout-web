'use client';

import { useState, useMemo, useCallback } from 'react';
import type { LayoutMode, Frame } from '../engine/types';
import { gridLayout } from '../engine/grid';
import { phylloLayout } from '../engine/phyllo';
import { CANVAS_RATIOS } from '../data/imageSets';
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

export default function UploadSection() {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [mode, setMode] = useState<LayoutMode>('grid');
  const [seed, setSeed] = useState(100);
  const [params, setParams] = useState<LayoutParams>(DEFAULT_PARAMS);

  const processFiles = useCallback((files: File[]) => {
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const photo: UploadedPhoto = {
            id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            src,
            aspectRatio: img.naturalWidth / img.naturalHeight,
            filename: file.name,
          };
          setPhotos((prev) => [...prev, photo]);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const canvasRatioDef = CANVAS_RATIOS[params.canvasRatio] ?? CANVAS_RATIOS['4:3'];
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
    const gapPx = shortEdge * params.gapPercent / 100;
    const padPx = shortEdge * params.paddingPercent / 100;
    if (mode === 'grid') {
      return gridLayout(images, canvasW, canvasH, gapPx, padPx, seed, {
        areaLimit: params.areaLimit,
      });
    }
    return phylloLayout(images, canvasW, canvasH, gapPx, padPx, seed, {
      sizeVar: params.sizeVar,
      rotation: params.rotation,
      density: params.density,
      maxTrials: params.maxTrials,
    });
  }, [mode, seed, images, canvasW, canvasH, params]);

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
      />

      {photoCountHint && (
        <p className="font-body mt-2 mb-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          ℹ {photoCountHint}
        </p>
      )}

      {photos.length > 0 && (
        <div className="mt-6">
          <div className="mb-5 flex flex-wrap items-center gap-4">
            <ModeSwitch mode={mode} onModeChange={setMode} />
          </div>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
            {/* Parameters — below canvas on mobile */}
            <div className="order-2 w-full shrink-0 lg:order-1 lg:w-[340px]">
              <ParameterPanel
                mode={mode}
                params={params}
                onParamsChange={setParams}
                compact
              />
            </div>

            {/* Canvas + controls — on top on mobile */}
            <div className="order-1 flex min-w-0 flex-1 flex-col gap-4 lg:order-2">
              <CanvasPreview
                frames={frames}
                canvasW={canvasW}
                canvasH={canvasH}
                mode={mode}
                images={imageSources}
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
