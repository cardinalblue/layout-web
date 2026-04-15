# Spec: Layout Demo Web

> Status: **IMPLEMENTED** — all phases complete, verified 2026-04-15

---

## Problem

We need a polished demo website that showcases two image layout algorithms — **Grid** (gallery-wall aligned rows via genetic algorithm) and **Phyllo** (organic freestyle via phyllotaxis spiral). The site must let visitors:

1. **Understand** what each algorithm does (visual intro)
2. **Play** with parameters in an interactive playground (colored placeholders)
3. **Try** their own photos via drag-and-drop upload

Currently the project is a freshly scaffolded Next.js app with an empty page. The algorithm spec (`auto-layout-spec.md`) and design plan (`demo-implementation-plan.md`) exist but zero implementation has happened.

---

## Solution

A single-page Next.js application with 5 sections (Hero → Algorithm Intro → Playground → Upload → Footer), entirely client-side. The two layout engines are pure TypeScript functions; the UI is React + Tailwind CSS v4 with custom design tokens.

### Key Adaptations from the Original Plan

The `demo-implementation-plan.md` assumes a flat React SPA with `.jsx` files. We adapt for our actual stack:

| Plan says | We do | Why |
|-----------|-------|-----|
| `src/App.jsx` | `src/app/page.tsx` | Next.js App Router |
| `.jsx` components | `.tsx` components | TypeScript for safety |
| `src/engine/*.js` | `src/engine/*.ts` | TypeScript |
| `src/components/*.jsx` | `src/components/*.tsx` | TypeScript |
| Flat file structure | `src/app/` + `src/components/` + `src/engine/` | Next.js convention |
| No SSR consideration | `'use client'` on interactive components | Next.js requires explicit client components |
| System fonts | Google Fonts via `next/font/google` | Next.js optimized font loading |

The algorithm logic, visual design, component architecture, UX principles, and phased implementation order from the plan are all sound — we follow them faithfully.

---

## Design System (DESIGN.md)

**Before any component work**, populate `DESIGN.md` with the full design token system from the plan. This is the source of truth.

### Tokens to Define

- **Color Palette**: Background `#FAFAF8`, Surface `#FFFFFF`, Canvas BG `#0C0C10`, Text levels `#1A1A1A`/`#6B6B6B`/`#A0A0A0`, Accent Grid `#2D7A4F`, Accent Phyllo `#C9A84C`, Danger `#D94444`, Success `#3A9A5A`
- **Typography**: Display `Newsreader` italic, Heading `Outfit` 600, Body `Outfit` 400, Mono `JetBrains Mono`
- **Spacing Scale**: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80
- **Border Radius**: sm 6px, md 10px, lg 16px, xl 24px, pill 9999px
- **Shadow System**: subtle, card, elevated, canvas (inner shadow for dark canvas)
- **Motion**: 150ms default, 300ms emphasis; easing `cubic-bezier(0.4, 0, 0.2, 1)`
- **Component Patterns**: pill button, slider row, canvas frame, score bar

### Quality Signals (from plan)

- `1px` borders using `rgba(0,0,0,0.06)` — paper edge feel
- Canvas inner shadow `inset 0 1px 3px rgba(0,0,0,0.3)`
- Image micro-shadows that vary with Phyllo rotation
- Custom slider thumbs matching accent color
- Noise texture overlay at 2% opacity on background
- Active pill buttons with `scale(1.02)` transform
- Stats numbers animate on change (200ms)
- Canvas crossfade between Grid ↔ Phyllo (opacity transition, 200ms)

---

## Implementation Plan

### Phase 0: Design Foundation
> Files: `DESIGN.md`, `src/app/globals.css`, `src/app/layout.tsx`

1. **Populate `DESIGN.md`** with full design token system (colors, typography, spacing, radius, shadows, motion, component patterns) per the plan's spec
2. **Configure `globals.css`** — CSS custom properties for all design tokens, Tailwind v4 `@theme` integration, noise texture overlay on `body`
3. **Configure `layout.tsx`** — load Newsreader, Outfit, JetBrains Mono via `next/font/google`, set metadata

