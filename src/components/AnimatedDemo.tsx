'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Frame, LayoutMode } from '../engine/types';
import { gridLayout } from '../engine/grid';
import { phylloLayout } from '../engine/phyllo';
import { PLACEHOLDER_COLORS } from '../data/imageSets';

const DEMO_IMAGES = [
  { id: 'd0', aspectRatio: 4 / 3 },
  { id: 'd1', aspectRatio: 3 / 4 },
  { id: 'd2', aspectRatio: 1 },
  { id: 'd3', aspectRatio: 16 / 9 },
  { id: 'd4', aspectRatio: 3 / 2 },
  { id: 'd5', aspectRatio: 5 / 4 },
];

const DEMO_W = 640;
const DEMO_H = 480;
const SHORT_EDGE = Math.min(DEMO_W, DEMO_H);
const GAP = SHORT_EDGE * 0.04;
const PAD = SHORT_EDGE * 0.065;

export default function AnimatedDemo() {
  const [activeMode, setActiveMode] = useState<LayoutMode>('grid');

  // Pre-compute both layouts
  const gridFrames = useMemo(
    () => gridLayout(DEMO_IMAGES, DEMO_W, DEMO_H, GAP, PAD, 42),
    [],
  );
  const phylloFrames = useMemo(
    () => phylloLayout(DEMO_IMAGES, DEMO_W, DEMO_H, GAP, PAD, 42, { rotation: 0.7 }),
    [],
  );

  // Auto-cycle every 3 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveMode((prev) => (prev === 'grid' ? 'phyllo' : 'grid'));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const frames = activeMode === 'grid' ? gridFrames : phylloFrames;

  // Build a map from id → frames for both modes to smoothly interpolate
  const gridMap = new Map(gridFrames.map((f) => [f.id, f]));
  const phylloMap = new Map(phylloFrames.map((f) => [f.id, f]));

  return (
    <div className="mx-auto w-full" style={{ maxWidth: '480px' }}>
      {/* Mode indicator */}
      <div className="mb-3 flex items-center justify-center gap-3">
        <span
          className="font-heading text-xs font-semibold tracking-wider uppercase transition-all"
          style={{
            color: activeMode === 'grid' ? 'var(--accent-grid)' : 'var(--text-tertiary)',
            transitionDuration: 'var(--duration-normal)',
          }}
        >
          Grid
        </span>
        <div
          className="relative h-1.5 w-8 overflow-hidden rounded-full"
          style={{ background: 'var(--border-surface)' }}
        >
          <div
            className="absolute top-0 h-full w-1/2 rounded-full transition-all"
            style={{
              left: activeMode === 'grid' ? '0%' : '50%',
              background: activeMode === 'grid' ? 'var(--accent-grid)' : 'var(--accent-phyllo)',
              transitionDuration: 'var(--duration-normal)',
              transitionTimingFunction: 'var(--ease)',
            }}
          />
        </div>
        <span
          className="font-heading text-xs font-semibold tracking-wider uppercase transition-all"
          style={{
            color: activeMode === 'phyllo' ? 'var(--accent-phyllo)' : 'var(--text-tertiary)',
            transitionDuration: 'var(--duration-normal)',
          }}
        >
          Phyllo
        </span>
      </div>

      {/* Canvas */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: `${DEMO_W / DEMO_H}`,
          background: 'var(--canvas-bg)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-canvas)',
        }}
        role="img"
        aria-label="Animated demo cycling between Grid and Phyllo layouts"
      >
        {DEMO_IMAGES.map((img, i) => {
          const frame = (activeMode === 'grid' ? gridMap : phylloMap).get(img.id)!;
          const scaleX = 100 / DEMO_W;
          const scaleY = 100 / DEMO_H;
          const color = PLACEHOLDER_COLORS[i % PLACEHOLDER_COLORS.length];

          return (
            <div
              key={img.id}
              className="absolute"
              style={{
                left: `${frame.x * scaleX}%`,
                top: `${frame.y * scaleY}%`,
                width: `${frame.width * scaleX}%`,
                height: `${frame.height * scaleY}%`,
                transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
                transformOrigin: 'center center',
                borderRadius: 'var(--radius-sm)',
                background: color,
                boxShadow: Math.abs(frame.rotation ?? 0) > 0.1
                  ? 'var(--shadow-image-tilted)'
                  : 'var(--shadow-image)',
                transition: 'all 800ms cubic-bezier(0.4, 0, 0.2, 1)',
                willChange: 'transform, left, top, width, height',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
