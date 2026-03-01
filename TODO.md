# Backlog (Live)

---

## Current State (last updated: Round 1 + toolchain complete)

### Done
- [x] Milestone 1: Project CRUD + feed + project page (working)
- [x] Milestone 2: Run-checks → Bob scaffold + audit → Risk Card JSON + score
- [x] Milestone 3: Testnet deploy scaffold + confirm-deploy endpoint + status LAUNCHED
- [x] Milestone 4: Watchtower worker (getCode, getStorageAt, WatchEvent writes, auto-flag CRITICAL)
- [x] Risk Card spec defined (RISK_CARD_SPEC.md)
- [x] Build hash stored in DB on confirm-deploy
- [x] Audit scoring + checks (OA-001 through OA-010)
- [x] WatchEvent deduplication (dedupKey + 24h window)
- [x] Pledge IP rate-limiting (1/project/IP/24h)
- [x] Run-checks idempotency guard (409 if already CHECKING)
- [x] Bob MCP call timeout (30s, Promise.race)
- [x] DB indexes on Project, CheckRun, WatchEvent
- [x] Playwright + gitleaks toolchain installed; pnpm test + pnpm secrets:scan wired

### Broken / At Risk
- [ ] ADMIN_SECRET defaults to "dev-secret-change-me" — API does not fail-fast in prod (security risk)
- [ ] Projects stuck in CHECKING on restart — no cleanup on boot
- [ ] Watcher fetches ALL projects then filters client-side (S7) — should use ?status=LAUNCHED
- [ ] packages/risk is a stub (scoring is in auditor.ts) — the orphaned workspace can confuse devs
- [ ] opnet-bob MCP not registered in local config (Bob works at runtime via API but not via `claude mcp list`)

### Mocked / Simulation
- [ ] Bonding curve is pure client-side simulation (no real DEX)
- [ ] Deploy package generates instructions + scaffold — not a fully automated 1-click deploy (by design, testnet only)
- [ ] Pledge count is off-chain only (no on-chain commitment)

---

## Must-fix (blocking) — Round 1 complete, see Done above

- [x] Confirm Milestone 1 smoke test: create project → view page works
- [x] Add "Run checks" endpoint (Milestone 2) and UI wiring
- [x] Define Risk Card schema + scoring rubric (RISK_CARD_SPEC.md)
- [x] Add artifact hashing + store build hash in DB
- [x] Implement Watchtower skeleton that reads launched projects + writes WatchEvents

---

## Should-fix (quality) — Round 2 targets

- [ ] S2: ADMIN_SECRET required at API startup (fail-fast or warn)
- [ ] S3: Status transition validation helper (`assertCanTransition`)
- [ ] S4: Reset stale CHECKING projects on API boot
- [ ] S7: Watcher uses `?status=LAUNCHED` API query param; API supports query filter
- [ ] S8: Risk Card UI shows `contractMatchesArtifact` badge (Verified / Unverified)
- [ ] S9: Mobile nav (hamburger + drawer)
- [ ] S10: Create form validation feedback (inline errors)
- [ ] S11: Neo-brutalism UI punch (2px borders, orange CTAs, font-black headings)
- [ ] S12: Pledge button clarity + feedback (loading state, success toast)
- [ ] S13: Deploy panel — 3-step progress indicator (Package → Deploy → Confirm)
- [ ] S14: Risk Card visual flag breakdown (color-coded rows, score bar)
- [x] S1: DB indexes — done (Round 1)
- [x] S5: run-checks idempotency — done (Round 1)
- [x] S6: Watcher env var ADMIN_SECRET — done (Round 1)
- [x] Playwright smoke test (create flow) — done (toolchain)
- [x] Secrets scan (gitleaks) — done (toolchain)
- [ ] Mobile UX pass (tap targets, responsive layout) — see S9/S11

---

## Nice-to-have (later)

- [ ] Trending algorithm (pledges/watchers)
- [ ] Off-chain bonding curve simulator UI improvements
- [ ] Graduation rules + UI (when pledges threshold hit)
- [ ] Discord/Telegram webhook alerts from Watchtower
- [ ] Register opnet-bob MCP locally (`claude mcp add --transport http opnet-bob https://ai.opnet.org/mcp`)
