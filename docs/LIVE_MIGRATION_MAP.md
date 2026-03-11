# Live Migration Map

Audit of all simulated/paper/fallback paths in the codebase, with action plan
for transitioning to live OPNet testnet execution.

## Legend

- **REPLACE NOW** — Wire to live data source in this migration
- **DISABLE LATER** — Keep working but add feature flag to switch off
- **DELETE AFTER PROVEN** — Remove only after live path is confirmed stable

---

## 1. Fake Candles / Seeded Price Data

| File | What | Action |
|------|------|--------|
| `apps/api/src/routes/opnet.ts:47-62` | `simulatedCandles()` — seeded OHLCV from ticker hash | DISABLE LATER — keep as fallback behind `OPNET_ONCHAIN_ENABLED` flag, replace with `CandleSnapshot` DB reads |
| `apps/api/src/routes/opnet.ts:30-36` | `simulatedBlockStatus()` — fake block height from timestamp | DISABLE LATER — already falls back from real RPC; remove sim path once RPC is stable |
| `apps/api/src/routes/opnet.ts:64-78` | `simulatedPrices()` — fake TBTC/PILL/MOTO prices | DISABLE LATER — replace with real price feed from RPC or oracle |
| `apps/web/src/components/TokenChart.tsx:31-63` | `seededRand()` + `generateCandles()` — client-side fake candles | DISABLE LATER — switch to `externalCandles` prop from API once `CandleSnapshot` table is populated |

## 2. Simulated Trade Acceptance

| File | What | Action |
|------|------|--------|
| `apps/api/src/routes/buy.ts:363-394` | `SIMULATED_EXECUTION` fallback when no signed payload | DISABLE LATER — gated by `OPNET_ALLOW_SIMULATED_BUY_FALLBACK` env; set to `false` for live |
| `apps/api/src/routes/buy.ts:156` | `currentPrice` from `pledgeCount²` bonding curve formula | REPLACE NOW — read from pool/AMM price once pool exists; keep formula as pre-pool fallback |
| `apps/api/src/routes/sim.ts` | Entire `SimTrade` route + model | DISABLE LATER — keep for paper-trading mode; add `TradeFill` route for real trades |
| `apps/api/prisma/schema.prisma:233-251` | `SimTrade` model | DELETE AFTER PROVEN — keep until `TradeFill` is fully operational |

## 3. Fake Receipt IDs / sim-* Transaction References

| File | What | Action |
|------|------|--------|
| `apps/api/src/services/shopStore.ts:83-86` | `buildSimTxRef()` — generates `sim-*` tx refs for shop mints | REPLACE NOW — use real on-chain tx hash once `SHOP_USE_DB=true` |
| `apps/api/src/routes/buy.ts:367` | `sim-*` fallback reservation ID | DISABLE LATER — disappears when `OPNET_ALLOW_SIMULATED_BUY_FALLBACK=false` |
| `apps/api/data/shop-mints.json:11,22` | Existing `sim-*` tx refs in saved state | DELETE AFTER PROVEN — migrate to `ShopMint` DB table |

## 4. JSON-Backed Shop Ownership

| File | What | Action |
|------|------|--------|
| `apps/api/src/services/shopStore.ts` | Entire file — reads/writes `data/shop-mints.json` | REPLACE NOW — add `SHOP_USE_DB` flag; when true, use `ShopMint` Prisma model instead |
| `apps/api/data/shop-mints.json` | JSON file store for shop mint records | DELETE AFTER PROVEN — migrate existing records to `ShopMint` table first |
| `apps/api/src/routes/clans.ts:70-75` | `readJsonFile()` fallback pattern | DISABLE LATER — already uses DB for clan data; JSON fallback is defensive |

## 5. Off-Chain Bonding Curve Pricing

| File | What | Action |
|------|------|--------|
| `apps/web/src/components/BondingCurvePanel.tsx` | Client-side bonding curve simulator (pledge-based) | DISABLE LATER — replace with live pool price once AMM is active; keep as "simulator" view |
| `apps/web/src/components/ProjectPageClient.tsx:85-97` | `TokenSimStats` — sim price/mcap from pledge count | DISABLE LATER — replace values with real price from API once pool exists |
| `apps/web/src/components/ProjectPageClient.tsx:497-515` | `simMcap()` + `curvePrice()` in feed stats | DISABLE LATER — same as above |
| `apps/web/src/components/FeedClient.tsx:20-21` | `simMcap()` — simulated market cap from pledges | DISABLE LATER — replace with real mcap from pool data |
| `apps/api/src/routes/floor.ts:39-41` | `mockDelta()` — deterministic fake price change | REPLACE NOW — compute from `CandleSnapshot` or `TradeFill` once available |

