# Layout Web

An interactive playground for two auto-layout algorithms — **Grid** (BSP tree + genetic search) and **Phyllo** (golden-angle spiral + physics solver) — that arrange images and text scraps on a canvas. Built with Next.js 16, React 19, and Tailwind v4.

The goal of this repo is to evaluate and iterate on layout algorithms that can produce collage-like compositions deterministically from a small set of inputs (items + canvas ratio + seed).

```
pnpm install
pnpm dev            # http://localhost:3000 → redirects to /v2-5
pnpm test           # vitest unit tests
pnpm build          # production build
```

Routes: `/v2-5` is the current version. `/v1` and `/v2` are kept for A/B comparison.

---

## 1. Problem Statement

Given:

- A set of **items** — images (with an aspect ratio) and/or text scraps (with min/max area constraints).
- A **canvas ratio** (e.g. 16:9, 1:1, 9:16).
- A **seed** and a handful of knobs (gap, padding, size variance, …).

Produce:

- A set of **frames** `{ x, y, w, h, rot }` placed inside the canvas, with **no overlap** (pre–post-processing), aesthetically distributed.
- The same inputs must yield the same output across devices (determinism), and the layout must be resolution-independent.

Both algorithms return a `LayoutV9Result` scored in `[0, 1]`. The orchestrator retries with reseeded RNGs until the score clears `minScore` (default 70) or the retry cap is hit.

---

## 2. Normalized Coordinate Space

All geometry is computed in a **1000-unit normalized canvas** (`NW × NH`, short edge = 1000). The display layer scales to the container size.

```ts
// src/engine/v9_5/types.ts
export interface NormalizedCanvas { NW: number; NH: number; }
```

Why: device-independent thresholds (font sizes, gaps, padding) — the same seed produces pixel-identical frames on mobile and desktop. `gapPct` and `padPct` are expressed as percentages of the short edge and converted to units via `pctToUnits()` in `layout.ts`.

### Items

```ts
type Item = ImageItem | TextItem;            // see types.ts
interface ImageItem     { id; ratio; label; hue; isText: false; }
interface TextItemSingle{ id; ratio; label; isText: true; isPaired: false;
                          text; minArea; maxArea; }
interface TextItemPaired{ id; ratio; label; isText: true; isPaired: true;
                          text; subtitle; }
```

Text scraps are **first-class layout units**: they come with `minArea`/`maxArea` bounds derived from `estimateTextLayout()` in `text.ts`, and both scoring functions penalise layouts that break those bounds or push font size below `minFS`.

### Frame (output)

```ts
interface Frame { id; x; y; w; h; rot?; item; }
```

---

## 3. Grid Algorithm

Source: `src/engine/v9_5/grid.ts`.

**Core idea.** Represent the layout as a **binary space-partition (BSP) tree**. Leaves are items; internal nodes are cuts (`H` = horizontal cut that splits rows, `V` = vertical cut that places items side-by-side in one row). A **genetic algorithm** evolves the tree (and per-text-item ratio overrides) to maximise a composite score.

### 3.1 Tree → Rows → Coordinates

1. **`treeToRows(tree)`** — traverse the tree: `V` nodes flatten into a single row of leaves; `H` nodes concatenate rows from their children.
2. **`treeAreas(tree, total)`** — bottom-up, allocate canvas area to subtrees. `V` cut: sum of child areas. `H` cut: harmonic combination (each child gets area proportional to its shape/ratio).
3. **`layoutGrid(rows, areas, NW, NH, gap, pad)`** — per-row justification that preserves each leaf's aspect ratio while stretching the row to fill its allotted width. Rows are stacked vertically with `gap` between them, then the whole group is centered with `pad` inset.

### 3.2 Genome

```ts
interface Genome {
  tree: TreeNode;
  textRatios: Record<string, number>;   // per-text-item ratio override
}
```

### 3.3 Mutation (spec 0423-1, v9.5)

Every offspring goes through **two independent steps**:

1. **Structural mutation** — always pick one of:
   - `flipCut` (40%) — toggle a node's cut direction (H ↔ V).
   - `swapLeaves` (30%) — swap two leaves.
   - `restructure` (30%) — Fisher-Yates shuffle the leaves under a subtree and rebuild it.
2. **Ratio mutation** — when `ratioSearch = on`, each text item has an independent **50% chance** to resample its ratio from `textRatioRange(item)`.

> v9 used to make these mutually exclusive (pick *either* a tree op *or* a ratio resample). v9.5 makes them independent, which roughly doubles the effective search volume of both spaces. See DEVLOG 2026-04-23.

### 3.4 GA Loop (`runGA`)

- Population: **50**, generations: **40**.
- Selection: top **30%** survive; breed offspring via mutation until the population is refilled.
- Retry: if best score × 100 < `minScore` (default 70), `runGridV9` reseeds via `retrySeed()` (splitmix32 dispersion) and reruns — up to `maxRetries` (default 60).

