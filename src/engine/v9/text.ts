import type { RatioMode, RNG, FontFamily } from './types';

// ============================================================
// Font constants — all dimensions in NORMALIZED UNITS
// ============================================================

export const CHAR_W: Record<FontFamily, number> = {
  serif: 0.52,
  sans: 0.48,
  mono: 0.6,
};

const CJK_RE = /[一-鿿぀-ゟ゠-ヿ]/;
const CJK_GLOBAL = /[一-鿿぀-ゟ゠-ヿ]/g;

export function fontOvershoot(fontFamily: FontFamily, italic: boolean): number {
  if (!italic) return 0.03;
  if (fontFamily === 'serif') return 0.15;
  return 0.08;
}

// ============================================================
// estimateTextLayout — normalized-unit in, normalized-unit out
// (font-size return value is in normalized units — not display px)
// ============================================================

export interface EstOpts {
  padFractionX?: number;
  padFractionY?: number;
  lineHeight?: number;
  fontFamily?: FontFamily;
  italic?: boolean;
}

export interface EstResult {
  fontSize: number;
  lines: number;
  fillH: number;
  fillW: number;
  padX: number;
  padY: number;
  isSingleWord: boolean;
}

export function estimateTextLayout(
  text: string,
  boxW: number,
  boxH: number,
  opts: EstOpts = {},
): EstResult {
  const {
    padFractionX = 0.05,
    padFractionY = 0.05,
    lineHeight = 1.35,
    fontFamily = 'mono',
    italic = false,
  } = opts;
  const glyphExtraX = fontFamily === 'serif' && italic ? 0.03 : 0.01;
  // 3-unit floor in normalized space — ~1.7 display px on a 560-px canvas.
  const padX = Math.max(3, boxW * (padFractionX + glyphExtraX));
  const padY = Math.max(3, boxH * padFractionY);
  const innerW = boxW - padX * 2;
  const innerH = boxH - padY * 2;
  if (innerW < 8 || innerH < 8) {
    return { fontSize: 6, lines: 1, fillH: 0, fillW: 0, padX, padY, isSingleWord: false };
  }

  const charWF = CHAR_W[fontFamily] ?? 0.5;
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const isCJK = CJK_RE.test(text);
  const cjkCW = fontFamily === 'serif' && italic ? 1.05 : 1.0;
  const eCW = isCJK ? cjkCW : charWF;
  const isShort = words.length <= 3 && !isCJK;
  const isSingleWord = words.length === 1 && !isCJK;
  const isProportional = fontFamily !== 'mono';
  const isAllCaps =
    isSingleWord &&
    isProportional &&
    words[0] === words[0].toUpperCase() &&
    /[A-Z]/.test(words[0]);
  const effectiveCW = isAllCaps
    ? eCW * 1.35
    : isSingleWord && isProportional
      ? eCW * 1.15
      : eCW;

  const hCeil = 1 - fontOvershoot(fontFamily, italic);
  const wCeil = isSingleWord ? 0.88 : isCJK ? 0.9 : 0.92;

  let bestFS = 6;
  let bestLines = 1;
  let bestFillH = 0;
  let bestFillW = 0;

  for (let fs = 6; fs <= 200; fs += 0.5) {
    const charW = fs * effectiveCW;
    const lh = fs * lineHeight;
    const cpl = Math.max(1, Math.floor(innerW / (charW * 1.03)));
    let lines = 1;
    let lineLen = 0;
    let maxLC = 0;
    if (isCJK) {
      const chars = text.replace(/\s+/g, '');
      lines = Math.ceil(chars.length / cpl);
      maxLC = Math.min(chars.length, cpl);
    } else if (isSingleWord) {
      lines = 1;
      maxLC = words[0].length;
      lineLen = maxLC;
    } else {
      for (const word of words) {
        if (lineLen > 0 && lineLen + 1 + word.length > cpl) {
          maxLC = Math.max(maxLC, lineLen);
          lines++;
          lineLen = word.length;
        } else {
          lineLen += (lineLen > 0 ? 1 : 0) + word.length;
        }
      }
      maxLC = Math.max(maxLC, lineLen);
    }
    const textH = lines * lh;
    const textW = maxLC * charW;
    const hOK = textH <= innerH * hCeil;
    const wOK = isShort || isSingleWord || isCJK ? textW <= innerW * wCeil : true;
    if (!hOK || !wOK) {
      if (isSingleWord) break;
      continue;
    }
    bestFS = fs;
    bestLines = lines;
    bestFillH = textH / innerH;
    bestFillW = textW / innerW;
  }

  return {
    fontSize: bestFS,
    lines: bestLines,
    fillH: bestFillH,
    fillW: bestFillW,
    padX,
    padY,
    isSingleWord,
  };
}

