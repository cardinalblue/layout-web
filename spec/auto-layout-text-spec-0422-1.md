# Auto Layout Text Spec — 0422-1

> Updated 2026-04-22. Consolidated specification for Grid and Phyllo layout engines with first-class text-scrap integration. Reflects implementation at v9.2.
>
> This spec is the authoritative reference for algorithm behavior and parameter control. It supersedes `auto-layout-spec-v2.md` in all areas where they disagree.

---

## Table of Contents

1. [Normalized Canvas](#normalized-canvas)
2. [Shared Concepts](#shared-concepts)
3. [Text-Scrap Integration](#text-scrap-integration)
4. [Item Generation (`genItems`)](#item-generation-genitems)
5. [Grid Layout](#grid-layout)
6. [Phyllo Layout](#phyllo-layout)
7. [Text Rendering](#text-rendering)
8. [Post-Processing](#post-processing)
9. [Retry Loop](#retry-loop)
10. [Parameter Reference](#parameter-reference)

---

## Normalized Canvas

**All layout computation runs in a normalized 1000-unit coordinate space**, independent of the display dimensions. This is the single most important architectural rule — violating it breaks device-independence.

### Definition

Given a chosen `canvasRatio` (e.g. `16/9`, `1/1`, `9/16`):

```
if (canvasRatio >= 1) {   // landscape or square
  NW = 1000;
  NH = round(1000 / canvasRatio);
} else {                  // portrait
  NW = round(1000 * canvasRatio);
  NH = 1000;
}
```

### Usage Rule

- Every layout-related computation (area allocation, ratio decisions, font-size thresholds, minArea/maxArea, gap, padding, post-processing scale, retry scoring) uses `(NW, NH)` — **not the display dimensions**.
- Frames produced by `runGA` and `bestPhyllo` are in `(NW, NH)` coordinates.
- Display is handled purely by the rendering layer: `CanvasView` receives frames + `NW, NH` and applies its own scale `sc = min(maxW/NW, maxH/NH)` to produce display pixels.

### Why

Same seed + same settings must produce identical layouts on 400px mobile and 1400px desktop. Before v9 this wasn't the case: many thresholds (fs floors, minArea cap, single-row decision) were tied to display pixels, so mobile got different layout decisions than desktop for the same content.

### Calibration Note

Current thresholds (fs floors, font size caps) are calibrated to the normalized 1000-unit space. When the code references numbers like `targetFS = 14` or `maxFS = 60`, these are normalized units, not display pixels. A typical display will scale these by `displayW / 1000` (e.g. ×0.56 on a 560px canvas).

---

## Shared Concepts

### Input / Output

- **Input:** Array of image items (`ImageItem { id, ratio, label, hue, isText: false }`) and text scraps (`TextScrap { isPaired, text, title?, subtitle? }`)
- **Output:** Array of frames (`Frame { id, x, y, w, h, rot?, item }`), all coordinates in normalized space

### Canvas Aspect Ratios (`CR`)

| ID | Ratio |
|----|-------|
| 16:9 | 1.778 |
| 4:3 | 1.333 |
| 1:1 | 1.000 |
| 3:4 | 0.750 |
| 9:16 | 0.5625 |

### Gap & Padding

Expressed as percentage of `min(NW, NH)` (the short edge of the normalized canvas).

| Parameter | Default | Range | Unit |
|-----------|---------|-------|------|
| `gapPct` | 4 | 0–8 | % of normalized short edge |
| `padPct` | 6.5 | 2–12 | % of normalized short edge |

Converted to units at computation time: `gap = min(NW, NH) * gapPct / 100`, same for `padding`.

### Seeded RNG

`rng32(seed)` — Weyl-sequence 32-bit hash. Deterministic: same seed + same inputs produce same layout.

### Shared Utilities

| Function | Purpose |
|----------|---------|
| `rng32(seed)` | Seeded PRNG, returns `() => float in [0,1)` |
| `rectDist(a, b)` | Edge-to-edge rectangle distance (positive when separated) |
| `createPerlin(seed)` | Seeded 2D Perlin noise |
| `countOverlaps(frames)` | Count overlapping frame pairs |
| `estimateTextLayout(text, boxW, boxH, opts)` | Estimate font size + line count for text fitting in a box |
| `isSingleRowPreferred(text, canvasW, minFS)` | Classify a text as single-row candidate |
| `textPreferredRatio`, `pairedPreferredRatio` | Preferred aspect ratio for text items |
| `textRatioRange` | GA search range for a text item's ratio |
| `applyScrapScale(frames, scalePx)` | Post-processing: inflate each frame |
| `applyTightness(frames, tightPx, NW, NH)` | Post-processing: pull toward center + rescale |

---

## Text-Scrap Integration

Text scraps are **first-class layout items** alongside image items. They participate in GA search, area allocation, and scoring identically to images, but with additional text-specific scoring factors and area constraints.

### Text Scrap Types

- **Single** — one `text` string
- **Paired** — a `title` + `subtitle` rendered as a stacked block; treated as one layout item with one ratio

### Classification — `isSingleRowPreferred`

Determines whether a text is treated as **short** (single-row, wide ratio, size-capped) or **long** (multi-row, min-area constrained).

```
cjkCount = count of CJK characters
otherCount = length - cjkCount
widthInEm = cjkCount * 1.0 + otherCount * 0.52

fs = max(minFS, 28)           // 28u floor — user's minFS below this has no effect
singleRowPx = widthInEm * fs * 1.05
return singleRowPx <= canvasW * 0.80
```

**Key design point:** The `28u` floor is independent of user's `minFS` slider. `minFS` only affects rendering; the classification threshold is fixed at 28 normalized units so the short/long boundary stays stable regardless of the user's rendering preference.

### Preferred Ratio — `textPreferredRatio(text, mode, canvasW, minFS)`

| Mode | Behavior |
|------|----------|
| `tall` | `max(0.5, min(0.9, 10 / textLength))` |
| `square` | `1.0` |
| `auto` / `wide` | Single-row branch OR wrap branch below |

**Single-row branch** (when `isSingleRowPreferred` returns true):

```
ratio = widthInEm / 1.35
return clamp(ratio, 3.5, 4.5)   // v9-1: tightened from [0.8, 6.0]
```

Tightening to `[3.5, 4.5]` equalizes the rendered fs across different short-text lengths. Before this change, a 1-word text got `ratio=1.93` (tall box → large fs) while a 5-word text got `ratio=6.0` (wide strip → same-ish fs), causing visible inconsistency in the "short text" UX.

**Wrap branch** (long text):

```
autoR = by wordCount table:
  CJK char count: ≤4 → 2.5, ≤8 → 1.8, ≤16 → 1.3, else 1.0
  words ≤2 → 2.8, ≤4 → 2.0, ≤8 → 1.5, ≤15 → 1.2, ≤25 → 1.0, else 0.85

if (mode === "wide") return min(4.0, autoR * 1.4);
return autoR;
```

### Ratio Search Range — `textRatioRange`

Returns `[lo, hi]` bounds the GA is allowed to explore for a text item.

```
base = textPreferredRatio(...)
singleRow = not paired AND (mode === "auto" || "wide") AND isSingleRowPreferred(...)

if (singleRow) return [max(base*0.80, 1.5), min(8.0, base*1.25)]
if (mode === "auto") return [max(0.4, base*0.45), min(8.0, base*2.2)]
return [max(0.4, base*0.75), min(8.0, base*1.35)]     // forced modes
```

---

## Item Generation (`genItems`)

Combines image pool draws + text scraps into a unified item list. Signature:

```
genItems(imgCount, textScraps, ratioMode, seed, setId, canvasW, minFS, textBoxSize)
```

For each image: draws ratio from the configured ratio pool (`mixed`, `landscape`, `portrait`, `square`, etc.) using weighted random selection.

For each text scrap: computes `ratio`, `minArea`, `maxArea` based on content.

### `minArea` — long-text floor

Applied only to long text (classified as `!isSingleRowPreferred`) and all paired texts. Prevents engines from allocating a box so small that the text renders at unreadable fs.

```
targetFS = 14      // normalized units; ~8 display px on a 560-canvas
lhRef = 2.0
charWF = 0.55
textArea = widthInEm * targetFS² * lhRef * charWF
minArea = min(textArea * 1.5 * textBoxSize, canvasW² * 0.20 * textBoxSize)
```

The `1.5×` multiplier accounts for padding + wrap inefficiency. The `0.20 × canvas²` cap prevents long paragraphs from demanding an unreasonable fraction of small canvases.

### `maxArea` — short-text ceiling

Applied only to short text (single-row candidates). Prevents engines from giving short text a disproportionately large box (e.g. "TOKYO" consuming half the canvas).

```
targetFS = 28     // normalized
lhRef = 2.0
charWF = 0.55
tightArea = widthInEm * targetFS² * lhRef * charWF
maxArea = tightArea * 4.0 * textBoxSize
```

The `4.0×` multiplier allows generous padding while preventing extreme oversize.

### Item Schema

```
{
  id, ratio, label, hue, isText,
  // text items only:
  text, isPaired, subtitle,
  minArea,   // 0 for short text / image items
  maxArea    // 0 for long text / image items
}
```

---

## Grid Layout

Binary-tree topology optimized by Genetic Algorithm, producing gallery-wall-style aligned rows.

### Parameters

| Parameter | Default | Range | Notes |
|-----------|---------|-------|-------|
| population | 50 | — | GA population size |
| generations | 40 | — | GA generation count |
| `sizeVar` | 0.5 | 0–1 | Size hierarchy strength (affects leaf area allocation) |

### Pipeline

1. **`balTree` / randomTree** — Initial population: 2 balanced trees (cuts 0 and 1 axis) + random mutations seeded with diverse text-ratio genomes
2. **GA loop** — Mutate + score × generations
3. **Final layout** — Apply best genome's text ratios → `treeAreas` → `computeSizes` → `layoutExact` → `scaleToFit`

### Genome

```
{
  tree,                          // binary partition tree, leaves = item indices
  textRatios: { [itemId]: ratio } // per-text ratio overrides (sampled from textRatioRange)
}
```

### Mutation Operators

Applied per-generation; probabilities summed across structural ops add to 1.00:

| Operator | Probability | Description |
|----------|-------------|-------------|
| Flip Cut | 40% | Toggle H↔V at random internal node |
| Swap Leaves | 30% | Swap two random leaves |
| Restructure | 30% | Rebuild a random subtree |

Additionally, if `enableRatioMutation` is on: 50% chance per text item to resample its ratio from `textRatioRange`.

### Scoring — `rowScore`

```
gs^0.13 × fl^0.15 × co^0.05 × am^0.15 × rwS^0.13 × aOK^0.09 × rcOK^0.13 × tB^0.17
// sum = 1.00
```

> **v9-2 rebalance:** `am` raised to 0.15 and `fl` raised to 0.15 to improve canvas-aspect matching. Compensated by reducing `rwS`, `aOK`, `tB`. Previous (pre-v9.2) weights: `gs=0.13, fl=0.13, co=0.05, am=0.11, rwS=0.15, aOK=0.11, rcOK=0.13, tB=0.19`.

| Factor | Weight | Formula |
|--------|--------|---------|
| `gs` (gap uniformity) | 0.13 | `1 / (1 + sqrt(gapRMSE²/n) / abs(gap))` |
| `fl` (fill) | 0.15 | `max(0.01, bboxArea / (NW × NH))` |
| `co` (compactness) | 0.05 | `totalItemArea / bboxArea` |
| `am` (aspect match) | 0.15 | `1 / (1 + abs(log(bboxAspect / canvasAspect)) × 1.0)` |
| `rwS` (row-width consistency) | 0.13 | `minRowWidth / maxRowWidth` |
| `aOK` (area balance) | 0.09 | 1 if `maxArea/minArea ≤ 3`, else fades |
| `rcOK` (row count) | 0.13 | 1 if `maxItemsPerRow ≤ idealMax`, else fades |
| `tB` (text block) | 0.17 | See text-block scoring below |

### `am` factor — canvas aspect matching

The multiplier was raised from `0.8` to `1.0` in v9-2 to strengthen the penalty when layout bbox doesn't match canvas aspect. This fixed a visible bug where tall canvases (9:16) were producing wide layouts and vice versa.

### `rcOK` / `idealMax`

```
idealMax = max(2, round(sqrt(frames.length) * sqrt(canvasAspect)))
rcOK = (maxItemsPerRow ≤ idealMax) ? 1 : max(0.3, 1 - (maxItemsPerRow - idealMax) * 0.15)
```

> **v9-2 floor change:** `idealMax` floor was lowered `3 → 2`. For 9:16 with n=5, this now returns 2 instead of being clamped at 3, properly penalizing wide rows in tall canvases.

### Text block scoring — `tB`

Computed per text frame, multiplied together:

```
// Adaptive fs-floor (shrinks with textBoxSize)
fsFloorBase = (wordCount > 12) ? 14 : 18      // normalized units
fsFloor = max(5, round(fsFloorBase * textBoxSize))

// 1. fs floor penalty (long text rendered too small)
if (est.fontSize < fsFloor)     tB *= 0.3
else if (est.fontSize < fsFloor+3) tB *= 0.7

// 2. Fill quality (box much wider/taller than text needs)
fillBoth = sqrt(est.fillH * max(est.fillW, 0.3))
if (fillBoth < 0.4)  tB *= 0.75
else if (fillBoth < 0.55) tB *= 0.9

// 3. Long-text oversize (box > 2× minArea)
if (item.minArea > 0 && box area / minArea > 2.0):
  tB *= max(0.55, 1 - (areaRatio - 2.0) * 0.12)

// 4. Short-text maxFS cap (rendered fs exceeds user-set maxFS)
if (item.maxArea > 0 && est.fontSize > maxFS):
  tB *= max(0.5, 1 - (est.fontSize/maxFS - 1) * 0.4)

// 5. Short-text maxArea (box > maxArea)
if (item.maxArea > 0 && box area / maxArea > 1.0):
  tB *= max(0.55, 1 - (areaRatio - 1.0) * 0.20)
```

### GA Loop

- Top 30% kept per generation
- Rest filled by mutating random survivors

---

## Phyllo Layout

Phyllotaxis-inspired spiral placement with constraint-solver convergence. Also honors text-scrap `minArea` via post-allocation boost.

### Parameters

| Parameter | Default | Range | Notes |
|-----------|---------|-------|-------|
| `sizeVar` | 0.5 | 0–1 | Size hierarchy strength |
| `rotation` | 1.0 | 0–1 | Aesthetic rotation strength |
| `density` | 0.55 | 0.15–0.55 | Target fill density |
| `phylloTrials` | 30 | 3–30 | Multi-trial attempts with different ratio samplings |

### Pipeline

1. **Area allocation** — rank-based with `sizeVar` hierarchy
2. **minArea boost** — Text items below `minArea` are raised to `minArea`; the deficit is scaled out of non-text items proportionally (floor 0.3× of original)
3. **Elliptical seed placement** — using golden angle
4. **300-iteration constraint solver**
5. **Perlin-noise rotation**

### Phase 1 — Area Allocation

```
tA = NW × NH × density * (1 - 2*padding / min(NW,NH))²     // available area
bA = tA / n
areas[rank] = bA * (1 + (1 - rank/(n-1)) * sizeVar * 1.2)
normalize so sum(areas) == tA
```

### Phase 2 — minArea Boost (v7)

```
for each text item where areas[r] < item.minArea:
  deficit += item.minArea - areas[r]
  areas[r] = item.minArea

if deficit > 0 and nonTextTotal > 0:
  scale = max(0.3, (nonTextTotal - deficit) / nonTextTotal)
  for each non-text item: areas[r] *= scale
```

The `max(0.3, ...)` clamp prevents image items from being compressed to less than 30% of their original area even when text demands a lot.

### Phase 3 — Seed Ellipse (v7)

```
eRx = aW × 0.42
eRy = aH × 0.42
GOLDEN_ANGLE = 2π / φ²
for rank r:
  angle = r × GOLDEN_ANGLE + random(-0.2, 0.2)
  t = (r == 0) ? 0 : sqrt(r / n)
  x = cx + cos(angle) × eRx × t - w/2
  y = cy + sin(angle) × eRy × t - h/2
```

### Phase 4 — Constraint Solver (300 iterations)

`decay = max(0.25, 1 - iter/300)`

| Sub-phase | When | Strength | Description |
|-----------|------|----------|-------------|
| 4a. Collision | all iter | `0.55 × decay` | Push overlapping pairs apart on min-overlap axis |
| 4b. Gravity (asymmetric) | all iter | `gX = 0.035 × decay × (cr<1 ? 1.1 : 0.7)`, symmetrically for `gY` | Short canvas axis pulls stronger, long axis pulls weaker — lets items spread along the long axis |
| 4c. Spread | iter 10–180 | `0.012 × decay`, short-axis × 1.2 bonus, threshold 0.75 | If `gW < aW × 0.75` push outward; same for gH |
| 4d. Aspect-ratio correction | iter 10–180 | `0.006 × decay` | Compress/expand to match canvas aspect ±15% |
| 4e. Gap targeting | iter 90+ | `0.015 × decay` | Pull items with gap > 1.8× target |
| 4f. Boundary clamp | all | hard | Clamp to `[padding, NW-w-padding]` |

Early exit: `totalOverlap < 0.1` and `iter > 40`.

### Phase 5 — Aesthetic Rotation

- Perlin freq: 0.007
- Base: `perlin(cx*freq, cy*freq) × 6` (±6°)
- Alternating bias: `(index % 2 == 0 ? +1 : -1) × 1.5`
- Final: `(base + altBias) × rotation`
- **Text items: rotation = 0** (explicit)

### Scoring — `scorePhyllo`

```
am^0.10 × cov^0.15 × axisFill^0.08 × co^0.30 × gh2^0.17 × ts^0.20
// sum = 1.00
```

| Factor | Weight | Formula |
|--------|--------|---------|
| Overlap disqualifier | — | Any overlap → return `-overlapCount` |
| `am` (aspect match) | 0.10 | `1 / (1 + abs(log(bboxAspect / canvasAspect)) × 1.5)` |
| `cov` (coverage) | 0.15 | `min(bboxArea / (NW*NH), 1)` |
| `axisFill` (v7) | 0.08 | `min(gW/NW, gH/NH)` — per-axis fill, penalizes long canvases where one axis is under-used |
| `co` (compactness) | 0.30 | `totalItemArea / bboxArea` |
| `gh2` (gap harmony) | 0.17 | `1 / (1 + coefficient-of-variation × 2)` of nearest-neighbor gaps |
| `ts` (text signal) | 0.20 | Same structure as `tB` in Grid (fs floor, fill, oversize penalties) |

### Multi-Trial Selector — `bestPhyllo`

For each of `phylloTrials` trials:
- `trialSeed = seed + trial × 17`
- Sample fresh ratios from `textRatioRange` for each text item if `enableRatioSearch` is on
- Run `phylloLayout` + compute `scorePhyllo`
- Early exit if score > 0.85
- Return best-scoring trial

---

## Text Rendering

Two React components: `SingleTextScrap` and `PairedTextScrap`. Both receive `{ w, h }` in display pixels (already scaled by `CanvasView.sc`), and execute an estimator + post-render shrink loop.

### `estimateTextLayout(text, boxW, boxH, opts)`

Predicts the optimal `fontSize` and line count given a box. Uses opts `padFractionX`, `padFractionY`, `lineHeight`, `fontFamily`, `italic`.

Algorithm:
1. Compute `innerW = boxW - padX*2`, `innerH = boxH - padY*2`
2. For fs from 6 to 200, step 0.5:
   - Compute `charsPerLine` given `charWF × fs`
   - Compute `lines` by wrapping words (non-monotonic for multi-word — can't break early)
   - Check `textH ≤ innerH × hCeil` and `textW ≤ innerW × wCeil` (wCeil only for short/single-word/CJK)
   - Track largest valid fs
3. Return `{ fontSize, lines, fillH, fillW, padX, padY, isSingleWord }`

### Character-width factors (`CHAR_W`)

```
serif: 0.52, sans: 0.48, mono: 0.60
```

CJK characters use 1.00 (full-width). Italic serif: cjkCW = 1.05. All-caps single words: charWF × 1.35. Proportional single words: charWF × 1.15.

### Ceiling factors

```
hCeil = 1 - fontOvershoot(fontFamily, italic)
  italic serif: 0.85 (swash safety)
  italic sans/mono: 0.92
  non-italic: 0.97

wCeil:
  isSingleWord: 0.88
  isCJK: 0.90
  else: 0.92
```

### Post-render shrink (v6.3)

Since the estimator and the browser's actual wrapping can disagree, a final DOM-mutation loop shrinks fs until the text fits:

```javascript
useLayoutEffect(() => {
  let cur = est.fontSize;
  t.style.fontSize = `${cur}px`;
  void t.offsetHeight;                 // force reflow
  for (let i = 0; i < 25; i++) {
    if (textH <= availH + 1) break;
    if (cur <= 3) break;               // fs floor
    cur = max(3, cur * 0.9);
    t.style.fontSize = `${cur}px`;
    void t.offsetHeight;
  }
  setFs(cur);                          // sync to React
}, [...]);
```

All 25 shrink iterations run synchronously within one effect via DOM mutation + forced reflow. This is more reliable than state-driven iteration which can be interrupted by parent re-renders.

The fs floor is `3` (was `6` in earlier versions). Below 3 would be invisible anyway.

For paired text, the same loop scales both title and subtitle uniformly by `scale ∈ [0.2, 1.0]`.

### Font-size cap interaction

The `maxFS` slider caps the **score** (via `tB`/`ts` penalty), not the render. After the GA/Phyllo search converges on a box that respects the cap, the renderer computes whatever fs actually fits — which will naturally be ≤ maxFS in most cases since that's what the score favored.

---

## Post-Processing

Applied to final frames after layout converges.

### `applyScrapScale(frames, scalePx)`

Inflate each frame by `scalePx` on all sides (in-place). Used for `Scrap Scale` slider (0–10% of `min(NW, NH)`).

### `applyTightness(frames, tightPx, NW, NH)`

Pull each frame toward canvas center by `tightPx`, then rescale bbox to fit canvas. Used for `Tightness` slider (0–10% of `min(NW, NH)`).

---

## Retry Loop

If `autoRetry` is on, both engines retry with incremented seeds until a score threshold is met.

```
while tries < maxRetries:
  result = runGA(...) or bestPhyllo(...)
  if !autoRetry or tries >= maxRetries: break
  if result.score >= minScore / 100: break
  seed += 1
  tries += 1
```

Grid and Phyllo have independent retry loops (different retries count may be reported). Both display a `(cap hit)` marker in the UI when retries reach `maxRetries`.

---

## Parameter Reference

### Defaults (v9.2)

#### Canvas & Image Set
| Parameter | Default |
|-----------|---------|
| `canvasRatio` | `16:9` |
| `imgCount` | 3 |
| `imgSetId` | `mixed` |

#### Text Content
| Parameter | Default |
|-----------|---------|
| `textCount` | 2 |
| `textRelation` | `independent` |
| Text A | "Hello World!" (2 words) |
| Text B | "Last summer we drove..." (28 words) |

#### Layout Params
| Parameter | Default | Range |
|-----------|---------|-------|
| `gapPct` | 4% | 0–8% |
| `padPct` | 6.5% | 2–12% |
| `sizeVar` | 0.50 | 0–1 |
| `rotation` | 1.00 | 0–1 |
| `density` | 0.55 | 0.15–0.55 |
| `phylloTrials` | 30 | 3–30 |

#### Text Ratio
| Parameter | Default | Range |
|-----------|---------|-------|
| `ratioMode` | `wide` | auto / wide / square / tall |
| `ratioSearch` (GA Search) | ON | on/off |
| `minFS` | 0 | 0–60 (normalized units) |
| `textBoxSize` | 1.10 | 0.5–1.5 |
| `maxFS` | 60 | 20–150 (normalized units) |

#### Text Style
| Parameter | Default |
|-----------|---------|
| `vAlign` | center |
| `hAlign` | center |
| `fontFamily` | mono |
| `fontWeight` | 700 (bold) |
| `italic` | true |
| `lineHeight` | 1.40 |
| `padFractionX` | 5% |
| `padFractionY` | 5% |

#### Post-Processing
| Parameter | Default | Range |
|-----------|---------|-------|
| `scrapScalePct` | 0% | 0–10% |
| `tightnessPct` | 0% | 0–10% |
| `autoRetry` | ON | on/off |
| `minScore` | 70 | 0–80 |
| `maxRetries` | 60 | 10–300 |

#### Rendering
| Parameter | Default | Range |
|-----------|---------|-------|
| `borderWidth` | 0px | 0–6px |
| `shadowOpacity` | 0.00 | 0–1 |

### Parameter Interaction Map

```
textBoxSize ─┬─→ genItems.minArea   (× multiplier)
             ├─→ genItems.maxArea   (× multiplier)
             ├─→ rowScore.fsFloor   (× scales the floor down)
             └─→ scorePhyllo.fsFloor (× scales the floor down)

maxFS ─→ rowScore.tB oversizeFS penalty
      → scorePhyllo.ts oversizeFS penalty

minFS ─→ isSingleRowPreferred threshold (via max(minFS, 28) floor)

ratioMode ─→ textPreferredRatio (modifies autoR for wide mode; forces for tall/square)
          → textRatioRange (tighter bounds when mode is forced)

ratioSearch ─→ runGA / bestPhyllo ratio mutation behavior
```

---

## Changelog (abridged)

### v9.2 (this doc)
- **Short-text controls**: added `maxFS` slider, `maxArea` ceiling (symmetric to minArea). Both wired into `tB`/`ts` as new penalty factors.
- **Single-row ratio tightened to [3.5, 4.5]** — fixes fs inconsistency across different short-text lengths.
- **Grid canvas-aspect fix**: `am` multiplier 0.8→1.0, `idealMax` floor 3→2, weight rebalance.
- Defaults: italic on, ratioMode `wide`, ratioSearch on, `textBoxSize` 1.10.

### v9.0
- **Normalized 1000-unit canvas**. All layout computation device-independent.
- Calibrated fs thresholds: `isSingleRowPreferred` floor 16→28, rowScore/scorePhyllo `fsFloorBase` 8/10 → 14/18, genItems `targetFS` 8→14.

### v8
- `textBoxSize` affects both Grid and Phyllo (via `fsFloor` scaling + oversize penalty via `minArea`).

### v7
- Phyllo `minArea` boost: text items raised to minArea, deficit scaled out of non-text items (floor 0.3).
- `textBoxSize` slider (0.5–1.5×) wired into `minArea`.
- Phyllo canvas-fill: seed ellipse `aW*0.42/aH*0.42`, stronger expansion for under-filled axes, asymmetric gravity, new `axisFill` scoring factor.
- Defaults: italic off, mono, bold, line-height 1.4.

### v6.3
- Adaptive font-aware safety factor (`fontOvershoot`).
- PadX/PadY split into separate parameters.
- Single-useLayoutEffect shrink loop with direct DOM mutation.
- Long-text ratio fix: wrap branch no longer produces 6:1 strips.
