# OP_NET Runtime Diagnostic README

Last updated: 2026-05-18

This document captures the OP_NET launch/runtime diagnostic pass for `opfun-secure-launchpad`. It is evidence-first: what was inspected, what passed, what is blocked, and what needs to be fixed before real users hit the launch flow.

## Scope

Reviewed areas:

- Repo state and recent history
- Monorepo structure and OP_NET/smart-contract-related files
- OP_NET provider/runtime configuration
- MotoSwap factory/router readiness
- TBTC/shop/bonding-curve configuration readiness
- Launch API state flow
- Frontend wallet signing/broadcast flow
- UTXO proxy behavior
- Build/typecheck health
- Initial OP_NET documentation alignment
- MCP/tooling recommendations for future diagnostics

No source files were intentionally modified during the investigation besides this README.

## Repo State

Repository:

```text
D:\2025\user\Aicode\opfun-secure-launchpad
```

Branch:

```text
main
```

Recent commits observed:

```text
4911e51 Add railway.json to force pnpm build in monorepo
82d40a0 chore: update lockfile for next.js 14.2.35
c90cd1f fix: upgrade next.js 14.2.4 → 14.2.35 (CVE-2025-55184, CVE-2025-67779)
e471d9d fix: retry + better error in MarketHubClient when API unreachable
2f75c96 fix: use networks.regtest for OPNet testnet provider (opnetTestnet undefined)
```

Untracked files observed before this README was created:

```text
Coins Drop Sound Effect (HD) [3Bsv4CH_yrk].mp3
error.txt
```

Environment note:

- A WSL-backed terminal path failed because Docker/WSL could not attach a missing VHD.
- Native Windows Python/subprocess diagnostics worked.
- This appears to be environment noise, not a repo or OP_NET runtime failure.

## Monorepo Map

Important directories:

```text
apps/api       Backend launch routes, Prisma, OP_NET launch orchestration
apps/web       Next.js frontend, wallet integration, UTXO proxy
apps/watcher   Watcher service
packages/opnet OP_NET provider wrapper, runtime helpers, contract templates
packages/shared Shared workspace package
buidl-opnet-plugin Contract/plugin tooling area
docs           Project docs
scripts        Utility/build scripts
tests          Test area
tools          Tooling area
```

Primary files inspected:

```text
packages/opnet/src/runtime-provider.ts
packages/opnet/src/index.ts
packages/opnet/src/templates/bonding-curve.ts
packages/opnet/src/templates/op20-fixed.ts
packages/opnet/src/templates/deploy-script.ts
apps/api/src/routes/launch.ts
apps/web/src/lib/wallet.ts
apps/web/src/app/api/opnet-utxos/route.ts
apps/api/.env
apps/api/.env.example
apps/api/.env.vercel.template
apps/web/.env.local
.env
```

## Build / Typecheck Diagnostics

Environment:

```text
node: v22.17.0
pnpm: 9.12.2
```

Commands that passed:

```bash
corepack pnpm --filter @opfun/shared build
corepack pnpm --filter @opfun/opnet build
corepack pnpm --filter api typecheck
corepack pnpm --filter watcher typecheck
corepack pnpm --filter web typecheck
corepack pnpm -r build
```

Full workspace build passed.

Warnings only:

```text
apps/web/src/components/floor/FloatingFloorPanel.tsx
- React Hook useEffect missing dependency: getBounds, two occurrences

apps/web/src/components/WalletProvider.tsx
- wallet conditional may change useEffect dependencies; should be wrapped in useMemo
```

Conclusion:

- No TypeScript or build blocker found.
- The major risks are runtime/config/integration risks, not compile-time failures.

## Runtime Config Evidence

Observed API env values:

```text
OPNET_RPC_URL=https://testnet.opnet.org
MOTOSWAP_FACTORY_ADDRESS=0xa02aa5ca4c307107484d5fb690d811df1cf526f8de204d24528653dcae369a0f
MOTOSWAP_ROUTER_ADDRESS=0x0e6ff1f2d7db7556cb37729e3738f4dae82659b984b2621fab08e1111b1b937a
OPNET_TBTC_CONTRACT_ADDRESS=
OPNET_DEPLOYER_PUBKEY=0x342596399d250ee5a02d7f51278393faf0804bea83771947da9200995a430dbc
OPNET_FEE_RECIPIENT=
```

