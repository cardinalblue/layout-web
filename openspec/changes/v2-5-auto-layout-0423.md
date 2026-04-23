# V2.5 Auto Layout — spec 0423-1 alignment

> **✅ COMPLETED 2026-04-23** — Shipped. All 13 implementation steps done, `pnpm test` 50/50 green, `npx tsc --noEmit` clean, `pnpm build` compiles 4 routes (`/`, `/v1`, `/v2`, `/v2-5`). Default landing is `/v2-5`; V2 retained for A/B.
>
> **Scope delta vs original proposal** (decided during `/opsx:apply`):
> - URL is `/v2-5` (hyphen), not `/v2_5` (underscore).
> - **Component duplication** used instead of engine-as-prop refactor. `src/components/v2-5/` × 6 files (HeroSectionV2_5, AnimatedDemoV2_5, AlgorithmIntroV2_5, TextLogicExplainerV2_5, PlaygroundV2_5, UploadSectionV2_5); V2 components completely untouched.
> - Default redirect switched directly to `/v2-5` with no observation window.
>
> **Post-ship fix** (not in original proposal): `AnimatedDemoV2_5` added a mount-gate (SSR placeholder + `useEffect(setMounted(true))`) to eliminate a hydration mismatch. Root cause: 50×40-iteration GA consumes enough floating-point ops that Node SSR and browser V8 can produce ULP-level score differences, which flipped sort-by-score order of borderline genomes → different tree structure → different frames. Fix is localized to the hero animation; engine-level code stays pure/deterministic.
>
> **Artifacts**
> - Spec: `spec/auto-layout-text-spec-0423-1.md` (§Grid → Mutation Operators, §Phyllo → Multi-Trial Selector, §Post-Processing → applyScrapScale)
> - Engine: `src/engine/v9_5/` (copy of v9 + 3 corrections)
> - Components: `src/components/v2-5/` × 6
> - Route: `src/app/v2-5/page.tsx`
> - Tests: `src/__tests__/engine-v9_5.test.ts`
> - Switcher / redirect: `src/components/VersionSwitcher.tsx`, `src/app/page.tsx`
>
> **Follow-ups** (deliberately out of scope, captured for later):
> 1. `AnimatedDemoV9` on `/v2` has the same latent hydration risk as `AnimatedDemoV2_5` had before the fix. V2's current GA path hasn't surfaced it in testing, but the same 4-line mount-gate should be applied if it does.
> 2. V2 retirement: once V2.5 has soaked, delete `src/engine/v9/`, `src/components/v9/` (or the subset not shared), `src/app/v2/`, and the `v2` entry in `VersionSwitcher`. Separate change proposal.
>
> ---
>
> *Original proposal below, retained for traceability.*

---

## Problem

The 0423-1 spec audit surfaced 3 algorithm behaviors in the current V2 engine (`src/engine/v9/`) that diverge from the now-authoritative spec. Each has a real UX impact:

1. **Grid GA undersearches** — mutation is mutually exclusive between tree ops and ratio ops, and ratio-mutation only touches one text item per offspring. Effective search of both spaces is halved.
2. **Phyllo gives up early** — multi-trial early-exit fires at score 0.75 (right above the `minScore=70` gate), so ~half the configured trial budget is wasted on "good enough" layouts instead of hunting for the best.
3. **Scrap Scale visually distorts layouts** — `applyScrapScale` is multiplicatively anchored to the smallest frame, so a 500-unit frame grows up to 10× more than a 50-unit frame. At 10% slider the layout collapses.

We want to:
- Ship the corrected engine without losing the ability to compare against V2 (so designers / reviewers can A/B).
- Default first-time visitors to the improved version.
- Keep the corrections spec-traceable — every change points at a named section in `spec/auto-layout-text-spec-0423-1.md`.

## Solution

Create a parallel engine module `src/engine/v9_5/` that duplicates the v9 source tree and applies the 3 corrections in-place. Refactor the 3 engine-consuming components (`PlaygroundV9`, `UploadSectionV9`, `AnimatedDemoV9`) to accept the engine via prop, so both `/v2` and `/v2_5` pages can share them — only the engine module differs.

Add `/v2_5` to the route table, extend `VersionSwitcher` with a V2.5 pill, and point the root redirect at `/v2_5`.

This keeps V2's output bit-identical to today's behavior (no regression for existing reviews) while V2.5 delivers the corrected algorithm. If V2 is retired later, only the `engine/v9/` folder and the `/v2` route need to go away.

### Why parallel engine instead of in-place update

