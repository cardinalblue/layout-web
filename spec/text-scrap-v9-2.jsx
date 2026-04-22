import { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";

// ═══════════════════════════════════════════════════════════
// TEXT SCRAP RESEARCH v9.2
// — Inherits v6.2 (Phyllo co-scoring, Seed near canvases)
// — v6.3 changes:
//   • Padding split into separate X/Y sliders (was single InPad).
//     Default 5%/5% so text sits tight against box edges.
//   • Adaptive safety factor: fontOvershoot(font, italic) gives
//     0.15 for italic serif, 0.08 italic sans/mono, 0.03 non-italic.
//     Non-italic text can now fill 97% of box (was 85%).
//   • Wide mode ratio fix: long wrapping text used to get 6:1 strip
//     (via `text.length/8` saturating at 6). Now wide = auto × 1.4
//     capped at 4.0, so 28-word text gets ~1.7 ratio instead of 6.
//   • Defaults updated: fontFamily=mono, fontWeight=700 (bold),
//     italic=false, minFS=20 (range 0-60), minScore=70, maxRetries=200,
//     lineHeight=2.0 (range 1.0-2.5).
// ═══════════════════════════════════════════════════════════

function rng32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function createPerlin(seed) { const rng = rng32(seed); const perm = Array.from({ length: 256 }, (_, i) => i); for (let i = 255; i > 0; i--) { const j = ~~(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; } const p = [...perm, ...perm]; const fade = t => t * t * t * (t * (t * 6 - 15) + 10); const lerp = (a, b, t) => a + t * (b - a); const grad = (hash, x, y) => { const h = hash & 3; const u = h < 2 ? x : y, v = h < 2 ? y : x; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); }; return (x, y) => { const X = ~~Math.floor(x) & 255, Y = ~~Math.floor(y) & 255; const xf = x - Math.floor(x), yf = y - Math.floor(y); const u = fade(xf), v = fade(yf); return lerp(lerp(grad(p[p[X]+Y], xf, yf), grad(p[p[X+1]+Y], xf-1, yf), u), lerp(grad(p[p[X]+Y+1], xf, yf-1), grad(p[p[X+1]+Y+1], xf-1, yf-1), u), v); }; }

// ═══════════════════════════════════════════════════════════
// TEXT LAYOUT ENGINE v3
// ═══════════════════════════════════════════════════════════
// Fix: serif italic gets extra horizontal safety margin
// so descenders/swashes don't clip against overflow:hidden

const CHAR_W = { serif: 0.52, sans: 0.48, mono: 0.60 };

// Adaptive overshoot factor. Italic serif glyphs (swash, extended ascenders) render
// ~15% taller than nominal fs × lineHeight. Italic sans/mono is milder (~8%).
// Non-italic has virtually no overshoot — line-box metrics fit the glyph.
function fontOvershoot(fontFamily, italic) {
  if (!italic) return 0.03;
  if (fontFamily === "serif") return 0.15;
  return 0.08;
}

function estimateTextLayout(text, boxW, boxH, opts = {}) {
  const { padFractionX = 0.05, padFractionY = 0.05, lineHeight = 1.35, fontFamily = "mono", italic = false } = opts;
  // Extra horizontal padding for serif italic (left side has glyph-overshoot from swash)
  const glyphExtraX = (fontFamily === "serif" && italic) ? 0.03 : 0.01;

  const padX = Math.max(3, boxW * (padFractionX + glyphExtraX));
  const padY = Math.max(3, boxH * padFractionY);
  const innerW = boxW - padX * 2;
  const innerH = boxH - padY * 2;
  if (innerW < 8 || innerH < 8) return { fontSize: 6, lines: 1, fillH: 0, fillW: 0, padX, padY };

  const charWF = CHAR_W[fontFamily] || 0.50;
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const isCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(text);
  // CJK chars are ~full-width; italic/bold adds a bit more
  const cjkCW = (fontFamily === "serif" && italic) ? 1.05 : 1.00;
  const eCW = isCJK ? cjkCW : charWF;
  const isShort = words.length <= 3 && !isCJK;
  const isSingleWord = words.length === 1 && !isCJK;
  // All-caps uses significantly wider chars (W, M, K ≈ 0.75em vs lowercase ≈ 0.5em).
  // Monospace is exempt: every char is exactly charWF em regardless of case.
  const isProportional = fontFamily !== "mono";
  const isAllCaps = isSingleWord && isProportional && words[0] === words[0].toUpperCase() && /[A-Z]/.test(words[0]);
  const effectiveCW = isAllCaps
    ? eCW * 1.35
    : (isSingleWord && isProportional)
      ? eCW * 1.15
      : eCW;

  // Short text (≤3 words, incl. single word) is usually constrained by WIDTH.
  // v6.3: adaptive safety factor — tight fit for non-italic, generous margin for italic serif.
  // No-italic gets 0.97 (fills box), italic mono/sans 0.92, italic serif 0.85 (swash safe).
  const hCeil = 1 - fontOvershoot(fontFamily, italic);
  // Single words: narrower W ceiling because we can't wrap — any overflow = clip.
  // CJK text: slightly tighter because italic overshoot at line end.
  const wCeil = isSingleWord ? 0.88 : isCJK ? 0.90 : 0.92;

  let bestFS = 6, bestLines = 1, bestFillH = 0, bestFillW = 0;
  // Loop strategy: test every fs; KEEP the largest valid one.
  // Don't break early — for text that wraps, overflow is non-monotonic
  // (larger fs can mean fewer chars/line but still fit).
  for (let fs = 6; fs <= 200; fs += 0.5) {
    const charW = fs * effectiveCW, lh = fs * lineHeight;
    const cpl = Math.max(1, Math.floor(innerW / (charW * 1.03)));  
    let lines = 1, lineLen = 0, maxLC = 0;
    if (isCJK) { const chars = text.replace(/\s+/g, ''); lines = Math.ceil(chars.length / cpl); maxLC = Math.min(chars.length, cpl); }
    else if (isSingleWord) {
      // Single word: NEVER wrap. Constrain by full word width.
      lines = 1; maxLC = words[0].length; lineLen = maxLC;
    }
    else { for (const word of words) { if (lineLen > 0 && lineLen + 1 + word.length > cpl) { maxLC = Math.max(maxLC, lineLen); lines++; lineLen = word.length; } else { lineLen += (lineLen > 0 ? 1 : 0) + word.length; } } maxLC = Math.max(maxLC, lineLen); }
    const textH = lines * lh, textW = maxLC * charW;

    // Check fits
    const hOK = textH <= innerH * hCeil;
    const wOK = (isShort || isSingleWord || isCJK) ? (textW <= innerW * wCeil) : true;
    if (!hOK || !wOK) {
      // For single word (never wraps), overflow is monotonic → safe to break
      if (isSingleWord) break;
      // For all other cases (multi-word, CJK), keep probing — wrap behavior is non-monotonic
      continue;
    }
    bestFS = fs; bestLines = lines; bestFillH = textH / innerH; bestFillW = textW / innerW;
  }
  return { fontSize: bestFS, lines: bestLines, fillH: bestFillH, fillW: bestFillW, padX, padY, isSingleWord };
}

// Estimate layout for paired title+subtitle in one box.
// Unified budget model: total content (title + CSS gap + subtitle) must fit
// in innerH × 0.85. Using a single budget instead of titleH/subH/hCeil triple
// because: (1) CSS uses `gap: pad × 0.3` between the two, which the old model
// ignored; (2) CSS renders subtitle with `lineHeight × 1.05` which is 5%
// taller than the estimate assumed; (3) italic serif ascenders push actual
// render height ~10-20% above nominal. The 0.85 factor absorbs all of these.
function estimatePairedLayout(title, subtitle, boxW, boxH, opts = {}) {
  const { padFractionX = 0.05, padFractionY = 0.05, lineHeight = 1.35, fontFamily = "mono", italic = false } = opts;
  const glyphExtraX = (fontFamily === "serif" && italic) ? 0.03 : 0.01;
  const padX = Math.max(3, boxW * (padFractionX + glyphExtraX));
  const padY = Math.max(3, boxH * padFractionY);
  const innerW = boxW - padX * 2, innerH = boxH - padY * 2;
  if (innerW < 8 || innerH < 8) return { titleFS: 6, subFS: 6, padX, padY };

  const charWF = CHAR_W[fontFamily] || 0.50;
  const GAP = padY * 0.3;                                    // matches CSS gap in PairedTextScrap
  const SUB_LH = lineHeight * 1.05;                          // matches CSS subtitle lineHeight
  const safety = 1 - fontOvershoot(fontFamily, italic);      // adaptive: 0.85 italic serif → 0.97 non-italic
  const budget = innerH * safety - GAP;
  const titleBudget = budget * 0.55;
  const subBudget = budget * 0.45;

  let titleFS = 6;
  const titleWords = title.split(/\s+/).filter(w => w.length > 0);
  for (let fs = 6; fs <= 150; fs += 0.5) {
    const charW = fs * charWF, lh = fs * lineHeight;
    const cpl = Math.max(1, Math.floor(innerW / (charW * 1.03)));  
    let lines = 1, lineLen = 0;
    for (const w of titleWords) { if (lineLen > 0 && lineLen + 1 + w.length > cpl) { lines++; lineLen = w.length; } else { lineLen += (lineLen > 0 ? 1 : 0) + w.length; } }
    const hOK = lines * lh <= titleBudget;
    const wOK = titleWords.length > 3 || titleWords.join(' ').length * charW <= innerW * 0.92;
    if (!hOK || !wOK) continue;
    titleFS = fs;
  }

  let subFS = 6;
  const subWords = subtitle.split(/\s+/).filter(w => w.length > 0);
  for (let fs = 6; fs <= 100; fs += 0.5) {
    const charW = fs * charWF, lh = fs * SUB_LH;    // use actual CSS lineHeight
    const cpl = Math.max(1, Math.floor(innerW / (charW * 1.03)));  
    let lines = 1, lineLen = 0;
    for (const w of subWords) { if (lineLen > 0 && lineLen + 1 + w.length > cpl) { lines++; lineLen = w.length; } else { lineLen += (lineLen > 0 ? 1 : 0) + w.length; } }
    if (lines * lh > subBudget) continue;
    subFS = fs;
  }

  // Subtitle should never be larger than title
  subFS = Math.min(subFS, titleFS * 0.75);

  return { titleFS, subFS, padX, padY };
}

// v6: Canvas-aware single-row detection helper.
// Returns true if the text would fit in a single row within 80% of canvas width
// at the given minimum legible font size.
// v9: ratio classification uses a normalized-space fs floor (28u out of 1000)
// — equivalent to ~16 display px on a 560px canvas (where calibration was set).
function isSingleRowPreferred(text, canvasW, minFS) {
  const fs = Math.max(minFS || 0, 28);
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  const otherCount = text.length - cjkCount;
  const widthInEm = cjkCount * 1.0 + otherCount * 0.52;
  if (widthInEm <= 0) return false;
  const singleRowPx = widthInEm * fs * 1.05;
  return singleRowPx <= canvasW * 0.80;
}

// v6: canvas-aware preferred ratio
// canvasW is used to check if single-row text fits in 80% of it at minFS.
// If it does, we return a single-row ratio (chars × charWF / lineHeight).
// Otherwise we fall back to the original multi-row word-count heuristics.
function textPreferredRatio(text, mode = "auto", canvasW = 800, minFS = 36) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const isCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(text);

  if (mode === "tall") return Math.max(0.5, Math.min(0.9, 10 / Math.max(text.length, 1)));
  if (mode === "square") return 1.0;

  // Single-row detection — applies in both auto and wide modes.
  // If text fits in one row at minFS within 80% canvas width, return a wide ratio.
  const LINE_HEIGHT_REF = 1.35;
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  const otherCount = text.length - cjkCount;
  const widthInEm = cjkCount * 1.0 + otherCount * 0.52;

  if (isSingleRowPreferred(text, canvasW, minFS)) {
    const ratio = widthInEm / LINE_HEIGHT_REF;
    // v9-1 (fix D): tighter range [3.5, 4.5] equalizes fs across short text.
    // Before: 1-word ratio 1.93, 2-word 4.62, 4-word 6.0 → fs spread ~1.8×.
    // After: all clamped to 3.5-4.5 → fs spread ~1.13×.
    // Cost: very short words (TOKYO) get some wasted horizontal padding.
    return Math.max(3.5, Math.min(4.5, ratio));
  }

  // Wrapping text — single rule table for both auto and wide modes.
  // Wide mode just applies a 1.4× bias (capped) to the auto ratio.
  // This prevents wide mode from giving a 6:1 strip for long text (was the old bug).
  let autoR;
  if (isCJK) {
    const c = text.replace(/\s+/g, '').length;
    autoR = c <= 4 ? 2.5 : c <= 8 ? 1.8 : c <= 16 ? 1.3 : 1.0;
  } else if (words.length <= 2) autoR = 2.8;
  else if (words.length <= 4) autoR = 2.0;
  else if (words.length <= 8) autoR = 1.5;
  else if (words.length <= 15) autoR = 1.2;
  else if (words.length <= 25) autoR = 1.0;
  else autoR = 0.85;

  if (mode === "wide") return Math.min(4.0, autoR * 1.4);
  return autoR;
}

