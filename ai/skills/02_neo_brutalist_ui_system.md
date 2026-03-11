# Skill 02 — Neo‑Brutalist UI System (Cream + Dots + Thick Borders)

## Purpose
Create a **reusable design system** that matches the OPFun neo‑brutal references:
cream surfaces, yellow dotted background, thick black borders, brutal shadows, pill badges, readable contrast.

## Trigger
- Dark sections must be removed.
- “Make it match the reference images” (landing/token/floor).
- Inconsistent spacing/typography across pages.

## Inputs
- Design refs (images)
- Existing CSS/Tailwind setup
- Existing component library location

## Outputs
- Shared primitives: `FrameShell`, `Panel`, `Pill`, `Button` variants
- Page background utility for dotted yellow
- CSS variables for spacing + border radius + shadow

## Steps
1) **Decide where the system lives**
   - Prefer `apps/web/src/components/ui/` or `packages/ui/`
   - Define one source of truth for colors + spacing.

2) **Add CSS variables**
   - Create/extend `apps/web/src/styles/theme.css` (or global css)
   - Recommended variables:
     - `--cream: #F6E9D8` (adjust to match refs)
     - `--yellow: #F4C534`
     - `--ink: #111`
     - `--border: 3px solid var(--ink)`
     - `--r-lg: 22px`
     - `--shadow: 6px 6px 0 var(--ink)`
     - `--layout-y-pad: 24px`

3) **Dotted background (SVG tile)**
   - Create `apps/web/public/patterns/dots.svg` (or inline data URI)
   - Apply on page wrapper:
     - `background-color: var(--yellow);`
     - `background-image: url('/patterns/dots.svg');`
     - `background-repeat: repeat;`
     - `background-size: <match-ref>;`

4) **Build primitives**
   - `FrameShell`: centered cream frame with border+shadow
   - `Panel`: cream card with border+shadow
   - `Pill`: rounded, bordered, small padding
   - Buttons:
     - Yellow filled (primary)
     - Outline (secondary)
     - Green BUY, Red SELL

5) **Typography rules**
   - Titles: heavy, large, black
   - Body: readable size, black
   - Never use low‑contrast gray on cream.

6) **Apply across pages**
   - Replace dark panels with `Panel` default (cream)
   - Ensure nav text is black.
   - Remove hardcoded paddings → use `--layout-y-pad`.

## Done criteria
- Any page can be assembled from primitives without custom one-off styling.
- Screenshots look consistent: cream surfaces + dots + thick borders + brutal shadows.

## Common failure modes
- Dots too big/small: adjust `background-size`.
- Shadow inconsistent: ensure one shared token.
- Border radius mismatch: match refs.

## Rollback plan
- Keep primitives behind feature flag (or only apply to new pages first).
- Commit in small steps: tokens → landing → token page.
