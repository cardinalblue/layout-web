# Spec: Sample Photos + CTA-Gated Layout Generation

> Status: **PROPOSED** — 2026-04-23
>
> Scope: **UI + asset pipeline only.** No changes to the v9 engine, layout data model, scoring, or public types.
> Applies to `UploadSectionV9` (the "Try With Your Photos" section on `/v3`).
>
> Authoritative file under change: `src/components/v9/UploadSectionV9.tsx`.
> New assets: `test_images/*.jpg` → served from `public/test_images/`.

---

## Problem

Two pain points in the "Try With Your Photos" section:

1. **First-time users have nothing to try.** The section requires a drag-drop or file-pick before anything happens. Visitors who want to evaluate the algorithm in 5 seconds have to hunt for their own photos first. We now have 7 curated JPGs in `test_images/` (`test_002.jpg`, `test_004.jpg` … `test_009.jpg`) specifically meant to be offered as one-click samples — but they are not wired into the UI, and because they live at repo-root (not under `public/`) Next.js won't serve them at all.

2. **Layout regenerates immediately on every photo add/remove.** `UploadSectionV9.tsx:162-212` memoizes `items` / `layoutInput` / `grid` / `phyllo` on photo state, so adding a single photo instantly re-runs both Grid GA and Phyllo solver. This is (a) wasteful CPU when a user intends to add several photos before previewing, (b) disorienting when a user uploads one-at-a-time and sees partial layouts flicker, and (c) inconsistent with the "curate then generate" mental model the sample-photo flow wants to reinforce. The user's explicit ask: **"選擇照片後，會需要多一步進行點擊 CTA button 才執行 layout 演算與預覽"** — selection should stage, not execute; a CTA click runs layout.

The two problems are linked: the sample-photo affordance is the natural place to introduce "select, then generate" as the interaction model, and once introduced it should apply uniformly to uploads too — otherwise a user who adds one sample + one upload ends up with two different commitment models in the same flow.

---

## Solution

### 1. Serve the sample images

Move `test_images/` from repo root → `public/test_images/`. Next.js automatically serves anything under `public/` at the root URL path, so `public/test_images/test_002.jpg` becomes reachable at `/test_images/test_002.jpg`. No route config needed.

Record the sample set as a static const:

```ts
// src/data/v9/samplePhotos.ts  (new file)
export interface SamplePhoto {
  id: string;           // stable, e.g. 'sample-test_002'
  src: string;          // '/test_images/test_002.jpg'
  filename: string;     // 'test_002.jpg'
  aspectRatio: number;  // hard-coded so no runtime image probing needed
}

export const SAMPLE_PHOTOS: SamplePhoto[] = [
  { id: 'sample-test_002', src: '/test_images/test_002.jpg', filename: 'test_002.jpg', aspectRatio: /* filled in Step 1 */ 0 },
  // … test_004, 005, 006, 007, 008, 009
];
```

Aspect ratios are measured once at spec-apply time (see Implementation Plan, Step 1) and baked in. This keeps the Upload section render synchronous — no extra `<img>` onload latency before `genItems` can run. If a sample image is replaced later, the aspect ratio must be re-measured.

### 2. Sample Photo Picker UI

New component `SamplePhotoPicker` rendered in `UploadSectionV9` directly below `<DropZone>`, above `<ThumbnailRow>`:

```
┌────────────────────────────────────────────────┐
│  [DropZone — drag/drop or click]               │
├────────────────────────────────────────────────┤
│  Try with sample photos                        │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐            │
│  │02│ │04│ │05│ │06│ │07│ │08│ │09│  [All]    │
│  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘            │
├────────────────────────────────────────────────┤
│  [ThumbnailRow — staged uploads + samples]     │
└────────────────────────────────────────────────┘
```

Behaviour:
- Each sample thumbnail is a toggle button (56×56, same size as `ThumbnailRow` tiles for visual parity).
- Clicking a sample **stages** it into the same selection list as an upload. Clicking again removes it.
- Visual states: unselected = default border; selected = 2px `--accent-phyllo` ring + faint fill tint; hover = subtle lift.
- "All" button (rightmost): toggles between "select all 7 samples" and "deselect all 7". Disabled while `samplesSelected.length > 0 && samplesSelected.length < 7` is not a useful state — treat "All" as idempotent: if any sample unselected, click selects all; if all selected, click deselects all.
- `aria-pressed="true|false"` on each sample button for screen-reader state.