// For paired title+subtitle, ratio is based on combined text.
// Paired always stacks title above subtitle, so single-row doesn't apply.
function pairedPreferredRatio(title, subtitle, mode, canvasW = 800, minFS = 36) {
  if (mode !== "auto") return textPreferredRatio(title + " " + subtitle, mode, canvasW, minFS);
  const tWords = title.split(/\s+/).filter(w => w.length > 0).length;
  const sWords = subtitle.split(/\s+/).filter(w => w.length > 0).length;
  // Paired blocks tend to be taller because they stack
  if (tWords <= 2 && sWords <= 4) return 1.6;
  if (tWords <= 3 && sWords <= 8) return 1.2;
  if (tWords <= 4 && sWords <= 15) return 1.0;
  return 0.85;
}

function textCandidateRatios(text, isPaired, subtitle) {
  const b = isPaired ? pairedPreferredRatio(text, subtitle || "", "auto") : textPreferredRatio(text);
  return [Math.min(5.0, b * 2), Math.min(4.0, b * 1.4), b, Math.max(0.5, b * 0.7), Math.max(0.4, b * 0.5)];
}

// ─── v4: Ratio search range ───
// Given a text, returns [min, max] ratios the GA is allowed to explore.
// Wider range when "auto" mode is chosen, narrower when user forces a mode.
// v6: For single-row-preferred text (in auto or wide modes), range is tightened
// to prevent GA from collapsing to a square-ish ratio (which would cause multi-row rendering).
function textRatioRange(text, isPaired, subtitle, mode, canvasW = 800, minFS = 36) {
  const base = isPaired ? pairedPreferredRatio(text, subtitle || "", mode, canvasW, minFS) : textPreferredRatio(text, mode, canvasW, minFS);
  // Single-row check applies in auto AND wide modes (not tall/square — user forced those)
  const singleRow = !isPaired && (mode === "auto" || mode === "wide") && isSingleRowPreferred(text, canvasW, minFS);
  if (singleRow) {
    // Tight range to enforce wide box, prevents multi-row collapse
    return [Math.max(base * 0.80, 1.5), Math.min(8.0, base * 1.25)];
  }
  if (mode === "auto") return [Math.max(0.4, base * 0.45), Math.min(8.0, base * 2.2)];
  // Forced modes: narrow exploration around the forced ratio
  return [Math.max(0.4, base * 0.75), Math.min(8.0, base * 1.35)];
}

// Sample a random ratio within a text's allowed range, biased toward preferred.
function sampleTextRatio(text, isPaired, subtitle, mode, rng, canvasW = 800, minFS = 36) {
  const [lo, hi] = textRatioRange(text, isPaired, subtitle, mode, canvasW, minFS);
  const base = isPaired ? pairedPreferredRatio(text, subtitle || "", mode, canvasW, minFS) : textPreferredRatio(text, mode, canvasW, minFS);
  // 50% around preferred, 50% uniform across range
  if (rng() < 0.5) {
    const spread = (hi - lo) * 0.25;
    return Math.max(lo, Math.min(hi, base + (rng() - 0.5) * 2 * spread));
  }
  return lo + rng() * (hi - lo);
}

// Mutate a ratio: gaussian-ish perturbation within range
function mutateRatio(ratio, lo, hi, rng, strength = 0.2) {
  const range = hi - lo;
  const delta = (rng() - 0.5) * 2 * range * strength;
  return Math.max(lo, Math.min(hi, ratio + delta));
}

// ═══════════════════════════════════════════════════════════
// SAMPLE TEXTS
// ═══════════════════════════════════════════════════════════

const SAMPLES = [
  { id: "title1", text: "TOKYO", label: "1 word" },
  { id: "headline", text: "Hello World!", label: "2 words" },
  { id: "short", text: "Summer at the beach", label: "4 words" },
  { id: "medium", text: "We spent the weekend exploring hidden mountain trails and waterfalls", label: "10 words" },
  { id: "long", text: "Last summer we drove along the coast for three weeks, stopping at every small town. The sunsets were incredible and the memories will stay with us forever.", label: "28 words" },
  { id: "cjk", text: "夏日海邊的回憶", label: "中文 7字" },
];

const SUBTITLE_SAMPLES = [
  { id: "sub1", text: "2025 · Travel Journal", label: "Date tag" },
  { id: "sub2", text: "A collection of our favorite moments from this summer", label: "Description" },
  { id: "sub3", text: "Photography by Sarah & Tom", label: "Credit" },
  { id: "sub4", text: "回憶錄 · 第三章", label: "中文副標" },
];

// ═══════════════════════════════════════════════════════════
// GRID + PHYLLO (same as v2, compact)
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// GRID LAYOUT — v4 with ratio search
// ═══════════════════════════════════════════════════════════
// Genome is now { tree, textRatios } where textRatios maps
// text item id → overridden aspect ratio.
// Mutation has 4 operators: flipCut, swapLeaves, restructure, tweakRatio.

function balTree(ids, d) { if (ids.length === 1) return { t: "L", ii: ids[0] }; const m = Math.ceil(ids.length / 2); return { t: "N", cut: d % 2 === 0 ? "H" : "V", c: [balTree(ids.slice(0, m), d + 1), balTree(ids.slice(m), d + 1)] }; }
function rndTree(n, rng) { const idx = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = ~~(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } function b(a) { if (a.length === 1) return { t: "L", ii: a[0] }; const m = 1 + ~~(rng() * (a.length - 1)); return { t: "N", cut: rng() > 0.5 ? "H" : "V", c: [b(a.slice(0, m)), b(a.slice(m))] }; } return b(idx); }
function cloneT(n) { return n.t === "L" ? { t: "L", ii: n.ii } : { t: "N", cut: n.cut, c: [cloneT(n.c[0]), cloneT(n.c[1])] }; }
function leavesT(n) { return n.t === "L" ? [n] : [...leavesT(n.c[0]), ...leavesT(n.c[1])]; }
function nodesT(n) { return n.t === "L" ? [] : [n, ...nodesT(n.c[0]), ...nodesT(n.c[1])]; }

// ─── v4: genome helpers ───
function cloneGenome(g) {
  return { tree: cloneT(g.tree), textRatios: { ...g.textRatios } };
}

// Apply textRatios override to items → new items array
function applyRatios(items, textRatios) {
  return items.map(im => {
    if (im.isText && textRatios[im.id] !== undefined) return { ...im, ratio: textRatios[im.id] };
    return im;
  });
}

// 4-operator mutation. `rng` is seeded; `ratioMode` guides ratio bounds.
// `items` needed for ratio-aware mutation.
function mutateGenome(g, rng, items, ratioMode, enableRatioMutation, canvasW, minFS = 36) {
  const c = cloneGenome(g);
  const textItems = items.filter(im => im.isText);
  const hasText = textItems.length > 0 && enableRatioMutation;

  // If ratio search enabled: 30% chance to mutate a ratio, 70% tree mutation
  // If disabled: 100% tree mutation (back to v3 behavior)
  const r = rng();

  if (hasText && r < 0.30) {
    // RATIO MUTATION: pick a random text item, perturb its ratio
    const ti = textItems[~~(rng() * textItems.length)];
    const [lo, hi] = textRatioRange(ti.text, ti.isPaired, ti.subtitle, ratioMode, canvasW, minFS);
    const current = c.textRatios[ti.id] !== undefined ? c.textRatios[ti.id] : ti.ratio;
    c.textRatios[ti.id] = mutateRatio(current, lo, hi, rng, 0.25);
    return c;
  }

  // Tree mutations (rescale r to 0..1 across remaining ops)
  const tr = hasText ? (r - 0.30) / 0.70 : r;
  if (tr < 0.40) {
    const ns = nodesT(c.tree);
    if (ns.length) { const nd = ns[~~(rng() * ns.length)]; nd.cut = nd.cut === "H" ? "V" : "H"; }
  } else if (tr < 0.70) {
    const lv = leavesT(c.tree);
    if (lv.length >= 2) { const i = ~~(rng() * lv.length); let j = ~~(rng() * (lv.length - 1)); if (j >= i) j++; [lv[i].ii, lv[j].ii] = [lv[j].ii, lv[i].ii]; }
  } else {
    const ns = nodesT(c.tree);
    if (ns.length) {
      const nd = ns[~~(rng() * ns.length)], ids = leavesT(nd).map(l => l.ii);
      for (let i = ids.length - 1; i > 0; i--) { const j = ~~(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      function rb(a) { if (a.length === 1) return { t: "L", ii: a[0] }; const m = 1 + ~~(rng() * (a.length - 1)); return { t: "N", cut: rng() > 0.5 ? "H" : "V", c: [rb(a.slice(0, m)), rb(a.slice(m))] }; }
      const ns2 = rb(ids); nd.t = ns2.t; nd.cut = ns2.cut; nd.c = ns2.c;
      if (ns2.t === "L") { nd.ii = ns2.ii; delete nd.c; delete nd.cut; }
    }
  }
  return c;
}

function treeToRows(tree, items) { function g(nd) { if (nd.t === "L") return items[nd.ii] ? [[{ id: nd.ii, item: items[nd.ii] }]] : []; const l = g(nd.c[0]), r = g(nd.c[1]); return nd.cut === "H" ? [...l, ...r] : [[...l.flat(), ...r.flat()]]; } const rows = g(tree).filter(r => r.length > 0); return rows.length ? rows : [[{ id: 0, item: items[0] }]]; }
function treeAreas(tree, items, total) { function cR(nd) { if (nd.t === "L") { nd.r = (items[nd.ii] || {}).ratio || 1; return nd.r; } const r0 = cR(nd.c[0]), r1 = cR(nd.c[1]); nd.r = nd.cut === "H" ? 1 / (1 / r0 + 1 / r1) : r0 + r1; return nd.r; } function lay(nd, a, out) { if (nd.t === "L") { out[nd.ii] = a; return; } const f = nd.cut === "H" ? (1 / nd.c[0].r) / (1 / nd.c[0].r + 1 / nd.c[1].r) : nd.c[0].r / (nd.c[0].r + nd.c[1].r); lay(nd.c[0], a * f, out); lay(nd.c[1], a * (1 - f), out); } cR(tree); const out = {}; lay(tree, total, out); return out; }
function compSizes(items, am) { const s = {}; for (const im of items) { const a = am[im.id] !== undefined ? am[im.id] : 1000; const h = Math.sqrt(a / im.ratio); s[im.id] = { w: h * im.ratio, h }; } return s; }
function layoutGrid(rows, sizes, gap, cw, ch) { const br = rows.filter(r => r && r.length > 0).map(row => { const it = row.map(r => { const s = sizes[r.id]; return { ...r, w: s ? s.w : 50, h: s ? s.h : 50 }; }); const mH = Math.max(...it.map(i => i.h)); return it.map(i => ({ ...i, w: i.w * (mH / i.h), h: mH })); }); if (!br.length) return []; const rW = br.map(r => r.reduce((s, i) => s + i.w, 0) + gap * (r.length - 1)); const rH = br.map(r => r[0] ? r[0].h : 0); const sc = Math.min((cw * 0.88) / Math.max(...rW), (ch * 0.88) / (rH.reduce((s, h) => s + h, 0) + gap * (br.length - 1)), 1); const frames = []; let y = (ch - (rH.reduce((s, h) => s + h * sc, 0) + gap * (br.length - 1))) / 2; for (let ri = 0; ri < br.length; ri++) { const row = br[ri]; const rowW = row.reduce((s, i) => s + i.w * sc, 0) + gap * (row.length - 1); let x = (cw - rowW) / 2; for (const it of row) { frames.push({ id: it.id, item: it.item, x, y, w: it.w * sc, h: it.h * sc }); x += it.w * sc + gap; } y += rH[ri] * sc + gap; } return frames; }
function scaleUp(frames, cw, ch, pad) { if (!frames.length) return frames; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const f of frames) { x0 = Math.min(x0, f.x); y0 = Math.min(y0, f.y); x1 = Math.max(x1, f.x + f.w); y1 = Math.max(y1, f.y + f.h); } const gw = x1 - x0, gh = y1 - y0; if (gw < 1 || gh < 1) return frames; const s = Math.min((cw - pad * 2) / gw, (ch - pad * 2) / gh); if (s <= 1.01) return frames; const gcx = (x0 + x1) / 2, gcy = (y0 + y1) / 2; const scaled = frames.map(f => ({ ...f, x: cw / 2 + (f.x - gcx) * s, y: ch / 2 + (f.y - gcy) * s, w: f.w * s, h: f.h * s })); for (let iter = 0; iter < 50; iter++) { let any = false; for (let i = 0; i < scaled.length; i++) for (let j = i + 1; j < scaled.length; j++) { const a = scaled[i], b = scaled[j]; const sx = (a.w + b.w) / 2 + 1, sy = (a.h + b.h) / 2 + 1; const dx = (a.x + a.w / 2) - (b.x + b.w / 2), dy = (a.y + a.h / 2) - (b.y + b.h / 2); const ox = sx - Math.abs(dx), oy = sy - Math.abs(dy); if (ox > 0 && oy > 0) { any = true; if (ox < oy) { const p = ox * 0.52, sg = dx >= 0 ? 1 : -1; a.x += sg * p; b.x -= sg * p; } else { const p = oy * 0.52, sg = dy >= 0 ? 1 : -1; a.y += sg * p; b.y -= sg * p; } } } for (const f of scaled) { f.x = Math.max(pad * 0.5, Math.min(cw - f.w - pad * 0.5, f.x)); f.y = Math.max(pad * 0.5, Math.min(ch - f.h - pad * 0.5, f.y)); } if (!any) break; } return scaled; }
function rectDist(a, b) { const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)); const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h)); return Math.sqrt(dx * dx + dy * dy); }

