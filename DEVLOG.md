# Development Log

## 2026-04-23

### V2.5 route — spec 0423-1 alignment

- **New route `/v2-5`**, default landing page (root redirect updated from `/v2` → `/v2-5`). V2 retained for A/B comparison.
- **Parallel engine at `src/engine/v9_5/`** with 3 algorithm corrections:
  1. **Grid compound mutation** (`grid.ts` → `mutateGenome`) — every offspring now gets one tree op AND, when `ratioSearch` is on, an independent 50% per-text-item ratio-resample. Previously these were mutually exclusive, halving effective search of both tree and ratio spaces.
  2. **Phyllo early-exit threshold 0.75 → 0.85** (`phyllo.ts` → `bestPhyllo`) — `phylloTrials` budget is now actually used to hunt for excellence rather than quitting at mediocre scores above the `minScore=70` gate.
  3. **`applyScrapScale` constant-px inflation** (`shared.ts`) — replaces the multiplicative-with-smallest-frame form that made large frames blow up ~10× more than small ones. Each frame now grows by `scaleUnits` on every side uniformly.
- **Component duplication approach** (`src/components/v2-5/*`): copies of the 6 engine-consuming components (`HeroSectionV2_5`, `AnimatedDemoV2_5`, `AlgorithmIntroV2_5`, `TextLogicExplainerV2_5`, `PlaygroundV2_5`, `UploadSectionV2_5`) with imports redirected to `engine/v9_5/`. All non-engine subcomponents (`CanvasViewV9`, `ParameterPanelV9`, `DualCanvasView`, `PipelineFlowchart`, etc.) stay shared between V2 and V2.5.
  Rationale: simpler than an engine-as-prop refactor; V2 is unchanged and zero risk; when V2 is retired, deleting `engine/v9/` + `components/v9/` + `app/v2/` is a mechanical one-PR cleanup.
- **VersionSwitcher** — added V2.5 pill; fixed `startsWith` false-match bug where `/v2-5` would light up both V2 and V2.5 pills. Now uses exact match + trailing-slash comparison.
- **Tests added** at `src/__tests__/engine-v9_5.test.ts`:
  - `applyScrapScale` constant-px inflation + center preservation + v9 multiplicative reference baseline
  - v9 ↔ v9.5 parity on image-only inputs (Grid exact match, Phyllo score ≥ monotonic)
  - Grid compound mutation: v9.5 average score across 5 seeds on text-heavy input ≥ v9
- **Spec references** — spec authority is now `spec/auto-layout-text-spec-0423-1.md` §Grid → Mutation Operators, §Phyllo → Multi-Trial Selector, §Post-Processing → applyScrapScale. OpenSpec proposal at `openspec/changes/v2-5-auto-layout-0423.md`.

Verification: `pnpm test` (50/50), `npx tsc --noEmit` (clean), `pnpm build` (all 4 routes prerendered: `/`, `/v1`, `/v2`, `/v2-5`).

### Hydration fix: AnimatedDemoV2_5 mount-gate

- **Symptom**: console hydration error on first load of `/v2-5`; text frames matched SSR↔CSR but the 3 image frames in the hero's Grid demo came out in reversed row order. Same item widths/heights, different `left` — classic "GA converged to a different tree on client".
- **Root cause**: the hero runs a full 50-population × 40-generation GA inside `useMemo`. Over thousands of score comparisons (log, sqrt, products), Node's SSR runtime and the browser's V8 produce ULP-level floating-point differences. When two genomes score within ULP distance, sort-by-score order flips → different top-30% survivors → downstream mutations diverge completely. Engine code stays deterministic *within* a runtime; the issue is cross-runtime float agreement, which ECMAScript doesn't guarantee for `Math.log` / `Math.sqrt` / FMA-style products.
- **Fix**: 4-line mount-gate in `src/components/v2-5/AnimatedDemoV2_5.tsx`. SSR renders an `aspect-ratio: 4/3` placeholder; `useEffect(() => setMounted(true), [])` triggers the real GA render after hydration. Engine code untouched.
- **Not applied to V9**: `AnimatedDemoV9` on `/v2` has the same latent risk but hasn't reliably surfaced it. Will patch the same way if/when it does.