Observed web env values:

```text
NEXT_PUBLIC_LIQUIDITY_VAULT_ADDRESS=opt1pq4p904uy5zv76wcyac2sqrulpmluys6y6kulpyy7uerhkr9nxvgs3y2sce
NEXT_PUBLIC_OPNET_DEPLOYER_PUBKEY=0x342596399d250ee5a02d7f51278393faf0804bea83771947da9200995a430dbc
```

Runtime config loaded by `packages/opnet`:

```json
{
  "rpcUrl": "https://testnet.opnet.org",
  "factoryAddress": "0xa02aa5ca4c307107484d5fb690d811df1cf526f8de204d24528653dcae369a0f",
  "routerAddress": "0x0e6ff1f2d7db7556cb37729e3738f4dae82659b984b2621fab08e1111b1b937a",
  "shopCollectionAddress": "",
  "tbtcContractAddress": ""
}
```

Provider health result:

```json
{
  "healthy": true,
  "url": "https://testnet.opnet.org",
  "blockHeight": 19133,
  "latencyMs": 2858
}
```

Runtime readiness result:

```json
{
  "liveReads": true,
  "poolCreation": true,
  "routerReads": true,
  "tbtcLiquidity": false,
  "shopMint": false
}
```

Interpretation:

- OP_NET RPC is alive.
- MotoSwap factory/router are configured and have code.
- TBTC liquidity is not ready because `OPNET_TBTC_CONTRACT_ADDRESS` is blank.
- Shop mint is not ready because `SHOP_OP721_COLLECTION` is blank.
- Direct MOTO pool flow is materially healthier than TBTC/shop flows.

## OP_NET Runtime / Provider Flow

File:

```text
packages/opnet/src/runtime-provider.ts
```

Provider boundary:

```text
getProvider()
  -> ensureRequirements({ requireRpc: true })
  -> dynamically load OP_NET SDK
  -> get OP_NET network object
  -> new JSONRpcProvider({ url: OPNET_RPC_URL, network, timeout })
```

Strong point:

- Provider creation is centralized.
- Health checks and diagnostics exist in `runtime-provider.ts`.
- Contract config validation is explicit and throws `RuntimeConfigError` instead of failing silently.

Important exported runtime helpers:

```text
getRuntimeContractConfig()
assertRuntimeConfig()
checkProviderHealth()
getRuntimeDiagnostics()
preparePoolCreation()
prepareShopMint()
broadcastSignedInteraction()
fetchTransactionReceipt()
checkContractCode()
```

## Pool Creation Flow

Function:

```text
preparePoolCreation(walletAddress, token0, token1)
```

Observed flow:

1. Requires MotoSwap factory config.
2. Calls `findPoolAddress(token0, token1)` to avoid duplicate pools.
3. Converts factory/token addresses through OP_NET `Address.fromString`.
4. Gets OP_NET provider, network object, SDK contract helper, and `MotoSwapFactoryAbi`.
5. Simulates `factory.createPool(token0, token1)`.
6. Reads `simulation.properties.address` as the pool address.
7. Converts simulation into an offline wallet-signable buffer:

```text
simulation.toOfflineBuffer(walletAddress, maximumAllowedSatToSpend)
```

8. Returns prepared interaction for frontend wallet signing.

Architecture assessment:

- Backend prepares interaction.
- User wallet signs.
- Backend broadcasts signed raw transaction.
- This is the right broad shape for OP_NET interaction flows.

## Broadcast Flow

Function:

```text
broadcastSignedInteraction(payload)
```

Observed flow:

1. If `fundingTransactionRaw` is present, broadcast funding transaction first.
2. Broadcast `interactionTransactionRaw` second.
3. Return `txId` / `fundingTxId` or error.

Risk:

- Frontend tries wallet methods named both `signInteraction` and `signAndBroadcastInteraction`.
- If OP_WALLET actually broadcasts inside `signAndBroadcastInteraction`, backend may rebroadcast.
- Duplicate/already-known handling should be explicitly verified for signed OP_NET interactions, not just BTC transfer paths.

