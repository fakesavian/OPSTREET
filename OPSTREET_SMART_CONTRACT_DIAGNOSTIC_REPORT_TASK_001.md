# OPSTREET Smart Contract Diagnostic Report - Task 001

Generated: 2026-05-19
Repo: D:\2025\user\Aicode\opfun-secure-launchpad
GitHub: https://github.com/fakesavian/OPSTREET

## 1. Executive Summary

The OPSTREET repo is structurally healthy and the current TypeScript OP_NET runtime wrapper builds and typechecks. The selected runtime configuration in `apps/api/.env` points at `legacy-testnet` / `https://testnet.opnet.org`; the provider is currently reachable, and configured MotoSwap factory/router addresses validate and have contract code on that network.

The main OP_NET integration is not fully live-ready. Direct pool creation appears configured, but TBTC liquidity and OP721 shop mint flows are disabled because `OPNET_TBTC_CONTRACT_ADDRESS` and `SHOP_OP721_COLLECTION` are blank. Bonding-curve launches are blocked by blank `OPNET_FEE_RECIPIENT` and by deeper smart-contract/template issues: the bonding-curve contract hard-codes EVM/Keccak selectors for OP_NET cross-contract calls even though OP_NET method selectors must use OP_NET selector encoding, and the two-contract bonding-curve deploy flow does not currently establish a valid curve address before token mint-target generation.

Minimal safe next fix: do not change deployed addresses. Add focused tests around generated bonding-curve contract selectors/deploy scaffolding, replace hard-coded Keccak selectors with OP_NET-compatible selector handling, and gate BONDING_CURVE UI/API until `OPNET_FEE_RECIPIENT` and a verified deploy sequence are present. Treat TBTC and shop as disabled until verified addresses are supplied.

## 2. Repo and Branch State

Commands run:

```text
git status --short --branch
git branch --show-current
git log --oneline -20
pnpm -v
corepack pnpm -v
```

Observed state:

```text
## main...origin/main
branch: main
```

Recent commits observed:

```text
2eb2b8a chore: update OPSTREET files
4911e51 Add railway.json to force pnpm build in monorepo
82d40a0 chore: update lockfile for next.js 14.2.35
c90cd1f fix: upgrade next.js 14.2.4 → 14.2.35 (CVE-2025-55184, CVE-2025-67779)
e471d9d fix: retry + better error in MarketHubClient when API unreachable
2f75c96 fix: use networks.regtest for OPNet testnet provider (opnetTestnet undefined)
1da913a fix: retry project page fetch + better error state
0ac5e63 fix: bold description, stuck-audit reset, CHECKING→DRAFT transition
8795082 feat: add tx notifications with re-open and confirmation status
2886863 Fix deploy script: correct broadcast API, gasSatFee, ML-DSA flags, ESM
212d73c Fix deploy script: networks.opnetTestnet → networks.testnet
b714297 Fix BTC broadcast + remove testnet creation limit
aa1cee6 Fix BTC transfer txid: compute from raw hex via Transaction.fromHex
5a7acc4 Fix BTC transfer: result.tx from OP_WALLET is already the txid
5cafdb7 Fix BTC funding tx: use TransactionFactory.createBTCTransfer + sendRawTransaction
61a95aa Fix mempool explorer URL — remove /testnet4 prefix for OPNet signet
45612bb Fix wallet.ts Address undefined guard + replace all <img> with next/image
766a021 Fix wallet.ts build error: use networks.testnet instead of networks.opnetTestnet
67adbe4 Fix CSV balance check: use OPNet provider getCSV1ForAddress + getBalances
afe775c Fix balance check to include CSV1 + CSV2 unlocked UTXOs
```

`pnpm -v` result:

```text
/usr/bin/bash: line 3: pnpm: command not found
```

`corepack pnpm -v` result:

```text
9.12.2
```