### OpenSpec archive

- `openspec/changes/v2-5-auto-layout-0423.md` — spec fully implemented; completion note + follow-ups appended at the top. V2 retirement listed as deliberate follow-up (not in this change).

## 2026-04-15

### Spec Proposed: Layout Demo Web
- **Wrote implementation spec** — `openspec/specs/layout-demo-web.md` covering 5 phases: Design Foundation → Layout Engines → Playground → Upload → Hero/Intro/Footer + Polish
- **Adapted plan for actual stack** — original `demo-implementation-plan.md` assumed flat React SPA with `.jsx`; spec adapts to Next.js App Router + TypeScript + Tailwind v4
- **DESIGN.md to be populated first** — Phase 0 establishes the full token system before any component work, preventing ad-hoc styling
  Rationale: the plan's design vision (PicCollage warmth × Stripe precision) requires disciplined token usage from the start
- **Reference JSX files not in repo** — `freestyle-v4b.jsx` and `gallery-wall-v20.jsx` mentioned in plan are absent; `auto-layout-spec.md` pseudocode is sufficient for clean TS implementation

### Implementation Complete: Layout Demo Web

#### Phase 0 — Design Foundation
- **DESIGN.md populated** — full token system: 8 color tokens, 4 font families, 11-step spacing scale, 5 radius tokens, 6 shadow levels, 3 motion curves
- **globals.css** — CSS custom properties for all tokens, custom slider styles with accent-aware thumbs, noise texture overlay on body, scroll fade-in animations, reduced-motion support
- **layout.tsx** — Newsreader (display italic), Outfit (heading/body), JetBrains Mono (technical) via `next/font/google`

#### Phase 1 — Layout Engines
- **Grid engine** (`src/engine/grid.ts`) — full GA pipeline: random + balanced tree generation, `treeToRows`, bottom-up ratio computation, area distribution, exact row layout, 3-operator mutation, 7-factor multiplicative scoring, GA loop (pop 50 × 40 gens)
- **Phyllo engine** (`src/engine/phyllo.ts`) — 6-phase pipeline: size assignment with rank-based hierarchy, elliptical golden-angle spiral placement, 300-iteration constraint solver (collision resolution + gravity + spread + AR correction + gap targeting + boundary clamp), scaleToFit, post-scale overlap fix, Perlin-noise aesthetic rotation. Multi-trial selector with early exit at score > 0.7
- **Shared utilities** (`src/engine/shared.ts`) — seeded Weyl-sequence PRNG, 2D Perlin noise, Fisher-Yates shuffle, rect distance, bounding box, scaleToFit, overlap counter
- **22 unit tests** — all pass, covering both engines' zero-overlap guarantee, seeded determinism, scoring ranges, utility edge cases
  Rationale: engines implemented from `auto-layout-spec.md` pseudocode only, no reference JSX files needed

#### Phase 2 — Interactive Playground
- **7 components** — ModeSwitch (pill tabs), SliderRow (custom range input), ParameterPanel (grouped sliders with mode-specific show/hide), CanvasPreview (absolute-positioned placeholders or real images), StatsBar (animated metrics), SeedControls (◀ ▶ arrows), ShuffleButton (accent-colored CTA with bounce)
- **Playground orchestrator** — manages mode/seed/params state, debounced layout computation via `useMemo`, 100ms debounce on slider changes

#### Phase 3 — Photo Upload
- **DropZone** — drag-and-drop + click-to-browse, `image/*` filter, hover highlight
- **ThumbnailRow** — horizontal scroll with per-photo remove button
- **UploadSection** — processes files via `FileReader` + `Image()` for aspect ratio, reuses all playground components in real-image mode

#### Phase 4 — Hero + Intro + Footer
- **AlgorithmCard** — icon + title + description + pre-computed static canvas preview + tags, accent-colored per mode
- **AnimatedDemo** — pre-computes both Grid and Phyllo layouts, auto-cycles every 3s with smooth CSS transitions (800ms position/size interpolation)
- **HeroSection** — display heading, subheading, animated demo, smooth-scroll CTA
- **Footer** — minimal, links to playground

