# Spec: Layout Text-Scrap Demo Web (v9.2)

> Status: **COMPLETE** — 2026-04-22
>
> **Archived 2026-04-22.** All phases shipped and verified.
>
> Implemented: v9 engine (`src/engine/v9/` — types, shared, text, items, grid, phyllo, layout), normalized 1000-unit coordinate space, text-scrap items (single + paired), dual-canvas Playground and Upload (`DualCanvasView`), `ParameterPanelV9` with four collapsible groups, `TextLogicExplainer` (4 sub-blocks + LiveTextDemo), `PipelineFlowchart` (vertical step-by-step with concrete examples), `AnimatedDemoV9` (cycles Grid ↔ Phyllo, respects `prefers-reduced-motion`), `HeroSectionV9`, `AlgorithmIntroV9`, `VersionSwitcher`, `/v3` default route, `/v2` classic preserved.
>
> Verification: `pnpm test` 37/37 · `tsc --noEmit` 0 errors · `pnpm build` static 4 routes.
>
> Deviations from spec: route names settled as `/v2` / `/v3` (not `/classic`), per Decision §1. `PipelineFlowchart` implemented as vertical step list with concrete data examples rather than horizontal SVG fork diagram — more readable at narrow widths and communicates the algorithm more clearly.

> Status: **PROPOSED** — 2026-04-22
>
> Builds on `openspec/specs/layout-demo-web.md`. Introduces first-class text scraps into the Grid + Phyllo engines, a normalized-coordinate architecture, and a new default landing page. The previous image-only v2 implementation is preserved as a `/classic` route reachable via a top-right toggle.
>
> Authoritative algorithm reference: `spec/auto-layout-text-spec-0422-1.md`.
> Authoritative code reference: `spec/text-scrap-v9-2.jsx`.

---

## Problem

The shipped layout engine (`openspec/specs/layout-demo-web.md`, v2) arranges only images. The algorithm has evolved to v9.2, which adds:

1. **Text-scrap layout** — text items participate in Grid / Phyllo as first-class items, with their own ratio ranges, min/max area constraints, and scoring penalties (`tB` / `ts`).
2. **Normalized 1000-unit canvas** — all layout computation happens in device-independent coordinates. Identical seed + settings now produce identical layouts on any display size. The v2 engines use raw display pixels, so thresholds (fs floors, minArea caps, row-count decisions) are currently coupled to screen size.
3. **Scoring / default tweaks** — Grid `am` multiplier 0.8→1.0, `idealMax` floor 3→2, weight rebalance; single-row text ratio tightened to [3.5, 4.5]; new `maxFS` / `maxArea` short-text controls; `ratioMode` default `wide`, `ratioSearch` on, italic on, `textBoxSize` 1.10.

The user wants the v9.2 behaviour without destroying v2. Two pages, with v9.2 as default and v2 reachable via a top-right page switcher. The new page must **explain** the text logic with diagrams and dynamic demos (not just run the algorithm), expose the new parameters as sliders (grouped, with advanced presets collapsed), and show **Grid and Phyllo results side-by-side** in both Playground and "Try With Your Photos". Hard-coded display-pixel thresholds in the reference `.jsx` must be translated to the normalized space correctly so behaviour does not drift across viewport sizes.

---

## Solution

### High-level architecture

```
/                → NEW (default) — v9.2 engines + text scraps + side-by-side Grid/Phyllo
/classic         → EXISTING — v2 engines, image-only, unchanged except for route move
VersionSwitcher  → top-right fixed element on both pages; links "New ↔ Classic"
```

- **Engine V2 is preserved intact** at `src/engine/grid.ts`, `src/engine/phyllo.ts`, `src/engine/shared.ts`, `src/engine/types.ts`. The classic page imports from these files unchanged.
- **Engine V9 is added** as parallel modules under `src/engine/v9/` (`grid.ts`, `phyllo.ts`, `shared.ts`, `text.ts`, `types.ts`). The new page imports only from `v9/`. This isolation prevents cross-contamination and means the classic route is provably unaffected.
- **v9 engines operate in normalized 1000-unit coordinates**. The renderer (`CanvasViewV9`) receives `frames + NW + NH + displayW + displayH` and computes `sc = min(displayW/NW, displayH/NH)` for display. Every threshold in v9 (fs floors, minArea, scrap scale caps, rotation noise frequency, etc.) is expressed in normalized units — **never** display pixels.

