'use client';

import type { LayoutV9Result, TextRenderOpts } from '../../engine/v9/types';
import CanvasViewV9 from './CanvasViewV9';
import StatsBarV9 from './StatsBarV9';

interface Props {
  grid: LayoutV9Result;
  phyllo: LayoutV9Result;
  tOpts: TextRenderOpts;
  images?: Record<string, string>;
  bgColor?: string;
  borderWidth?: number;
  textBorderOpacity?: number;
  shadowOpacity?: number;
  isDarkBg?: boolean;
}

// Canvas height cap: the pair of canvases is capped at this height on desktop
// (or 55vh on very short viewports). The per-column max-width below is derived
// from this so tall ratios shrink both canvases together, preserving the 16px
// inter-canvas gap from flex gap-4.
const CANVAS_MAX_H = 'min(420px, 55vh)';

export default function DualCanvasView({
  grid,
  phyllo,
  tOpts,
  images,
  bgColor,
  borderWidth,
  textBorderOpacity,
  shadowOpacity,
  isDarkBg,
}: Props) {
  const gridMaxW = `calc(${CANVAS_MAX_H} * ${grid.NW} / ${grid.NH})`;
  const phylloMaxW = `calc(${CANVAS_MAX_H} * ${phyllo.NW} / ${phyllo.NH})`;
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-center md:gap-4">
      <div
        className="flex w-full flex-col gap-2 md:flex-1 md:min-w-0"
        style={{ maxWidth: gridMaxW }}
      >
        <CanvasViewV9
          frames={grid.frames}
          NW={grid.NW}
          NH={grid.NH}
          tOpts={tOpts}
          images={images}
          bgColor={bgColor}
          borderWidth={borderWidth}
          textBorderOpacity={textBorderOpacity}
          shadowOpacity={shadowOpacity}
          label="Grid"
          accentColor="var(--accent-grid)"
          isDarkBg={isDarkBg}
        />
        <StatsBarV9
          frames={grid.frames}
          NW={grid.NW}
          NH={grid.NH}
          score={grid.score}
          retries={grid.retries}
          capHit={grid.capHit}
        />
      </div>
      <div
        className="flex w-full flex-col gap-2 md:flex-1 md:min-w-0"
        style={{ maxWidth: phylloMaxW }}
      >
        <CanvasViewV9
          frames={phyllo.frames}
          NW={phyllo.NW}
          NH={phyllo.NH}
          tOpts={tOpts}
          images={images}
          bgColor={bgColor}
          borderWidth={borderWidth}
          textBorderOpacity={textBorderOpacity}
          shadowOpacity={shadowOpacity}
          label="Phyllo"
          accentColor="var(--accent-phyllo)"
          isDarkBg={isDarkBg}
        />
        <StatsBarV9
          frames={phyllo.frames}
          NW={phyllo.NW}
          NH={phyllo.NH}
          score={phyllo.score}
          retries={phyllo.retries}
          capHit={phyllo.capHit}
        />
      </div>
    </div>
  );
}
