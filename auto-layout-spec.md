# Auto Layout Engine — Implementation Spec

> Two layout algorithms for arranging images on a canvas. **Grid** produces gallery-wall-style aligned rows. **Phyllo** produces organic, freestyle arrangements. Both preserve exact aspect ratios and guarantee zero overlap.

---

## Shared Concepts

### Input

```
images[]            — array of { id, aspectRatio }  (aspectRatio = width / height)
canvasWidth         — canvas width in px
canvasHeight        — canvas height in px
seed                — integer seed for reproducible randomness
```

### Output

```
frames[]            — array of { id, x, y, width, height, rotation? }
```

All coordinates are in canvas-pixel space. `rotation` is degrees, only used by Phyllo.

### Shared Parameters (percentage-based)

Gap and padding are specified as **percentage of the canvas short edge**. This keeps visual proportions consistent across different canvas sizes and ratios.

```
shortEdge = min(canvasWidth, canvasHeight)
gapPx     = shortEdge * gapPercent / 100
paddingPx = shortEdge * paddingPercent / 100
```

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| gap | 4% | 1–8% | Space between images |
| padding | 6.5% | 2–12% | Canvas edge margin |

### Shared Utilities

**Seeded RNG** — any 32-bit PRNG. Reference uses Weyl-sequence hash:

```pseudo
function createRNG(seed):
    state = seed
    return function next():
        state = (state + 0x6D2B79F5) | 0
        t = imul(state ^ (state >>> 15), 1 | state)
        t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
```

**Rectangle edge-to-edge distance:**

```pseudo
function rectDist(A, B):
    dx = max(0, max(A.x, B.x) - min(A.x + A.w, B.x + B.w))
    dy = max(0, max(A.y, B.y) - min(A.y + A.h, B.y + B.h))
    return sqrt(dx² + dy²)
```

**Scale group to fit canvas padding:**

```pseudo
function scaleToFit(frames, canvasW, canvasH, padPx):
    bbox = boundingBox(frames)
    scaleX = (canvasW - padPx * 2) / bbox.width
    scaleY = (canvasH - padPx * 2) / bbox.height
    scale = min(scaleX, scaleY)
    if scale <= 1.01: return frames

    groupCenter = center(bbox)
    canvasCenter = (canvasW / 2, canvasH / 2)

    for each frame:
        frame.x = canvasCenter.x + (frame.x - groupCenter.x) * scale
        frame.y = canvasCenter.y + (frame.y - groupCenter.y) * scale
        frame.w *= scale
        frame.h *= scale

    return frames
```

**Perlin Noise 2D** — standard implementation with seeded permutation table. Used by Phyllo for rotation. Any library works; the key requirement is spatial coherence.

---

# Part 1: Grid Layout

> Images arranged in aligned rows, like frames on a gallery wall. Uses a Genetic Algorithm to search for the best binary-tree topology that maps images into rows.

## Algorithm Overview

```
┌─────────────────────────────────────────┐
│           GENETIC ALGORITHM              │
│                                          │
│  for each generation:                    │
│    for each tree in population:          │
│      frames = gridPipeline(tree)         │
│      tree.score = gridScore(frames)      │
│    select top 30% as survivors           │
│    fill rest with mutated survivors      │
│                                          │
│  return best tree's frames               │
└─────────────────────────────────────────┘

gridPipeline(tree):
  1. treeToRows(tree)       → rows of image groups
  2. treeAreas(tree)        → proportional area per image
  3. computeSizes(areas)    → width/height per image
  4. layoutExact(rows, sizes) → positioned frames with uniform gap
  5. scaleToFit(frames)     → enlarge to fill canvas padding
```

## Grid Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| areaLimit | 3.0 | 2–6 | Soft max ratio of largest/smallest image area |
| population | 50 | 30–100 | GA population size |
| generations | 40 | 20–80 | GA iteration count |

## Data Structures

### Binary Tree

```
TreeNode = Leaf | Internal

Leaf {
    type: "leaf"
    imageIndex: integer
    ratio: float            // set during ratio computation
}

Internal {
    type: "internal"
    cut: "H" | "V"         // H = horizontal split (rows stack), V = vertical (side by side)
    children: [TreeNode, TreeNode]
    ratio: float            // computed from children
}
```

The tree encodes both **which images are in which row** (H-cuts create row breaks) and **image ordering within rows** (V-cuts keep images side by side). The GA searches the space of possible trees to find the best arrangement.