`npx pnpm -v` installed/used pnpm 11.1.3 transiently, but running workspace scripts through that path failed because pnpm wanted to purge `node_modules` in a non-TTY session. Use `corepack pnpm` for this repo.

Final git status after diagnostics/report creation:

```text
## main...origin/main
?? OPSTREET_SMART_CONTRACT_DIAGNOSTIC_REPORT_TASK_001.md
```

## 3. Monorepo Structure Map

Top-level structure relevant to OP_NET:

```text
apps/api        Fastify backend, Prisma DB, launch/deploy/buy/shop/opnet routes
apps/web        Next.js frontend, wallet integration, launch UI, shop/profile/floor UI
apps/watcher    Background watcher/indexer for launch confirmations, pools, trades, shop mints
packages/opnet  OP_NET wrapper package: runtime provider, deployer, scaffolder, contract templates
packages/shared Shared DTOs/enums/token config used across API/web/watcher
buidl-opnet-plugin OP_NET knowledge/plugin area, including MCP/Bob docs and agent references
docs            Prior audits, staging docs, OP_NET readiness and on-chain fix reports
tests           Playwright smoke tests
```

Workspace packages/scripts discovered:

```text
root package: opfun-secure-launchpad
  scripts: predev, dev, build, lint, typecheck, db:migrate, db:seed, test, secrets:scan
apps/api package: api
  scripts: dev, prebuild, build, start, typecheck, lint, db:migrate, db:migrate:deploy, db:generate, db:seed, smoke:server
apps/web package: web
  scripts: dev, build, start, typecheck, lint, predev
apps/watcher package: watcher
  scripts: dev, build, start, typecheck, lint
packages/opnet package: @opfun/opnet
  scripts: build, typecheck, lint, test
packages/shared package: @opfun/shared
  scripts: build, typecheck, lint
```

## 4. Smart Contract / OP_NET Architecture Map

Main runtime paths:

```text
Frontend wallet/UI
  apps/web/src/lib/wallet.ts
  apps/web/src/lib/api.ts
  apps/web/src/components/DeployPanel.tsx
  apps/web/src/components/LaunchPanel.tsx
  apps/web/src/components/BuyFlowPanel.tsx
  apps/web/src/app/create/page.tsx

Backend API
  apps/api/src/routes/launch.ts
  apps/api/src/routes/deploy.ts
  apps/api/src/routes/buy.ts
  apps/api/src/routes/clans.ts
  apps/api/src/routes/opnet.ts
  apps/api/src/services/opnetProvider.ts
  apps/api/src/services/marketIndexer.ts
  apps/api/src/services/shopStore.ts

Watcher/indexer
  apps/watcher/src/index.ts

OP_NET package
  packages/opnet/src/runtime-provider.ts
  packages/opnet/src/network-config.ts
  packages/opnet/src/deployer.ts
  packages/opnet/src/scaffolder.ts
  packages/opnet/src/templates/op20-fixed.ts
  packages/opnet/src/templates/bonding-curve.ts
  packages/opnet/src/templates/deploy-script.ts
```

High-level flow:

```text
Project creation/checks
  API routes call @opfun/opnet scaffold/audit/deploy helpers.

Contract generation
  packages/opnet/src/deployer.ts writes generated contract packages under packages/opnet/generated/<projectId>.
  DIRECT_POOL creates one OP_20 contract.
  BONDING_CURVE attempts to create token + BondingCurve contracts.

Runtime interaction
  packages/opnet/src/runtime-provider.ts lazy-loads opnet SDK and @btc-vision packages.
  It creates JSONRpcProvider using OPNET_NETWORK/OPNET_RPC_URL.
  It wraps MotoSwap factory/pool, OP721 mint, curve initialize, broadcast, receipt, code checks.

Frontend signing
  Backend returns offline interaction buffers.
  Frontend asks OP_WALLET-like providers to sign/broadcast or returns raw signed interaction tx to backend.

Watcher/indexer
  Watches API projects/trades/shop mints.
  Uses @opfun/opnet provider helpers for receipts/code/pool state and posts admin-gated confirmations back to API.
```

