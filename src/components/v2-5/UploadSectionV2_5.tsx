'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutV9Input, TextRenderOpts, TextScrapInput } from '../../engine/v9_5/types';
import { genItems } from '../../engine/v9_5/items';
import { runGridV9, runPhylloV9 } from '../../engine/v9_5/layout';
import { normalizedCanvas } from '../../engine/v9_5/shared';
import { V9_CANVAS_RATIOS } from '../../data/v9/imageSets';
import { DEFAULT_CANVAS_BG } from '../../data/imageSets';
import { SAMPLE_PHOTOS, type SamplePhoto } from '../../data/v9/samplePhotos';
import { photosEqual, type StagedPhoto } from '../v9/stagedPhotos';
import ParameterPanelV9, { DEFAULT_PARAMS_V9, type ParamsV9 } from '../v9/ParameterPanelV9';
import DualCanvasView from '../v9/DualCanvasView';
import SamplePhotoPicker from '../v9/SamplePhotoPicker';
import GenerateLayoutButton from '../v9/GenerateLayoutButton';
import SeedControls from '../SeedControls';
import ShuffleButton from '../ShuffleButton';
import DropZone from '../DropZone';
import ThumbnailRow from '../ThumbnailRow';

const MAX_IMAGE_SIZE = 1200;
const JPEG_QUALITY = 0.85;

function resizeImage(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
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
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no context'));
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve({ blob, width: w, height: h });
          else reject(new Error('Failed to compress'));
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load'));
    };
    img.src = url;
  });
}