Samples and uploaded photos share the same staged list (see §3) — the picker only toggles whether each sample is included; it does not duplicate state.

### 3. Staged vs Committed state (the CTA gate)

Introduce two parallel photo lists in `UploadSectionV9`:

```ts
// Already exists, renamed for clarity:
const [stagedPhotos, setStagedPhotos] = useState<StagedPhoto[]>([]);
//                                       ^^^ was `photos`

// NEW:
const [committedPhotos, setCommittedPhotos] = useState<StagedPhoto[]>([]);

interface StagedPhoto {
  id: string;
  src: string;
  aspectRatio: number;
  filename: string;
  source: 'upload' | 'sample';  // track origin for revoke logic
}
```

- **Staged** = what the user has selected so far: uploaded files + toggled samples. Mutating this list does **not** re-run layout. `DropZone`, `ThumbnailRow`, `SamplePhotoPicker` all read/write `stagedPhotos`.
- **Committed** = the snapshot that feeds `genItems` / `runGridV9` / `runPhylloV9`. Only `handleGenerate()` (CTA click) or `handleReset()` writes to this.

Derived state:
- `hasCommittedContent = committedPhotos.length > 0 || debouncedScraps.some((s) => s.text.length > 0)` — gates whether the canvas region renders. Replaces today's `hasContent` which reads from `photos`.
- `isDirty = !photosEqual(stagedPhotos, committedPhotos)` — true whenever the staged list diverges from the last generation. Drives the CTA's label/prominence.
- `photosEqual(a, b)` compares by `id` multiset (order-insensitive) — order only matters inside `genItems`, which re-seeds from the RNG anyway.

### 4. The Generate CTA

New component `GenerateLayoutButton` rendered between the "samples + uploads" row and the dual-canvas region:

```
[ Generate Layout → ]     ← primary CTA, prominent
  10 photos staged · click to render
```

States:

| Scenario                                        | Enabled | Label                       | Visual               |
|-------------------------------------------------|---------|-----------------------------|----------------------|
| `stagedPhotos.length === 0 && scraps empty`     | no      | "Generate Layout"           | muted                |
| `stagedPhotos.length > 0, committed empty`      | yes     | "Generate Layout"            | primary, pulsing once on first appearance |
| `isDirty === true` post-generation              | yes     | "Regenerate"                 | primary              |
| `isDirty === false` post-generation             | no      | "Up to date"                 | muted checkmark      |

Placement: full-width on mobile, right-aligned above the canvas on desktop. Always visible when any staged content exists, so the user knows the action is there before they've committed.

Keyboard: `Enter` anywhere in the upload region focuses-then-activates the CTA when enabled.

### 5. Text-scrap interaction with the CTA

Text scraps already have a 300ms debounce (`scrapTimer`) and flow through `debouncedScraps` → `items`. Decision for this spec: **text scraps remain live-edit**, they do NOT participate in the CTA gate.

Rationale:
- Scraps are edited in a textarea where live feedback (watching the text wrap in the canvas) is most of the value.
- The user's ask mentions photos specifically ("選擇照片後"); text was not called out.
- Keeping scraps live avoids teaching the user two gating rules for one section.

Consequence: if `stagedPhotos === committedPhotos` but the user edits a scrap, the canvas still re-renders automatically via the existing `debouncedScraps` pipeline. CTA label stays at "Up to date" (not dirty) because it tracks only photo state.

### 6. Reset behaviour

`handleReset()` already clears params and scraps. Extend it to:
- Revoke `URL.createObjectURL` for every `upload`-sourced staged/committed photo (avoid leaks).
- Clear both `stagedPhotos` and `committedPhotos`.
- Clear sample selections (automatic — derived from `stagedPhotos`).
- Reset params/scraps as today.

Sample photos don't need `URL.revokeObjectURL` (they use static `/test_images/...` URLs, not blob URLs), but the `source: 'upload' | 'sample'` tag makes the revoke loop safe to differentiate.

### 7. Parameter changes still live

