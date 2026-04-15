# Design System

## 1. Visual Theme & Atmosphere

**Spirit:** PicCollage warmth meets Stripe precision. Approachable, celebration-focused, but with refined editorial + technical beauty. Every pixel is intentional — no default spacing, no generic shadows.

**Keywords:** warm, editorial, precise, organic-meets-structured, premium-casual

## 2. Color Palette & Roles

### Core Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg` | `#FAFAF8` | Page background (warm off-white, not sterile) |
| `--surface` | `#FFFFFF` | Cards, panels — with `0.5px solid #E8E4DD` border |
| `--canvas-bg` | `#0C0C10` | Canvas dark background — images pop against dark |
| `--text-primary` | `#1A1A1A` | Headings, body text |
| `--text-secondary` | `#6B6B6B` | Descriptions, labels |
| `--text-tertiary` | `#A0A0A0` | Hints, placeholders |
| `--border-subtle` | `rgba(0,0,0,0.06)` | 1px borders — paper edge feel |
| `--border-surface` | `#E8E4DD` | Surface card borders |

### Accent Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-grid` | `#2D7A4F` | Grid mode — muted forest green (structured, reliable) |
| `--accent-grid-hover` | `#348F5C` | Grid hover — lighten 8% |
| `--accent-phyllo` | `#C9A84C` | Phyllo mode — warm gold (organic, premium) |
| `--accent-phyllo-hover` | `#D4B65E` | Phyllo hover — lighten 8% |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--danger` | `#D94444` | Overlap warning, error states |
| `--success` | `#3A9A5A` | Zero overlap confirmed |

## 3. Typography

### Fonts

| Role | Family | Weight | Style |
|------|--------|--------|-------|
| Display | `Newsreader` | 400 | italic — hero headings, algorithm names |
| Heading | `Outfit` | 600 | normal — section titles, labels |
| Body | `Outfit` | 400 | normal — descriptions, paragraphs |
| Mono | `JetBrains Mono` | 400 | normal — parameter values, stats, technical details |

### Type Scale

| Token | Size | Line Height | Weight | Family |
|-------|------|-------------|--------|--------|
| `--text-display` | 56px | 1.1 | 400 | Newsreader italic |
| `--text-h1` | 36px | 1.2 | 600 | Outfit |
| `--text-h2` | 24px | 1.3 | 600 | Outfit |
| `--text-h3` | 18px | 1.4 | 600 | Outfit |
| `--text-body` | 16px | 1.6 | 400 | Outfit |
| `--text-body-sm` | 14px | 1.5 | 400 | Outfit |
| `--text-caption` | 12px | 1.4 | 400 | Outfit |
| `--text-mono` | 14px | 1.4 | 400 | JetBrains Mono |

## 4. Spacing & Layout

### Spacing Scale

Base unit: 4px. Tokens: `--sp-1` through `--sp-20`.

| Token | Value |
|-------|-------|
| `--sp-1` | 4px |
| `--sp-2` | 8px |
| `--sp-3` | 12px |
| `--sp-4` | 16px |
| `--sp-5` | 20px |
| `--sp-6` | 24px |
| `--sp-8` | 32px |
| `--sp-10` | 40px |
| `--sp-12` | 48px |
| `--sp-16` | 64px |
| `--sp-20` | 80px |

### Grid System

- Max content width: 960px
- Canvas max width: 640px
- Page horizontal padding: 16px (mobile), 24px (tablet), 32px (desktop)
- Section vertical spacing: 80px (mobile), 120px (desktop)

### Density

- Component padding: 16px default, 12px compact
- Card padding: 24px (mobile), 32px (desktop)
- Slider row height: 44px (touch-friendly)

## 5. Component Patterns

### Pill Button

- Height: 44px (primary CTA), 36px (secondary)
- Padding: 0 24px (primary), 0 16px (secondary)
- Border radius: `--radius-pill` (9999px)
- Active state: `scale(1.02)` transform
- Font: Outfit 600, 14px

### Slider Row

