'use client';

import type { LayoutMode } from '../engine/types';
import SliderRow from './SliderRow';
import { IMAGE_SETS, CANVAS_RATIOS, CANVAS_BG_COLORS } from '../data/imageSets';

export interface LayoutParams {
  imageCount: number;
  imageSet: string;
  canvasRatio: string;
  gapPercent: number;
  paddingPercent: number;
  areaLimit: number;
  sizeVar: number;
  rotation: number;
  density: number;
  maxTrials: number;
}

interface ParameterPanelProps {
  mode: LayoutMode;
  params: LayoutParams;
  onParamsChange: (params: LayoutParams) => void;
  compact?: boolean;
  // Canvas ratio (managed externally for Upload section)
  canvasRatio?: string;
  onCanvasRatioChange?: (ratio: string) => void;
  // Background color
  bgColor: string;
  onBgColorChange: (color: string) => void;
}

export default function ParameterPanel({
  mode,
  params,
  onParamsChange,
  compact,
  canvasRatio: externalCanvasRatio,
  onCanvasRatioChange,
  bgColor,
  onBgColorChange,
}: ParameterPanelProps) {
  const update = (patch: Partial<LayoutParams>) => {
    onParamsChange({ ...params, ...patch });
  };

  const accentClass = mode === 'phyllo' ? 'slider-phyllo' : '';
  const accentColor = mode === 'grid' ? 'var(--accent-grid)' : 'var(--accent-phyllo)';

  // Use external canvas ratio if provided (Upload), else use params (Playground)
  const activeCanvasRatio = externalCanvasRatio ?? params.canvasRatio;
  const handleCanvasRatioChange = (key: string) => {
    if (onCanvasRatioChange) onCanvasRatioChange(key);
    else update({ canvasRatio: key });
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-xl p-4"
      style={{
        background: 'var(--surface)',
        border: '0.5px solid var(--border-surface)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Canvas ratio — always shown */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="font-heading mr-0.5 text-[10px] tracking-wider uppercase"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Canvas ratio
        </span>
        {Object.entries(CANVAS_RATIOS).map(([key, def]) => (
          <button
            key={key}
            onClick={() => handleCanvasRatioChange(key)}
            className="font-mono cursor-pointer rounded-full px-2.5 py-1 text-[11px] transition-all"
            style={{
              background: activeCanvasRatio === key ? accentColor : 'transparent',
              color: activeCanvasRatio === key ? '#fff' : 'var(--text-secondary)',
              border: activeCanvasRatio === key ? 'none' : '1px solid var(--border-surface)',
              transitionDuration: 'var(--duration-fast)',
            }}
          >
            {def.label}
          </button>
        ))}
      </div>

      {/* Background color — always shown */}
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
            onClick={() => onBgColorChange(c.value)}
            className="h-5 w-5 cursor-pointer rounded-full transition-all"
            style={{
              background: c.value,
              border: bgColor === c.value
                ? `2px solid ${accentColor}`
                : '1.5px solid var(--border-surface)',
              transform: bgColor === c.value ? 'scale(1.15)' : 'scale(1)',
              transitionDuration: 'var(--duration-fast)',
            }}
            aria-label={`Background: ${c.label}`}
            title={c.label}
          />
        ))}
      </div>

      {/* Image set + count — playground only */}
      {!compact && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="font-heading mr-0.5 text-[10px] tracking-wider uppercase"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Image set
            </span>
            {Object.entries(IMAGE_SETS).map(([key, def]) => (
              <button
                key={key}
                onClick={() => update({ imageSet: key })}
                className="font-heading cursor-pointer rounded-full px-2.5 py-1 text-[11px] transition-all"
                style={{
                  background: params.imageSet === key ? accentColor : 'transparent',
                  color: params.imageSet === key ? '#fff' : 'var(--text-secondary)',
                  border: params.imageSet === key ? 'none' : '1px solid var(--border-surface)',
                  transitionDuration: 'var(--duration-fast)',
                }}
              >
                {def.label}
              </button>
            ))}
          </div>
          <SliderRow
            label="Images"
            value={params.imageCount}
            min={2}
            max={12}
            step={1}
            onChange={(v) => update({ imageCount: v })}
            accentClass={accentClass}
          />
        </div>
      )}

      {/* Layout sliders */}
      <SliderRow
        label="Gap"
        value={params.gapPercent}
        min={1}
        max={8}
        step={0.5}
        onChange={(v) => update({ gapPercent: v })}
        format={(v) => `${v}%`}
        accentClass={accentClass}
      />
      <SliderRow
        label="Padding"
        value={params.paddingPercent}
        min={2}
        max={12}
        step={0.5}
        onChange={(v) => update({ paddingPercent: v })}
        format={(v) => `${v}%`}
        accentClass={accentClass}
      />

      {mode === 'grid' && (
        <SliderRow
          label="Area Limit"
          value={params.areaLimit}
          min={2}
          max={6}
          step={0.5}
          onChange={(v) => update({ areaLimit: v })}
          format={(v) => `${v}x`}
        />
      )}

      {mode === 'phyllo' && (
        <>
          <SliderRow
            label="Size Var"
            value={params.sizeVar}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => update({ sizeVar: v })}
            format={(v) => `${Math.round(v * 100)}%`}
            accentClass="slider-phyllo"
          />
          <SliderRow
            label="Rotation"
            value={params.rotation}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => update({ rotation: v })}
            format={(v) => `${Math.round(v * 100)}%`}
            accentClass="slider-phyllo"
          />
          <SliderRow
            label="Density"
            value={params.density}
            min={0.15}
            max={0.55}
            step={0.05}
            onChange={(v) => update({ density: v })}
            format={(v) => `${Math.round(v * 100)}%`}
            accentClass="slider-phyllo"
          />
          <SliderRow
            label="Trials"
            value={params.maxTrials}
            min={1}
            max={20}
            step={1}
            onChange={(v) => update({ maxTrials: v })}
            accentClass="slider-phyllo"
          />
        </>
      )}
    </div>
  );
}
