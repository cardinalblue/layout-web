'use client';

import { useMemo } from 'react';
import { runPhylloV9 } from '../../engine/v9/layout';
import { normalizedCanvas } from '../../engine/v9/shared';
import { genItems } from '../../engine/v9/items';
import type { TextScrapInput, TextRenderOpts, LayoutV9Result } from '../../engine/v9/types';
import CanvasViewV9 from './CanvasViewV9';

// ============================================================
// A narrative: same three photos, text added one type at a time.
// Phyllo only (picked per user guidance — easier to follow than
// two engines running side-by-side in a story panel).
// ============================================================

const CANVAS_RATIO = 16 / 9;
const SEED = 2026;

const PHOTOS = [
  { id: 'photo-a', ratio: 4 / 3 },
  { id: 'photo-b', ratio: 3 / 4 },
  { id: 'photo-c', ratio: 1.0 },
];

const T_OPTS: TextRenderOpts = {
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

interface Step {
  index: string;
  title: string;
  body: string;
  highlight: string | null;
  scraps: TextScrapInput[];
  annotation?: string;
}

const SHORT_TEXT: TextScrapInput = {
  id: 'txt-short',
  isPaired: false,
  text: 'Good morning!',
};
const LONG_TEXT: TextScrapInput = {
  id: 'txt-long',
  isPaired: false,
  text: 'Wishing you a day full of warmth, laughter, and small moments of joy.',
};
const PAIRED_TEXT: TextScrapInput = {
  id: 'txt-paired',
  isPaired: true,
  text: '',
  title: 'Summer 2026',
  subtitle: 'a month by the sea',
};

const STEPS: Step[] = [
  {
    index: '01',
    title: 'Photos only',
    body:
      'The starting point. Three photos arranged by Phyllo on a 16:9 canvas. Every step below adds text to this same set — same photos, same seed, same canvas.',
    highlight: null,
    scraps: [],
  },
  {
    index: '02',
    title: 'Add a short greeting',
    body:
      '“Good morning!” fits in one row at the reference size, so it’s classified as short: a wide tile with a max-area cap. The engine slots it alongside the photos without letting it swallow the canvas.',
    highlight: SHORT_TEXT.id,
    scraps: [SHORT_TEXT],
    annotation: 'short · ratio ≈ 4.0 · maxArea ceiling',
  },
  {
    index: '03',
    title: 'Add a long paragraph',
    body:
      'A wrapping paragraph needs floor area so the font size stays readable. Phyllo raises the text to meet minArea and proportionally shrinks the photos — images can drop to 30% of their original area before the floor kicks in.',
    highlight: LONG_TEXT.id,
    scraps: [SHORT_TEXT, LONG_TEXT],
    annotation: 'long · flexible ratio · minArea floor',
  },
  {
    index: '04',
    title: 'Add a title + subtitle',
    body:
      'A paired scrap is one layout item with one ratio — the renderer stacks the title over the subtitle and scales both together, so they never drift apart when the box shrinks.',
    highlight: PAIRED_TEXT.id,
    scraps: [SHORT_TEXT, LONG_TEXT, PAIRED_TEXT],
    annotation: 'paired · one box, two lines',
  },
];

function computeStep(step: Step): LayoutV9Result {
  const { NW } = normalizedCanvas(CANVAS_RATIO);
  const items = genItems({
    imgCount: PHOTOS.length,
    textScraps: step.scraps,
    ratioMode: 'wide',
    seed: SEED,
    setId: 'mixed',
    NW,
    minFS: 0,
    textBoxSize: T_OPTS.textBoxSize,
    imageRatios: PHOTOS.map((p) => p.ratio),
    imageIds: PHOTOS.map((p) => p.id),
  });
  return runPhylloV9({
    items,
    canvasRatio: CANVAS_RATIO,
    gapPct: 4,
    padPct: 6.5,
    seed: SEED,
    ratioMode: 'wide',
    ratioSearch: true,
    tOpts: T_OPTS,
    phylloOpts: { sizeVar: 0.5, rotation: 1, density: 0.55, trials: 6 },
    retry: { enabled: true, minScore: 55, maxRetries: 20 },
  });
}

export default function TextLogicExplainer() {
  const results = useMemo(() => STEPS.map(computeStep), []);

  return (
    <section
      className="mx-auto w-full px-4 sm:px-6 lg:px-8"
      style={{ maxWidth: '1200px' }}
      aria-labelledby="text-flow-title"
    >
      <h2
        id="text-flow-title"
        className="font-heading mb-3 text-2xl font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        How text joins the layout
      </h2>
      <p
        className="font-body mb-8 max-w-2xl text-sm"
        style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}
      >
        Text isn’t glued on top — it enters the same layout search as your photos. Watch what changes
        as we add a greeting, a paragraph, and a title/subtitle pair to the same three photos. The
        engine is Phyllo; each newly-added scrap is ringed in{' '}
        <span
          style={{ color: 'var(--accent-phyllo)', fontWeight: 600 }}
        >
          accent
        </span>
        .
      </p>

      <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <StepCard key={step.index} step={step} result={results[i]} />
        ))}
      </ol>

      <p
        className="font-body mt-8 max-w-2xl text-sm"
        style={{ color: 'var(--text-tertiary)', lineHeight: 1.6 }}
      >
        All four layouts use the same seed and same three photos. The only input that changes is the
        text — so any difference you see between frames is the engine responding to text, not to a
        different random draw.
      </p>
    </section>
  );
}

// ============================================================
// Step card
// ============================================================

function StepCard({ step, result }: { step: Step; result: LayoutV9Result }) {
  const highlightIds = step.highlight ? [step.highlight] : [];
  return (
    <li
      className="flex list-none flex-col gap-3 rounded-xl p-4"
      style={{
        background: 'var(--surface)',
        border: '0.5px solid var(--border-surface)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <header className="flex items-baseline gap-2">
        <span
          className="font-mono text-[11px] tracking-wider"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {step.index}
        </span>
        <h3
          className="font-heading text-base font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {step.title}
        </h3>
      </header>

      <CanvasViewV9
        frames={result.frames}
        NW={result.NW}
        NH={result.NH}
        tOpts={T_OPTS}
        highlightIds={highlightIds}
      />

      {step.annotation ? (
        <p className="font-mono text-[11px]" style={{ color: 'var(--accent-phyllo)' }}>
          {step.annotation}
        </p>
      ) : (
        <p className="font-mono text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          baseline · photos only
        </p>
      )}

      <p
        className="font-body text-[13px]"
        style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}
      >
        {step.body}
      </p>
    </li>
  );
}
