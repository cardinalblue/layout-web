// ============================================================
// v9 Types — Normalized 1000-unit coordinate space
// ============================================================

export interface NormalizedCanvas {
  NW: number;
  NH: number;
}

export type RatioMode = 'auto' | 'wide' | 'square' | 'tall';

// ------------------------------------------------------------
// Items (first-class layout units — images + text scraps)
// ------------------------------------------------------------

export interface ImageItem {
  id: string;
  ratio: number;
  label: string;
  hue: number;
  isText: false;
  minArea: 0;
  maxArea: 0;
}

export interface TextItemSingle {
  id: string;
  ratio: number;
  label: string;
  hue: 0;
  isText: true;
  isPaired: false;
  text: string;
  subtitle?: undefined;
  minArea: number;
  maxArea: number;
}

export interface TextItemPaired {
  id: string;
  ratio: number;
  label: string;
  hue: 0;
  isText: true;
  isPaired: true;
  text: string;
  subtitle: string;
  minArea: number;
  maxArea: 0;
}

export type TextItem = TextItemSingle | TextItemPaired;
export type Item = ImageItem | TextItem;

// ------------------------------------------------------------
// Frames — output of the layout pipeline, in normalized units
// ------------------------------------------------------------

export interface Frame {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  item: Item;
}

// ------------------------------------------------------------
// Text rendering / scoring options
// ------------------------------------------------------------

export type FontFamily = 'serif' | 'sans' | 'mono';
export type VAlign = 'top' | 'center' | 'bottom';
export type HAlign = 'left' | 'center' | 'right';

export interface TextRenderOpts {
  padFractionX: number;
  padFractionY: number;
  lineHeight: number;
  fontFamily: FontFamily;
  italic: boolean;
  textBoxSize: number;
  minFS: number;
  maxFS: number;
  fontWeight: number;
  vAlign: VAlign;
  hAlign: HAlign;
}

// ------------------------------------------------------------
// User-facing text scrap input (shape of the editor entry)
// ------------------------------------------------------------

export interface TextScrapInput {
  id: string;
  isPaired: boolean;
  text: string;
  title?: string;
  subtitle?: string;
}

// ------------------------------------------------------------
// RNG
// ------------------------------------------------------------

export type RNG = () => number;

// ------------------------------------------------------------
// Wrapper input/output
// ------------------------------------------------------------

export interface LayoutV9Input {
  items: Item[];
  canvasRatio: number;
  gapPct: number;
  padPct: number;
  seed: number;
  ratioMode: RatioMode;
  ratioSearch: boolean;
  tOpts: TextRenderOpts;
  gridOpts?: { sizeVar: number };
  phylloOpts?: {
    sizeVar: number;
    rotation: number;
    density: number;
    trials: number;
  };
  postProc?: { scrapScalePct: number; tightnessPct: number };
  retry?: { enabled: boolean; minScore: number; maxRetries: number };
}

export interface LayoutV9Result {
  NW: number;
  NH: number;
  frames: Frame[];
  score: number;
  retries: number;
  capHit: boolean;
  textRatios: Record<string, number>;
}