### New page layout (`/`)

Sections, in order:

1. **Hero** — reuse `HeroSection` visual language. Replace animated demo with an **`AnimatedDemoV9`** that cycles Grid ↔ Phyllo showing a mix of photos + a single short text + a single long text. Headline copy updated to mention text layout.
2. **Algorithm Intro (revised)** — existing two-card layout (Grid / Phyllo), but descriptions updated to name text support. Each card's mini-preview is pre-computed with text items so the cards themselves demonstrate the capability.
3. **Text Logic Explainer** *(new section)* — four sub-parts (see "Text Logic Explainer content" below): classification, ratio decision, min/max area, scoring penalties. Each with SVG diagrams + one interactive `LiveTextDemo` block.
4. **Pipeline Flowchart** *(new section)* — SVG/CSS flowchart of the v9 pipeline (genItems → runGA / bestPhyllo → post-processing → render). Hover a node to highlight which code file it corresponds to.
5. **Playground** — side-by-side dual canvas (Grid left, Phyllo right). Shared parameter panel. Both canvases re-run on every change. Shared seed + shuffle. Text inputs: textarea + type (single / paired) + up to 4 scraps.
6. **Try With Your Photos** — same side-by-side layout. Drop-zone + thumbnail row for images, plus the same text-scrap editor from Playground.
7. **Footer** — unchanged.

### Top-right version switcher

A small client component `VersionSwitcher` rendered via `src/app/layout.tsx` as a `<Link>` pair (`New` / `Classic`) pinned `fixed top-4 right-4 z-50`. It reads the current pathname (via `usePathname`) and highlights the active route. On mobile (< 640px) it collapses to a single-char toggle to conserve space. It is the only UI element shared across `/` and `/classic`.

### Parameter panel grouping

Replace the flat `ParameterPanel` with `ParameterPanelV9` organized into **four collapsible groups** (using `<details>` / `<summary>` — no dependency). Groups 1–3 default open; group 4 default closed.

1. **Canvas & Content** (always open) — canvas ratio, background, image set, image count, text scraps editor.
2. **Layout** (always open) — gap %, padding %, scrap scale %, tightness %, border, shadow opacity.
3. **Text Ratio** (always open) — `ratioMode` segmented (auto / wide / square / tall), `ratioSearch` switch, `textBoxSize`, `minFS`, `maxFS`.
4. **Advanced** (default closed) — grid: `sizeVar`. phyllo: `sizeVar`, `rotation`, `density`, `phylloTrials`. engine: GA `population`, `generations` (read-only display unless toggled). retry: `autoRetry`, `minScore`, `maxRetries`.

### Side-by-side dual canvas

Inside `Playground` and `UploadSection` new component `DualCanvasView` renders two `CanvasViewV9` side-by-side (stacked on mobile < 768px). Each canvas has its own label ("Grid" / "Phyllo"), its own `StatsBar`, and runs its own layout. Shuffling / parameter changes drive both synchronously.

### Key risk surfaced up-front: px → normalized unit translation

The v9.2 spec says numbers like `targetFS = 14`, `fsFloorBase = 14/18`, `GAP = padY * 0.3` are in normalized 1000-unit space. The reference `.jsx` passes `canvasW` (in display px at whatever size the parent chose, commonly 560) into `genItems`, `isSingleRowPreferred`, etc. In our implementation these functions receive `NW = 1000` (or whatever the canvasRatio yields), not display pixels. Implementation notes flag every call site that needs this translation.

A few v9.2 reference constants are display-pixel based and **must not be copied verbatim** — see "Normalization Checklist" under Implementation Plan → Phase 1.

---

## Implementation Plan

### Phase 0 — Routing & Switcher

1. **Move existing page to `/classic`**
   - Create `src/app/classic/page.tsx` — `'use client'` shell that renders current sections (`HeroSection`, `AlgorithmIntro`, `Playground`, `UploadSection`, `Footer`). Copy the content of `src/app/page.tsx` verbatim.
   - Leave `src/app/page.tsx` in place temporarily; it is overwritten in Phase 5.
2. **Add `VersionSwitcher`**
   - `src/components/VersionSwitcher.tsx` — client component using `next/navigation`'s `usePathname`. Two-pill toggle: "New" (→ `/`) and "Classic" (→ `/classic`). Styling consistent with `ModeSwitch` (pill group, same radius, active pill uses `--text-primary` bg + `--bg` text, inactive transparent). Mobile `< 640px`: render as two 32×32 icon buttons (`◆` new / `◇` classic).
   - Mount in `src/app/layout.tsx`, rendered inside `<body>` after `{children}` so it paints on top of all content. Position `fixed top-[var(--sp-4)] right-[var(--sp-4)] z-50`.
