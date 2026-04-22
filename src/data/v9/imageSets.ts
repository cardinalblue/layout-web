// ============================================================
// v9 Image sets — 10 presets from spec/text-scrap-v9-2.jsx
// ============================================================

export const HUES = [
  210, 140, 28, 320, 170, 260, 95, 350, 55, 195, 280, 5, 75, 42,
];

export interface PoolEntry {
  r: number;
  l: string;
}

export const RATIO_POOLS: Record<string, PoolEntry[]> = {
  landscape: [
    { r: 2.35, l: 'cine' },
    { r: 1.778, l: '16:9' },
    { r: 1.5, l: '3:2' },
    { r: 1.333, l: '4:3' },
    { r: 1.2, l: '6:5' },
  ],
  portrait: [
    { r: 0.5625, l: '9:16' },
    { r: 0.667, l: '2:3' },
    { r: 0.75, l: '3:4' },
    { r: 0.8, l: '4:5' },
  ],
  square: [{ r: 1.0, l: '1:1' }],
  extreme_wide: [
    { r: 3.0, l: '3:1' },
    { r: 2.5, l: '5:2' },
  ],
  extreme_tall: [
    { r: 0.4, l: '2:5' },
    { r: 0.333, l: '1:3' },
  ],
};

export interface ImageSetDef {
  id: string;
  name: string;
  weights: Record<string, number>;
  pools: string[];
  fixedPool?: PoolEntry[];
}

export const IMG_SETS: ImageSetDef[] = [
  { id: 'mixed', name: 'Mixed', weights: { landscape: 3, portrait: 3, square: 2 }, pools: ['landscape', 'portrait', 'square'] },
  { id: 'all-land', name: 'Landscape', weights: { landscape: 10 }, pools: ['landscape'] },
  { id: 'all-port', name: 'Portrait', weights: { portrait: 10 }, pools: ['portrait'] },
  { id: 'all-sq', name: 'Square', weights: { square: 10 }, pools: ['square'] },
  {
    id: 'extreme',
    name: 'Extreme mix',
    weights: { extreme_wide: 3, extreme_tall: 3, square: 2 },
    pools: ['extreme_wide', 'extreme_tall', 'square'],
  },
  {
    id: 'land-outlier',
    name: 'Land+1 outlier',
    weights: { landscape: 8, extreme_tall: 2 },
    pools: ['landscape', 'extreme_tall'],
  },
  {
    id: 'port-outlier',
    name: 'Port+1 outlier',
    weights: { portrait: 8, extreme_wide: 2 },
    pools: ['portrait', 'extreme_wide'],
  },
  {
    id: 'photo-real',
    name: 'Camera mix',
    weights: {},
    pools: [],
    fixedPool: [
      { r: 0.75, l: 'phone' },
      { r: 0.75, l: 'phone' },
      { r: 1.333, l: 'cam' },
      { r: 1.5, l: 'cam' },
      { r: 0.5625, l: 'story' },
      { r: 1.778, l: 'screen' },
      { r: 1.0, l: 'IG' },
      { r: 0.8, l: '4:5' },
      { r: 0.75, l: 'phone' },
      { r: 1.5, l: 'cam' },
      { r: 1.0, l: 'IG' },
      { r: 0.5625, l: 'story' },
    ],
  },
  {
    id: 'gradient',
    name: 'Ratio gradient',
    weights: {},
    pools: [],
    fixedPool: [
      { r: 3.0, l: '3:1' },
      { r: 2.35, l: 'cine' },
      { r: 1.778, l: '16:9' },
      { r: 1.5, l: '3:2' },
      { r: 1.333, l: '4:3' },
      { r: 1.0, l: '1:1' },
      { r: 0.8, l: '4:5' },
      { r: 0.667, l: '2:3' },
      { r: 0.5625, l: '9:16' },
      { r: 0.4, l: '2:5' },
    ],
  },
  {
    id: 'pairs',
    name: 'Matched pairs',
    weights: {},
    pools: [],
    fixedPool: [
      { r: 1.5, l: '3:2' },
      { r: 1.5, l: '3:2' },
      { r: 0.667, l: '2:3' },
      { r: 0.667, l: '2:3' },
      { r: 1.0, l: '1:1' },
      { r: 1.0, l: '1:1' },
      { r: 1.778, l: '16:9' },
      { r: 1.778, l: '16:9' },
    ],
  },
];

export function getImgSet(id: string): ImageSetDef {
  return IMG_SETS.find((s) => s.id === id) ?? IMG_SETS[0];
}

// ============================================================
// Canvas aspect-ratio presets
// ============================================================

export interface CanvasRatioDef {
  label: string;
  ratio: number;
}

export const V9_CANVAS_RATIOS: Record<string, CanvasRatioDef> = {
  '16:9': { label: '16:9', ratio: 16 / 9 },
  '4:3': { label: '4:3', ratio: 4 / 3 },
  '1:1': { label: '1:1', ratio: 1 },
  '3:4': { label: '3:4', ratio: 3 / 4 },
  '9:16': { label: '9:16', ratio: 9 / 16 },
};