### Phase 1: Layout Engines
> Files: `src/engine/shared.ts`, `src/engine/grid.ts`, `src/engine/phyllo.ts`, `src/engine/types.ts`

4. **`src/engine/types.ts`** — TypeScript interfaces: `ImageInput`, `Frame`, `LayoutOptions`, `GridOptions`, `PhylloOptions`, `TreeNode` (Leaf | Internal)
5. **`src/engine/shared.ts`** — `createRNG(seed)`, `createPerlin2D(seed)`, `rectDist(a, b)`, `scaleToFit(frames, cW, cH, padPx)`, `boundingBox(frames)`
6. **`src/engine/grid.ts`** — full GA pipeline per `auto-layout-spec.md` Part 1:
   - `randomTree`, `balancedTree`, `treeToRows`, `computeRatio`, `treeAreas`, `computeSizes`, `layoutExact`
   - `mutate` (3 operators: flip cut, swap leaves, restructure)
   - `gridScore` (7-factor multiplicative scoring)
   - `gridLayout` (GA loop: pop 50, gens 40, top 30% survive)
7. **`src/engine/phyllo.ts`** — full pipeline per `auto-layout-spec.md` Part 2:
   - `assignSizes`, `spiralPlacement`, `constraintSolver` (6 force phases), `postScaleOverlapFix`, `aestheticRotation`
   - `phylloScore` (3-factor with hard overlap disqualification)
   - `bestPhylloLayout` (multi-trial selector)
8. **Unit tests** (`src/__tests__/engine.test.ts`):
   - 7 mixed-ratio images on 4:3 canvas → both engines produce zero overlap
   - Seeded determinism: same seed → same output
   - `scaleToFit` respects padding
   - Grid scoring: valid score range (0–1)
   - Phyllo scoring: overlap → negative score

### Phase 2: Interactive Playground
> Files: `src/components/Playground.tsx` and sub-components

9. **`src/components/CanvasPreview.tsx`** — renders `Frame[]` as absolutely positioned `<div>`s (colored placeholders with ratio labels, rotation, shadow) or `<img>` elements (real photos with `object-fit: cover`). Dark background `#0C0C10`. Canvas inner shadow. Max 640px width.
10. **`src/components/SliderRow.tsx`** — label + value + custom range input. Custom thumb matching accent color. 44px touch target.
11. **`src/components/ParameterPanel.tsx`** — groups: "Canvas" (ratio, image set, count) and "Layout" (gap, padding, mode-specific). Phyllo-specific params animate show/hide with height transition.
12. **`src/components/ModeSwitch.tsx`** — two pill tabs (Grid/Phyllo). Active state: accent color bg + `scale(1.02)`. Switching preserves shared params.
13. **`src/components/SeedControls.tsx`** + **`src/components/ShuffleButton.tsx`** — Seed ◀ ▶ arrows. Shuffle = 44px pill, accent bg (gold for Phyllo, green for Grid), bounce animation on click.
14. **`src/components/StatsBar.tsx`** — coverage %, gap range, score %. Numbers animate on change (200ms transition). Red text for overlap > 0.
15. **`src/components/Playground.tsx`** — orchestrates all above. Manages state: mode, params, seed, computed frames. `useMemo` for layout computation. Debounce sliders (150ms).
16. **`src/data/imageSets.ts`** — ratio pools: Mixed (`[4/3, 3/4, 1, 16/9, 3/2, 9/16, 5/4]`), Landscape (`[16/9, 3/2, 4/3, 5/4]`), Portrait (`[3/4, 9/16, 2/3, 4/5]`). Canvas ratios: 4:3, 1:1, 3:4, 16:9.

### Phase 3: Photo Upload
> Files: `src/components/UploadSection.tsx` and sub-components

17. **`src/components/DropZone.tsx`** — dashed border drop zone, `image/*` MIME filter, click-to-browse, hover highlight
18. **`src/components/ThumbnailRow.tsx`** — horizontal scrollable row of uploaded photos with remove button per photo
19. **`src/components/UploadSection.tsx`** — manages uploaded photo state (`{ id, src, aspectRatio, filename }`), processes uploads via `FileReader` + `Image()` for aspect ratio. Reuses `ParameterPanel`, `CanvasPreview` (in real-image mode), `SeedControls`, `ShuffleButton`. Shows guidance hints (1–2 photos → "add more").