3. **Smoke-test** both routes load, switcher highlights correctly.

### Phase 1 — v9 engines (pure logic, no UI)

Create `src/engine/v9/` and implement the algorithm per `spec/auto-layout-text-spec-0422-1.md`. Do **not** copy the `.jsx` verbatim — retype as TypeScript with correct normalized-space semantics.

4. **`src/engine/v9/types.ts`**

   ```ts
   export interface NormalizedCanvas { NW: number; NH: number; }

   export interface ImageItem {
     id: string;
     ratio: number;
     label: string;
     hue: number;
     isText: false;
   }
   export interface TextItemSingle {
     id: string;
     ratio: number;
     label: string;
     hue: 0;
     isText: true;
     isPaired: false;
     text: string;
     minArea: number;  // 0 if short
     maxArea: number;  // 0 if long
   }
   export interface TextItemPaired {
     id: string;
     ratio: number;
     label: string;
     hue: 0;
     isText: true;
     isPaired: true;
     text: string;       // title (mirrors reference code)
     subtitle: string;
     minArea: number;
     maxArea: 0;
   }
   export type Item = ImageItem | TextItemSingle | TextItemPaired;

   export interface Frame {
     id: string;
     x: number; y: number; w: number; h: number;   // NORMALIZED
     rot?: number;                                   // degrees; 0 for text
     item: Item;                                     // carried through
   }

   export type RatioMode = 'auto' | 'wide' | 'square' | 'tall';

   export interface TextRenderOpts {
     padFractionX: number;
     padFractionY: number;
     lineHeight: number;
     fontFamily: 'serif' | 'sans' | 'mono';
     italic: boolean;
     textBoxSize: number;
     minFS: number;
     maxFS: number;
   }

   export interface TextScrapInput {
     isPaired: boolean;
     text: string;          // single text OR paired title
     title?: string;
     subtitle?: string;
   }
   ```

5. **`src/engine/v9/shared.ts`** — port from v2 + reference:
   - `rng32`, `createPerlin`, `rectDist`, `boundingBox`, `countOverlaps`, `nearestNeighborDist` (same shapes as v2 but operate on v9 `Frame` which uses `w/h` not `width/height`).
   - `normalizedCanvas(ratio)` — returns `{ NW, NH }` per the rule in the spec (landscape/square: NW=1000; portrait: NH=1000).
   - `applyScrapScale(frames, scalePx)` and `applyTightness(frames, tightPx, NW, NH)` — both take `scalePx`/`tightPx` in **normalized units** (caller translates `pct → units` as `min(NW,NH) * pct / 100`).

6. **`src/engine/v9/text.ts`** — text-specific helpers:
   - `estimateTextLayout(text, boxW, boxH, opts)` — same algorithm as reference lines 40–105, but **`boxW`/`boxH` are normalized units**. Font-size return value is also in normalized units. `opts.padFractionX`/`padFractionY` are fractions (0–1). The `padX = max(3, boxW * (padFractionX + glyphExtraX))` **must be rewritten as `padX = max(3, boxW * (padFractionX + glyphExtraX))` with the `max(3, ...)` interpreted as 3 normalized units** (~1.7 px on a 560-px canvas) — this is tiny but consistent. Document this on the function.
   - `estimatePairedLayout` — same semantics, normalized units.
   - `isSingleRowPreferred(text, canvasW, minFS)` — `canvasW = NW` (normalized); `minFS` default 36 but see `textPreferredRatio`'s interaction.
   - `textPreferredRatio`, `pairedPreferredRatio` — as spec.
   - `textRatioRange`, `sampleTextRatio`, `mutateRatio` — as spec.
   - `fontOvershoot`, `CHAR_W` — constants identical to reference.

7. **`src/engine/v9/items.ts`** — `genItems(imgCount, textScraps, ratioMode, seed, setId, NW, minFS, textBoxSize): Item[]`
   - Combines `IMG_SETS` weighted ratio draws + text scraps into unified `Item[]`.
   - Move `IMG_SETS` + `RATIO_POOLS` + `HUES` from the reference into `src/data/v9/imageSets.ts` (new file). Preserve the 10 presets verbatim.
   - Image IDs are `img-0`…`img-(n-1)`; text IDs are `txt-0`…. These IDs flow through frames unchanged so the renderer can map back to uploaded photo sources.
   - `minArea` / `maxArea` computed using normalized `targetFS = 14` (long) / `28` (short), `lhRef = 2.0`, `charWF = 0.55` — all constants normalized. Do **not** multiply by any display-pixel factor.