- **Rollback safety.** If the compound-mutation change regresses on a specific text configuration, we flip the default back to `/v2` with a one-line change.
- **A/B verification.** The visible comparison (same seed, same inputs, two routes) is how we will validate the corrections empirically before retiring V2.
- **Spec traceability.** `engine/v9/` ↔ spec 0422-1, `engine/v9_5/` ↔ spec 0423-1. Unambiguous mapping.

### Why engine-as-prop over component duplication

Duplicating `PlaygroundV9` / `UploadSectionV9` / `AnimatedDemoV9` (≈800 LOC total) just to swap one import pair per file is mechanical debt. A typed `EngineModule` prop is ~30 LOC of scaffolding and keeps the UI single-sourced.

---

## Implementation Plan

### Step 1 — Create `src/engine/v9_5/` by copying v9

Duplicate every file under `src/engine/v9/` into `src/engine/v9_5/` verbatim. Target file list (no content changes yet):

- `src/engine/v9_5/grid.ts` ← copy of `src/engine/v9/grid.ts`
- `src/engine/v9_5/phyllo.ts` ← copy of `src/engine/v9/phyllo.ts`
- `src/engine/v9_5/shared.ts` ← copy of `src/engine/v9/shared.ts`
- `src/engine/v9_5/layout.ts` ← copy of `src/engine/v9/layout.ts`
- `src/engine/v9_5/items.ts` ← copy of `src/engine/v9/items.ts`
- `src/engine/v9_5/text.ts` ← copy of `src/engine/v9/text.ts`
- `src/engine/v9_5/types.ts` ← copy of `src/engine/v9/types.ts`

The copied `layout.ts` imports from `./grid`, `./phyllo`, `./shared` — all paths remain relative, so the copy works as-is without path edits.

### Step 2 — Apply correction #1: Grid compound mutation

File: `src/engine/v9_5/grid.ts`, function `mutateGenome` (currently lines ~100–160).

Replace the mutually-exclusive branch structure with compound mutation per `spec/auto-layout-text-spec-0423-1.md` §Grid Layout → Mutation Operators:

```ts
function mutateGenome(
  g: Genome,
  rng: RNG,
  items: Item[],
  ratioMode: RatioMode,
  enableRatioMutation: boolean,
  NW: number,
  minFS: number,
): Genome {
  const c = cloneGenome(g);

  // Step 1 — structural mutation: always pick exactly one tree op
  const r = rng();
  if (r < 0.4) {
    const ns = nodesT(c.tree);
    if (ns.length) {
      const nd = ns[Math.floor(rng() * ns.length)];
      nd.cut = nd.cut === 'H' ? 'V' : 'H';
    }
  } else if (r < 0.7) {
    const lv = leavesT(c.tree);
    if (lv.length >= 2) {
      const i = Math.floor(rng() * lv.length);
      let j = Math.floor(rng() * (lv.length - 1));
      if (j >= i) j++;
      [lv[i].ii, lv[j].ii] = [lv[j].ii, lv[i].ii];
    }
  } else {
    const ns = nodesT(c.tree);
    if (ns.length) {
      const nd = ns[Math.floor(rng() * ns.length)];
      const ids = leavesT(nd).map((l) => l.ii);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      function rb(a: number[]): TreeNode {
        if (a.length === 1) return { t: 'L', ii: a[0] };
        const m = 1 + Math.floor(rng() * (a.length - 1));
        return { t: 'N', cut: rng() > 0.5 ? 'H' : 'V', c: [rb(a.slice(0, m)), rb(a.slice(m))] };
      }
      const rebuilt = rb(ids);
      if (rebuilt.t === 'N') {
        nd.cut = rebuilt.cut;
        nd.c = rebuilt.c;
      }
    }
  }

  // Step 2 — ratio mutation: additive, per-text-item independent
  if (enableRatioMutation) {
    const textItems = items.filter((im): im is Extract<Item, { isText: true }> => im.isText);
    for (const ti of textItems) {
      if (rng() < 0.5) {
        const [lo, hi] = textRatioRange(ti.text, ti.isPaired, ti.subtitle, ratioMode, NW, minFS);
        const current = c.textRatios[ti.id] ?? ti.ratio;
        c.textRatios[ti.id] = mutateRatio(current, lo, hi, rng, 0.25);
      }
    }
  }

  return c;
}
```

### Step 3 — Apply correction #5: Phyllo early-exit 0.85

File: `src/engine/v9_5/phyllo.ts`, function `bestPhyllo`.

Change the early-exit threshold:

