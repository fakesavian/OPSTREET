# Testnet-Only Live Migration

## Summary
Replace all simulated market, trading, deploy, and shop behavior with live OP_NET testnet flows. The implementation will upgrade to the current BTC Vision stack, use public BTC Vision testnet endpoints first, and never synthesize fallback data. Unsupported live data will surface as `503`/disabled UI, not fake charts or fake receipts.

## Key Changes
- **Live data only**
  - Replace the current price/block routes in `apps/api/src/routes/opnet.ts` with a provider-backed live adapter that reads real testnet data only.
  - Default provider source: public BTC Vision testnet services; make base URLs env-configurable so the same code can later point at self-hosted `mempool-opnet`/`op-vm`.
  - Remove all seeded/simulated candles, simulated block status, fake BTC fallback values, and any UI copy that implies paper activity.
  - Base-token charts for `TBTC`, `MOTO`, and `PILL` come from real testnet market data; launched-token charts come from indexed onchain pool/swap activity. If a token has no live trades yet, show `No trades yet`, not invented candles.

- **Wallet-native launch pipeline**
  - Upgrade the BTC Vision dependencies and rework the wallet layer around the maintained OP_WALLET/web3 deployment and interaction APIs instead of the current ad hoc shims.
  - Replace the manual/admin deploy flow with an async user launch pipeline:
    1. User submits token form and funds required liquidity from OP_WALLET.
    2. Backend scaffolds and compiles the OP-20 contract artifact.
    3. Project enters `BUILDING`.
    4. When bytecode is ready, project enters `AWAITING_WALLET_DEPLOY`.
    5. Frontend prompts the connected OP_WALLET to sign and submit the deployment transaction.
    6. Backend/watcher confirms contract deployment, then prompts the wallet for pool/liquidity creation.
    7. Project becomes `LIVE` only after contract address, deploy tx, pool address, and initial liquidity are confirmed on testnet.
  - Use MotoSwap/NativeSwap pool creation for live trading; do not preserve the current offchain bonding-curve pricing model.
  - Remove simulated trade acceptance and all code paths that treat missing tx artifacts as success.

- **Live trading and indexing**
  - Replace `buy-intent` pricing from `pledgeCount` with real onchain quote/reserve/swap calls against the created pool.
  - Persist confirmed live trade fills and pool snapshots in Prisma; use those records for charts, player stats, leaderboards, callout grading, and any achievement logic currently driven by `SimTrade`.
  - Extend the watcher into a market indexer for launched projects: confirm deploys, watch pool reserves, ingest swap events, roll candles, and update project market state.
  - Remove or hard-disable any trading/stat feature that cannot be backed by live confirmed testnet events.

- **Live shop NFTs**
  - Replace `apps/api/src/services/shopStore.ts` and the JSON-backed entitlement system with one shared OP721 shop collection on testnet.
  - Shop mint flow becomes wallet-native:
    1. Backend returns a mint intent for the selected SKU.
    2. Frontend asks OP_WALLET to sign the mint/reserve-claim interaction.
    3. Backend records the confirmed `collectionAddress`, `tokenId`, `sku`, and `mintTxId`.
  - Entitlements derive from confirmed ownership in the shared collection. The `use` endpoints remain app-state toggles only, but they must revalidate live ownership before enabling features.
  - Existing simulated shop receipts and `sim-*` tx refs are ignored and hidden; they are not treated as valid inventory.

## Public API / Type Changes
- `ProjectDTO` gains live-launch state fields: `launchStatus`, `launchError`, `poolAddress`, `poolBaseToken`, `poolTx`, `liveAt`.
- Add wallet-driven launch endpoints for the async flow, such as:
  - `POST /projects/:id/launch-build`
  - `GET /projects/:id/launch-status`
  - `POST /projects/:id/deploy-submit`
  - `POST /projects/:id/pool-submit`
- Trading endpoints stop returning simulated statuses like `SIMULATED_EXECUTION` and `TESTNET_INTEGRATION_PENDING`; they return only real quote/submit states or hard errors.
- Shop responses return real NFT fields: `collectionAddress`, `tokenId`, `mintTxId`, `confirmedAt`, and no simulated receipt ids.
- Add Prisma models for live market and shop state: pool metadata, trade fills, candles/snapshots, shop collection config, shop mints, and wallet feature activation state.

## Test Plan
- Wallet auth/session: OP_WALLET `opt1...` identity, cookie session, and wallet-state matching work consistently across create, shop, and trading routes.
- Live data: `/opnet/prices` and `/opnet/block-status` return only real upstream data; upstream failure yields `503` and the UI shows unavailable/empty states.
- Launch happy path: create token -> wallet liquidity funding -> build ready -> wallet deploy -> deploy confirmed -> pool created -> project transitions to `LIVE`.
- Launch failure paths: compiler unavailable, wallet rejects deploy, pool creation fails, upstream indexer unavailable, and watcher confirmation timeout.
- Trading happy path: quote from live pool, reserve/swap via wallet, confirmed fill indexed, chart/leaderboard/profile updates from live events only.
- Shop happy path: wallet signs mint, OP721 token confirmed, duplicate mint blocked, entitlement gating works off live ownership, losing ownership disables gated actions.
- Regression checks: no UI badge/text/status references simulated or paper trading; no endpoint accepts missing tx payloads as success.

## Assumptions
- Upgrade to the current upstream BTC Vision packages rather than patching the old pinned transaction/deploy stack.
- Public BTC Vision testnet endpoints are the initial live source; self-hosted `mempool-opnet`/`op-vm` support is added through env-configurable providers, not as the first deployment target.
- Live token trading uses MotoSwap/NativeSwap pools, not the existing offchain bonding curve.
- Token deployment is signed by the user’s connected OP_WALLET; the backend compiles/builds artifacts but does not custody deploy keys.
- Shop NFT minting is signed by the user’s connected OP_WALLET and uses one shared OP721 collection for all SKUs.
- Legacy simulated trade rows, simulated shop JSON state, and paper-market displays are retired immediately and are not backfilled into live onchain history.