8. **`src/engine/v9/grid.ts`** — GA pipeline:
   - Tree mutations (flipCut 40% / swapLeaves 30% / restructure 30%) — port verbatim from v2 `grid.ts` (structure is identical).
   - Add `textRatios: Record<string, number>` to genome; mutation: when text items exist and `enableRatioMutation`, 30% chance to resample a text's ratio from `textRatioRange`, 70% tree mutation.
   - `treeToRows`, `treeAreas`, `compSizes`, `layoutGrid`, `scaleUp` — port from reference lines 366–370; coordinate space is **normalized**.
   - **`rowScore`** with new text-block factor `tB` per spec §Grid Layout → Scoring. Weights v9.2: `gs^0.13 × fl^0.15 × co^0.05 × am^0.15 × rwS^0.13 × aOK^0.09 × rcOK^0.13 × tB^0.17`. `am` multiplier 1.0 (not 0.8). `idealMax` floor 2.
   - `runGA(items, NW, NH, gap, pad, seed, tOpts, ratioMode, enableRatioMutation, minFS)` — returns `{ frames, textRatios, score }`, frames in normalized space.

9. **`src/engine/v9/phyllo.ts`** — spiral + solver:
   - `phylloLayout`, `scorePhyllo`, `bestPhyllo` — port from reference lines 568–660.
   - minArea boost (v7) — must run on `areas[]` before elliptical placement. Floor `max(0.3, ...)` on non-text scale.
   - Constraint solver phases 4a–4f with normalized-space constants. All strengths verbatim (0.55, 0.035, 0.012, 0.006, 0.015). Gravity anisotropy `cr<1 ? 1.1 : 0.7` per spec.
   - Rotation: freq 0.007 (in normalized units — means 0.007 per normalized unit). Text items get `rot = 0` explicitly.
   - `scorePhyllo`: `am^0.10 × cov^0.15 × axisFill^0.08 × co^0.30 × gh2^0.17 × ts^0.20`. Overlap disqualifier returns `-overlapCount`.

10. **`src/engine/v9/layout.ts`** (wrapper) — public API:

    ```ts
    export interface LayoutV9Input {
      items: Item[];
      canvasRatio: number;           // e.g. 16/9
      gapPct: number;                // 0-8
      padPct: number;                // 2-12
      seed: number;
      ratioMode: RatioMode;
      ratioSearch: boolean;
      tOpts: TextRenderOpts;
      gridOpts?: { sizeVar: number };
      phylloOpts?: { sizeVar: number; rotation: number; density: number; trials: number };
      postProc?: { scrapScalePct: number; tightnessPct: number };
      retry?: { enabled: boolean; minScore: number; maxRetries: number };
    }
    export interface LayoutV9Result {
      NW: number; NH: number;
      frames: Frame[];
      score: number;
      retries: number;
      capHit: boolean;
    }
    export function runGridV9(input: LayoutV9Input): LayoutV9Result;
    export function runPhylloV9(input: LayoutV9Input): LayoutV9Result;
    ```

    Both wrappers: resolve `NW/NH`, convert `gapPct/padPct → gap/pad units`, run retry loop (spec §Retry Loop), apply `applyScrapScale` then `applyTightness`, return result.

11. **Unit tests** `src/__tests__/engine-v9.test.ts`:
    - Normalized determinism: same seed + same inputs → same `frames` (deep-equal within 1e-9).
    - Device independence: running with `canvasRatio = 16/9` yields frames with coordinates in `[0, 1000] × [0, ~562]`. No frame `x+w > NW + 0.01`.
    - Text: a single-word text on wide canvas produces a `ratio ∈ [3.5, 4.5]` frame when `ratioMode='auto'` and `isSingleRowPreferred` is true.
    - Text: a 28-word paragraph gets `minArea > 0` and Phyllo raises its allocation to ≥ `minArea` (other items compress, floor 0.3).
    - Scoring: `rowScore` weights sum to 1.00 in the exponent; `scorePhyllo` overlap disqualifier returns negative.
    - Retry loop terminates at `maxRetries` with `capHit=true`.

