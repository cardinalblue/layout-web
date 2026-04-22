'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { Frame, TextRenderOpts } from '../../engine/v9/types';
import SingleTextScrap from './SingleTextScrap';
import PairedTextScrap from './PairedTextScrap';

function hueToColor(hue: number): string {
  return `hsl(${hue}, 45%, 55%)`;
}

interface Props {
  frames: Frame[];
  NW: number;
  NH: number;
  tOpts: TextRenderOpts;
  images?: Record<string, string>;
  bgColor?: string;
  borderWidth?: number;
  /** Opacity (0–1) of the border stroke applied to text scraps. Independent from
   *  the solid-white border drawn on image scraps. */
  textBorderOpacity?: number;
  shadowOpacity?: number;
  label?: string;
  accentColor?: string;
  /** Max display width in px; canvas will never exceed this even if its container is wider. */
  maxDisplayW?: number;
  isDarkBg?: boolean;
  /** Item ids to outline with an accent ring — used by the text-flow story. */
  highlightIds?: string[];
  /** Color for the highlight ring; defaults to --accent-phyllo. */
  highlightColor?: string;
}

export default function CanvasViewV9({
  frames,
  NW,
  NH,
  tOpts,
  images,
  bgColor,
  borderWidth = 0,
  textBorderOpacity = 0.3,
  shadowOpacity,
  label,
  accentColor,
  maxDisplayW,
  isDarkBg = true,
  highlightIds,
  highlightColor,
}: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // Actual rendered canvas width in display pixels — used to derive child dimensions
  // so the shrink-loop estimator matches the real DOM size.
  const [canvasPxW, setCanvasPxW] = useState(0);

  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setCanvasPxW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sorted = [...frames].sort((a, b) => a.id.localeCompare(b.id));
  const textColor = isDarkBg ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.88)';
  const textSubColor = isDarkBg ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';

  // Display scale: px per normalized unit. Used only for sizing text-scrap children
  // (frame positioning itself uses percentages so it stays fluid).
  const sc = canvasPxW > 0 ? canvasPxW / NW : 0;

  return (
    <div className="mx-auto w-full" style={{ maxWidth: maxDisplayW ? `${maxDisplayW}px` : undefined }}>
      {label && (
        <div
          className="font-heading mb-1.5 text-center text-[10px] tracking-wider uppercase"
          style={{ color: accentColor ?? 'var(--text-tertiary)', fontWeight: 600 }}
        >
          {label}
        </div>
      )}
      <div
        ref={canvasRef}
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: `${NW} / ${NH}`,
          background: bgColor ?? 'var(--canvas-bg)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-canvas)',
        }}
        role="img"
        aria-label={label ? `${label} layout with ${frames.length} items` : `Layout with ${frames.length} items`}
      >
        {sorted.map((frame) => {
          const leftPct = (frame.x / NW) * 100;
          const topPct = (frame.y / NH) * 100;
          const widthPct = (frame.w / NW) * 100;
          const heightPct = (frame.h / NH) * 100;
          const rotation = frame.rot ?? 0;
          const hasRotation = Math.abs(rotation) > 0.1;
          const op = shadowOpacity ?? (hasRotation ? 0.35 : 0.25);
          const shadow =
            op > 0
              ? hasRotation
                ? `0 4px 12px rgba(0,0,0,${op})`
                : `0 2px 8px rgba(0,0,0,${op})`
              : 'none';
          const border = borderWidth > 0 ? `${borderWidth}px solid white` : undefined;
          const textBorder =
            borderWidth > 0 && textBorderOpacity > 0
              ? `${borderWidth}px solid rgba(255,255,255,${textBorderOpacity})`
              : undefined;
          const isText = frame.item.isText;
          const isHighlighted = highlightIds?.includes(frame.item.id) ?? false;
          const ringColor = highlightColor ?? 'var(--accent-phyllo)';
          const src = !isText && images ? images[frame.item.id] : undefined;
          const placeholderColor = !isText ? hueToColor(frame.item.hue) : 'transparent';
          // Display-px size passed to text scraps so their estimator + shrink loop
          // operates on the real rendered box.
          const pxW = sc > 0 ? frame.w * sc : 0;
          const pxH = sc > 0 ? frame.h * sc : 0;

          return (
            <div
              key={frame.id}
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                top: `${topPct}%`,
                width: `${widthPct}%`,
                height: `${heightPct}%`,
                transform: `rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                willChange: 'transform, left, top, width, height',
                borderRadius: isText ? 0 : 'var(--radius-sm)',
                boxShadow: isHighlighted
                  ? `inset 0 0 0 2px ${ringColor}, 0 0 0 2px ${ringColor}, ${
                      isText ? 'none' : shadow
                    }`
                  : isText
                    ? 'none'
                    : shadow,
                border: isText ? textBorder : border,
                boxSizing: 'border-box',
                overflow: 'hidden',
                background: isText ? 'transparent' : placeholderColor,
                transition:
                  'left 600ms cubic-bezier(0.4,0,0.2,1), top 600ms cubic-bezier(0.4,0,0.2,1), width 600ms cubic-bezier(0.4,0,0.2,1), height 600ms cubic-bezier(0.4,0,0.2,1), transform 600ms cubic-bezier(0.4,0,0.2,1)',
              }}
            >
              {isText && pxW > 0 && pxH > 0 ? (
                frame.item.isPaired ? (
                  <PairedTextScrap
                    title={frame.item.text}
                    subtitle={frame.item.subtitle}
                    w={pxW}
                    h={pxH}
                    vAlign={tOpts.vAlign}
                    hAlign={tOpts.hAlign}
                    fontFamily={tOpts.fontFamily}
                    lineHeight={tOpts.lineHeight}
                    padFractionX={tOpts.padFractionX}
                    padFractionY={tOpts.padFractionY}
                    fontWeight={tOpts.fontWeight}
                    italic={tOpts.italic}
                    titleColor={textColor}
                    subtitleColor={textSubColor}
                  />
                ) : (
                  <SingleTextScrap
                    text={frame.item.text}
                    w={pxW}
                    h={pxH}
                    vAlign={tOpts.vAlign}
                    hAlign={tOpts.hAlign}
                    fontFamily={tOpts.fontFamily}
                    lineHeight={tOpts.lineHeight}
                    padFractionX={tOpts.padFractionX}
                    padFractionY={tOpts.padFractionY}
                    fontWeight={tOpts.fontWeight}
                    italic={tOpts.italic}
                    color={textColor}
                  />
                )
              ) : !isText && src ? (
                <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : !isText ? (
                <div
                  className="flex h-full w-full items-center justify-center"
                  style={{ background: placeholderColor }}
                >
                  {frame.item.label && (
                    <span
                      className="font-mono text-white/80"
                      style={{
                        fontSize: 'clamp(8px, 1.5vw, 12px)',
                        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                      }}
                    >
                      {frame.item.label}
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
