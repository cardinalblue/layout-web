'use client';

import type { Frame } from '../engine/types';
import { boundingBox, countOverlaps, nearestNeighborDist } from '../engine/shared';

interface StatsBarProps {
  frames: Frame[];
  canvasW: number;
  canvasH: number;
  score?: number;
}

export default function StatsBar({ frames, canvasW, canvasH, score }: StatsBarProps) {
  if (frames.length === 0) return null;

  const bbox = boundingBox(frames);
  const canvasArea = canvasW * canvasH;
  const bboxArea = bbox.width * bbox.height;
  const coverage = Math.round((bboxArea / canvasArea) * 100);

  const overlaps = countOverlaps(frames);

  // Gap range
  let minGap = Infinity;
  let maxGap = 0;
  for (let i = 0; i < frames.length; i++) {
    const d = nearestNeighborDist(frames, i);
    if (d < minGap) minGap = d;
    if (d > maxGap) maxGap = d;
  }

  const displayScore = score !== undefined ? Math.round(score * 100) : null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1"
      style={{ color: 'var(--text-secondary)' }}
    >
      <StatItem label="Coverage" value={`${coverage}%`} />
      <StatItem
        label="Gap"
        value={`${Math.round(minGap)}–${Math.round(maxGap)}px`}
      />
      {displayScore !== null && (
        <StatItem label="Score" value={`${displayScore}%`} />
      )}
      <StatItem
        label="Overlaps"
        value={String(overlaps)}
        danger={overlaps > 0}
      />
    </div>
  );
}

function StatItem({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-heading text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </span>
      <span
        className="font-mono text-sm transition-all"
        style={{
          color: danger ? 'var(--danger)' : 'var(--text-primary)',
          transitionDuration: '200ms',
        }}
      >
        {value}
      </span>
    </div>
  );
}