#### Normalization Checklist (Phase 1)

These reference-code values are display-pixel artefacts. Do **not** copy verbatim.

| Reference | Treatment in v9 engine |
|---|---|
| `padX = max(3, boxW * fraction)` | Keep `3` as 3 normalized units. Tiny at 1000u, ≈ 1.7px display on a 560-canvas. Acceptable. |
| `canvasW` default 800 in `textPreferredRatio`, `isSingleRowPreferred`, etc. | Remove defaults — callers always pass `NW`. If a default is unavoidable, use `1000`. |
| `minFS` default `36` inside engine helpers | Remove — always pass from `tOpts.minFS`. Default *user-slider* value is `0` per spec §Defaults. |
| `shortEdge = min(cw, ch)` in `applyScrapScale` / `applyTightness` | Now `min(NW, NH)`. The caller computes `scalePx` from `shortEdge * scrapScalePct / 100`. |
| Perlin freq `0.007` | Keep. Freq × normalized coord is dimensionless — 0.007 × 1000 = 7 cells across canvas, same on every display size. |
| Gap `gapPx` in reference scoring | Replace with `gap` (normalized units, from `gapPct * min(NW,NH) / 100`). |
| `postScaleOverlapFix` 1-px hardcoded separation (v2) | v9 does **not** use postScaleOverlapFix. The 300-iter solver's final phase handles overlap convergence. |

### Phase 2 — Text rendering

12. **`src/components/v9/SingleTextScrap.tsx`** and **`PairedTextScrap.tsx`**
    - Ported from reference lines 784–881. Receive `w, h` in **display pixels** (renderer has already scaled). Implement the single `useLayoutEffect` shrink loop with direct DOM mutation (25 iterations, ×0.9 shrink, fs floor 3).
    - Fonts: reuse project's `next/font` variables (`--font-jetbrains` mono, `--font-outfit` sans, `--font-newsreader` serif). The reference `FF` map is replaced with `{ mono: 'var(--font-jetbrains)…', … }`.
    - Colour: text uses `rgba(255,255,255,0.92)` (reference default) when canvas bg is dark, invert to `rgba(0,0,0,0.92)` when canvas bg is light. Detect via `getComputedStyle(parent).background` OR require the parent pass `isDarkBg` — prefer explicit prop to avoid runtime reads.

13. **`src/components/v9/CanvasViewV9.tsx`**
    - Props: `{ frames, NW, NH, maxDisplayW, maxDisplayH, bgColor, borderWidth, shadowOpacity, images?: Record<id, src>, isDarkBg, accentColor, label }`
    - Compute `sc = min(maxDisplayW/NW, maxDisplayH/NH, MAX_DISPLAY)`. Display size `= NW*sc × NH*sc`. Render each frame with `left = frame.x * sc`, `top = frame.y * sc`, `width = frame.w * sc`, `height = frame.h * sc`, `transform: rotate(frame.rot°)`.
    - For `frame.item.isText`, render `<SingleTextScrap>` or `<PairedTextScrap>` inside the frame. Otherwise render `<img>` (uploaded) or coloured placeholder (by `frame.item.hue` + label).
    - Use same transition as v2's `CanvasPreview` (600ms cubic-bezier on left/top/width/height/transform) so parameter changes animate.

### Phase 3 — Text Logic Explainer + Flowchart

14. **`src/components/v9/TextLogicExplainer.tsx`** — the new section (item 3 in page layout). Four sub-blocks, each an `<article>` inside a shared `<section>`:
    - **3.1 Classification** — `isSingleRowPreferred`. Live demo: input box, the string typed inside. Below: a visual that shows `widthInEm * fs * 1.05` vs `canvasW * 0.80` as two horizontal bars. When short → green bar; when long → wrap diagram.
    - **3.2 Ratio decision** — `textPreferredRatio` & `textRatioRange`. Show a number line from 0.4 to 8.0 with the `[lo, hi]` range highlighted and the `base` marker. Type text, pick mode, see the range change.
    - **3.3 Min/Max area** — `genItems` logic. Show two squares sized proportionally to `minArea` and `maxArea` as a fraction of `NW × NH`. Explain text scales to maintain fit.
    - **3.4 Scoring penalties** — `tB` / `ts` penalty factors. Static SVG showing the five penalty conditions: fs<fsFloor, fillBoth<0.4, minArea oversize, maxFS exceeded, maxArea oversize. Each listed with its multiplier.
    - Internal helper `LiveTextDemo` receives `{ text, canvasRatio, minFS, mode }` and renders one Grid + one Phyllo canvas at ~240×160 display px showing the outcome.