## API Launch Flow

File:

```text
apps/api/src/routes/launch.ts
```

Important endpoints:

```text
POST /projects/:id/launch-build
POST /projects/:id/deploy-submit
GET  /projects/:id/pool-params
```

`/deploy-submit` behavior:

- Requires wallet auth.
- Accepts wallet-submitted deploy tx and contract address.
- Moves project from `AWAITING_WALLET_DEPLOY` to `DEPLOY_SUBMITTED`.
- Creates a pending deploy check run.

Assessment:

- Correctly avoids backend private-key deployment.
- User wallet remains signing authority.

Risk:

- Need deeper validation audit of `DeploySubmitSchema` to confirm submitted `contractAddress` cannot be malformed or spoofed relative to actual tx output.

## Bonding Curve Flow

Files:

```text
apps/api/src/routes/launch.ts
packages/opnet/src/templates/bonding-curve.ts
packages/opnet/src/templates/deploy-script.ts
```

API behavior for `launchType === "BONDING_CURVE"`:

1. Requires `curveAddress`.
2. Requires `OPNET_FEE_RECIPIENT`.
3. Calls `prepareCurveInitialization(sessionWallet, curveAddr)`.
4. Returns wallet interaction and instructions:

```text
First call MOTO.approve(curveAddress, 5000) with your OP_WALLET.
Then sign the curve.initialize() interaction when prompted.
OPStreet records the init tx and the curve becomes LIVE once confirmed.
```

Contract behavior:

```text
initialize()
  -> requires not already initialized
  -> caller = Blockchain.tx.origin
  -> _transferFrom(MOTO, caller, feeRecipient, LAUNCH_FEE)
  -> initialized = true
```

Hard blocker:

```text
OPNET_FEE_RECIPIENT is blank in apps/api/.env
```

Impact:

- Bonding curve init route returns `503` until fee recipient is configured.

Additional UX/system risk:

- The approval step appears instruction-driven/manual.
- If the user signs `initialize()` before approving MOTO allowance, initialization will revert.

Recommended fix:

- Promote MOTO approval into a first-class launch state.
- Add prepare/submit/confirm approval flow before curve initialization.
- Verify allowance before enabling the initialize interaction.

Suggested state sequence:

```text
AWAITING_WALLET_DEPLOY
DEPLOY_SUBMITTED
AWAITING_CURVE_APPROVAL
CURVE_APPROVAL_SUBMITTED
AWAITING_CURVE_INIT
CURVE_INIT_SUBMITTED
LIVE
```

## ABI / Selector Risk

File:

```text
packages/opnet/src/templates/bonding-curve.ts
```

Observed selector pattern:

Local bonding curve methods use OP_NET runtime selector helper:

```text
encodeSelector('initialize')
encodeSelector('buy')
encodeSelector('sell')
encodeSelector('getReserves')
encodeSelector('getQuote')
encodeSelector('getSellQuote')
```

Cross-contract calls use hardcoded EVM-compatible selectors:

```text
transfer(address,uint256)             = 0xa9059cbb
transferFrom(address,address,uint256) = 0x23b872dd
mint(address)                         = 0x6a627842
createPool(address,address)           = computed keccak selector
```

Risk:

- If OP_NET token/MotoSwap contracts expect OP_NET `encodeSelector` selectors instead of EVM keccak selectors, cross-contract calls will revert or decode incorrectly.
- TypeScript/build checks will not catch this.

Needed verification:

- Read OP_NET ABI docs and token standard docs.
- Confirm OP20/MOTO method selector convention.
- Confirm MotoSwap factory ABI convention.
- Add simulation/test vectors for `_transfer`, `_transferFrom`, and `createPool`.

## Frontend Wallet Flow

File:

```text
apps/web/src/lib/wallet.ts
```

Important functions:

```text
signOpnetInteractionWithWallet(provider, interaction)
signInteractionBuffer(offlineBufferHex)
submitOpnetLiquidityFundingWithWallet(...)
checkWalletUtxos(address)
```

`signInteractionBuffer` tries direct wallet methods:

```text
signAndBroadcastInteraction
signInteraction
signTransaction
```

Then request-style methods:

```text
signAndBroadcastInteraction
signInteraction
signTransaction
opnet_signInteraction
```

Risk:

- Wallet API compatibility is being handled by broad probing.
- This is pragmatic, but brittle.
- Needs runtime telemetry around which method succeeds, what shape it returns, and whether it broadcasts.

Recommendation:

- Record wallet method used in debug mode.
- Normalize signed interaction return shape strongly.
- Treat `signAndBroadcastInteraction` carefully to avoid double-broadcast.

## UTXO Proxy

File:

```text
apps/web/src/app/api/opnet-utxos/route.ts
```

Current behavior:

```ts
const OPNET_RPC = "https://testnet.opnet.org/api/v1/json-rpc";
```

Endpoint:

```text
GET /api/opnet-utxos?address=opt1p...
```

Upstream JSON-RPC call:

```json
{
  "jsonrpc": "2.0",
  "method": "btc_getUTXOs",
  "params": ["<address>", false],
  "id": 1
}
```

Risk:

- The UTXO proxy ignores env config.
- Runtime provider may use one OP_NET RPC, while UTXO proxy always hits public testnet.
- This can create staging/prod/local drift and confusing wallet funding bugs.

Recommended fix:

- Use env-driven OP_NET RPC configuration.
- Normalize base URL to `/api/v1/json-rpc` if needed.
- Consider moving URL normalization into shared OP_NET utilities.

## Network Object Risk

Observed from `@btc-vision/bitcoin` network exports:

```text
networks.testnet exists
networks.regtest exists
networks.opnetTestnet does not exist
```

`networks.testnet` includes:

```text
bech32=tb
bech32Opnet=opt
```

`networks.regtest` includes:

```text
bech32=bcrt
bech32Opnet=opr
```

Risk:

- Recent commit says `networks.regtest` fixed an OP_NET testnet provider issue.
- Current code contains both `networks.regtest` and `networks.testnet` in different OP_NET paths.
- Address HRPs and signing/broadcast behavior may diverge if the wrong network object is used in a given SDK context.

Recommendation:

- Do not keep ad-hoc imports of network constants across frontend/backend.
- Centralize OP_NET network selection in `packages/opnet`.
- Add a diagnostic output showing active network object, `bech32`, and `bech32Opnet` for each flow.
- Confirm against OP_NET docs/SDK examples whether provider, transaction factory, and wallet transfer flows require the same network object or different ones.

## OP_NET Docs Alignment Captured

Documentation URLs inspected:

```text
https://docs.opnet.org
https://docs.opnet.org/opnet-client-library/json-rpc-provider/about-jsonrpc-provider
```

Confirmed from docs:

- `JSONRpcProvider` is the primary way to communicate with OP_NET nodes through HTTP JSON-RPC.
- Provider responsibilities include connection management, request serialization, response deserialization, and error handling.
- Typical uses include querying blockchain state, submitting transactions, retrieving balances, and interacting with OP_NET smart contracts.

Alignment:

- The repo's centralized `getProvider()` wrapper matches the documented provider model.
- The UTXO proxy also uses JSON-RPC directly, but should share config with runtime provider.

Still needs docs verification:

```text
OP_NET smart contract interactions
Wallet integration
Transaction library
ABI system
Data encoding
OP20 token selector conventions
MotoSwap ABI selector conventions
Recommended OP_NET testnet network object
```



## Continued OP_NET Docs Findings

Additional OP_NET documentation pages reviewed after the initial report:

```text
https://docs.opnet.org/opnet-client-library/understanding-providers/choosing-a-network
https://docs.opnet.org/opnet-client-library/smart-contract-interactions/simulating-a-call
https://docs.opnet.org/opnet-client-library/smart-contract-interactions/offline-signing
https://docs.opnet.org/opnet-client-library/smart-contract-interactions/sending-transaction
https://docs.opnet.org/opnet-client-library/smart-contract-interactions/importing-abi
https://docs.opnet.org/opnet-client-library/working-with-bitcoin/fetch-utxos-for-an-address
https://docs.opnet.org/opnet-client-library/working-with-transactions/broadcasting-transactions
https://docs.opnet.org/opnet-client-library/working-with-public-keys/address-validation
```