## Step-by-Step

### 1. Tree Generation

**Random tree** — shuffled indices, random splits:

```pseudo
function randomTree(n, rng):
    indices = shuffle([0, 1, ..., n-1], rng)
    return buildSubtree(indices, rng)

function buildSubtree(indices, rng):
    if length(indices) == 1:
        return Leaf(imageIndex: indices[0])
    split = 1 + floor(rng() * (length(indices) - 1))
    cut = rng() > 0.5 ? "H" : "V"
    return Internal(cut, [
        buildSubtree(indices[0..split], rng),
        buildSubtree(indices[split..end], rng)
    ])
```

**Balanced tree** — ensures GA has reasonable starting points:

```pseudo
function balancedTree(indices, depth):
    if length(indices) == 1:
        return Leaf(imageIndex: indices[0])
    mid = ceil(length(indices) / 2)
    cut = depth % 2 == 0 ? "H" : "V"
    return Internal(cut, [
        balancedTree(indices[0..mid], depth + 1),
        balancedTree(indices[mid..end], depth + 1)
    ])
```

### 2. Tree → Rows

H-cuts create row breaks. V-cuts merge into same row.

```pseudo
function treeToRows(node):
    if node is Leaf:
        return [[node.imageIndex]]
    leftRows = treeToRows(node.children[0])
    rightRows = treeToRows(node.children[1])
    if node.cut == "H":
        return leftRows + rightRows          // stack: separate rows
    else:
        return [flatten(leftRows) + flatten(rightRows)]  // merge: one row
```

### 3. Compute Tree Ratios (bottom-up)

```pseudo
function computeRatio(node, images):
    if node is Leaf:
        node.ratio = images[node.imageIndex].aspectRatio
        return node.ratio
    r0 = computeRatio(node.children[0], images)
    r1 = computeRatio(node.children[1], images)
    if node.cut == "H":
        node.ratio = 1 / (1/r0 + 1/r1)     // stacked vertically
    else:
        node.ratio = r0 + r1                 // side by side
    return node.ratio
```

### 4. Distribute Areas

```pseudo
function treeAreas(tree, images, totalArea):
    computeRatio(tree, images)
    result = {}
    distributeArea(tree, totalArea, result)
    return result

function distributeArea(node, area, result):
    if node is Leaf:
        result[node.imageIndex] = area
        return
    r0 = node.children[0].ratio
    r1 = node.children[1].ratio
    if node.cut == "H":
        fraction = (1/r0) / (1/r0 + 1/r1)
    else:
        fraction = r0 / (r0 + r1)
    distributeArea(node.children[0], area * fraction, result)
    distributeArea(node.children[1], area * (1 - fraction), result)
```

Total area target: **canvas area × 0.55** (gives room to breathe; scaleToFit enlarges afterward).

### 5. Compute Sizes

```pseudo
function computeSizes(images, areaMap):
    sizes = {}
    for each image:
        area = areaMap[image.id]
        h = sqrt(area / image.aspectRatio)
        w = h * image.aspectRatio
        sizes[image.id] = { w, h }
    return sizes
```

### 6. Layout Exact

Place images into rows with uniform gap. **Key operation: unify height within each row.**

```pseudo
function layoutExact(rows, sizes, gapPx, canvasW, canvasH):
    // Build rows: scale all items in each row to same height
    builtRows = []
    for each row in rows:
        items = [{ id, w: sizes[id].w, h: sizes[id].h } for id in row]
        maxH = max(item.h for item in items)
        for each item:
            scale = maxH / item.h
            item.w *= scale
            item.h = maxH
        builtRows.append(items)

    // Measure
    rowWidths = [sum(item.w) + gapPx * (count - 1) for each row]
    rowHeights = [row[0].h for each row]
    maxRowW = max(rowWidths)
    totalH = sum(rowHeights) + gapPx * (rowCount - 1)

    // Scale to fit (88% of canvas, leaving margin)
    scale = min(canvasW * 0.88 / maxRowW, canvasH * 0.88 / totalH, 1.0)

    // Place: each row centered horizontally, group centered vertically
    frames = []
    y = (canvasH - (sum(h * scale for h in rowHeights) + gapPx * (rowCount - 1))) / 2

    for each (row, rowIndex):
        rowW = sum(item.w * scale for item in row) + gapPx * (count - 1)
        x = (canvasW - rowW) / 2
        for each item in row:
            frames.append({ id: item.id, x, y, w: item.w * scale, h: item.h * scale })
            x += item.w * scale + gapPx
        y += rowHeights[rowIndex] * scale + gapPx

    return frames
```

