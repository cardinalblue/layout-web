'use client';

import AnimatedDemoV2_5 from './AnimatedDemoV2_5';

export default function HeroSectionV2_5() {
  const scrollToPlayground = () => {
    document.getElementById('playground-v2-5')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      className="flex flex-col items-center justify-center px-4 text-center"
      style={{ minHeight: '90vh', paddingTop: 'var(--sp-16)', paddingBottom: 'var(--sp-16)' }}
    >
      <h1
        className="font-display mb-4"
        style={{
          fontSize: 'clamp(36px, 6vw, 56px)',
          lineHeight: 1.1,
          color: 'var(--text-primary)',
        }}
      >
        Auto Layout Engine
      </h1>

      <p
        className="font-body mx-auto mb-10 max-w-md text-lg"
        style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}
      >
        Photos and words, automatically arranged.
      </p>

      <div className="mb-10 w-full">
        <AnimatedDemoV2_5 />
      </div>

      <button
        onClick={scrollToPlayground}
        className="font-heading cursor-pointer rounded-full px-8 py-3 text-sm font-semibold transition-all"
        style={{
          background: 'var(--text-primary)',
          color: 'var(--bg)',
          transitionDuration: 'var(--duration-fast)',
          transitionTimingFunction: 'var(--ease)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.03)';
          e.currentTarget.style.boxShadow = 'var(--shadow-elevated)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        Try It Below ↓
      </button>
    </section>
  );
}
