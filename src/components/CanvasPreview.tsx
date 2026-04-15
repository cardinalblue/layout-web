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

// Stable color assignment: same ID always gets the same color
function colorForId(id: string): string {
  // Extract numeric index from IDs like "img-3" or "upload-xxx"
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

  // Sort by ID for stable React reconciliation — ensures same DOM element order
  // across layout changes, so CSS transitions fire correctly on all elements
  const sortedFrames = [...frames].sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div
      className="relative mx-auto w-full overflow-hidden"
      style={{
        maxWidth: '640px',
        aspectRatio: `${aspectRatio}`,
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
  );
}