### 3.5 Grid Score (`rowScore`, multiplicative, weights sum to 1.00)

| Factor | Weight | Meaning |
| --- | --- | --- |
| `gs`   | 0.13 | Gap smoothness — RMS deviation of nearest-neighbour gaps from the target |
| `fl`   | 0.15 | Fill — bounding-box area / canvas area |
| `co`   | 0.05 | Compactness — content area / bounding-box area |
| `am`   | 0.15 | Aspect match — penalty when layout aspect ≠ canvas aspect |
| `rwS`  | 0.13 | Row-width similarity — `min/max` row width (favours uniform rows) |
| `aOK`  | 0.09 | Area parity — penalty when `max/min` frame area > 3 |
| `rcOK` | 0.13 | Row-count ceiling — penalty when frames per row exceed `idealMax` |
| `tB`   | 0.17 | Text-block penalties (font-size floor, fill fraction, min/max area bounds) |

---

## 4. Phyllo Algorithm

Source: `src/engine/v9_5/phyllo.ts`.

**Core idea.** Seed items along an elliptical **golden-angle (phyllotaxis)** spiral, then run a 300-iteration **physics solver** that repels overlaps, applies gravity to the centre, enforces a target gap, matches the canvas aspect, and clamps to the boundary. Finally, a Perlin-noise pass applies a small aesthetic rotation.

### 4.1 Area allocation & size hierarchy

```
areas[rank] = baseArea × (1 + sizeVar × (1 − rank / n))
```

Higher-ranked items (earlier in a shuffled order) get more area. Text items whose allocated area falls below `minArea` are boosted; the deficit is taken from non-text items proportionally.

### 4.2 Golden-angle seed placement (Vogel spiral)

```
PHI     = (1 + √5) / 2                 // golden ratio
GOLDEN  = 2π / PHI²                    // ≈ 137.5° — the golden angle
angle_i = i · GOLDEN + noise
t_i     = √(i / n)                     // radial normalisation
x_i     = cx + eRx · t_i · cos(angle_i)
y_i     = cy + eRy · t_i · sin(angle_i)
```

Ellipse radii: `eRx = aW · 0.42`, `eRy = aH · 0.42` (aW/aH are the padded available dims). Vogel placement gives quasi-uniform coverage on the disk, which is what makes phyllotaxis look organic.

### 4.3 Constraint solver (300 iterations)

Each iteration applies, in order:

1. **Collision resolution** — overlap → push frames apart (decay 0.55).
2. **Gravity** — anisotropic pull toward the canvas centre (decay 0.035 × aspect correction).
3. **Spread** (iter 11–180) — if the group fills less than 75% of the canvas, push frames outward.
4. **Aspect correction** — squeeze/stretch the group if its bounding box drifts > 20% from the canvas aspect.
5. **Gap targeting** (iter > 90) — for each frame, pull its nearest neighbour to the target gap × 1.8.
6. **Boundary clamp** — confine each frame to `[padding, NW − padding] × [padding, NH − padding]`.

Early exit: break if total overlap < 0.1 and iter > 40.

### 4.4 Aesthetic rotation

Rotation is sampled from a cheap Perlin noise field at the frame centre (freq 0.007) and modulated by parity and `opts.rotation`. Text items are always axis-aligned (`rot = 0`).

### 4.5 Multi-Trial Selector (`bestPhyllo`)

Run `trials` independent Phyllo runs with different random seeds and keep the best. **v9.5 raises the early-exit threshold from 0.75 to 0.85** — so the trial budget is actually used to hunt for excellent layouts rather than bailing on merely-passing ones.

### 4.6 Phyllo Score (multiplicative)

| Factor | Weight | Meaning |
| --- | --- | --- |
| `am`       | 0.10 | Aspect match (×1.5 penalty vs. Grid) |
| `cov`      | 0.15 | Canvas coverage (bounding box / canvas) |
| `axisFill` | 0.08 | `min(xFill, yFill)` — punishes one-axis collapse |
| `co`       | 0.30 | Compactness — content / bounding box |
| `gh2`      | 0.17 | Gap homogeneity — coefficient of variation of nearest-neighbour distances |
| `ts`       | 0.20 | Text scoring (same penalties as Grid) |

Any overlap short-circuits the score to `-overlaps` (hard reject).

---

## 5. Post-Processing

Applied after scoring, in `runGridV9` / `runPhylloV9`:

- **`applyScrapScale(frames, scaleUnits)`** — uniformly inflate every frame by `scaleUnits` on all four sides (centre preserved). Produces intentional overlaps for the "scrapbook" look. v9.5 uses **constant-px inflation**; v9's multiplicative form made large frames inflate ~10× more than small ones.
- **`applyTightness(frames, tightUnits, NW, NH)`** — pull every frame toward the centre by `tightUnits`, then re-expand the group to its original bounding box. Net effect: tighter packing without losing coverage.

---

## 6. Shared Utilities (`shared.ts`)

