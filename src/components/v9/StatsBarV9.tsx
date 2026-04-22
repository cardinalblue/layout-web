'use client';

import type { Frame } from '../../engine/v9/types';
import { boundingBox, countOverlaps, nearestNeighborDist } from '../../engine/v9/shared';

interface Props {
  frames: Frame[];
  NW: number;
  NH: number;
  score: number;
  retries?: number;
  capHit?: boolean;
}

export default function StatsBarV9({ frames, NW, NH, score, retries, capHit }: Props) {
  if (frames.length === 0) return null;
  const bb = boundingBox(frames);
  const coverage = Math.round(((bb.w * bb.h) / (NW * NH)) * 100);
  const overlaps = countOverlaps(frames);
  let minGap = Infinity;
  let maxGap = 0;
  for (let i = 0; i < frames.length; i++) {
    const d = nearestNeighborDist(frames, i);
    if (d < minGap) minGap = d;
    if (d > maxGap) maxGap = d;
  }
  const displayScore = Math.round(Math.max(0, score) * 100);

  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1"
      style={{ color: 'var(--text-secondary)' }}
    >
      <Stat label="Coverage" value={`${coverage}%`} />
      <Stat label="Gap" value={`${Math.round(minGap)}–${Math.round(maxGap)}u`} />
      <Stat label="Score" value={`${displayScore}%`} />
      <Stat label="Overlaps" value={String(overlaps)} danger={overlaps > 0} />
      {retries !== undefined && retries > 0 && (
        <Stat label="Retries" value={`${retries}${capHit ? ' (cap)' : ''}`} warn={capHit} />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  danger,
  warn,
}: {
  label: string;
  value: string;
  danger?: boolean;
  warn?: boolean;
}) {
  const color = danger
    ? 'var(--danger)'
    : warn
      ? 'color-mix(in srgb, var(--accent-phyllo) 85%, var(--text-primary))'
      : 'var(--text-primary)';
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-heading text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </span>
      <span
        className="font-mono text-xs transition-all"
        style={{ color, transitionDuration: '200ms' }}
      >
        {value}
      </span>
    </div>
  );
}
