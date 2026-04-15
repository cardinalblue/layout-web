'use client';

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  accentClass?: string;
}

export default function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  accentClass,
}: SliderRowProps) {
  const displayValue = format ? format(value) : String(value);

  return (
    <div className={`flex items-center gap-3 ${accentClass ?? ''}`}>
      <span
        className="font-heading shrink-0 text-xs"
        style={{ color: 'var(--text-secondary)', width: '80px' }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1"
        style={{ height: '32px' }}
        aria-label={label}
      />
      <span
        className="font-mono shrink-0 text-right text-xs"
        style={{ color: 'var(--text-primary)', width: '48px' }}
      >
        {displayValue}
      </span>
    </div>
  );
}