### 7. Mutation (3 operators)

```pseudo
function mutate(tree, rng):
    r = rng()
    if r < 0.4:
        // FLIP CUT: change a random internal node's cut direction
        pick random internal node → flip H↔V

    else if r < 0.7:
        // SWAP LEAVES: swap image assignments between two leaves
        pick two random leaves → swap imageIndex

    else:
        // RESTRUCTURE: rebuild a random subtree
        pick random internal node
        collect all leaf imageIndices beneath it
        shuffle them, build a new random subtree
        replace the node's contents
    return tree
```

### 8. Grid Scoring Function

**Multiplicative formula** — all factors must be decent. Prevents GA from "cheating" by maximizing one factor while ignoring others.

```pseudo
function gridScore(frames, canvasW, canvasH, gapPx, areaLimit):
    // Factor 1: Gap uniformity (weight 0.16)
    // How close are nearest-neighbor distances to target gap?
    for each frame: find nearest neighbor distance
    gapRMSE = sqrt(mean((nnDist - gapPx)²))
    gapScore = 1 / (1 + gapRMSE / gapPx)

    // Factor 2: Fill (weight 0.16)
    // Group bounding box area / canvas area
    fill = max(bboxArea / canvasArea, 0.01)

    // Factor 3: Compactness (weight 0.06)
    // Total image area / bounding box area
    compact = totalImageArea / bboxArea

    // Factor 4: Aspect match (weight 0.14)
    // Group bbox ratio should match canvas ratio
    aspectMatch = 1 / (1 + abs(log(groupRatio / canvasRatio)) * 0.8)

    // Factor 5: Row-width consistency (weight 0.18)
    // All rows should have similar width
    group frames by y → row widths
    rowWidthScore = minRowWidth / maxRowWidth

    // Factor 6: Row count balance (weight 0.16)  ← NEW in v20 fix
    // Penalize too many images per row
    maxPerRow = max images in any single row
    idealMaxPerRow = max(3, round(sqrt(n) * sqrt(canvasRatio)))
    rowCountOK = maxPerRow <= idealMaxPerRow
        ? 1.0
        : max(0.3, 1.0 - (maxPerRow - idealMaxPerRow) * 0.15)

    // Factor 7: Area balance (weight 0.14)
    areaRatio = maxArea / minArea
    areaOK = areaRatio <= areaLimit ? 1.0 : max(0, 1.0 - (areaRatio - areaLimit) * 0.15)

    return gapScore^0.16 * fill^0.16 * compact^0.06 * aspectMatch^0.14
         * rowWidthScore^0.18 * areaOK^0.14 * rowCountOK^0.16
```

**Key fix in updated scoring:** The `rowCountOK` factor penalizes layouts where too many images are crammed into a single row. The ideal max per row is `sqrt(n) × sqrt(canvasRatio)` — wider canvases tolerate more images per row, portrait canvases fewer.

### GA Configuration

```pseudo
function gridLayout(images, canvasW, canvasH, gapPx, padPx, seed):
    rng = createRNG(seed)
    POP = 50, GENS = 40

    // Initial population: 2 balanced + rest random
    population = [
        balancedTree(range(n), 0),
        balancedTree(range(n), 1),
        ...randomTrees(POP - 2)
    ]

    bestTree = population[0]
    bestScore = -1

    for gen in 0..GENS:
        scored = []
        for each tree in population:
            frames = gridPipeline(tree, images, canvasW, canvasH, gapPx)
            frames = scaleToFit(frames, canvasW, canvasH, padPx)
            score = gridScore(frames, canvasW, canvasH, gapPx)
            scored.append({ tree, frames, score })
        sort scored by score descending

        if scored[0].score > bestScore:
            bestScore = scored[0].score
            bestTree = clone(scored[0].tree)

        survivors = top 30% of scored (by score)
        nextPop = clone each survivor
        while nextPop.length < POP:
            parent = random pick from survivors
            child = mutate(clone(parent), rng)
            nextPop.append(child)
        population = nextPop

    return gridPipeline(bestTree) + scaleToFit
```

---

# Part 2: Phyllo Layout

> Named after **phyllotaxis** — the golden-angle spiral found in sunflower seed heads. Images bloom outward from the canvas center along an elliptical spiral, then a constraint solver ensures zero overlap with consistent gaps. Produces organic, freestyle collage arrangements.