#### Phase 5 — Polish & Assembly
- **page.tsx** — all 5 sections composed, IntersectionObserver for scroll fade-in
- **Responsive** — verified at 375px (mobile) and 1280px (desktop)
- **Accessibility** — ARIA labels on canvas, aria-pressed on mode buttons, semantic heading hierarchy, keyboard-navigable sliders, prefers-reduced-motion support
- **Performance** — `useMemo` on all layout computations, debounced slider changes, `will-change: transform` on canvas images

#### Verification
- `pnpm test` — 22/22 tests pass
- `npx tsc --noEmit` — 0 errors
- `pnpm build` — production build succeeds
- Smoke test — all sections render, mode switch works, shuffle changes layout, zero console errors, responsive at mobile/desktop

## 2026-04-16

### Upload Section: StatsBar + Parity with Playground
- **Added StatsBar to UploadSection** — now displays Coverage, Gap, Score, Overlaps below the canvas, matching Playground behavior
- **Score computation** — upload section now computes bounding-box coverage score identical to Playground

### Negative Gap Support
- **Gap slider min changed from 1% to -2%** — allows overlapping images when negative gap is set
- **Grid scoring fix** — `gapScore` denominator uses `Math.abs(gapPx) || 1` to prevent division by zero/negative

### Reset Button
- **Added Reset button to ParameterPanel** — appears at bottom-right of the parameter card
- **Wired in both Playground and UploadSection** — resets params, canvas ratio, and background color to defaults

### Auto-Retry on Low Score
- **Score < 50% triggers seed increment** — `useEffect` watches score and retries up to 5 times with incremented seed
- **Applied to both Playground and UploadSection** — ensures layouts meet minimum quality threshold
  Rationale: prevents users from seeing poor-quality layouts; 5-retry cap avoids infinite loops

### Overlap Post-Processing
- **New "Overlap" parameter** (0–10%) — post-processing that scales frame positions toward canvas center after layout engine runs
- **Avoids engine conflict** — engines internally compute clean non-overlapping layouts; overlap is applied purely as a post-step via `applyOverlap()` in `shared.ts`
- **Gap slider reverted to min=0** — negative gap in the engine was blocked by collision resolution + overlap fix + scoring penalties
  Rationale: engine's overlap prevention (postScaleOverlapFix hardcodes +1px separation, phylloScore returns negative for any overlap, grid GA penalizes non-uniform gaps) made negative gap ineffective; post-processing is the clean solution

### Scrap Scale & Tightness (replaces Overlap)
- **Split single "Overlap" param into two independent controls** — they are conceptually different dimensions
- **Scrap Scale** (0–10%) — inflates each frame in-place (center preserved), neighbors naturally overlap; implemented as `applyScrapScale()` in `shared.ts`
- **Tightness** (0–10%) — pulls all frame positions toward canvas center then re-scales the group back to fill original bounding box; overlaps survive the re-scale; implemented as `applyTightness()` in `shared.ts`
- **Both are stackable** — scrap scale + tightness can be combined for compounding overlap effects
  Rationale: center-pull alone left empty margins (coverage dropped from 72% → 44%); inflate alone doesn't change layout structure. They address different needs: "bigger photos" vs "tighter grouping"

### Border & Shadow Controls
- **Border Width** (0–6px, default 0) — white CSS border on each frame via `box-sizing: border-box`, giving a picture-frame effect
- **Shadow Opacity** (0–100%, default 25%) — replaces hardcoded CSS custom property shadows with inline `rgba()` computation; 0% removes shadows entirely
- **Both params available in Playground and Upload section** — passed from ParameterPanel → CanvasPreview as props

## 2026-04-22

### v9.2 Feature: Text-Scrap Layout + Normalized Coordinate Engine (Phase 3–5 completion)

#### Routing + Version Switcher
- **`/v3` is the new default v9.2 page**; `/v2` preserves the original image-only engine unchanged
- **`VersionSwitcher`** component mounts fixed top-right via `layout.tsx`, uses `usePathname` to highlight active route; numeric pills ("V2" / "V3"), collapses to single-char on mobile `< 640px`