Key confirmations:

### Network selection

The docs currently state:

```text
The library supports Mainnet and Regtest Bitcoin networks. No Testnet endpoints are currently available; use Regtest for all development and testing purposes.
```

Documented endpoint examples:

```text
mainnet: https://mainnet.opnet.org     network: networks.bitcoin
regtest: https://regtest.opnet.org     network: networks.regtest
```

This strengthens the earlier network-risk finding. The repo currently uses `https://testnet.opnet.org` and has code paths that use both `networks.testnet` and `networks.regtest`. Given the docs, this needs a deliberate compatibility decision, not scattered assumptions.

Action item:

- Confirm whether `https://testnet.opnet.org` is a legacy/staging endpoint, a renamed regtest endpoint, or an undocumented live test endpoint.
- If it is equivalent to documented regtest, centralize provider config as `networks.regtest`.
- If it is truly a separate testnet, document the exception inside the repo and add diagnostics proving the correct `bech32Opnet`/address behavior.

### Simulation-first contract interaction

Docs confirm every state-changing OP_NET contract interaction should follow:

```text
simulate -> inspect revert/call result -> serialize/sign/broadcast
```

This matches `preparePoolCreation()`, which simulates `factory.createPool(...)`, checks `simulation.revert`, then creates an offline buffer via `toOfflineBuffer(...)`.

Action item:

- Apply this same standard to bonding curve approval/init and any direct token interactions.
- Never let UI proceed from text instructions alone when simulation or allowance checks can prove readiness.

### Offline signing

Docs confirm the expected offline signing flow:

```text
simulation.toOfflineBuffer(refundToAddress, maximumAllowedSatToSpend)
transfer/sign offline or wallet-side
broadcast signed transaction
```

This supports the backend/frontend architecture already present:

```text
backend prepares offline interaction buffer
frontend wallet signs it
backend broadcasts signed raw transaction
```

Action item:

- Instrument the wallet method used to sign the buffer.
- Distinguish pure signing methods from sign-and-broadcast methods to avoid double-broadcast ambiguity.

### Broadcasting

Docs confirm `provider.sendRawTransaction(tx, psbt)` returns a `BroadcastedTransaction` shape:

```ts
interface BroadcastedTransaction {
  success: boolean;
  result?: string;
  error?: string;
  peers?: number;
}
```

This aligns with `broadcastSignedInteraction()` checking `success`, extracting txid, and returning error strings.

Action item:

- Add duplicate/already-known handling for OP_NET signed interactions if wallet methods may have already broadcast.
- Record `peers`/raw broadcast result in check-run diagnostics for failed launches.

### Built-in ABIs

Docs list built-in ABIs:

```text
OP_20_ABI
OP_20S_ABI
OP_721_ABI
EXTENDED_OP721_ABI
MOTOSWAP_ROUTER_ABI
MotoswapPoolAbi
MotoSwapFactoryAbi
MOTO_ABI
```

This reinforces a fix direction for bonding curve/client code: prefer SDK ABIs and generated/typed contract calls wherever possible instead of hand-rolled selector assumptions.

Action item:

- Use built-in `MOTO_ABI` / `OP_20_ABI` / `MotoSwapFactoryAbi` for off-chain simulations and tests.
- For on-chain AssemblyScript cross-contract calls, verify selectors against those ABIs and OP_NET ABI docs.

### UTXOs

Docs recommend accessing UTXOs through:

```text
provider.utxoManager.getUTXOs({ address, ...options })
```

and note that the provider-created UTXO manager shares provider network configuration.

This strengthens the UTXO proxy concern: the current Next route hardcodes an RPC endpoint instead of sharing runtime/provider config.

Action item:

- Replace or wrap direct JSON-RPC UTXO calls with shared provider config, or make the direct JSON-RPC proxy derive its URL from the same normalized OP_NET env.

### Address validation

Docs expose provider-level address validation:

```text
provider.validateAddress(address, network)
```

Action item:

- Use SDK address validation in diagnostics and API request validation, especially around submitted deploy contract addresses and wallet/refund addresses.



