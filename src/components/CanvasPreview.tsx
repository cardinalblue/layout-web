'use client';

import type { Frame, LayoutMode } from '../engine/types';
import { PLACEHOLDER_COLORS } from '../data/imageSets';

interface CanvasPreviewProps {
  frames: Frame[];
  canvasW: number;
  canvasH: number;
  mode: LayoutMode;
  images?: { id: string; src: string }[];
  bgColor?: string;
  borderWidth?: number;
  borderOpacity?: number;
  shadowOpacity?: number;
}

function colorForId(id: string): string {
  const match = id.match(/(\d+)/);
  const idx = match ? parseInt(match[1], 10) : 0;
  return PLACEHOLDER_COLORS[idx % PLACEHOLDER_COLORS.length];
}

// Compute display dimensions that fit within max bounds while preserving aspect ratio
const MAX_DISPLAY_W = 640;
const MAX_DISPLAY_H = 480;

function computeDisplaySize(canvasW: number, canvasH: number) {
  const ar = canvasW / canvasH;
  let w = MAX_DISPLAY_W;
  let h = w / ar;
  if (h > MAX_DISPLAY_H) {
    h = MAX_DISPLAY_H;
    w = h * ar;
  }
  return { w, h };
}

export default function CanvasPreview({
  frames,
  canvasW,
  canvasH,
  mode,
  images,
  bgColor,
  borderWidth = 0,
  borderOpacity = 0.3,
  shadowOpacity,
}: CanvasPreviewProps) {
  const imageMap = new Map(images?.map((img) => [img.id, img.src]));
  const { w: displayW } = computeDisplaySize(canvasW, canvasH);
  const sortedFrames = [...frames].sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div
      className="mx-auto w-full"
      style={{ maxWidth: `${displayW}px` }}
    >
      <div
        className="relative w-full overflow-hidden"
        style={{
          // aspect-ratio + width:100% gives correct height
          // maxWidth on parent constrains the width, so this never overflows
          aspectRatio: `${canvasW} / ${canvasH}`,
          background: bgColor ?? 'var(--canvas-bg)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-canvas)',
        }}
        role="img"
        aria-label={`${mode} layout preview with ${frames.length} images`}
      >
        {sortedFrames.map((frame) => {
          const src = imageMap.get(frame.id);
          const scaleX = 100 / canvasW;
          const scaleY = 100 / canvasH;
          const left = frame.x * scaleX;
          const top = frame.y * scaleY;
          const width = frame.width * scaleX;
          const height = frame.height * scaleY;
          const rotation = frame.rotation ?? 0;
          const hasRotation = Math.abs(rotation) > 0.1;
          const opacity = shadowOpacity ?? (hasRotation ? 0.35 : 0.25);
          const shadow = opacity > 0
            ? hasRotation
              ? `0 4px 12px rgba(0, 0, 0, ${opacity})`
              : `0 2px 8px rgba(0, 0, 0, ${opacity})`
            : 'none';
          const color = colorForId(frame.id);
          const border = borderWidth > 0
            ? `${borderWidth}px solid rgba(255, 255, 255, ${borderOpacity})`
            : undefined;

          return (
            <div
              key={frame.id}
              style={{
                position: 'absolute',
                left: `${left}%`,
                top: `${top}%`,
                width: `${width}%`,
                height: `${height}%`,
                transform: `rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                willChange: 'left, top, width, height, transform',
                borderRadius: 'var(--radius-sm)',
                boxShadow: shadow,
                border,
                boxSizing: 'border-box',
                overflow: 'hidden',
                transition: 'left 600ms cubic-bezier(0.4, 0, 0.2, 1), top 600ms cubic-bezier(0.4, 0, 0.2, 1), width 600ms cubic-bezier(0.4, 0, 0.2, 1), height 600ms cubic-bezier(0.4, 0, 0.2, 1), transform 600ms cubic-bezier(0.4, 0, 0.2, 1)',
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
    </div>
  );
}