#### v9 Engine Module (parallel, non-replacing)
- **Added `src/engine/v9/`** — `types.ts`, `shared.ts`, `text.ts`, `items.ts`, `grid.ts`, `phyllo.ts`, `layout.ts`
- **Key architectural decision: normalized 1000-unit coordinate space** — all layout computation runs in device-independent units (`NW=1000` for landscape/square, `NH=1000` for portrait). Display scaling (`sc = displayW / NW`) is deferred entirely to `CanvasViewV9`. Identical seed + settings produce identical frames on any display size
  Rationale: v2 engines accepted raw display pixels so thresholds (fs floors, minArea, scoring weights) were coupled to the viewport the developer happened to use during testing
- **Text scraps as first-class items** — `TextItemSingle` and `TextItemPaired` participate alongside `ImageItem` in both Grid GA and Phyllo spiral. `genItems()` resolves text ratios via `textPreferredRatio` / `pairedPreferredRatio` and computes `minArea`/`maxArea` from normalized font-size constants (`targetFS=14` long, `28` short) in normalized units
- **Scoring weights v9.2** — Grid: `gs^0.13 × fl^0.15 × co^0.05 × am^0.15 × rwS^0.13 × aOK^0.09 × rcOK^0.13 × tB^0.17`; Phyllo: `am^0.10 × cov^0.15 × axisFill^0.08 × co^0.30 × gh2^0.17 × ts^0.20`. Grid `am` multiplier 1.0 (not 0.8), `idealMax` floor 2

#### New UI Sections (v3 page)
- **`AnimatedDemoV9`** — cycles Grid ↔ Phyllo every 3 s with 3 images + 2 text scraps; respects `prefers-reduced-motion`; pre-computed via `useMemo`, no per-frame recomputation
- **`HeroSectionV9`** — clones `HeroSection` visual language; swaps `AnimatedDemo` for `AnimatedDemoV9`; sub-copy updated to "Photos and words, automatically arranged."
- **`AlgorithmIntroV9`** — mini previews compute v9 layouts (3 images + 1 short text) via `runGA` / `bestPhyllo` directly with reduced params (`population=24, generations=20, trials=6`) so card load is snappy; tags updated to "Text-aware rows" / "Text-aware spiral"
- **`TextLogicExplainer`** — four sub-blocks (classification, ratio decision, min/max area, scoring penalties) with live `LiveTextDemo` blocks running both engines
- **`PipelineFlowchart`** — inline SVG, left-to-right with fork (GA loop / Phyllo trials), hover-highlight per node with `<title>` tooltip naming source file; responsive via `viewBox`; uses only design-system CSS variables
- **`DualCanvasView`** — side-by-side Grid + Phyllo canvases in Playground and Upload; stacks on mobile < 768px
- **`ParameterPanelV9`** — four `<details>` collapsible groups; new text controls (ratioMode, ratioSearch, textBoxSize, minFS, maxFS, italic, fontFamily)

#### Verification (2026-04-22)
- `pnpm test` — 37 tests pass (includes engine-v9 determinism, device-independence, text ratio, retry, scoring)
- `npx tsc --noEmit` — zero TypeScript errors
- `pnpm build` — production build clean, all routes static

#### Design audit fixes (2026-04-22, final pass)
- **Scroll target bug** — Hero scrolled to `#playground-v9`, but section id was `playground` (clashing with `/v2`). Renamed `PlaygroundV9` section id to `playground-v9`
- **Raw hex removal** — `StatsBarV9` used literal `#B37B00` for the retry-cap warning. Replaced with `color-mix(in srgb, var(--accent-phyllo) 85%, var(--text-primary))` so the warn tone derives from the existing token
- **Token-ify border** — `PipelineFlowchart` container used inline `rgba(0,0,0,0.06)`. Swapped to `var(--border-subtle)` (defined for exactly this value)
  Rationale: eliminate all ad-hoc colour literals from v9 components so future palette shifts stay contained to `globals.css`

### Spec Archived
- **`openspec/specs/layout-text-scrap-demo-web.md` → `openspec/changes/`** — all phases complete, verification passed

## 2026-04-22

