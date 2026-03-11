# Floor 404 Fix Report

Generated: 2026-03-10
Commit: `308170c`

---

## 1. Root Cause of the Trading Floor 404

The `/floor` route returned a Next.js 404 in production because the two route files that define it were **never committed**:

- `apps/web/src/app/floor/page.tsx`
- `apps/web/src/app/floor/layout.tsx`

Both files existed in the local working tree but were untracked (never staged or committed). Vercel's build only processes committed files, so Next.js had no route segment for `/floor` and fell through to the 404 handler.

All nav links (`OpHeader`, `OpBottomNav`, `MobileNav`, `HeroSection`, `TrendingClient`, docs page) correctly pointed to `/floor`. All floor *components* in `apps/web/src/components/floor/` were already committed. Only the route entry points were missing.

---

## 2. Exact Files Changed

| File | Change |
|------|--------|
| `apps/web/src/app/floor/page.tsx` | **Added** (was untracked) — defines the `/floor` route, renders `<TradingFloorClient />` |
| `apps/web/src/app/floor/layout.tsx` | **Added** (was untracked) — full-bleed layout escape (100vw, negates root `max-w-6xl` and `--layout-y-pad`) |
| `apps/web/src/app/globals.css` | Added `.text-shadow-cream` and `.text-shadow-cream-sm` utility classes |
| `apps/web/src/app/not-found.tsx` | Applied cream text shadows; updated copy to "Page not found." |

---

## 3. Root Cause Classification

| Category | Verdict |
|---|---|
| Bad route wiring (nav links pointing wrong path) | ✅ No — all links correctly point to `/floor` |
| Missing route file **not committed** | ✅ **YES — this was the cause** |
| Incorrect `notFound()` call inside the page | ✅ No — the page does not call `notFound()` |
| Middleware / redirect / auth gate | ✅ No — no middleware affecting `/floor` |
| Dynamic route conflict (e.g. `/p/[slug]` catching `/floor`) | ✅ No — `/floor` is a top-level static segment, not inside `/p/` |

---

## 4. Shadow/Style Change for 404 Text

Added two new utility classes to `globals.css`:

```css
.text-shadow-cream {
  text-shadow: 2px 2px 0 var(--panel-cream), -1px -1px 0 var(--panel-cream);
}
.text-shadow-cream-sm {
  text-shadow: 1px 1px 0 var(--panel-cream);
}
```

Applied in `not-found.tsx`:
- `<h1>` `404` heading — `text-shadow-cream` (2px hard offset + -1px back-glow for ink-on-yellow legibility)
- `<p>` body text — `text-shadow-cream-sm` (subtle 1px lift)

The shadow uses `var(--panel-cream)` (`#FFFBEB`) — on-brand cream, not gray/black/blue. It produces a hard 2px neo-brutalist offset rather than a soft blur, consistent with the OPSTREET design language.

---

## 5. Build Verification

```
pnpm --filter web typecheck  →  ✅ 0 errors
pnpm --filter web build      →  ✅ 13/13 pages generated

Route (app)
├ ○ /floor   12.4 kB  110 kB   ← now present and correct
```

Push: `44cbc64..308170c → origin/main`
