'use client';

import { useMemo } from 'react';
import type { Item, TextRenderOpts } from '../../engine/v9/types';
import { genItems } from '../../engine/v9/items';
import { runGA } from '../../engine/v9/grid';
import { bestPhyllo } from '../../engine/v9/phyllo';
import { normalizedCanvas } from '../../engine/v9/shared';
import CanvasViewV9 from './CanvasViewV9';

const CARD_TOPTS: TextRenderOpts = {
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

const CARD_SCRAPS = [{ id: 'card-txt-0', isPaired: false, text: 'Good morning!' }];

const CANVAS_RATIO = 4 / 3;
const GAP_PCT = 4;
const PAD_PCT = 6.5;
const SEED = 7;

function pct(p: number, NW: number, NH: number) {
  return (Math.min(NW, NH) * p) / 100;
}

interface CardProps {
  mode: 'grid' | 'phyllo';
}

const CARD_DATA = {
  grid: {
    title: 'Grid',
    description:
      'Gallery-wall style. Images and text align in precise rows with uniform gaps. A genetic algorithm searches thousands of arrangements to find the best fit.',
    tags: ['Text-aware rows', 'Precise', 'Balanced'],
  },
  phyllo: {
    title: 'Phyllo',
    description:
      'Named after phyllotaxis — the golden-angle spiral in sunflower seeds. Photos and text bloom outward from center. A constraint solver guarantees zero overlap.',
    tags: ['Text-aware spiral', 'Organic', 'Natural hierarchy'],
  },
};

function AlgorithmCardV9({ mode }: CardProps) {
  const data = CARD_DATA[mode];
  const accent = mode === 'grid' ? 'var(--accent-grid)' : 'var(--accent-phyllo)';

  const items: Item[] = useMemo(
    () =>
      genItems({
        imgCount: 3,
        textScraps: CARD_SCRAPS,
        ratioMode: 'wide',
        seed: SEED,
        setId: 'mixed',
        NW: 1000,
        minFS: 0,
        textBoxSize: 1.1,
      }),
    [],
  );

  const frames = useMemo(() => {
    const { NW, NH } = normalizedCanvas(CANVAS_RATIO);
    const gap = pct(GAP_PCT, NW, NH);
    const pad = pct(PAD_PCT, NW, NH);
    if (mode === 'grid') {
      const result = runGA({
        items,
        NW,
        NH,
        gap,
        pad,
        seed: SEED,
        tOpts: CARD_TOPTS,
        ratioMode: 'wide',
        enableRatioMutation: true,
        minFS: 0,
        population: 24,
        generations: 20,
      });
      return { frames: result.frames, NW, NH };
    }
    const result = bestPhyllo({
      items,
      NW,
      NH,
      gap,
      pad,
      seed: SEED,
      opts: { sizeVar: 0.5, rotation: 0.7, density: 0.55 },
      trials: 6,
      tOpts: CARD_TOPTS,
      ratioMode: 'wide',
      enableRatioSearch: true,
      minFS: 0,
    });
    return { frames: result.frames, NW, NH };
  }, [items, mode]);

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
      <div className="flex items-center gap-3">
        <h3 className="font-display text-2xl" style={{ color: accent }}>
          {data.title}
        </h3>
      </div>

      <p className="font-body text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {data.description}
      </p>

      <CanvasViewV9
        frames={frames.frames}
        NW={frames.NW}
        NH={frames.NH}
        tOpts={CARD_TOPTS}
        maxDisplayW={360}
        isDarkBg
        accentColor={accent}
      />

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

export default function AlgorithmIntroV9() {
  return (
    <section
      className="mx-auto w-full px-4 sm:px-6 lg:px-8"
      style={{ maxWidth: '960px' }}
      aria-labelledby="algo-intro-v9-title"
    >
      <h2
        id="algo-intro-v9-title"
        className="font-heading mb-8 text-center text-2xl font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        Two Algorithms
      </h2>
      <div className="flex flex-col gap-6 sm:flex-row">
        <AlgorithmCardV9 mode="grid" />
        <AlgorithmCardV9 mode="phyllo" />
      </div>
    </section>
  );
}
