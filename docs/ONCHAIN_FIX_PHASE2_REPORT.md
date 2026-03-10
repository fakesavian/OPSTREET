# On-Chain Fix Phase 2 — Verification Report

**Date:** 2026-03-10
**Scope:** Eliminate all remaining manual/stub behavior in pool creation, shop minting, ownership verification, and quote freshness.

---

## 1. Pool Creation — Wallet-Native Flow

**Before:** LaunchPanel showed pool params (factoryAddress, baseToken, initialLiquidity) and required the user to manually paste `poolTxId` and `poolAddress` into text inputs. Not a real in-app flow.

**After:** Single "Create Liquidity Pool" button. Backend simulates pool creation via `preparePoolCreation()`, returns an `offlineBufferHex` interaction buffer. Frontend calls `signInteractionBuffer()` to have the wallet sign it, then `poolBroadcast()` sends the signed tx to the backend for broadcast via `broadcastSignedInteraction()`.

**Files changed:**
- `apps/api/src/routes/launch.ts` — Added `POST /projects/:id/pool-create` and `POST /projects/:id/pool-broadcast`
- `apps/web/src/components/LaunchPanel.tsx` — Removed manual pool inputs, added `handleCreatePool()` wallet-native flow
- `apps/web/src/lib/api.ts` — Added `poolCreate()` and `poolBroadcast()` API functions

**Verification:** No `poolTx.*useState`, `poolAddr.*useState`, or manual pool text inputs remain in `apps/web/src/`.

---

## 2. Shop Mint — Wallet-Native OP721 Flow

**Before:** Shop page had a manual `txId` entry fallback (`manualTxId` state, `handleManualMintConfirm()`) that let users paste a transaction ID when wallet mint failed. Not a proper OP721 mint flow.

**After:** Mint flow is fully wallet-native: `shopMintIntent()` returns an interaction buffer from `prepareShopMint()`, frontend calls `signInteractionBuffer()`, then `shopMintBroadcast()` sends signed tx for broadcast. If the interaction buffer is null (collection not deployed), the mint fails with a clear error — no manual fallback.

**Files changed:**
- `apps/api/src/routes/clans.ts` — `POST /shop/mint-intent` now includes `interaction` from `prepareShopMint()`; added `POST /shop/mint-broadcast`
- `apps/web/src/app/shop/page.tsx` — Removed `manualTxId`, `pendingMintItem`, manual txId input UI; added wallet-native mint flow
- `apps/web/src/lib/api.ts` — Added `shopMintBroadcast()`, updated `MintIntentResponse` type

**Verification:** No `manualTxId`, `pendingMintItem`, `handleManualMintConfirm`, or `window.prompt` patterns remain in `apps/web/src/`.

---

## 3. Ownership Verification — No Stale DB Trust

**Before:** `checkOnchainOwnership()` returned `boolean`. On chain-check failure (RPC error, network down), `revalidateOwnership()` fell back to trusting the DB `CONFIRMED` status unconditionally. This allowed stale or revoked ownership to gate live features.

**After:** `OwnershipStatus` is a tristate: `"owned" | "not_owned" | "verification_unavailable"`. On chain-check failure, cached ownership is only trusted if `confirmedAt` is within `OWNERSHIP_CACHE_MAX_AGE_MS` (default 5 minutes). Beyond that, returns `"verification_unavailable"`. `useShopItem()` rejects `verification_unavailable` with a specific error message asking the user to try again later.

**Files changed:**
- `apps/api/src/services/shopStore.ts` — `OwnershipStatus` type, `OWNERSHIP_CACHE_MAX_AGE_MS` config, updated `revalidateOwnership()` and `checkOnchainOwnership()` return types, `useShopItem()` blocks on `verification_unavailable`

**Verification:** `verification_unavailable` appears in shopStore.ts at lines 351, 393, 397, 414, 430 — covering the type definition, all return paths, and the entitlement gate.

---

## 4. Quote Freshness — Stale Reserve Rejection

**Before:** `getLiveQuote()` fell back to indexed reserves from the `poolSnapshot` table without checking how old the data was. Stale indexed reserves (hours or days old) could produce misleading quotes.

**After:** `MARKET_INDEX_MAX_STALENESS_MS` (default 10 minutes, configurable via env var) sets a hard freshness threshold. If the most recent `poolSnapshot` for a project is older than this threshold, `getLiveQuote()` returns `null` — the caller must handle the no-quote case. The `snapshotAgeMs` value is included in successful responses for transparency.

**Files changed:**
- `apps/api/src/services/marketIndexer.ts` — Added `MARKET_INDEX_MAX_STALENESS_MS`, freshness check in `getLiveQuote()`, `snapshotAgeMs` in return type

**Verification:** `MARKET_INDEX_MAX_STALENESS_MS` and `snapshotAgeMs` confirmed present in marketIndexer.ts at lines 434-435, 451, 462, 489-490, 509.

---

## 5. Wallet Signing Infrastructure

**New function:** `signInteractionBuffer(offlineBufferHex)` in `apps/web/src/lib/wallet.ts`

Tries multiple OP_WALLET methods in order:
1. `signAndBroadcastInteraction` (direct method)
2. `signInteraction` (direct method)
3. `signTransaction` (direct method)
4. Request-style methods via `request({ method: ... })`

Returns `SignedInteractionResult` with `interactionTransactionRaw` and optional `fundingTransactionRaw`.

---

## 6. Shared OPNet Provider Functions

All on-chain interactions now go through `packages/opnet/src/runtime-provider.ts`:

| Function | Purpose |
|---|---|
| `preparePoolCreation()` | Simulate Motoswap pool creation, return interaction buffer |
| `prepareShopMint()` | Simulate OP721 mint, return interaction buffer |
| `broadcastSignedInteraction()` | Broadcast signed funding + interaction tx pair |
| `fetchLivePoolReserves()` | Read pool reserves via typed contract call |
| `checkOp721Ownership()` | Verify NFT ownership on-chain |
| `broadcastTransaction()` | Broadcast a raw transaction |
| `fetchTransactionReceipt()` | Get transaction confirmation status |

---

## 7. Typecheck Status

| Package | Status |
|---|---|
| `packages/opnet` | PASS |
| `apps/api` | PASS |
| `apps/web` | PASS |
| `apps/watcher` | PASS |

---

## 8. Summary of Removed Patterns

| Pattern | Location | Status |
|---|---|---|
| Manual `poolTxId` / `poolAddress` text inputs | LaunchPanel.tsx | REMOVED |
| Manual `txId` entry fallback in shop | shop/page.tsx | REMOVED |
| `window.prompt()` calls | all apps/ | REMOVED |
| Unconditional DB trust on chain-check failure | shopStore.ts | REPLACED with time-bounded cache |
| Unbounded stale indexed reserve fallback | marketIndexer.ts | REPLACED with freshness threshold |
| Raw JSON-RPC calls in watcher | watcher/src/index.ts | REPLACED with shared provider |
| Raw JSON-RPC calls in buy route | buy.ts | REPLACED with shared provider |