```ts
// before: if (sc > 0.75) break;
if (sc > 0.85) break;
```

Per `spec/auto-layout-text-spec-0423-1.md` §Phyllo Layout → Multi-Trial Selector.

### Step 4 — Apply correction #7: `applyScrapScale` constant-px inflation

File: `src/engine/v9_5/shared.ts`, function `applyScrapScale`.

Replace with constant-unit inflation per spec §Post-Processing → `applyScrapScale`:

```ts
export function applyScrapScale(frames: Frame[], scaleUnits: number): Frame[] {
  if (!frames.length || scaleUnits <= 0) return frames;
  return frames.map((f) => ({
    ...f,
    x: f.x - scaleUnits,
    y: f.y - scaleUnits,
    w: f.w + 2 * scaleUnits,
    h: f.h + 2 * scaleUnits,
  }));
}
```

The old multiplicative implementation (`grow = 1 + (scaleUnits / smallest) * 2`) is deleted.

### Step 5 — Define a shared `EngineModule` interface

New file: `src/engine/engineModule.ts`

```ts
import type { LayoutV9Input, LayoutV9Result, Item, TextScrapInput, RatioMode, NormalizedCanvas } from './v9/types';

export interface EngineModule {
  runGrid: (input: LayoutV9Input) => LayoutV9Result;
  runPhyllo: (input: LayoutV9Input) => LayoutV9Result;
  genItems: (args: {
    imgCount: number;
    textScraps: TextScrapInput[];
    ratioMode: RatioMode;
    seed: number;
    setId: string;
    NW: number;
    minFS: number;
    textBoxSize: number;
    imageRatios?: number[];
    imageIds?: string[];
  }) => Item[];
  normalizedCanvas: (canvasRatio: number) => NormalizedCanvas;
  label: 'v9' | 'v9.5';
}
```

Also create two concrete modules:

- `src/engine/v9/engine.ts`:
  ```ts
  import type { EngineModule } from '../engineModule';
  import { runGridV9, runPhylloV9 } from './layout';
  import { genItems } from './items';
  import { normalizedCanvas } from './shared';
  export const v9Engine: EngineModule = {
    runGrid: runGridV9,
    runPhyllo: runPhylloV9,
    genItems,
    normalizedCanvas,
    label: 'v9',
  };
  ```
- `src/engine/v9_5/engine.ts`:
  ```ts
  import type { EngineModule } from '../engineModule';
  import { runGridV9, runPhylloV9 } from './layout';
  import { genItems } from './items';
  import { normalizedCanvas } from './shared';
  export const v9_5Engine: EngineModule = {
    runGrid: runGridV9,
    runPhyllo: runPhylloV9,
    genItems,
    normalizedCanvas,
    label: 'v9.5',
  };
  ```

Note `runGridV9` / `runPhylloV9` symbols keep their original names inside v9_5/ — no rename needed; the engine label disambiguates.

### Step 6 — Refactor engine-consuming components to accept `engine` prop

Three components currently import the engine directly:
- `src/components/v9/PlaygroundV9.tsx` (lines 4–7)
- `src/components/v9/UploadSectionV9.tsx` (lines 4–7)
- `src/components/v9/AnimatedDemoV9.tsx` (lines 4–6)

For each:
1. Remove the direct `import { runGridV9, runPhylloV9 } from '../../engine/v9/layout';`, `import { genItems } from '../../engine/v9/items';`, `import { normalizedCanvas } from '../../engine/v9/shared';` lines.
2. Keep type-only imports (`import type { ... } from '../../engine/v9/types';`) — these don't change.
3. Add an `engine: EngineModule` prop (required). Import the type:
   ```ts
   import type { EngineModule } from '../../engine/engineModule';
   ```
4. Replace every call site:
   - `runGridV9(...)` → `engine.runGrid(...)`
   - `runPhylloV9(...)` → `engine.runPhyllo(...)`
   - `genItems({...})` → `engine.genItems({...})`
   - `normalizedCanvas(...)` → `engine.normalizedCanvas(...)`

### Step 7 — Update `/v2` page to pass `v9Engine`

File: `src/app/v2/page.tsx`

Wrap the three engine-consuming components with the explicit engine prop:

```tsx
import { v9Engine } from '../../engine/v9/engine';
// ...
<PlaygroundV9 engine={v9Engine} />
<UploadSectionV9 engine={v9Engine} />
// AnimatedDemoV9 is rendered inside PlaygroundV9 / AlgorithmIntroV9 — see Step 8.
```