- **`rng32(seed)`** — Weyl-sequence PRNG (`() => [0, 1)`). Deterministic across runtimes.
- **`retrySeed(seed, tries)`** — splitmix32 dispersion used by retry loops so successive reseeds don't cluster.
- **`rectDist(a, b)`** — edge-to-edge rectangle distance.
- **`countOverlaps(frames)`** — pair-wise AABB collision counter.
- **`boundingBox(frames)`**, **`scaleUp(frames, NW, NH, pad)`** — envelope + padding-aware group scaling.
- **`normalizedCanvas(ratio)`** — maps an aspect ratio to `(NW, NH)` with short edge = 1000.

### Determinism note (hydration)

The engines are deterministic *within* a runtime, but SSR (Node) and CSR (V8) can diverge at ULP-level on `Math.log` / `Math.sqrt` / chained products. When two genomes score within ULP distance, sort order flips → downstream selection diverges completely. Hero demos therefore mount-gate with `useEffect(() => setMounted(true), [])` so the GA only runs on the client. See `src/components/v2-5/AnimatedDemoV2_5.tsx`.

---

## 7. Playground (Exposed Knobs)

`/v2-5` exposes (see `src/components/v2-5/PlaygroundV2_5.tsx` + `ParameterPanelV9.tsx`):

- **Mode** — Grid / Phyllo.
- **Canvas ratio** — 16:9, 4:3, 1:1, 3:4, 9:16.
- **Image count** — 3–12.
- **Gap** — 0–8% of short edge (default 4%).
- **Padding** — 2–12% (default 6.5%).
- **Phyllo only** — `sizeVar` (0–1), `rotation` (0–1), `density` (0.3–1), `trials` (4–20, default 10).
- **Post-processing** — `scrapScalePct` (0–10), `tightnessPct` (0–10).
- **Text** — `ratioMode` (auto/wide/square/tall), `ratioSearch` (on/off), `textBoxSize`, `minFS`, `maxFS`, `fontFamily`, `italic`.
- **Cosmetic** — border width, shadow opacity.

`StatsBar` shows live Coverage %, average Gap, Score %, and Overlaps.

---

## 8. Project Layout

```
src/
  engine/
    v9_5/                 # current algorithms (used by /v2-5)
      grid.ts             # BSP + GA
      phyllo.ts           # golden-angle spiral + physics
      layout.ts           # runGridV9 / runPhylloV9 orchestrators
      shared.ts           # RNG, AABB, postproc, normalized canvas
      items.ts            # item generation (presets + uploads)
      text.ts             # font-size estimation + ratio bounds
      types.ts            # Item / Frame / Input / Result
    v9/                   # previous generation (used by /v2)
    {grid,phyllo}.ts      # v1 (used by /v1)
  app/
    v2-5/ · v2/ · v1/     # one route per engine generation
    page.tsx              # redirects to /v2-5
  components/
    v2-5/                 # playground, hero, upload, demos
    VersionSwitcher.tsx   # pill nav between /v1 /v2 /v2-5
  __tests__/
    engine.test.ts        # v1 regression
    engine-v9.test.ts     # v9 parity + determinism
    engine-v9_5.test.ts   # v9.5 mutation + scrapScale + parity
spec/
  auto-layout-text-spec-0423-1.md    # authoritative spec for v9.5
openspec/                            # OpenSpec proposals + archive
DEVLOG.md                            # chronological decisions
DESIGN.md                            # tokens
TESTING.md                           # verification flow
```

---

## 9. Verification

Before merging any algorithm change:

1. `pnpm test` — all unit tests pass.
2. `npx tsc --noEmit` — zero TypeScript errors.
3. `pnpm build` — production build succeeds.
4. Smoke test — open `/v2-5`, exercise Grid + Phyllo in the playground, upload a few photos.

When refactoring the engines, **write tests before changing code.** The v9.5 test suite (`src/__tests__/engine-v9_5.test.ts`) is the template: cross-version parity on image-only inputs, property-level checks for post-processing, and average-score-over-5-seeds for stochastic behaviour.

---

## 10. Where to Start Reading

If you're new to the repo and want to understand the algorithms end-to-end:

1. `src/engine/v9_5/types.ts` — the data model (10 min).
2. `src/engine/v9_5/layout.ts` — the orchestrator (shows how retry + post-proc wrap the engines).
3. `src/engine/v9_5/grid.ts` — start at `runGA`, then `treeToRows` / `treeAreas` / `layoutGrid`, then `rowScore`.
4. `src/engine/v9_5/phyllo.ts` — start at `runPhyllo` (seed placement), then the solver loop, then `scorePhyllo`, then `bestPhyllo`.
5. `src/engine/v9_5/shared.ts` + `text.ts` — utilities and text measurement.
6. `spec/auto-layout-text-spec-0423-1.md` — authoritative spec.
7. `DEVLOG.md` — why the code looks the way it does.
