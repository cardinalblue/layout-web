'use client';

import type { FontFamily, RatioMode } from '../../engine/v9/types';
import SliderRow from '../SliderRow';
import { V9_CANVAS_RATIOS, IMG_SETS } from '../../data/v9/imageSets';
import { CANVAS_BG_COLORS } from '../../data/imageSets';
import TextScrapEditor from './TextScrapEditor';
import type { TextScrapInput } from '../../engine/v9/types';

export interface ParamsV9 {
  canvasRatio: string;
  imgSet: string;
  imgCount: number;
  gapPct: number;
  padPct: number;
  scrapScalePct: number;
  tightnessPct: number;
  borderWidth: number;
  textBorderOpacity: number;
  shadowOpacity: number;
  ratioMode: RatioMode;
  ratioSearch: boolean;
  textBoxSize: number;
  minFS: number;
  maxFS: number;
  italic: boolean;
  fontFamily: FontFamily;
  fontWeight: number;
  lineHeight: number;
  padFractionX: number;
  padFractionY: number;
  gridSizeVar: number;
  phylloSizeVar: number;
  phylloRotation: number;
  phylloDensity: number;
  phylloTrials: number;
  autoRetry: boolean;
  minScore: number;
  maxRetries: number;
}

export const DEFAULT_PARAMS_V9: ParamsV9 = {
  canvasRatio: '16:9',
  imgSet: 'mixed',
  imgCount: 3,
  gapPct: 4,
  padPct: 6.5,
  scrapScalePct: 0,
  tightnessPct: 0,
  borderWidth: 0,
  textBorderOpacity: 0.3,
  shadowOpacity: 0,
  ratioMode: 'wide',
  ratioSearch: true,
  textBoxSize: 1.1,
  minFS: 0,
  maxFS: 60,
  italic: true,
  fontFamily: 'mono',
  fontWeight: 700,
  lineHeight: 1.4,
  padFractionX: 0.05,
  padFractionY: 0.05,
  gridSizeVar: 0.5,
  phylloSizeVar: 0.5,
  phylloRotation: 1.0,
  phylloDensity: 0.55,
  phylloTrials: 30,
  autoRetry: true,
  minScore: 70,
  maxRetries: 60,
};

interface Props {
  params: ParamsV9;
  onChange: (p: ParamsV9) => void;
  bgColor: string;
  onBgColorChange: (c: string) => void;
  scraps: TextScrapInput[];
  onScrapsChange: (s: TextScrapInput[]) => void;
  /** when true, hide image-pool selector (used by Upload page). */
  hideImageSource?: boolean;
  onReset?: () => void;
}

