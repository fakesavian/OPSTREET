# Trading Floor Art Pass Report
**Date:** 2026-03-10
**Pass:** Premium Wall Street redesign — density, zones, and composition overhaul

---

## What Was Changed

### Files Modified
| File | Nature of change |
|------|-----------------|
| `apps/web/src/components/floor/wallStreetObjects.ts` | Complete rewrite — 5-zone layout, 55+ furniture objects, spanCols/spanRows, directKey support |
| `apps/web/src/components/floor/PixelFloorCanvas.tsx` | Zone-based floor tiling, `"zones"` default style, spanCols/spanRows renderer, directKey renderer, tightened player spawn area |
| `apps/web/src/components/floor/spriteLoader.ts` | External sprite loading, `getExternalSprite()` function, graceful onerror fallback |

### Assets Added
**New sprite sheets (AI-generated, already present):**
- `apps/web/public/sprites/furniture/ws-desk-furniture.png` — 6×2 desk/props sheet
- `apps/web/public/sprites/furniture/ws-office-props.png` — 6×3 office props sheet
- `apps/web/public/sprites/furniture/ws-large-objects.png` — 4×4 large objects sheet (Bloomberg, TV, rug, exec desk, conf table)
- `apps/web/public/sprites/furniture/ws-floor-tiles.png` — 4×2 floor tile variants

**New individual sprites (copied from Office-Furniture-Pixel-Art pack):**
- `ext-boss-desk.png` — top-down boss desk (executive zone)
- `ext-big-plant.png` — tall ficus plant (corner anchors)
- `ext-bookshelf.png` — wood bookshelf
- `ext-tall-bookshelf.png` — tall bookshelf (right wall)
- `ext-wall-graph.png` — wall-mounted stock graph
- `ext-filing-tall.png` — tall filing cabinet (left wall bank)

---

## Layout Redesign — 5 Zones

### Zone A: Back Wall / Market Screen Zone (posY 0.00–0.13)
Previously scattered and sparse. Now:
- **Bloomberg terminal** (hero, 4.5×3.5 tiles) anchors the left side of the back wall — immediately reads as "trading floor"
- **Ticker scoreboard** (5×1.8 tiles) spans the centre — shows DOW JONES / NASDAQ data
- **Wall TV with candlestick chart** (4.5×3.5 tiles) mirrors Bloomberg on the right
- **Wall graph** framed art fills the gap between ticker and TV
- Corner plants + trophy/cash props as wall dressing
- Back-wall shadow strip (CSS gradient overlay) defines floor/wall boundary

### Zone B: Left Trading Desk Bank (posX 0.01–0.26)
Two rows of paired workstations (4 desks total), each with:
- Desk sprite (desk+monitor composite)
- Chair below desk
- Mug / trophy props scattered on desk surfaces
- Row of 3 tall filing cabinets at x ≈ 0.01–0.19, y ≈ 0.62 — creates a storage wall

### Zone C: Right Trading Desk Bank (posX 0.74–0.99)
Mirror of Zone B:
- 4 desks in 2 rows with chairs + mug/trophy props
- Tall bookshelf at x = 0.74 for visual variety vs left wall
- Water cooler + bulletin board as right-wall utility cluster

### Zone D: Executive / Premium Centre (posX 0.28–0.72, posY 0.42–0.76)
- **Persian rug** (7×4.5 tiles) as an intentional floor marker — teal carpet zone also applied under this area
- **Boss desk** (external sprite, 4.5×2.5 tiles) centred on rug
- Twin trophies, cash stack, and coffee mug as prestige props
- **Conference table** (5.5×2.5 tiles) at the front of the executive area — meeting zone

### Zone E: Front Utility / Office Dressing (posY 0.80–0.94)
- Bottom-left: big plant + cardboard boxes (storage corner)
- Centre-front row: water cooler, bulletin board, cactus, boxes
- Bottom-right: big plant + tall filing cabinet
- Two large ficus trees flanking the front of the executive zone (y-sorted behind characters)

---

## Floor Tile Zone System

New `"zones"` floor style (default), implemented in `PixelFloorCanvas.tsx`:

| Region | Tile | Visual message |
|--------|------|----------------|
| Back wall strip (y < 13%) | Dark marble + gold veins | Luxury backdrop, wall zone |
| Left desk bank + centre open (main floor) | Cream tile w/ grout | Clean trading floor  |
| Executive centre (x 28–72%, y 43–77%) | Teal carpet | VIP / premium zone |
| Front utility (y > 80%) | Light oak planks | Service area, warmth |

