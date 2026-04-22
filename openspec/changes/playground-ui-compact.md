# Spec: Playground & Upload — Compact UI & Text-Scrap Presets

> Status: **PROPOSED** — 2026-04-23
>
> Scope: **UI only.** No changes to the v9 engine, layout data model, scoring, or public types.
> Applies to both `PlaygroundV9` (`/`) and `UploadSectionV9` ("Try With Your Photos").

---

## Problem

Five concrete pain points reported while iterating in Playground / Try With Your Photos:

1. **Canvas grows with ratio.** `DualCanvasView` renders each canvas as a half-width column with `aspect-ratio: NW/NH`. When the canvas ratio switches from `16:9` (wide) → `1:1` (square) → `9:16` (tall), each canvas's rendered **height grows dramatically** because width is fixed but aspect ratio forces more vertical extent. Tall ratios push the parameter panel far below the fold, breaking the "tweak a slider, see the result instantly" loop that defines the Playground.

2. **Parameter panel is single-column** (`max-width: 720px`). Most sliders are short numeric controls that waste the right half of the screen. Two columns would roughly halve the vertical real estate.

3. **SliderRow is visually tall.** `src/components/SliderRow.tsx` renders each row at `height: 32px` with a label column of `80px` and a value column of `48px`. Stacked, 12+ sliders per group consume most of the viewport. Row height can be reduced without hurting usability.

4. **"Post-process" controls feel missing.** The recent split (commit `b0c555d`, "Split Overlap into Scrap Scale + Tightness") added two post-processing sliders. They are currently rendered inside the **Layout** group, sandwiched between `Padding` and `Border`. Users report they "couldn't find them" and assume they don't exist. The controls exist — the information architecture doesn't communicate their post-process semantics.

5. **No text-scrap presets.** `TextScrapEditor` only exposes a plain textarea. `spec/text-scrap-v9-2.jsx` ships with a well-tuned short→long preset set (`SAMPLES`, `SUBTITLE_SAMPLES`) that lets users jump between text lengths (1 word → 28 words → CJK) with one click. The web demo should match that ergonomics.

The goal: **keep the canvas and the parameters visible together on a single viewport** across all canvas ratios, and let users stress-test text scraps quickly with canned presets.

---

## Solution

### 1. Canvas height budget (fix #1)

Cap each canvas's **displayed height** so that the two-canvas-plus-seed-controls region always fits in a predictable vertical budget (target: ≤ 420 px rendered canvas height on desktop). Mechanism:

- `DualCanvasView` stays two-column on `md+`. Each canvas is wrapped in a container that applies BOTH `aspect-ratio: NW/NH` and `max-height: {budget}px`. CSS aspect-ratio honours `max-height` — when the aspect-forced height would exceed the cap, the browser shrinks the **width** to preserve the ratio.
- The canvas therefore scales down for tall ratios (9:16, 3:4) instead of pushing the layout taller.
- The gap between the two canvases (`gap-4`) is preserved so side-by-side comparison remains obvious.
- On narrow viewports (`< md`), canvases stack vertically as today, but each still respects `max-height` to avoid monstrous tall renders on phones.

Constants (initial values, tunable):

| prop / token          | value   | rationale                                                     |
|-----------------------|---------|---------------------------------------------------------------|
| `CANVAS_MAX_H_DESKTOP`| `420px` | Leaves room for header + seed + panel above fold on ~900px viewport. |
| `CANVAS_MAX_H_MOBILE` | `320px` | Prevents 9:16 eating a full phone screen.                     |

Implemented as a new `maxDisplayH?: number` prop on `CanvasViewV9`, plumbed from `DualCanvasView`. The outer container uses inline `maxHeight` (responsive via a Tailwind utility or a `useMediaQuery`-free approach: `style={{ maxHeight: 'min(420px, 55vh)' }}` which automatically shrinks on short viewports).

### 2. Two-column parameter panel (fix #2)

- Change the outer layout of `ParameterPanelV9` from `flex flex-col gap-3` to a **2-column grid** on `md+`: `grid grid-cols-1 md:grid-cols-2 gap-3`.
- Each `<Group>` is one grid cell. Short groups (Text Ratio, Post-process) fit naturally in a single column; wide groups that contain the `TextScrapEditor` or `PillRow` with many options span both columns via `md:col-span-2`.

Group layout (after change):

