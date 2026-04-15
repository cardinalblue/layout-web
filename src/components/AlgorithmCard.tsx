'use client';

import { useMemo } from 'react';
import type { LayoutMode, Frame } from '../engine/types';
import { gridLayout } from '../engine/grid';
import { phylloLayout } from '../engine/phyllo';
import { PLACEHOLDER_COLORS } from '../data/imageSets';

interface AlgorithmCardProps {
  mode: LayoutMode;
}

// Small static preview images
const PREVIEW_IMAGES = [
  { id: 'p0', aspectRatio: 4 / 3 },
  { id: 'p1', aspectRatio: 3 / 4 },
  { id: 'p2', aspectRatio: 1 },
  { id: 'p3', aspectRatio: 16 / 9 },
  { id: 'p4', aspectRatio: 3 / 2 },
];

const PREVIEW_W = 400;
const PREVIEW_H = 300;

const CARD_DATA: Record<LayoutMode, {
  title: string;
  icon: string;
  description: string;
  tags: string[];
}> = {
  grid: {
    title: 'Grid',
    icon: '📐',
    description:
      'Gallery-wall style. Images align in precise rows with uniform gaps. A genetic algorithm searches 2,000+ arrangements to find the best.',
    tags: ['Precise', 'Balanced', 'Uniform gaps'],
  },
  phyllo: {
    title: 'Phyllo',
    icon: '🌻',
    description:
      'Named after phyllotaxis — the golden-angle spiral in sunflower seeds. Images bloom outward from center. A constraint solver guarantees zero overlap.',
    tags: ['Organic', 'Freestyle', 'Natural hierarchy'],
  },
};

export default function AlgorithmCard({ mode }: AlgorithmCardProps) {
  const data = CARD_DATA[mode];
  const accent = mode === 'grid' ? 'var(--accent-grid)' : 'var(--accent-phyllo)';

  // Pre-computed static preview
  const previewFrames: Frame[] = useMemo(() => {
    const shortEdge = Math.min(PREVIEW_W, PREVIEW_H);
    const gapPx = shortEdge * 0.04;
    const padPx = shortEdge * 0.065;
    if (mode === 'grid') {
      return gridLayout(PREVIEW_IMAGES, PREVIEW_W, PREVIEW_H, gapPx, padPx, 7);
    }
    return phylloLayout(PREVIEW_IMAGES, PREVIEW_W, PREVIEW_H, gapPx, padPx, 7, {
      rotation: 0.6,
    });
  }, [mode]);

  return (
    <div
      className="flex flex-1 flex-col gap-5 rounded-xl p-6 sm:p-8"
      style={{
        background: 'var(--surface)',
        border: '0.5px solid var(--border-surface)',
        boxShadow: 'var(--shadow-card)',
        minWidth: '280px',
      }}
    >
      {/* Icon + title */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">{data.icon}</span>
        <h3
          className="font-display text-2xl"
          style={{ color: accent }}
        >
          {data.title}
        </h3>
      </div>

      {/* Description */}
      <p
        className="font-body text-sm leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        {data.description}
      </p>

      {/* Mini canvas preview */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: `${PREVIEW_W / PREVIEW_H}`,
          background: 'var(--canvas-bg)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-canvas)',
        }}
      >
        {previewFrames.map((frame, i) => {
          const scaleX = 100 / PREVIEW_W;
          const scaleY = 100 / PREVIEW_H;
          const color = PLACEHOLDER_COLORS[i % PLACEHOLDER_COLORS.length];
          return (
            <div
              key={frame.id}
              className="absolute"
              style={{
                left: `${frame.x * scaleX}%`,
                top: `${frame.y * scaleY}%`,
                width: `${frame.width * scaleX}%`,
                height: `${frame.height * scaleY}%`,
                transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
                transformOrigin: 'center center',
                borderRadius: '4px',
                background: color,
                boxShadow: 'var(--shadow-image)',
              }}
            />
          );
        })}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        {data.tags.map((tag) => (
          <span
            key={tag}
            className="font-heading rounded-full px-3 py-1 text-xs"
            style={{
              background: `color-mix(in srgb, ${accent} 10%, transparent)`,
              color: accent,
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