## 5. Contract Address and Environment Variable Map

Current relevant env values observed from repo files, excluding secrets:

Root `.env`:

```text
OPNET_RPC_URL=https://testnet.opnet.org
```

`apps/api/.env` relevant OP_NET values:

```text
OPNET_NETWORK=legacy-testnet
OPNET_RPC_URL=https://testnet.opnet.org
MOTOSWAP_FACTORY_ADDRESS=0xa02aa5ca4c307107484d5fb690d811df1cf526f8de204d24528653dcae369a0f
MOTOSWAP_ROUTER_ADDRESS=0x0e6ff1f2d7db7556cb37729e3738f4dae82659b984b2621fab08e1111b1b937a
OPNET_TBTC_CONTRACT_ADDRESS=
OPNET_DEPLOYER_PUBKEY=0x342596399d250ee5a02d7f51278393faf0804bea83771947da9200995a430dbc
OPNET_FEE_RECIPIENT=
```

`apps/api/.env.example` documents:

```text
OPNET_NETWORK=legacy-testnet
OPNET_RPC_URL=https://testnet.opnet.org
STRICT_OPNET_STARTUP=true
MOTOSWAP_FACTORY_ADDRESS=0xa02aa5ca4c307107484d5fb690d811df1cf526f8de204d24528653dcae369a0f
MOTOSWAP_ROUTER_ADDRESS=0x0e6ff1f2d7db7556cb37729e3738f4dae82659b984b2621fab08e1111b1b937a
SHOP_OP721_COLLECTION=
OPNET_TBTC_CONTRACT_ADDRESS=
OPNET_FEE_RECIPIENT=
```

Runtime diagnostics using `apps/api/.env`:

```json
{
  "network": "legacy-testnet",
  "rpcUrl": "https://testnet.opnet.org",
  "provider": {
    "healthy": true,
    "url": "https://testnet.opnet.org",
    "blockHeight": 19206,
    "latencyMs": 7809
  },
  "contracts": {
    "factory": {
      "address": "0xa02aa5ca4c307107484d5fb690d811df1cf526f8de204d24528653dcae369a0f",
      "configured": true,
      "valid": true,
      "codeExists": true
    },
    "router": {
      "address": "0x0e6ff1f2d7db7556cb37729e3738f4dae82659b984b2621fab08e1111b1b937a",
      "configured": true,
      "valid": true,
      "codeExists": true
    },
    "shopCollection": {
      "address": null,
      "configured": false,
      "valid": false,
      "codeExists": null
    },
    "tbtc": {
      "address": null,
      "configured": false,
      "valid": false,
      "codeExists": null
    }
  },
  "readiness": {
    "liveReads": true,
    "poolCreation": true,
    "routerReads": true,
    "tbtcLiquidity": false,
    "shopMint": false
  },
  "issues": [
    "OPNET_TBTC_CONTRACT_ADDRESS is blank; TBTC liquidity flows are disabled.",
    "SHOP_OP721_COLLECTION is blank; shop mint flows are disabled."
  ]
}
```

Interpretation:

- Do not change MotoSwap factory/router addresses; they currently validate on selected network.
- TBTC pool creation/reserve mapping cannot be used until `OPNET_TBTC_CONTRACT_ADDRESS` is set to a separately verified contract on the same selected OP_NET network.
- Shop mint cannot be used until `SHOP_OP721_COLLECTION` is set to a separately verified OP721 collection address.
- Bonding curve cannot be enabled until `OPNET_FEE_RECIPIENT` is configured and the contract template/deploy flow is fixed/tested.

## 6. ABI / Runtime Provider Findings

Positive findings:

- `packages/opnet/src/runtime-provider.ts` avoids top-level SDK imports and lazy-loads `opnet`, `@btc-vision/bitcoin`, and `@btc-vision/transaction`, reducing serverless module-init crash risk.
- `packages/opnet/src/network-config.ts` centralizes `mainnet`, `regtest`, and `legacy-testnet` handling and maps wallet HRPs/network names.
- Runtime provider uses opnet SDK `getContract()` with `MotoSwapFactoryAbi`, `MotoswapPoolAbi`, `OP_721_ABI`, `BitcoinAbiTypes`, and `ABIDataTypes` for live runtime simulations/reads.
- `getRuntimeDiagnostics()` checks provider health, address parseability, and code existence for factory/router/shop/TBTC.
- `findPoolAddress()` calls MotoSwap factory `getPool()` before preparing pool creation, which prevents blindly creating duplicate pools.

Problems / risks:

- `packages/opnet/src/templates/bonding-curve.ts` hard-codes EVM selectors for cross-contract calls:
  - `transfer(address,uint256) = 0xa9059cbb`
  - `transferFrom(address,address,uint256) = 0x23b872dd`
  - `mint(address) = 0x6a627842`
  - `createPool(address,address)` is computed with Keccak via `@noble/hashes/sha3.js`.
- OP_NET references in the repo state that OP_NET uses SHA-256 selector semantics, not EVM Keccak. A local SHA-256 first-4-byte check produced different selectors:
  - `transfer(address,uint256)` -> `0x3b88ef57`
  - `transferFrom(address,address,uint256)` -> `0x4b6685e7`
  - `createPool(address,address)` -> `0x3c56793f`
  - `mint(address)` -> `0x3d40604f`
- The bonding-curve file also uses manual 4-byte calldata construction for token/factory/pool calls. This is fragile compared with OP_NET ABI helpers and generated/SDK-backed selector calculation.
- Frontend trade path in `apps/web/src/lib/wallet.ts` tries many speculative wallet method names (`swap`, `trade`, `submitSwap`, `signInteraction`, `broadcast`, `sendBitcoin`, etc.). That may be useful as compatibility fallback, but it is not a deterministic MotoSwap-router swap ABI implementation.
- `apps/api/src/routes/buy.ts` returns `network: "opnetTestnet"` in PSBT params even though current repo history and package code moved to `legacy-testnet`/`networks.testnet` compatibility. This is probably metadata-only today, but it is inconsistent.

## 7. Confirmed Breakages

1. TBTC liquidity flows are disabled.

Evidence:

```text
apps/api/.env: OPNET_TBTC_CONTRACT_ADDRESS=
packages/opnet/src/runtime-provider.ts reports: "OPNET_TBTC_CONTRACT_ADDRESS is blank; TBTC liquidity flows are disabled."
Runtime readiness: tbtcLiquidity=false
```

2. OP721 shop mint flows are disabled.

Evidence:

```text
apps/api/.env.example: SHOP_OP721_COLLECTION=
apps/api/.env has no non-empty SHOP_OP721_COLLECTION value in inspected output.
packages/opnet/src/runtime-provider.ts reports: "SHOP_OP721_COLLECTION is blank; shop mint flows are disabled."
Runtime readiness: shopMint=false
```

3. BONDING_CURVE is disabled by configuration.

Evidence:

```text
apps/api/.env: OPNET_FEE_RECIPIENT=
apps/api/src/routes/launch.ts returns 503 if BONDING_CURVE pool-create-intent is requested without OPNET_FEE_RECIPIENT.
```

4. BONDING_CURVE contract template uses the wrong selector family for OP_NET cross-contract calls.

Evidence:

```text
packages/opnet/src/templates/bonding-curve.ts hard-codes EVM selectors and computes createPool with keccak256.
Repo OP_NET knowledge docs state OP_NET selectors are SHA-256 based, not Keccak.
Local SHA-256 first-4-byte outputs differ from the hard-coded EVM values.
```

Likely effect:

- `initialize()` may fail when calling MOTO `transferFrom`.
- `buy()`/`sell()` may fail when calling OP20/MOTO `transfer`/`transferFrom`.
- auto-graduation may fail when calling MotoSwap `createPool` and pool `mint`.
- These are smart-contract-level failures and would require redeployment after template fixes.

