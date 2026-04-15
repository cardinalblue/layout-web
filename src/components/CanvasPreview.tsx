'use client';

import type { Frame, LayoutMode } from '../engine/types';
import { PLACEHOLDER_COLORS } from '../data/imageSets';

interface CanvasPreviewProps {
  frames: Frame[];
  canvasW: number;
  canvasH: number;
  mode: LayoutMode;
  images?: { id: string; src: string }[];
}

export default function CanvasPreview({
  frames,
  canvasW,
  canvasH,
  mode,
  images,
}: CanvasPreviewProps) {
  const imageMap = new Map(images?.map((img) => [img.id, img.src]));
  const aspectRatio = canvasW / canvasH;

  return (
    <div
      className="relative mx-auto w-full overflow-hidden"
      style={{
        maxWidth: '640px',
        aspectRatio: `${aspectRatio}`,
        background: 'var(--canvas-bg)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-canvas)',
      }}
      role="img"
      aria-label={`${mode} layout preview with ${frames.length} images`}
    >
      {frames.map((frame, i) => {
        const src = imageMap.get(frame.id);
        const scaleX = 100 / canvasW;
        const scaleY = 100 / canvasH;
        const left = frame.x * scaleX;
        const top = frame.y * scaleY;
        const width = frame.width * scaleX;
        const height = frame.height * scaleY;
        const rotation = frame.rotation ?? 0;
        const hasRotation = Math.abs(rotation) > 0.1;
        const shadow = hasRotation
          ? 'var(--shadow-image-tilted)'
          : 'var(--shadow-image)';
        const color = PLACEHOLDER_COLORS[i % PLACEHOLDER_COLORS.length];

        return (
          <div
            key={frame.id}
            className="absolute transition-all"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              transform: rotation ? `rotate(${rotation}deg)` : undefined,
              transformOrigin: 'center center',
              willChange: 'transform',
              borderRadius: 'var(--radius-sm)',
              boxShadow: shadow,
              overflow: 'hidden',
              transitionDuration: 'var(--duration-normal)',
              transitionTimingFunction: 'var(--ease)',
            }}
          >
            {src ? (
              <img
                src={src}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center"
                style={{ background: color }}
              >
                <span
                  className="font-mono text-white/80"
                  style={{
                    fontSize: 'clamp(8px, 1.5vw, 12px)',
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  }}
                >
                  {(frame.width / frame.height).toFixed(1)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
