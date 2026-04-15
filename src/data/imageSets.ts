export interface ImageSetDef {
  label: string;
  ratios: number[];
}

export const IMAGE_SETS: Record<string, ImageSetDef> = {
  mixed: {
    label: 'Mixed',
    ratios: [4 / 3, 3 / 4, 1, 16 / 9, 3 / 2, 9 / 16, 5 / 4],
  },
  landscape: {
    label: 'Landscape',
    ratios: [16 / 9, 3 / 2, 4 / 3, 5 / 4],
  },
  portrait: {
    label: 'Portrait',
    ratios: [3 / 4, 9 / 16, 2 / 3, 4 / 5],
  },
  square: {
    label: 'Square',
    ratios: [1],
  },
  extreme: {
    label: 'Extreme',
    ratios: [21 / 9, 9 / 21, 3 / 1, 1 / 3, 16 / 9, 9 / 16],
  },
};

export interface CanvasRatioDef {
  label: string;
  width: number;
  height: number;
}

export const CANVAS_RATIOS: Record<string, CanvasRatioDef> = {
  '4:3': { label: '4:3', width: 4, height: 3 },
  '1:1': { label: '1:1', width: 1, height: 1 },
  '3:4': { label: '3:4', width: 3, height: 4 },
  '16:9': { label: '16:9', width: 16, height: 9 },
  '9:16': { label: '9:16', width: 9, height: 16 },
};

// Placeholder colors for canvas preview (warm, varied palette)
export const PLACEHOLDER_COLORS = [
  '#E8927C', // salmon
  '#7CB5E8', // sky blue
  '#A8D5A2', // sage green
  '#D4A8E8', // lavender
  '#E8D47C', // warm yellow
  '#7CE8C9', // teal
  '#E87CA8', // rose
  '#C9A87C', // tan
  '#7C8BE8', // periwinkle
  '#E8A87C', // peach
  '#7CE8A8', // mint
  '#D47CE8', // orchid
  '#E8C97C', // gold
  '#7CD4E8', // cyan
  '#A8E87C', // lime
];

// Canvas background colors — 8 hues evenly spaced (~50°), low-saturation, mid-brightness
// HSL S:12–18%, L:28–48%
export const CANVAS_BG_COLORS = [
  { label: 'Charcoal', value: '#474747' }, // neutral
  { label: 'Blush',    value: '#8C6C69' }, // warm rose     H:5
  { label: 'Clay',     value: '#8A7260' }, // terracotta    H:25
  { label: 'Olive',    value: '#797E63' }, // earthy green  H:70
  { label: 'Sage',     value: '#67836C' }, // muted green   H:130
  { label: 'Teal',     value: '#60807D' }, // muted teal    H:175
  { label: 'Storm',    value: '#637288' }, // steel blue    H:215
  { label: 'Mauve',    value: '#7F6783' }, // dusty purple  H:290
];

export const DEFAULT_CANVAS_BG = '#474747';

export function generateImages(
  setKey: string,
  count: number,
): { id: string; aspectRatio: number }[] {
  const set = IMAGE_SETS[setKey] ?? IMAGE_SETS.mixed;
  return Array.from({ length: count }, (_, i) => ({
    id: `img-${i}`,
    aspectRatio: set.ratios[i % set.ratios.length],
  }));
}
