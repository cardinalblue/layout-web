'use client';

import { SAMPLE_PHOTOS, type SamplePhoto } from '../../data/v9/samplePhotos';

interface SamplePhotoPickerProps {
  selectedIds: Set<string>;
  onToggle: (sample: SamplePhoto) => void;
  onToggleAll: () => void;
}

export default function SamplePhotoPicker({
  selectedIds,
  onToggle,
  onToggleAll,
}: SamplePhotoPickerProps) {
  const allSelected = SAMPLE_PHOTOS.every((s) => selectedIds.has(s.id));

  return (
    <div className="flex flex-col gap-1.5">
      <p
        className="font-heading text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Try with sample photos
      </p>
      <div className="flex gap-2 overflow-x-auto py-1" style={{ scrollbarWidth: 'thin' }}>
        {SAMPLE_PHOTOS.map((sample) => {
          const selected = selectedIds.has(sample.id);
          return (
            <button
              key={sample.id}
              type="button"
              onClick={() => onToggle(sample)}
              aria-pressed={selected}
              aria-label={`Sample ${sample.filename}${selected ? ', selected' : ''}`}
              title={sample.filename}
              className="relative shrink-0 overflow-hidden rounded-lg"
              style={{
                width: '56px',
                height: '56px',
                border: selected
                  ? '2px solid var(--accent-phyllo)'
                  : '1px solid var(--border-subtle)',
                padding: 0,
                cursor: 'pointer',
                transition: 'border-color var(--duration-fast) var(--ease)',
              }}
            >
              <img
                src={sample.src}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            </button>
          );
        })}

        <button
          type="button"
          onClick={onToggleAll}
          aria-pressed={allSelected}
          aria-label={allSelected ? 'Deselect all sample photos' : 'Select all sample photos'}
          className="font-heading shrink-0 rounded-lg text-xs font-semibold"
          style={{
            width: '56px',
            height: '56px',
            border: '1px dashed var(--border-surface)',
            color: 'var(--text-secondary)',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          All
        </button>
      </div>
    </div>
  );
}