### Add Border Opacity control to Playground & Upload sections
- **New `borderOpacity` param** (0–100%, default 30%) added to `LayoutParams`, both `DEFAULT_PARAMS`, `ParameterPanel` slider, and `CanvasPreview` border rendering
- **Border color** changed from hard-coded `solid white` to `rgba(255, 255, 255, borderOpacity)` — allows subtle, transparent scrap borders instead of always-opaque white
  Rationale: a 30% default gives a soft frosted-glass feel; 100% recovers the original behaviour

## 2026-04-23

### Text Border Opacity — independent control for text scraps (v9)
- **New `textBorderOpacity` param** (0–100%, default 30%) on `ParamsV9`, defaulted in `DEFAULT_PARAMS_V9`, exposed as a slider in `ParameterPanelV9` (Layout group, directly beneath the existing `Border` width slider)
- **Threaded through `DualCanvasView` → `CanvasViewV9`** — both `PlaygroundV9` and `UploadSectionV9` pipe `debouncedParams.textBorderOpacity` into the canvas
- **Applied only to text frames** — text scraps now render `${borderWidth}px solid rgba(255,255,255,${textBorderOpacity})` while image scraps keep the existing solid-white border, so raising the overall `borderWidth` produces a subtle stroke on text that's independent of the crisp image frame
  Rationale: text scraps previously had no border at all; typographic scraps look more cohesive with a soft 30% stroke, but full-opacity white would crowd the glyph edges — so text needs its own alpha control, separate from the image border which typically wants solid framing

### Playground — Compact UI & Text Presets (v9)
Spec: `openspec/changes/playground-ui-compact.md`. Five UI-only fixes to keep the canvas and parameters visible together when iterating.
- **Canvas height cap** — `CanvasViewV9` gains a `maxDisplayH?: string` prop accepting a CSS length (e.g. `"min(420px, 55vh)"`). The inner canvas now uses `width: min(100%, calc(maxDisplayH * NW / NH))` alongside `aspectRatio: NW/NH`, so tall ratios (9:16, 3:4) **shrink the canvas width** instead of pushing the parameter panel off-screen. `DualCanvasView` passes `min(420px, 55vh)` to both canvases.
  Rationale: CSS `width: 100% + aspect-ratio` forces height from width and overflows any `max-height`. The `min(100%, calc(...))` formula is the one expression that makes aspect-ratio honour both a container-width cap **and** a display-height cap; it's pure CSS, no JS measurement needed.
- **Two-column parameter panel** — `ParameterPanelV9`'s outer wrapper is now `grid grid-cols-1 md:grid-cols-2`. `Canvas & Content` spans both columns (it holds `TextScrapEditor`); Layout / Post-process / Text Ratio / Advanced each occupy one column. Panel max-width widened 720 → 960 in both `PlaygroundV9` and `UploadSectionV9`.
- **Compact `SliderRow`** — height 32 → 22, label column 80 → 68, value column 48 → 44, row gap 12 → 8. Group inner gap 10 → 6. Affects all pages (v1/v2/v3) that use `SliderRow`; density benefits all.
- **Post-process group** — `Scrap Scale` and `Tightness` extracted from the Layout group into their own `<Group title="Post-process" defaultOpen>` between Layout and Text Ratio. Fixes repeated "I can't find these sliders" reports.
- **Text-scrap presets** — new `src/data/v9/textPresets.ts` with `TEXT_SCRAP_PRESETS_SINGLE` (`1w / 2w / 4w / 10w / 28w / 中文7`) and `TEXT_SCRAP_PRESETS_PAIRED` (`date / desc / credit / 中文`) ported from `spec/text-scrap-v9-2.jsx`. `TextScrapEditor` renders a pill-chip row above each scrap's text input; clicking a chip replaces the scrap's text (or title+subtitle for paired) in one shot.
- **No engine / data-model changes.** `ParamsV9` untouched; no new types; no new engine entry points. All five fixes are presentational.
  Rationale: the canvas-growth issue was the biggest blocker to the "tweak a slider, see the result" loop that defines the Playground. Capping display height in pure CSS (rather than measuring via JS) keeps the fix small, deterministic, and SSR-safe.