## 6. UI Text Implying Paper Trading / Simulation

| File | Line(s) | Text | Action |
|------|---------|------|--------|
| `apps/web/src/components/ProjectPageClient.tsx:25` | "Simulated Interest" heading | REPLACE NOW — change to "Interest" or "Community Signal" |
| `apps/web/src/components/ProjectPageClient.tsx:29` | "pledges (simulated)" label | REPLACE NOW — change to "pledges" |
| `apps/web/src/components/ProjectPageClient.tsx:44` | "Pledges simulate buy interest" | REPLACE NOW — change to "Pledges signal community interest" |
| `apps/web/src/components/ProjectPageClient.tsx:91` | "Simulated Stats" heading | REPLACE NOW — change to "Token Stats" |
| `apps/web/src/components/ProjectPageClient.tsx:94-95` | "Sim Price" / "Sim MCap" labels | REPLACE NOW — change to "Est. Price" / "Est. MCap" |
| `apps/web/src/components/ProjectPageClient.tsx:201` | `<OpBadge variant="simulated" />` | DISABLE LATER — remove badge when live |
| `apps/web/src/components/ProjectPageClient.tsx:207-209` | "Price chart and pledge counts reflect simulated paper activity" | REPLACE NOW — change to conditional: show only when not live |
| `apps/web/src/components/TokenChart.tsx:194` | `<span className="op-badge-simulated">SIM</span>` | DISABLE LATER — hide when showing real candles |
| `apps/web/src/components/TokenChart.tsx:362` | "Simulated data" footer text | DISABLE LATER — show "Live data" when real candles |
| `apps/web/src/components/FeedClient.tsx:232,307,436,520` | "Sim MCap" column headers and values | REPLACE NOW — change to "Est. MCap" |
| `apps/web/src/components/BondingCurvePanel.tsx:89` | "Bonding Curve Simulator" title | DISABLE LATER — change to "Bonding Curve" when live |
| `apps/web/src/components/BondingCurvePanel.tsx:91` | "Simulated price" subtitle | DISABLE LATER — remove "Simulated" when live |

## 7. Seed Data / Foundation Seeding

| File | What | Action |
|------|------|--------|
| `apps/api/src/seed.ts` | Development seed script | KEEP — dev-only, not production code |
| `apps/api/src/services/foundation.ts` | `seedFoundationData()` — badge/level definitions | KEEP — seeds reference data, not simulated state |
| `apps/api/src/index.ts:100-101` | Auto-seed on startup | KEEP — safe for production (upserts definitions) |

## 8. Dev Auth Fallbacks

| File | What | Action |
|------|------|--------|
| `apps/api/src/middleware/verifyWalletToken.ts:14,27-28` | `DEV_AUTH_HEADER_FALLBACK` — dev-only auth bypass | DISABLE LATER — ensure `DEV_AUTH_HEADER_FALLBACK=false` in production env |

---

## New Tables Added (This Migration)

| Model | Purpose | Replaces |
|-------|---------|----------|
| `TradeFill` | On-chain trade records | `SimTrade` (eventually) |
| `CandleSnapshot` | OHLCV candle data | Client-side `generateCandles()` |
| `PoolMetadata` | AMM pool info after graduation | Manual tracking |
| `ShopMint` | DB-backed shop ownership | `data/shop-mints.json` |
| `WalletFeatureState` | Per-wallet feature flags | None (new capability) |

## New Project Fields Added

| Field | Purpose |
|-------|---------|
| `launchStatus` | Live launch state machine position |
| `launchError` | Error message if launch failed |
| `poolAddress` | AMM pool contract address |
| `poolBaseToken` | Base token of the pool |
| `poolTx` | Pool creation transaction hash |
| `liveAt` | Timestamp when token went live |

## Env Placeholders Added

See `apps/api/.env.live-migration` for all new environment variables.