### Phase 4: Hero + Intro + Footer
> Files: `src/components/HeroSection.tsx`, `src/components/AlgorithmCard.tsx`, `src/components/AlgorithmIntro.tsx`, `src/components/AnimatedDemo.tsx`, `src/components/Footer.tsx`

20. **`src/components/AlgorithmCard.tsx`** — card with icon, title, description, small static preview canvas (pre-computed), bottom tags. Two instances: Grid (green accent) and Phyllo (gold accent).
21. **`src/components/AlgorithmIntro.tsx`** — side-by-side container for the two cards. Responsive: stacked on mobile.
22. **`src/components/AnimatedDemo.tsx`** — pre-computed layout frames for 5–6 images, auto-cycles between Grid and Phyllo every 3s with crossfade.
23. **`src/components/HeroSection.tsx`** — full-width centered. Display heading "AUTO LAYOUT ENGINE", subheading, animated demo, "Try It Below ↓" CTA (smooth-scrolls to Playground).
24. **`src/components/Footer.tsx`** — minimal. "Auto Layout Engine · Grid + Phyllo", description, links.

### Phase 5: Polish & Assembly
> Files: `src/app/page.tsx`, various components

25. **Assemble `page.tsx`** — compose all sections in order: Hero → AlgorithmIntro → Playground → UploadSection → Footer
26. **Scroll animations** — `IntersectionObserver` + CSS fade-in on section entry
27. **Responsive** — test 375px, 768px, 1280px. Mobile-first. Shuffle button always visible near canvas.
28. **Performance** — `useMemo` on all layout computations, debounce slider changes, `will-change: transform` on canvas images
29. **Accessibility** — ARIA labels on canvas, keyboard navigation for sliders, semantic heading hierarchy, `prefers-reduced-motion` support
30. **Loading states** — brief skeleton/spinner while GA runs (Grid can take 50–100ms for 10+ images)

---

## File Structure (Final)

```
src/
├── app/
│   ├── layout.tsx              ← fonts, metadata, html shell
│   ├── globals.css             ← design tokens, Tailwind config, noise texture
│   └── page.tsx                ← all sections composed
├── engine/
│   ├── types.ts                ← shared TypeScript interfaces
│   ├── shared.ts               ← RNG, Perlin, rectDist, scaleToFit
│   ├── grid.ts                 ← Grid layout GA pipeline
│   └── phyllo.ts               ← Phyllo layout spiral + solver pipeline
├── components/
│   ├── HeroSection.tsx
│   ├── AnimatedDemo.tsx
│   ├── AlgorithmIntro.tsx
│   ├── AlgorithmCard.tsx
│   ├── Playground.tsx          ← main interactive section
│   ├── UploadSection.tsx
│   ├── CanvasPreview.tsx       ← shared: placeholders or real images
│   ├── ParameterPanel.tsx
│   ├── ModeSwitch.tsx
│   ├── SliderRow.tsx
│   ├── SeedControls.tsx
│   ├── ShuffleButton.tsx
│   ├── StatsBar.tsx
│   ├── DropZone.tsx
│   ├── ThumbnailRow.tsx
│   └── Footer.tsx
├── data/
│   └── imageSets.ts            ← ratio pools and canvas ratio presets
└── __tests__/
    ├── fixtures.ts             ← existing
    └── engine.test.ts          ← engine unit tests
```

---

## Data Model Changes

No database. No API routes. All state is client-side React state:

```typescript
// Core engine types
interface ImageInput { id: string; aspectRatio: number }
interface Frame { id: string; x: number; y: number; width: number; height: number; rotation?: number }

// Playground state
interface PlaygroundState {
  mode: 'grid' | 'phyllo'
  seed: number
  imageCount: number
  imageSet: 'mixed' | 'landscape' | 'portrait'
  canvasRatio: '4:3' | '1:1' | '3:4' | '16:9'
  gapPercent: number        // 1–8, default 4
  paddingPercent: number    // 2–12, default 6.5
  // Grid-specific
  areaLimit: number         // 2–6, default 3
  // Phyllo-specific
  sizeVar: number           // 0–1, default 0.5
  rotation: number          // 0–1, default 1.0
  density: number           // 0.15–0.55, default 0.55
  maxTrials: number         // 1–20, default 10
}

// Upload state
interface UploadedPhoto {
  id: string
  src: string               // objectURL
  aspectRatio: number
  filename: string
}
```

