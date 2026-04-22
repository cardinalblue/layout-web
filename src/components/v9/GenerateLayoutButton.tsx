'use client';

import { useState } from 'react';

interface GenerateLayoutButtonProps {
  stagedCount: number;
  isDirty: boolean;
  hasCommitted: boolean;
  onClick: () => void;
}

export default function GenerateLayoutButton({
  stagedCount,
  isDirty,
  hasCommitted,
  onClick,
}: GenerateLayoutButtonProps) {
  const [bouncing, setBouncing] = useState(false);
  const visible = stagedCount > 0 || hasCommitted;
  if (!visible) return null;

  const enabled = isDirty;
  const label = !hasCommitted
    ? 'Generate Layout'
    : isDirty
      ? 'Regenerate'
      : 'Up to date';

  const handleClick = () => {
    if (!enabled) return;
    setBouncing(true);
    onClick();
    setTimeout(() => setBouncing(false), 400);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!enabled}
      className="font-heading rounded-full px-8 text-sm font-semibold"
      style={{
        background: enabled ? 'var(--accent-grid)' : 'transparent',
        color: enabled ? '#fff' : 'var(--text-tertiary)',
        border: enabled ? 'none' : '1px solid var(--border-surface)',
        height: '44px',
        cursor: enabled ? 'pointer' : 'default',
        transform: bouncing ? 'scale(0.95)' : 'scale(1)',
        transition: bouncing
          ? 'transform var(--duration-bounce) var(--ease-bounce)'
          : 'transform var(--duration-fast) var(--ease), background var(--duration-fast) var(--ease)',
        opacity: enabled ? 1 : 0.75,
      }}
      onMouseEnter={(e) => {
        if (enabled) e.currentTarget.style.background = 'var(--accent-grid-hover)';
      }}
      onMouseLeave={(e) => {
        if (enabled) e.currentTarget.style.background = 'var(--accent-grid)';
      }}
      aria-label={enabled ? `${label} from ${stagedCount} photo${stagedCount === 1 ? '' : 's'}` : 'Layout is up to date'}
    >
      {enabled ? `${label} →` : label}
    </button>
  );
}