## Newly Confirmed Repo-Specific Network Issue

After continuing the trace, the network mismatch is no longer just a broad risk — it is explicit in `packages/opnet/src/runtime-provider.ts`:

```ts
const OPNET_RPC_URL = (process.env["OPNET_RPC_URL"] ?? "").trim() || "https://testnet.opnet.org";

async function getOpnetNetworkObj(): Promise<unknown> {
  const nets = await getBtcNetworks();
  return nets.testnet;
}

export function getOpnetNetwork(): string {
  return "testnet";
}
```

This conflicts with the current OP_NET docs that say development/testing should use:

```text
RPC:     https://regtest.opnet.org
network: networks.regtest
```

Possible interpretations:

1. `https://testnet.opnet.org` is an older but still functioning endpoint.
2. `https://testnet.opnet.org` is an OP_NET-specific test endpoint not reflected in docs.
3. The code is using a legacy testnet configuration that happens to respond today but may not match current SDK expectations.

Why this matters:

- Address formatting and validation depend on the Bitcoin network object.
- UTXO lookup and transaction construction depend on the provider/network pairing.
- The frontend already has some `networks.regtest` usage, meaning flows may be split-brain.

Recommended fix design:

```ts
export type OpnetNetworkName = "mainnet" | "regtest" | "legacy-testnet";

export function getOpnetNetworkName(): OpnetNetworkName {
  return (process.env["OPNET_NETWORK"] as OpnetNetworkName | undefined) ?? "regtest";
}

export async function getOpnetNetworkObj() {
  const nets = await getBtcNetworks();
  switch (getOpnetNetworkName()) {
    case "mainnet": return nets.bitcoin;
    case "regtest": return nets.regtest;
    case "legacy-testnet": return nets.testnet;
  }
}

export function getDefaultOpnetRpcUrl(network = getOpnetNetworkName()) {
  if (network === "mainnet") return "https://mainnet.opnet.org";
  if (network === "regtest") return "https://regtest.opnet.org";
  return "https://testnet.opnet.org";
}
```

Then diagnostics should expose:

```text
configured network name
selected RPC URL
network.bech32
network.bech32Opnet
provider health
```

This lets the project keep `testnet.opnet.org` temporarily if needed, but makes the exception explicit instead of hidden.

## Primary Root-Cause Findings

### 1. TBTC and shop flows are configured unavailable

Evidence:

```text
OPNET_TBTC_CONTRACT_ADDRESS=
SHOP_OP721_COLLECTION=
readiness.tbtcLiquidity=false
readiness.shopMint=false
```

Impact:

- TBTC pool creation/reserve mapping will fail.
- Shop mint flow will fail.

Fix:

- Configure real addresses, or disable those product paths visibly in UI/API.

### 2. Bonding curve init is blocked by missing fee recipient

Evidence:

```text
OPNET_FEE_RECIPIENT=
launch.ts returns 503 when missing
```

Impact:

- Bonding curve launch can build/deploy but cannot initialize.

Fix:

- Set valid `OPNET_FEE_RECIPIENT`.
- Add startup/readiness failure if bonding curve mode is enabled without it.

### 3. Bonding curve approval step is not operationally strong enough

Evidence:

- Contract requires `MOTO.transferFrom(caller, feeRecipient, launchFee)`.
- API returns instruction text telling user to call approve first.

Impact:

- Users can hit deterministic init revert if approval is skipped or not confirmed.

Fix:

- Add approval preparation/submission/confirmation flow.
- Gate init on allowance.

### 4. Network selection is inconsistent / under-verified

Evidence:

- Code uses both `networks.regtest` and `networks.testnet` in OP_NET-related frontend paths.
- `networks.opnetTestnet` does not exist.
- `networks.testnet` exposes `bech32Opnet=opt`; `networks.regtest` exposes `bech32Opnet=opr`.

Impact:

- Possible address/signing/UTXO/broadcast mismatch.

Fix:

- Centralize network selection and verify against docs/SDK examples.

### 5. UTXO proxy hardcodes RPC URL

Evidence:

```text
apps/web/src/app/api/opnet-utxos/route.ts hardcodes https://testnet.opnet.org/api/v1/json-rpc
```

Impact:

- Env drift across local/staging/prod.

Fix:

- Use env-driven URL and shared normalization.

### 6. ABI selectors need runtime verification

Evidence:

- Bonding curve mixes OP_NET `encodeSelector` local methods with EVM keccak cross-contract selectors.

Impact:

- Possible runtime reverts not caught by build/typecheck.

Fix:

- Validate against OP_NET ABI/token docs.
- Add simulation tests.

## Recommended Fix Plan

### Phase 1 — Guardrails / config truth

1. Set `OPNET_FEE_RECIPIENT`.
2. Decide whether TBTC/shop are live or disabled.
3. Add launch-mode readiness validation.
4. Expose runtime diagnostics endpoint from `getRuntimeDiagnostics()`.

### Phase 2 — Reduce drift

1. Centralize OP_NET RPC URL normalization.
2. Replace hardcoded UTXO proxy URL.
3. Centralize OP_NET network object selection.
4. Add diagnostics for active network object and address HRPs.

### Phase 3 — Bonding curve operational path

1. Add approval preparation step.
2. Add approval submit/confirm state.
3. Verify MOTO allowance before preparing `initialize()`.
4. Only allow curve init after approval confirmation.

### Phase 4 — ABI/runtime proof

1. Verify OP20/MOTO selectors.
2. Verify MotoSwap factory selectors.
3. Add simulation tests for:
   - `initialize()`
   - `buy()`
   - `sell()`
   - graduation `createPool()`
4. Add receipt/revert diagnostics to watcher/API.

### Phase 5 — E2E dry runs

1. Direct MOTO pool dry run.
2. Bonding curve dry run.
3. TBTC dry run only after TBTC contract address is configured.
4. Shop mint dry run only after OP721 collection address is configured.

## MCP / Tooling Recommendations

Highest-value custom MCP/tooling target:

```text
opnet_diagnostics
```

Suggested tools:

```text
opnet_provider_health
opnet_contract_code_probe
opnet_runtime_readiness
opnet_address_validate
opnet_address_convert_hrp
opnet_utxos
opnet_tx_receipt
opnet_selector_hash
opnet_abi_encode
opnet_abi_decode
opnet_network_info
```

Recommended supporting MCPs/tools:

- GitHub MCP for issues, PRs, CI, reviews.
- Filesystem/code-search MCP for monorepo tracing.
- Browser/Playwright MCP for wallet UI reproduction.
- DB/Prisma-safe inspection tool for launch state transitions.
- Env/secrets auditor for `.env.example`, Vercel template, local env drift.

Why this matters:

- The current weak spots are not ordinary TypeScript failures.
- They are runtime boundary failures: env, network, wallet API, address encoding, transaction broadcast, ABI selectors.
- MCP/tooling should make those boundaries observable.

## Bottom Line

The codebase builds. OP_NET RPC is live. MotoSwap factory/router are real and reachable. The risky parts are runtime edges:

```text
missing OPNET_FEE_RECIPIENT
blank TBTC/shop contract config
manual bonding-curve approval step
inconsistent/under-verified network selection
hardcoded UTXO proxy RPC
unverified ABI selector assumptions
wallet sign-vs-broadcast ambiguity
```

This foundation is solid enough to continue, but not safe enough for a frictionless public launch until those runtime guardrails are tightened.

---

## Fix Applied: Centralized OP_NET Network Configuration

Status: applied after the diagnostic pass.

Files changed:

- `packages/opnet/src/runtime-provider.ts`
- `packages/opnet/src/index.ts`
- `packages/opnet/package.json`
- `packages/opnet/test/runtime-provider-network-config.test.mjs`
- `apps/api/.env.example`
- `apps/api/.env.vercel.template`

What changed:

- Added `OPNET_NETWORK` support with canonical values:
  - `regtest`
  - `mainnet`
  - `legacy-testnet`
