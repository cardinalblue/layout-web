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
}

function colorForId(id: string): string {
  const match = id.match(/(\d+)/);
  const idx = match ? parseInt(match[1], 10) : 0;
  return PLACEHOLDER_COLORS[idx % PLACEHOLDER_COLORS.length];
}

export default function CanvasPreview({
  frames,
  canvasW,
  canvasH,
  mode,
  images,
  bgColor,
}: CanvasPreviewProps) {
  const imageMap = new Map(images?.map((img) => [img.id, img.src]));
  const aspectRatio = canvasW / canvasH;
  const isPortrait = aspectRatio < 1;

  const sortedFrames = [...frames].sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div
      className="mx-auto flex items-center justify-center"
      style={{
        // Container: max 640px wide, max 500px tall (65vh on mobile)
        // Portrait canvases fit inside this box instead of overflowing
        maxWidth: isPortrait ? undefined : '640px',
        maxHeight: 'min(500px, 65vh)',
        width: '100%',
        aspectRatio: isPortrait ? undefined : undefined,
      }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          // Canvas sizes itself to fit within the container
          // Landscape: full width, height from aspect ratio
          // Portrait: full height of container, width from aspect ratio
          width: isPortrait ? 'auto' : '100%',
          height: isPortrait ? 'min(500px, 65vh)' : undefined,
          aspectRatio: `${canvasW} / ${canvasH}`,
          maxWidth: isPortrait ? '100%' : '640px',
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
          const shadow = hasRotation
            ? 'var(--shadow-image-tilted)'
            : 'var(--shadow-image)';
          const color = colorForId(frame.id);

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