Note: `AnimatedDemoV9` is used inside `AlgorithmIntroV9`. Since `AlgorithmIntroV9` itself doesn't call the engine, we have two options:
- (A) thread `engine` prop through `AlgorithmIntroV9` → `AnimatedDemoV9` (cleaner, explicit)
- (B) export two pre-bound components: `AnimatedDemoV9Bound = (props) => <AnimatedDemoV9 {...props} engine={v9Engine} />` plus a v9.5 variant

Pick (A) for consistency. Thread the prop through `AlgorithmIntroV9`.

### Step 8 — Create `/v2_5` page

New file: `src/app/v2_5/page.tsx`

Copy `src/app/v2/page.tsx` verbatim, then:
- Rename component `V2Page` → `V2_5Page`.
- Change the engine import: `import { v9_5Engine } from '../../engine/v9_5/engine';`
- Pass `engine={v9_5Engine}` to every engine-consuming component.

All section padding / fade-in / Footer / Hero content stays unchanged — this is purely an engine swap.

### Step 9 — Extend `VersionSwitcher`

File: `src/components/VersionSwitcher.tsx`

Add the v2.5 entry. The current matching logic uses `pathname.startsWith(v.href)` which is order-sensitive: `/v2_5` starts with `/v2`, so V2 would incorrectly claim the active state on `/v2_5`. Two fixes:

- Put v2.5 before v2 in the `VERSIONS` array so `find` matches v2.5 first.
- Or switch to exact-match: `pathname === v.href || pathname.startsWith(v.href + '/')`.

