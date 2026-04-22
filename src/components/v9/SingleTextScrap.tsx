'use client';

import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import type { FontFamily, HAlign, VAlign } from '../../engine/v9/types';
import { estimateTextLayout } from '../../engine/v9/text';

const FF_VAR: Record<FontFamily, string> = {
  mono: 'var(--font-jetbrains), "JetBrains Mono", monospace',
  sans: 'var(--font-outfit), "Helvetica Neue", Arial, sans-serif',
  serif: 'var(--font-newsreader), Georgia, "Times New Roman", serif',
};

interface Props {
  text: string;
  /** display pixels — renderer has already scaled normalized frame to display */
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
  color?: string;
}

export default function SingleTextScrap({
  text,
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
  color = 'rgba(255,255,255,0.92)',
}: Props) {
  const est = useMemo(
    () =>
      estimateTextLayout(text, w, h, {
        padFractionX,
        padFractionY,
        lineHeight,
        fontFamily,
        italic,
      }),
    [text, w, h, padFractionX, padFractionY, lineHeight, fontFamily, italic],
  );
  const [fs, setFs] = useState(est.fontSize);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const t = textRef.current;
    const c = containerRef.current;
    if (!t || !c) return;
    let cur = est.fontSize;
    t.style.fontSize = `${cur}px`;
    void t.offsetHeight;
    for (let i = 0; i < 25; i++) {
      const availH = c.clientHeight - est.padY * 2;
      const textH = t.offsetHeight;
      if (textH <= availH + 1) break;
      if (cur <= 3) break;
      cur = Math.max(3, cur * 0.9);
      t.style.fontSize = `${cur}px`;
      void t.offsetHeight;
    }
    setFs(cur);
  }, [est.fontSize, est.padY, w, h, text]);

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
  const italicBump = italic && fontFamily === 'serif' ? Math.max(2, fs * 0.05) : 0;

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
      }}
    >
      <div
        ref={textRef}
        style={{
          fontSize: Math.max(6, fs),
          lineHeight,
          color,
          fontFamily: FF_VAR[fontFamily],
          fontStyle: italic ? 'italic' : 'normal',
          fontWeight,
          textAlign: hAlign,
          wordBreak: est.isSingleWord ? 'normal' : 'break-word',
          whiteSpace: est.isSingleWord ? 'nowrap' : 'normal',
          letterSpacing: fs > 28 ? '0.02em' : '0.005em',
          maxWidth: '100%',
        }}
      >
        {text}
      </div>
    </div>
  );
}
