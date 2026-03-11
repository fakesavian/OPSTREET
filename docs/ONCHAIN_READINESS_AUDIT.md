# Full On-Chain Readiness Audit

**Date:** 2026-03-10
**Scope:** All 8 on-chain flows — wallet, provider, deploy, pool, quote, trade, watcher, shop
**Verdict:** 3 flows READY, 3 PARTIAL, 2 STUB

---

## Summary Matrix

| # | Flow | Readiness | Blocking Issues |
|---|------|-----------|-----------------|
| 1 | Wallet Connection + Network Detection | **READY** | 0 |
| 2 | OP_NET Provider Connectivity | **PARTIAL** | No direct opnet npm RPC; relies on upstream HTTP |
| 3 | Deploy Path | **READY** | 0 (needs live wallet test) |
| 4 | Pool Creation Path | **PARTIAL** | No on-chain pool creation tx builder |
| 5 | Live Quote Path | **PARTIAL** | Quotes from DB reserves, not on-chain simulation |
| 6 | Live Trade Confirmation Path | **READY** | 0 (needs live wallet test) |
| 7 | Watcher / Indexer Path | **READY** | 0 (needs OPNET_RPC_URL configured) |
| 8 | Shop Mint Path | **STUB** | `op_mint` method speculative; falls back to prompt() |

---

## 1. Wallet Connection + Network Detection

**Status: READY**

### Code Path

1. `WalletProvider.tsx:157-181` — `connect()` triggers `connectWallet()` from `wallet.ts`
2. `wallet.ts:269-301` — Priority: Unisat → OKX → OPNet → throws `NO_WALLET`
3. `wallet.ts:180-184` — OPNet detected via `window.opnet ?? window.opnetWallet ?? window.btcwallet ?? window.bitcoin`
4. `wallet.ts:216-229` — `ensureOPNetTestnet()` calls `p.getNetwork()`, validates `/testnet/i`, attempts `switchNetwork("testnet")` if wrong
5. `wallet.ts:233-265` — `connectOPNetProvider()` tries 6 connection methods in order: `requestAccounts → connect → getAccounts → getCurrentAddress → selectedAddress → accounts`
6. `wallet.ts:295-297` — Network guard: throws if `!isTestnetNetwork(result.network)`

### HRP Conversion

- `wallet.ts:145-153` — `toOpnetTestnetAddress()` converts `tb1`/`bcrt1` → `opt1` (OPNet testnet HRP)
- `wallet.ts:332-342` — `toBip322Address()` converts `opt1` → `tb1` for BIP-322 signature verification
- Server-side mirror in `auth.ts:119-127` — `toSigningAddress()` does the same `opt1` → `tb1` conversion

### Auth Flow

1. `WalletProvider.tsx:99-155` — `runWalletVerification()` → fetch nonce → sign BIP-322 → verify
2. `auth.ts:131-160` — `POST /auth/nonce` — issues random 16-byte nonce, stored in Prisma, 5min TTL
3. `auth.ts:163-237` — `POST /auth/verify` — BIP-322 verify via `bip322-js`, issues HttpOnly JWT cookie (24h)
4. `auth.ts:200-206` — Dev fallback: if `NODE_ENV !== "production"` and BIP-322 fails, allows session anyway
5. `auth.ts:246-275` — `POST /auth/dev-session` — dev-only route, creates session without signature

### Findings

- **No issues found.** Provider detection covers all known OPNet injection points.
- Network detection properly validates testnet and attempts auto-switch.
- BIP-322 auth with nonce is cryptographically sound (single-use nonces, deleted after verify).
- Dev fallback is production-gated.

### BTC Vision Repo Mapping
- **None required** — wallet detection is browser extension API, not BTC Vision SDK.
- BIP-322 verification uses `bip322-js` (correct, standalone library).

---

## 2. OP_NET Provider Connectivity

**Status: PARTIAL**

### Code Path

**Backend upstream provider** (`services/opnetProvider.ts`):
- `opnetProvider.ts:12-14` — Three configurable URLs:
  - `OPNET_EXPLORER_URL` = `https://testnet.opnet.org` (default)
  - `OPNET_MEMPOOL_URL` = custom mempool node (optional)
  - `OPNET_VM_URL` = custom VM node (optional)