### Playground — Compact UI v2 iteration (same day)
First round of the compact UI shipped a canvas height cap applied inside `CanvasViewV9`, plus a `col-span-2` `Canvas & Content` group. Feedback flagged two problems; adjusted as follows:
- **Canvas gap** — when tall ratios shrunk each canvas, `mx-auto` centered each inside its half-column and produced huge whitespace between the pair, losing side-by-side comparability. **Fix:** moved the height-cap logic out of `CanvasViewV9` (restored its inner canvas to plain `w-full` + aspect-ratio) and into `DualCanvasView`, where each **column** now gets `maxWidth: calc(min(420px, 55vh) * NW / NH)` with `md:flex-1 md:min-w-0` and the outer flex uses `md:justify-center`. Both canvases shrink together and sit snug at `gap-4` (16px) regardless of ratio. Removed the `maxDisplayH` prop entirely (no other callers).
  Rationale: letting the wrapper shrink solves both the height cap and the comparison gap in one expression. `min-w-0` is the key flex trick that allows columns to shrink below their content-based minimum.
- **`Canvas & Content` no longer spans both columns.** `md:col-span-2` removed — it now sits in a single grid cell like every other group. Tightened the `TextScrapEditor` to match: scrap-card gap 10 → 4, card padding p-2 → p-1.5, single `<textarea>` rows default 2 → 1 and `minHeight` 44 → 28, paired inputs shrunk from `text-sm py-1` → `text-xs py-0.5`. Canvas & Content now occupies roughly half the vertical space it did in v1 and no longer dominates the panel.
  Rationale: user wanted this section to read as the same weight as sibling groups. The textarea auto-expands via `resize-y` + `rows` growing with content length, so long presets (`28w`) still display multi-line when clicked.

### Upload — Sample Photos + CTA-Gated Generation (v9)
Spec: `openspec/changes/upload-sample-photos-cta.md`. Wires a sample-photo affordance into "Try With Your Photos" and gates layout computation behind an explicit CTA click.
- **Samples moved to `public/test_images/`.** 7 JPGs previously sitting at repo root; Next.js serves `public/*` at root URL automatically. New `src/data/v9/samplePhotos.ts` declares the set with **baked aspect ratios** (measured once via `sips -g pixelWidth -g pixelHeight`, 4 decimals) so `genItems` can consume them synchronously without a runtime `<img>` probe on first paint.
- **Staged vs committed state split.** `UploadSectionV9` now holds two lists: `stagedPhotos` (what's selected — drives `ThumbnailRow` and the sample-picker selection ring) and `committedPhotos` (what's rendered — feeds `genItems` / `runGridV9` / `runPhylloV9`). Nothing downstream of `committedPhotos` changes until the user clicks the CTA. The existing `UploadedPhoto` type is replaced by `StagedPhoto { …, source: 'upload' | 'sample' }` (new file `src/components/v9/stagedPhotos.ts`, plus order-insensitive `photosEqual` helper + 6 unit tests).
  Rationale: the user's explicit ask was "select photos, click a button, then render." This reshapes the whole section around a commit boundary — staged is cheap (no layout work), committed is the snapshot that runs the engines.
- **`GenerateLayoutButton` CTA.** Three states driven purely by `isDirty = !photosEqual(staged, committed)` and `hasCommitted = committedPhotos.length > 0`: `Generate Layout →` (primary, pre-first-commit), `Regenerate →` (primary, dirty), `Up to date` (muted, clean). Hidden entirely when nothing is staged and nothing is committed.
- **`SamplePhotoPicker`.** Horizontal row of 7 toggleable 56×56 thumbnails below the DropZone, plus an `All` pill that idempotently selects-all / deselects-all. Sample selection simply mutates `stagedPhotos` — the same list uploads flow into — so samples and uploads share one staging path.
- **Blob URL lifecycle.** Removing an upload from `stagedPhotos` does **not** revoke its URL if that upload still lives in `committedPhotos` (the canvas is still rendering it). Revocation happens in `handleGenerate` for photos dropped from the committed set on commit, and in `handleReset` for everything.
  Rationale: naive revoke-on-remove broke the canvas mid-stream once staged/committed diverged. The reference-count approach is the minimum viable fix — no refcount map needed; just check the other list.
