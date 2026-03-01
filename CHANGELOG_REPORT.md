# OPFun Secure Launchpad — Changelog & Architecture Report

> **Generated:** 2026-03-01
> **Branch:** `master`
> **Final commit:** `d631d5d`
> **Scope:** All agent-sprint rounds (R1–R5) applied on top of Milestone 1–3 scaffold.

---

## Table of Contents

1. [What We Built — Executive Summary](#what-we-built)
2. [Architecture Overview](#architecture)
3. [Sprint Rounds — Detailed Changelog](#changelog)
4. [File-by-File Inventory](#file-inventory)
5. [Current State Assessment](#current-state)
6. [Security Review](#security)
7. [Concerns & Known Limitations](#concerns)
8. [Recommended Next Steps](#next-steps)

---

## 1. What We Built — Executive Summary {#what-we-built}

**OPFun Secure Launchpad** is a Pump.fun-style token launch platform for the OP_NET Bitcoin smart-contract testnet. The core differentiator is transparency and security: every token gets an automated Risk Card, a continuous on-chain Watchtower, and a verifiable build hash linking the audit artifact to the deployed contract.

### The Pitch in One Paragraph

A creator fills out a 3-step form (name/ticker/supply → links → review), clicks **Launch**, and the platform: scaffolds a fixed-supply OP_20 contract via the Bob AI MCP server; runs a 10-point security audit (OA-001 to OA-010); generates a 0–100 Risk Score with a color-coded flag breakdown; creates a shareable project page with real-time Watchtower monitoring; lets the community pledge support on an off-chain bonding curve; and produces a deploy package for OP_NET testnet with full metadata (address, TX, build hash) recorded immutably in the DB.

### Key Numbers

| Metric | Value |
|--------|-------|
| Apps in monorepo | 3 (web, api, watcher) |
| Packages | 3 (shared, opnet, risk) |
| API endpoints | 15 |
| Sprint rounds | 5 |
| Git commits (sprint) | 8 |
| Files changed (total sprint) | ~60 |
| Lines added (net) | ~4,500 |

---

## 2. Architecture Overview {#architecture}

```
┌─────────────────────────────────────────────────────────────────┐
│                      apps/web (Next.js 14)                      │
│  App Router · Tailwind neo-brutalism · "use client" islands     │
│                                                                  │
│  / (feed)          FeedClient (filter/sort/search/grid/list)    │
│  /create           3-step form (Token Info → Links → Review)    │
│  /p/[slug]         ProjectPageClient (stats/curve/checks/deploy)│
│                                                                  │
│  WalletProvider (React context) ──► localStorage persistence    │
│  WalletButton (Unisat / OKX connect)                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST (NEXT_PUBLIC_API_URL)
┌──────────────────────────▼──────────────────────────────────────┐
│                   apps/api (Fastify + Prisma)                   │
│                                                                  │
│  routes/projects.ts  — CRUD, run-checks, pledge, view           │
│  routes/deploy.ts    — deploy package, confirm-deploy           │
│  routes/watchEvents.ts — write/list/resolve events              │
│  statusMachine.ts    — ALLOWED_TRANSITIONS, assertCanTransition │
│  db.ts (Prisma)      — SQLite, 3 models                         │
│                                                                  │
│  Bob AI (opnet-bob MCP) ─────────────────────────────────────►  │
│  packages/opnet:                                                 │
│    scaffoldContract()  auditContract()  deployContract()        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ polls every 5 min
┌──────────────────────────▼──────────────────────────────────────┐
│                apps/watcher (Node interval loop)                │
│                                                                  │
│  Fetches LAUNCHED projects (?status=LAUNCHED)                   │
│  getCode / getStorageAt via OP_NET RPC                          │
│  Writes WatchEvents (CRITICAL auto-flags project)               │
│  Deduplication: same dedupKey suppressed for 24 h               │
└─────────────────────────────────────────────────────────────────┘
```

### Data Model

```
Project ──< CheckRun   (SCAFFOLD, AUDIT, DEPLOY — immutable log)
        └──< WatchEvent (INFO/WARN/CRITICAL — resolved flag)
```

**Project status machine:**
```
DRAFT → CHECKING → READY ─────────────────────────┐
                       ↓                           │ pledge ≥ 100
                  DEPLOY_PACKAGE_READY → LAUNCHED──┴→ GRADUATED
                       ↓
                    FLAGGED  (Watchtower CRITICAL)
                       ↓
                  CHECKING  (re-audit from FLAGGED)
```

### Wallet Integration (Round 4)

```
Browser                     WalletProvider (context)
  │                              │
  ├─ window.unisat ──► requestAccounts() ──► address stored in localStorage
  └─ window.okxwallet.bitcoin ──► connect()
                                 │
                           passed to pledgeProject({ walletAddress })
                                 │
                           API: wallet-based rate-limit key
                           (replaces IP for connected users)
```

---

## 3. Sprint Rounds — Detailed Changelog {#changelog}

### Pre-Sprint: Milestones 1–3 (scaffold)

| Commit | Description |
|--------|-------------|
| `b310a38` | M1: Project CRUD + feed + project page |
| `7979f9c` | M2: Bob integration + Risk Card scaffold |
| `7b2e84e` | M3: Testnet deploy scaffold + admin deploy endpoint |

These milestones existed before the sprint. They had working end-to-end flows but lacked hardening.

---

### Round 1 — Must-Fix (M1–M10)

**Commit:** `be69ba6`, `030084e`, `616c663`, `cc74a23`

#### M1: Duplicate risk score accumulation
- **File:** `apps/api/src/routes/projects.ts`
- **Problem:** `run-checks` appended new `riskScore` to an array rather than replacing it. Score kept growing on re-audits.
- **Fix:** Replace `push`-style accumulation with direct `riskScore` field overwrite on Project.

#### M2: Audit regex false positives
- **File:** `packages/opnet/src/auditor.ts`
- **Problem:** Static analysis regex for `hasAdminKey` and `canMint` triggered on comment strings, producing inflated scores.
- **Fix:** Scoped regex to non-comment code lines only.

#### M3: Pledge IP deduplication key collision
- **File:** `apps/api/src/routes/projects.ts`
- **Problem:** The in-memory rate limit key was `${ip}` only — shared across all projects. One pledge on project A blocked project B.
- **Fix:** Changed key to `${projectId}:${ip}`.

#### M4: `contractMatchesArtifact` never set `true`
- **File:** `apps/api/src/routes/deploy.ts`
- **Problem:** The Risk Card's `releaseIntegrity.contractMatchesArtifact` was always `null` because `confirm-deploy` never updated it.
- **Fix:** After recording contract address, update `riskCardJson` in DB to set `contractMatchesArtifact: true`.

#### M5: Run-checks re-entrancy (no idempotency guard)
- **File:** `apps/api/src/routes/projects.ts`
- **Problem:** Two concurrent `POST /run-checks` calls could both pass the DRAFT check and run duplicate audits.
- **Fix:** Moved status update to `CHECKING` to before the async audit starts; second call hits `assertCanTransition` → 409.

#### M6: Concurrent deploy race condition
- **File:** `apps/api/src/routes/deploy.ts`
- **Problem:** Two `POST /deploy` calls could both see READY status and start two background deploy tasks.
- **Fix:** Atomically update status to `CHECKING` before returning 202; second call reads CHECKING and gets 409.

#### M7: Watchtower view count off by one
- **File:** `apps/watcher/src/index.ts`
- **Problem:** `viewCount` increment called inside the code-change detection branch only, missing most checks.
- **Fix:** Moved increment to the outer loop so all polled projects are counted.

#### M8: Audit result not stored in Risk Card properly
- **File:** `packages/opnet/src/auditor.ts`
- **Problem:** Audit issues array was being mutated in-place during scoring, causing duplicate issue entries.
- **Fix:** Constructed issues array once, then scored.

#### M9: WatchEvent deduplication
- **Files:** `apps/api/src/routes/watchEvents.ts`, `apps/watcher/src/index.ts`
- **Problem:** Watcher polling every 5 minutes would create hundreds of identical CRITICAL events for a persistent anomaly.
- **Fix:** Added `dedupKey` field to WatchEvent (Prisma migration + DB index). API skips POST if an unresolved event with the same `dedupKey` exists within 24 h.

#### M10: Bob MCP call timeout
- **File:** `apps/api/src/routes/projects.ts`
- **Problem:** `scaffoldContract` and `auditContract` had no timeout — a hung Bob call would stall the server.
- **Fix:** `withTimeout(promise, 30_000)` wrapper using `Promise.race` for all Bob calls.

---

### Toolchain (`b1de9fb`)

| Tool | Description |
|------|-------------|
| Gitleaks v8.18.4 | Portable binary in `tools/gitleaks.exe`; `pnpm secrets:scan` scans git history |
| Playwright 1.58 | Smoke tests: homepage loads + create form is visible |
| `apps/web/.eslintrc.json` | Pre-configures Next.js ESLint rules to avoid interactive setup prompt |
| `packages/risk/src/index.ts` | Stub `export {}` to fix TS18003 on empty workspace package |
| `.gitleaks.toml` | Allowlist for `tsconfig.tsbuildinfo` false positives (base58-like hashes) |
| Root `package.json` | Added `test` (playwright) and `secrets:scan` scripts |

---

### Round 2 — Should-Fix Batch 1 (`71c894d`)

#### S2: API fail-fast on default ADMIN_SECRET
- **File:** `apps/api/src/index.ts`
- If `ADMIN_SECRET === "dev-secret-change-me"` in `NODE_ENV=production` → `process.exit(1)`.
- In dev → `console.warn`.

#### S4: Reset stale CHECKING projects on boot
- **File:** `apps/api/src/index.ts`
- On startup, `prisma.project.updateMany({ where: { status: "CHECKING" }, data: { status: "DRAFT" } })`.
- Handles crash recovery without manual DB surgery.

#### S7: Watcher query filter + API `?status=` support
- **Files:** `apps/api/src/routes/projects.ts`, `apps/watcher/src/index.ts`
- API `GET /projects` now accepts `?status=LAUNCHED&sort=trending`.
- Watcher fetches only `?status=LAUNCHED` instead of all projects.

#### S8: `contractMatchesArtifact` badge in Risk Card UI
- **File:** `apps/web/src/components/RunChecksPanel.tsx`
- `ArtifactVerifiedBadge`: green "Artifact Verified ✓" or yellow "Artifact Unverified".

#### S14: Risk Card visual flag breakdown
- **File:** `apps/web/src/components/RunChecksPanel.tsx`
- `RiskRow`: color-coded background (red = risky, green = safe), `+N pts` badge when contributing to score.
- Score bar with RISK_CARD_SPEC thresholds: 0–19 green, 20–39 yellow, 40–69 orange, 70–100 red.
- `noTimelockPenalty` warning row shown when privileges active without timelocks.

---

### Round 3 — Should-Fix Batch 2 (`a31ac34`)

#### S3: Status transition state machine
- **New file:** `apps/api/src/statusMachine.ts`
- `ALLOWED_TRANSITIONS` map, `canTransition(from, to): boolean`, `assertCanTransition(from, to): void`.
- All route handlers (run-checks, pledge graduation, deploy gate) now call through the machine.
- Throws `Error` with `statusCode: 409` for illegal transitions.

#### S9: Mobile navigation
- **New file:** `apps/web/src/components/MobileNav.tsx`
- Animated hamburger (3-line → X) extracted from server layout as `"use client"` component.
- Slide-in drawer from right; closes on route change (`usePathname`) or backdrop click.
- Body scroll lock via `useEffect`.

#### S10: Create form inline validation
- **File:** `apps/web/src/app/create/page.tsx`
- `validateStep0()` pure function returning `FieldErrors` map.
- `touched: TouchedFields` map — errors show only after `onBlur` or submit attempt.
- `submitAttempted` boolean blocks progression if errors present.
- `FieldGroup` wrapper component renders label + input + error paragraph.
- Character counter on description (N/2000).
- `noValidate` on form to suppress browser native popups.

#### S11: Neo-brutalism CSS system
- **File:** `apps/web/src/app/globals.css`
- `.btn-primary`: `border-2 border-brand-600`, `shadow-[3px_3px_0_#c2410c]`, `font-black`.
- `.btn-secondary`: `border-2 border-zinc-700`, `shadow-[2px_2px_0_#27272a]`.
- `.card` / `.token-card`: `border-2`.
- `.input`: `border-2 border-zinc-700`; new `.input-error` utility.
- `.label`: `font-black uppercase tracking-wider`.

#### S12: Pledge button success flash
- **File:** `apps/web/src/components/BondingCurvePanel.tsx`
- `prevPledging` ref detects `pledging: true → false` transition.
- `justPledged` state: button turns green "Pledged! ♥" for 2 seconds.

#### S13: Deploy 3-step progress indicator
- **File:** `apps/web/src/components/DeployPanel.tsx`
- `DeploySteps` component: Package → Deploy → Confirm.
- `deployStep: 0|1|2` derived from `phase` state + whether addresses have been filled.

---

### Round 4 — Nice-to-Have + Wallet Integration (`4b239a5`)

#### T1: README refresh
- Complete rewrite covering all M1–M5 features, wallet, API reference, QA commands, env vars.

#### T2: Feed text search
- **File:** `apps/web/src/components/FeedClient.tsx`
- Real-time debounce-free filter: `name | ticker | description`.
- Clear ✕ button when active; empty state says "No results for '…'".

#### T3: Copy-to-clipboard on metadata cards
- **File:** `apps/web/src/components/ProjectPageClient.tsx`
- `MetaCard` uses `navigator.clipboard.writeText`.
- Hover reveals `Copy` link → transitions to `✓ Copied` for 1.5 s.

#### T4: WatchEvent resolve
- **File:** `apps/api/src/routes/watchEvents.ts`
- New `PATCH /projects/:id/watch-events/:eventId/resolve` (admin-gated).
- Frontend: "Admin" toggle reveals secret input; resolved events get strikethrough + "✓ Resolved" badge.

#### T5: Discord webhook on CRITICAL
- **File:** `apps/api/src/routes/watchEvents.ts`
- When `DISCORD_WEBHOOK_URL` env var is set, fires rich embed to Discord on `CRITICAL` severity.
- Fire-and-forget (never blocks API response). Zero new dependencies.

#### Wallet integration
- **New:** `apps/web/src/lib/wallet.ts` — `connectWallet()`, `truncateAddress()`, typed window globals.
- **New:** `apps/web/src/components/WalletProvider.tsx` — React context + `useWallet()` hook + `localStorage`.
- **New:** `apps/web/src/components/WalletButton.tsx` — desktop dropdown + mobile full-width variant.
- **Modified:** `apps/web/src/app/layout.tsx` — `WalletProvider` wraps entire app; `WalletButton` in header.
- **Modified:** `apps/web/src/components/MobileNav.tsx` — `WalletButton variant="mobile"` in drawer.
- **Modified:** `apps/api/src/routes/projects.ts` — pledge accepts `{ walletAddress? }` body; wallet-based rate-limit key preferred over IP.
- **Modified:** `apps/web/src/lib/api.ts` — `pledgeProject(id, { walletAddress })` + `resolveWatchEvent()`.

---

### Round 5 — Critical Bug Fixes (`d631d5d`)

#### Bug: CORS missing PATCH method
- **File:** `apps/api/src/index.ts`
- **Impact:** Browser preflight for `PATCH /watch-events/:id/resolve` would return 403.
- **Fix:** Added `"PATCH"` to the CORS methods array.

#### Bug: Tailwind brand palette incomplete
- **File:** `apps/web/tailwind.config.ts`
- **Missing:** `brand-300`, `brand-700`, `brand-950` used across 5+ components but not defined.
- **Impact:** Step indicator text (`text-brand-300`), box-shadow border (`border-brand-700`), dark overlays (`bg-brand-950/20`) all rendered with no color.
- **Fix:** Added all three missing shades with correct orange-scale values.

#### Bug: `DEPLOY_PACKAGE_READY` missing from status machine
- **File:** `apps/api/src/statusMachine.ts`
- **Impact:** Any project in `DEPLOY_PACKAGE_READY` state would get 409 on any subsequent action (re-audit, deploy).
- **Fix:** Added `DEPLOY_PACKAGE_READY: ["CHECKING", "LAUNCHED"]` to `ALLOWED_TRANSITIONS`; added it as a valid exit from `CHECKING`.

#### Type: `WatchEventDTO.resolved` missing
- **File:** `packages/shared/src/index.ts`
- The shared DTO was missing `resolved: boolean` even though the DB column, Prisma model, and API response all included it.
- **Fix:** Added field with doc comment.

#### Housekeeping: gitignore build artifacts
- **Files:** `.gitignore`, git history
- Added `apps/web/next-env.d.ts` and `apps/web/tsconfig.tsbuildinfo` to `.gitignore`.
- `git rm --cached` to stop tracking both files.
- `tsconfig.tsbuildinfo` was the source of 45 gitleaks false positives.

---

## 4. File-by-File Inventory {#file-inventory}

### New files created during sprint

| File | Purpose |
|------|---------|
| `apps/api/src/statusMachine.ts` | Status transition validation (S3) |
| `apps/api/src/routes/watchEvents.ts` | WatchEvent write/list/resolve routes (M9, T4, T5) |
| `apps/web/src/lib/wallet.ts` | Bitcoin wallet connection abstraction |
| `apps/web/src/components/WalletProvider.tsx` | React context for wallet state |
| `apps/web/src/components/WalletButton.tsx` | Connect/disconnect UI (desktop + mobile) |
| `apps/web/src/components/MobileNav.tsx` | Mobile hamburger + slide-in drawer (S9) |
| `apps/web/src/components/BondingCurvePanel.tsx` | Bonding curve chart + pledge CTA (S12) |
| `apps/web/src/components/DeployPanel.tsx` | 3-step deploy flow (S13) |
| `apps/web/src/components/FeedClient.tsx` | Client-side feed with filter/sort/search/pledge |
| `packages/risk/src/index.ts` | Stub to fix TS18003 (orphaned workspace) |
| `playwright.config.ts` | Browser smoke test config |
| `tests/smoke.spec.ts` | Homepage + create form smoke tests |
| `.gitleaks.toml` | Secrets scan config + tsbuildinfo allowlist |
| `DECISIONS.md` | Engineering non-negotiables (user authored) |
| `RISK_CARD_SPEC.md` | Risk Card schema + scoring rubric (user authored) |
| `TODO.md` | Live backlog (user authored, sprint updated) |
| `MVP_PLAN.md` | Milestone definitions (user authored) |
| `INDEX.md` | Repo index (user authored) |
| `docs/DEBUG_PLAYBOOK.md` | Debug procedures |
| `docs/WORKTREES.md` | Worktree workflow |

### Key modified files

| File | Changes |
|------|---------|
| `apps/api/src/index.ts` | CORS PATCH, S2 fail-fast, S4 CHECKING cleanup on boot |
| `apps/api/src/routes/projects.ts` | M1-M5 fixes, S3 state machine, S7 query filter, wallet pledge |
| `apps/api/src/routes/deploy.ts` | M4 contractMatchesArtifact, M6 race guard, S3 state machine |
| `apps/api/prisma/schema.prisma` | `pledgeCount`, `viewCount` on Project; `dedupKey`, `resolved` on WatchEvent |
| `apps/watcher/src/index.ts` | M7 view count, M9 dedupKey, S6 ADMIN_SECRET, S7 status filter |
| `apps/web/src/app/globals.css` | S11 neo-brutalism CSS system |
| `apps/web/src/app/layout.tsx` | WalletProvider wrapper, WalletButton, MobileNav |
| `apps/web/src/app/create/page.tsx` | S10 form validation, FieldGroup, touched state |
| `apps/web/src/components/RunChecksPanel.tsx` | S8 artifact badge, S14 Risk Card breakdown |
| `apps/web/src/components/ProjectPageClient.tsx` | T3 copy, T4 resolve, wallet pledge, WatchEventRow |
| `apps/web/src/lib/api.ts` | walletAddress param, resolveWatchEvent, WatchEvent.resolved |
| `apps/web/tailwind.config.ts` | brand-300/700/950 added |
| `packages/shared/src/index.ts` | RiskCard type, WatchEventDTO.resolved |

---

## 5. Current State Assessment {#current-state}

### Working end-to-end

- ✅ Create project → 3-step form → saved as DRAFT
- ✅ Run security checks → Bob scaffolds + audits → Risk Card generated with score
- ✅ Risk Card UI → color-coded flags, score bar, artifact badge
- ✅ Deploy package → 3-step indicator → manual confirm → LAUNCHED
- ✅ Watchtower → polls LAUNCHED contracts → writes WatchEvents → auto-flags on CRITICAL
- ✅ Pledge → bonding curve simulator → graduation at 100 pledges
- ✅ Wallet connect → Unisat / OKX → pledge attributed to address
- ✅ Feed → grid/list, filter by status, sort by new/trending, text search
- ✅ Mobile → responsive, hamburger nav, wallet in drawer
- ✅ QA → `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm secrets:scan` all passing

### Mocked / Simulation (by design)

- ⚠️ Bonding curve is entirely off-chain — no real DEX, no on-chain commitments
- ⚠️ Deploy package produces instructions + scaffold — no fully automated 1-click deploy
- ⚠️ Pledge count is off-chain only — wallet address used for rate limiting but not for on-chain verification
- ⚠️ All data is OP_NET Testnet — no mainnet deployment

### Known dead code / stubs

- `packages/risk/` — package exists in workspace but contains only `export {}`. Scoring logic lives in `packages/opnet/src/auditor.ts`. Risk of confusion for new contributors.

---

## 6. Security Review {#security}

### What is guarded

| Attack Surface | Guard |
|---------------|-------|
| Admin endpoints | `X-Admin-Secret` header check on all mutating endpoints |
| Default secret in prod | `process.exit(1)` if `ADMIN_SECRET` is default value in `NODE_ENV=production` |
| Pledge spam | In-memory rate limit: 1 per `(projectId, walletAddress OR ip)` per 24 h |
| Concurrent run-checks | Status machine: 409 if already CHECKING |
| Concurrent deploy | Deploy atomically moves to CHECKING before returning 202 |
| Crashed CHECKING state | Cleanup on API boot resets all CHECKING → DRAFT |
| Bob call hang | 30 s timeout via `Promise.race` |
| WatchEvent spam | `dedupKey` deduplication: same condition suppressed for 24 h |
| Secrets in codebase | Gitleaks scans git history; `tsconfig.tsbuildinfo` in allowlist |
| CORS | Configured to `CORS_ORIGIN` env var (default: `localhost:3000`) |
| Status transitions | Central `ALLOWED_TRANSITIONS` map; all routes go through `assertCanTransition` |

### What is NOT guarded

| Gap | Severity | Notes |
|-----|----------|-------|
| API has no authentication for public reads | Low | By design — public launchpad |
| `confirm-deploy` bypasses state machine | Medium | Directly writes `LAUNCHED` without calling `assertCanTransition`. Should call `canTransition(current, "LAUNCHED")` |
| In-memory pledge rate limit | Medium | Lost on API restart. Redis needed for production. |
| No input sanitization on `name`/`description` | Low | Stored as plain text, rendered with React (XSS-safe). But no length enforcement at DB level. |
| Wallet address not cryptographically verified | Medium | API trusts the `walletAddress` string from the request body. A user could claim any address. Signing a nonce would fix this. |
| No request-level rate limiting | Medium | Any endpoint can be hammered. No global rate limiter (e.g. `@fastify/rate-limit`). |
| `DISCORD_WEBHOOK_URL` exposed to logs | Low | URL contains a secret token. Fire-and-forget `fetch` error is silently swallowed — if the URL leaks to logs it's a security issue. |
| Admin secret sent in HTTP header | Medium | `X-Admin-Secret` is in plaintext. Requires HTTPS in any non-localhost environment. |

---

## 7. Concerns & Known Limitations {#concerns}

### Architectural concerns

1. **SQLite in production** — SQLite is fine for a single-node testnet MVP but has write serialization limits. At meaningful scale (concurrent audits + pledges), WAL mode should be explicitly enabled or PostgreSQL should replace it. The Prisma `DATABASE_URL` swap is trivial.

2. **In-memory pledge rate limit** — `pledgeRecords: Map<string, number>` is lost on API restart. Easy to bypass by restarting the server. For production: replace with a `Pledge` DB table or Redis TTL key.

3. **Bob MCP is a hard dependency** — If `https://ai.opnet.org/mcp` is down, `run-checks` always fails with a timeout error. There is no local fallback template. Should add a `--no-bob` mode that uses a static template for development.

4. **No authentication layer** — Project creation is completely open (no account, no wallet signature). Anyone can spam the DB with projects. For a real launchpad: require a wallet signature to create a project (prevents abuse).

5. **Wallet address not signed** — The `walletAddress` in pledge requests is client-provided with no signature verification. A user can claim `bc1p<someone-else>` as their address. For real attribution: implement a nonce-sign flow (server issues nonce → client signs with wallet → server verifies signature against claimed address).

6. **`confirm-deploy` bypasses state machine** — The endpoint directly writes `status: "LAUNCHED"` without going through `assertCanTransition`. If a project is in `DRAFT` or `GRADUATED` and an admin calls `confirm-deploy`, it silently succeeds. Should add an explicit guard.

### UX concerns

7. **No error boundary** — If the API is down, the Next.js pages either show empty states or crash. A top-level `error.tsx` boundary would show a friendly "API unavailable" message.

8. **No optimistic updates on pledge** — The pledge button disables while the network request is in flight. At high latency, this feels sluggish. Optimistic +1 then reconcile on response would improve perceived performance.

9. **No pagination on feed** — The API returns max 50 projects. As the launchpad grows, this will become a problem. Cursor-based pagination (`cursor` + `take`) is the right next step.

10. **Search is client-side only** — The feed search filters already-loaded data. Searches don't hit the server. This works for 50 projects but breaks at 500+.

11. **`packages/risk` orphan** — The package exists in the pnpm workspace with only `export {}` as content. New contributors will be confused. Either remove it from `pnpm-workspace.yaml` or populate it with the scoring logic moved from `packages/opnet/src/auditor.ts`.

### Security concerns (expanded)

12. **No HTTPS enforcement** — The `X-Admin-Secret` header is transmitted in plaintext over HTTP in local dev. Any production deployment must proxy through nginx/Caddy with TLS.

13. **ADMIN_SECRET in watcher env** — The watcher uses the same ADMIN_SECRET to write WatchEvents and set project statuses. If the watcher server is compromised, an attacker can write arbitrary CRITICAL events and flag all projects. Consider a separate, limited-scope token for the watcher.

14. **No audit trail for admin actions** — There's no log of who called `confirm-deploy`, when, with what address. All admin actions should be appended to `CheckRun` records (they mostly already are, but `resolve-watch-event` and `confirm-deploy` are not logged).

---

## 8. Recommended Next Steps {#next-steps}

Prioritized by impact:

### P0 — Fix before any real users

| # | Task | Effort |
|---|------|--------|
| P0-1 | `confirm-deploy` state machine guard | 10 min |
| P0-2 | Wallet signature verification (nonce-sign flow) | 1 day |
| P0-3 | Global `@fastify/rate-limit` on API | 2 h |
| P0-4 | HTTPS via reverse proxy (nginx/Caddy) for non-local deploy | 1 h |

### P1 — Quality of life

| # | Task | Effort |
|---|------|--------|
| P1-1 | Replace in-memory pledge rate limit with `Pledge` DB table | 2 h |
| P1-2 | Cursor-based pagination on `GET /projects` | 3 h |
| P1-3 | Feed search routed to server (`?q=` param) | 2 h |
| P1-4 | Next.js `error.tsx` error boundary for API-down state | 1 h |
| P1-5 | Optimistic pledge (+1 immediately, reconcile on response) | 1 h |
| P1-6 | `packages/risk` — move scoring logic here OR remove from workspace | 2 h |

### P2 — Feature completions

| # | Task | Effort |
|---|------|--------|
| P2-1 | Bob MCP fallback template (no-Bob mode for local dev) | 3 h |
| P2-2 | Audit trail log for admin actions (resolve, confirm-deploy) | 2 h |
| P2-3 | Separate watcher token (limited-scope, not full ADMIN_SECRET) | 2 h |
| P2-4 | PostgreSQL migration (swap Prisma datasource URL) | 1 h |
| P2-5 | Enable SQLite WAL mode for concurrent writes | 30 min |

### P3 — Launch readiness

| # | Task | Effort |
|---|------|--------|
| P3-1 | Project creation requires wallet signature | 1 day |
| P3-2 | Admin dashboard (list all projects, resolve events, manage flags) | 2 days |
| P3-3 | Email/webhook on graduation (creator notification) | 3 h |
| P3-4 | Mainnet consideration workflow (what happens after GRADUATED?) | Design + 1 day |
| P3-5 | opnet-bob MCP local registration: `claude mcp add opnet-bob --transport http https://ai.opnet.org/mcp` | 5 min |

---

## Appendix: Commit Log

```
d631d5d  Round 5: critical fixes — CORS PATCH, Tailwind brand palette, status machine, type hygiene
4b239a5  Round 4: wallet login + feed search + copy addresses + resolve events + Discord webhook
a31ac34  Round3: S3/S9/S10/S11/S12/S13 — state machine, mobile nav, form UX, neo-brutalism
71c894d  Round2: S2/S4/S7/S8/S14 — startup safety, Risk Card visuals, watcher filter
b1de9fb  chore: add QA/security toolchain + source-of-truth docs
cc74a23  Round1 Batch4: M9/S1/S6 — WatchEvent dedup, DB indexes, watcher dedupKey
616c663  Round1 Batch3: M4/M6 — contractMatchesArtifact fix, concurrent deploy guard
030084e  Round1 Batch2: M3/M5/M10 — pledge dedup, run-checks guard, Bob timeouts
be69ba6  Round1 Batch1: M1/M2/M7/M8 — risk dedup, deploy guard, watcher counter, audit regex
7b2e84e  Milestone 3: testnet deploy scaffold + admin deploy endpoint    (pre-sprint)
7979f9c  Milestone 2: Bob integration — contract scaffold + Risk Card     (pre-sprint)
b310a38  Milestone 1: scaffold + CRUD projects                            (pre-sprint)
```

---

*Report generated by Claude Sonnet 4.6 · OPFun Secure Launchpad · 2026-03-01*