- `opnetProvider.ts:91-113` — `fetchBlockStatus()` — `GET {base}/block/latest`
- `opnetProvider.ts:115-131` — `fetchTokenPrices()` — `GET {base}/prices`
- `opnetProvider.ts:133-146` — `fetchBtcUsd()` — CoinGecko API

**API routes** (`routes/opnet.ts`):
- `opnet.ts:21-38` — `GET /opnet/block-status` — cached 5s
- `opnet.ts:40-57` — `GET /opnet/prices` — cached 30s
- `opnet.ts:59-76` — `GET /opnet/btc-price` — cached 60s

**Watcher direct RPC** (`watcher/src/index.ts`):
- `index.ts:11-13` — `OPNET_RPC_URL` + `OPNET_RPC_KEY` env vars
- `index.ts:447-478` — `rpcCall()` — raw JSON-RPC 2.0 POST to `OPNET_RPC_URL`
- `index.ts:480-498` — `fetchTransactionReceipt()` — tries 6 method names: `getTransactionReceipt`, `gettransactionreceipt`, `eth_getTransactionReceipt`, `getTransaction`, `gettransaction`, `eth_getTransactionByHash`

**Buy route RPC** (`routes/buy.ts`):
- `buy.ts:15-16` — `OPNET_RPC_URL` + `OPNET_RPC_KEY`
- `buy.ts:72-114` — `tryBroadcastOnchain()` — tries 4 broadcast methods: `sendrawtransaction`, `sendRawTransaction`, `broadcastTransaction`, `broadcast`

### Findings

1. **Does NOT use the `opnet` npm package for RPC.** All on-chain reads/writes use raw `fetch()` with JSON-RPC 2.0. This works but bypasses the typed SDK.
2. **Explorer API is HTTP REST** (not JSON-RPC) — used only for block status and prices.
3. **No `OPNetLimitedProvider` usage at runtime.** Only the deploy script template (`deploy-script.ts:65`) uses it, and that runs standalone.
4. **Method name guessing** in watcher/buy routes (tries multiple RPC method names) — fragile but functional. Real OPNet RPC method names need verification.
5. **No connection health check** — if `OPNET_RPC_URL` is wrong, failures are silent (returns `null`).

### BTC Vision Repo Mapping
- **Should use:** `opnet` npm package → `OPNetLimitedProvider` or `JSONRpc2Provider` for typed RPC calls
- **Currently uses:** Raw `fetch()` — works but untyped and fragile

### Recommendation
Replace raw `rpcCall()` in watcher and buy routes with `OPNetLimitedProvider` from the `opnet` npm package. It already exists in `packages/opnet/package.json` as a dependency.

---

## 3. Deploy Path

**Status: READY** (pending live wallet test)

### Code Path

**Launch pipeline (wallet-driven):**
1. `launch.ts:106-155` — `POST /projects/:id/launch-build` — triggers `runBuild()` in background
2. `launch.ts:526-590` — `runBuild()` → calls `deployContract()` from `@opfun/opnet`
3. `deployer.ts:263-314` — `deployContract()` pipeline:
   - `scaffoldDeployPackage()` — generates AS contract + deploy script + configs
   - `tryCompile()` — runs `asc` compiler if available
   - `tryAutoDeploy()` — runs `deploy.ts` via ts-node if `OPNET_MNEMONIC` set
4. State machine: `DRAFT → BUILDING → AWAITING_WALLET_DEPLOY`

**User wallet deploy flow:**
1. `launch.ts:191-245` — `POST /projects/:id/deploy-submit` — records `deployTx` + `contractAddress`
2. State: `AWAITING_WALLET_DEPLOY → DEPLOY_SUBMITTED`
3. Watcher confirms on-chain: `DEPLOY_SUBMITTED → DEPLOY_CONFIRMED → AWAITING_POOL_CREATE`

