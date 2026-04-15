'use client';

interface UploadedPhoto {
  id: string;
  src: string;
  filename: string;
}

interface ThumbnailRowProps {
  photos: UploadedPhoto[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onAddMore: (files: File[]) => void;
}

export default function ThumbnailRow({ photos, onRemove, onClearAll, onAddMore }: ThumbnailRowProps) {
  if (photos.length === 0) return null;

  const handleAddMore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      if (files.length > 0) onAddMore(files);
    };
    input.click();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2.5 overflow-x-auto py-1" style={{ scrollbarWidth: 'thin' }}>
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="relative shrink-0"
            style={{ width: '56px', height: '56px' }}
          >
            <img
              src={photo.src}
              alt={photo.filename}
              className="h-full w-full rounded-lg object-cover"
              style={{
                border: '1px solid var(--border-subtle)',
              }}
              draggable={false}
            />
            <button
              onClick={() => onRemove(photo.id)}
              className="absolute -top-1 -right-1 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-white"
              style={{
                background: 'var(--danger)',
                fontSize: '8px',
                lineHeight: 1,
              }}
              aria-label={`Remove ${photo.filename}`}
            >
              ✕
            </button>
          </div>
        ))}

        {/* Add more button */}
        <button
          onClick={handleAddMore}
          className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed transition-colors"
          style={{
            width: '56px',
            height: '56px',
            borderColor: 'var(--border-surface)',
            color: 'var(--text-tertiary)',
          }}
          aria-label="Add more photos"
        >
          <span className="text-xl leading-none">+</span>
        </button>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {photos.length} photo{photos.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onClearAll}
          className="font-heading cursor-pointer text-xs underline"
          style={{ color: 'var(--danger)' }}
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