15. **`src/components/v9/PipelineFlowchart.tsx`** — static SVG (inline JSX) laid out left-to-right:

    ```
    Inputs → genItems → [GA loop / Phyllo trials] → post-process → render
                           ↓ text: ratio search + tB/ts scoring
    ```

    Each node is `<g>` with hover-highlight. Tooltip on hover naming the source file. Keep it responsive with `viewBox` and `preserveAspectRatio`.

### Phase 4 — Dual Canvas Playground & Upload

16. **`src/components/v9/TextScrapEditor.tsx`**
    - List of 0–4 entries. Each: type toggle (Single / Paired), textarea for text (or two for paired title+subtitle), remove button.
    - "Add text" button disabled at 4 entries.
    - Pre-populated defaults per spec §Defaults: Text A "Hello World!" (single), Text B "Last summer we drove along the coast for three weeks, stopping at every small town. The sunsets were incredible and the memories will stay with us forever." (single). Paired example available via a "Load paired example" link.

17. **`src/components/v9/ParameterPanelV9.tsx`** — four `<details>` groups per "Parameter panel grouping" above. Reuse `SliderRow`. New controls:
    - `RatioModeSegmented` (auto / wide / square / tall) — 4 pill buttons.
    - `ToggleSwitch` for `ratioSearch`, `autoRetry`, `italic`.
    - Font family selector (mono / sans / serif) — 3 pills.
    - All sliders' min/max/default per spec §Parameter Reference. Values in the panel are **user units** (percent, normalized fs, etc.); translation to engine inputs happens in the page.

18. **`src/components/v9/DualCanvasView.tsx`**
    - Renders two `CanvasViewV9` side-by-side, each with its own label + `StatsBarV9`.
    - Mobile (< 768px): stack vertically, canvases go full-width.
    - Both canvases receive the same `items`, but one runs through `runGridV9`, the other through `runPhylloV9`. Both engines compute in parallel via two `useMemo`s keyed on the same inputs.

19. **`src/components/v9/StatsBarV9.tsx`** — like v2's `StatsBar`, plus a small "Text OK?" indicator summing the `tB` / `ts` factor (green if ≥ 0.9, yellow 0.5–0.9, red < 0.5).

20. **`src/components/v9/PlaygroundV9.tsx`**
    - State: `mode (unused for toggle, since we show both)`, `seed`, `params`, `bgColor`, `textScraps[]`.
    - Produce `items` via `genItems(...)` memoized on the inputs above.
    - Two `runGridV9 / runPhylloV9` calls for each render (debounced 100ms per v2 pattern).
    - Layout: ParameterPanelV9 (left, 380px) + (DualCanvasView + StatsBars + SeedControls + ShuffleButton) (right, flex-1). On mobile: stacked, dual canvas first.

21. **`src/components/v9/UploadSectionV9.tsx`**
    - Reuse `DropZone`, `ThumbnailRow` (port to v9 only if interface changes — currently they return `{id, src, aspectRatio, filename}` which is compatible).
    - Build `ImageItem[]` from uploaded photos; merge with text scraps into `items`; feed to `DualCanvasView`.
    - Photo-count hint + text-scraps editor below the thumbnail row.

### Phase 5 — New page assembly

22. **Update `src/app/page.tsx`**
    - Replace current content with:
      ```tsx
      'use client';
      import HeroSection from '../components/v9/HeroSectionV9';
      import AlgorithmIntroV9 from '../components/v9/AlgorithmIntroV9';
      import TextLogicExplainer from '../components/v9/TextLogicExplainer';
      import PipelineFlowchart from '../components/v9/PipelineFlowchart';
      import PlaygroundV9 from '../components/v9/PlaygroundV9';
      import UploadSectionV9 from '../components/v9/UploadSectionV9';
      import Footer from '../components/Footer';
      // IntersectionObserver fade-in wrapper identical to /classic
      ```
    - 7 fade-in sections: Hero → AlgorithmIntroV9 → TextLogicExplainer → PipelineFlowchart → PlaygroundV9 → UploadSectionV9 → Footer.