**Deploy script template** (`deploy-script.ts`):
- `deploy-script.ts:37` — `NETWORK = networks.opnetTestnet` ✅ (correct, NOT `networks.testnet`)
- `deploy-script.ts:38` — `RPC_URL = 'https://testnet.opnet.org'` ✅
- `deploy-script.ts:50-51` — `new Mnemonic(phrase, '', NETWORK)` → `mnemonic.derive(0)`
- `deploy-script.ts:69-73` — `provider.fetchUTXO()` with `minAmount: 1_000_000n`, `requestedAmount: 10_000_000n`
- `deploy-script.ts:82-93` — Balance check: requires 10M sats minimum, clear error messages
- `deploy-script.ts:124-136` — `factory.signDeployment()` with:
  - `signer: wallet.keypair` ✅ (backend must provide signer)
  - `mldsaSigner: wallet.mldsaKeypair` ✅ (ML-DSA, not ECDSA)
  - `feeRate: 5`, `priorityFee: 330n`, `gasSatFee: 330n`
- `deploy-script.ts:143-148` — Two-step broadcast: funding TX first, then deployment TX
- `deploy-script.ts:171` — `mnemonic.zeroize(); wallet.zeroize()` ✅ (key cleanup)

### Contract Template

- Fixed-supply OP-20 with safe defaults (no mint, no pause, no admin, no upgrade)
- Uses `btc-runtime` `OP_20` base class
- `_mint(address, amount)` called once in `onDeployment()`

### Findings

1. **Correct** use of `TransactionFactory` from `@btc-vision/transaction` for deployment ✅
2. **Correct** network: `networks.opnetTestnet` ✅
3. **No raw PSBT construction** ✅ (uses `factory.signDeployment()`)
4. **ML-DSA signer** used, not ECDSA ✅
5. **Key zeroization** after use ✅
6. **Mnemonic via env var only** — never accepted from API callers ✅
7. **Build hash tracked** in DB for artifact integrity

### BTC Vision Repo Mapping
| Package | Usage | Correct |
|---------|-------|---------|
| `@btc-vision/transaction` | `TransactionFactory.signDeployment()`, `Mnemonic`, `OPNetLimitedProvider` | ✅ Deployment only |
| `@btc-vision/bitcoin` | `networks.opnetTestnet` | ✅ |
| `@btc-vision/bip32` | Key derivation (via Mnemonic) | ✅ |
| `@btc-vision/ecpair` | Keypair for signer | ✅ |
| `opnet` | Listed as dep but not used in deploy script | — |

---

## 4. Pool Creation Path

**Status: PARTIAL**

### Code Path

1. `launch.ts:250-290` — `POST /projects/:id/pool-submit` — records `poolTx` + `poolAddress`
2. State: `AWAITING_POOL_CREATE → POOL_SUBMITTED`
3. `launch.ts:641-679` — `confirmPoolOnChain()` — watcher confirms pool, transitions to `LIVE`
4. `launch.ts:657-673` — Creates `PoolMetadata` record with `poolAddress`, `baseToken`, `quoteToken`, `createdTx`

### What's Missing

**There is NO pool creation transaction builder in OPFun.**

The system expects the user's wallet to:
1. Create an AMM/liquidity pool contract on OPNet
2. Submit the resulting `poolTx` + `poolAddress` back to OPFun

But there is:
- No UI for pool creation (no "Create Pool" button or flow)
- No pool factory contract interaction code
- No `getContract()` + `simulate()` call for pool creation
- No template or instructions for what pool contract to deploy

The flow is: `AWAITING_POOL_CREATE` → user must figure out pool creation externally → submit results.

### BTC Vision Repo Mapping
- **Should use:** `opnet` npm package → `getContract()` to interact with a pool factory contract
- **Should use:** `@btc-vision/transaction` → `TransactionFactory` if a new contract deployment is needed
- **Currently uses:** Nothing — pool creation is entirely external

### Recommendation
Implement a pool creation flow using the `opnet` npm package:
1. Define the pool factory contract address
2. Use `getContract()` to get a typed contract interface
3. Call `simulate()` to preview the pool creation
4. Call `sendTransaction()` to execute (frontend: `signer=null, mldsaSigner=null`)
5. Return `poolTx` and `poolAddress` from the result

---

## 5. Live Quote Path

**Status: PARTIAL**

### Code Path