## Algorithm Overview

```
┌─────────────────────────────────────────┐
│          MULTI-TRIAL SELECTOR            │
│                                          │
│  for trial in 0..maxTrials:              │
│    frames = phylloPipeline(trialSeed)    │
│    score = phylloScore(frames)           │
│    keep best                             │
│    if score > 0.7: stop early            │
│                                          │
│  return best frames                      │
└─────────────────────────────────────────┘

phylloPipeline(seed):
  1. sizeAssignment()          → target w/h per image (with hierarchy)
  2. spiralPlacement()         → initial positions along elliptical golden spiral
  3. constraintSolver()        → iteratively resolve overlaps + apply forces
  4. scaleToFit()              → enlarge to fill canvas padding
  5. postScaleOverlapFix()     → fast collision fix after scaling
  6. aestheticRotation()       → Perlin-noise micro-rotation
```

## Phyllo Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| sizeVar | 0.5 | 0–1 | Size hierarchy strength. 0=equal, 1=strong hero/accent |
| rotation | 1.0 | 0–1 | Rotation intensity. 0=none, 1=max ±7.5° |
| density | 0.55 | 0.15–0.55 | Initial area fill ratio. Lower=safer solve, scaleToFit fills canvas anyway |
| maxTrials | 10 | 1–20 | Seed variants to try, pick best. More=better quality, slower |

## Phase 1 — Size Assignment

```pseudo
function assignSizes(images, availW, availH, density, sizeVar, rng):
    // Shuffle into random importance order
    order = shuffle(images, rng)

    totalArea = availW * availH * density
    baseArea = totalArea / n

    for each (image, rank) in order:
        t = rank / max(n - 1, 1)                    // 0 → 1
        multiplier = 1 + (1 - t) * sizeVar * 1.2    // rank 0 biggest
        targetArea = baseArea * multiplier

    // Normalize so sum = totalArea
    normalize(targetAreas, totalArea)

    for each (image, rank):
        h = sqrt(targetArea[rank] / image.aspectRatio)
        w = h * image.aspectRatio
        image.w = w
        image.h = h
```

**Why density < 1.0?** The solver needs room to push images apart. Lower density = smaller initial images = more space = higher success rate. ScaleToFit enlarges everything to fill the canvas afterward, so low density doesn't mean small final output.

## Phase 2 — Elliptical Spiral Placement

```pseudo
PHI = (1 + sqrt(5)) / 2                        // ≈ 1.618
GOLDEN_ANGLE = 2π / PHI²                        // ≈ 137.508°

cx = canvasW / 2
cy = canvasH / 2
canvasRatio = availW / availH

// Ellipse radii stretch to match canvas shape
baseR = min(availW, availH) * 0.35
ellipseRx = baseR * max(1, sqrt(canvasRatio))    // wider for landscape canvas
ellipseRy = baseR * max(1, sqrt(1/canvasRatio))  // taller for portrait canvas

for each (image, rank) in order:
    angle = rank * GOLDEN_ANGLE + random(-0.2, 0.2)
    t = (rank == 0) ? 0 : sqrt(rank / n)          // Vogel's formula

    image.x = cx + cos(angle) * ellipseRx * t - image.w / 2
    image.y = cy + sin(angle) * ellipseRy * t - image.h / 2
```

**Why golden angle?** 137.5° is irrational — no two images share a radial line, creating maximum angular diversity. **Why elliptical?** A circular spiral wastes space on non-square canvases. Matching the ellipse to canvas ratio ensures images spread to fill the available shape.

## Phase 3 — Constraint Solver

Run up to **300 iterations**. Each iteration applies forces in order:

```
3a. Collision resolution        — push overlapping rectangles apart
3b. Anisotropic center gravity  — pull toward canvas center
3c. Canvas spread force         — push outward if group too compact
3d. Aspect ratio correction     — compress if group shape wrong
3e. Gap targeting               — pull distant neighbors closer
3f. Boundary clamp              — hard clamp to padding
```

Early exit if total overlap < 0.1px² and iteration > 40.

### 3a. Collision Resolution

