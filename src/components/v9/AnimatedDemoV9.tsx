'use client';

import { useState, useEffect, useMemo } from 'react';
import type { TextRenderOpts } from '../../engine/v9/types';
import { genItems } from '../../engine/v9/items';
import { runGridV9, runPhylloV9 } from '../../engine/v9/layout';
import CanvasViewV9 from './CanvasViewV9';

const DEMO_TOPTS: TextRenderOpts = {
  padFractionX: 0.05,
  padFractionY: 0.05,
  lineHeight: 1.4,
  fontFamily: 'mono',
  italic: true,
  textBoxSize: 1.1,
  minFS: 0,
  maxFS: 60,
  fontWeight: 700,
  vAlign: 'center',
  hAlign: 'center',
};

const DEMO_SCRAPS = [
  { id: 'demo-txt-0', isPaired: false, text: 'Good morning!' },
  { id: 'demo-txt-1', isPaired: false, text: 'Wishing you a day full of warmth and joy.' },
];

export default function AnimatedDemoV9() {
  const [isGrid, setIsGrid] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) return;
    const timer = setInterval(() => setIsGrid((g) => !g), 3000);
    return () => clearInterval(timer);
  }, []);

  const items = useMemo(
    () =>
      genItems({
        imgCount: 3,
        textScraps: DEMO_SCRAPS,
        ratioMode: 'wide',
        seed: 42,
        setId: 'mixed',
        NW: 1000,
        minFS: 0,
        textBoxSize: 1.1,
      }),
    [],
  );

  const gridResult = useMemo(
    () =>
      runGridV9({
        items,
        canvasRatio: 4 / 3,
        gapPct: 4,
        padPct: 6.5,
        seed: 42,
        ratioMode: 'wide',
        ratioSearch: true,
        tOpts: DEMO_TOPTS,
        retry: { enabled: false, minScore: 0, maxRetries: 0 },
      }),
    [items],
  );

  const phylloResult = useMemo(
    () =>
      runPhylloV9({
        items,
        canvasRatio: 4 / 3,
        gapPct: 4,
        padPct: 6.5,
        seed: 42,
        ratioMode: 'wide',
        ratioSearch: true,
        tOpts: DEMO_TOPTS,
        phylloOpts: { sizeVar: 0.5, rotation: 1.0, density: 0.55, trials: 8 },
        retry: { enabled: false, minScore: 0, maxRetries: 0 },
      }),
    [items],
  );

  const active = isGrid ? gridResult : phylloResult;

  return (
    <div className="mx-auto w-full" style={{ maxWidth: '480px' }}>
      <div className="mb-3 flex items-center justify-center gap-3">
        <span
          className="font-heading text-xs font-semibold tracking-wider uppercase transition-all"
          style={{
            color: isGrid ? 'var(--accent-grid)' : 'var(--text-tertiary)',
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
              left: isGrid ? '0%' : '50%',
              background: isGrid ? 'var(--accent-grid)' : 'var(--accent-phyllo)',
              transitionDuration: 'var(--duration-normal)',
              transitionTimingFunction: 'var(--ease)',
            }}
          />
        </div>
        <span
          className="font-heading text-xs font-semibold tracking-wider uppercase transition-all"
          style={{
            color: !isGrid ? 'var(--accent-phyllo)' : 'var(--text-tertiary)',
            transitionDuration: 'var(--duration-normal)',
          }}
        >
          Phyllo
        </span>
      </div>

      <CanvasViewV9
        frames={active.frames}
        NW={active.NW}
        NH={active.NH}
        tOpts={DEMO_TOPTS}
        maxDisplayW={480}
        isDarkBg
        accentColor={isGrid ? 'var(--accent-grid)' : 'var(--accent-phyllo)'}
      />
    </div>
  );
}