---

## Testing Plan

### Unit Tests (`src/__tests__/engine.test.ts`)

| Test | What it verifies |
|------|-----------------|
| Grid: 7 mixed images, 4:3 canvas → zero overlap | Core correctness |
| Phyllo: 7 mixed images, 4:3 canvas → zero overlap | Core correctness |
| Seeded determinism (both engines) | Same seed = same output |
| Grid scoring returns 0–1 range | Scoring sanity |
| Phyllo scoring: overlapping frames → negative score | Overlap detection |
| `scaleToFit` respects padding bounds | Utility correctness |
| `createRNG` produces uniform distribution | RNG quality |
| `rectDist` edge cases (adjacent, overlapping, distant) | Utility correctness |

### Verification Flow (per TESTING.md)

1. `pnpm test` — all unit tests pass
2. `npx tsc --noEmit` — zero TypeScript errors
3. `pnpm build` — production build succeeds
4. Smoke test in browser:
   - Page loads without console errors
   - Playground: switch Grid ↔ Phyllo, adjust sliders, shuffle — canvas updates
   - Upload: drop/browse photos, see them rendered in layout
   - Hero animation cycles between modes
   - Responsive: test at 375px and 1280px

### E2E Tests (stretch goal)

- Playwright: page loads, playground interaction, upload flow

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| GA performance on mobile (Grid: 2000 tree evaluations) | UI jank during computation | Debounce slider changes (150ms); show loading state; consider `requestIdleCallback` or Web Worker for > 10 images |
| Phyllo solver non-convergence | Poor layouts / visible overlap | Multi-trial selector (10 trials by default); post-scale overlap fix; display overlap count in StatsBar as warning |
| Perlin noise implementation complexity | Development time | Use a minimal 2D Perlin implementation (~60 lines); pre-existing npm packages add weight but are an option |
| Reference `.jsx` files not in repo | Can't directly port code | `auto-layout-spec.md` has complete pseudocode — sufficient for clean TypeScript implementation |
| Large image uploads cause memory pressure | Browser slowdown | Limit to ~20 images; resize uploaded images to max 1200px before storing as objectURL |
| Tailwind v4 `@theme` integration with custom tokens | Configuration complexity | Define tokens as CSS custom properties in `globals.css`; use Tailwind's `theme()` function or direct `var()` references |
| Canvas rendering performance with many elements | Laggy feel on parameter changes | Use CSS `will-change: transform` on image elements; keep DOM-based rendering (not `<canvas>`) for simplicity since we're limited to ~20 images |

---

## Design Skill Usage

The following design skills should be applied during implementation:

- **`/ui-ux-pro-max`** — for micro-interactions, state transitions, slider UX, mobile touch targets
- **`/high-end-visual-design`** — for the premium visual feel: shadows, borders, typography hierarchy, noise texture
- **`/design-taste-frontend`** — for component architecture, CSS hardware acceleration, metric-based spacing
- **`/stitch-design-taste`** — for populating DESIGN.md with anti-generic, premium design tokens

These should be invoked when building visual components (Phase 2–4), not during engine work (Phase 1).

---

## Execution Notes

- **Phase 1 (engines) is pure logic** — can be built and tested without any UI. This is the foundation — get it right with tests before touching components.
- **Phase 2 (playground) is the core experience** — spend the most time here. Every slider change should feel instant and delightful.
- **Phase 4 (hero/intro) is built last** because it depends on working layout engines for the animated demo and static previews.
- **DESIGN.md first** — Phase 0 sets the visual language before any component code is written. This prevents ad-hoc styling decisions.
- **`'use client'`** — all interactive components need this directive. Engine files are pure functions (no directive needed).

---

**Ready for review.** Please confirm or adjust before proceeding to `/opsx:apply`.
