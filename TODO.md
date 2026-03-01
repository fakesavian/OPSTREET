# Backlog (Live)

---

## Current State (last updated: Round 3 complete — all MUST + SHOULD items done)

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
- [x] S2: ADMIN_SECRET fail-fast (prod exit, dev warn)
- [x] S3: Status state machine (`assertCanTransition`, `canTransition`) — guards all transitions
- [x] S4: Stale CHECKING projects reset to DRAFT on API boot
- [x] S7: Watcher uses `?status=LAUNCHED` filter; API `GET /projects` supports `?status=` query param
- [x] S8: Risk Card UI shows `contractMatchesArtifact` badge (green Verified / yellow Unverified)
- [x] S9: Mobile nav (animated hamburger + slide-in drawer, closes on route change, body scroll lock)
- [x] S10: Create form validation (inline errors, touched/submitAttempted state, char counter)
- [x] S11: Neo-brutalism CSS (border-2, offset box-shadows, font-black, input-error utility)
- [x] S12: Pledge button success flash ("Pledged! ♥" green for 2s, useRef transition detection)
- [x] S13: Deploy panel 3-step progress indicator (Package → Deploy → Confirm)
- [x] S14: Risk Card visual flag breakdown (color-coded rows, +pts badges, score bar)

### Broken / At Risk
- [ ] packages/risk is a stub (scoring is in auditor.ts) — orphaned workspace may confuse devs
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

## Should-fix (quality) — ALL DONE ✅

- [x] S1: DB indexes
- [x] S2: ADMIN_SECRET fail-fast
- [x] S3: Status transition state machine
- [x] S4: Reset stale CHECKING on boot
- [x] S5: run-checks idempotency
- [x] S6: Watcher env var ADMIN_SECRET
- [x] S7: Watcher + API `?status=` filter
- [x] S8: contractMatchesArtifact badge
- [x] S9: Mobile nav hamburger + drawer
- [x] S10: Create form inline validation
- [x] S11: Neo-brutalism CSS pass
- [x] S12: Pledge success flash
- [x] S13: Deploy 3-step progress indicator
- [x] S14: Risk Card visual flag breakdown

---

## Nice-to-have (later)

- [ ] Trending algorithm (pledges/watchers)
- [ ] Off-chain bonding curve simulator UI improvements
- [ ] Graduation rules + UI (when pledges threshold hit)
- [ ] Discord/Telegram webhook alerts from Watchtower
- [ ] Register opnet-bob MCP locally (`claude mcp add --transport http opnet-bob https://ai.opnet.org/mcp`)
