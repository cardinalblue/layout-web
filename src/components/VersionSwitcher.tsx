'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const VERSIONS = [
  { key: 'v1', href: '/v1', label: 'V1', short: '1' },
  { key: 'v2', href: '/v2', label: 'V2', short: '2' },
];

export default function VersionSwitcher() {
  const pathname = usePathname() ?? '';
  const active = VERSIONS.find((v) => pathname.startsWith(v.href))?.key ?? 'v2';

  return (
    <div
      className="fixed z-50 flex gap-1 rounded-full p-1"
      style={{
        top: 'var(--sp-4)',
        right: 'var(--sp-4)',
        background: 'var(--surface)',
        border: '0.5px solid var(--border-surface)',
        boxShadow: 'var(--shadow-card)',
      }}
      aria-label="Algorithm version"
    >
      {VERSIONS.map((v) => {
        const isActive = v.key === active;
        return (
          <Link
            key={v.key}
            href={v.href}
            aria-current={isActive ? 'page' : undefined}
            className="font-heading inline-flex items-center justify-center rounded-full text-xs font-semibold transition-all"
            style={{
              height: '32px',
              minWidth: '32px',
              padding: '0 10px',
              background: isActive ? 'var(--text-primary)' : 'transparent',
              color: isActive ? 'var(--bg)' : 'var(--text-secondary)',
              transitionDuration: 'var(--duration-fast)',
              transitionTimingFunction: 'var(--ease)',
            }}
          >
            <span className="hidden sm:inline">{v.label}</span>
            <span className="sm:hidden">{v.short}</span>
          </Link>
        );
      })}
    </div>
  );
}