| Group              | Span       | Contents                                              |
|--------------------|------------|-------------------------------------------------------|
| Canvas & Content   | col-span-2 | Canvas ratio pills, Background swatches, Image set pills, Images slider, TextScrapEditor (needs width) |
| Layout             | col-span-1 | Gap, Padding, Border, Text Border Opacity, Shadow     |
| **Post-process**   | col-span-1 | Scrap Scale, Tightness (NEW group)                    |
| Text Ratio         | col-span-1 | Mode, GA Search, Text Box Size, Min FS, Max FS        |
| Advanced           | col-span-1 | Font, Italic, Line Height, Grid/Phyllo tuning…       |

- Widen the panel container in `PlaygroundV9.tsx` and `UploadSectionV9.tsx` from `maxWidth: '720px'` to `maxWidth: '960px'` so two columns of ~440px each render comfortably.
- On `< md` (mobile) the grid collapses to single column, matching the current experience.

### 3. Compact SliderRow (fix #3)

Reduce per-row vertical footprint by ~30%:

| field              | before | after | note                                             |
|--------------------|--------|-------|--------------------------------------------------|
| row `height`       | 32px   | 22px  | set on `<input type="range">` style             |
| label column width | 80px   | 68px  | labels still readable ("Text Box Size" fits)     |
| value column width | 48px   | 44px  | unchanged for 3-digit values                     |
| row gap            | 12px   | 8px   | `gap-3` → `gap-2`                                |
| vertical `gap` between rows (Group content) | 10px (`gap-2.5`) | 6px (`gap-1.5`) | inside `<Group>`'s inner flex |

- Keep label font size at `text-xs` — don't shrink text, just whitespace.
- Slider thumb remains OS-native (accent-color). Browsers reduce thumb size proportionally when the input height shrinks.
- No API change to `SliderRow`. All callers unaffected.

**Cross-page impact:** `SliderRow` is also used by `ParameterPanel` (v1/v2 classic) and `UploadSection` (classic). Reducing row height there is acceptable — those pages benefit equally from density. Smoke-test all three before merging.

### 4. Split Post-process group (fix #4)

- Create a new `<Group title="Post-process" defaultOpen>` in `ParameterPanelV9` positioned **after** Layout and **before** Text Ratio.
- Move `Scrap Scale` and `Tightness` sliders into it.
- Layout group keeps Gap, Padding, Border, Text Border Opacity, Shadow (purely stylistic / pre-render).

Naming: keep slider labels (`Scrap Scale`, `Tightness`) unchanged — only their grouping moves. This avoids breaking the mental model for users already familiar with them.

### 5. Text-scrap presets (fix #5)

Port the SAMPLES from `spec/text-scrap-v9-2.jsx`:

```ts
// src/data/v9/textPresets.ts (new file)
export const TEXT_SCRAP_PRESETS_SINGLE = [
  { id: 'p-1w',    label: '1w',    text: 'TOKYO' },
  { id: 'p-2w',    label: '2w',    text: 'Hello World!' },
  { id: 'p-4w',    label: '4w',    text: 'Summer at the beach' },
  { id: 'p-10w',   label: '10w',   text: 'We spent the weekend exploring hidden mountain trails and waterfalls' },
  { id: 'p-28w',   label: '28w',   text: 'Last summer we drove along the coast for three weeks, stopping at every small town. The sunsets were incredible and the memories will stay with us forever.' },
  { id: 'p-cjk7',  label: '中文7',  text: '夏日海邊的回憶' },
] as const;

export const TEXT_SCRAP_PRESETS_PAIRED = [
  { id: 'pp-date',   label: 'date',  title: 'TOKYO',              subtitle: '2025 · Travel Journal' },
  { id: 'pp-desc',   label: 'desc',  title: 'Summer at the beach', subtitle: 'A collection of our favorite moments from this summer' },
  { id: 'pp-credit', label: 'credit',title: 'Hello World!',        subtitle: 'Photography by Sarah & Tom' },
  { id: 'pp-cjk',    label: '中文',   title: '夏日海邊的回憶',        subtitle: '回憶錄 · 第三章' },
] as const;
```

**UI integration** in `TextScrapEditor.tsx`:

- Each scrap row gets a **preset chip row** directly above its text field.
- For `SINGLE` scraps, render `TEXT_SCRAP_PRESETS_SINGLE` as pill chips labelled by length (`1w`, `2w`, `4w`, `10w`, `28w`, `中文7`). Clicking a chip sets `scrap.text = preset.text`.
- For `PAIRED` scraps, render `TEXT_SCRAP_PRESETS_PAIRED` as chips. Clicking sets both `title` and `subtitle`.
- Chips inherit the pill style already used in `PillRow` (monospace, 11px, border, active state optional). No "active" highlight needed — presets are one-shot fillers.
- Chips sit in a `flex flex-wrap gap-1` row to avoid overflowing on narrow columns.