```pseudo
decay = max(0.25, 1 - iter / MAX_ITERS)

for each pair (A, B):
    sepX = (A.w + B.w) / 2 + gapPx
    sepY = (A.h + B.h) / 2 + gapPx

    dx = centerX(A) - centerX(B)
    dy = centerY(A) - centerY(B)

    overlapX = sepX - abs(dx)
    overlapY = sepY - abs(dy)

    if overlapX > 0 AND overlapY > 0:
        pushFactor = 0.55 * decay

        if overlapX < overlapY:          // push along minimum overlap axis
            push = overlapX * pushFactor
            sign = (dx >= 0) ? +1 : -1
            A.x += sign * push
            B.x -= sign * push
        else:
            push = overlapY * pushFactor
            sign = (dy >= 0) ? +1 : -1
            A.y += sign * push
            B.y -= sign * push
```

**Direct position correction**, not spring forces. Each step directly separates overlapping rectangles by a fraction of their overlap, guaranteeing convergence.

### 3b. Anisotropic Center Gravity

```pseudo
gravBase = 0.035 * decay
gravX = gravBase * (canvasRatio < 1 ? 1.2 : 0.8)  // stronger on short axis
gravY = gravBase * (canvasRatio > 1 ? 1.2 : 0.8)

for each image:
    image.x += (cx - centerX(image)) * gravX
    image.y += (cy - centerY(image)) * gravY
```

### 3c. Canvas Spread Force

Active iterations 10 to 60%.

```pseudo
groupBBox = boundingBox(allImages)
targetW = availW * 0.85
targetH = availH * 0.85
spreadStr = 0.008 * decay

if groupBBox.w < targetW * 0.7:
    for each image:
        fromCenter = centerX(image) - cx
        image.x += fromCenter * spreadStr * 2

if groupBBox.h < targetH * 0.7:
    for each image:
        fromCenter = centerY(image) - cy
        image.y += fromCenter * spreadStr * 2
```

### 3d. Aspect Ratio Correction

Active same window as spread force.

```pseudo
groupR = groupBBox.w / groupBBox.h
targetR = availW / availH
arStr = 0.006 * decay

if groupR > targetR * 1.15:      // too wide → compress horizontally
    for each image: image.x += (cx - centerX(image)) * arStr
else if groupR < targetR * 0.85: // too tall → compress vertically
    for each image: image.y += (cy - centerY(image)) * arStr
```

### 3e. Gap Targeting

Active after 30% of iterations.

```pseudo
gapStr = 0.015 * decay

for each image A:
    B = nearest neighbor (by rectDist)
    if rectDist(A, B) > gapPx * 1.8:
        direction = normalize(center(B) - center(A))
        pull = (rectDist(A, B) - gapPx) * gapStr
        A.x += direction.x * pull
        A.y += direction.y * pull
```

### 3f. Boundary Clamp

```pseudo
for each image:
    image.x = clamp(image.x, padPx, canvasW - image.w - padPx)
    image.y = clamp(image.y, padPx, canvasH - image.h - padPx)
```

## Phase 4 — Scale to Fit

Use the shared `scaleToFit` function.

## Phase 5 — Post-Scale Overlap Fix

ScaleToFit can reintroduce overlaps. Run 50 fast collision iterations:

```pseudo
for iter in 0..50:
    anyOverlap = false
    for each pair (A, B):
        sepX = (A.w + B.w) / 2 + 1    // just 1px min gap
        sepY = (A.h + B.h) / 2 + 1
        ... same push logic as 3a, pushFactor = 0.52 ...
    clamp all to canvas (relaxed: padPx * 0.5)
    if not anyOverlap: break
```

## Phase 6 — Aesthetic Rotation