1. `BuyFlowPanel.tsx:194-232` — `reserveSwap()` → `POST /projects/:id/buy-intent`
2. `buy.ts:119-258` — `buy-intent` handler:
   - Validates auth session (`verifyWalletToken`)
   - Requires `launchStatus === "LIVE"`
   - Calls `getLiveQuote(projectId, side, inputAmount)` (`marketIndexer.ts:432-463`)
3. `marketIndexer.ts:432-463` — `getLiveQuote()`:
   - Reads `ProjectMarketState` from Prisma DB
   - Requires `reserveBase > 0 && reserveQuote > 0` (populated by watcher)
   - Calls `getSwapQuote()` — constant-product AMM formula (`x * y = k`)
4. `marketIndexer.ts:66-100` — `getSwapQuote()`:
   - `feeBps = 30` (0.3% fee)
   - BUY: `outputAmount = (reserveQuote * inputAfterFee) / (reserveBase + inputAfterFee)`
   - SELL: `outputAmount = (reserveBase * inputAfterFee) / (reserveQuote + inputAfterFee)`
   - Price impact calculated vs spot price

### What's Missing

**No on-chain simulation.** Quotes are derived from the last watcher-indexed pool reserves stored in Prisma, not from a live `simulate()` call against the pool contract.

This means:
- Quotes can be stale (watcher polls every 5 minutes by default)
- Between watcher cycles, reserves may have changed due to other trades
- No slippage protection at the on-chain level — only at the quote level

### Client-side estimate fallback

`BuyFlowPanel.tsx:182-189` — `localEstimate` provides an instant UI estimate before the API quote returns, using `fetchMarketState()` data.

### BTC Vision Repo Mapping
- **Should use:** `opnet` npm package → `getContract()` + `simulate()` on the pool contract to get real-time reserves and quote
- **Currently uses:** Prisma DB reads from watcher snapshots

### Recommendation
Add a real-time simulation path:
1. On `buy-intent`, call the pool contract's `getReserves()` via `opnet` SDK
2. Compare with stored reserves — if significantly different, use live values
3. For critical trades, add a `simulateSwap()` call to verify expected output

---

## 6. Live Trade Confirmation Path

**Status: READY** (pending live wallet + RPC test)

### Code Path

**Frontend** (`BuyFlowPanel.tsx`):
1. `BuyFlowPanel.tsx:234-297` — `submitReserve()`:
   - Requires `walletProvider === "opnet"` and `isLiveQuote`
   - Calls `submitOpnetTradeWithWallet("opnet", payload)` (`wallet.ts:602-689`)
   - Falls through if wallet doesn't return a tx payload
   - Sends result to `POST /projects/:id/buy-confirm`

**Wallet trade submission** (`wallet.ts:602-689`):
- `wallet.ts:610-620` — Discovers all wallet provider targets (opnet, bitcoin, opnet sub-objects)
- `wallet.ts:622-658` — Tries 12 direct methods + 18 request methods against each target
- `wallet.ts:544-568` — `callProviderFunction()` — tries multiple argument formats per method
- `wallet.ts:570-600` — `callProviderRequest()` — tries multiple request payload formats
- `wallet.ts:437-470` — `parseSubmitResult()` — extracts `txId`, `signedPsbt`, `signedTxHex` from any response shape

**Backend** (`buy.ts:262-397`):
1. `buy.ts:297-301` — Requires `txId`, `signedPsbt`, or `signedTxHex` — placeholder execution blocked
2. If `txId` provided: queue as `SUBMITTED` immediately (`buy.ts:316-350`)
3. If `signedPsbt`/`signedTxHex` provided: attempt RPC broadcast via `tryBroadcastOnchain()` (`buy.ts:72-114`)
4. On success: queue as `SUBMITTED` with `txId` from broadcast result
5. `marketIndexer.ts:267-343` — `queueTradeSubmission()` — upserts `TradeSubmission` record

**Watcher confirmation** (`watcher/src/index.ts`):
1. `index.ts:520-559` — `indexPendingTrades()`:
   - Fetches pending submissions from API
   - Calls `fetchTransactionReceipt(txId)` via RPC
   - Parses receipt status: `confirmed | failed | pending`
   - On confirmed: calls `parseConfirmedTrade()` to extract swap details
   - Posts confirmation/failure to API