// ─── v5: Post-processing from auto-layout-spec-v2 ───

// Scrap Scale: inflate each frame around its center (allows overlap)
function applyScrapScale(frames, scalePx) {
  if (!frames.length || scalePx <= 0) return frames;
  let smallest = Infinity;
  for (const f of frames) smallest = Math.min(smallest, Math.min(f.w, f.h));
  if (!isFinite(smallest) || smallest <= 0) return frames;
  const grow = 1 + (scalePx / smallest) * 2;
  return frames.map(f => {
    const newW = f.w * grow, newH = f.h * grow;
    return { ...f, w: newW, h: newH, x: f.x - (newW - f.w) / 2, y: f.y - (newH - f.h) / 2 };
  });
}

// Tightness: pull positions toward canvas center, then rescale group to original bbox
function applyTightness(frames, tightPx, cw, ch) {
  if (!frames.length || tightPx <= 0) return frames;
  const shortEdge = Math.min(cw, ch);
  if (shortEdge <= 0) return frames;
  const shrink = tightPx / shortEdge;
  const pullScale = Math.max(0.4, 1 - shrink * 4);
  const cx = cw / 2, cy = ch / 2;

  // Record original bounding box
  let ox0 = Infinity, oy0 = Infinity, ox1 = -Infinity, oy1 = -Infinity;
  for (const f of frames) { ox0 = Math.min(ox0, f.x); oy0 = Math.min(oy0, f.y); ox1 = Math.max(ox1, f.x + f.w); oy1 = Math.max(oy1, f.y + f.h); }
  const origW = ox1 - ox0, origH = oy1 - oy0;
  const origCx = (ox0 + ox1) / 2, origCy = (oy0 + oy1) / 2;

  // Step 1: pull positions toward canvas center
  const pulled = frames.map(f => {
    const fcx = f.x + f.w / 2, fcy = f.y + f.h / 2;
    const newCx = cx + (fcx - cx) * pullScale;
    const newCy = cy + (fcy - cy) * pullScale;
    return { ...f, x: newCx - f.w / 2, y: newCy - f.h / 2 };
  });

  // Step 2: measure new bbox and rescale group to original bbox
  let nx0 = Infinity, ny0 = Infinity, nx1 = -Infinity, ny1 = -Infinity;
  for (const f of pulled) { nx0 = Math.min(nx0, f.x); ny0 = Math.min(ny0, f.y); nx1 = Math.max(nx1, f.x + f.w); ny1 = Math.max(ny1, f.y + f.h); }
  const newW = nx1 - nx0, newH = ny1 - ny0;
  if (newW < 1 || newH < 1) return pulled;
  const reScale = Math.min(origW / newW, origH / newH);
  if (reScale <= 1.001) return pulled;

  const newCx = (nx0 + nx1) / 2, newCy = (ny0 + ny1) / 2;
  return pulled.map(f => {
    // Scale both position and size, anchored to original bbox center
    const fcx = f.x + f.w / 2, fcy = f.y + f.h / 2;
    const relX = fcx - newCx, relY = fcy - newCy;
    const scaledCx = origCx + relX * reScale;
    const scaledCy = origCy + relY * reScale;
    const scaledW = f.w * reScale, scaledH = f.h * reScale;
    return { ...f, w: scaledW, h: scaledH, x: scaledCx - scaledW / 2, y: scaledCy - scaledH / 2 };
  });
}

// Coverage for auto-retry score check
function coverageScore(frames, cw, ch) {
  if (!frames.length) return 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of frames) { x0 = Math.min(x0, f.x); y0 = Math.min(y0, f.y); x1 = Math.max(x1, f.x + f.w); y1 = Math.max(y1, f.y + f.h); }
  return Math.min(((x1 - x0) * (y1 - y0)) / (cw * ch), 1);
}

// ─── v4: Stronger text readability scoring ───
// Text now contributes more to score since GA can actively optimize it.
function rowScore(frames, cw, ch, gap, tOpts) {
  if (!frames.length) return 0;
  let nnS = 0, nnC = 0;
  for (let i = 0; i < frames.length; i++) { let m = Infinity; for (let j = 0; j < frames.length; j++) { if (i !== j) m = Math.min(m, rectDist(frames[i], frames[j])); } nnS += (m - gap) ** 2; nnC++; }
  const gs = 1 / (1 + Math.sqrt(nnS / Math.max(nnC, 1)) / (Math.abs(gap) || 1));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of frames) { x0 = Math.min(x0, f.x); y0 = Math.min(y0, f.y); x1 = Math.max(x1, f.x + f.w); y1 = Math.max(y1, f.y + f.h); }
  const bA = Math.max((x1 - x0) * (y1 - y0), 1); const fl = Math.max(bA / (cw * ch), 0.01);
  const co = frames.reduce((s, f) => s + f.w * f.h, 0) / bA;
  const am = 1 / (1 + Math.abs(Math.log(((x1 - x0) / Math.max(y1 - y0, 1)) / (cw / ch))) * 1.0);
  const rM = {}; for (const f of frames) { const ry = Math.round(f.y * 10); if (!rM[ry]) rM[ry] = { l: f.x, r: f.x + f.w, cnt: 1 }; else { rM[ry].l = Math.min(rM[ry].l, f.x); rM[ry].r = Math.max(rM[ry].r, f.x + f.w); rM[ry].cnt++; } }
  const rws = Object.values(rM).map(r => r.r - r.l); const rwS = rws.length >= 2 ? Math.min(...rws) / Math.max(...rws) : 1;
  const maxPR = Math.max(...Object.values(rM).map(r => r.cnt));
  const cR = cw / ch;
  // v9-2: idealMax floor lowered 3→2 so tall canvases (cR<1) correctly penalize wide rows.
  // 16:9 n=5: sqrt(5)×sqrt(1.78)=2.98 → 3 (unchanged). 9:16 n=5: 1.68 → 2 (was clamped to 3, now correct).
  const idealMax = Math.max(2, Math.round(Math.sqrt(frames.length) * Math.sqrt(cR)));
  const rcOK = maxPR <= idealMax ? 1 : Math.max(0.3, 1 - (maxPR - idealMax) * 0.15);
  const areas = frames.map(f => f.w * f.h); const aR = Math.max(...areas) / Math.max(Math.min(...areas), 0.01);
  const aOK = aR <= 3 ? 1 : Math.max(0, 1 - (aR - 3) * 0.15);

  // v4: Richer text quality signal
  const tBS = tOpts?.textBoxSize || 1.0;
  const mFS = tOpts?.maxFS || 60;
  let tB = 1;
  for (const f of frames) {
    if (f.item?.isText) {
      const est = estimateTextLayout(f.item.text || "", f.w, f.h, tOpts);
      // v6.3: fs threshold adapts to text length. Long paragraphs naturally need
      // small fs to fit; punishing them as "title-sized" text is wrong.
      // v8 (A): fsFloor scales with textBoxSize so lower settings tolerate smaller fs.
      const textStr = f.item.text || "";
      const wc = f.item.isPaired ? 99 : textStr.split(/\s+/).filter(w => w.length > 0).length;
      // v9: calibrated to normalized 1000u canvas (base 14/18u ≈ 8/10 display px on 560 canvas)
      const fsFloorBase = wc > 12 ? 14 : 18;
      const fsFloor = Math.max(5, Math.round(fsFloorBase * tBS));
      if (est.fontSize < fsFloor) tB *= 0.3;
      else if (est.fontSize < fsFloor + 3) tB *= 0.7;
      // Fill quality: penalize boxes that are massively underfilled
      // (implies wrong ratio — box much wider/taller than text needs)
      const fillBoth = Math.sqrt(est.fillH * Math.max(est.fillW, 0.3));
      if (fillBoth < 0.4) tB *= 0.75;
      else if (fillBoth < 0.55) tB *= 0.9;
      // v8 (B): oversize penalty — text box way bigger than minArea means
      // GA over-allocated space from images. Active only for long text (has minArea).
      if (f.item.minArea && f.item.minArea > 0) {
        const areaRatio = (f.w * f.h) / f.item.minArea;
        if (areaRatio > 2.0) tB *= Math.max(0.55, 1 - (areaRatio - 2.0) * 0.12);
      }
      // v9-2 (A): maxFS cap — penalize oversized short text fs
      if (f.item.maxArea && f.item.maxArea > 0 && est.fontSize > mFS) {
        const overshoot = est.fontSize / mFS;
        tB *= Math.max(0.5, 1 - (overshoot - 1) * 0.4);
      }
      // v9-2 (B): short-text maxArea — penalize when GA gives short text too much box
      if (f.item.maxArea && f.item.maxArea > 0) {
        const ar = (f.w * f.h) / f.item.maxArea;
        if (ar > 1.0) tB *= Math.max(0.55, 1 - (ar - 1.0) * 0.20);
      }
    }
  }
  // v9-2: rebalanced for stronger canvas-aspect matching.
  // am 0.11→0.15, fl 0.13→0.15 (canvas-fit factors strengthened)
  // rwS 0.15→0.13, aOK 0.11→0.09, tB 0.19→0.17 (compensate). Sum = 1.00.
  return (gs ** 0.13) * (fl ** 0.15) * (co ** 0.05) * (am ** 0.15) * (rwS ** 0.13) * (aOK ** 0.09) * (rcOK ** 0.13) * (tB ** 0.17);
}