`debouncedParams` feeds `layoutInput`, which the memoized `runGridV9` / `runPhylloV9` consume. Once `committedPhotos` is non-empty, slider/preset tweaks continue to re-render at 100ms debounce as today. The CTA only gates the *photo commitment* step; interactive tuning is untouched.

---

## Implementation Plan

Each step independently verifiable. Follows TESTING.md verification flow at the end.

### Step 1 — Move samples into `public/` and measure aspect ratios

1. Create `public/` directory (does not exist yet).
2. Move `test_images/` → `public/test_images/` (git `mv`, preserve history).
3. Measure each sample's native `width × height` using a one-off Node script or `sips -g pixelWidth -g pixelHeight` (macOS). Record aspect ratios to 4 decimal places.
4. Create `src/data/v9/samplePhotos.ts` exporting `SamplePhoto` interface + `SAMPLE_PHOTOS: SamplePhoto[]` const with seven entries, aspect ratios baked in.

Verify: `pnpm dev`, open `/test_images/test_002.jpg` in browser — image loads.

### Step 2 — Extract `StagedPhoto` type and rename local state

5. In `src/components/v9/UploadSectionV9.tsx`:
   - Rename local `UploadedPhoto` interface → `StagedPhoto`, add `source: 'upload' | 'sample'` field.
   - Rename state `photos` → `stagedPhotos`, `setPhotos` → `setStagedPhotos`.
   - In `processFiles`, tag new photos with `source: 'upload'`.
   - Add new state `const [committedPhotos, setCommittedPhotos] = useState<StagedPhoto[]>([])`.
   - Add helper `function photosEqual(a: StagedPhoto[], b: StagedPhoto[]): boolean` — compare by sorted `id[]`.
   - Add derived `const isDirty = !photosEqual(stagedPhotos, committedPhotos)`.

Verify: `npx tsc --noEmit` passes. UI still behaves identically because no downstream wiring changed yet (committed always empty initially but canvas region keyed off `hasContent` which still reads from staged — fix in Step 3).

### Step 3 — Wire layout pipeline to `committedPhotos`

