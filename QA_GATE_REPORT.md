# Live Migration QA Gate Report

**Date:** 2026-03-09
**Scope:** OP_NET testnet live migration — full transition from simulated to live wallet-native behavior
**Verdict:** CONDITIONAL PASS — 3 blockers identified, 5 advisories

---

## 1. Wallet Auth / Session

| Check | Status | Detail |
|-------|--------|--------|
| Nonce + BIP-322 verification | PASS | `auth.ts:163-237` — verifies BIP-322 signature via `bip322-js`, single-use nonce with 5-min TTL |
| JWT session via HttpOnly cookie | PASS | `auth.ts:226-235` — `opfun_session` cookie, sameSite=strict in prod, httpOnly=true |
| `verifyWalletToken` middleware | PASS | `verifyWalletToken.ts:16-44` — checks cookie, verifies JWT, attaches `walletSession` |
| Buy routes auth-gated | PASS | `buy.ts:119,262` — both `buy-intent` and `buy-confirm` use `preHandler: [verifyWalletToken]` |
| Launch routes auth-gated | PASS | `launch.ts:108,193,251` — `launch-build`, `deploy-submit`, `pool-submit` all require wallet auth |
| Wallet address mismatch guard | PASS | `buy.ts:129-131` — `walletAddress` in body must match session; rejects with 400 on mismatch |
| Shop routes auth-gated | PASS | `clans.ts` shop routes use `verifyWalletToken` |
| Floor routes auth-gated | PASS | `floor.ts` — callout/chat creation validates `walletAddress` matches session |
| Project creation auth | PASS | `projects.ts` — POST /projects requires `verifyWalletToken` |
| Dev session disabled in prod | PASS | `auth.ts:247-249` — returns 403 when `NODE_ENV === "production"` |

**DEV FALLBACK ADVISORY:**
- `auth.ts:200-206` — When BIP-322 verification fails in non-production, `DEV_AUTH_SESSION` allows fallback. This is correctly gated by `NODE_ENV !== "production"`.
- `verifyWalletToken.ts:14,27-33` — Dev-only `Authorization: Bearer` fallback gated by `DEV_AUTH_HEADER_FALLBACK=true`.

**Result: PASS**

---

## 2. Live Data

| Check | Status | Detail |
|-------|--------|--------|
| `/opnet/prices` — real data or 503 | PASS | `opnet.ts:40-57` — fetches from upstream, returns 503 on failure. No fallback values. |
| `/opnet/block-status` — real data or 503 | PASS | `opnet.ts:21-38` — fetches from upstream, returns 503 on failure. No fallback values. |
| `/opnet/btc-price` — real data or 503 | PASS | `opnet.ts:59-76` — fetches CoinGecko, returns 503 on failure. No fallback values. |
| `opnetProvider.ts` — no placeholder data | PASS | Line 9: explicit comment "No placeholder data. Throws on upstream failure." Validates block height > 0 (line 103), BTC price > 0 (line 141). |
| Market indexer — no fake data | PASS | `marketIndexer.ts:1-6` — explicit header: "No placeholder trade paths remain here." All functions read from Prisma (confirmed on-chain events). |
| Candle data from confirmed fills | PASS | `marketIndexer.ts:102-148` — `rollCandle` only called from `recordTradeFill`, which requires confirmed on-chain event. |
| `getLiveQuote` returns null when no reserves | PASS | `marketIndexer.ts:449-451` — returns null when reserves ≤ 0. Caller returns 503. |
| Watcher writes only on-chain data | PASS | `watcher/index.ts` — reads pool reserves via `opnet_rpc getStorageAt`, confirms trades via `fetchTransactionReceipt`. No simulated injection. |
| No hardcoded BTC/token prices | PASS | Searched all services — no hardcoded price constants used as fallbacks. |
| No `Math.random()` for market data | PASS | No random price/market generation anywhere in apps/api or apps/watcher. |

**Result: PASS**

---

## 3. Launch Flow