function runGA(items, cw, ch, gap, pad, seed, tOpts, ratioMode, enableRatioMutation, minFS = 36) {
  const rng = rng32(seed + 555);
  const POP = 50, GENS = 40;
  const n = items.length;
  const idxArr = Array.from({ length: n }, (_, i) => i);

  // Build initial population: 2 balanced trees + random trees.
  // Each genome starts with textRatios = {} (use item defaults).
  // Then half the population gets randomized ratios to seed diversity.
  const initialGenome = (tree) => ({ tree, textRatios: {} });
  let pop = [
    initialGenome(balTree(idxArr, 0)),
    initialGenome(balTree(idxArr, 1)),
    ...Array.from({ length: POP - 2 }, () => initialGenome(rndTree(n, rng))),
  ];

  // Seed diversity: randomize ratios for half the population
  if (enableRatioMutation) {
    const textItems = items.filter(im => im.isText);
    for (let i = Math.floor(POP / 2); i < POP; i++) {
      const g = pop[i];
      for (const ti of textItems) {
        g.textRatios[ti.id] = sampleTextRatio(ti.text, ti.isPaired, ti.subtitle, ratioMode, rng, cw, minFS);
      }
    }
  }

  let bestGenome = pop[0], bestS = -Infinity;
  for (let g = 0; g < GENS; g++) {
    const scored = pop.map(genome => {
      const effItems = applyRatios(items, genome.textRatios);
      const rows = treeToRows(genome.tree, effItems);
      const ar = treeAreas(genome.tree, effItems, cw * ch * 0.55);
      const sz = compSizes(effItems, ar);
      const fr = scaleUp(layoutGrid(rows, sz, gap, cw, ch), cw, ch, pad);
      return { genome, fr, sc: rowScore(fr, cw, ch, gap, tOpts) };
    }).sort((a, b) => b.sc - a.sc);

    if (scored[0].sc > bestS) { bestS = scored[0].sc; bestGenome = cloneGenome(scored[0].genome); }

    const surv = scored.slice(0, 15).map(x => x.genome);
    pop = surv.map(genome => cloneGenome(genome));
    while (pop.length < POP) pop.push(mutateGenome(surv[~~(rng() * surv.length)], rng, items, ratioMode, enableRatioMutation, cw, minFS));
  }

  const effItems = applyRatios(items, bestGenome.textRatios);
  const rows = treeToRows(bestGenome.tree, effItems);
  const ar = treeAreas(bestGenome.tree, effItems, cw * ch * 0.55);
  const sz = compSizes(effItems, ar);
  const finalFrames = scaleUp(layoutGrid(rows, sz, gap, cw, ch), cw, ch, pad);
  // Recompute score on the final scaled frames (best tracked bestS is from mid-loop)
  const finalScore = rowScore(finalFrames, cw, ch, gap, tOpts);
  return {
    frames: finalFrames,
    textRatios: bestGenome.textRatios,
    score: finalScore,
  };
}

// Phyllo
function phylloLayout(items, cw, ch, gap, padding, seed, sizeVar, rotation, density) { const n = items.length; if (n === 0) return []; const rng = rng32(seed + 333), perlin = createPerlin(seed + 6666); const cx = cw / 2, cy = ch / 2, aW = cw - padding * 2, aH = ch - padding * 2; const order = items.map((item, i) => ({ item, i, key: rng() })).sort((a, b) => b.key - a.key); const tA = aW * aH * density, bA2 = tA / n; const areas = order.map((_, r) => bA2 * (1 + (1 - r / Math.max(n - 1, 1)) * sizeVar * 1.2)); const aS = areas.reduce((s, a) => s + a, 0); for (let i = 0; i < areas.length; i++) areas[i] *= tA / aS; let deficit = 0, nonTextTotal = 0; for (let r = 0; r < n; r++) { const it = order[r].item; if (it.isText && it.minArea && areas[r] < it.minArea) { deficit += it.minArea - areas[r]; areas[r] = it.minArea; } else if (!it.isText) { nonTextTotal += areas[r]; } } if (deficit > 0 && nonTextTotal > 0) { const scale = Math.max(0.3, (nonTextTotal - deficit) / nonTextTotal); for (let r = 0; r < n; r++) { if (!order[r].item.isText) areas[r] *= scale; } } const PHI = (1 + Math.sqrt(5)) / 2, GA2 = 2 * Math.PI / (PHI * PHI); const cr = aW / aH; const eRx = aW * 0.42; const eRy = aH * 0.42; const nodes = order.map(({ item, i }, rank) => { const area = areas[rank], h = Math.sqrt(area / item.ratio), w = h * item.ratio; const angle = rank * GA2 + (rng() - 0.5) * 0.4, t = rank === 0 ? 0 : Math.sqrt(rank / n); return { id: i, item, x: cx + Math.cos(angle) * eRx * t - w / 2, y: cy + Math.sin(angle) * eRy * t - h / 2, w, h }; }); for (let iter = 0; iter < 300; iter++) { const decay = Math.max(0.25, 1 - iter / 300); let tOv = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a = nodes[i], b = nodes[j]; const sX = (a.w + b.w) / 2 + gap, sY = (a.h + b.h) / 2 + gap; const dx = (a.x + a.w / 2) - (b.x + b.w / 2), dy = (a.y + a.h / 2) - (b.y + b.h / 2); const ox = sX - Math.abs(dx), oy = sY - Math.abs(dy); if (ox > 0 && oy > 0) { tOv += ox * oy; const pf = 0.55 * decay; if (ox < oy) { const p = ox * pf, s2 = dx >= 0 ? 1 : -1; a.x += s2 * p; b.x -= s2 * p; } else { const p = oy * pf, s2 = dy >= 0 ? 1 : -1; a.y += s2 * p; b.y -= s2 * p; } } } const gB = 0.035 * decay, gX = gB * (cr < 1 ? 1.1 : 0.7), gY = gB * (cr > 1 ? 1.1 : 0.7); for (const nd of nodes) { nd.x += (cx - (nd.x + nd.w / 2)) * gX; nd.y += (cy - (nd.y + nd.h / 2)) * gY; } if (iter > 10 && iter < 180) { let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity; for (const nd of nodes) { gx0 = Math.min(gx0, nd.x); gy0 = Math.min(gy0, nd.y); gx1 = Math.max(gx1, nd.x + nd.w); gy1 = Math.max(gy1, nd.y + nd.h); } const gW = gx1 - gx0, gH = gy1 - gy0, sp = 0.012 * decay; const wShort = aW < aH ? 1.2 : 1.0, hShort = aH < aW ? 1.2 : 1.0; if (gW < aW * 0.75) for (const nd of nodes) nd.x += ((nd.x + nd.w / 2) - cx) * sp * 2 * hShort; if (gH < aH * 0.75) for (const nd of nodes) nd.y += ((nd.y + nd.h / 2) - cy) * sp * 2 * wShort; const gR = gW / Math.max(gH, 1), tR = aW / aH; if (Math.abs(gR - tR) > 0.2) { const ar = 0.006 * decay; if (gR > tR * 1.15) for (const nd of nodes) nd.x += (cx - (nd.x + nd.w / 2)) * ar; else if (gR < tR * 0.85) for (const nd of nodes) nd.y += (cy - (nd.y + nd.h / 2)) * ar; } } if (iter > 90) { const gS = 0.015 * decay; for (let i = 0; i < n; i++) { let mD = Infinity, mJ = -1; for (let j = 0; j < n; j++) { if (i !== j) { const d = rectDist(nodes[i], nodes[j]); if (d < mD) { mD = d; mJ = j; } } } if (mJ >= 0 && mD > gap * 1.8) { const a = nodes[i], b = nodes[mJ], ddx = (b.x + b.w / 2) - (a.x + a.w / 2), ddy = (b.y + b.h / 2) - (a.y + a.h / 2), dist = Math.sqrt(ddx * ddx + ddy * ddy); if (dist > 1) { const pull = (mD - gap) * gS; a.x += (ddx / dist) * pull; a.y += (ddy / dist) * pull; } } } } for (const nd of nodes) { nd.x = Math.max(padding, Math.min(cw - nd.w - padding, nd.x)); nd.y = Math.max(padding, Math.min(ch - nd.h - padding, nd.y)); } if (tOv < 0.1 && iter > 40) break; } const freq = 0.007; for (let i = 0; i < n; i++) { const nd = nodes[i]; if (nd.item.isText) { nd.rot = 0; continue; } const ncx = nd.x + nd.w / 2, ncy = nd.y + nd.h / 2; nd.rot = (perlin(ncx * freq, ncy * freq) * 6 + (i % 2 === 0 ? 1 : -1) * 1.5) * rotation; } return nodes; }
function scorePhyllo(frames, cw, ch, gap, tOpts) {
  if (!frames.length) return -Infinity;
  let oc = 0;
  for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) { const a = frames[i], b = frames[j]; if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) oc++; }
  if (oc > 0) return -oc;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of frames) { x0 = Math.min(x0, f.x); y0 = Math.min(y0, f.y); x1 = Math.max(x1, f.x + f.w); y1 = Math.max(y1, f.y + f.h); }
  const gW = x1 - x0, gH = y1 - y0;
  const am = 1 / (1 + Math.abs(Math.log((gW / Math.max(gH, 1)) / (cw / ch))) * 1.5);
  const cov = Math.min((gW * gH) / (cw * ch), 1);
  // v7: per-axis fill — penalizes long canvases where one axis isn't used.
  // min(gW/cw, gH/ch) rewards balanced canvas coverage; geometric coupling with cov.
  const fillX = Math.min(gW / cw, 1), fillY = Math.min(gH / ch, 1);
  const axisFill = Math.min(fillX, fillY);
  // v6.2: compactness within bbox — items-area / bbox-area.
  // Penalizes Phyllo layouts that span the canvas but leave big internal gaps.
  const totalItemArea = frames.reduce((s, f) => s + f.w * f.h, 0);
  const bboxArea = Math.max(gW * gH, 1);
  const co = Math.min(totalItemArea / bboxArea, 1);
  const gaps = [];
  for (let i = 0; i < frames.length; i++) { let m = Infinity; for (let j = 0; j < frames.length; j++) { if (i !== j) m = Math.min(m, rectDist(frames[i], frames[j])); } if (m < Infinity) gaps.push(m); }
  let gh2 = 1;
  if (gaps.length > 1) { const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length; const cv = Math.sqrt(gaps.reduce((s, g) => s + (g - avg) ** 2, 0) / gaps.length) / Math.max(avg, 1); gh2 = 1 / (1 + cv * 2); }
  // v4: Richer text signal matching Grid
  const tBSp = tOpts?.textBoxSize || 1.0;
  const mFSp = tOpts?.maxFS || 60;
  let ts = 1;
  for (const f of frames) {
    if (f.item?.isText) {
      const est = estimateTextLayout(f.item.text || "", f.w, f.h, tOpts);
      const textStr = f.item.text || "";
      const wc = f.item.isPaired ? 99 : textStr.split(/\s+/).filter(w => w.length > 0).length;
      // v8 (A): fsFloor scales with textBoxSize
      // v9: calibrated to normalized 1000u canvas
      const fsFloorBase = wc > 12 ? 14 : 18;
      const fsFloor = Math.max(5, Math.round(fsFloorBase * tBSp));
      if (est.fontSize < fsFloor) ts *= 0.3;
      else if (est.fontSize < fsFloor + 3) ts *= 0.7;
      const fillBoth = Math.sqrt(est.fillH * Math.max(est.fillW, 0.3));
      if (fillBoth < 0.4) ts *= 0.75;
      else if (fillBoth < 0.55) ts *= 0.9;
      // v8 (B): oversize penalty
      if (f.item.minArea && f.item.minArea > 0) {
        const areaRatio = (f.w * f.h) / f.item.minArea;
        if (areaRatio > 2.0) ts *= Math.max(0.55, 1 - (areaRatio - 2.0) * 0.12);
      }
      // v9-2 (A): maxFS cap — penalize oversized short-text fs
      if (f.item.maxArea && f.item.maxArea > 0 && est.fontSize > mFSp) {
        const overshoot = est.fontSize / mFSp;
        ts *= Math.max(0.5, 1 - (overshoot - 1) * 0.4);
      }
      // v9-2 (B): short-text maxArea — penalize oversized box for short text
      if (f.item.maxArea && f.item.maxArea > 0) {
        const ar = (f.w * f.h) / f.item.maxArea;
        if (ar > 1.0) ts *= Math.max(0.55, 1 - (ar - 1.0) * 0.20);
      }
    }
  }
  // v7 (softened): axisFill weighted lower (0.08) so canvas-fill nudges but doesn't dominate.
  // am: 0.10, cov: 0.15, axisFill: 0.08, co: 0.30, gh2: 0.17, ts: 0.20 (sum = 1.00)
  return (am ** 0.10) * (cov ** 0.15) * (axisFill ** 0.08) * (co ** 0.30) * (gh2 ** 0.17) * (ts ** 0.20);
}