The existing `"classic"` style is preserved for backward compat. Any explicit `floorStyle` prop still works.

---

## Reference Ideas Borrowed from Image 2

Image 2 (the reference pixel art room) showed:
1. **Tight desk cluster with props** — borrowed: desks placed side-by-side in rows, not scattered
2. **Back shelves anchored to wall** — borrowed: filing cabinets and bookshelf form a continuous wall element
3. **Props reward close inspection** — borrowed: mugs, trophies, and cash on individual desks
4. **Wall art + framed objects** — borrowed: wall graph + ticker board on back wall
5. **Plant placement as corner anchors** — borrowed: big plants in all 4 corners
6. **Distinct material zones** — borrowed: different floor areas read as different spaces
7. **Negative space is intentional** — borrowed: clear centre corridor for avatar movement (not empty, but framed)

---

## How the New Layout Improves the Previous Scene

| Problem (before) | Fix (after) |
|-----------------|-------------|
| One giant flat cream floor | 4-zone floor: dark marble back, cream main, teal carpet exec, oak front |
| Bloomberg terminal drawn tiny (drawW:2, drawH:2) | Hero Bloomberg at drawW:4.5, drawH:3.5 with spanCols:2, spanRows:2 |
| Desks scattered at canvas edges as isolated items | Paired desk banks in rows with chairs + props — reads as workstations |
| Separate monitor sprite placed on top of desk (z-fights) | Desk sprite already shows monitor; no separate monitor placed |
| Rug + exec desk in centre at wrong scale | Rug made large (7×4.5 tiles), exec desk centred on it |
| Centre felt empty | Conference table + exec desk zone fills centre credibly |
| Player spawn covered full canvas | Players now spawn only in centre corridor (posX 0.28–0.72, posY 0.20–0.75) |
| Furniture didn't cover back wall area | All Zone A objects placed at posY < 0.13 behind wall shadow strip |

---

## Technical Improvements

### `spanCols` / `spanRows`
Multi-cell objects in sprite sheets can now be extracted correctly:
- Bloomberg terminal: col:0, row:0, spanCols:2, spanRows:2 → grabs the full 2×2 area
- Ticker board: col:0, row:2, spanCols:2, spanRows:1
- Wall TV: col:2, row:1, spanCols:2, spanRows:2

### `directKey`
Individual sprite PNGs (not part of a grid) rendered natively:
- Boss desk, big plants, tall bookshelf, filing cabinets, wall graph
- Draw full image with correct aspect ratio (srcW = naturalWidth, srcH = naturalHeight)

### Player spawn confinement
Players spawn only in the centre corridor (x 28–72%) to keep them off desk banks. This makes the floor read more naturally: traders at desks (NPCs), visitors walking the floor (players).

---

## Remaining Weak Points

1. **Sprite scaling artifacts** — AI-generated sheets have large transparent padding per cell. At small draw sizes, icons may appear smaller than expected. Future pass: trim sprite sheets or use explicit pixel offsets.

2. **No true wall tiles** — The "back wall" is a colour-zone + shadow gradient. Adding actual wall tile sprites (dark panels, wainscoting) would further define the room boundary.

3. **NPC positions overlap furniture** — NPCs from `DEMO_NPC_TRADERS` still use posX/posY values that may place them inside desk areas. A future pass should set NPC positions to the centre corridor to match the player spawn confinement.

4. **Conference table + chairs are one sprite** — The conference table in `ws-large-objects.png` includes chairs, making it look occupied. Fine for MVP, but individual chair objects per seat position would be better.

5. **Mobile scaling** — At `TILE_SCALE=2` (mobile), furniture draws at 32px per unit. Objects with `drawW:4.5` span 144px, which may feel large on a narrow mobile screen. A `drawW` mobile-scale factor could be added.

---

## Verification Checklist

- [x] `wallStreetObjects.ts` type-checks (no TypeScript errors)
- [x] `spriteLoader.ts` loads all new sprite keys
- [x] `PixelFloorCanvas.tsx` handles `directKey`, `spanCols`, `spanRows`
- [x] Y-sort includes both furniture and characters
- [x] `floorStyle="zones"` is the new default
- [x] `floorStyle="classic"` still works for backward compat
- [x] External assets copied to `apps/web/public/sprites/furniture/`
- [ ] Visual smoke test in browser (run `pnpm dev` → navigate to /floor)