function isColorDark(hex: string): boolean {
  const parsed = hex.startsWith('#') ? hex.slice(1) : hex;
  if (parsed.length < 6) return true;
  const r = parseInt(parsed.slice(0, 2), 16);
  const g = parseInt(parsed.slice(2, 4), 16);
  const b = parseInt(parsed.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.6;
}

function sampleToStaged(sample: SamplePhoto): StagedPhoto {
  return {
    id: sample.id,
    src: sample.src,
    aspectRatio: sample.aspectRatio,
    filename: sample.filename,
    source: 'sample',
  };
}

const UPLOAD_DEFAULT_SCRAPS: TextScrapInput[] = [];

export default function UploadSectionV2_5() {
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhoto[]>([]);
  const [committedPhotos, setCommittedPhotos] = useState<StagedPhoto[]>([]);
  const [seed, setSeed] = useState(100);
  const [params, setParams] = useState<ParamsV9>(DEFAULT_PARAMS_V9);
  const [debouncedParams, setDebouncedParams] = useState<ParamsV9>(DEFAULT_PARAMS_V9);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_CANVAS_BG);
  const [scraps, setScraps] = useState<TextScrapInput[]>(UPLOAD_DEFAULT_SCRAPS);
  const [debouncedScraps, setDebouncedScraps] = useState<TextScrapInput[]>(UPLOAD_DEFAULT_SCRAPS);
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

  const processFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      try {
        const { blob, width, height } = await resizeImage(file);
        const src = URL.createObjectURL(blob);
        const photo: StagedPhoto = {
          id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          src,
          aspectRatio: width / height,
          filename: file.name,
          source: 'upload',
        };
        setStagedPhotos((prev) => [...prev, photo]);
      } catch {
        // Skip failed uploads
      }
    }
  }, []);

  const removeStagedPhoto = useCallback((id: string) => {
    setStagedPhotos((prev) => {
      const removed = prev.find((p) => p.id === id);
      if (
        removed &&
        removed.source === 'upload' &&
        !committedPhotos.some((c) => c.id === id)
      ) {
        URL.revokeObjectURL(removed.src);
      }
      return prev.filter((p) => p.id !== id);
    });
  }, [committedPhotos]);

  const clearAllStaged = useCallback(() => {
    setStagedPhotos((prev) => {
      for (const p of prev) {
        if (p.source === 'upload' && !committedPhotos.some((c) => c.id === p.id)) {
          URL.revokeObjectURL(p.src);
        }
      }
      return [];
    });
  }, [committedPhotos]);

  const handleSampleToggle = useCallback((sample: SamplePhoto) => {
    setStagedPhotos((prev) => {
      if (prev.some((p) => p.id === sample.id)) {
        return prev.filter((p) => p.id !== sample.id);
      }
      return [...prev, sampleToStaged(sample)];
    });
  }, []);

  const handleToggleAllSamples = useCallback(() => {
    setStagedPhotos((prev) => {
      const stagedIds = new Set(prev.map((p) => p.id));
      const allSelected = SAMPLE_PHOTOS.every((s) => stagedIds.has(s.id));
      if (allSelected) {
        return prev.filter((p) => p.source !== 'sample');
      }
      const missing = SAMPLE_PHOTOS.filter((s) => !stagedIds.has(s.id));
      return [...prev, ...missing.map(sampleToStaged)];
    });
  }, []);

  const handleGenerate = useCallback(() => {
    // Revoke upload blob URLs for photos dropped from the committed set.
    for (const old of committedPhotos) {
      if (
        old.source === 'upload' &&
        !stagedPhotos.some((s) => s.id === old.id)
      ) {
        URL.revokeObjectURL(old.src);
      }
    }
    setCommittedPhotos(stagedPhotos);
  }, [committedPhotos, stagedPhotos]);

  useEffect(
    () => () => {
      if (paramTimer.current) clearTimeout(paramTimer.current);
      if (scrapTimer.current) clearTimeout(scrapTimer.current);
    },
    [],
  );

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

  const hasCommittedContent =
    committedPhotos.length > 0 ||
    debouncedScraps.some((s) => (s.text || '').length > 0);

  const items = useMemo(() => {
    if (!hasCommittedContent) return [];
    const { NW } = normalizedCanvas(canvasRatio);
    return genItems({
      imgCount: committedPhotos.length,
      textScraps: debouncedScraps.filter((s) =>
        s.isPaired ? (s.title ?? '').length > 0 || (s.subtitle ?? '').length > 0 : s.text.length > 0,
      ),
      ratioMode: debouncedParams.ratioMode,
      seed,
      setId: debouncedParams.imgSet,
      NW,
      minFS: debouncedParams.minFS,
      textBoxSize: debouncedParams.textBoxSize,
      imageRatios: committedPhotos.map((p) => p.aspectRatio),
      imageIds: committedPhotos.map((p) => p.id),
    });
  }, [canvasRatio, debouncedParams, debouncedScraps, committedPhotos, seed, hasCommittedContent]);

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

  const imageSources: Record<string, string> = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of committedPhotos) out[p.id] = p.src;
    return out;
  }, [committedPhotos]);

  const isDarkBg = useMemo(() => isColorDark(bgColor), [bgColor]);

  const stagedSampleIds = useMemo(
    () => new Set(stagedPhotos.filter((p) => p.source === 'sample').map((p) => p.id)),
    [stagedPhotos],
  );

  const isDirty = useMemo(
    () => !photosEqual(stagedPhotos, committedPhotos),
    [stagedPhotos, committedPhotos],
  );

  const handleShuffle = useCallback(() => setSeed(Math.floor(Math.random() * 10000)), []);

  const handleReset = useCallback(() => {
    const stagedIds = new Set(stagedPhotos.map((p) => p.id));
    for (const p of stagedPhotos) {
      if (p.source === 'upload') URL.revokeObjectURL(p.src);
    }
    for (const p of committedPhotos) {
      if (p.source === 'upload' && !stagedIds.has(p.id)) {
        URL.revokeObjectURL(p.src);
      }
    }
    setStagedPhotos([]);
    setCommittedPhotos([]);
    setParams(DEFAULT_PARAMS_V9);
    setDebouncedParams(DEFAULT_PARAMS_V9);
    setBgColor(DEFAULT_CANVAS_BG);
    setScraps(UPLOAD_DEFAULT_SCRAPS);
    setDebouncedScraps(UPLOAD_DEFAULT_SCRAPS);
  }, [stagedPhotos, committedPhotos]);

  const hint =
    stagedPhotos.length === 0 && debouncedScraps.every((s) => !s.text)
      ? null
      : stagedPhotos.length < 3 && stagedPhotos.length > 0
        ? `Add ${3 - stagedPhotos.length} more photo${stagedPhotos.length === 2 ? '' : 's'} for best results`
        : null;

  const showCanvasBlock = hasCommittedContent;
  const showActionsBlock = stagedPhotos.length > 0 || hasCommittedContent;

  return (
    <section
      className="mx-auto w-full px-4 sm:px-6 lg:px-8"
      style={{ maxWidth: '1200px' }}
      aria-labelledby="upload-v2-5-title"
    >
      <h2
        id="upload-v2-5-title"
        className="font-heading mb-6 text-2xl font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        Try With Your Photos
      </h2>

      <div className="mb-4">
        <DropZone onFilesSelected={processFiles} />
      </div>

      <div className="mb-4">
        <SamplePhotoPicker
          selectedIds={stagedSampleIds}
          onToggle={handleSampleToggle}
          onToggleAll={handleToggleAllSamples}
        />
      </div>

      <ThumbnailRow
        photos={stagedPhotos.map((p) => ({ id: p.id, src: p.src, filename: p.filename }))}
        onRemove={removeStagedPhoto}
        onClearAll={clearAllStaged}
        onAddMore={processFiles}
      />

      {hint && (
        <p className="font-body mt-2 mb-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          {hint}
        </p>
      )}

      {showActionsBlock && (
        <div className="mt-6 flex flex-col gap-6">
          <div className="flex justify-center md:justify-end">
            <GenerateLayoutButton
              stagedCount={stagedPhotos.length}
              isDirty={isDirty}
              hasCommitted={committedPhotos.length > 0}
              onClick={handleGenerate}
            />
          </div>

          {showCanvasBlock && (
            <div className="flex flex-col gap-4">
              <DualCanvasView
                grid={grid}
                phyllo={phyllo}
                tOpts={tOpts}
                images={imageSources}
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
          )}

          <div className="mx-auto w-full" style={{ maxWidth: '960px' }}>
            <ParameterPanelV9
              params={params}
              onChange={handleParams}
              bgColor={bgColor}
              onBgColorChange={setBgColor}
              scraps={scraps}
              onScrapsChange={handleScraps}
              hideImageSource
              onReset={handleReset}
            />
          </div>
        </div>
      )}
    </section>
  );
}
