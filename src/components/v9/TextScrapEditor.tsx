'use client';

import type { TextScrapInput } from '../../engine/v9/types';
import {
  TEXT_SCRAP_PRESETS_SINGLE,
  TEXT_SCRAP_PRESETS_PAIRED,
} from '../../data/v9/textPresets';

interface Props {
  scraps: TextScrapInput[];
  onChange: (scraps: TextScrapInput[]) => void;
  max?: number;
}

function newScrapId(): string {
  return `txt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function TextScrapEditor({ scraps, onChange, max = 3 }: Props) {
  const update = (id: string, patch: Partial<TextScrapInput>) => {
    onChange(scraps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const remove = (id: string) => {
    onChange(scraps.filter((s) => s.id !== id));
  };
  const addSingle = () => {
    if (scraps.length >= max) return;
    onChange([...scraps, { id: newScrapId(), isPaired: false, text: '' }]);
  };
  const addPaired = () => {
    if (scraps.length >= max) return;
    onChange([
      ...scraps,
      { id: newScrapId(), isPaired: true, text: '', title: '', subtitle: '' },
    ]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-heading text-[10px] tracking-wider uppercase"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Text scraps ({scraps.length}/{max})
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={addSingle}
            disabled={scraps.length >= max}
            className="font-heading cursor-pointer rounded-full px-2.5 py-1 text-[11px] transition-all"
            style={{
              background: 'transparent',
              color: scraps.length >= max ? 'var(--text-tertiary)' : 'var(--text-secondary)',
              border: '1px solid var(--border-surface)',
              cursor: scraps.length >= max ? 'not-allowed' : 'pointer',
              transitionDuration: 'var(--duration-fast)',
            }}
          >
            + single
          </button>
          <button
            type="button"
            onClick={addPaired}
            disabled={scraps.length >= max}
            className="font-heading cursor-pointer rounded-full px-2.5 py-1 text-[11px] transition-all"
            style={{
              background: 'transparent',
              color: scraps.length >= max ? 'var(--text-tertiary)' : 'var(--text-secondary)',
              border: '1px solid var(--border-surface)',
              cursor: scraps.length >= max ? 'not-allowed' : 'pointer',
              transitionDuration: 'var(--duration-fast)',
            }}
          >
            + paired
          </button>
        </div>
      </div>

      {scraps.map((s) => (
        <div
          key={s.id}
          className="flex flex-col gap-1 rounded-md p-1.5"
          style={{
            background: 'var(--bg)',
            border: '0.5px solid var(--border-surface)',
          }}
        >
          <div className="flex items-center justify-between">
            <span
              className="font-mono text-[10px]"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {s.isPaired ? 'PAIRED' : 'SINGLE'}
            </span>
            <button
              type="button"
              onClick={() => remove(s.id)}
              className="font-heading cursor-pointer rounded-full px-2 py-0.5 text-[10px] transition-all"
              style={{
                color: 'var(--text-tertiary)',
                border: '1px solid var(--border-surface)',
                background: 'transparent',
                transitionDuration: 'var(--duration-fast)',
              }}
              aria-label="Remove text scrap"
            >
              remove
            </button>
          </div>
          {s.isPaired ? (
            <>
              <div className="flex flex-wrap gap-1">
                {TEXT_SCRAP_PRESETS_PAIRED.map((p) => (
                  <PresetChip
                    key={p.id}
                    label={p.label}
                    onClick={() => update(s.id, { title: p.title, subtitle: p.subtitle })}
                  />
                ))}
              </div>
              <input
                type="text"
                value={s.title ?? ''}
                onChange={(e) => update(s.id, { title: e.target.value })}
                placeholder="Title"
                className="font-body rounded border px-2 py-0.5 text-xs"
                style={{
                  background: 'var(--surface)',
                  borderColor: 'var(--border-surface)',
                  color: 'var(--text-primary)',
                }}
              />
              <input
                type="text"
                value={s.subtitle ?? ''}
                onChange={(e) => update(s.id, { subtitle: e.target.value })}
                placeholder="Subtitle"
                className="font-body rounded border px-2 py-0.5 text-xs"
                style={{
                  background: 'var(--surface)',
                  borderColor: 'var(--border-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                {TEXT_SCRAP_PRESETS_SINGLE.map((p) => (
                  <PresetChip
                    key={p.id}
                    label={p.label}
                    onClick={() => update(s.id, { text: p.text })}
                  />
                ))}
              </div>
              <textarea
                value={s.text}
                onChange={(e) => update(s.id, { text: e.target.value })}
                placeholder="Text"
                rows={s.text.length > 60 ? 2 : 1}
                className="font-body resize-y rounded border px-2 py-1 text-xs"
                style={{
                  background: 'var(--surface)',
                  borderColor: 'var(--border-surface)',
                  color: 'var(--text-primary)',
                  minHeight: '28px',
                }}
              />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function PresetChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-mono cursor-pointer rounded-full px-2 py-0.5 text-[10px] transition-all"
      style={{
        background: 'transparent',
        color: 'var(--text-tertiary)',
        border: '1px solid var(--border-surface)',
        transitionDuration: 'var(--duration-fast)',
      }}
    >
      {label}
    </button>
  );
}