5. BONDING_CURVE deploy/scaffold sequence is incomplete for mint target.

Evidence:

```text
packages/opnet/src/deployer.ts documents curveAddress should be precomputed.
If input.bondingCurve.curveAddress is undefined, token mintTarget falls back to "deployer".
But comments say BONDING_CURVE should mint 100% supply to the curve contract.
apps/api/src/routes/launch.ts later requires project.curveAddress before curve initialize.
```

Likely effect:

- A BONDING_CURVE project may compile/deploy with supply minted to the deployer instead of the curve if no valid precomputed curve address is supplied.
- The launch flow cannot initialize a curve until `curveAddress` is known and stored.

6. Trade/buy flow is not yet a deterministic OP_NET router swap path.

Evidence:

```text
apps/api/src/routes/buy.ts accepts txId/signedPsbt/signedTxHex and queues submission.
apps/web/src/lib/wallet.ts tries broad wallet method names rather than consuming a backend-prepared MotoSwap router swap interaction.
```

Likely effect:

- Live pool creation can be ready while live trading still depends on wallet-specific unsupported methods or externally prepared signed transactions.
- This should not be represented as a complete in-app MotoSwap swap integration until a router/pool swap ABI path exists and is tested.

## 8. Suspected Root Causes

1. Version/API churn around OP_NET packages.

Git history shows repeated fixes around `networks.opnetTestnet`, `networks.testnet`, transaction broadcast methods, and OP_WALLET payload shapes. The repo has accumulated compatibility shims and older docs that disagree with newer code.

2. Mixed mental models: EVM ABI selectors vs OP_NET selectors.

The bonding-curve template explicitly labels selectors as EVM-compatible Keccak selectors. OP_NET integration docs in this repo warn that OP_NET uses SHA-256 selector semantics. That mismatch is the highest-risk smart-contract bug found.

3. Runtime config was partially advanced to live OP_NET while optional live features remain blank.

Factory/router now validate on `legacy-testnet`, but TBTC, OP721, and fee recipient values are intentionally blank. The runtime correctly reports these as disabled, but UI/product assumptions may still imply features are available.

4. BONDING_CURVE requires two contract deployments and address precomputation, but the code only partially encodes that workflow.

The token must mint to the curve. The curve address must be known before token source generation or the token source/deployment must be regenerated after curve address derivation. Current fallback to deployer is safe-ish but breaks bonding-curve economics.

5. Frontend wallet integration is broad/probing rather than contract-specific.

The wallet layer attempts many method names and payload shapes. This is useful for exploration, but production swaps should be based on explicit backend-prepared interaction buffers and exact wallet API calls.

## 9. Evidence Collected

Search terms required by task were searched across repo using a Python walker to avoid shelling to `rg` in this repository:

```text
OPNET/opnet occurrences: 1913
runtime-provider occurrences: 15
ABI/abi occurrences: 746
contract occurrences: 2129
factory occurrences: 330
router occurrences: 128
MOTOSWAP occurrences: 85
SHOP_OP721 occurrences: 27
findPoolAddress occurrences: 5
encode occurrences: 628
decode occurrences: 697
```

Important files found:

```text
packages/opnet/src/runtime-provider.ts
packages/opnet/src/network-config.ts
packages/opnet/src/deployer.ts
packages/opnet/src/scaffolder.ts
packages/opnet/src/templates/bonding-curve.ts
packages/opnet/src/templates/op20-fixed.ts
packages/opnet/src/templates/deploy-script.ts
packages/opnet/test/runtime-provider-network-config.test.mjs
apps/api/src/routes/launch.ts
apps/api/src/routes/buy.ts
apps/api/src/routes/opnet.ts
apps/api/src/services/opnetProvider.ts
apps/api/src/services/marketIndexer.ts
apps/api/src/services/shopStore.ts
apps/watcher/src/index.ts
apps/web/src/lib/wallet.ts
apps/web/src/lib/api.ts
apps/api/.env.example
apps/api/.env
README.md
OP_NET_DIAGNOSTIC_README.md
docs/ONCHAIN_FIX_IMPLEMENTATION_REPORT.md
docs/ONCHAIN_FIX_PHASE2_REPORT.md
docs/ONCHAIN_READINESS_AUDIT.md
```