| Check | Status | Detail |
|-------|--------|--------|
| LaunchStatus state machine | PASS | `launchMachine.ts:11-21` — strict transition table: DRAFT→BUILDING→AWAITING_WALLET_DEPLOY→DEPLOY_SUBMITTED→DEPLOY_CONFIRMED→AWAITING_POOL_CREATE→POOL_SUBMITTED→LIVE |
| LIVE requires pool confirmation | PASS | Only `POOL_SUBMITTED → LIVE` is allowed (line 18). `confirmPoolOnChain` (launch.ts:641-679) transitions only from POOL_SUBMITTED. |
| Deploy confirmation requires on-chain check | PASS | Watcher `confirmLaunchOnChain` (watcher/index.ts:364-408) calls `opnet_rpc getCode` to verify contract exists before calling `confirm-deploy-onchain`. |
| Pool confirmation requires on-chain check | PASS | Watcher calls `opnet_rpc getCode` on pool address (watcher/index.ts:387-407) before calling `confirm-pool-onchain`. |
| No skip/bypass to LIVE | PASS | No route transitions directly to LIVE except through POOL_SUBMITTED confirmation. |
| Backend never custodies keys | PASS | `launch.ts:11` — "Backend never custodies deploy keys — all signing happens in the user's wallet." Deploy-submit and pool-submit accept already-signed tx from wallet. |
| Build does NOT auto-deploy | PASS | `launch.ts:562` — "we do NOT auto-deploy. The user's wallet must sign." |
| Failed launches can retry | PASS | `FAILED → DRAFT` allowed (launchMachine.ts:20). `launch-build` handles FAILED state (launch.ts:136-138). |

**ADVISORY — Legacy admin deploy path:**
- `deploy.ts:96-170` — `POST /projects/:id/confirm-deploy` allows admin (X-Admin-Secret) to manually set status to LAUNCHED with `contractAddress` + `deployTx`. Uses the old `statusMachine.ts` (not `launchMachine.ts`). This does NOT set `launchStatus` to LIVE — it only sets `status` to LAUNCHED.
- **Risk:** An admin could mark a project as LAUNCHED via the legacy path, but trading still requires `launchStatus === "LIVE"` (checked in buy.ts:143,292), so trading cannot occur without the full launch pipeline completion.
- **Recommendation:** Remove or gate the legacy `confirm-deploy` route for mainnet. Mark as deprecated.

**Result: PASS**

---

## 4. Trading Flow

| Check | Status | Detail |
|-------|--------|--------|
| Buy-intent returns live quote | PASS | `buy.ts:174` — calls `getLiveQuote(id, side, inputAmount)` which reads from `ProjectMarketState` (confirmed pool reserves). Returns 503 if null. |
| Pool must be LIVE for trading | PASS | `buy.ts:143-149,292-294` — both buy-intent and buy-confirm reject with 409 if `launchStatus !== "LIVE"`. |
| Buy-confirm requires signed payload | PASS | `buy.ts:297-302` — rejects with 400 if no `txId`, `signedPsbt`, or `signedTxHex` provided. Message: "Placeholder execution is no longer supported." |
| Failed broadcast returns 502 | PASS | `buy.ts:392-395` — returns 502 if RPC broadcast fails. Does NOT create a fill or fake success. |
| Trade submission queued as SUBMITTED | PASS | `marketIndexer.ts:313-340` — `queueTradeSubmission` creates with `status: "SUBMITTED"`. |
| Fills created only from confirmed events | PASS | `marketIndexer.ts:202-265` — `recordTradeFill` requires `SwapEvent` with txId, blockHeight, confirmedAt. Called only from `confirmTradeSubmission`. |
| Watcher verifies on-chain before confirming | PASS | `watcher/index.ts:520-558` — `indexPendingTrades` calls `fetchTransactionReceipt`, checks `receiptStatus`, only confirms if status === "confirmed". |
| Charts update from fills only | PASS | `marketIndexer.ts:258` — `rollCandle` called inside `recordTradeFill`, which is only called from confirmed on-chain events. |
| Leaderboard reads from confirmed fills | PASS | `foundation.ts:174-176` — reads from `prisma.tradeFill.findMany` (confirmed fills only). |
| Profile stats from confirmed events | PASS | `marketIndexer.ts:150-171` — `refreshLiveDerivations` called inside `recordTradeFill`. |

