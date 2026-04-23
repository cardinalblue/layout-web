import type { Item, RatioMode, TextScrapInput, ImageItem, TextItem } from './types';
import { getImgSet, RATIO_POOLS, HUES } from '../../data/v9/imageSets';
import { rng32 } from './shared';
import { isSingleRowPreferred, pairedPreferredRatio, textPreferredRatio, widthInEm } from './text';

export interface GenItemsArgs {
  imgCount: number;
  textScraps: TextScrapInput[];
  ratioMode: RatioMode;
  seed: number;
  setId: string;
  NW: number;
  minFS: number;
  textBoxSize: number;
  /** Optional override ratios — when caller supplies real uploaded photos. */
  imageRatios?: number[];
  /** Optional id prefix for images (default 'img-'). Uploaded photos may pass through their filename-based id. */
  imageIds?: string[];
}

export function genItems(args: GenItemsArgs): Item[] {
  const {
    imgCount,
    textScraps,
    ratioMode,
    seed,
    setId,
    NW,
    minFS,
    textBoxSize,
    imageRatios,
    imageIds,
  } = args;
  const set = getImgSet(setId);
  const rng = rng32(seed);
  const items: Item[] = [];

  // ------------------------------------------------------------
  // Images
  // ------------------------------------------------------------
  if (imageRatios && imageRatios.length > 0) {
    for (let i = 0; i < imageRatios.length; i++) {
      const id = imageIds?.[i] ?? `img-${i}`;
      const img: ImageItem = {
        id,
        ratio: imageRatios[i],
        label: '',
        hue: HUES[i % HUES.length],
        isText: false,
        minArea: 0,
        maxArea: 0,
      };
      items.push(img);
    }
  } else if (set.fixedPool) {
    const pool = [...set.fixedPool];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let i = 0; i < imgCount; i++) {
      const c = pool[i % pool.length];
      const img: ImageItem = {
        id: `img-${i}`,
        ratio: c.r,
        label: c.l,
        hue: HUES[i % HUES.length],
        isText: false,
        minArea: 0,
        maxArea: 0,
      };
      items.push(img);
    }
  } else {
    const totalW = Object.values(set.weights).reduce((s, w) => s + w, 0);
    for (let i = 0; i < imgCount; i++) {
      let r = rng() * totalW;
      let chosen = set.pools[0];
      for (const [poolName, w] of Object.entries(set.weights)) {
        r -= w;
        if (r <= 0) {
          chosen = poolName;
          break;
        }
      }
      const pool = RATIO_POOLS[chosen] ?? RATIO_POOLS.landscape;
      const c = pool[Math.floor(rng() * pool.length)];
      const img: ImageItem = {
        id: `img-${i}`,
        ratio: c.r,
        label: c.l,
        hue: HUES[i % HUES.length],
        isText: false,
        minArea: 0,
        maxArea: 0,
      };
      items.push(img);
    }
  }

  // ------------------------------------------------------------
  // Text scraps
  // ------------------------------------------------------------
  const resolvedImgCount = imageRatios?.length ?? imgCount;
  let tid = resolvedImgCount;
  for (const ts of textScraps) {
    const isPaired = !!ts.isPaired;
    const primary = isPaired ? (ts.title ?? '') : ts.text;
    const sub = isPaired ? (ts.subtitle ?? '') : '';
    const ratio = isPaired
      ? pairedPreferredRatio(primary, sub, ratioMode, NW, minFS)
      : textPreferredRatio(primary, ratioMode, NW, minFS);

    const fullText = isPaired ? `${primary} ${sub}` : primary;
    const em = widthInEm(fullText);
    let minArea = 0;
    let maxArea = 0;
    const isLong = isPaired || !isSingleRowPreferred(fullText, NW, minFS);
    if (isLong) {
      // Normalized units: targetFS=14, lhRef=2.0, charWF=0.55
      const targetFS = 14;
      const lhRef = 2.0;
      const charWF = 0.55;
      const textArea = em * targetFS * targetFS * lhRef * charWF;
      minArea = Math.min(textArea * 1.5 * textBoxSize, NW * NW * 0.2 * textBoxSize);
    } else {
      const targetFS = 28;
      const lhRef = 2.0;
      const charWF = 0.55;
      const tightArea = em * targetFS * targetFS * lhRef * charWF;
      maxArea = tightArea * 4.0 * textBoxSize;
    }

    const id = ts.id || `txt-${tid}`;
    if (isPaired) {
      const t: TextItem = {
        id,
        ratio,
        label: 'T+S',
        hue: 0,
        isText: true,
        isPaired: true,
        text: primary,
        subtitle: sub,
        minArea,
        maxArea: 0,
      };
      items.push(t);
    } else {
      const t: TextItem = {
        id,
        ratio,
        label: 'TXT',
        hue: 0,
        isText: true,
        isPaired: false,
        text: primary,
        minArea,
        maxArea,
      };
      items.push(t);
    }
    tid++;
  }

  return items;
}