- **Text scraps stay live-edit**, not gated by the CTA. Scope decision documented in the spec §5: photos were the ask, scraps are a textarea where live feedback is most of the value, and unifying them would teach two gating rules in one section.
- **No engine / data-model changes.** Pure UI + asset wiring. New files: `public/test_images/*.jpg` (moved), `src/data/v9/samplePhotos.ts`, `src/components/v9/stagedPhotos.ts`, `src/components/v9/GenerateLayoutButton.tsx`, `src/components/v9/SamplePhotoPicker.tsx`, `src/__tests__/photosEqual.test.ts`.

### Playground — Parameter panel polish & Grid T-shape investigation
Follow-ups after shipping the compact UI work, driven by iterative visual feedback.
- **CSS multi-column layout** — `ParameterPanelV9` outer switched from `grid grid-cols-1 md:grid-cols-2` to `md:columns-2 md:gap-3`. Each `<Group>` gets `mb-3 block md:break-inside-avoid` so the browser packs the 5 groups into 2 balanced columns by content height, eliminating the empty-space-below-shorter-cell problem that CSS Grid's row-height equalization caused.
  Rationale: with Grid, the shorter sibling in each row left a tall void; columns lets every group settle at its own natural height and the browser picks the break point that balances the column totals.
- **Visual hierarchy (panel → group card → title strip)**
  - Outer panel: `var(--surface)` → `var(--bg)` (off-white) so the inner group cards visibly float.
  - Each `<Group>`: explicit `background: var(--surface)` (white) + `overflow-hidden` so the summary tint respects the rounded corners.
  - `<summary>` header: subtle `rgba(0, 0, 0, 0.06)` tint, `group-open:border-b` on `var(--border-subtle)` to crisp the header/body divide only when the group is expanded.
- **Hydration-warning fix** — added `suppressHydrationWarning` to `<body>` in `src/app/layout.tsx`. Root cause: Grammarly browser extension injects `data-new-gr-c-s-check-loaded` / `data-gr-ext-installed` onto `<body>` before React hydrates, which Next.js 16 reports as a mismatch. The flag is shallow (direct-children only), so it doesn't silence real component-level hydration bugs.
- **Grid T/⊥ reduction attempt — reverted.** Hypothesis was that T-shape is a local optimum of `rowScore`: it scores full marks on `rwS` (both rows span full canvas width) despite being visually lopsided. Tried two changes together: (1) added a `rcBal = min(itemsPerRow)/max(itemsPerRow)` factor weighted 0.08, stole weight from `rwS` (0.13 → 0.05); (2) seeded the GA initial population with `rowTree`, `colTree`, `gridTree` deterministic topologies alongside the existing `balTree ×2` + random. Visual result was worse, not better — reverted to v9.2 scoring (commit-clean diff on `src/engine/v9/grid.ts`).
  Rationale to leave investigation open: `rwS` really is over-rewarding T (confirmed by the math: T-shape gets rwS=1 trivially because both rows inherit full canvas width by construction). But stealing from `rwS` alone likely isn't the right lever — the seeding may have dominated the result, or the `rcBal` weight was in the wrong direction for the GA's search dynamics. Two unexplored alternatives worth trying next time: (a) post-process only — detect T/⊥ topology and try a `rowTree`/`colTree` fallback, keep whichever scores higher; (b) zero out `rwS` entirely (its role is already covered by `rcOK` + new hypothetical `rcBal`), one-line change, measure in isolation.

### Version Routes Renumbered: V2/V3 → V1/V2
- **Routes renamed** — `src/app/v2` → `src/app/v1`, `src/app/v3` → `src/app/v2` (via `git mv` to preserve history). Component functions updated to `V1Page` / `V2Page`. Root `/` redirect now points at `/v2` (the v9-engine experience, previously at `/v3`).
- **`VersionSwitcher` updated** — keys/hrefs/labels now `v1`→`/v1`→`V1` and `v2`→`/v2`→`V2`; active-fallback switched to `v2`.
  Rationale: the displayed version numbers should start at 1, not 2. Earlier iterations (v1 of the engine, v6/v7/v8 mid-iteration) were never shipped as their own routes, so the public-facing numbering had diverged from user expectations. Keeping the URL and the label in sync — both now V1/V2 — removes the split.