**BLOCKER B1 — buy-confirm accepts txId without server-side verification:**
- `buy.ts:316-350` — When wallet provides `txId` (i.e., wallet already broadcasted), the server queues the trade as SUBMITTED and returns 201 immediately. The watcher later confirms on-chain. However, between submission and watcher confirmation, the response says "BROADCAST_SUBMITTED" which the frontend could misinterpret as a completed trade.
- **Actual risk:** LOW — the trade is only a TradeSubmission in SUBMITTED status. It does NOT create a TradeFill. Charts, leaderboards, and profile stats only update from confirmed TradeFill records. The watcher must confirm on-chain before any downstream effects occur.
- **Verdict:** Downgraded from BLOCKER to ADVISORY. The behavior is correct — it's a queue, not a confirmation. The status "BROADCAST_SUBMITTED" accurately describes the state. No data integrity risk.

**Result: PASS**

---

## 5. Shop / OP721 Flow

| Check | Status | Detail |
|-------|--------|--------|
| Mint-intent returns OP721 params | PASS | `shopStore.ts:185-248` — returns `collectionAddress`, `tokenId`, `itemKey`. Requires `SHOP_OP721_COLLECTION` env. |
| Collection not deployed → clear error | PASS | `shopStore.ts:192-193` — throws "Shop collection not deployed" if env not set. |
| Confirm-mint records as PENDING | PASS | `shopStore.ts:257-307` — upserts with `status: "PENDING"`. Not CONFIRMED. |
| Duplicate mint blocked | PASS | `shopStore.ts:200-213,270-276` — existing CONFIRMED mint returns `alreadyOwned: true` / `alreadyConfirmed: true`. One-per-wallet enforced via `@@unique([walletAddress, itemKey])`. |
| Watcher confirms on-chain | PASS | `shopStore.ts:311-329` — `confirmMintOnchain` sets status to CONFIRMED with timestamp. |
| Entitlements require CONFIRMED | PASS | `shopStore.ts:156-161` — `hasEntitlement` queries `status: "CONFIRMED"` only. |
| Inventory shows CONFIRMED only | PASS | `shopStore.ts:148-154` — `getWalletInventory` queries `status: "CONFIRMED"` only. |
| Use-item revalidates ownership | PASS | `shopStore.ts:424-455` — `useShopItem` calls `revalidateOwnership` first. |
| Revalidation checks on-chain via RPC | PASS | `shopStore.ts:351-380,382-420` — calls `ownerOf` RPC if configured. Deactivates if ownership lost. |

**BLOCKER B2 — RPC fallback trusts DB when RPC unavailable:**
- `shopStore.ts:387,404,410,416` — `checkOnchainOwnership` returns `true` (trust DB) on RPC failure, error, or inconclusive result.
- **Risk:** If RPC is down, a user who transferred/burned their OP721 could still use the feature. This is a known design choice (graceful degradation), but should be documented as a temporary measure.
- **Recommendation:** For mainnet, consider returning `false` on RPC failure and requiring users to retry. Log these events for monitoring.

**BLOCKER B3 — Watcher does not poll pending shop mints:**
- `shopStore.ts:459-466` exposes `listPendingMints()`, but `watcher/index.ts` does not call it. Pending OP721 mints are never confirmed by the watcher.
- **Risk:** Shop mints remain in PENDING status forever unless manually confirmed. Users cannot access features they paid for.
- **Recommendation:** Add a mint confirmation cycle to the watcher that polls pending mints and verifies on-chain via `getTransactionReceipt` or `ownerOf`.

**Result: CONDITIONAL PASS (B3 is a real blocker)**

---

## 6. Cleanup Validation

