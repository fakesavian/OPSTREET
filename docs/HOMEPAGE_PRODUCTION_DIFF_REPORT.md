# Homepage Production Diff Report

Generated: 2026-03-10

---

## 1. Summary

The production Vercel deployment is serving commit `18575ea` from `origin/main`, which contains the new OPSTREET `page.tsx` and `landing/` components but is missing the three foundational style files (`globals.css`, `layout.tsx`, `tailwind.config.ts`) that were redesigned locally as part of the OPSTREET neo-brutalist rebrand. Those three files have **uncommitted local changes only** — they were never staged, committed, or pushed. Additionally, ten new UI components (`apps/web/src/components/opfun/`), one context file (`NotificationContext.tsx`), and a set of public assets (`public/assets/opfun/`, `public/opstreet/`, `public/sprites/`) are **untracked** and were never committed. As a result, Vercel built the correct page content on top of the old dark `html.dark bg-zinc-950` shell, producing a dark OPFun appearance instead of the intended cream/yellow OPSTREET neo-brutalist design.

---

## 2. Production Commit

| Item | Value |
|------|-------|
| Latest pushed commit | `18575ea` — `fix(web): remove stale pledgeProject import from FeedClient` |
| Branch | `main` → `origin/main` (local HEAD is in sync with remote) |
| Contains OPSTREET `page.tsx`? | ✅ Yes — new OPSTREET `page.tsx` and all `landing/` components were committed in `5313a29` / `dc096dc` |
| Contains OPSTREET `layout.tsx`? | ❌ No — production `layout.tsx` is the OLD dark version (`html.dark`, `bg-zinc-950`, uses `MobileNav` + `WalletButton`) |
| Contains OPSTREET `globals.css`? | ❌ No — production `globals.css` still sets `body { @apply bg-[#0a0a0a] text-zinc-100 }` |
| Contains OPSTREET `tailwind.config.ts`? | ❌ No — production Tailwind config has no neo-brut tokens (`ink`, `opYellow`, `hard` box-shadows, `border-3` width) |

---

## 3. Local vs Production File Diff

### 3a. Files that differ (modified locally, NOT committed)

| File | Status | What changed |
|------|--------|--------------|
| `apps/web/src/app/globals.css` | Modified (uncommitted) | Entire body background changed from `bg-[#0a0a0a] text-zinc-100` to `var(--bg-yellow)` halftone dot grid; added 250+ lines of neo-brut CSS variables, `.op-panel`, `.op-btn-primary`, `.op-btn-outline`, `.op-pill`, `.block-timer-bar`, `.op-card-hover`, `.scrollbar-hide`, plus remapped all legacy `.card`, `.token-card`, `.btn-primary`, `.btn-secondary`, `.input`, `.label` classes |
| `apps/web/src/app/layout.tsx` | Modified (uncommitted) | Changed `<html>` from `lang="en" className="dark"` to `lang="en"`; changed `<body>` from `bg-zinc-950` to `flex min-h-screen flex-col`; replaced old dark header + `MobileNav` + `WalletButton` with `OpHeader`, `OpBottomNav`, `BlockTimerBar`, `NotificationProvider`; title changed from `"OPFun Secure Launchpad"` to `"OpStreet"` |
| `apps/web/tailwind.config.ts` | Modified (uncommitted) | Added `darkMode: "class"`; added colors `ink`, `cream`, `opYellow`, `opGreen`, `opRed`; added `boxShadow` variants `hard`, `hard-sm`, `hard-lg`, `hard-xl`; added `borderWidth` `"3"` and `"4"`; added keyframes + animations `slide-down`, `count-pop`, `pulse-dot` |

### 3b. Files that are untracked (never committed, never pushed)

#### New UI Components

| File | Purpose |
|------|---------|
| `apps/web/src/components/opfun/OpHeader.tsx` | New OPSTREET nav header (replaces old dark header in layout) |
| `apps/web/src/components/opfun/OpBottomNav.tsx` | Mobile bottom navigation bar |
| `apps/web/src/components/opfun/BlockTimerBar.tsx` | Bitcoin block countdown bar (top of layout) |
| `apps/web/src/components/opfun/NotificationDropdown.tsx` | Notification bell dropdown |
| `apps/web/src/components/opfun/OpFAB.tsx` | Floating action button |
| `apps/web/src/components/opfun/OpIcon.tsx` | Icon wrapper component |
| `apps/web/src/components/opfun/OpPanel.tsx` | Panel primitive |
| `apps/web/src/components/opfun/OpPill.tsx` | Pill/tag primitive |
| `apps/web/src/components/opfun/OpTickerStrip.tsx` | Ticker strip component |
| `apps/web/src/components/opfun/TokenCard.tsx` | Token card component |

#### Context

| File | Purpose |
|------|---------|
| `apps/web/src/context/NotificationContext.tsx` | `NotificationProvider` consumed by the new `layout.tsx` |

#### Public Assets (untracked)

| Path | Notes |
|------|-------|
| `apps/web/public/assets/opfun/**` | SVG icons, brand wordmark, background tiles (`halftone_tile.svg`, `dot_grid_tile.svg`), UI frames — referenced by `globals.css` via `var(--dot-grid)` |
| `apps/web/public/opstreet/**` | Brand logo PNG, landing hero image, shop item images |
| `apps/web/public/sprites/**` | Pixel character sprites |