// v4: Phyllo now searches over text ratios too.
// Each trial draws fresh ratios from the allowed range for all text items.
function bestPhyllo(items, cw, ch, gap, padding, seed, sizeVar, rotation, density, maxTrials, tOpts, ratioMode, enableRatioSearch, minFS = 36) {
  let bf = null, bs = -Infinity, bestRatios = {};
  const textItems = items.filter(im => im.isText);
  const ratioRng = rng32(seed + 8888);

  for (let t = 0; t < maxTrials; t++) {
    const ts = seed * 1000 + t * 7 + 1;
    // Pick ratios for this trial
    let trialItems = items;
    let trialRatios = {};
    if (enableRatioSearch && textItems.length > 0) {
      trialRatios = {};
      for (const ti of textItems) {
        // First trial uses default (preferred) ratio; others explore
        if (t === 0) trialRatios[ti.id] = ti.ratio;
        else trialRatios[ti.id] = sampleTextRatio(ti.text, ti.isPaired, ti.subtitle, ratioMode, ratioRng, cw, minFS);
      }
      trialItems = applyRatios(items, trialRatios);
    }

    const raw = phylloLayout(trialItems, cw, ch, gap, padding, ts, sizeVar, rotation, density);
    const scaled = scaleUp(raw, cw, ch, padding);
    const sc = scorePhyllo(scaled, cw, ch, gap, tOpts);
    if (sc > bs) { bs = sc; bf = scaled; bestRatios = trialRatios; if (sc > 0.75) break; }
  }
  return { frames: bf || [], score: bs, textRatios: bestRatios };
}

// ═══════════════════════════════════════════════════════════
// ITEM GENERATOR
// ═══════════════════════════════════════════════════════════

const HUES = [210, 140, 28, 320, 170, 260, 95, 350, 55, 195, 280, 5, 75, 42];

// Ratio pools (from original gallery-wall system)
const RATIO_POOLS = {
  landscape: [{ r: 2.35, l: "cine" }, { r: 1.778, l: "16:9" }, { r: 1.5, l: "3:2" }, { r: 1.333, l: "4:3" }, { r: 1.2, l: "6:5" }],
  portrait: [{ r: 0.5625, l: "9:16" }, { r: 0.667, l: "2:3" }, { r: 0.75, l: "3:4" }, { r: 0.8, l: "4:5" }],
  square: [{ r: 1.0, l: "1:1" }],
  extreme_wide: [{ r: 3.0, l: "3:1" }, { r: 2.5, l: "5:2" }],
  extreme_tall: [{ r: 0.4, l: "2:5" }, { r: 0.333, l: "1:3" }],
};

// 10 image set presets
const IMG_SETS = [
  { id: "mixed", name: "Mixed", weights: { landscape: 3, portrait: 3, square: 2 }, pools: ["landscape", "portrait", "square"] },
  { id: "all-land", name: "Landscape", weights: { landscape: 10 }, pools: ["landscape"] },
  { id: "all-port", name: "Portrait", weights: { portrait: 10 }, pools: ["portrait"] },
  { id: "all-sq", name: "Square", weights: { square: 10 }, pools: ["square"] },
  { id: "extreme", name: "Extreme mix", weights: { extreme_wide: 3, extreme_tall: 3, square: 2 }, pools: ["extreme_wide", "extreme_tall", "square"] },
  { id: "land-outlier", name: "Land+1 outlier", weights: { landscape: 8, extreme_tall: 2 }, pools: ["landscape", "extreme_tall"] },
  { id: "port-outlier", name: "Port+1 outlier", weights: { portrait: 8, extreme_wide: 2 }, pools: ["portrait", "extreme_wide"] },
  { id: "photo-real", name: "Camera mix", weights: {}, pools: [],
    fixedPool: [
      { r: 0.75, l: "手機" }, { r: 0.75, l: "手機" }, { r: 1.333, l: "相機" }, { r: 1.5, l: "相機" },
      { r: 0.5625, l: "限動" }, { r: 1.778, l: "截圖" }, { r: 1.0, l: "IG" }, { r: 0.8, l: "4:5" },
      { r: 0.75, l: "手機" }, { r: 1.5, l: "相機" }, { r: 1.0, l: "IG" }, { r: 0.5625, l: "限動" },
    ] },
  { id: "gradient", name: "Ratio gradient", weights: {}, pools: [],
    fixedPool: [
      { r: 3.0, l: "3:1" }, { r: 2.35, l: "cine" }, { r: 1.778, l: "16:9" }, { r: 1.5, l: "3:2" },
      { r: 1.333, l: "4:3" }, { r: 1.0, l: "1:1" }, { r: 0.8, l: "4:5" }, { r: 0.667, l: "2:3" },
      { r: 0.5625, l: "9:16" }, { r: 0.4, l: "2:5" },
    ] },
  { id: "pairs", name: "Matched pairs", weights: {}, pools: [],
    fixedPool: [
      { r: 1.5, l: "3:2" }, { r: 1.5, l: "3:2" }, { r: 0.667, l: "2:3" }, { r: 0.667, l: "2:3" },
      { r: 1.0, l: "1:1" }, { r: 1.0, l: "1:1" }, { r: 1.778, l: "16:9" }, { r: 1.778, l: "16:9" },
    ] },
];

function genItems(imgCount, textScraps, ratioMode, seed, setId = "mixed", canvasW = 800, minFS = 36, textBoxSize = 1.0) {
  const set = IMG_SETS.find(s => s.id === setId) || IMG_SETS[0];
  const rng = rng32(seed);
  const items = [];

  if (set.fixedPool) {
    // Fixed pool: shuffle and take first N
    const pool = [...set.fixedPool];
    for (let i = pool.length - 1; i > 0; i--) { const j = ~~(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    for (let i = 0; i < imgCount; i++) {
      const c = pool[i % pool.length];
      items.push({ id: i, ratio: c.r, label: c.l, hue: HUES[i % HUES.length], isText: false });
    }
  } else {
    // Weighted pool selection
    const totalW = Object.values(set.weights).reduce((s, w) => s + w, 0);
    for (let i = 0; i < imgCount; i++) {
      let r = rng() * totalW, chosenPool = set.pools[0];
      for (const [pn, w] of Object.entries(set.weights)) { r -= w; if (r <= 0) { chosenPool = pn; break; } }
      const pool = RATIO_POOLS[chosenPool] || RATIO_POOLS.landscape;
      const c = pool[~~(rng() * pool.length)];
      items.push({ id: i, ratio: c.r, label: c.l, hue: HUES[i % HUES.length], isText: false });
    }
  }

  let tid = imgCount;
  for (const ts of textScraps) {
    const ratio = ts.isPaired
      ? pairedPreferredRatio(ts.title, ts.subtitle, ratioMode, canvasW, minFS)
      : textPreferredRatio(ts.text, ratioMode, canvasW, minFS);
    // v6.3: minimum area for text items — ensures Phyllo/GA can't give a box
    // too small to render text at readable fs. Based on widthInEm × targetFS².
    // For short text (single-row-preferred), no min area needed.
    // For paired, use combined title+subtitle length.
    const fullText = ts.isPaired ? (ts.title + " " + ts.subtitle) : ts.text;
    const cjkCount = (fullText.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
    const otherCount = fullText.length - cjkCount;
    const widthInEm = cjkCount * 1.0 + otherCount * 0.52;
    let minArea = 0, maxArea = 0;
    // Only long text gets min-area constraint (short text fits in tiny boxes fine)
    const isLong = ts.isPaired || (!isSingleRowPreferred(fullText, canvasW, minFS));
    if (isLong) {
      // Target: text renders at fs>=8 with room for wrapping + padding
      // v9: targetFS=14 in normalized 1000u canvas ≈ 8 display px on 560 canvas
      const targetFS = 14, lhRef = 2.0, charWF = 0.55;
      const textArea = widthInEm * targetFS * targetFS * lhRef * charWF;
      // 1.5x multiplier for padding + wrap inefficiency, scaled by user's textBoxSize slider
      minArea = Math.min(textArea * 1.5 * textBoxSize, canvasW * canvasW * 0.20 * textBoxSize);
    } else {
      // v9-2 (B): maxArea for short single-row text — symmetric to minArea.
      // Target fs=28 (normalized, ~16 display px on 560). Multiplier 4.0 allows
      // generous padding while preventing "1-word takes half the canvas" cases.
      const targetFS = 28, lhRef = 2.0, charWF = 0.55;
      const tightArea = widthInEm * targetFS * targetFS * lhRef * charWF;
      maxArea = tightArea * 4.0 * textBoxSize;
    }
    items.push({
      id: tid++, ratio, label: ts.isPaired ? "T+S" : "TXT",
      hue: 0, isText: true,
      text: ts.isPaired ? ts.title : ts.text,
      isPaired: ts.isPaired || false,
      subtitle: ts.isPaired ? ts.subtitle : undefined,
      minArea, maxArea,
    });
  }
  return items;
}
function countOverlaps(frames) { let c = 0; for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) { const a = frames[i], b = frames[j]; if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) c++; } return c; }

// ═══════════════════════════════════════════════════════════
// TEXT RENDERERS
// ═══════════════════════════════════════════════════════════

const FF = {
  serif: "'Newsreader', Georgia, 'Times New Roman', serif",
  sans: "'Outfit', 'Helvetica Neue', Arial, sans-serif",
  mono: "'JetBrains Mono', 'Courier New', monospace",
};

function SingleTextScrap({ text, w, h, vAlign, hAlign, fontFamily, lineHeight, padFractionX, padFractionY, fontWeight, italic }) {
  const est = useMemo(
    () => estimateTextLayout(text, w, h, { padFractionX, padFractionY, lineHeight, fontFamily, italic }),
    [text, w, h, padFractionX, padFractionY, lineHeight, fontFamily, italic]
  );
  const [fs, setFs] = useState(est.fontSize);
  const containerRef = useRef(null);
  const textRef = useRef(null);

  // v6.3: Post-render shrink via direct DOM mutation — runs the entire
  // shrink loop inside one useLayoutEffect call. More reliable than
  // state-driven iterations which can be interrupted by parent re-renders.
  useLayoutEffect(() => {
    const t = textRef.current, c = containerRef.current;
    if (!t || !c) return;
    let cur = est.fontSize;
    t.style.fontSize = `${cur}px`;
    void t.offsetHeight; // force reflow
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

  const jMap = { top: "flex-start", center: "center", bottom: "flex-end" };
  const aMap = { left: "flex-start", center: "center", right: "flex-end" };
  const italicBump = italic && fontFamily === "serif" ? Math.max(2, fs * 0.05) : 0;
  const padStyle = `${est.padY}px ${est.padX}px ${est.padY}px ${est.padX + italicBump}px`;
  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: jMap[vAlign] || "center", alignItems: aMap[hAlign] || "flex-start", padding: padStyle, overflow: "hidden" }}>
      <div ref={textRef} style={{ fontSize: Math.max(6, fs), lineHeight, color: "rgba(255,255,255,0.92)", fontFamily: FF[fontFamily] || FF.serif, fontStyle: italic ? "italic" : "normal", fontWeight, textAlign: hAlign, wordBreak: est.isSingleWord ? "normal" : "break-word", whiteSpace: est.isSingleWord ? "nowrap" : "normal", letterSpacing: fs > 28 ? "0.02em" : "0.005em", maxWidth: "100%" }}>
        {text}
      </div>
    </div>
  );
}