- Default runtime network is now `regtest`.
- Default runtime RPC URL is now `https://regtest.opnet.org`.
- Existing explicit legacy testnet RPC URLs are detected and mapped to `legacy-testnet` to avoid RPC/network-object drift.
- `OPNET_NETWORK` explicitly overrides RPC URL inference.
- Mainnet maps to the `@btc-vision/bitcoin` `networks.bitcoin` object, not a nonexistent `networks.mainnet` key.
- Runtime diagnostics can now expose a single canonical network config via `getOpnetNetworkConfig()`.
- Added Node test coverage for default regtest behavior, legacy testnet inference, explicit override behavior, and mainnet Bitcoin-network-object mapping.
- Updated API env templates to document `OPNET_NETWORK=regtest` and `OPNET_RPC_URL=https://regtest.opnet.org`.

Verification run after fix:

- `corepack.cmd pnpm --filter @opfun/opnet build` — pass
- `corepack.cmd pnpm --filter @opfun/opnet test` — pass, 5/5 tests
- `corepack.cmd pnpm --filter @opfun/opnet typecheck` — pass
- `corepack.cmd pnpm -r build` — pass

Remaining caution:

If production still has `OPNET_RPC_URL` pointing at a legacy testnet endpoint but no `OPNET_NETWORK`, the runtime now safely infers `legacy-testnet`. For clean deploy hygiene, set both variables explicitly in real environments.

---

## Fix Applied: OP_NET UTXO Proxy Uses Canonical Runtime Config

Status: applied after centralized network config.

Files changed:

- `packages/opnet/src/runtime-provider.ts`
- `packages/opnet/src/index.ts`
- `packages/opnet/test/runtime-provider-network-config.test.mjs`
- `apps/web/src/app/api/opnet-utxos/route.ts`
- `apps/web/package.json`
- root `package.json`
- `pnpm-lock.yaml`

What changed:

- Added `getOpnetJsonRpcUrl()` to derive the JSON-RPC endpoint from canonical `OPNET_RPC_URL`.
- `getOpnetJsonRpcUrl()` appends `/api/v1/json-rpc` when the configured RPC URL is a root endpoint and leaves already-complete JSON-RPC URLs unchanged.
- Replaced the web UTXO proxy's hardcoded `https://testnet.opnet.org/api/v1/json-rpc` with `getOpnetJsonRpcUrl()`.
- The UTXO proxy now returns `network` and `bitcoinNetworkKey` metadata with successful responses and includes network metadata in upstream error responses.
- Added `@opfun/opnet` as a web workspace dependency so the web route can consume the same runtime config as the API/runtime package.
- Updated web/root dev/build scripts so `@opfun/opnet` is built before the web app imports it.
- Updated lockfile after adding the web workspace dependency.

Verification run after fix:

- `corepack.cmd pnpm --filter @opfun/opnet build` — pass
- `corepack.cmd pnpm --filter @opfun/opnet test` — pass, 6/6 tests
- `corepack.cmd pnpm --filter web typecheck` — pass
- `corepack.cmd pnpm --filter web build` — pass
- `corepack.cmd pnpm -r typecheck` — pass
- `corepack.cmd pnpm -r build` — pass

Remaining caution:

The proxy is now network-config aligned, but frontend wallet behavior still contains testnet-language assumptions. The next hardening pass should align wallet network switching/address HRP behavior with the same canonical network config, especially around OP_WALLET and regtest/legacy-testnet naming.

## 2026-05-18 Follow-up: Network Alignment Hardening

Follow-up probes after centralizing `OPNET_NETWORK` found the configured MotoSwap factory/router addresses have code on `legacy-testnet` (`https://testnet.opnet.org`) but not on docs-aligned `regtest` (`https://regtest.opnet.org`).

Operational decision for current configured addresses:

```text
OPNET_NETWORK=legacy-testnet
OPNET_RPC_URL=https://testnet.opnet.org
NEXT_PUBLIC_OPNET_NETWORK=legacy-testnet
NEXT_PUBLIC_OPNET_RPC_URL=https://testnet.opnet.org
```

If the project moves to `regtest` or `mainnet`, the MotoSwap factory/router, TBTC, shop collection, vault address, and wallet network must be replaced with addresses deployed on that selected chain. Runtime diagnostics now include an `issues` array that flags configured addresses with no contract code on the selected OP_NET network.