Runtime provider evidence:

```text
packages/opnet/src/runtime-provider.ts
- lazy SDK import pattern
- getProvider() constructs JSONRpcProvider from OPNET_RPC_URL and network object
- findPoolAddress() calls factory.getPool(token0, token1)
- preparePoolCreation() simulates factory.createPool and returns offlineBufferHex
- prepareShopMint() builds OP721 mint ABI and returns offlineBufferHex
- prepareCurveInitialization() builds initialize ABI and returns offlineBufferHex
- broadcastSignedInteraction() broadcasts funding tx then interaction tx
- getRuntimeDiagnostics() validates provider/address/code readiness
```

Watcher evidence:

```text
apps/watcher/src/index.ts
- dotenv config loaded at startup
- imports @opfun/opnet checkContractCode/checkProviderHealth/fetchLivePoolState/fetchTransactionReceipt/readStorageSlot
- confirms deploy/pool only after on-chain checks
- maps live pool reserves to base/quote
- tracks pending trade submissions and shop mints
```

API evidence:

```text
apps/api/src/routes/launch.ts
- /projects/:id/pool-create-intent branches for BONDING_CURVE vs DIRECT_POOL
- DIRECT_POOL calls preparePoolCreation(sessionWallet, baseTokenAddress, quoteTokenAddress)
- BONDING_CURVE requires curveAddress and OPNET_FEE_RECIPIENT, then calls prepareCurveInitialization
- /pool-broadcast and /pool-submit broadcast signed interactions and move status to POOL_SUBMITTED
- admin confirmation routes move deploy to AWAITING_POOL_CREATE and pool to LIVE
```

Frontend evidence:

```text
apps/web/src/lib/wallet.ts
- OP_WALLET connect/signing compatibility code
- signInteractionBuffer() for backend-provided offlineBufferHex
- submitOpnetTradeWithWallet() probes many wallet method names and request payloads
- BIP-322 conversion between OP_NET HRP and Bitcoin HRP exists
```

## 10. Commands Run and Results

```text
pwd
```

Result:

```text
/d/2025/user/Aicode/opfun-secure-launchpad
```

```text
git status --short --branch
```

Initial result:

```text
## main...origin/main
```

After report creation:

```text
## main...origin/main
?? OPSTREET_SMART_CONTRACT_DIAGNOSTIC_REPORT_TASK_001.md
```

```text
git branch --show-current
```

Result:

```text
main
```

```text
git log --oneline -20
```

Result: captured in Section 2.

```text
pnpm -v
```

Result:

```text
pnpm: command not found
```

```text
node -v
npm -v
corepack --version
corepack pnpm -v
```

Result:

```text
node v22.17.0
npm 10.9.2
corepack 0.33.0
corepack pnpm 9.12.2
```

```text
npx pnpm -v
```

Result:

```text
11.1.3
warning: pnpm field in package.json no longer read by pnpm
```

```text
npx pnpm --filter @opfun/opnet build ...
```

Result:

```text
Failed before build because pnpm 11 wanted to remove modules directory and aborted in non-TTY.
Use corepack pnpm instead.
```

```text
CI=true corepack pnpm --filter @opfun/opnet build
```

Result:

```text
PASS
```

```text
CI=true corepack pnpm --filter @opfun/opnet test
```

Result:

```text
PASS: 8/8 node --test subtests passed
```

```text
CI=true corepack pnpm --filter api typecheck
CI=true corepack pnpm --filter watcher typecheck
CI=true corepack pnpm --filter web typecheck
```