// ============================================================
// estimatePairedLayout — unified budget for title + subtitle
// ============================================================

export interface PairedEst {
  titleFS: number;
  subFS: number;
  padX: number;
  padY: number;
}

export function estimatePairedLayout(
  title: string,
  subtitle: string,
  boxW: number,
  boxH: number,
  opts: EstOpts = {},
): PairedEst {
  const {
    padFractionX = 0.05,
    padFractionY = 0.05,
    lineHeight = 1.35,
    fontFamily = 'mono',
    italic = false,
  } = opts;
  const glyphExtraX = fontFamily === 'serif' && italic ? 0.03 : 0.01;
  const padX = Math.max(3, boxW * (padFractionX + glyphExtraX));
  const padY = Math.max(3, boxH * padFractionY);
  const innerW = boxW - padX * 2;
  const innerH = boxH - padY * 2;
  if (innerW < 8 || innerH < 8) return { titleFS: 6, subFS: 6, padX, padY };

  const charWF = CHAR_W[fontFamily] ?? 0.5;
  const GAP = padY * 0.3;
  const SUB_LH = lineHeight * 1.05;
  const safety = 1 - fontOvershoot(fontFamily, italic);
  const budget = innerH * safety - GAP;
  const titleBudget = budget * 0.55;
  const subBudget = budget * 0.45;

  const titleWords = title.split(/\s+/).filter((w) => w.length > 0);
  let titleFS = 6;
  for (let fs = 6; fs <= 150; fs += 0.5) {
    const charW = fs * charWF;
    const lh = fs * lineHeight;
    const cpl = Math.max(1, Math.floor(innerW / (charW * 1.03)));
    let lines = 1;
    let lineLen = 0;
    for (const w of titleWords) {
      if (lineLen > 0 && lineLen + 1 + w.length > cpl) {
        lines++;
        lineLen = w.length;
      } else {
        lineLen += (lineLen > 0 ? 1 : 0) + w.length;
      }
    }
    const hOK = lines * lh <= titleBudget;
    const wOK =
      titleWords.length > 3 || titleWords.join(' ').length * charW <= innerW * 0.92;
    if (!hOK || !wOK) continue;
    titleFS = fs;
  }

  const subWords = subtitle.split(/\s+/).filter((w) => w.length > 0);
  let subFS = 6;
  for (let fs = 6; fs <= 100; fs += 0.5) {
    const charW = fs * charWF;
    const lh = fs * SUB_LH;
    const cpl = Math.max(1, Math.floor(innerW / (charW * 1.03)));
    let lines = 1;
    let lineLen = 0;
    for (const w of subWords) {
      if (lineLen > 0 && lineLen + 1 + w.length > cpl) {
        lines++;
        lineLen = w.length;
      } else {
        lineLen += (lineLen > 0 ? 1 : 0) + w.length;
      }
    }
    if (lines * lh > subBudget) continue;
    subFS = fs;
  }

  subFS = Math.min(subFS, titleFS * 0.75);
  return { titleFS, subFS, padX, padY };
}

// ============================================================
// Single-row classifier & preferred ratios
// canvasW = NW (normalized 1000-unit width)
// ============================================================

export function widthInEm(text: string): number {
  const cjk = (text.match(CJK_GLOBAL) || []).length;
  const other = text.length - cjk;
  return cjk * 1.0 + other * 0.52;
}