- Layout: label (left) · value (right) · slider (full width below)
- Thumb: 20px circle, accent color, 2px focus ring
- Track: 4px height, `#E8E4DD` bg, accent color for filled portion
- Min touch target: 44px

### Canvas Frame

- Background: `--canvas-bg` (#0C0C10)
- Inner shadow: `inset 0 1px 3px rgba(0,0,0,0.3)`
- Border radius: `--radius-lg` (16px)
- Max width: 640px, aspect ratio maintained via padding-bottom

### Stats Bar

- Layout: horizontal row of label–value pairs
- Value font: JetBrains Mono, 14px
- Number transition: 200ms ease on value change
- Overlap count: red (`--danger`) when > 0

### Score Bar

- Full-width track, filled portion proportional to score
- Track: 4px height, `rgba(0,0,0,0.06)` bg
- Fill: accent color with 200ms width transition

## 6. Motion & Animation

### Transitions

| Token | Duration | Easing | Usage |
|-------|----------|--------|-------|
| `--ease-default` | 150ms | `cubic-bezier(0.4, 0, 0.2, 1)` | Hover, focus, slider feedback |
| `--ease-emphasis` | 300ms | `cubic-bezier(0.4, 0, 0.2, 1)` | Mode switch, section fade-in |
| `--ease-bounce` | 400ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Shuffle button click |

### Specific Animations

- **Canvas crossfade**: opacity 0→1, 200ms on mode switch
- **Phyllo params slide**: height 0→auto, 300ms on mode switch
- **Stats number change**: CSS transition on `--num` custom property, 200ms
- **Scroll fade-in**: translateY(20px) + opacity(0) → translateY(0) + opacity(1), 600ms via IntersectionObserver
- **Hero demo cycle**: crossfade between Grid/Phyllo every 3s
- **Shuffle bounce**: scale(0.95) → scale(1.02) → scale(1), 400ms

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## 7. Texture & Signature Elements

- **Noise overlay**: SVG noise texture at 2% opacity on page background — prevents flat-screen feeling
- **Paper-edge borders**: 1px `rgba(0,0,0,0.06)` — not solid gray
- **Canvas inner shadow**: images feel like looking into a frame
- **Rotation micro-shadows**: Phyllo images cast deeper shadows when tilted
- **Image hover glow**: 2px accent color at 20% opacity on canvas image hover

## 8. Accessibility

### WCAG Target

AA compliance minimum.

### Contrast

- Text primary on background: 13.5:1 (exceeds AAA)
- Text secondary on background: 5.2:1 (exceeds AA)
- Text tertiary on background: 3.0:1 (use only for decorative/non-essential text)
- Accent grid on white: 4.9:1 (AA for large text)
- Accent phyllo on white: 3.1:1 (use with larger text or dark bg)

### Focus States

- 2px solid accent color, 2px offset
- Visible on all interactive elements
- Custom slider thumb: 3px focus ring

### Semantic HTML

- `<main>` for page content
- `<section>` with `aria-labelledby` for each page section
- `<h1>` → `<h2>` → `<h3>` hierarchy (no skips)
- Canvas preview: `role="img"` with `aria-label` describing layout

## 9. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Small elements, tags |
| `--radius-md` | 10px | Buttons, inputs |
| `--radius-lg` | 16px | Cards, canvas frame |
| `--radius-xl` | 24px | Large panels |
| `--radius-pill` | 9999px | Pill buttons, toggles |

## 10. Shadow System

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-subtle` | `0 1px 2px rgba(0,0,0,0.04)` | Resting state, tags |
| `--shadow-card` | `0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` | Cards, panels |
| `--shadow-elevated` | `0 8px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)` | Dropdowns, modals |
| `--shadow-canvas` | `inset 0 1px 3px rgba(0,0,0,0.3)` | Canvas inner shadow |
| `--shadow-image` | `0 2px 8px rgba(0,0,0,0.25)` | Images on canvas |
| `--shadow-image-tilted` | `0 4px 12px rgba(0,0,0,0.35)` | Rotated Phyllo images |