23. **`HeroSectionV9`** — clones `HeroSection` but swaps `AnimatedDemo` for `AnimatedDemoV9` (photos + 2 texts, cycles Grid / Phyllo every 3s). Headline sub-copy: "Photos and words, automatically arranged." (One short line — do not pad.)

24. **`AlgorithmIntroV9`** — clones `AlgorithmIntro` / `AlgorithmCard`. Mini previews compute v9 layouts with 3 images + 1 short text. Tags updated: Grid gains "Text-aware rows"; Phyllo gains "Text-aware spiral".

### Phase 6 — Design pass

Apply design skills per CLAUDE-design.md. Specifically:

25. `/high-end-visual-design` — pass over `TextLogicExplainer` and `PipelineFlowchart`. Ensure:
    - No emoji, no stock icons. Use existing type hierarchy (`--text-display`, `--text-h2`, etc.).
    - Diagrams use `var(--accent-grid)` / `var(--accent-phyllo)` / `var(--text-tertiary)` — no ad-hoc hex.
    - Paper-edge borders on explainer sub-cards (`1px rgba(0,0,0,0.06)`).
    - Avoid "AI slop": no gradient backgrounds, no decorative pills, no left-accent-stripe cards.

26. `/design-review` on live URLs `/` and `/classic` — visual QA: spacing rhythm, hover states, keyboard focus rings on new controls, reduced-motion support on flowchart / animated demo, dark-bg text legibility in dual canvases.

### Phase 7 — Verification & DEVLOG

27. **Verification flow** (TESTING.md):
    - `pnpm test` — unit suite + new engine-v9 tests green.
    - `npx tsc --noEmit` — zero TypeScript errors. v9 types strict; no `any`.
    - `pnpm build` — production build succeeds.
    - Smoke: open `/` and `/classic`, switch via VersionSwitcher, verify:
      - `/classic` renders identically to the prior implementation (no regression).
      - `/` renders Hero + Intro + TextLogicExplainer + PipelineFlowchart + Playground + Upload + Footer.
      - Playground: change each slider; both Grid and Phyllo canvases update within ~150ms.
      - Playground: add/remove text scraps, toggle paired; canvases reflect change.
      - Upload: drop 3 photos + 2 texts, shuffle, verify both engines handle mixed items.
      - Mobile (375px): side-by-side canvases stack; version switcher collapses to icons.
    - `/qa` skill on `/` for a shippable bug sweep.

28. **Append to DEVLOG.md** — date-headed entry summarising:
    - Routing change (new default + `/classic`).
    - v9 engine module addition (not a replacement).
    - Normalized 1000-unit coordinate adoption — flag as the key architectural decision.
    - New text-scrap items + scoring weights.
    - New sections (Explainer, Flowchart) and dual-canvas layout.

---

## Data Model Changes

No database changes. All state is client-side React. New TypeScript types listed under Phase 1 / `src/engine/v9/types.ts`.

New component state (`PlaygroundV9`):

```ts
interface V9PageState {
  seed: number;
  bgColor: string;
  canvasRatio: CanvasRatioKey;
  imgSet: ImageSetKey;
  imgCount: number;
  textScraps: TextScrapInput[];          // 0–4 entries
  params: V9Params;                      // see Parameter Reference
}
```

`V9Params` maps 1:1 to the spec §Parameter Reference; no additional state.

No changes to `Frame` shape at a whole-app level — v2 `Frame` remains untouched (it uses `width/height`); v9 `Frame` uses `w/h` for consistency with the reference code. Renderers are module-scoped, so the two shapes never mix.

---

## Testing Plan

### Unit (`src/__tests__/engine-v9.test.ts`)

| Test | Verifies |
|---|---|
| Determinism on random inputs (10 seeds × 5 configs) | Same inputs → identical frames |
| Device independence | Output unchanged across simulated `maxDisplayW = 400 / 800 / 1400` (since engine never sees display px, these must not enter the pipeline) |
| Short-text single-row: `ratio ∈ [3.5, 4.5]` | Ratio tightening fix |
| Long-text paragraph: `minArea > 0` and Phyllo respects it | v7 boost logic |
| Grid weights sum to 1.00 in exponents | Scoring rebalance |
| Grid `idealMax` = 2 for `n=5` on `9:16` | Floor change |
| Phyllo overlap disqualifier returns negative | Hard disqualification |
| Retry loop: `capHit` after `maxRetries` | Retry contract |
| `applyScrapScale` / `applyTightness` round-trip at 0% | Identity at zero |