### Findings

1. **No raw PSBT construction** on frontend ✅ — wallet handles signing
2. **Frontend passes `signer=null, mldsaSigner=null`** in sendBitcoin calls ✅
3. **Placeholder execution blocked** — requires real tx from wallet ✅
4. **Retry-safe** — `TradeSubmission.upsert` by txId prevents duplicates
5. **"Insufficient funds" not caught** by `normalizeWalletError()` — documented in prior audit

### BTC Vision Repo Mapping
- **Frontend:** None required — wallet extension handles all signing
- **Backend broadcast:** Raw JSON-RPC `sendrawtransaction` — should use `opnet` npm package
- **Watcher:** Raw JSON-RPC receipt fetch — should use `opnet` npm package

---

## 7. Watcher / Indexer Path

**Status: READY** (needs `OPNET_RPC_URL` + Bob MCP configured)

### Code Path

**Initialization** (`watcher/src/index.ts`):
- `index.ts:733-739` — Creates `BobClient`, calls `bob.init()` for MCP session
- `index.ts:741-746` — Runs first cycle immediately, then `setInterval(POLL_INTERVAL_MS)`
- Default interval: 300s (5 min)

**Watch cycle** (`index.ts:658-725`):
1. **Monitor launched projects** (`index.ts:565-654`):
   - `bob.callTool("opnet_rpc", { action: "getCode", ... })` — verify contract exists
   - Tracks code fingerprint changes (bytecode mutation → CRITICAL alert)
   - `getStorageAt(pointer: "0x00")` — tracks owner slot changes
   - Posts watch events to API with severity levels
2. **Confirm pending launches** (`index.ts:364-408`):
   - `DEPLOY_SUBMITTED`: calls `getCode` to verify contract deployed
   - `POOL_SUBMITTED`: calls `getCode` to verify pool deployed
   - Posts `confirm-deploy-onchain` / `confirm-pool-onchain` to API
3. **Index pool reserves** (`index.ts:410-445`):
   - For `LIVE` projects with `poolAddress`
   - `getStorageAt(pointer: "0x01")` → `reserveBase`
   - `getStorageAt(pointer: "0x02")` → `reserveQuote`
   - Posts `pool-snapshot` to API
4. **Index pending trades** (`index.ts:520-559`):
   - Fetches pending `TradeSubmission` records
   - Calls `fetchTransactionReceipt(txId)` via RPC
   - Parses receipt for swap event data
   - Posts confirmation/failure to API

### Dual RPC Strategy

| Source | Usage | Auth |
|--------|-------|------|
| Bob MCP (`opnet_rpc`) | `getCode`, `getStorageAt` for contract monitoring | MCP session |
| Direct RPC (`OPNET_RPC_URL`) | `getTransactionReceipt` for trade confirmation | `x-api-key` header |

### Findings

1. **Bob MCP `opnet_rpc` is the primary on-chain data source** — not the `opnet` npm package
2. **Bech32 → hex conversion** (`index.ts:80-102`) for contract addresses is manual but correct
3. **Storage slot assumptions** (`0x01` = reserveBase, `0x02` = reserveQuote) are hardcoded — will break if pool contracts use different layout
4. **Receipt parsing is resilient** — tries 6 RPC method names, extracts from nested structures
5. **Dedup** via `lastCodeHash` map prevents redundant CRITICAL alerts

### BTC Vision Repo Mapping
- **Should use:** `opnet` npm package for typed RPC calls instead of raw Bob MCP tool calls
- **Currently uses:** Bob MCP `opnet_rpc` tool + raw `fetch()` JSON-RPC

---

## 8. Shop Mint Path

**Status: STUB**

### Code Path

**Frontend** (`shop/page.tsx`):
1. `shop/page.tsx:58-133` — `handleMint()`:
   - Calls `shopMintIntent(itemKey)` → `POST /shop/mint-intent`
   - Tries `window.opnet.request({ method: "op_mint", params: [...] })` (`shop/page.tsx:83-91`)
   - If wallet doesn't support `op_mint`: **falls back to `window.prompt()`** asking user to paste txId manually
   - Calls `shopMintConfirm(itemKey, mintTxId)` → `POST /shop/mint-confirm`