Result:

```text
PASS: all three tsc --noEmit commands completed with exit code 0
```

```text
node runtime diagnostics script with apps/api/.env loaded
```

Result:

```text
Provider healthy, legacy-testnet, factory/router code exists, TBTC/shop disabled because blank.
```

```text
node SHA-256 selector comparison script
```

Result:

```text
transfer(address,uint256) sha256[0:4]=0x3b88ef57
transferFrom(address,address,uint256) sha256[0:4]=0x4b6685e7
createPool(address,address) sha256[0:4]=0x3c56793f
mint(address) sha256[0:4]=0x3d40604f
```

## 11. MCP Tools Recommended

Recommended MCP/tooling for the next implementation/review pass:

1. `opnet-bob` / OP_NET MCP at `https://ai.opnet.org/mcp`
   - Use `opnet_knowledge_search` for selector/cross-contract-call rules.
   - Use `opnet_opnet_audit` against generated bonding-curve source.
   - Use incident query tools for selector/address/network-specific known issues.

2. Native OP_NET runtime diagnostics endpoint
   - Keep using `GET /opnet/diagnostics` once API is running.
   - It already exposes provider, contract code, readiness, and indexer status.

3. Local SDK probes
   - Use small Node scripts importing `opnet` and generated `@opfun/opnet/dist` to verify provider, ABI, getContract simulations, address parsing, and code checks before touching app UI.

4. Contract-level AssemblyScript compile/test tooling
   - Run generated `contract` package builds for both DIRECT_POOL and BONDING_CURVE templates.
   - Add template snapshot tests that fail on Keccak selectors/hard-coded EVM values.

5. Browser/OP_WALLET manual test harness
   - Required for final wallet signing because this cannot be fully validated by backend typecheck.
   - Capture exact OP_WALLET method names and result shapes, then remove speculative method guessing where possible.

## 12. Minimal Fix Plan

Do not push commits, do not change production secrets, and do not change deployed factory/router addresses.

Recommended next code-change task:

1. Add failing tests first.
   - Test `generateBondingCurveContract()` output.
   - Assert it does not contain hard-coded EVM selector values `0xa9059cbb`, `0x23b872dd`, `0x6a627842`, or Keccak-derived `createPool` comments/logic.
   - Assert selector handling matches OP_NET runtime expectations, preferably by calling the same OP_NET `encodeSelector` semantics used by contracts or by snapshotting known OP_NET selectors from authoritative MCP/docs.

2. Fix bonding-curve cross-contract calls.
   - Replace hard-coded EVM selectors and Keccak computation with OP_NET-compatible selector encoding.
   - Prefer OP_NET contract-side `encodeSelector('transfer(address,uint256)')`, `encodeSelector('transferFrom(address,address,uint256)')`, `encodeSelector('createPool(address,address)')`, and `encodeSelector('mint(address)')` if supported in AssemblyScript for these full signatures.
   - If only method names are supported on-chain, verify exact signature format through OP_NET MCP/docs before implementation.

3. Fix or explicitly disable BONDING_CURVE deploy sequence.
   - Either precompute/store the curve address before generating the token contract, or split deploy into deterministic two-step regeneration.
   - If that cannot be implemented safely in one pass, hard-disable BONDING_CURVE in API/UI with a clear diagnostic reason instead of allowing broken packages.

4. Keep DIRECT_POOL path unchanged except for tests.
   - Current diagnostics show provider/factory/router readiness is true on selected network.
   - Avoid changing working deployed addresses.

5. Keep TBTC and shop disabled until verified addresses exist.
   - Do not invent or substitute addresses.
   - When supplied, run `getRuntimeDiagnostics()` and require `codeExists=true` before enabling UI.

6. Plan a separate trade-swap task.
   - Implement backend-prepared MotoSwap router/pool swap interaction buffers instead of speculative wallet method probing.
   - This is separate from fixing contract deployment/templates.