### Integration (`e2e/` via Playwright)

| Test | Verifies |
|---|---|
| `/classic` loads, layout engine renders 7 images, shuffle works | No regression |
| `/` loads, both Grid and Phyllo canvases render with photos + texts | End-to-end v9 pipeline |
| VersionSwitcher toggles route and updates active state | Routing |
| Mobile viewport 375: canvases stack; switcher collapses | Responsive |
| Reduced-motion: animated demo freezes on first frame | A11y |

### Verification flow (TESTING.md)

- `pnpm test`
- `npx tsc --noEmit`
- `pnpm build`
- Manual smoke + `/qa` skill

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Normalization mistakes** — copying a display-px threshold from the reference into the engine | Bug parity with reference, loses device independence | Phase 1 "Normalization Checklist". Unit test that runs the engine with 3 different simulated display sizes (via the wrapper) and asserts identical frames. |
| Two engines run every change in Playground (double cost vs. classic) | Perceived lag on slow devices | Existing 100-ms debounce in v2 is reused. Grid GA at `POP=50, GENS=40` × 2 runs ≈ same wall time as one run (two cores). For n≥10 items, fall back to `POP=30, GENS=25` behind an automatic heuristic. |
| Text rendering post-shrink loop is DOM-mutative | Can fight React re-renders | Reference code solves this via a single `useLayoutEffect` with forced reflow. Port the exact pattern, including the 25-iteration cap and `fs floor = 3`. |
| VersionSwitcher clips over Radix portals or modal content | Fixed-position layering issues | `z-50` only, not 9999. No modals in this app currently. If added later, use a portal stacking context. |
| `ThumbnailRow` / `DropZone` type drift between v2 and v9 | Subtle breakage in `/classic` | Reuse v2 components unchanged in v9 upload section; if v9 needs a different interface, **wrap** rather than modify the v2 file. |
| CLAUDE-design.md warns against "centered hero + gradients" — easy to fall into when adding the Explainer section | Generic AI-UI look | Follow DESIGN.md tokens only. No gradients. No decorative SVG illustrations. Use paper-edge borders (`1px rgba(0,0,0,0.06)`) and type hierarchy for structure. |
| Text content in Chinese (CJK) defaults different from English | Renderer clips or wraps weirdly | Reference `.jsx` handles CJK via `cjkCW` and `isCJK` checks — port verbatim. Test with a CJK text ("夏日海邊的回憶") in unit + smoke tests. |
| GA ratio-mutation makes Grid layouts feel unstable as user types text | Constant re-shuffle during text entry | Debounce text-scrap updates at 300ms (longer than slider debounce). Reseed only on explicit shuffle, not on text change. |

---

## Design Skill Usage

Per CLAUDE-design.md:

- **Before coding**: read `DESIGN.md` tokens, `globals.css`, `AlgorithmCard.tsx`, `ParameterPanel.tsx`. The existing v2 components are the design system for v9 — v9 layers do not invent new tokens.
- **During Explainer / Flowchart work**: invoke `/high-end-visual-design` once composition is settled. Ask for a critique focused on "does this feel editorial or does it feel generated?"
- **After Phase 5 (assembled pages)**: run `/design-review` on `/` and `/classic`. Then `/qa` for a shippable bug sweep.
- **Not applicable**: `/stitch-design-taste` (would overwrite DESIGN.md), `/redesign-existing-projects` (scope is additive, not a redesign).

---

## Decisions (confirmed 2026-04-22)

1. **Route names**: `/v2/` (classic shipped) and `/v3/` (new default, text-aware). `/` redirects to `/v3`. Future versions follow `/v4/`, `/v5/` …
2. **Switcher copy**: uppercase "V2" / "V3" pills (also numeric-scalable). Mobile collapses to number-only (`2` / `3`) in a 32×32 pill.
3. **Text-scrap cap**: 3 entries max.
4. **Default text scraps**: greeting-related copy.
   - Text A (single): `"Good morning!"`
   - Text B (single, longer): `"Wishing you a day full of warmth, laughter, and small moments of joy. May every step feel lighter and every smile last a little longer."`
   - Paired example (opt-in): title `"Hello, friend"`, subtitle `"A little note to brighten your day."`
5. **Dual canvas**: always both Grid + Phyllo; no single-canvas fallback.
6. **DEVLOG**: one entry appended after Phase 7 verification passes.

---

**Approved.** Proceeding to `/opsx:apply`.
