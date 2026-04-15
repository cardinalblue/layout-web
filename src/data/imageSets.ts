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

// Canvas background colors — mid-tone, low-saturation, won't compete with photos
// HSL lightness 25–55%, saturation 8–25%, full hue range
export const CANVAS_BG_COLORS = [
  { label: 'Charcoal',   value: '#2E2E30' }, // neutral dark
  { label: 'Espresso',   value: '#3D3229' }, // warm dark brown
  { label: 'Slate',      value: '#4A5059' }, // cool blue-gray
  { label: 'Denim',      value: '#4E5B6A' }, // muted blue
  { label: 'Olive',      value: '#5C5E48' }, // earthy green
  { label: 'Mushroom',   value: '#7A7168' }, // warm neutral mid
  { label: 'Clay',       value: '#8B7464' }, // terracotta mid
  { label: 'Sage',       value: '#6E7D68' }, // muted green
  { label: 'Storm',      value: '#6B7580' }, // steel blue
  { label: 'Mauve',      value: '#7D6E78' }, // dusty purple
  { label: 'Blush',      value: '#8E7575' }, // muted rose
  { label: 'Sand',       value: '#8F8474' }, // warm beige mid
];

export const DEFAULT_CANVAS_BG = '#2E2E30';

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
