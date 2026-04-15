'use client';

import type { LayoutMode } from '../engine/types';

interface SeedControlsProps {
  seed: number;
  mode: LayoutMode;
  onSeedChange: (seed: number) => void;
}

export default function SeedControls({ seed, mode, onSeedChange }: SeedControlsProps) {
  const accent = mode === 'grid' ? 'var(--accent-grid)' : 'var(--accent-phyllo)';

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onSeedChange(seed - 1)}
        className="font-heading flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-sm font-semibold transition-all"
        style={{
          border: `1.5px solid ${accent}`,
          color: accent,
          transitionDuration: 'var(--duration-fast)',
        }}
        aria-label="Previous seed"
      >
        ◀
      </button>
      <span className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
        Seed {seed}
      </span>
      <button
        onClick={() => onSeedChange(seed + 1)}
        className="font-heading flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-sm font-semibold transition-all"
        style={{
          border: `1.5px solid ${accent}`,
          color: accent,
          transitionDuration: 'var(--duration-fast)',
        }}
        aria-label="Next seed"
      >
        ▶
      </button>
    </div>
  );
}