Keep the raw textarea / title+subtitle inputs beneath as today so custom text remains primary.

---

## Implementation Plan

Ordered, each step independently verifiable.

### Step 1 — Text-scrap presets

1. Create `src/data/v9/textPresets.ts` with `TEXT_SCRAP_PRESETS_SINGLE` and `TEXT_SCRAP_PRESETS_PAIRED` as above.
2. Edit `src/components/v9/TextScrapEditor.tsx`:
   - Import the presets.
   - Above the `<textarea>` inside the SINGLE branch, render a `<div className="flex flex-wrap gap-1">` of `<button>` chips. Each click calls `update(s.id, { text: preset.text })`.
   - Above the paired `<input>` pair, render a chip row from `TEXT_SCRAP_PRESETS_PAIRED`. Each click calls `update(s.id, { title: preset.title, subtitle: preset.subtitle })`.
   - Chip style: reuse the existing "+ single" / "+ paired" button styling for visual consistency.

Verify: load `/`, expand Canvas & Content, click each preset chip on the seeded scrap, confirm canvas re-renders with the new text.

### Step 2 — Post-process group

3. Edit `src/components/v9/ParameterPanelV9.tsx`:
   - Cut the `<SliderRow label="Scrap Scale" …/>` and `<SliderRow label="Tightness" …/>` blocks out of the `Layout` group.
   - Paste them into a new `<Group title="Post-process" defaultOpen>` placed between Layout and Text Ratio.

Verify: both sliders appear under a clearly labelled "Post-process" group; moving the sliders still re-runs layout.

### Step 3 — Compact SliderRow

4. Edit `src/components/SliderRow.tsx`:
   - Label `width: '80px'` → `width: '68px'`.
   - Value `width: '48px'` → `width: '44px'` (keep font size).
   - Input `height: '32px'` → `height: '22px'`.
   - Outer wrapper `gap-3` → `gap-2`.
5. In `ParameterPanelV9.tsx`, inside `Group`'s inner content wrapper (`className="flex flex-col gap-2.5 px-2.5 pb-2.5 pt-1"`), change `gap-2.5` → `gap-1.5`.

Verify: `/`, `/v2`, `/v3` all still render sliders cleanly. No label truncation, no input overlap.

### Step 4 — Two-column parameter panel

6. Edit `src/components/v9/ParameterPanelV9.tsx`:
   - Outer wrapper `flex flex-col gap-3` → `grid grid-cols-1 md:grid-cols-2 gap-3`.
   - Add `md:col-span-2` to the `Canvas & Content` Group (it contains `TextScrapEditor` + multi-pill rows that need full width).
   - All other groups keep their default single-column span.
   - The Reset button stays in the last row: wrap it in a `md:col-span-2 flex justify-end` container.
7. Edit `src/components/v9/PlaygroundV9.tsx` and `src/components/v9/UploadSectionV9.tsx`:
   - Change `style={{ maxWidth: '720px' }}` on the panel wrapper → `style={{ maxWidth: '960px' }}`.

Verify: on a desktop viewport, the panel is two columns; on mobile (resize browser < 768px), it collapses to one column.

### Step 5 — Canvas height cap

8. Edit `src/components/v9/CanvasViewV9.tsx`:
   - Add `maxDisplayH?: number` to `Props`.
   - Apply `maxHeight: \`${maxDisplayH}px\`` to the outer `mx-auto w-full` wrapper (the one that currently applies `maxWidth`). The inner `aspect-ratio` container will auto-shrink its width to respect this.
9. Edit `src/components/v9/DualCanvasView.tsx`:
   - Pass `maxDisplayH={420}` to each `CanvasViewV9`. (Can be made responsive via a Tailwind class `max-h-[320px] md:max-h-[420px]` on the wrapper — simpler than reading viewport width in JS.)
   - Preferred: add a `className="max-h-[320px] md:max-h-[420px]"` to the existing column wrapper (`flex w-full flex-col gap-2 md:flex-1`) and remove the need for a new prop. This keeps the constraint purely CSS.

Verify the acceptance criterion (see Testing Plan): cycle through Canvas ratio 16:9 → 4:3 → 1:1 → 3:4 → 9:16 in Playground. The canvas region height stays constant (≤ 420px), canvases shrink horizontally for tall ratios, and the parameter panel never moves below the fold on a ≥ 900px viewport.

### Step 6 — DEVLOG entry

10. Append a `### Playground — Compact UI & Text Presets` section under `## 2026-04-23` in `DEVLOG.md` summarising the five fixes and the canvas-cap constant. Include the cross-page impact note for `SliderRow`.

