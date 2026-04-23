# Auto Layout Text Spec — 0423-1

> Updated 2026-04-23. Consolidated specification for Grid and Phyllo layout engines with first-class text-scrap integration.
>
> This spec supersedes `auto-layout-text-spec-0422-1.md`. It resolves 8 spec↔code discrepancies found during the 0422-1 audit (see [Changelog](#changelog)). Where the audit concluded the code behavior was better, this doc captures the code's behavior as authoritative. Where the audit concluded the spec was better, this doc keeps the spec and the accompanying code is expected to be changed — those items are flagged **[CODE CHANGE REQUIRED]**.

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
11. [Changelog](#changelog)

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

### `retrySeed(originalSeed, tries)` — retry dispersion

```
function retrySeed(originalSeed, tries):
  h = (originalSeed | 0) XOR (tries × 0x9e3779b1)     // imul
  h = (h XOR (h >>> 16)) × 0x85ebca6b                 // imul
  h = (h XOR (h >>> 13)) × 0xc2b2ae35                 // imul
  h = h XOR (h >>> 16)
  return h >>> 0                                      // u32
```

Splitmix32 of the `(originalSeed, tries)` pair. Used by the retry loop to disperse consecutive user seeds across the retry-seed space — see [Retry Loop](#retry-loop) for rationale.

### Shared Utilities

| Function | Purpose |
|----------|---------|
| `rng32(seed)` | Seeded PRNG, returns `() => float in [0,1)` |
| `retrySeed(seed, tries)` | Splitmix32 dispersion for retry loops |
| `rectDist(a, b)` | Edge-to-edge rectangle distance (positive when separated) |
| `createPerlin(seed)` | Seeded 2D Perlin noise |
| `countOverlaps(frames)` | Count overlapping frame pairs |
| `estimateTextLayout(text, boxW, boxH, opts)` | Estimate font size + line count for text fitting in a box |
| `isSingleRowPreferred(text, canvasW, minFS)` | Classify a text as single-row candidate |
| `textPreferredRatio`, `pairedPreferredRatio` | Preferred aspect ratio for text items |
| `textRatioRange` | GA search range for a text item's ratio |
| `applyScrapScale(frames, scaleUnits)` | Post-processing: inflate each frame by `scaleUnits` on all sides |
| `applyTightness(frames, tightUnits, NW, NH)` | Post-processing: proportional pull toward center + re-expand |

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
return clamp(ratio, 3.5, 4.5)
```

Tightening to `[3.5, 4.5]` equalizes the rendered fs across different short-text lengths. Before v9.2, a 1-word text got `ratio=1.93` (tall box → large fs) while a 5-word text got `ratio=6.0` (wide strip → same-ish fs), causing visible inconsistency in the "short text" UX.

**Wrap branch** (long text):

```
autoR = by wordCount table:
  CJK char count: ≤4 → 2.5, ≤8 → 1.8, ≤16 → 1.3, else 1.0
  words ≤2 → 2.8, ≤4 → 2.0, ≤8 → 1.5, ≤15 → 1.2, ≤25 → 1.0, else 0.85

if (mode === "wide") return min(4.0, autoR * 1.4);
return autoR;
```

### Paired Preferred Ratio — `pairedPreferredRatio(title, subtitle, mode, canvasW, minFS)`

For `mode !== 'auto'`, delegate to `textPreferredRatio(title + ' ' + subtitle, mode, ...)`.

For `mode === 'auto'`:

```
tW = wordCount(title)
sW = wordCount(subtitle)
if tW ≤ 2 and sW ≤ 4:  return 1.6
if tW ≤ 3 and sW ≤ 8:  return 1.2
if tW ≤ 4 and sW ≤ 15: return 1.0
return 0.85
```

### Ratio Search Range — `textRatioRange`

Returns `[lo, hi]` bounds the GA is allowed to explore for a text item.

```
base = isPaired ? pairedPreferredRatio(...) : textPreferredRatio(...)
singleRow = not isPaired AND (mode === "auto" || "wide") AND isSingleRowPreferred(...)

if (singleRow)       return [max(base*0.80, 1.5), min(8.0, base*1.25)]
if (mode === "auto") return [max(0.4, base*0.45), min(8.0, base*2.2)]
return [max(0.4, base*0.75), min(8.0, base*1.35)]     // forced modes
```

### Ratio Sampling — `sampleTextRatio`

```
[lo, hi] = textRatioRange(...)
base     = textPreferredRatio(...) or pairedPreferredRatio(...)
if (rng() < 0.5):
  spread = (hi - lo) * 0.25
  return clamp(base + (rng()-0.5) * 2 * spread, lo, hi)    // near-base exploration
else:
  return lo + rng() * (hi - lo)                            // uniform exploration
```

### Ratio Mutation — `mutateRatio(ratio, lo, hi, rng, strength=0.2)`

```
delta = (rng() - 0.5) * 2 * (hi - lo) * strength
return clamp(ratio + delta, lo, hi)
```

---

## Item Generation (`genItems`)

Combines image pool draws + text scraps into a unified item list. Signature:

```
genItems({
  imgCount, textScraps, ratioMode, seed, setId,
  NW, minFS, textBoxSize,
  imageRatios?, imageIds?     // optional overrides when user uploaded real photos
}) -> Item[]
```

For each image: draws ratio from the configured ratio pool (`mixed`, `landscape`, `portrait`, `square`, etc.) using weighted random selection; or uses `imageRatios[i]` when provided (uploaded photos).

For each text scrap: computes `ratio`, `minArea`, `maxArea` based on content.

### `minArea` — long-text floor

Applied only to long text (classified as `!isSingleRowPreferred`) and all paired texts. Prevents engines from allocating a box so small that the text renders at unreadable fs.

```
targetFS = 14      // normalized units; ~8 display px on a 560-canvas
lhRef = 2.0
charWF = 0.55
textArea = widthInEm(fullText) * targetFS² * lhRef * charWF
minArea = min(textArea * 1.5 * textBoxSize, NW² * 0.20 * textBoxSize)
```

Where `fullText = isPaired ? (title + ' ' + subtitle) : text`.

The `1.5×` multiplier accounts for padding + wrap inefficiency. The `0.20 × NW²` cap prevents long paragraphs from demanding an unreasonable fraction of small canvases.

### `maxArea` — short-text ceiling

Applied only to short single text (single-row candidates, not paired). Prevents engines from giving short text a disproportionately large box (e.g. "TOKYO" consuming half the canvas).

```
targetFS = 28     // normalized
lhRef = 2.0
charWF = 0.55
tightArea = widthInEm(text) * targetFS² * lhRef * charWF
maxArea = tightArea * 4.0 * textBoxSize
```

The `4.0×` multiplier allows generous padding while preventing extreme oversize. Paired text never gets a `maxArea`.

### Item Schema

```
{
  id, ratio, label, hue, isText,
  // text items only:
  text, isPaired, subtitle,
  minArea,   // 0 for short single text / image items
  maxArea    // 0 for long text / paired text / image items
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

### Initial Population — Ratio Seeding

```
population = [
  Genome(balTree(indices, depth=0)),
  Genome(balTree(indices, depth=1)),
  ...(population - 2) × Genome(rndTree(n)),
]

// If enableRatioMutation is on, seed diverse ratios into the second half:
if (enableRatioMutation and textItems.length > 0):
  for i in [floor(population/2) .. population-1]:
    for each text item ti:
      population[i].textRatios[ti.id] = sampleTextRatio(ti, ratioMode, rng, NW, minFS)
```

### Mutation Operators — **[CODE CHANGE REQUIRED]**

Mutation is **compound**: every offspring gets exactly one structural tree op, AND (if ratio mutation is enabled) an independent per-text-item ratio-resample pass. This is a change from 0422-1 implementation, which treated them as mutually exclusive and only mutated one text item per offspring — reducing effective search of both the tree and ratio spaces.

```
function mutateGenome(g, rng, items, ratioMode, enableRatioMutation, NW, minFS):
  c = cloneGenome(g)

  // Step 1 — structural mutation: always pick exactly one tree op
  r = rng()
  if r < 0.40:      flipCut(c.tree, rng)      // 40%: toggle H↔V at random internal node
  else if r < 0.70: swapLeaves(c.tree, rng)   // 30%: swap two random leaves
  else:             restructure(c.tree, rng)  // 30%: rebuild a random subtree

  // Step 2 — ratio mutation: additive, per-text-item independent
  if enableRatioMutation:
    for each text item ti in items:
      if rng() < 0.5:
        [lo, hi] = textRatioRange(ti.text, ti.isPaired, ti.subtitle, ratioMode, NW, minFS)
        current  = c.textRatios[ti.id] ?? ti.ratio
        c.textRatios[ti.id] = mutateRatio(current, lo, hi, rng, strength=0.25)

  return c
```

### Tree → Layout

```
rows        = treeToRows(tree, items)           // H-cuts split into rows; V-cuts flatten siblings into one row
ratios      = treeAreas(tree, items, NW*NH*0.55) // compound ratio R: H→1/(1/R0+1/R1), V→R0+R1
sizes       = computeSizes(items, ratios)        // per-item (w, h) proportional to ratio
frames_raw  = layoutGrid(rows, sizes, gap, NW, NH) // normalize per-row height, center on canvas
frames      = scaleUp(frames_raw, NW, NH, pad)   // collision-aware scale-to-fit, pad budget preserved
```

### Scoring — `rowScore` (sum of exponents = 1.00)

```
score = gs^0.13 × fl^0.15 × co^0.05 × am^0.15 × rwS^0.13 × aOK^0.09 × rcOK^0.13 × tB^0.17
```

| Factor | Weight | Formula |
|--------|--------|---------|
| `gs` (gap uniformity) | 0.13 | `1 / (1 + sqrt(gapRMSE²/n) / abs(gap))` |
| `fl` (fill) | 0.15 | `max(0.01, bboxArea / (NW × NH))` |
| `co` (compactness) | 0.05 | `totalItemArea / bboxArea` |
| `am` (aspect match) | 0.15 | `1 / (1 + abs(log(bboxAspect / canvasAspect)) × 1.0)` |
| `rwS` (row-width consistency) | 0.13 | `minRowWidth / maxRowWidth` |
| `aOK` (area balance) | 0.09 | 1 if `maxArea/minArea ≤ 3`, else `max(0, 1 - (ratio-3) × 0.15)` |
| `rcOK` (row count) | 0.13 | see below |
| `tB` (text block) | 0.17 | see below |

### `rcOK` / `idealMax`

```
idealMax = max(2, round(sqrt(frames.length) × sqrt(canvasAspect)))
rcOK     = (maxItemsPerRow ≤ idealMax) ? 1 : max(0.3, 1 - (maxItemsPerRow - idealMax) × 0.15)
```

The `2` floor ensures that for tall canvases (9:16) with small n, the layout is properly penalized for putting too many items in one row.

### Text block scoring — `tB`

Computed per text frame, multiplied together across all text frames:

```
// Adaptive fs-floor (shrinks with textBoxSize)
fsFloorBase = (wordCount > 12) ? 14 : 18      // paired text treated as wordCount=99 → 14
fsFloor     = max(5, round(fsFloorBase * textBoxSize))

// 1. fs floor penalty (text rendered too small)
if est.fontSize < fsFloor:         tB *= 0.3
else if est.fontSize < fsFloor+3:  tB *= 0.7

// 2. Fill quality (box much wider/taller than text needs)
fillBoth = sqrt(est.fillH × max(est.fillW, 0.3))
if fillBoth < 0.4:    tB *= 0.75
else if fillBoth < 0.55: tB *= 0.9

// 3. Long-text oversize (box > 2× minArea)
if item.minArea > 0:
  areaRatio = boxArea / item.minArea
  if areaRatio > 2.0: tB *= max(0.55, 1 - (areaRatio - 2.0) × 0.12)

// 4. Short-text maxFS cap (rendered fs exceeds user-set maxFS)
if item.maxArea > 0 and est.fontSize > maxFS:
  tB *= max(0.5, 1 - (est.fontSize/maxFS - 1) × 0.4)

// 5. Short-text maxArea (box > maxArea)
if item.maxArea > 0:
  ar = boxArea / item.maxArea
  if ar > 1.0: tB *= max(0.55, 1 - (ar - 1.0) × 0.20)
```

### GA Loop

```
for g in [0 .. generations-1]:
  scored = [(genome, frames, score) for genome in pop]
  scored.sort(desc by score)
  bestGenome = argmax(scored)

  survivorCount = max(1, floor(population × 0.3))
  survivors     = scored[:survivorCount].genome
  pop           = clone(survivors)
  while pop.length < population:
    parent = random choice from survivors
    pop.push(mutateGenome(parent, ...))
```

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
aW = NW - 2 × padding
aH = NH - 2 × padding
tA = aW × aH × density              // usable canvas area × density
bA = tA / n
areas[rank] = bA × (1 + (1 - rank/max(n-1, 1)) × sizeVar × 1.2)
normalize so sum(areas) == tA
```

Rationale: `tA` must equal the true usable area so that `density` is a meaningful knob. The earlier `NW × NH × (1 - 2·pad/min(NW,NH))²` form under-allocated by ~10% on non-square canvases (short-edge pad fraction incorrectly applied to the long axis).

### Phase 2 — minArea Boost

```
// Rank order is established by shuffle(items, rng)
deficit = 0
nonTextTotal = 0
for r in [0 .. n-1]:
  it = order[r].item
  if it.isText and it.minArea > 0 and areas[r] < it.minArea:
    deficit += it.minArea - areas[r]
    areas[r] = it.minArea
  else if not it.isText:
    nonTextTotal += areas[r]

if deficit > 0 and nonTextTotal > 0:
  scale = max(0.3, (nonTextTotal - deficit) / nonTextTotal)
  for r in [0 .. n-1]:
    if not order[r].item.isText:
      areas[r] *= scale
```

The `max(0.3, ...)` clamp prevents image items from being compressed to less than 30% of their original area even when text demands a lot.

### Phase 3 — Seed Ellipse

```
eRx = aW × 0.42
eRy = aH × 0.42
GOLDEN_ANGLE = 2π / φ²              // φ = (1 + √5)/2
for rank r in [0 .. n-1]:
  angle = r × GOLDEN_ANGLE + rng(-0.2, 0.2)
  t     = (r == 0) ? 0 : sqrt(r / n)
  w     = sqrt(area[r] × item.ratio)
  h     = w / item.ratio
  x     = cx + cos(angle) × eRx × t - w/2
  y     = cy + sin(angle) × eRy × t - h/2
```

### Phase 4 — Constraint Solver (300 iterations)

`decay = max(0.25, 1 - iter/300)` — applied as a multiplicative modifier to every sub-phase's force strength.

| Sub-phase | When | Strength | Description |
|-----------|------|----------|-------------|
| 4a. Collision | all iter | `0.55 × decay` | Push overlapping pairs apart on min-overlap axis |
| 4b. Gravity (asymmetric) | all iter | `gX = 0.035 × decay × (cr<1 ? 1.1 : 0.7)`; symmetrically for `gY` | Short canvas axis pulls stronger, long axis pulls weaker — lets items spread along the long axis |
| 4c. Spread | iter 10–180 | `0.012 × decay`, short-axis × 1.2 bonus, threshold 0.75 | If `gW < aW × 0.75` push outward; same for gH |
| 4d. Aspect-ratio correction | iter 10–180 | `0.006 × decay` | Compress/expand to match canvas aspect ±15% |
| 4e. Gap targeting | iter 90+ | `0.015 × decay` | Pull items with gap > 1.8× target |
| 4f. Boundary clamp | all | hard | Clamp to `[padding, NW-w-padding]` |

Early exit: `totalOverlap < 0.1` and `iter > 40`.

### Phase 5 — Aesthetic Rotation

- Perlin freq: 0.007
- Base: `perlin(cx·freq, cy·freq) × 6` (±6°)
- Alternating bias: `(index % 2 == 0 ? +1 : -1) × 1.5`
- Final: `(base + altBias) × rotation`
- **Text items: rotation = 0** (explicit)

### Scoring — `scorePhyllo` (sum of exponents = 1.00)

```
// Overlap disqualifier — if any overlap, short-circuit
if countOverlaps(frames) > 0: return -countOverlaps(frames)

score = am^0.10 × cov^0.15 × axisFill^0.08 × co^0.30 × gh2^0.17 × ts^0.20
```

| Factor | Weight | Formula |
|--------|--------|---------|
| `am` (aspect match) | 0.10 | `1 / (1 + abs(log(bboxAspect / canvasAspect)) × 1.5)` |
| `cov` (coverage) | 0.15 | `min(bboxArea / (NW·NH), 1)` |
| `axisFill` | 0.08 | `min(gW/NW, gH/NH)` — per-axis fill, penalizes long canvases where one axis is under-used |
| `co` (compactness) | 0.30 | `totalItemArea / bboxArea` |
| `gh2` (gap harmony) | 0.17 | `1 / (1 + coefficient-of-variation × 2)` of nearest-neighbor gaps |
| `ts` (text signal) | 0.20 | Same structure as `tB` in Grid (fs floor, fill, oversize penalties) |

### Multi-Trial Selector — `bestPhyllo` — **[CODE CHANGE REQUIRED for early-exit]**

```
ratioRng  = rng32(seed + 8888)    // independent stream for ratio sampling across trials
textItems = items.filter(isText)

for t in [0 .. phylloTrials-1]:
  trialSeed = seed × 1000 + t × 7 + 1

  // Ratio sampling — t=0 anchors on the textPreferredRatio baseline (elitism),
  // t>0 samples fresh so the search explores.
  trialRatios = {}
  trialItems  = items
  if enableRatioSearch and textItems.length > 0:
    for ti in textItems:
      trialRatios[ti.id] = (t == 0)
        ? ti.ratio
        : sampleTextRatio(ti.text, ti.isPaired, ti.subtitle, ratioMode, ratioRng, NW, minFS)
    trialItems = applyRatios(items, trialRatios)

  raw    = phylloTrial(trialItems, NW, NH, gap, pad, trialSeed, opts)
  frames = scaleUp(raw, NW, NH, pad)
  score  = scorePhyllo(frames, NW, NH, gap, tOpts)

  if score > best.score:
    best = { frames, score, textRatios: trialRatios }
    if score > 0.85: break       // early-exit threshold — was 0.75 in 0422-1 code

return best
```

Rationale for `trialSeed = seed × 1000 + t × 7 + 1`: the ×1000 separates trial-index dispersion from user-seed dispersion so that `user_seed=100, trial=1` never collides with `user_seed=101, trial=0`.

Rationale for `t == 0` anchor: guarantees the baseline "preferred ratio" layout is always evaluated at least once; without this, a single bad random draw can replace the deterministic best-guess with something worse.

Rationale for `0.85` early-exit: the multi-trial selector's purpose is to pick the best layout, not the first acceptable one. The outer retry loop uses `minScore` (default 70) as a separate quality gate. Exiting early at 0.75 wastes the user-configured trial budget — if we have 30 trials, we should spend them looking for excellence, not quitting at mediocrity.

---

## Text Rendering

Two React components: `SingleTextScrap` and `PairedTextScrap`. Both receive `{ w, h }` in display pixels (already scaled by `CanvasView.sc`), and execute an estimator + post-render shrink loop.

### `estimateTextLayout(text, boxW, boxH, opts)`

Predicts the optimal `fontSize` and line count given a box. Uses opts `padFractionX`, `padFractionY`, `lineHeight`, `fontFamily`, `italic`.

Algorithm:
1. Compute `innerW = boxW - padX·2`, `innerH = boxH - padY·2`
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
  italic serif:     0.85 (swash safety)
  italic sans/mono: 0.92
  non-italic:       0.97

wCeil:
  isSingleWord: 0.88
  isCJK:        0.90
  else:         0.92
```

### Post-render shrink

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

### `applyScrapScale(frames, scaleUnits)` — **[CODE CHANGE REQUIRED]**

Constant-px inflation: each frame grows by `scaleUnits` on every side.

```
for each frame f:
  f.x -= scaleUnits
  f.y -= scaleUnits
  f.w += 2 × scaleUnits
  f.h += 2 × scaleUnits
```

`scaleUnits` is computed from the `Scrap Scale` slider: `scaleUnits = min(NW, NH) × scrapScalePct / 100`, so the slider (0–10%) already normalizes to canvas size. No additional per-frame scaling.

Rationale: the 0422-1 implementation was multiplicative (`grow = 1 + (scaleUnits/smallestFrameDim) × 2`), which made large frames grow up to 10× more than small ones and caused severe layout distortion at higher slider values. Constant-px inflation keeps all frames growing by the same absolute amount, matching the slider's intent of "nudge scraps into slight overlap."

### `applyTightness(frames, tightUnits, NW, NH)`

Proportional pull toward canvas center, followed by re-expansion to preserve the original bbox extent. This is the 0422-1 code behavior, formalized here as the canonical spec.

```
function applyTightness(frames, tightUnits, NW, NH):
  if frames empty or tightUnits ≤ 0: return frames
  short = min(NW, NH)
  if short ≤ 0: return frames

  shrink    = tightUnits / short
  pullScale = max(0.4, 1 - shrink × 4)     // floor prevents over-collapse
  (cx, cy)  = (NW/2, NH/2)

  origBB = boundingBox(frames)             // capture BEFORE pulling

  // Step 1 — proportional pull toward canvas center
  pulled = []
  for f in frames:
    (fcx, fcy) = center(f)
    newCx = cx + (fcx - cx) × pullScale
    newCy = cy + (fcy - cy) × pullScale
    pulled.push(frame at (newCx, newCy) with f's w, h)

  newBB = boundingBox(pulled)
  if newBB.w < 1 or newBB.h < 1: return pulled

  // Step 2 — re-expand to restore the original bbox extent (positions AND sizes)
  reScale = min(origBB.w / newBB.w, origBB.h / newBB.h)
  if reScale ≤ 1.001: return pulled        // pull was too small to need rescaling

  (ncx, ncy) = center(newBB)
  (ocx, ocy) = center(origBB)

  result = []
  for f in pulled:
    (fcx, fcy) = center(f)
    relX = fcx - ncx
    relY = fcy - ncy
    sCx  = ocx + relX × reScale
    sCy  = ocy + relY × reScale
    result.push(frame at (sCx, sCy) with (f.w × reScale, f.h × reScale))

  return result
```

Rationale: a naive constant-distance pull can let frames near the canvas center overshoot the center axis. Proportional pull (with `pullScale` floor = 0.4) is geometrically stable and never crosses the center. The Step 2 re-expansion uses up the canvas space freed by the pull, so gaps tighten but the overall layout still fills the canvas.

Note: because the pull is proportional to distance-from-center, frames near the center barely move. The slider's visible effect is therefore concentrated on the outermost frames. This is by design.

---

## Retry Loop

If `autoRetry` is on, both engines retry with dispersed seeds until a score threshold is met.

```
originalSeed = input.seed
seed         = originalSeed
tries        = 0
result       = runGA(…, seed) or bestPhyllo(…, seed)       // first attempt at user seed

while autoRetry and tries < maxRetries:
  if result.score × 100 >= minScore: break
  tries += 1
  seed   = retrySeed(originalSeed, tries)                  // splitmix32 dispersion
  result = runGA(…, seed) or bestPhyllo(…, seed)

capHit = autoRetry and tries >= maxRetries and result.score × 100 < minScore
```

Grid and Phyllo have independent retry loops (different retry counts may be reported). Both display a `(cap hit)` marker in the UI when retries reach `maxRetries` without satisfying `minScore`.

Rationale for `retrySeed` over `seed += 1`: with simple `+1` stepping, consecutive user seeds (100, 101, 102) often converge on the same successful retry-found seed — i.e., `seed=100 + 6 retries` lands on the same layout as `seed=101 + 5 retries`. Clicking ◀/▶ in the UI then becomes a no-op. Splitmix32 dispersion of `(originalSeed, tries)` ensures each user seed explores an independent retry trajectory, so ◀/▶ always produces a visible change.

---

## Parameter Reference

### Defaults

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

ratioSearch ─→ runGA (Grid ratio mutation pass)
            → bestPhyllo (per-trial ratio sampling, t>0)
```

---

## Changelog

### 0423-1 (this doc)

Resolves 8 spec↔code discrepancies surfaced by the 0422-1 audit.

**Items requiring code change** (spec is authoritative):

1. **Grid mutation is now compound** (§Grid Layout → Mutation Operators). Every offspring gets one structural tree op, AND an independent per-text-item 50% ratio-resample pass. The 0422-1 code treated them as mutually exclusive and only mutated one text item per offspring — undersearching both spaces.
2. **Phyllo multi-trial early-exit threshold is 0.85** (§Phyllo Layout → Multi-Trial Selector). The 0422-1 code used 0.75, which quit the trial budget once any layout cleared the outer `minScore=70` gate. 0.85 matches the selector's stated purpose of finding the best, not the first acceptable.
3. **`applyScrapScale` is constant-px inflation** (§Post-Processing). The 0422-1 code used multiplicative scaling based on the smallest frame dimension, which caused large frames to grow up to 10× more than small ones at higher slider values.

**Items where spec is updated to match code** (code behavior was correct):

4. **Phyllo Phase 1 area formula** is `(NW - 2·pad) × (NH - 2·pad) × density` (§Phyllo Layout → Phase 1). 0422-1 spec used `NW × NH × density × (1 - 2·pad/min)²`, which under-allocates by ~10% on non-square canvases (the short-edge pad fraction was incorrectly applied to the long axis).
5. **Phyllo `trialSeed = seed × 1000 + t × 7 + 1`** (§Phyllo Layout → Multi-Trial Selector). 0422-1 spec used `seed + trial × 17`, which could make `user_seed=A, trial=1` collide with `user_seed=A+17, trial=0`.
6. **Phyllo `t=0` anchors on `ti.ratio`** (§Phyllo Layout → Multi-Trial Selector). 0422-1 spec resampled on every trial, losing the deterministic best-guess baseline.
7. **Retry loop uses `retrySeed(originalSeed, tries)`** (§Retry Loop) — splitmix32 dispersion instead of `seed += 1`. Prevents consecutive user seeds from converging on the same retry-found seed (which made UI ◀/▶ a no-op in some cases).
8. **`applyTightness` is proportional pull + re-expand** (§Post-Processing). 0422-1 spec described a constant-distance pull that could overshoot canvas center for near-center frames; the proportional form is geometrically stable. Formalized Step 2's re-expansion so that gaps tighten without shrinking the overall bbox.

### 0422-1 (prior)

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
- Phyllo canvas-fill: seed ellipse `aW×0.42/aH×0.42`, stronger expansion for under-filled axes, asymmetric gravity, new `axisFill` scoring factor.
- Defaults: italic off, mono, bold, line-height 1.4.

### v6.3

- Adaptive font-aware safety factor (`fontOvershoot`).
- PadX/PadY split into separate parameters.
- Single-useLayoutEffect shrink loop with direct DOM mutation.
- Long-text ratio fix: wrap branch no longer produces 6:1 strips.
