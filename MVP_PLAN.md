# OPFun Secure Launchpad — MVP Plan (Source of Truth)

**Goal:** A Pump.fun‑style launch experience for OP_NET that **feels effortless**, but is **security‑gated** with a transparent Risk Card + continuous Watchtower monitoring.

## Non‑negotiables
- **Testnet only** for MVP.
- **No paid RNG / gambling mechanics.**
- **Default token template = fixed supply, no mint, no hidden admin powers** unless explicitly enabled and loudly flagged.
- Never paste or store secrets (seed phrases, private keys, API keys).

## MVP Definition (“Strong MVP”)
A strong MVP means:
1. A creator can create a project (token launch), see it publicly.
2. The system can run checks and generate a **Risk Card** + **Risk Score**.
3. The system can deploy to OP_NET **testnet** and record verifiable metadata (address, tx, build hash).
4. A Watchtower worker continuously monitors deployed projects and surfaces alerts on the project page.
5. The UI feels “app-store simple” and works on mobile.

## Milestones
### Milestone 1 — App skeleton + CRUD (done/validate)
- Web: `/` feed, `/create`, `/p/[slug]` project page
- API: create/list/get projects
- DB: Project/CheckRun/WatchEvent tables
- Watcher: stub loop

**Acceptance:** Create project → view project page works reliably.

### Milestone 2 — Checks + Risk Card (real)
- Scaffold contract template (via opnet-bob OpnetDev or local template)
- Run audit/static checks (opnet-bob OpnetAudit + local linting)
- Generate Risk Card JSON + score, store in DB, render on UI

**Acceptance:** “Run checks” produces a Risk Card with clear pass/warn/fail reasoning.

### Milestone 3 — Testnet deploy (real)
- Deploy button (admin gated)
- Deploy to OP_NET testnet, store:
  - contract address
  - deploy tx
  - build hash of generated artifacts
  - check run output

**Acceptance:** At least one token deployed; metadata visible on project page.

### Milestone 4 — Watchtower (real)
- Background worker polls recent activity for launched projects
- Writes WatchEvents to DB
- UI shows WatchEvents timeline

**Acceptance:** WatchEvents appear automatically for simulated/suspicious actions.

### Milestone 5 — Pump-like polish
- Trending ranking
- Off-chain bonding curve simulator (MVP-lite)
- Graduation status (based on pledges/watchers)

**Acceptance:** Onboarding feels simple; mobile UX is solid.

## Deliverables
- Monorepo structure (apps/web, apps/api, apps/watcher, packages/*)
- Prisma schema + migrations
- Risk engine package
- OPNet integration wrapper
- README with exact run commands