---

## Data Model Changes

**None.** This change is purely presentational:

- No new types in `src/engine/v9/types.ts`.
- No new `ParamsV9` fields.
- No new engine entry points.
- `src/data/v9/textPresets.ts` is a static const export consumed only by `TextScrapEditor`.

---

## Testing Plan

### Automated

- `pnpm test` — must stay green (engine-v9 tests don't touch UI).
- `npx tsc --noEmit` — zero errors after `maxDisplayH` prop is added.
- `pnpm build` — production build succeeds.

### Manual smoke test (follow TESTING.md)

Run `pnpm dev` and verify on the `/` page (PlaygroundV9):

1. **Canvas height cap.** Cycle the Canvas ratio through `16:9`, `4:3`, `1:1`, `3:4`, `9:16`. Canvas region height stays constant (≤ 420 px desktop). Both canvases remain side-by-side with a visible gap. Parameter panel stays visible without scrolling on a 1440×900 viewport.
2. **Two-column panel.** At desktop width, verify the four non-Canvas groups render in two columns. Resize browser below 768px; verify single column.
3. **Post-process group.** Expand it, confirm `Scrap Scale` and `Tightness` sliders appear and their previous behaviour (overlap reduction / spreading) still works.
4. **Compact sliders.** Verify no label text is truncated for the longest labels (`Text Border Opacity`, `Phyllo sizeVar`, `Line Height`, `Max Retries`). Drag each slider — value updates smoothly, no layout shift.
5. **Text presets (single).** Add a SINGLE scrap. Click `1w`, `2w`, `4w`, `10w`, `28w`, `中文7` chips in turn. Each click replaces the textarea content and the canvas re-renders (after the existing 300ms debounce).
6. **Text presets (paired).** Add a PAIRED scrap. Click each paired preset. Both title and subtitle inputs update; canvas re-renders.
7. **Upload page parity.** Navigate to the "Try With Your Photos" section. Drop 3 photos. Repeat canvas-cap test (step 1) and preset test (steps 5–6) on this page.
8. **Classic routes.** Visit `/v2`. Confirm the classic `ParameterPanel` (via `SliderRow`) still renders cleanly with the new compact row height. No regressions.

### Regression check (DualCanvasView across breakpoints)

- Chrome DevTools responsive mode: iPhone 14 (390×844), iPad (820×1180), 1440×900 desktop, 1920×1080 desktop.
- Confirm at each breakpoint: canvases visible, parameter panel reachable, preset chips wrap cleanly.

---

## Risks & Mitigations

| Risk                                                                                           | Likelihood | Mitigation                                                                                                              |
|------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------------------|
| Canvas shrinks so much on 9:16 that text scraps become unreadable.                             | Low–Med    | 420px height cap produces ~236px canvas width at 9:16 — still enough for the v9 text estimator (min fs floors apply). If unreadable, raise cap to 480px. |
| Two-column panel crowds sliders at the `md` breakpoint (768px ≤ vw < 900px).                   | Low        | Slider label width is 68px, value 44px, leaving ~200px for the input — comfortable at a 440px column. If an edge case breaks, bump `md:grid-cols-2` to `lg:grid-cols-2`. |
| Compact SliderRow (22px height) makes the thumb too small to grab on touch.                    | Low        | Keep row padding generous; modern mobile browsers enforce a ~44px hit target on `<input type="range">` automatically regardless of visual size. |
| `TEXT_SCRAP_PRESETS_*` fixes text content — user edits are overwritten by a preset click.      | Expected   | This is the intended behaviour. No confirmation dialog — clicking a chip is a one-shot replace. Users can still type.   |
| Changes affect v1/v2 classic pages via shared `SliderRow`.                                     | Low        | Explicit smoke test on `/v2` in the manual plan. Height reduction is visually minor; worst case we fork a `SliderRowCompact` — not needed up-front. |
| Canvas `max-height` + `aspect-ratio` interaction has a browser quirk.                          | Very low   | Supported in Chrome 88+, Firefox 89+, Safari 15+. All modern. Verified by the recent commit `ab4ad44` that already computes display size in JS for overflow reasons — we're adding a smaller, CSS-only cap on top. |

---

## Out of scope

- Redesigning the parameter panel visually (colours, borders, group icons).
- Adding new params (e.g., `canvasMaxHeight`) to `ParamsV9`.
- Making the canvas height cap user-configurable.
- Adding presets for image sets (already covered by `IMG_SETS`).
- Changing the debounce timing for scraps/params.
- Touching the engine, types, or scoring.