export function isSingleRowPreferred(
  text: string,
  canvasW: number,
  minFS: number,
): boolean {
  // 28-unit floor independent of user minFS — see spec §Text-Scrap Integration.
  const fs = Math.max(minFS || 0, 28);
  const em = widthInEm(text);
  if (em <= 0) return false;
  const singleRowPx = em * fs * 1.05;
  return singleRowPx <= canvasW * 0.8;
}

export function textPreferredRatio(
  text: string,
  mode: RatioMode,
  canvasW: number,
  minFS: number,
): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const isCJK = CJK_RE.test(text);

  if (mode === 'tall') return Math.max(0.5, Math.min(0.9, 10 / Math.max(text.length, 1)));
  if (mode === 'square') return 1.0;

  const LINE_HEIGHT_REF = 1.35;
  const em = widthInEm(text);

  if (isSingleRowPreferred(text, canvasW, minFS)) {
    const r = em / LINE_HEIGHT_REF;
    return Math.max(3.5, Math.min(4.5, r));
  }

  let autoR: number;
  if (isCJK) {
    const c = text.replace(/\s+/g, '').length;
    autoR = c <= 4 ? 2.5 : c <= 8 ? 1.8 : c <= 16 ? 1.3 : 1.0;
  } else if (words.length <= 2) autoR = 2.8;
  else if (words.length <= 4) autoR = 2.0;
  else if (words.length <= 8) autoR = 1.5;
  else if (words.length <= 15) autoR = 1.2;
  else if (words.length <= 25) autoR = 1.0;
  else autoR = 0.85;

  if (mode === 'wide') return Math.min(4.0, autoR * 1.4);
  return autoR;
}

export function pairedPreferredRatio(
  title: string,
  subtitle: string,
  mode: RatioMode,
  canvasW: number,
  minFS: number,
): number {
  if (mode !== 'auto') return textPreferredRatio(`${title} ${subtitle}`, mode, canvasW, minFS);
  const tW = title.split(/\s+/).filter((w) => w.length > 0).length;
  const sW = subtitle.split(/\s+/).filter((w) => w.length > 0).length;
  if (tW <= 2 && sW <= 4) return 1.6;
  if (tW <= 3 && sW <= 8) return 1.2;
  if (tW <= 4 && sW <= 15) return 1.0;
  return 0.85;
}

// ============================================================
// Ratio search range + sampling + mutation
// ============================================================

export function textRatioRange(
  text: string,
  isPaired: boolean,
  subtitle: string | undefined,
  mode: RatioMode,
  canvasW: number,
  minFS: number,
): [number, number] {
  const base = isPaired
    ? pairedPreferredRatio(text, subtitle ?? '', mode, canvasW, minFS)
    : textPreferredRatio(text, mode, canvasW, minFS);
  const singleRow =
    !isPaired && (mode === 'auto' || mode === 'wide') && isSingleRowPreferred(text, canvasW, minFS);
  if (singleRow) {
    return [Math.max(base * 0.8, 1.5), Math.min(8.0, base * 1.25)];
  }
  if (mode === 'auto') {
    return [Math.max(0.4, base * 0.45), Math.min(8.0, base * 2.2)];
  }
  return [Math.max(0.4, base * 0.75), Math.min(8.0, base * 1.35)];
}

export function sampleTextRatio(
  text: string,
  isPaired: boolean,
  subtitle: string | undefined,
  mode: RatioMode,
  rng: RNG,
  canvasW: number,
  minFS: number,
): number {
  const [lo, hi] = textRatioRange(text, isPaired, subtitle, mode, canvasW, minFS);
  const base = isPaired
    ? pairedPreferredRatio(text, subtitle ?? '', mode, canvasW, minFS)
    : textPreferredRatio(text, mode, canvasW, minFS);
  if (rng() < 0.5) {
    const spread = (hi - lo) * 0.25;
    return Math.max(lo, Math.min(hi, base + (rng() - 0.5) * 2 * spread));
  }
  return lo + rng() * (hi - lo);
}

export function mutateRatio(
  ratio: number,
  lo: number,
  hi: number,
  rng: RNG,
  strength = 0.2,
): number {
  const range = hi - lo;
  const delta = (rng() - 0.5) * 2 * range * strength;
  return Math.max(lo, Math.min(hi, ratio + delta));
}