| Check | Status | Detail |
|-------|--------|--------|
| No "simulated" status in UI | PASS | Searched all .tsx/.ts/.css — no "SIMULATED", "PAPER", "TESTNET_INTEGRATION_PENDING", "SIMULATED_EXECUTION" strings found in active code. |
| No SimTrade model | PASS | Removed from schema.prisma. Drop migration created (`20260309220000_drop_sim_trade`). |
| No sim.ts routes | PASS | File deleted. Registration removed from index.ts. |
| No BondingCurvePanel | PASS | File deleted. No imports found. |
| No badge_simulated | PASS | SVG deleted. CSS class removed from globals.css. |
| No mockDelta field | PASS | Removed from FloorTickerDTO in shared types. Removed from floor.ts API response. Removed from all 5 frontend components. |
| No fake candle data | PASS | Candles come exclusively from `CandleSnapshot` table, populated by `rollCandle` during confirmed trade fills. |
| No endpoints treating missing tx as success | PASS | `buy-confirm` rejects missing payload (line 298-302). Shop confirm records as PENDING (not CONFIRMED). |
| No JSON-backed shop | PASS | `shop-mints.json` deleted. `shopStore.ts` is fully Prisma-backed. |
| No bonding curve pricing | PASS | `curvePrice()`, `simMcap()`, `BASE_PRICE`, `CURVE_FACTOR` removed from ProjectPageClient. Docs updated. |
| Smoke tests updated | PASS | Sim-dependent tests replaced with live-compatible tests. Regression test verifies sim routes return 404. |

**Remaining references (benign):**
- `RoadmapSection.tsx:19` — "AMM & Liquidity Pools" (correctly updated from "Bonding Curves")
- `smoke.spec.ts:136` — "sim routes are removed and return 404" (intentional regression test)

**Result: PASS**

---

## Summary

### Pass / Fail

| Section | Verdict |
|---------|---------|
| 1. Wallet Auth/Session | PASS |
| 2. Live Data | PASS |
| 3. Launch Flow | PASS |
| 4. Trading Flow | PASS |
| 5. Shop/OP721 Flow | CONDITIONAL PASS |
| 6. Cleanup Validation | PASS |

### Blockers (must fix before mainnet)

| ID | Severity | Description | File | Fix |
|----|----------|-------------|------|-----|
| B2 | MEDIUM | RPC fallback trusts DB when unavailable — allows feature access after ownership transfer | `shopStore.ts:387,404,410,416` | Return false on RPC failure for mainnet; add monitoring |
| B3 | HIGH | Watcher does not poll pending shop mints — mints stuck in PENDING forever | `watcher/index.ts` (missing cycle) | Add `indexPendingMints()` cycle to watcher alongside `indexPendingTrades()` |

### Advisories (non-blocking)

| ID | Description | File |
|----|-------------|------|
| A1 | Dev auth fallback (BIP-322 bypass) must be confirmed disabled in prod deployment | `auth.ts:200-206` |
| A2 | Dev session route should be removed or explicitly disabled for mainnet | `auth.ts:244-275` |
| A3 | Legacy admin `confirm-deploy` route bypasses wallet launch pipeline | `deploy.ts:96-170` |
| A4 | `ADMIN_SECRET` defaults to `"dev-secret-change-me"` — must be overridden in prod | `deploy.ts:12`, `launch.ts:297`, `watcher/index.ts:8` |
| A5 | `checkOnchainOwnership` uses multiple fallback `return true` paths — tighten for mainnet | `shopStore.ts:382-420` |

### Files Violating Live-Only Rules

| File | Issue | Severity |
|------|-------|----------|
| `apps/watcher/src/index.ts` | Missing shop mint confirmation cycle | HIGH (B3) |
| `apps/api/src/services/shopStore.ts:382-420` | Graceful degradation trusts DB on RPC failure | MEDIUM (B2) |
| `apps/api/src/routes/deploy.ts:96-170` | Legacy admin deploy path (parallel to wallet pipeline) | LOW (A3) |

---

**Overall Verdict: CONDITIONAL PASS**

The system has successfully transitioned from simulated to live wallet-native behavior. All trading, pricing, charting, and shop operations require real on-chain data. No simulated paths remain. The one blocking issue (B3: watcher not confirming shop mints) must be resolved before the shop can function end-to-end. The RPC fallback advisory (B2) should be addressed before mainnet but is acceptable for testnet.
