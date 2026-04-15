'use client';

interface UploadedPhoto {
  id: string;
  src: string;
  filename: string;
}

interface ThumbnailRowProps {
  photos: UploadedPhoto[];
  onRemove: (id: string) => void;
}

export default function ThumbnailRow({ photos, onRemove }: ThumbnailRowProps) {
  if (photos.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto py-2" style={{ scrollbarWidth: 'thin' }}>
      {photos.map((photo) => (
        <div
          key={photo.id}
          className="group relative shrink-0"
          style={{ width: '72px', height: '72px' }}
        >
          <img
            src={photo.src}
            alt={photo.filename}
            className="h-full w-full rounded-lg object-cover"
            style={{
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-subtle)',
            }}
            draggable={false}
          />
          <button
            onClick={() => onRemove(photo.id)}
            className="absolute -top-1.5 -right-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
            style={{
              background: 'var(--danger)',
              fontSize: '10px',
              transitionDuration: 'var(--duration-fast)',
            }}
            aria-label={`Remove ${photo.filename}`}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