**Backend** (`services/shopStore.ts`):
1. `shopStore.ts:185-248` — `createMintIntent()`:
   - Validates item exists in catalog
   - Checks one-per-wallet constraint
   - Derives deterministic `tokenId` from SKU index + wallet suffix
   - Returns collection address + token ID for wallet to mint
2. `shopStore.ts:257-307` — `confirmMint()`:
   - Creates/updates `ShopMint` record with status `PENDING`
   - Watcher must later confirm on-chain → `CONFIRMED`
3. `shopStore.ts:311-329` — `confirmMintOnchain()`:
   - Called by watcher when mint tx confirmed
   - Updates status to `CONFIRMED`
4. `shopStore.ts:351-420` — `revalidateOwnership()`:
   - If `OPNET_RPC_URL` configured, calls `ownerOf(collectionAddress, tokenId)` via JSON-RPC
   - Falls back to trusting DB if RPC fails

### What's Missing

1. **`op_mint` is a speculative method name** — no evidence OP_WALLET supports this. The wallet API likely requires `getContract()` + `simulate()` + `sendTransaction()` from the `opnet` npm package to interact with an OP721 contract.
2. **`window.prompt()` fallback is not production-viable** — asking users to paste transaction IDs is bad UX.
3. **No on-chain mint transaction is constructed by OPFun.** The system assumes the wallet can mint given a collection address + token ID, but no interaction parameters are built.
4. **`SHOP_OP721_COLLECTION` env var** — no deployment script or instructions for deploying the OP721 collection contract itself.
5. **`ownerOf` RPC method** (`shopStore.ts:399`) — this is an EVM method name, not confirmed to work on OPNet RPC.

### Catalog

| Item | Price | Purpose |
|------|-------|---------|
| Paint Set | 100 MOTO | Required to create on-chain NFTs |
| Clan Formation License | 100 MOTO | Required to form a new clan |
| Gallery Ticket | Free | One-time gallery access |

### BTC Vision Repo Mapping
- **Should use:** `opnet` npm package → `getContract(collectionAddress)` to get OP721 interface
- **Should use:** `simulate()` to preview mint, then `sendTransaction()` to execute
- **Frontend:** `signer=null, mldsaSigner=null` (wallet handles signing)
- **Currently uses:** Speculative `op_mint` wallet method + manual prompt fallback

### Recommendation
1. Deploy an OP721 collection contract on testnet
2. Build a mint interaction using `opnet` npm package:
   ```ts
   const contract = getContract(collectionAddress, provider);
   const sim = await contract.mint(tokenId, walletAddress);
   const result = await sendTransaction(sim, { signer: null, mldsaSigner: null });
   ```
3. Remove `window.prompt()` fallback
4. Add collection deployment script to `packages/opnet/`

---

## BTC Vision Package Usage Summary

| Package | Version | Where Used | Correct Usage |
|---------|---------|-----------|---------------|
| `@btc-vision/bitcoin` | ^6.5.6 | `packages/opnet` | `networks.opnetTestnet` in deploy script ✅ |
| `@btc-vision/bip32` | ^7.1.2 | `packages/opnet` | Key derivation via Mnemonic ✅ |
| `@btc-vision/ecpair` | ^4.0.5 | `packages/opnet` | Keypair for transaction signing ✅ |
| `@btc-vision/transaction` | ^1.7.31 | `packages/opnet` | `TransactionFactory.signDeployment()` ✅ |
| `opnet` | ^1.8.0 | `packages/opnet` | **Listed but NOT used at runtime** ⚠️ |
| `bip322-js` | ^3.0.0 | `apps/api` | BIP-322 signature verification ✅ |
| `bitcoinjs-lib` | — | **NOT present** | ✅ (correctly excluded) |

### Key Gaps

1. **`opnet` npm package is installed but never imported at runtime.** It should be used for:
   - Pool contract interaction (getContract + simulate + sendTransaction)
   - RPC calls in watcher (instead of raw fetch)
   - RPC calls in buy route (instead of raw fetch)
   - Shop OP721 mint interaction

