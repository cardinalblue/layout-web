'use client';

import { isSingleRowPreferred, textPreferredRatio, textRatioRange, widthInEm } from '../../engine/v9/text';
import { normalizedCanvas } from '../../engine/v9/shared';

// ============================================================
// A vertical pipeline with concrete examples at every stage.
// Photos (grid accent) and text (phyllo accent) are kept visually
// distinct so the reader can trace text through the whole flow.
// ============================================================

const NW = normalizedCanvas(16 / 9).NW;
const CANVAS_AREA_PCT = (a: number) => (a / (NW * NW)) * 100;

// Sample items — same ones the Upload section defaults to
const SAMPLE_PHOTOS = [
  { id: 'photo-a', label: '4:3 landscape', ratio: 4 / 3 },
  { id: 'photo-b', label: '3:4 portrait', ratio: 3 / 4 },
  { id: 'photo-c', label: '1:1 square', ratio: 1.0 },
];

const SAMPLE_TEXTS = [
  { id: 't-short', text: 'Good morning!' },
  { id: 't-long', text: 'Wishing you a day full of warmth, laughter, and small moments of joy.' },
];

function measureText(text: string) {
  const isShort = isSingleRowPreferred(text, NW, 0);
  const base = textPreferredRatio(text, 'wide', NW, 0);
  const [lo, hi] = textRatioRange(text, false, undefined, 'wide', NW, 0);

  // Replicate genItems math for display
  const em = widthInEm(text);
  let minArea = 0;
  let maxArea = 0;
  const targetFS = isShort ? 28 : 14;
  const lhRef = 2.0;
  const charWF = 0.55;
  const area = em * targetFS * targetFS * lhRef * charWF;
  if (isShort) maxArea = area * 4.0 * 1.1;
  else minArea = Math.min(area * 1.5 * 1.1, NW * NW * 0.2 * 1.1);

  return { isShort, base, lo, hi, minArea, maxArea };
}

// ============================================================

export default function PipelineFlowchart() {
  return (
    <section
      className="mx-auto w-full px-4 sm:px-6 lg:px-8"
      style={{ maxWidth: '880px' }}
      aria-labelledby="pipeline-title"
    >
      <h2
        id="pipeline-title"
        className="font-heading mb-3 text-2xl font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        Pipeline
      </h2>
      <p
        className="font-body mb-8 max-w-2xl text-sm"
        style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}
      >
        Follow the same photos and text scraps through every stage. Photos are tinted{' '}
        <TagSwatch kind="photo" /> and text{' '}
        <TagSwatch kind="text" />; together they make up the list the engines work on.
      </p>

      <ol className="flex list-none flex-col gap-0">
        <Step1Items />
        <Connector />
        <Step2Measure />
        <Connector />
        <Step3Search />
        <Connector />
        <Step4Score />
        <Connector />
        <Step5Post />
        <Connector />
        <Step6Render />
      </ol>
    </section>
  );
}

// ============================================================
// Shared primitives
// ============================================================

function Connector() {
  return (
    <li className="flex list-none items-center justify-center" aria-hidden>
      <div
        style={{
          width: 2,
          height: 32,
          background: 'linear-gradient(to bottom, var(--border-surface), transparent 90%)',
        }}
      />
    </li>
  );
}

function StepShell({
  index,
  title,
  lede,
  children,
}: {
  index: string;
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <li
      className="rounded-xl p-5 sm:p-6"
      style={{
        background: 'var(--surface)',
        border: '0.5px solid var(--border-surface)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="mb-3 flex items-baseline gap-3">
        <span
          className="font-mono text-xs tracking-wider"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {index}
        </span>
        <h3
          className="font-heading text-lg font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h3>
      </div>
      <p
        className="font-body mb-5 max-w-2xl text-[14px]"
        style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}
      >
        {lede}
      </p>
      {children}
    </li>
  );
}

function Chip({
  kind,
  label,
  meta,
}: {
  kind: 'photo' | 'text';
  label: string;
  meta?: string;
}) {
  const accent = kind === 'photo' ? 'var(--accent-grid)' : 'var(--accent-phyllo)';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px]"
      style={{
        background: `color-mix(in srgb, ${accent} 10%, var(--bg))`,
        border: `0.5px solid color-mix(in srgb, ${accent} 40%, var(--border-surface))`,
        color: 'var(--text-primary)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: accent,
          display: 'inline-block',
        }}
      />
      <span className="font-body">{label}</span>
      {meta && (
        <span className="font-mono" style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
          {meta}
        </span>
      )}
    </span>
  );
}