### 3c. Files already committed and live on production (no action needed)

| File | Status |
|------|--------|
| `apps/web/src/app/page.tsx` | ✅ Committed & pushed — OPSTREET page content |
| `apps/web/src/components/landing/HeroSection.tsx` | ✅ Committed & pushed |
| `apps/web/src/components/landing/HowItWorksSection.tsx` | ✅ Committed & pushed |
| `apps/web/src/components/landing/FeatureCardsStrip.tsx` | ✅ Committed & pushed |
| `apps/web/src/components/landing/RoadmapSection.tsx` | ✅ Committed & pushed |
| `apps/web/src/components/landing/LandingTokenCard.tsx` | ✅ Committed & pushed |
| All other `landing/` components | ✅ Committed & pushed |

---

## 4. Root Cause

**Root cause: uncommitted files after the OPSTREET homepage redesign.**

The OPSTREET rebrand involved a two-part change:
1. New page content + landing components — these were committed and pushed (commits `dc096dc`, `5313a29`).
2. New shell/theme (layout, globals, tailwind config) + new opfun component set — these were **never committed**.

Because Vercel only builds from committed files, it received:
- The new page content (OPSTREET words and landing layout) ✅
- The OLD dark shell wrapping it (`html.dark`, `bg-zinc-950`, `bg-[#0a0a0a]`) ❌

The new `page.tsx` uses Tailwind classes like `border-3`, `border-ink`, `bg-[var(--panel-cream)]`, and `shadow-[8px_8px_0_#111111]` that require the new `tailwind.config.ts` and `globals.css` CSS variables. Since those were not committed, Vercel's build treated them as unknown/missing, and the dark shell from the old `layout.tsx` dominated the visible appearance.

There were no failed deployments that blocked this — the production build **succeeded** because the old `layout.tsx` does not reference any of the untracked components. The mismatch is entirely due to uncommitted changes.

---

## 5. Minimal Fix Set

The following files must be committed and pushed (in a single commit) to make production match local:

### Style/Config (3 files — modified, unstaged)
```
apps/web/src/app/globals.css
apps/web/src/app/layout.tsx
apps/web/tailwind.config.ts
```

### New opfun Components (10 files — untracked)
```
apps/web/src/components/opfun/BlockTimerBar.tsx
apps/web/src/components/opfun/NotificationDropdown.tsx
apps/web/src/components/opfun/OpBottomNav.tsx
apps/web/src/components/opfun/OpFAB.tsx
apps/web/src/components/opfun/OpHeader.tsx
apps/web/src/components/opfun/OpIcon.tsx
apps/web/src/components/opfun/OpPanel.tsx
apps/web/src/components/opfun/OpPill.tsx
apps/web/src/components/opfun/OpTickerStrip.tsx
apps/web/src/components/opfun/TokenCard.tsx
```

### Context (1 file — untracked)
```
apps/web/src/context/NotificationContext.tsx
```

### Public Assets (required for globals.css halftone dot grid and icons)
```
apps/web/public/assets/opfun/backgrounds/halftone_tile.svg
apps/web/public/assets/opfun/backgrounds/dot_grid_tile.svg
apps/web/public/assets/opfun/brand/opfun_wordmark.svg
apps/web/public/assets/opfun/icons/  (all SVGs)
apps/web/public/assets/opfun/ui/
apps/web/public/opstreet/brand/logo.png
apps/web/public/opstreet/images/landing-hero.jpg
apps/web/public/opstreet/shop/  (shop images — if referenced by landing components)
apps/web/public/sprites/  (pixel sprites — if referenced by landing/floor components)
```

**Total: 3 modified files + 11 new TS files + ~30 public assets.**

> ⚠️ **Pre-commit check:** Before committing `layout.tsx`, verify that `NotificationContext.tsx` exports `NotificationProvider` correctly, as `layout.tsx` imports it at the top level. A missing or broken export here will cause a Vercel build failure.

---

## 6. Safe Next Step

**Commit homepage files only, then push.**

Specific action:
1. Stage the 3 modified files + 11 new TS/TSX files + all `public/assets/opfun/` + `public/opstreet/` assets in one commit.
2. Push to `origin/main`.
3. Vercel will auto-deploy. Confirm the build log shows no import errors for `OpHeader`, `OpBottomNav`, `BlockTimerBar`, `NotificationProvider`.
4. If the build fails due to a missing import in any opfun component (e.g., `NotificationContext` internal deps), fix that file in a follow-up commit.

**Do NOT:**
- Push `public/sprites/` unless it is referenced by a live component (it is likely for the Trading Floor feature, not the homepage).
- Refactor any other files.
- Touch `apps/api/` or `packages/` in this commit.

---

## Appendix: Git Commands for the Fix Commit

```bash
# Stage modified style files
git add apps/web/src/app/globals.css
git add apps/web/src/app/layout.tsx
git add apps/web/tailwind.config.ts

# Stage new opfun components
git add apps/web/src/components/opfun/

# Stage context
git add apps/web/src/context/NotificationContext.tsx

# Stage public assets needed by the homepage
git add apps/web/public/assets/opfun/
git add apps/web/public/opstreet/

# Commit
git commit -m "feat(web): commit OPSTREET shell — layout, globals, tailwind, opfun components, assets"

# Push
git push origin main
```
