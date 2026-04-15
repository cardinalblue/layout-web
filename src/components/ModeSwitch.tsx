'use client';

import type { LayoutMode } from '../engine/types';

interface ModeSwitchProps {
  mode: LayoutMode;
  onModeChange: (mode: LayoutMode) => void;
}

export default function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  return (
    <div className="flex gap-1 rounded-full p-1" style={{ background: 'var(--border-surface)' }}>
      <button
        onClick={() => onModeChange('grid')}
        className="font-heading relative cursor-pointer rounded-full px-5 py-2 text-sm font-semibold transition-all"
        style={{
          background: mode === 'grid' ? 'var(--accent-grid)' : 'transparent',
          color: mode === 'grid' ? '#fff' : 'var(--text-secondary)',
          transform: mode === 'grid' ? 'scale(1.02)' : 'scale(1)',
          transitionDuration: 'var(--duration-fast)',
          transitionTimingFunction: 'var(--ease)',
        }}
        aria-pressed={mode === 'grid'}
      >
        Grid
      </button>
      <button
        onClick={() => onModeChange('phyllo')}
        className="font-heading relative cursor-pointer rounded-full px-5 py-2 text-sm font-semibold transition-all"
        style={{
          background: mode === 'phyllo' ? 'var(--accent-phyllo)' : 'transparent',
          color: mode === 'phyllo' ? '#fff' : 'var(--text-secondary)',
          transform: mode === 'phyllo' ? 'scale(1.02)' : 'scale(1)',
          transitionDuration: 'var(--duration-fast)',
          transitionTimingFunction: 'var(--ease)',
        }}
        aria-pressed={mode === 'phyllo'}
      >
        Phyllo
      </button>
    </div>
  );
}
