# On-Chain Fix Implementation Report

**Date:** 2026-03-10
**Status:** All 5 commits implemented, typechecks passing

---

## Summary

Implemented 5 incremental changes to wire the `opnet` npm package into runtime contract interactions, replacing raw JSON-RPC fetch calls and stub flows across the codebase.

---

## Commit 1: `feat(opnet): add runtime provider wrapper`

**File created:** `packages/opnet/src/runtime-provider.ts` (653 lines)
**File modified:** `packages/opnet/src/index.ts` (added 37 export lines)

**What it does:**
- Singleton `JSONRpcProvider` from the `opnet` npm package with `networks.testnet`
- Runtime config validation with `assertRuntimeConfig()` and `RuntimeConfigError`
- Health check with latency measurement (`checkProviderHealth`)
- Full pool state reads via `IMotoswapPoolContract` (`fetchLivePoolState`, `fetchLivePoolReserves`)
- Pool address lookup via `IMotoswapFactoryContract` (`findPoolAddress`)
- Pool creation simulation via Factory (`preparePoolCreation`) — returns offline buffer for wallet signing
- OP721 mint simulation (`prepareShopMint`) — returns offline buffer for wallet signing
- Transaction receipt lookup (`fetchTransactionReceipt`)
- Transaction broadcast (`broadcastTransaction`, `broadcastSignedInteraction`)
- OP721 ownership verification via `IOP721Contract` (`checkOp721Ownership`)
- Contract code existence check (`checkContractCode`)
- Storage slot reads (`readStorageSlot`)
- Address normalization helpers (hex, p2op, p2tr formats)
- Centralized config: `OPNET_RPC_URL`, `MOTOSWAP_FACTORY_ADDRESS`, `MOTOSWAP_ROUTER_ADDRESS`, `SHOP_OP721_COLLECTION`

**Key decisions:**
- Used typed interface generics (`getContract<IMotoswapPoolContract>`, `getContract<IOP721Contract>`) for proper TypeScript support
- Custom `SHOP_OP721_MINT_ABI` extends `OP_721_ABI` with a `mint(tokenId, to)` function
- `preparePoolCreation` and `prepareShopMint` simulate first, then produce `offlineBufferHex` for wallet signing
- All functions return `null`/fallback on error — callers can gracefully degrade

---

## Commit 2: `feat(pool): implement in-app pool creation`

**File modified:** `apps/api/src/routes/launch.ts` — added `GET /projects/:id/pool-params`
**Already existed:** `apps/web/src/components/LaunchPanel.tsx` (pool creation UI), `apps/web/src/lib/api.ts` (`fetchPoolParams`, `submitPool`)

**What it does:**
- New API route returns Motoswap factory/router addresses, token contract address, and liquidity parameters
- LaunchPanel shows pool params + instructions when in `AWAITING_POOL_CREATE` state
- User enters pool TX ID + pool address in text inputs (no `window.prompt`)
- Submits via `POST /projects/:id/pool-submit` (existing route)

---

## Commit 3: `feat(quote): use live pool reads in buy-intent`

**File modified:** `apps/api/src/services/marketIndexer.ts` — updated `getLiveQuote()`

**What changed:**
- `getLiveQuote()` now tries `fetchLivePoolReserves(poolAddress)` from `@opfun/opnet` first
- Falls back to Prisma `ProjectMarketState` if live fetch fails
- Return type extended with `source: "live" | "indexed"` field
- No caller changes needed — existing fields preserved

**Before:** DB-only reserves (stale between watcher cycles)
**After:** Live on-chain reserves when available, DB fallback

---

## Commit 4: `feat(shop): replace stubbed mint flow with op721 interaction`

**Files modified:**
- `apps/web/src/app/shop/page.tsx` — removed `window.prompt()`, added manual txId input UI
- `apps/api/src/services/shopStore.ts` — replaced raw JSON-RPC `ownerOf` with `checkOp721Ownership` from `@opfun/opnet`

**What changed in shop page:**
- When OP_WALLET native `op_mint` API fails, shows an in-page text input (not `window.prompt`)
- New `handleManualMintConfirm()` function for manual txId submission
- Cancel button to dismiss manual input
- Zero `window.prompt()` remaining in entire codebase

**What changed in shopStore:**
- `checkOnchainOwnership()` now uses `checkOp721Ownership()` from the shared provider
- Extracts numeric token index from the `{skuIndex}-{suffix}` tokenId format
- Same fallback behavior (trust DB on error)

---

## Commit 5: `refactor(rpc): migrate watcher and buy route to shared opnet provider`

**Files modified:**
- `apps/api/src/routes/buy.ts` — replaced `tryBroadcastOnchain()` (4 method name guesses) with `broadcastTransaction()` from `@opfun/opnet`
- `apps/watcher/src/index.ts` — replaced `fetchTransactionReceipt()` (6 method name guesses) with shared provider version; replaced `indexPoolReserves()` (Bob MCP `getStorageAt` calls) with `fetchLivePoolReserves()`; removed unused `rpcCall()` function

**Before (buy.ts):** Raw fetch with 4 JSON-RPC method name guesses (`sendrawtransaction`, `sendRawTransaction`, `broadcastTransaction`, `broadcast`)
**After (buy.ts):** Single call to `broadcastTransaction(signedPayload, false)` from shared provider

**Before (watcher):** `rpcCall()` with raw fetch + 6 method name guesses for receipts; Bob MCP `opnet_rpc` tool for storage slot reads
**After (watcher):** `fetchTransactionReceipt` from `@opfun/opnet`; `fetchLivePoolReserves` from `@opfun/opnet` for pool reserves

---

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit --project packages/opnet/tsconfig.json` | PASS |
| `npx tsc --noEmit --project apps/api/tsconfig.json` | PASS |
| `npx tsc --noEmit --project apps/web/tsconfig.json` | PASS |
| `npx tsc --noEmit --project apps/watcher/tsconfig.json` | PASS |
| `grep -r "window.prompt" apps/` | 0 matches |
| No raw PSBT construction | Confirmed |
| No `bitcoinjs-lib` imports | Confirmed |
| Deploy/auth flows untouched | Confirmed |

---

## Files Changed

| File | Change | Lines |
|---|---|---|
| `packages/opnet/src/runtime-provider.ts` | Created | 653 |
| `packages/opnet/src/index.ts` | Modified | +37 |
| `apps/api/src/routes/launch.ts` | Modified | +38 (pool-params route) |
| `apps/api/src/services/marketIndexer.ts` | Modified | getLiveQuote enhanced |
| `apps/api/src/services/shopStore.ts` | Modified | checkOnchainOwnership replaced |
| `apps/api/src/routes/buy.ts` | Modified | tryBroadcastOnchain replaced |
| `apps/watcher/src/index.ts` | Modified | indexPoolReserves + fetchTransactionReceipt replaced, rpcCall removed |
| `apps/web/src/app/shop/page.tsx` | Modified | window.prompt removed, manual input added |

---

## What's NOT Changed (by design)

- **Deploy pipeline** (`deployer.ts`, `deploy-script.ts`) — uses `@btc-vision/transaction` correctly
- **Auth flow** (`auth.ts`, `verifyWalletToken.ts`) — BIP-322 verification working
- **Wallet connection** (`WalletProvider.tsx`) — detection logic preserved
- **Launch state machine** (`launchMachine.ts`) — transitions unchanged
- **Frontend signing** — still `signer=null, mldsaSigner=null` (wallet signs)