function TagSwatch({ kind }: { kind: 'photo' | 'text' }) {
  const accent = kind === 'photo' ? 'var(--accent-grid)' : 'var(--accent-phyllo)';
  const label = kind === 'photo' ? 'photos' : 'text';
  return (
    <span className="font-body inline-flex items-center gap-1" style={{ color: accent }}>
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: accent,
          display: 'inline-block',
        }}
      />
      <span style={{ fontWeight: 600 }}>{label}</span>
    </span>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4
      className="font-heading mb-2 text-[11px] tracking-wider uppercase"
      style={{ color: 'var(--text-tertiary)' }}
    >
      {children}
    </h4>
  );
}

// ============================================================
// Step 1 — Items
// ============================================================

function Step1Items() {
  return (
    <StepShell
      index="01"
      title="Collect items"
      lede="Photos and text scraps become a single flat list of items. From here on, the engines don’t care which is which — they only see an id, a ratio target, and (for text) a min or max area budget."
    >
      <div className="flex flex-col gap-3">
        <div>
          <SubHeading>Photos (intrinsic ratio)</SubHeading>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_PHOTOS.map((p) => (
              <Chip key={p.id} kind="photo" label={p.label} meta={p.ratio.toFixed(2)} />
            ))}
          </div>
        </div>
        <div>
          <SubHeading>Text scraps (ratio + area computed)</SubHeading>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_TEXTS.map((t) => (
              <Chip
                key={t.id}
                kind="text"
                label={t.text.length > 36 ? `${t.text.slice(0, 34)}…` : t.text}
              />
            ))}
          </div>
        </div>
      </div>
    </StepShell>
  );
}

// ============================================================
// Step 2 — Measure text
// ============================================================