## 13. Test Plan

Minimum local verification after implementing the next fix:

```text
CI=true corepack pnpm --filter @opfun/opnet build
CI=true corepack pnpm --filter @opfun/opnet test
CI=true corepack pnpm --filter api typecheck
CI=true corepack pnpm --filter watcher typecheck
CI=true corepack pnpm --filter web typecheck
```

Add focused tests:

```text
packages/opnet/test/bonding-curve-template.test.mjs
- generated contract contains OP_NET-compatible selectors
- generated contract does not contain EVM selector constants
- generated contract uses valid OP_NET address strings for MOTO/factory defaults
- BONDING_CURVE deploy scaffolding does not mint to deployer when curve address is required
```

Runtime smoke tests:

```text
Load apps/api/.env and run getRuntimeDiagnostics().
Expect provider.healthy=true for selected network.
Expect factory/router configured, valid, and codeExists=true.
Expect TBTC/shop false while env values are blank.
```

Manual OP_WALLET tests after code-level fixes:

```text
1. DIRECT_POOL: create project, deploy/confirm deploy, prepare pool-create-intent, sign offlineBufferHex, broadcast, watcher confirms pool.
2. BONDING_CURVE: only after selector/deploy fixes; deploy token+curve, verify token supply is in curve, approve MOTO, initialize curve, buy/sell, graduation if feasible on testnet.
3. SHOP: only after SHOP_OP721_COLLECTION is set and diagnostics codeExists=true.
4. TBTC liquidity: only after OPNET_TBTC_CONTRACT_ADDRESS is set and diagnostics codeExists=true.
```

Do not run real deploy/broadcast in automated CI unless using a testnet-only wallet with explicit operator approval.

## 14. Risks and Safety Notes

- Do not change existing MotoSwap factory/router addresses. Runtime diagnostics currently confirm they are valid and have code on selected `legacy-testnet`.
- Do not populate blank env values with guessed addresses. TBTC, OP721 collection, and fee recipient require separately verified testnet addresses.
- Any bonding-curve template fix changes deployed bytecode. Existing deployed contracts generated from the old template cannot be patched; they must be treated as broken or legacy.
- OP_NET selectors are consensus/ABI critical. Verify selector format with OP_NET MCP/docs before deploying any fixed bonding-curve contract.
- Wallet integration cannot be fully validated by backend typecheck. OP_WALLET/manual browser testing remains required.
- `pnpm` is not directly on PATH in this shell. Use `corepack pnpm`, not transient `npx pnpm`, to avoid pnpm version drift and node_modules purge prompts.
- The repo contains `.env` files. Do not print or commit secrets; this report only includes non-secret OP_NET addresses/config values and notes blank secret-like fields.

## 15. Recommended Next Implementation Task

Title:

```text
Fix OPSTREET BondingCurve OP_NET selector/deploy scaffolding and add regression tests
```

Scope:

```text
- Add failing @opfun/opnet tests for bonding-curve selector generation and deploy scaffolding.
- Replace Keccak/EVM hard-coded selectors in packages/opnet/src/templates/bonding-curve.ts with OP_NET-compatible selector handling.
- Ensure BONDING_CURVE token mint target cannot silently fall back to deployer when a curve address is required.
- If curve address precomputation is not available, explicitly disable BONDING_CURVE launch path with clear API/UI diagnostics.
- Do not change MOTOSWAP_FACTORY_ADDRESS, MOTOSWAP_ROUTER_ADDRESS, or production secrets.
- Run corepack pnpm build/test/typecheck commands listed above.
```

Acceptance criteria:

```text
- @opfun/opnet tests fail before the fix and pass after it.
- Generated bonding-curve contract no longer includes EVM selector constants for OP20/MotoSwap calls.
- Direct pool runtime diagnostics remain green for provider/factory/router.
- TBTC/shop remain disabled unless verified env addresses are provided.
- No deployed addresses or production secrets are changed.
```