export default function ParameterPanelV9({
  params,
  onChange,
  bgColor,
  onBgColorChange,
  scraps,
  onScrapsChange,
  hideImageSource,
  onReset,
}: Props) {
  const update = (patch: Partial<ParamsV9>) => onChange({ ...params, ...patch });

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: 'var(--bg)',
        border: '0.5px solid var(--border-surface)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="md:columns-2 md:gap-3">
      {/* ============ Group 1 — Canvas & Content ============ */}
      <Group title="Canvas & Content" defaultOpen>
        <PillRow
          label="Canvas ratio"
          options={Object.entries(V9_CANVAS_RATIOS).map(([k, def]) => ({ key: k, label: def.label }))}
          value={params.canvasRatio}
          onChange={(v) => update({ canvasRatio: v })}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="font-heading mr-0.5 text-[10px] tracking-wider uppercase"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Background
          </span>
          {CANVAS_BG_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => onBgColorChange(c.value)}
              className="h-5 w-5 cursor-pointer rounded-full transition-all"
              style={{
                background: c.value,
                border:
                  bgColor === c.value
                    ? '2px solid var(--text-primary)'
                    : '1.5px solid var(--border-surface)',
                transform: bgColor === c.value ? 'scale(1.15)' : 'scale(1)',
                transitionDuration: 'var(--duration-fast)',
              }}
              aria-label={`Background: ${c.label}`}
              title={c.label}
            />
          ))}
        </div>

        {!hideImageSource && (
          <>
            <PillRow
              label="Image set"
              options={IMG_SETS.map((s) => ({ key: s.id, label: s.name }))}
              value={params.imgSet}
              onChange={(v) => update({ imgSet: v })}
            />
            <SliderRow
              label="Images"
              value={params.imgCount}
              min={0}
              max={10}
              step={1}
              onChange={(v) => update({ imgCount: v })}
            />
          </>
        )}

        <TextScrapEditor scraps={scraps} onChange={onScrapsChange} max={3} />
      </Group>

      {/* ============ Group 2 — Layout ============ */}
      <Group title="Layout" defaultOpen>
        <SliderRow
          label="Gap"
          value={params.gapPct}
          min={0}
          max={8}
          step={0.5}
          onChange={(v) => update({ gapPct: v })}
          format={(v) => `${v}%`}
        />
        <SliderRow
          label="Padding"
          value={params.padPct}
          min={2}
          max={12}
          step={0.5}
          onChange={(v) => update({ padPct: v })}
          format={(v) => `${v}%`}
        />
        <SliderRow
          label="Border"
          value={params.borderWidth}
          min={0}
          max={6}
          step={0.5}
          onChange={(v) => update({ borderWidth: v })}
          format={(v) => `${v}px`}
        />
        <SliderRow
          label="Text Border Opacity"
          value={params.textBorderOpacity ?? DEFAULT_PARAMS_V9.textBorderOpacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => update({ textBorderOpacity: v })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <SliderRow
          label="Shadow"
          value={params.shadowOpacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => update({ shadowOpacity: v })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </Group>

      {/* ============ Group 3 — Post-process ============ */}
      <Group title="Post-process" defaultOpen>
        <SliderRow
          label="Scrap Scale"
          value={params.scrapScalePct}
          min={0}
          max={10}
          step={0.5}
          onChange={(v) => update({ scrapScalePct: v })}
          format={(v) => `${v}%`}
        />
        <SliderRow
          label="Tightness"
          value={params.tightnessPct}
          min={0}
          max={10}
          step={0.5}
          onChange={(v) => update({ tightnessPct: v })}
          format={(v) => `${v}%`}
        />
      </Group>

      {/* ============ Group 4 — Text Ratio ============ */}
      <Group title="Text Ratio" defaultOpen>
        <PillRow
          label="Mode"
          options={[
            { key: 'auto', label: 'auto' },
            { key: 'wide', label: 'wide' },
            { key: 'square', label: 'square' },
            { key: 'tall', label: 'tall' },
          ]}
          value={params.ratioMode}
          onChange={(v) => update({ ratioMode: v as RatioMode })}
        />
        <ToggleRow
          label="GA Search"
          value={params.ratioSearch}
          onChange={(v) => update({ ratioSearch: v })}
        />
        <SliderRow
          label="Text Box Size"
          value={params.textBoxSize}
          min={0.5}
          max={1.5}
          step={0.05}
          onChange={(v) => update({ textBoxSize: v })}
          format={(v) => `${v.toFixed(2)}×`}
        />
        <SliderRow
          label="Min FS"
          value={params.minFS}
          min={0}
          max={60}
          step={1}
          onChange={(v) => update({ minFS: v })}
          format={(v) => `${v}u`}
        />
        <SliderRow
          label="Max FS"
          value={params.maxFS}
          min={20}
          max={150}
          step={1}
          onChange={(v) => update({ maxFS: v })}
          format={(v) => `${v}u`}
        />
      </Group>

      {/* ============ Group 5 — Advanced ============ */}
      <Group title="Advanced">
        <PillRow
          label="Font"
          options={[
            { key: 'mono', label: 'mono' },
            { key: 'sans', label: 'sans' },
            { key: 'serif', label: 'serif' },
          ]}
          value={params.fontFamily}
          onChange={(v) => update({ fontFamily: v as FontFamily })}
        />
        <ToggleRow
          label="Italic"
          value={params.italic}
          onChange={(v) => update({ italic: v })}
        />
        <SliderRow
          label="Line Height"
          value={params.lineHeight}
          min={1.0}
          max={2.5}
          step={0.05}
          onChange={(v) => update({ lineHeight: v })}
          format={(v) => v.toFixed(2)}
        />
        <SliderRow
          label="Grid sizeVar"
          value={params.gridSizeVar}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => update({ gridSizeVar: v })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <SliderRow
          label="Phyllo sizeVar"
          value={params.phylloSizeVar}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => update({ phylloSizeVar: v })}
          format={(v) => `${Math.round(v * 100)}%`}
          accentClass="slider-phyllo"
        />
        <SliderRow
          label="Rotation"
          value={params.phylloRotation}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => update({ phylloRotation: v })}
          format={(v) => `${Math.round(v * 100)}%`}
          accentClass="slider-phyllo"
        />
        <SliderRow
          label="Density"
          value={params.phylloDensity}
          min={0.15}
          max={0.55}
          step={0.05}
          onChange={(v) => update({ phylloDensity: v })}
          format={(v) => `${Math.round(v * 100)}%`}
          accentClass="slider-phyllo"
        />
        <SliderRow
          label="Trials"
          value={params.phylloTrials}
          min={3}
          max={30}
          step={1}
          onChange={(v) => update({ phylloTrials: v })}
          accentClass="slider-phyllo"
        />
        <ToggleRow
          label="Auto Retry"
          value={params.autoRetry}
          onChange={(v) => update({ autoRetry: v })}
        />
        <SliderRow
          label="Min Score"
          value={params.minScore}
          min={0}
          max={80}
          step={1}
          onChange={(v) => update({ minScore: v })}
          format={(v) => `${v}%`}
        />
        <SliderRow
          label="Max Retries"
          value={params.maxRetries}
          min={10}
          max={300}
          step={10}
          onChange={(v) => update({ maxRetries: v })}
        />
      </Group>
      </div>

      {onReset && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onReset}
            className="font-heading cursor-pointer rounded-md px-3 py-1.5 text-[11px] tracking-wide transition-all"
            style={{
              color: 'var(--text-tertiary)',
              border: '1px solid var(--border-surface)',
              background: 'transparent',
              transitionDuration: 'var(--duration-fast)',
            }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------

function Group({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group mb-3 block overflow-hidden rounded-md md:break-inside-avoid"
      style={{
        background: 'var(--surface)',
        border: '0.5px solid var(--border-subtle)',
      }}
    >
      <summary
        className="font-heading flex cursor-pointer select-none items-center justify-between px-2.5 py-1.5 text-[11px] tracking-wider uppercase group-open:border-b"
        style={{
          color: 'var(--text-secondary)',
          background: 'rgba(0, 0, 0, 0.06)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {title}
        <span
          className="font-mono text-[10px] transition-transform group-open:rotate-90"
          style={{ color: 'var(--text-tertiary)' }}
        >
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-1.5 px-2.5 pb-2.5 pt-2">{children}</div>
    </details>
  );
}

function PillRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="font-heading mr-0.5 text-[10px] tracking-wider uppercase"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {label}
      </span>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className="font-mono cursor-pointer rounded-full px-2.5 py-1 text-[11px] transition-all"
            style={{
              background: active ? 'var(--text-primary)' : 'transparent',
              color: active ? 'var(--bg)' : 'var(--text-secondary)',
              border: active ? 'none' : '1px solid var(--border-surface)',
              transitionDuration: 'var(--duration-fast)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span
        className="font-heading text-[11px] tracking-wider uppercase"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        aria-pressed={value}
        className="relative cursor-pointer rounded-full transition-all"
        style={{
          width: 34,
          height: 18,
          background: value ? 'var(--text-primary)' : 'var(--border-surface)',
          transitionDuration: 'var(--duration-fast)',
        }}
      >
        <span
          className="absolute top-0.5 block rounded-full transition-all"
          style={{
            width: 14,
            height: 14,
            left: value ? 18 : 2,
            background: 'var(--surface)',
            transitionDuration: 'var(--duration-fast)',
          }}
        />
      </button>
    </div>
  );
}
