'use client';

import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import type { FontFamily, HAlign, VAlign } from '../../engine/v9/types';
import { estimatePairedLayout } from '../../engine/v9/text';

const FF_VAR: Record<FontFamily, string> = {
  mono: 'var(--font-jetbrains), "JetBrains Mono", monospace',
  sans: 'var(--font-outfit), "Helvetica Neue", Arial, sans-serif',
  serif: 'var(--font-newsreader), Georgia, "Times New Roman", serif',
};

interface Props {
  title: string;
  subtitle: string;
  w: number;
  h: number;
  vAlign: VAlign;
  hAlign: HAlign;
  fontFamily: FontFamily;
  lineHeight: number;
  padFractionX: number;
  padFractionY: number;
  fontWeight: number;
  italic: boolean;
  titleColor?: string;
  subtitleColor?: string;
}

export default function PairedTextScrap({
  title,
  subtitle,
  w,
  h,
  vAlign,
  hAlign,
  fontFamily,
  lineHeight,
  padFractionX,
  padFractionY,
  fontWeight,
  italic,
  titleColor = 'rgba(255,255,255,0.94)',
  subtitleColor = 'rgba(255,255,255,0.55)',
}: Props) {
  const est = useMemo(
    () =>
      estimatePairedLayout(title, subtitle, w, h, {
        padFractionX,
        padFractionY,
        lineHeight,
        fontFamily,
        italic,
      }),
    [title, subtitle, w, h, padFractionX, padFractionY, lineHeight, fontFamily, italic],
  );
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const subRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const c = containerRef.current;
    const t = titleRef.current;
    const s = subRef.current;
    if (!c || !t || !s) return;
    let cur = 1;
    t.style.fontSize = `${est.titleFS * cur}px`;
    s.style.fontSize = `${est.subFS * cur}px`;
    void c.offsetHeight;
    for (let i = 0; i < 25; i++) {
      const availH = c.clientHeight - est.padY * 2;
      const gap = est.padY * 0.3;
      const contentH = t.offsetHeight + gap + s.offsetHeight;
      if (contentH <= availH + 1) break;
      if (cur <= 0.2) break;
      cur = Math.max(0.2, cur * 0.9);
      t.style.fontSize = `${Math.max(6, est.titleFS * cur)}px`;
      s.style.fontSize = `${Math.max(6, est.subFS * cur)}px`;
      void c.offsetHeight;
    }
    setScale(cur);
  }, [est.titleFS, est.subFS, est.padY, w, h, title, subtitle]);

  const titleFS = Math.max(6, est.titleFS * scale);
  const subFS = Math.max(6, est.subFS * scale);
  const jMap: Record<VAlign, string> = {
    top: 'flex-start',
    center: 'center',
    bottom: 'flex-end',
  };
  const aMap: Record<HAlign, string> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  };
  const italicBump = italic && fontFamily === 'serif' ? Math.max(2, titleFS * 0.05) : 0;

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: jMap[vAlign],
        alignItems: aMap[hAlign],
        padding: `${est.padY}px ${est.padX}px ${est.padY}px ${est.padX + italicBump}px`,
        overflow: 'hidden',
        gap: est.padY * 0.3,
      }}
    >
      <div
        ref={titleRef}
        style={{
          fontSize: titleFS,
          lineHeight,
          color: titleColor,
          fontFamily: FF_VAR[fontFamily],
          fontStyle: italic ? 'italic' : 'normal',
          fontWeight: Math.min(700, fontWeight + 200),
          textAlign: hAlign,
          wordBreak: 'break-word',
          letterSpacing: titleFS > 28 ? '0.02em' : '0.005em',
          maxWidth: '100%',
        }}
      >
        {title}
      </div>
      <div
        ref={subRef}
        style={{
          fontSize: subFS,
          lineHeight: lineHeight * 1.05,
          color: subtitleColor,
          fontFamily: FF_VAR[fontFamily],
          fontStyle: italic ? 'italic' : 'normal',
          fontWeight: Math.max(300, fontWeight - 100),
          textAlign: hAlign,
          wordBreak: 'break-word',
          letterSpacing: '0.01em',
          maxWidth: '100%',
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}
