# Skill 03 — Pixel‑Match Layout (Desktop + Mobile)

## Purpose
Make UI look **indistinguishable** from reference images via a tight screenshot + adjust loop.

## Trigger
- “Make it exactly like this screenshot.”
- Layout feels close but not “tight.”

## Inputs
- Reference images (desktop + mobile)
- Target breakpoints (e.g., 1440px desktop, ~390px mobile)

## Outputs
- Updated page layout + spacing + typography
- Screenshot artifacts to compare

## Steps
1) **Lock target sizes**
   - Desktop: 1440px wide viewport
   - Mobile: 390px wide (or your chosen iPhone target)

2) **Implement structure first**
   - Frame → top nav → main grid → panels
   - Don’t micro‑tune fonts until the grid matches.

3) **Screenshot loop**
   - Run dev server
   - Capture:
     - Desktop @1440
     - Mobile @390
   - Save to `apps/web/__screenshots__/...` or `docs/screens/`

4) **Adjust in priority order**
   - Panel sizes + alignment
   - Padding/margins
   - Border radius + border thickness
   - Shadow offsets
   - Typography sizes/weights
   - Icon sizes

5) **Use layout tokens**
   - Avoid random numbers—tie to CSS variables:
     - `--layout-y-pad`, `--panel-gap`, etc.

6) **Confirm responsive behavior**
   - Use CSS grid:
     - Desktop: 2-col (left wide, right narrow)
     - Mobile: stacked order per reference
   - Ensure no horizontal scroll.

## Done criteria
- Side-by-side comparisons show near-identical spacing and proportions.
- No layout jumps between hydration and render.

## Common failure modes
- Tweaking typography before grid is right (wastes time).
- Not locking viewport sizes.
- Mixing per-component custom paddings.

## Rollback plan
- Keep changes isolated to page-specific layout file + shared primitives only.