6. In `UploadSectionV9.tsx`:
   - Replace the three call sites that use `photos` for layout computation (`hasContent`, `items` memo at 162, `imageSources` memo at 214) to use `committedPhotos` instead.
   - Keep `stagedPhotos` as the source of truth for `ThumbnailRow` display (user sees what they've selected, even before generation).
   - Rename `hasContent` → `hasCommittedContent` and re-derive: `committedPhotos.length > 0 || debouncedScraps.some(...)`.

Verify: dev server, upload 2 photos → thumbnails appear but canvas region stays hidden (because nothing is committed yet). This is the expected transient state; Step 4 adds the commit mechanism.

### Step 4 — Add `GenerateLayoutButton` and commit handler

7. Create `src/components/v9/GenerateLayoutButton.tsx`:
   - Props: `{ stagedCount: number; isDirty: boolean; hasCommitted: boolean; onClick: () => void }`.
   - Derives enabled/label/visual per the table in §4 above.
   - Styled with existing design tokens (reuse `ShuffleButton` visual language for primary state; muted variant uses `--text-tertiary`).

8. In `UploadSectionV9.tsx`:
   - Add `const handleGenerate = useCallback(() => setCommittedPhotos(stagedPhotos), [stagedPhotos])`.
   - Render `<GenerateLayoutButton>` above `<DualCanvasView>` in the `hasCommittedContent || stagedPhotos.length > 0` branch. (So the CTA appears as soon as anything is staged, even pre-first-generation.)
   - Adjust the outer section layout: the block that currently only renders when `hasContent` should split — CTA visibility is driven by `stagedPhotos.length > 0 || hasCommittedContent`, canvas visibility stays on `hasCommittedContent`.

9. Extend `handleReset` to revoke blob URLs for `source: 'upload'` photos on both staged and committed lists, then clear both.

Verify: upload 3 photos → CTA appears labelled "Generate Layout" (primary) → click → canvas renders with 3 photos. Add a 4th photo → CTA switches to "Regenerate" (primary, isDirty). Click → canvas updates.

### Step 5 — Add `SamplePhotoPicker`

10. Create `src/components/v9/SamplePhotoPicker.tsx`:
    - Props: `{ stagedPhotos: StagedPhoto[]; onToggle: (sample: SamplePhoto) => void; onToggleAll: () => void }`.
    - Renders a horizontal `flex gap-2 overflow-x-auto` row of `<button>` tiles, one per `SAMPLE_PHOTOS` entry, plus a final "All" control.
    - `isSelected(id) = stagedPhotos.some(p => p.id === sample.id)` — derived, no internal state.
    - Each button: 56×56, `<img src={sample.src}>` filling it, selected ring applied via `box-shadow: 0 0 0 2px var(--accent-phyllo)` and subtle `::after` overlay.
    - "All" button width 56, square, label "All" or icon "⊕/⊖" (plain text is safer per AGENTS.md — no emoji).

11. In `UploadSectionV9.tsx`:
    - Add `handleSampleToggle(sample)` that inserts `{ ...sample, source: 'sample' }` into `stagedPhotos` if absent, removes it if present (match by `id`).
    - Add `handleToggleAllSamples()` that either adds all missing samples or removes all sample-sourced entries.
    - Render `<SamplePhotoPicker>` below `<DropZone>` and above `<ThumbnailRow>`. Wrap with a small heading: `<p className="font-heading text-xs uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Try with sample photos</p>`.

Verify: click sample tile → appears in ThumbnailRow with selected ring in picker → click again → removed from both. "All" toggles all seven in/out.

### Step 6 — DEVLOG entry

12. Append to `DEVLOG.md` under `## 2026-04-23`:
    - **Sample photos in `public/test_images/`** — 7 curated JPGs, aspect ratios baked into `src/data/v9/samplePhotos.ts`. Rationale: serve via Next.js static pipeline, avoid runtime image probing.
    - **CTA-gated layout generation** — Upload section now stages photo selection; `GenerateLayoutButton` commits. Rationale: user wants deliberate commit step, not live re-render on each photo add. Text scraps remain live-edit (scope decision).
    - **State split** — `stagedPhotos` (display, selection) vs `committedPhotos` (layout input). `isDirty` drives the CTA label between "Generate Layout" / "Regenerate" / "Up to date".

---

## Data Model Changes

**None in the engine.** All changes are confined to:

- Static asset directory (`public/test_images/`).
- New static const module `src/data/v9/samplePhotos.ts` (7-entry array of `SamplePhoto`).
- Local component state in `UploadSectionV9.tsx` (`committedPhotos` added, `photos` → `stagedPhotos`, `source` field on `StagedPhoto`).
- New UI components (`SamplePhotoPicker`, `GenerateLayoutButton`).

No changes to `src/engine/v9/types.ts`, no new `ParamsV9` fields, no new `LayoutV9Input` fields.

---

## Testing Plan

### Automated

- `pnpm test` — existing suite must stay green. No new unit tests are strictly required (pure UI wiring), but add one:
  - `src/__tests__/photosEqual.test.ts` — `photosEqual([], []) === true`; order-insensitive for same ids; `false` when ids differ; `false` when lengths differ.
- `npx tsc --noEmit` — zero errors after new types.
- `pnpm build` — production build succeeds; verify `public/test_images/*.jpg` ship in the build output under `.next/` static assets.

### Manual smoke test (follow TESTING.md on `/v3`)

1. **Samples load.** Scroll to "Try With Your Photos". Sample picker shows 7 thumbnails with visible content (not broken `<img>` icons). Hovering shows filename tooltip.
2. **Sample toggle.** Click sample 02 → appears in `ThumbnailRow`, sample 02 tile shows selected ring. Click sample 02 in picker again → removed from ThumbnailRow, ring disappears. Click sample 02 in ThumbnailRow's × → same effect (single source of truth).
3. **"All" toggle.** Click "All" → all 7 stage. Click again → all 7 unstage.
4. **CTA states.** Empty state → CTA muted. Stage 3 samples → CTA becomes "Generate Layout" primary. Click → canvas renders. Add a 4th (upload or sample) → CTA becomes "Regenerate". Remove one so staged === committed → CTA shows "Up to date" muted.
5. **Upload path.** Drop a file into DropZone → stages, CTA goes dirty. Verify `source: 'upload'` behaviour by clicking Reset — blob URLs revoked (check DevTools memory profiler or console for no errors; ObjectURL leaks would show as warnings).
6. **Text scrap live-edit.** With committed photos, open Text Scrap editor, type in a scrap → canvas re-renders live (no CTA click needed). CTA stays "Up to date" (text doesn't participate in gate).
7. **Parameter live-edit.** Drag Gap slider → both canvases update within 100ms debounce. CTA unaffected.
8. **Reset.** Click Reset in ParameterPanel → all staged + committed photos clear, canvas region disappears, CTA disappears (no staged content), params reset.
9. **Mobile (375×667).** Sample picker scrolls horizontally cleanly. CTA is full-width below the upload area. ThumbnailRow wraps/scrolls as today.
10. **Keyboard.** Tab into sample picker — each tile focuses with ring. Space/Enter toggles. Tab to CTA — Enter fires generate.

### Regression

- `/v2` unchanged (different UploadSection component, different code path).
- Classic `PlaygroundV9` on `/v3` unaffected (no photos there).
- Canvas + parameter behaviour after first commit identical to pre-change (the gate is pre-commit only).

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| User doesn't notice the CTA and thinks upload is broken ("I uploaded but nothing happened"). | Med | CTA animates in on first stage with a one-shot pulse; thumbnail row shows a subtle "Click Generate →" hint below on dirty-empty-committed state. |
| Moving `test_images/` → `public/test_images/` drops files from git history or from a dev's untracked-but-in-use folder. | Low | Use `git mv`, verify with `git log --follow public/test_images/test_002.jpg` post-move. Since `test_images/` is listed in `git status` as untracked, a plain `mv` + `git add public/test_images/` is equivalent. |
| Hard-coded aspect ratios drift if sample files are replaced. | Low | Add a comment in `samplePhotos.ts` noting "re-measure on replacement"; optionally add a dev-only assertion that compares runtime `naturalWidth/Height` against the baked ratio on first load (warn in console). Defer to nice-to-have. |
| `committedPhotos` blob URLs from uploads held onto indefinitely if user clears staged photos but not committed. | Low–Med | Today's `removePhoto` revokes on staged removal. After this change, a photo can live in `committedPhotos` after being removed from `stagedPhotos`. Fix: revoke only when removed from BOTH lists (reference count). Implement as: remove-from-staged does NOT revoke; revoke happens in `handleGenerate` (for committed photos no longer in staged) and `handleReset` (all). Document in Step 4. |
| Rapid click on sample picker + upload races with CTA enable check. | Very low | React state updates are batched; CTA re-renders after each state change. No observable issue. |
| "All" sample toggle when user has already staged some samples + uploads behaves unexpectedly. | Low | Defined explicitly in §2: "All" idempotently syncs samples to all-selected; if already all-selected, deselects all. Upload-sourced staged photos are untouched by "All". |
| Pressing Enter in a scrap textarea accidentally fires the Generate CTA. | Med | Scope the "Enter activates CTA" behaviour to the upload region (drop zone / sample picker / thumbnail row), not the full section. Simplest: skip the global Enter shortcut in this spec; CTA click/tap is enough. Decision: drop the Enter shortcut from §4 unless requested. |

---

## Open Decisions (confirm before `/opsx:apply`)

1. **Does the CTA gate apply to uploads too, or only samples?**
   - This spec assumes **both** — staged-then-commit for everything, unified model.
   - Alternative: only samples gate; uploads stay live as today. Simpler, but creates a dual mental model within one section.
   - Recommendation: keep unified (as written). Low implementation cost, cleaner UX.

2. **Sample set presentation order.** Filenames sort as `test_002, 004, 005 … 009`. Show in filename order or curated order? This spec uses filename order.

3. **"All" button label.** Text "All" vs a symbol. This spec uses "All" (no emoji per AGENTS.md).

4. **Drop the Enter-activates-CTA shortcut** (§4)? This spec drops it to avoid the textarea collision noted in Risks.

Ask me to flip any of these before I proceed.

---

## Out of Scope

- Adding more sample photos, editing existing ones, or user-uploadable sample management.
- Generating sample photos dynamically or proxying a remote photo library.
- CTA gating in `PlaygroundV9` (no uploads there — not applicable).
- Changing the v2 `UploadSection` (`src/components/UploadSection.tsx`) — `/v2` route is classic/archived behaviour.
- Persisting staged selections across reloads (localStorage).
- A "preview on hover" state for sample tiles.
- Animating the transition between staged → committed.