function PairedTextScrap({ title, subtitle, w, h, vAlign, hAlign, fontFamily, lineHeight, padFractionX, padFractionY, fontWeight, italic }) {
  const est = useMemo(
    () => estimatePairedLayout(title, subtitle, w, h, { padFractionX, padFractionY, lineHeight, fontFamily, italic }),
    [title, subtitle, w, h, padFractionX, padFractionY, lineHeight, fontFamily, italic]
  );
  // v6.3 post-render shrink: scale title+sub uniformly to preserve proportions.
  const [scale, setScale] = useState(1);
  const containerRef = useRef(null);
  const titleRef = useRef(null);
  const subRef = useRef(null);

  useLayoutEffect(() => {
    const c = containerRef.current, t = titleRef.current, s = subRef.current;
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
  const aMap = { left: "flex-start", center: "center", right: "flex-end" };
  const jMap = { top: "flex-start", center: "center", bottom: "flex-end" };
  const italicBump = italic && fontFamily === "serif" ? Math.max(2, titleFS * 0.05) : 0;
  const padStyle = `${est.padY}px ${est.padX}px ${est.padY}px ${est.padX + italicBump}px`;

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: jMap[vAlign] || "center", alignItems: aMap[hAlign] || "flex-start", padding: padStyle, overflow: "hidden", gap: est.padY * 0.3 }}>
      <div ref={titleRef} style={{ fontSize: titleFS, lineHeight, color: "rgba(255,255,255,0.94)", fontFamily: FF[fontFamily] || FF.serif, fontStyle: italic ? "italic" : "normal", fontWeight: Math.min(700, fontWeight + 200), textAlign: hAlign, wordBreak: "break-word", letterSpacing: titleFS > 28 ? "0.02em" : "0.005em", maxWidth: "100%" }}>
        {title}
      </div>
      <div ref={subRef} style={{ fontSize: subFS, lineHeight: lineHeight * 1.05, color: "rgba(255,255,255,0.55)", fontFamily: FF[fontFamily] || FF.serif, fontStyle: italic ? "italic" : "normal", fontWeight: Math.max(300, fontWeight - 100), textAlign: hAlign, wordBreak: "break-word", letterSpacing: "0.01em", maxWidth: "100%" }}>
        {subtitle}
      </div>
    </div>
  );
}

function TextScrapRenderer({ item, w, h, tp }) {
  if (item.isPaired) return <PairedTextScrap title={item.text} subtitle={item.subtitle} w={w} h={h} {...tp} />;
  return <SingleTextScrap text={item.text} w={w} h={h} {...tp} />;
}

// ═══════════════════════════════════════════════════════════
// CANVAS VIEW
// ═══════════════════════════════════════════════════════════

const FMONO = "'JetBrains Mono', monospace";
const FSANS = "'Outfit', sans-serif";
const FONT = "'Newsreader', Georgia, serif";
const ACC = "#c9a84c";