Use the exact-match form (safer; doesn't depend on array order). Updated file:

```ts
const VERSIONS = [
  { key: 'v1', href: '/v1', label: 'V1', short: '1' },
  { key: 'v2', href: '/v2', label: 'V2', short: '2' },
  { key: 'v2_5', href: '/v2_5', label: 'V2.5', short: '2.5' },
];

// In the component:
const active =
  VERSIONS.find((v) => pathname === v.href || pathname.startsWith(v.href + '/'))?.key ?? 'v2_5';
```

Default fallback changes `'v2' → 'v2_5'`.

Pill width: V2.5 pill has a 3-character label; existing `minWidth: '32px'` and `padding: '0 10px'` should handle it. Verify visually during smoke test.

### Step 10 — Update root redirect

File: `src/app/page.tsx`

```ts
import { redirect } from 'next/navigation';
export default function RootPage() {
  redirect('/v2_5');
}
```

### Step 11 — Add regression tests for the 3 corrections

New file: `src/__tests__/engine-v9_5.test.ts`

Three test cases, each pinned to a specific correction:

1. **Scrap Scale constant-px** — build a synthetic 2-frame set where frames differ 10×. Run `applyScrapScale(frames, 20)`. Assert both frames grew by exactly `2×20 = 40` in width and height, i.e., the difference between v9 (multiplicative) and v9.5 is observable and in v9.5 both grow equally.
2. **Phyllo early-exit threshold** — run `bestPhyllo` with a forced short-circuit hook (mock `scorePhyllo` to return 0.80 on first trial) and assert v9.5 does NOT break early (continues to trial 2), while v9 would. If mocking is too invasive, cover this behaviorally: with identical seed, assert v9.5 runs ≥ as many trials as v9 on a low-signal input (monotonic check).
3. **Grid compound mutation** — run `runGA` on a 2-text-item input, snapshot the set of `(tree-structure, textRatios)` pairs explored across the population over 40 generations. Assert v9.5 reaches a strictly larger cardinality than v9 for the same seed.

Also add a parity test: on a 3-image-only input (no text), v9 and v9.5 must produce identical frames for every seed in `[1..20]`. This proves the corrections only fire when text is involved (for #1) or when the Scrap Scale slider is non-zero (for #7).

### Step 12 — Verification

Per `CLAUDE.md` → TESTING.md gate:
1. `pnpm test` — all existing + new tests pass
2. `npx tsc --noEmit` — zero TypeScript errors
3. `pnpm build` — production build succeeds
4. Smoke test:
   - Visit `/` → redirected to `/v2_5`
   - Switcher shows V1 / V2 / V2.5 pills; V2.5 is active
   - Click V2 → URL changes, V2 pill active, V2.5 inactive
   - Same seed + same inputs on both pages → V2 and V2.5 produce *different* layouts when text is present (visible diff) and *identical* layouts when only images are present
   - Scrap Scale slider @ 10% on V2.5 shows uniform inflation (no huge-frame blowout)

### Step 13 — DEVLOG

Append to `DEVLOG.md`:

```md
## 2026-04-23

### V2.5 route with spec 0423-1 corrections
- **New parallel engine** at `src/engine/v9_5/` with 3 algorithm fixes: Grid compound mutation, Phyllo early-exit 0.85, `applyScrapScale` constant-px inflation.
- **Engine-as-prop refactor** of `PlaygroundV9` / `UploadSectionV9` / `AnimatedDemoV9` so V2 and V2.5 pages share UI but swap engines via `EngineModule`.
- **Root redirect** now points at `/v2_5`. V2 retained for A/B comparison.

Rationale: the three corrections in `spec/auto-layout-text-spec-0423-1.md` are behaviorally observable (GA search depth, trial budget utilization, post-processing distortion). Shipping as a parallel route keeps a rollback path and lets reviewers A/B before we retire V2.
```

---

## Data Model Changes

None. `LayoutV9Input`, `LayoutV9Result`, `Frame`, `Item`, `TextScrapInput` all carry over unchanged from v9 types. The `EngineModule` interface is a new pure-function-grouping type — no persisted schema, no API surface touched.

---

## Testing Plan

| Test | File | Assertion |
|------|------|-----------|
| applyScrapScale constant-px (v9.5) | `src/__tests__/engine-v9_5.test.ts` | Two frames of 50u and 500u, scaleUnits=20 → both grow by 40u in w and h |
| applyScrapScale multiplicative (v9) unchanged | `src/__tests__/engine-v9.test.ts` (or new) | Preserves existing behavior — confirms we didn't accidentally change v9 |
| Phyllo early-exit deeper (v9.5) | `src/__tests__/engine-v9_5.test.ts` | With a contrived input that scores ~0.80 consistently, v9.5 completes full trial budget; v9 exits after first trial |
| Grid compound mutation (v9.5) | `src/__tests__/engine-v9_5.test.ts` | For 2-text + 2-image input, seed=42, run 40 generations: v9.5 unique genomes > v9 unique genomes |
| Image-only parity | `src/__tests__/engine-v9_5.test.ts` | For seeds 1..20, image-only inputs, v9 frames == v9.5 frames |
| Route switcher | manual smoke | V2 → V2 active, V2.5 → V2.5 active, startsWith false-match avoided |
| Default redirect | manual smoke | `/` → `/v2_5` |
| Build integrity | `pnpm build` | Clean build with no unresolved imports |

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| `VersionSwitcher` startsWith bug makes V2.5 click land visually on V2 | High if not addressed | Exact-match comparison (Step 9); verified in smoke test |
| Scrap Scale visual change surprises reviewers who expected old behavior | Medium | V2 route retained; DEVLOG + spec reference in changelog |
| `AnimatedDemoV9` is rendered inside `AlgorithmIntroV9` which is also in V1 page — unexpected prop requirement breaks V1 | Low | V1 uses different components entirely (`AlgorithmIntro.tsx`, not `AlgorithmIntroV9.tsx`); verify by grep before editing |
| Compound mutation explores too aggressively and destabilizes good seeds | Low–Medium | Retained under `ratioSearch` toggle (user-facing); ratio mutation only runs when flag is on |
| Phyllo 0.85 early-exit never triggers on hard inputs, making every layout exhaust the full 30 trials (~2× slower) | Medium | Performance budget check during smoke test; `phylloTrials` slider already ranges down to 3 for users who need speed |
| Duplicated engine drift over time (fixes applied to v9 but not v9_5 or vice versa) | Medium (if V2 lives long) | DEVLOG entry explicitly calls out v9 = 0422-1, v9_5 = 0423-1. When V2 is retired, delete `engine/v9/` + `app/v2/` + `v9Engine` in one commit |
| `/v2_5` underscore in URL is non-idiomatic | Low (cosmetic) | Acceptable given Next.js route-segment rules; alternative `/v2-5` requires different folder naming. Keep `/v2_5` for consistency with existing `/v1`, `/v2` |

---

## Out of Scope

- The other 5 items from the 0423-1 audit (Phyllo area formula, trial seed, t=0 anchor, retrySeed, applyTightness) — code already matches spec after the 0423-1 documentation update. No code change needed.
- Retiring V2 / deleting `engine/v9/`. Scheduled for a separate follow-up proposal once V2.5 has been reviewed and validated.
- Port tests from `engine-v9.test.ts` to cover v9.5 exhaustively. We add three targeted correction tests + a parity test; the broader suite can be added if V2.5 becomes the only engine.
