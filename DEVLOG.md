# Development Log

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

### Border & Shadow Controls
- **Border Width** (0–6px, default 0) — white CSS border on each frame via `box-sizing: border-box`, giving a picture-frame effect
- **Shadow Opacity** (0–100%, default 25%) — replaces hardcoded CSS custom property shadows with inline `rgba()` computation; 0% removes shadows entirely
- **Both params available in Playground and Upload section** — passed from ParameterPanel → CanvasPreview as props