2. **`@btc-vision/transaction` is correctly used ONLY for deployments** (TransactionFactory). It is NOT used for contract calls (which would be a rule violation — contract calls must use the `opnet` npm package).

---

## OPNet Rule Compliance Check

| Rule | Status | Notes |
|------|--------|-------|
| ECDSA deprecated → use ML-DSA | ✅ | Deploy script uses `wallet.mldsaKeypair` |
| No raw PSBT construction | ✅ | No `new Psbt()`, no `Psbt.fromBase64()` anywhere |
| Contract calls via `opnet` package | ⚠️ | No contract calls implemented yet (pool, trade, mint) |
| `@btc-vision/transaction` only for deployments | ✅ | Only used in deploy script template |
| Frontend: `signer=null, mldsaSigner=null` | ✅ | `wallet.ts:738-739` sets both to null |
| Backend: must specify both signers | ✅ | `deploy-script.ts:126-127` provides both |
| Use `networks.opnetTestnet` | ✅ | `deploy-script.ts:37` |
| Never use `networks.testnet` | ✅ | Not used anywhere |
| No `bitcoinjs-lib` | ✅ | Not in any package.json |
| Use `@btc-vision/bitcoin` | ✅ | In packages/opnet |

---

## Priority Recommendations

### P0 — Critical (blocks live trading)

1. **Wire up `opnet` npm package for contract interactions.** Currently installed but unused. Needed for:
   - Pool creation (getContract on pool factory)
   - On-chain quote simulation (getContract on pool, call getReserves)
   - Shop OP721 minting (getContract on collection)

2. **Implement pool creation UI/flow.** The `AWAITING_POOL_CREATE` state exists but there's no way for users to create a pool from the app.

### P1 — Important (degrades UX)

3. **Replace raw JSON-RPC `fetch()` in watcher + buy routes** with `opnet` npm SDK for typed, reliable RPC calls.

4. **Add "Insufficient funds" to `normalizeWalletError()`** (documented in LAUNCH_FUNDS_AUDIT_REPORT.md).

5. **Replace `window.prompt()` in shop mint** with proper wallet interaction.

### P2 — Nice to have

6. **Add real-time reserve fetch** in buy-intent route to supplement watcher-indexed data.

7. **Verify storage slot layout** (`0x01`/`0x02` for reserves) against actual pool contract ABI.

8. **Add connection health check** for `OPNET_RPC_URL` on watcher startup.

---

## Files Referenced

| File | Key Lines | Purpose |
|------|-----------|---------|
| `apps/web/src/lib/wallet.ts` | 155-301, 485-503, 602-798 | Wallet detection, connection, signing, trade submission |
| `apps/web/src/components/WalletProvider.tsx` | 52-230 | React wallet context, auth flow |
| `apps/web/src/components/BuyFlowPanel.tsx` | 160-495 | Trade UI, quote, confirm |
| `apps/web/src/app/create/page.tsx` | 15-131 | Token creation, liquidity funding |
| `apps/web/src/app/shop/page.tsx` | 27-247 | Shop mint UI |
| `apps/api/src/routes/auth.ts` | 129-324 | Nonce, BIP-322 verify, JWT |
| `apps/api/src/routes/buy.ts` | 116-397 | Buy intent + confirm |
| `apps/api/src/routes/launch.ts` | 100-680 | Launch pipeline, deploy/pool submit |
| `apps/api/src/routes/opnet.ts` | 19-77 | Block status, prices proxy |
| `apps/api/src/services/opnetProvider.ts` | 1-147 | Upstream HTTP provider |
| `apps/api/src/services/marketIndexer.ts` | 1-507 | Pool reserves, quotes, trade fills, candles |
| `apps/api/src/services/shopStore.ts` | 1-467 | OP721 shop catalog, mint, ownership |
| `apps/watcher/src/index.ts` | 1-747 | Full watcher: monitor, index, confirm |
| `packages/opnet/src/deployer.ts` | 1-351 | Scaffold + compile + auto-deploy |
| `packages/opnet/src/templates/deploy-script.ts` | 1-353 | Deploy script template |
