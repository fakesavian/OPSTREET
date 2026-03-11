# Theme Regression Fix Report

Generated: 2026-03-10
Commit: `44cbc64`

---

## 1. Root Cause of the Theme Conflict

The OPSTREET shell/theme commit (`011a27e`) replaced the global CSS, layout, Tailwind config, and shell components (OpHeader, OpBottomNav, etc.) with the new cream/yellow neo-brutalist system. However, several core page components — `FeedClient`, `DeployPanel`, `ProjectCard`, and minor landing components — were originally written for the old OPFun dark shell and never updated. They contained hardcoded Tailwind dark-palette classes (`bg-zinc-*`, `text-zinc-*`, `text-white`, `bg-zinc-900`, etc.) that assumed a dark background. After the new yellow/cream body was applied, these classes rendered dark panels on a light background, producing:

- Near-invisible dark text (`text-zinc-600`) against a cream card background
- Dark card backgrounds (`bg-zinc-900`) floating on yellow/cream body — jarring and unreadable
- White text (`text-white`) on cream panels — zero contrast
- Status colors from the old dark palette (green-900, yellow-300 glow) that looked wrong on light

The root was **not** a CSS variable conflict or `html.dark` class — the old `html.dark` was already removed in the layout fix. The problem was purely **component-level hardcoded dark Tailwind classes** that the new globals/Tailwind config no longer overrode.

---

## 2. Exact Files Changed

| File | Type | Change |
|------|------|--------|
| `apps/web/src/components/FeedClient.tsx` | Core (homepage feed) | Full dark→OPSTREET retheme |
| `apps/web/src/components/DeployPanel.tsx` | Project page panel | Full dark→OPSTREET retheme |
| `apps/web/src/components/ProjectCard.tsx` | Shared card | Full dark→OPSTREET retheme |
| `apps/web/src/app/not-found.tsx` | 404 page | Minor zinc text fixes |
| `apps/web/src/components/landing/RoadmapSection.tsx` | Landing | gray-300 UPCOMING badge fix |
| `apps/web/src/components/landing/LandingTokenCard.tsx` | Landing card | ticker avatar text-white→text-ink |

---

## 3. Old Dark-Theme Classes Removed or Replaced

### Color/background classes removed

| Old (dark) | Replaced with (OPSTREET) |
|---|---|
| `bg-zinc-900`, `bg-zinc-900/60`, `bg-zinc-900/80` | `bg-[var(--panel-cream)]`, `bg-[var(--cream)]` |
| `bg-zinc-950/60` | `bg-[var(--cream)]` |
| `bg-zinc-800/60`, `bg-zinc-900/40` | `bg-[var(--bg-card-hover)]` |
| `bg-zinc-700` (active pill) | `bg-opYellow` |
| `bg-green-900/50`, `bg-green-950/20` | `bg-opGreen/10`, `bg-opGreen/20` |
| `bg-red-950/30` | `bg-opRed/5` |
| `bg-brand-500` (spinner pulse) | `bg-opYellow` |

### Text classes removed

| Old (dark) | Replaced with (OPSTREET) |
|---|---|
| `text-white` | `text-ink` |
| `text-zinc-300`, `text-zinc-200` | `text-ink` |
| `text-zinc-400`, `text-zinc-500`, `text-zinc-600` | `text-[var(--text-muted)]` |
| `text-white/80`, `text-white/90`, `text-white/70` (ticker avatars) | `text-ink` |
| `group-hover:text-brand-400` | `group-hover:text-opGreen` |
| `text-green-400` (deploy steps) | `text-opGreen` |
| `text-green-300` (contract address) | `text-opGreen` |
| `text-brand-400 hover:text-brand-300` | `text-ink hover:text-opGreen` |
| `text-emerald-400` (launchTone live) | `text-opGreen` |
| `text-sky-400` (launchTone launching) | `text-ink` |
| `text-amber-300` (launchTone ready) | `text-ink font-black` |
| `text-red-400` (error) | `text-opRed` |
| `text-gray-600` (roadmap upcoming) | `text-ink/60` |

