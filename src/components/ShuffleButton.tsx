'use client';

import { useState } from 'react';
import type { LayoutMode } from '../engine/types';

interface ShuffleButtonProps {
  mode: LayoutMode;
  onShuffle: () => void;
}

export default function ShuffleButton({ mode, onShuffle }: ShuffleButtonProps) {
  const [bouncing, setBouncing] = useState(false);

  const handleClick = () => {
    setBouncing(true);
    onShuffle();
    setTimeout(() => setBouncing(false), 400);
  };

  const accent = mode === 'grid' ? 'var(--accent-grid)' : 'var(--accent-phyllo)';
  const hoverAccent = mode === 'grid' ? 'var(--accent-grid-hover)' : 'var(--accent-phyllo-hover)';

  return (
    <button
      onClick={handleClick}
      className="font-heading cursor-pointer rounded-full px-8 text-sm font-semibold text-white"
      style={{
        background: accent,
        height: '44px',
        transform: bouncing ? 'scale(0.95)' : 'scale(1)',
        transition: bouncing
          ? 'transform var(--duration-bounce) var(--ease-bounce)'
          : 'transform var(--duration-fast) var(--ease), background var(--duration-fast) var(--ease)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = hoverAccent)}
      onMouseLeave={(e) => (e.currentTarget.style.background = accent)}
      aria-label="Shuffle layout"
    >
      <span className="flex items-center gap-2">
        <span>🎲</span>
        <span>Shuffle</span>
      </span>
    </button>
  );
}