function CanvasView({ frames, cw, ch, maxW, maxH, label, accent, tp, borderWidth = 0, shadowOpacity = 0.25, allowOverlap = false }) {
  const sc = Math.min(maxW / cw, maxH / ch, 1);
  const olap = countOverlaps(frames);
  // v5: overlaps are expected when Scrap Scale or Tightness > 0
  const showOverlapWarning = olap > 0 && !allowOverlap;
  return (
    <div>
      {label && <div style={{ textAlign: "center", fontSize: 10, color: accent || "#888", fontFamily: FMONO, marginBottom: 5, fontWeight: 600 }}>{label}</div>}
      <div style={{ width: cw * sc, height: ch * sc, position: "relative", margin: "0 auto", borderRadius: 8, overflow: "hidden", background: "linear-gradient(155deg, #0d0d12, #101018)", boxShadow: "0 2px 24px rgba(0,0,0,0.4)", border: showOverlapWarning ? "1.5px solid #e44" : "1px solid rgba(255,255,255,0.03)" }}>
        {frames.map(f => {
          const x = f.x * sc, y = f.y * sc, w = f.w * sc, h = f.h * sc;
          if (w < 2 || h < 2) return null;
          const isT = f.item?.isText;
          const tilted = !!f.rot;
          // v5: shadow intensity driven by shadowOpacity param
          const shadowStr = tilted
            ? `0 4px 12px rgba(0,0,0,${Math.min(1, shadowOpacity * 1.4).toFixed(2)})`
            : `0 2px 8px rgba(0,0,0,${shadowOpacity.toFixed(2)})`;
          // v5: white CSS border (box-sizing: border-box so it doesn't affect layout)
          const borderStr = borderWidth > 0
            ? `${borderWidth}px solid rgba(255,255,255,0.9)`
            : (isT ? "0.5px solid rgba(201,168,76,0.12)" : "0.5px solid rgba(255,255,255,0.04)");
          return (
            <div key={f.id} style={{ position: "absolute", left: x, top: y, width: w, height: h, boxSizing: "border-box", transform: f.rot ? `rotate(${f.rot.toFixed(2)}deg)` : "none", transformOrigin: "center center", borderRadius: isT ? 4 : 3, overflow: "hidden", background: isT ? (f.item.isPaired ? "linear-gradient(145deg, rgba(201,168,76,0.08), rgba(160,140,80,0.03))" : "linear-gradient(145deg, rgba(201,168,76,0.06), rgba(201,168,76,0.02))") : `linear-gradient(${130 + f.item.hue * 0.4}deg, hsl(${f.item.hue},38%,24%), hsl(${(f.item.hue + 30) % 360},42%,14%))`, boxShadow: shadowStr, border: borderStr }}>
              {isT ? <TextScrapRenderer item={f.item} w={w} h={h} tp={tp} /> : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", gap: 1 }}>
                  {w > 22 && <div style={{ fontSize: Math.min(10, w * 0.09), fontWeight: 600, color: `hsl(${f.item.hue},25%,50%)`, fontFamily: FMONO }}>{f.item.label}</div>}
                  {w > 42 && <div style={{ fontSize: Math.min(7, w * 0.06), color: `hsl(${f.item.hue},15%,35%)`, fontFamily: FMONO }}>{Math.round(f.w)}×{Math.round(f.h)}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showOverlapWarning && <div style={{ textAlign: "center", fontSize: 9, color: "#e44", fontFamily: FMONO, marginTop: 3 }}>⚠ {olap} overlap{olap > 1 ? "s" : ""}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════

function Pill({ active, children, onClick, small }) { return <button onClick={onClick} style={{ padding: small ? "3px 8px" : "4px 11px", borderRadius: 20, cursor: "pointer", border: active ? `1px solid ${ACC}` : "1px solid #1e1e28", background: active ? `${ACC}11` : "transparent", color: active ? ACC : "#555", fontSize: small ? 9 : 10, fontFamily: FSANS, fontWeight: active ? 600 : 400 }}>{children}</button>; }
function Sec({ title, children, accent }) { return <div style={{ marginBottom: 16 }}><div style={{ fontSize: 8, letterSpacing: 3, color: accent || "#333", textTransform: "uppercase", fontFamily: FMONO, marginBottom: 5, textAlign: "center" }}>{title}</div>{children}</div>; }
function SliderRow({ items }) { return <div style={{ display: "flex", justifyContent: "center", gap: 10, padding: "0 16px 6px", flexWrap: "wrap" }}>{items.map(({ l, v, s, mn, mx, step, d }) => <label key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#555", fontFamily: FSANS }}><span style={{ minWidth: 44, textAlign: "right" }}>{l}</span><strong style={{ color: "#aaa", fontFamily: FMONO, fontSize: 10, minWidth: 26, textAlign: "center" }}>{d || v}</strong><input type="range" min={mn} max={mx} step={step || 1} value={v} onChange={e => s(+(e.target.value))} style={{ width: 56, accentColor: ACC }} /></label>)}</div>; }

const CR = [{ id: "16:9", r: 16 / 9 }, { id: "4:3", r: 4 / 3 }, { id: "1:1", r: 1 }, { id: "3:4", r: 3 / 4 }, { id: "9:16", r: 9 / 16 }];

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════

export default function App() {
  const cRef = useRef(null);
  const [cW, setCW] = useState(800);
  useEffect(() => { const m = () => cRef.current && setCW(cRef.current.offsetWidth); m(); window.addEventListener("resize", m); return () => window.removeEventListener("resize", m); }, []);

  // Layout
  const [canvasId, setCanvasId] = useState("16:9");
  const [seed, setSeed] = useState(7);
  const [imgCount, setImgCount] = useState(3);
  const [imgSetId, setImgSetId] = useState("mixed");
  const [gapPct, setGapPct] = useState(4);
  const [padPct, setPadPct] = useState(6.5);
  const [ratioMode, setRatioMode] = useState("wide");
  const [sizeVar, setSizeVar] = useState(0.5);
  const [rotation, setRotation] = useState(1.0);
  const [density, setDensity] = useState(0.55);

  // Text config
  const [textCount, setTextCount] = useState(2);
  const [textRelation, setTextRelation] = useState("independent"); // "independent" | "paired"
  const [textAId, setTextAId] = useState("headline");
  const [textBId, setTextBId] = useState("long");
  const [customA, setCustomA] = useState("");
  const [customB, setCustomB] = useState("");

  // Text rendering
  const [vAlign, setVAlign] = useState("center");
  const [hAlign, setHAlign] = useState("center");
  const [fontFamily, setFontFamily] = useState("mono");       // v6.3: default bold mono
  const [lineHeight, setLineHeight] = useState(1.4);        // v6.3: default 1.4 (was 2.0)
  const [padFractionX, setPadFractionX] = useState(0.05);     // v6.3: horizontal pad (5%)
  const [padFractionY, setPadFractionY] = useState(0.05);     // v6.3: vertical pad (5%)
  const [fontWeight, setFontWeight] = useState(700);          // v6.3: default bold
  const [italic, setItalic] = useState(true);                 // v9-2: default italic

  // v4: GA ratio search toggle
  const [ratioSearch, setRatioSearch] = useState(true);
  const [phylloTrials, setPhylloTrials] = useState(30);
  const [minFS, setMinFS] = useState(0);                      // v9: default 0 (classification uses 28u floor internally)
  const [textBoxSize, setTextBoxSize] = useState(1.10);       // v9-2: default 1.10×
  const [maxFS, setMaxFS] = useState(60);                     // v9-2: max fs for short text (normalized units; ~33 display px on 560)

  // v5: post-processing + rendering (from auto-layout-spec-v2)
  const [scrapScalePct, setScrapScalePct] = useState(0);
  const [tightnessPct, setTightnessPct] = useState(0);
  const [borderWidth, setBorderWidth] = useState(0);
  const [shadowOpacity, setShadowOpacity] = useState(0);
  const [autoRetry, setAutoRetry] = useState(true);
  const [minScore, setMinScore] = useState(70);               // v9: default 70
  const [maxRetries, setMaxRetries] = useState(60);           // v7: default 60

  const tp = { vAlign, hAlign, fontFamily, lineHeight, padFractionX, padFractionY, fontWeight, italic };
  const tOpts = { padFractionX, padFractionY, lineHeight, fontFamily, italic, textBoxSize, maxFS };

  const canvasR = CR.find(c => c.id === canvasId)?.r || 16 / 9;
  // v9: normalized canvas for all layout calculations. This decouples layout
  // decisions from display size — same seed + settings produces the same
  // relative proportions on any device. Display is handled by CanvasView's
  // internal scale factor (sc = min(maxW/cw, maxH/ch)).
  const NW = canvasR >= 1 ? 1000 : Math.round(1000 * canvasR);
  const NH = canvasR >= 1 ? Math.round(1000 / canvasR) : 1000;
  const sE = Math.min(NW, NH);
  const gap = sE * gapPct / 100, padding = sE * padPct / 100;

  const selA = SAMPLES.find(t => t.id === textAId);
  const selB = textRelation === "paired"
    ? SUBTITLE_SAMPLES.find(t => t.id === textBId)
    : SAMPLES.find(t => t.id === textBId);
  const textA = customA.trim() || (selA ? selA.text : "Hello World!");
  const textB = customB.trim() || (selB ? selB.text : "2025 · Travel Journal");

  // Build text scraps array
  const textScraps = useMemo(() => {
    if (textCount === 0) return [];
    if (textCount === 1) {
      if (textRelation === "paired") return [{ isPaired: true, title: textA, subtitle: textB }];
      return [{ isPaired: false, text: textA }];
    }
    if (textRelation === "paired") return [{ isPaired: true, title: textA, subtitle: textB }];
    return [{ isPaired: false, text: textA }, { isPaired: false, text: textB }];
  }, [textCount, textRelation, textA, textB]);

  const items = useMemo(() => genItems(imgCount, textScraps, ratioMode, seed, imgSetId, NW, minFS, textBoxSize), [imgCount, textScraps, ratioMode, seed, imgSetId, NW, minFS, textBoxSize]);

  // v9: post-processing scales in N-coords
  const scrapScalePx = Math.min(NW, NH) * scrapScalePct / 100;
  const tightnessPx = Math.min(NW, NH) * tightnessPct / 100;

  // v6.2: maxRetries now a state (slider). Independent retry loops for Grid/Phyllo.

  const gridResult = useMemo(() => {
    let s = seed, tries = 0, result;
    const threshold = minScore / 100;
    while (true) {
      result = runGA(items, NW, NH, gap, padding, s, tOpts, ratioMode, ratioSearch, minFS);
      if (!autoRetry || tries >= maxRetries) break;
      if (result.score >= threshold) break;
      s += 1;
      tries += 1;
    }
    let frames = applyScrapScale(result.frames, scrapScalePx);
    frames = applyTightness(frames, tightnessPx, NW, NH);
    return { ...result, frames, retries: tries, finalSeed: s };
  }, [items, NW, NH, gap, padding, seed, padFractionX, padFractionY, lineHeight, fontFamily, italic, ratioMode, ratioSearch, scrapScalePx, tightnessPx, autoRetry, minScore, minFS, maxRetries]);
  const gridFrames = gridResult.frames;

  const phylloResult = useMemo(() => {
    let s = seed, tries = 0, result;
    const threshold = minScore / 100;
    while (true) {
      result = bestPhyllo(items, NW, NH, gap, padding, s, sizeVar, rotation, density, phylloTrials, tOpts, ratioMode, ratioSearch, minFS);
      if (!autoRetry || tries >= maxRetries) break;
      if (result.score >= threshold) break;
      s += 1;
      tries += 1;
    }
    let frames = applyScrapScale(result.frames, scrapScalePx);
    frames = applyTightness(frames, tightnessPx, NW, NH);
    return { ...result, frames, retries: tries, finalSeed: s };
  }, [items, NW, NH, gap, padding, seed, sizeVar, rotation, density, phylloTrials, padFractionX, padFractionY, lineHeight, fontFamily, italic, ratioMode, ratioSearch, scrapScalePx, tightnessPx, autoRetry, minScore, minFS, maxRetries]);

  const halfW = Math.max(220, (cW - 48) / 2);

  // Analysis
  const textFramesGrid = gridFrames.filter(f => f.item?.isText);
  const textFramesPhyllo = phylloResult.frames.filter(f => f.item?.isText);

  return (
    <div ref={cRef} style={{ minHeight: "100vh", background: "#08080b", color: "#ddd", fontFamily: FSANS }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,700;1,6..72,300;1,6..72,400;1,6..72,700&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');*{box-sizing:border-box;margin:0}html,body{background:#08080b}input[type=range]{height:4px}textarea{background:#0d0d14;border:1px solid #1a1a24;color:#ccc;border-radius:6px;padding:6px 10px;font-family:'Newsreader',Georgia,serif;font-size:12px;font-style:italic;resize:vertical;width:100%}textarea:focus{outline:none;border-color:rgba(201,168,76,0.3)}textarea::placeholder{color:#333;font-style:italic}`}</style>

      <div style={{ padding: "16px 20px 0", textAlign: "center" }}>
        <div style={{ fontSize: 8, letterSpacing: 4, color: "#2a2a2a", textTransform: "uppercase", fontFamily: FMONO, marginBottom: 4 }}>Research v6.3</div>
        <h1 style={{ fontSize: 22, fontFamily: FONT, fontWeight: 400, color: "#e8e4dd", margin: "0 0 4px", fontStyle: "italic" }}>Text as Scrap</h1>
        <p style={{ fontSize: 10, color: "#444", lineHeight: 1.5, maxWidth: 480, margin: "0 auto" }}>
          Canvas-aware <span style={{ color: "#888" }}>single-row ratio</span> preference · GA ratio search · post-process · score retry.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 4, padding: "10px 20px 4px" }}>
        {CR.map(c => <Pill key={c.id} active={canvasId === c.id} onClick={() => setCanvasId(c.id)}>{c.id}</Pill>)}
      </div>

      {/* IMAGE SET PRESETS */}
      <div style={{ display: "flex", justifyContent: "center", gap: 3, padding: "4px 20px", flexWrap: "wrap", maxWidth: 560, margin: "0 auto" }}>
        {IMG_SETS.map(s => <Pill key={s.id} small active={imgSetId === s.id} onClick={() => setImgSetId(s.id)}>{s.name}</Pill>)}
      </div>

      {/* TEXT CONFIGURATION */}
      <Sec title="Text Scraps" accent="#555">
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 6 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ fontSize: 8, color: "#444", fontFamily: FMONO }}>Count</div>
            <div style={{ display: "flex", gap: 2 }}>{[0, 1, 2].map(n => <Pill key={n} small active={textCount === n} onClick={() => setTextCount(n)}>{n}</Pill>)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ fontSize: 8, color: "#444", fontFamily: FMONO }}>Relationship</div>
            <div style={{ display: "flex", gap: 2 }}>
              <Pill small active={textRelation === "independent"} onClick={() => setTextRelation("independent")}>Independent</Pill>
              <Pill small active={textRelation === "paired"} onClick={() => setTextRelation("paired")}>Title + Sub</Pill>
            </div>
          </div>
        </div>

        {textCount > 0 && (
          <div style={{ maxWidth: 440, margin: "0 auto", padding: "0 20px" }}>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 8, color: ACC, fontFamily: FMONO, marginBottom: 3 }}>{textRelation === "paired" ? "Title" : "Text A"}</div>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 4 }}>
                {SAMPLES.map(t => <Pill key={t.id} small active={textAId === t.id && !customA} onClick={() => { setTextAId(t.id); setCustomA(""); }}>{t.label}</Pill>)}
              </div>
              <textarea rows={1} placeholder="Custom..." value={customA} onChange={e => setCustomA(e.target.value)} />
            </div>

            {(textCount === 2 || textRelation === "paired") && (
              <div>
                <div style={{ fontSize: 8, color: ACC, fontFamily: FMONO, marginBottom: 3 }}>{textRelation === "paired" ? "Subtitle" : "Text B"}</div>
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 4 }}>
                  {(textRelation === "paired" ? SUBTITLE_SAMPLES : SAMPLES).map(t => <Pill key={t.id} small active={textBId === t.id && !customB} onClick={() => { setTextBId(t.id); setCustomB(""); }}>{t.label}</Pill>)}
                </div>
                <textarea rows={1} placeholder="Custom..." value={customB} onChange={e => setCustomB(e.target.value)} />
              </div>
            )}
          </div>
        )}
      </Sec>

      {/* LAYOUT CONTROLS */}
      <SliderRow items={[
        { l: "Imgs", v: imgCount, s: setImgCount, mn: 1, mx: 8 },
        { l: "Gap", v: gapPct, s: setGapPct, mn: 0, mx: 8, step: 0.5, d: `${gapPct}%` },
        { l: "Pad", v: padPct, s: setPadPct, mn: 2, mx: 12, step: 0.5, d: `${padPct}%` },
        { l: "SzVar", v: sizeVar, s: setSizeVar, mn: 0, mx: 1, step: 0.05, d: `${(sizeVar * 100).toFixed(0)}%` },
        { l: "Rot", v: rotation, s: setRotation, mn: 0, mx: 1, step: 0.05, d: `${(rotation * 100).toFixed(0)}%` },
        { l: "Dense", v: density, s: setDensity, mn: 0.15, mx: 0.55, step: 0.05, d: `${(density * 100).toFixed(0)}%` },
        { l: "Trials", v: phylloTrials, s: setPhylloTrials, mn: 3, mx: 30, d: `${phylloTrials}` },
      ]} />

      {/* v5: POST-PROCESSING */}
      <Sec title="Post-Processing" accent="#555">
        <SliderRow items={[
          { l: "Scrap", v: scrapScalePct, s: setScrapScalePct, mn: 0, mx: 10, step: 0.5, d: `${scrapScalePct}%` },
          { l: "Tight", v: tightnessPct, s: setTightnessPct, mn: 0, mx: 10, step: 0.5, d: `${tightnessPct}%` },
        ]} />
        <div style={{ display: "flex", justifyContent: "center", gap: 10, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 8, color: "#444", fontFamily: FMONO, letterSpacing: 1 }}>AUTO-RETRY</div>
            <Pill small active={autoRetry} onClick={() => setAutoRetry(!autoRetry)}>
              {autoRetry ? "ON ✓" : "OFF"}
            </Pill>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#555", fontFamily: FSANS, opacity: autoRetry ? 1 : 0.4 }}>
            <span style={{ minWidth: 58, textAlign: "right" }}>Min Score</span>
            <strong style={{ color: "#aaa", fontFamily: FMONO, fontSize: 10, minWidth: 30, textAlign: "center" }}>{minScore}</strong>
            <input type="range" min={0} max={80} step={5} value={minScore} onChange={e => setMinScore(+e.target.value)} disabled={!autoRetry} style={{ width: 80, accentColor: ACC }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#555", fontFamily: FSANS, opacity: autoRetry ? 1 : 0.4 }}>
            <span style={{ minWidth: 58, textAlign: "right" }}>Max Retry</span>
            <strong style={{ color: "#aaa", fontFamily: FMONO, fontSize: 10, minWidth: 30, textAlign: "center" }}>{maxRetries}×</strong>
            <input type="range" min={10} max={300} step={10} value={maxRetries} onChange={e => setMaxRetries(+e.target.value)} disabled={!autoRetry} style={{ width: 80, accentColor: ACC }} />
          </label>
        </div>
        {/* Retries display: always rendered so layout doesn't jump; visibility hidden when no retries */}
        <div style={{
          textAlign: "center", fontSize: 8, color: "#666", fontFamily: FMONO, marginTop: 4,
          visibility: (gridResult.retries > 0 || phylloResult.retries > 0) ? "visible" : "hidden"
        }}>
          Retries · Grid <span style={{ color: gridResult.retries >= maxRetries ? "#a77" : "#888" }}>{gridResult.retries || 0}</span>
          {" · "}
          Phyllo <span style={{ color: phylloResult.retries >= maxRetries ? "#a77" : "#888" }}>{phylloResult.retries || 0}</span>
          {(gridResult.retries >= maxRetries || phylloResult.retries >= maxRetries) && (
            <span style={{ color: "#a77" }}> (cap hit)</span>
          )}
        </div>
      </Sec>

      {/* v5: RENDERING */}
      <Sec title="Rendering" accent="#444">
        <SliderRow items={[
          { l: "Border", v: borderWidth, s: setBorderWidth, mn: 0, mx: 6, step: 0.5, d: `${borderWidth}px` },
          { l: "Shadow", v: shadowOpacity, s: setShadowOpacity, mn: 0, mx: 1, step: 0.05, d: shadowOpacity.toFixed(2) },
        ]} />
      </Sec>

      {/* TEXT STYLE — near preview */}
      {textCount > 0 && (
        <Sec title="Text Style" accent="#444">
          <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", padding: "0 12px", marginBottom: 4 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><div style={{ fontSize: 7, color: "#444", fontFamily: FMONO }}>V</div><div style={{ display: "flex", gap: 2 }}>{["top", "center", "bottom"].map(a => <Pill key={a} small active={vAlign === a} onClick={() => setVAlign(a)}>{a[0].toUpperCase()}</Pill>)}</div></div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><div style={{ fontSize: 7, color: "#444", fontFamily: FMONO }}>H</div><div style={{ display: "flex", gap: 2 }}>{["left", "center", "right"].map(a => <Pill key={a} small active={hAlign === a} onClick={() => setHAlign(a)}>{a[0].toUpperCase()}</Pill>)}</div></div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><div style={{ fontSize: 7, color: "#444", fontFamily: FMONO }}>Font</div><div style={{ display: "flex", gap: 2 }}>{["serif", "sans", "mono"].map(f => <Pill key={f} small active={fontFamily === f} onClick={() => setFontFamily(f)}>{f}</Pill>)}</div></div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><div style={{ fontSize: 7, color: "#444", fontFamily: FMONO }}>Wt</div><div style={{ display: "flex", gap: 2 }}>{[{ v: 300, l: "Lt" }, { v: 400, l: "Rg" }, { v: 700, l: "Bd" }].map(w => <Pill key={w.v} small active={fontWeight === w.v} onClick={() => setFontWeight(w.v)}>{w.l}</Pill>)}</div></div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><div style={{ fontSize: 7, color: "#444", fontFamily: FMONO }}>&nbsp;</div><Pill small active={italic} onClick={() => setItalic(!italic)}>{italic ? "Ita" : "Norm"}</Pill></div>
          </div>
          <SliderRow items={[
            { l: "LineH", v: lineHeight, s: setLineHeight, mn: 1.0, mx: 2.5, step: 0.05, d: lineHeight.toFixed(2) },
            { l: "PadX", v: padFractionX, s: setPadFractionX, mn: 0.0, mx: 0.25, step: 0.01, d: `${(padFractionX * 100).toFixed(0)}%` },
            { l: "PadY", v: padFractionY, s: setPadFractionY, mn: 0.0, mx: 0.25, step: 0.01, d: `${(padFractionY * 100).toFixed(0)}%` },
          ]} />
        </Sec>
      )}

      {/* TEXT RATIO — closest to preview (most important text control) */}
      {textCount > 0 && (
        <Sec title="Text Ratio">
          <div style={{ display: "flex", justifyContent: "center", gap: 3, marginBottom: 6 }}>
            {[{ id: "auto", l: "Auto" }, { id: "wide", l: "Wide" }, { id: "square", l: "Square" }, { id: "tall", l: "Tall" }].map(m => <Pill key={m.id} small active={ratioMode === m.id} onClick={() => setRatioMode(m.id)}>{m.l}</Pill>)}
          </div>
          {/* v4: GA ratio search toggle */}
          <div style={{ display: "flex", justifyContent: "center", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 8, color: "#444", fontFamily: FMONO, letterSpacing: 1 }}>GA SEARCH</div>
            <Pill small active={ratioSearch} onClick={() => setRatioSearch(!ratioSearch)}>
              {ratioSearch ? "ON ✓" : "OFF"}
            </Pill>
            <div style={{ fontSize: 8, color: "#3a3a3a", fontFamily: FMONO, maxWidth: 240, lineHeight: 1.5 }}>
              {ratioSearch
                ? "Ratio mode = exploration bounds; GA searches for best ratio"
                : "Ratio mode = fixed value; GA only searches tree topology"}
            </div>
          </div>
          {/* v6: Min FS slider for single-row threshold (applies in auto & wide) */}
          {(ratioMode === "auto" || ratioMode === "wide") && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#555", fontFamily: FSANS }}>
                <span style={{ minWidth: 48, textAlign: "right" }}>Min FS</span>
                <strong style={{ color: "#aaa", fontFamily: FMONO, fontSize: 10, minWidth: 30, textAlign: "center" }}>{minFS}px</strong>
                <input type="range" min={0} max={60} step={2} value={minFS} onChange={e => setMinFS(+e.target.value)} style={{ width: 90, accentColor: ACC }} />
              </label>
              <div style={{ fontSize: 8, color: "#3a3a3a", fontFamily: FMONO, lineHeight: 1.5 }}>
                {(() => {
                  // Preview: show which of the current text scraps are single-row preferred
                  const flags = textScraps.map(ts => {
                    if (ts.isPaired) return { text: ts.title + "+", sr: false };
                    return { text: ts.text, sr: isSingleRowPreferred(ts.text, NW, minFS) };
                  });
                  const on = flags.filter(f => f.sr).length;
                  return `${on}/${flags.length} text${flags.length > 1 ? "s" : ""} → single-row`;
                })()}
              </div>
            </div>
          )}
          {/* v7: Text Box Size — multiplier on long-text minArea AND short-text maxArea (controls image↔text relative size) */}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#555", fontFamily: FSANS }}>
              <span style={{ minWidth: 48, textAlign: "right" }}>Text Box</span>
              <strong style={{ color: "#aaa", fontFamily: FMONO, fontSize: 10, minWidth: 34, textAlign: "center" }}>{textBoxSize.toFixed(2)}×</strong>
              <input type="range" min={0.5} max={1.5} step={0.05} value={textBoxSize} onChange={e => setTextBoxSize(+e.target.value)} style={{ width: 90, accentColor: ACC }} />
            </label>
            <div style={{ fontSize: 8, color: "#3a3a3a", fontFamily: FMONO, lineHeight: 1.5 }}>long min · short max area</div>
          </div>
          {/* v9-2 (A): Max FS — cap on short-text rendered fs (normalized units) */}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#555", fontFamily: FSANS }}>
              <span style={{ minWidth: 48, textAlign: "right" }}>Max FS</span>
              <strong style={{ color: "#aaa", fontFamily: FMONO, fontSize: 10, minWidth: 34, textAlign: "center" }}>{maxFS}</strong>
              <input type="range" min={20} max={150} step={5} value={maxFS} onChange={e => setMaxFS(+e.target.value)} style={{ width: 90, accentColor: ACC }} />
            </label>
            <div style={{ fontSize: 8, color: "#3a3a3a", fontFamily: FMONO, lineHeight: 1.5 }}>short-text fs cap</div>
          </div>
        </Sec>
      )}

      {/* LAYOUTS */}
      <div style={{ display: "flex", justifyContent: "center", gap: 12, padding: "0 16px 10px", flexWrap: "wrap", alignItems: "flex-start" }}>
        {[
          { frames: gridFrames, label: "Grid (v20)", accent: "#666", result: gridResult },
          { frames: phylloResult.frames, label: "Phyllo", accent: ACC, result: phylloResult },
        ].map(({ frames, label, accent, result }, i) => {
          const scorePct = Math.max(0, (result.score || 0) * 100);
          const metThreshold = scorePct >= minScore;
          const scoreColor = scorePct >= 70 ? "#7a7" : scorePct >= 50 ? "#aa7" : "#a77";
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <CanvasView frames={frames} cw={NW} ch={NH} maxW={halfW} maxH={360} label={label} accent={accent} tp={tp} borderWidth={borderWidth} shadowOpacity={shadowOpacity} allowOverlap={scrapScalePct > 0 || tightnessPct > 0} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, fontFamily: FMONO, color: "#555" }}>
                <span>Score</span>
                <strong style={{ color: scoreColor, fontSize: 13, fontFamily: FMONO }}>
                  {scorePct.toFixed(1)}
                </strong>
                {autoRetry && (
                  <span style={{ fontSize: 8, color: "#444" }}>
                    {metThreshold ? "✓" : "·"} min {minScore}
                    {result.retries > 0 && ` · ${result.retries} retry${result.retries > 1 ? "s" : ""}`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* SEED UI — below layouts, below scores */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 20px 12px" }}>
        <button onClick={() => setSeed(s => Math.max(1, s - 1))} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #1e1e28", background: "transparent", color: "#666", fontSize: 15, cursor: "pointer", fontFamily: FMONO }}>‹</button>
        <span style={{ fontSize: 11, fontFamily: FMONO, color: "#777", minWidth: 66, textAlign: "center" }}>Seed {seed}</span>
        <button onClick={() => setSeed(s => s + 1)} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #1e1e28", background: "transparent", color: "#666", fontSize: 15, cursor: "pointer", fontFamily: FMONO }}>›</button>
        <button onClick={() => setSeed(~~(Math.random() * 999) + 1)} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 10, cursor: "pointer", fontFamily: FMONO, border: `1px solid ${ACC}33`, background: `${ACC}11`, color: ACC }}>🎲</button>
      </div>

      {/* ANALYSIS */}
      {(textFramesGrid.length > 0 || textFramesPhyllo.length > 0) && (
        <Sec title="Text Analysis" accent={ACC}>
          <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
            {[
              { label: "Grid", tfs: textFramesGrid, searched: gridResult.textRatios || {} },
              { label: "Phyllo", tfs: textFramesPhyllo, searched: phylloResult.textRatios || {} },
            ].map(({ label, tfs, searched }) => (
              <div key={label} style={{ minWidth: 140 }}>
                <div style={{ fontSize: 10, color: "#666", fontFamily: FMONO, marginBottom: 3, textAlign: "center" }}>{label}</div>
                {tfs.map((f, i) => {
                  const est = estimateTextLayout(f.item.text || "", f.w, f.h, tOpts);
                  const actualRatio = f.w / f.h;
                  const defaultRatio = f.item.isPaired
                    ? pairedPreferredRatio(f.item.text, f.item.subtitle || "", ratioMode, NW, minFS)
                    : textPreferredRatio(f.item.text || "", ratioMode, NW, minFS);
                  const searchedRatio = searched[f.id];
                  const wasSearched = searchedRatio !== undefined && Math.abs(searchedRatio - defaultRatio) > 0.05;
                  return (
                    <div key={i} style={{ fontSize: 9, color: "#555", fontFamily: FMONO, lineHeight: 1.7, textAlign: "center", marginBottom: 6 }}>
                      <span style={{ color: "#777" }}>{f.item.isPaired ? "T+S" : "TXT"}</span> {Math.round(f.w)}×{Math.round(f.h)}<br/>
                      <span style={{ color: est.fontSize >= 14 ? "#7a7" : est.fontSize >= 10 ? "#aa7" : "#a55" }}>{est.fontSize.toFixed(0)}px</span>
                      {" · Fill "}
                      <span style={{ color: est.fillH > 0.7 ? "#7a7" : "#aa7" }}>{(est.fillH * 100).toFixed(0)}%</span><br/>
                      <span style={{ color: "#666" }}>R: </span>
                      <span style={{ color: wasSearched ? ACC : "#888" }}>{actualRatio.toFixed(2)}</span>
                      <span style={{ color: "#333" }}> (def {defaultRatio.toFixed(2)})</span>
                      {wasSearched && <span style={{ color: ACC, marginLeft: 4 }}>✦</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Sec>
      )}

      {/* LEGEND */}
      <div style={{ padding: "4px 20px" }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
          {items.map(im => {
            const sz = 16, w = im.ratio >= 1 ? sz : sz * im.ratio, h = im.ratio >= 1 ? sz / im.ratio : sz;
            return <div key={im.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <div style={{ width: w, height: h, borderRadius: 1.5, background: im.isText ? "rgba(201,168,76,0.15)" : `hsl(${im.hue},30%,28%)`, border: im.isText ? "0.5px solid rgba(201,168,76,0.3)" : `0.5px solid hsl(${im.hue},20%,38%)` }} />
              <div style={{ fontSize: 6, color: im.isText ? ACC : "#444", fontFamily: FMONO }}>{im.label}</div>
            </div>;
          })}
        </div>
      </div>

      <div style={{ padding: "4px 20px 20px", textAlign: "center", fontSize: 7, color: "#1a1a1a", fontFamily: FMONO }}>Text Scrap v9.2 · Short-text controls + Grid canvas-aspect fix</div>
    </div>
  );
}