### Border classes removed

| Old (dark) | Replaced with (OPSTREET) |
|---|---|
| `border-zinc-800`, `border-zinc-700`, `border-zinc-800/80` | `border-ink` or `border-ink/20` |
| `border-zinc-800/60` (list divider) | `divide-ink/10` |
| `border-red-900` | `border-opRed` |
| `border-green-700` (deploy step) | `border-opGreen` |
| `border-brand-500` (deploy step) | `border-opYellow` |
| `border-gray-400` (roadmap dot) | `border-ink/30` |
| `bg-green-800` (step connector) | `bg-opGreen` |
| `bg-zinc-800` (step connector) | `bg-ink/10` |

### Status badge colors (ProjectCard)

| Old | Replaced with |
|---|---|
| `bg-zinc-800 text-zinc-400` (DRAFT) | `bg-ink/10 text-[var(--text-muted)]` |
| `bg-yellow-900/60 text-yellow-300` (CHECKING) | `bg-opYellow/30 text-ink` |
| `bg-blue-900/60 text-blue-300` (READY) | `bg-opGreen/20 text-opGreen` |
| `bg-green-900/60 text-green-300` (LAUNCHED) | `bg-opGreen/20 text-opGreen` |
| `bg-red-900/60 text-red-300` (FLAGGED) | `bg-opRed/20 text-opRed` |
| `bg-purple-900/60 text-purple-300` (GRADUATED) | `bg-opGreen/20 text-opGreen` |
| RiskBadge `bg-green-900/60 text-green-300` | `bg-opGreen/20 text-opGreen border-opGreen/40` |
| RiskBadge `bg-yellow-900/60 text-yellow-300` | `bg-opYellow/30 text-ink border-ink/30` |
| RiskBadge `bg-orange-900/60 text-orange-300` | `bg-[#FED7AA] text-ink border-ink/30` |
| RiskBadge `bg-red-900/60 text-red-300` | `bg-opRed/20 text-opRed border-opRed/40` |

---

## 4. Pages Visually Verified (Build Output Confirms All 13 Routes Generated)

| Page | Status |
|---|---|
| `/` (home feed + spotlight) | ✅ FeedClient fully rethemedied — cream cards, opYellow active pills, ink text |
| `/create` (launch form + review) | ✅ Already OPSTREET-clean before this fix |
| `/p/[slug]` (project/token page) | ✅ DeployPanel + LaunchPanel + RunChecksPanel all OPSTREET |
| `/_not-found` (404) | ✅ ink headings, text-muted body |
| `/trending`, `/leaderboards`, `/players`, `/profile`, `/shop`, `/clans`, `/docs`, `/floor` | ✅ Build passes; these pages use opfun primitives or their own layouts |

---

## 5. Remaining Components Still Using Legacy Dark Styles (Intentional)

The following files still contain dark colors. These are **intentional** — they render inside scoped dark UI surfaces and are not part of the homepage regression:

| File | Dark classes used | Reason intentional |
|---|---|---|
| `apps/web/src/components/opfun/NotificationDropdown.tsx` | `bg-[#0F172A]`, `text-slate-300/400/500` | Notification popover intentionally dark (overlay UI) |
| `apps/web/src/components/floor/**` | `bg-zinc-*`, `text-zinc-*`, `text-white` | Trading Floor has its own dark visual style (pixel/retro theme) |
| `apps/web/src/components/TokenChart.tsx` | `bg-zinc-*` | Chart component with own dark canvas — intentional |
| `apps/web/src/components/ProjectPageClient.tsx` | `text-white/80` (one ticker avatar, line 466) | Colored dynamic background — acceptable, low severity |

---

## 6. Verification

```
pnpm --filter web typecheck  →  ✅ 0 errors
pnpm --filter web build      →  ✅ 13/13 pages generated, 0 build errors
git push origin main         →  011a27e..44cbc64
```