Applied AFTER all positioning is final (rotation doesn't affect collision geometry).

```pseudo
perlin = createPerlinNoise2D(seed)
freq = 0.007

for each (image, index):
    ncx = image.x + image.w / 2
    ncy = image.y + image.h / 2

    baseRot = perlin(ncx * freq, ncy * freq) * 6       // ±6° spatially coherent
    altBias = (index % 2 == 0 ? +1 : -1) * 1.5         // adjacent images lean opposite

    image.rotation = (baseRot + altBias) * rotationStrength
```

**Why Perlin?** Random rotation per image looks chaotic. Perlin ensures nearby images tilt similarly, creating a flowing wave pattern. The alternating bias adds variety within that flow.

## Phyllo Scoring Function

```pseudo
function phylloScore(frames, canvasW, canvasH, gapPx):
    // Hard disqualification
    overlapCount = countPairwiseOverlaps(frames)
    if overlapCount > 0: return -overlapCount

    // Aspect match: group bbox ratio vs canvas ratio
    groupR = bboxWidth / bboxHeight
    canvasR = canvasW / canvasH
    aspectMatch = 1 / (1 + abs(log(groupR / canvasR)) * 1.5)

    // Coverage: bbox area / canvas area
    coverage = min(bboxArea / canvasArea, 1)

    // Gap harmony: consistency of nearest-neighbor gaps
    for each image: find nearest neighbor distance → gaps[]
    cv = stddev(gaps) / mean(gaps)
    gapHarmony = 1 / (1 + cv * 2)

    return aspectMatch^0.35 * coverage^0.30 * gapHarmony^0.35
```

## Multi-Trial Selector

```pseudo
function bestPhylloLayout(images, canvasW, canvasH, params):
    bestFrames = null
    bestScore = -infinity

    for trial in 0..params.maxTrials:
        trialSeed = params.seed * 1000 + trial * 7 + 1
        frames = phylloPipeline(images, canvasW, canvasH, params, trialSeed)
        score = phylloScore(frames, canvasW, canvasH, gapPx)

        if score > bestScore:
            bestScore = score
            bestFrames = frames
            if score > 0.7: break      // good enough, stop early

    return bestFrames
```

---

# Integration Guide

## Both Algorithms Together

```pseudo
function autoLayout(images, canvasW, canvasH, mode, options):
    shortEdge = min(canvasW, canvasH)
    gapPx = shortEdge * options.gapPercent / 100
    padPx = shortEdge * options.paddingPercent / 100

    if mode == "grid":
        return gridLayout(images, canvasW, canvasH, gapPx, padPx, options.seed)
    else if mode == "phyllo":
        return bestPhylloLayout(images, canvasW, canvasH, {
            gapPx, padPx,
            seed: options.seed,
            sizeVar: options.sizeVar ?? 0.5,
            rotation: options.rotation ?? 1.0,
            density: options.density ?? 0.55,
            maxTrials: options.maxTrials ?? 10,
        })
```

## Minimal Grid (no GA)

If you only need a quick grid layout without GA optimization:

```pseudo
function simpleGrid(images, canvasW, canvasH, gapPx, padPx):
    tree = balancedTree(range(n), 0)
    rows = treeToRows(tree)
    areas = treeAreas(tree, images, canvasW * canvasH * 0.55)
    sizes = computeSizes(images, areas)
    frames = layoutExact(rows, sizes, gapPx, canvasW, canvasH)
    return scaleToFit(frames, canvasW, canvasH, padPx)
```

## For React / Web

- Layout computation = pure function returning `{ id, x, y, w, h, rotation }[]`
- Memoize with `useMemo` on all input parameters
- Render with CSS `position: absolute`, `left`, `top`, `width`, `height`
- Rotation via `transform: rotate(Xdeg)` with `transform-origin: center center`
- GPU-composited: use `will-change: transform` on image elements

## For Native / Backend

- Purely mathematical — no DOM or browser dependencies
- All coordinates are in abstract canvas-pixel space
- Rotation is degrees, applied at render time around element center

---

# Performance

| Scenario | Grid | Phyllo |
|----------|------|--------|
| 3–5 images | < 20ms | < 5ms × trials |
| 6–10 images | 20–50ms | 10–30ms × trials |
| 10–15 images | 50–100ms | 30–60ms × trials |

Grid's GA (50 pop × 40 gens = 2000 evaluations) dominates compute time for small counts. Phyllo's multi-trial (10 trials × O(n² × 300 iterations)) dominates for larger counts. Both are well within interactive budgets for ≤ 12 images.

For > 15 images, consider Web Worker offloading.

---

# Important Notes

1. **Seeded RNG is essential.** Same inputs + same seed = same output. Always.

2. **Aspect ratios are preserved exactly.** Both algorithms compute w/h from area + ratio. Images are never stretched.

3. **Gap/padding as percentages** ensure consistent visual proportions across canvas sizes.

4. **Grid scoring is multiplicative.** Do not change to additive. This prevents the GA from over-optimizing one factor.

5. **Phyllo density is a solver parameter, not a visual one.** Low density doesn't mean sparse output — scaleToFit fills the canvas regardless. It controls how much room the solver has to work.

6. **Post-scale overlap fix is essential for Phyllo.** ScaleToFit can amplify tiny gap errors into overlap. The 50-iteration fast fix catches these.

7. **Phyllo's multi-trial is what makes it reliable.** A single run may produce poor results. 8–15 trials with scoring selection dramatically improves consistency.