function Step2Measure() {
  const measured = SAMPLE_TEXTS.map((t) => ({ t, m: measureText(t.text) }));

  return (
    <StepShell
      index="02"
      title="Measure text"
      lede="For every text scrap the engine decides one thing first: does it fit on one row at the reference size? That answer drives both the preferred aspect ratio and whether the box has a min-area floor (long text) or max-area ceiling (short text)."
    >
      <div className="flex flex-col gap-2">
        {measured.map(({ t, m }) => (
          <div
            key={t.id}
            className="rounded-md p-3"
            style={{
              background: 'var(--bg)',
              border: '0.5px solid var(--border-surface)',
            }}
          >
            <p
              className="font-body mb-2 text-[13px]"
              style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}
            >
              “{t.text}”
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span
                className="font-mono text-[11px]"
                style={{
                  color: m.isShort ? 'var(--accent-grid)' : 'var(--accent-phyllo)',
                  fontWeight: 600,
                }}
              >
                {m.isShort ? 'SHORT' : 'LONG'}
              </span>
              <span
                className="font-mono text-[11px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                ratio ∈ [{m.lo.toFixed(2)}, {m.hi.toFixed(2)}]
              </span>
              <span
                className="font-mono text-[11px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {m.isShort
                  ? `maxArea ${CANVAS_AREA_PCT(m.maxArea).toFixed(1)}% of canvas`
                  : `minArea ${CANVAS_AREA_PCT(m.minArea).toFixed(1)}% of canvas`}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p
        className="font-body mt-3 text-[12px]"
        style={{ color: 'var(--text-tertiary)', lineHeight: 1.55 }}
      >
        Photos skip this step — their ratio is whatever the image already is, and they don’t carry an
        area budget.
      </p>
    </StepShell>
  );
}

// ============================================================
// Step 3 — Search in parallel
// ============================================================

function Step3Search() {
  return (
    <StepShell
      index="03"
      title="Search in parallel"
      lede="Two engines try different arrangements of the same list. Text participates in both — the engines can resample a text scrap’s ratio from its allowed range in search of a better score."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <EngineCard
          kind="grid"
          title="Grid GA"
          subtitle="binary tree · 50 × 40"
          lines={[
            'Start from 2 balanced trees + random mutations.',
            'Per generation (× 40): flip cut, swap leaves, restructure subtree.',
            'Text scraps have a 50% chance to resample their ratio from [lo, hi].',
            'Keep top 30% each generation; refill by mutating survivors.',
          ]}
        />
        <EngineCard
          kind="phyllo"
          title="Phyllo trials"
          subtitle="spiral · 30 trials"
          lines={[
            'Allocate area with sizeVar hierarchy, then raise any text below minArea.',
            'Deficit is scaled out of non-text items (floor 0.3× of their original area).',
            'Seed on a golden-angle ellipse; run a 300-iteration constraint solver.',
            '30 trials with fresh ratio samples; keep the best-scoring one.',
          ]}
        />
      </div>
    </StepShell>
  );
}

function EngineCard({
  kind,
  title,
  subtitle,
  lines,
}: {
  kind: 'grid' | 'phyllo';
  title: string;
  subtitle: string;
  lines: string[];
}) {
  const accent = kind === 'grid' ? 'var(--accent-grid)' : 'var(--accent-phyllo)';
  return (
    <div
      className="rounded-md p-4"
      style={{
        background: 'var(--bg)',
        border: `0.5px solid color-mix(in srgb, ${accent} 40%, var(--border-surface))`,
      }}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-heading text-sm font-semibold" style={{ color: accent }}>
          {title}
        </span>
        <span className="font-mono text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          {subtitle}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {lines.map((l, i) => (
          <li
            key={i}
            className="font-body flex gap-2 text-[13px]"
            style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}
          >
            <span aria-hidden style={{ color: accent }}>
              ·
            </span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
// Step 4 — Score + retry
// ============================================================

function Step4Score() {
  // Grid factor weights sum to 1.00
  const GRID_FACTORS: Array<{ name: string; w: number; kind?: 'text' }> = [
    { name: 'fl (fill)', w: 0.15 },
    { name: 'am (aspect match)', w: 0.15 },
    { name: 'rcOK (row count)', w: 0.13 },
    { name: 'rwS (row width)', w: 0.13 },
    { name: 'gs (gap uniformity)', w: 0.13 },
    { name: 'aOK (area balance)', w: 0.09 },
    { name: 'co (compactness)', w: 0.05 },
    { name: 'tB (text block)', w: 0.17, kind: 'text' },
  ];
  const PHYLLO_FACTORS: Array<{ name: string; w: number; kind?: 'text' }> = [
    { name: 'co (compactness)', w: 0.3 },
    { name: 'gh2 (gap harmony)', w: 0.17 },
    { name: 'cov (coverage)', w: 0.15 },
    { name: 'am (aspect match)', w: 0.1 },
    { name: 'axisFill', w: 0.08 },
    { name: 'ts (text signal)', w: 0.2, kind: 'text' },
  ];

  return (
    <StepShell
      index="04"
      title="Score + retry"
      lede="Every candidate is multiplied through a handful of factors that each stay in [0, 1]. The text factor (tB for Grid, ts for Phyllo) can drag the whole score down if any text renders below the fs floor or overflows its area budget. If the best score is below the user’s minScore, the seed increments and the search replays — up to maxRetries."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FactorList accent="var(--accent-grid)" title="Grid score" factors={GRID_FACTORS} />
        <FactorList accent="var(--accent-phyllo)" title="Phyllo score" factors={PHYLLO_FACTORS} />
      </div>

      <div
        className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md px-3 py-2"
        style={{
          background: 'var(--bg)',
          border: '0.5px solid var(--border-surface)',
        }}
      >
        <span
          className="font-mono text-[11px]"
          style={{ color: 'var(--text-tertiary)' }}
        >
          retry loop
        </span>
        <span
          className="font-mono text-[12px]"
          style={{ color: 'var(--text-secondary)' }}
        >
          while score &lt; minScore && tries &lt; maxRetries → seed += 1
        </span>
      </div>
    </StepShell>
  );
}

function FactorList({
  accent,
  title,
  factors,
}: {
  accent: string;
  title: string;
  factors: Array<{ name: string; w: number; kind?: 'text' }>;
}) {
  const maxW = Math.max(...factors.map((f) => f.w));
  return (
    <div
      className="rounded-md p-3"
      style={{
        background: 'var(--bg)',
        border: `0.5px solid color-mix(in srgb, ${accent} 40%, var(--border-surface))`,
      }}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-heading text-[12px] font-semibold" style={{ color: accent }}>
          {title}
        </span>
        <span className="font-mono text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          exponent
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {factors.map((f) => {
          const isText = f.kind === 'text';
          const widthPct = (f.w / maxW) * 100;
          return (
            <li key={f.name} className="grid items-center gap-2" style={{ gridTemplateColumns: '1fr 60px 44px' }}>
              <span
                className="font-mono truncate text-[11px]"
                style={{
                  color: isText ? accent : 'var(--text-secondary)',
                  fontWeight: isText ? 600 : 400,
                }}
              >
                {f.name}
              </span>
              <div
                className="relative h-1.5 overflow-hidden rounded-full"
                style={{ background: 'var(--border-surface)' }}
                aria-hidden
              >
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${widthPct}%`,
                    background: isText ? accent : 'color-mix(in srgb, ' + accent + ' 40%, var(--text-tertiary))',
                  }}
                />
              </div>
              <span
                className="font-mono text-right text-[11px]"
                style={{ color: isText ? accent : 'var(--text-tertiary)' }}
              >
                {f.w.toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================
// Step 5 — Post-process
// ============================================================

function Step5Post() {
  return (
    <StepShell
      index="05"
      title="Post-process"
      lede="Once the engines converge, two optional passes reshape the winning frames. Neither runs a search — they’re purely geometric transforms, applied to Grid and Phyllo frames identically."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <PostCard
          name="scrapScalePct"
          title="Scrap scale"
          body="Inflate every box outward by a percentage of the canvas’s short edge. Makes individual items larger; neighbors can overlap."
        />
        <PostCard
          name="tightnessPct"
          title="Tightness"
          body="Pull every frame toward the canvas centre, then rescale the bbox back to full size. Compresses gaps without cropping content."
        />
      </div>
    </StepShell>
  );
}

function PostCard({ name, title, body }: { name: string; title: string; body: string }) {
  return (
    <div
      className="rounded-md p-4"
      style={{
        background: 'var(--bg)',
        border: '0.5px solid var(--border-surface)',
      }}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span
          className="font-heading text-[13px] font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </span>
        <span className="font-mono text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          {name}
        </span>
      </div>
      <p
        className="font-body text-[13px]"
        style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}
      >
        {body}
      </p>
    </div>
  );
}

// ============================================================
// Step 6 — Render
// ============================================================

function Step6Render() {
  return (
    <StepShell
      index="06"
      title="Render"
      lede="The engine’s job ends in normalized units. The renderer maps each frame to a percentage of the live canvas width, so the same layout looks identical on 400px mobile and 1400px desktop."
    >
      <ul className="flex flex-col gap-2.5">
        <RenderStep
          label="Map frames"
          body={
            <>
              Every frame’s <code>(x, y, w, h)</code> is converted to <code>%</code> of NW/NH on the
              fly — no pixel constants leak from the engine.
            </>
          }
        />
        <RenderStep
          label="Fit the text"
          body={
            <>
              Each text scrap runs a 25-iteration shrink loop in a <code>useLayoutEffect</code>:
              start at the estimator’s fs, measure the rendered height, multiply fs by 0.9 until it
              fits, and stop at a floor of 3 display px.
            </>
          }
        />
        <RenderStep
          label="Animate"
          body={
            <>
              Position/size changes animate over 600ms with a cubic-bezier ease. The animation is
              CSS-only; React just updates the percentages.
            </>
          }
        />
      </ul>
    </StepShell>
  );
}

function RenderStep({ label, body }: { label: string; body: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="font-mono shrink-0 rounded px-2 py-0.5 text-[10px] tracking-wider uppercase"
        style={{
          background: 'var(--bg)',
          color: 'var(--text-tertiary)',
          border: '0.5px solid var(--border-surface)',
          alignSelf: 'flex-start',
        }}
      >
        {label}
      </span>
      <p
        className="font-body text-[13px]"
        style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}
      >
        {body}
      </p>
    </li>
  );
}
