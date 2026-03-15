# OPFun Secure Launchpad

Token launchpad and social trading floor for OP_NET (Bitcoin L1 smart contracts). Live on testnet with wallet-native trading, OP721 shop mints, and real-time market indexing.

## Status Snapshot (2026-03-09)

- **Live migration complete.** All trading, pricing, charting, and shop operations use real on-chain testnet data. No simulated or placeholder paths remain.
- The full launch pipeline is wallet-driven: create → build → wallet-sign deploy → watcher confirms on-chain → wallet-sign pool → watcher confirms → LIVE.
- Trading quotes come from confirmed pool reserves indexed by the watcher. Fills are recorded only after on-chain transaction receipts are verified.
- Shop items are OP721 NFTs in a shared collection. Entitlements require confirmed mint status.

## Current State

| Area | Status | Notes |
| --- | --- | --- |
| Project launch pipeline | Live | 9-state launch machine: DRAFT → BUILDING → AWAITING_WALLET_DEPLOY → DEPLOY_SUBMITTED → DEPLOY_CONFIRMED → AWAITING_POOL_CREATE → POOL_SUBMITTED → LIVE. Watcher confirms both deploy and pool txs on-chain before advancing. |
| Wallet auth | Live | BIP-322 signature verification, single-use nonces, JWT via HttpOnly cookie. All state-mutating routes require wallet auth. |
| Trading | Live | Constant-product AMM quotes from indexed pool reserves. Wallet signs swap tx → backend queues → watcher confirms on-chain → TradeFill recorded. Charts, leaderboards, and player stats update from confirmed fills only. |
| Trading Floor | Live | Presence, avatars, callouts, reactions, chat, ticker tape, chart panel, and floor stats. Real-time polling with staggered intervals. |
| Leaderboards and profiles | Live | Earners, callouts, and trending boards. Rankings driven by confirmed TradeFill records and graded callouts. Player progression (XP, titles, badges, trust score) updates from live events. |
| Shop and licenses | Live | OP721 mint-intent → wallet sign → confirm flow. Entitlements require confirmed on-chain mint. Ownership revalidation via RPC before feature use. One-per-wallet enforcement. |
| Clans | Partial | Create/join/leave flows with clan license gating (requires confirmed OP721 mint). No pooled treasury, governance, or payout logic yet. |
| Watcher | Live | Polls launched contracts (code presence, storage changes), indexes pool reserves, confirms pending trade submissions via RPC receipts. |
| Market indexer | Live | Pool snapshots → price derivation → OHLCV candles (1m/5m/15m/1h/4h/1d) → 24h volume/trade stats. All from confirmed on-chain data. |
| Testing | Baseline | Playwright smoke suite covers auth, project lifecycle, floor routes, leaderboard endpoints, buy-confirm flow. Regression test verifies sim routes return 404. |

## Tech Stack

| Layer | Stack | Version / Notes |
| --- | --- | --- |
| Web | Next.js, React, React DOM | `14.2.4`, `18.3.1`, `18.3.1` |
| Styling | Tailwind CSS, PostCSS, Autoprefixer | `3.4.4`, `8.4.38`, `10.4.19` |
| API | Fastify, Zod | `^5.0.0`, `^3.23.8` |
| Data | Prisma, SQLite | `^5.14.0`, local MVP database |
| Auth | `bip322-js`, `@fastify/jwt`, `@fastify/cookie` | BIP-322 verify plus JWT cookie session |
| Worker | Node.js, `tsx`, `dotenv` | file-based poller for live contract monitoring |
| OP_NET tooling | `opnet`, `@btc-vision/transaction`, `@btc-vision/bitcoin`, `@btc-vision/bip32`, `@btc-vision/ecpair` | `^1.8.0`, `^1.7.31`, `^6.5.6`, `^7.1.2`, `^4.0.5` |
| Shared package | TypeScript workspace package | DTOs, enums, shared helpers |
| Testing | Playwright | `^1.58.2` |
| Workspace tooling | pnpm workspaces, concurrently, TypeScript | root orchestration and builds |

## Monorepo Layout

```text
opfun-secure-launchpad/
|-- apps/
|   |-- api/        Fastify API + Prisma (SQLite) + market indexer + shop store
|   |-- watcher/    OP_NET contract monitor + trade/pool indexer
|   `-- web/        Next.js frontend (landing, floor, shop, docs, profiles)
|-- packages/
|   |-- opnet/      Contract scaffolder, auditor, deployer, Bob MCP client
|   `-- shared/     DTOs, enums, type definitions
|-- docs/           Architecture and process notes
`-- tests/          Playwright smoke coverage
```

## What Is Implemented Today

- Web routes: `/`, `/create`, `/p/[slug]`, `/floor`, `/leaderboards`, `/players`, `/profile`, `/shop`, `/clans`, `/trending`, `/docs`
- API route groups: auth, projects, launch (wallet-driven deploy pipeline), deploy (legacy admin), buy flow, floor, leaderboards, players, shop (OP721), clans, opnet (block/price feeds), watch-events
- Launch lifecycle: create → scaffold + audit → READY → launch-build → wallet deploy-submit → watcher confirm-deploy → wallet pool-submit → watcher confirm-pool → LIVE
- Trading: live quotes from pool reserves → wallet signs swap → broadcast → watcher confirms receipt → TradeFill + candles + stats
- Shop: OP721 mint-intent → wallet sign → mint-confirm (PENDING) → watcher confirm on-chain → CONFIRMED → entitlement unlocked
- Trading Floor: join/leave presence, callouts with reactions, chat with moderation, ticker tape, chart panel, news panel, floor stats
- Foundation systems: confirmed trade grading, callout scoring, XP, titles, trust score, badge awards, player stats
- Clan directory with license gating (requires confirmed OP721 mint)

## QA Gate Report

A comprehensive live migration QA audit was completed on 2026-03-09. See [QA_GATE_REPORT.md](./QA_GATE_REPORT.md) for the full pass/fail report.

**Remaining blockers for mainnet:**
- Watcher does not yet poll pending shop mints (OP721 mints stuck in PENDING)
- RPC ownership revalidation falls back to trusting DB when RPC is unavailable

**Advisories (testnet-acceptable, fix before mainnet):**
- Dev auth bypass and dev-session route must be disabled in production
- Legacy admin `confirm-deploy` route should be deprecated
- `ADMIN_SECRET` must be overridden from default
- Floor presence routes (`join`/`leave`) lack wallet auth — profile spoofing possible

## Known Issues

- `POST /floor/presence/join` and `POST /floor/presence/leave` accept arbitrary wallet addresses without authenticated proof of wallet ownership. Presence can be spoofed.
- Dev auth bypass exists outside production through `POST /auth/dev-session` and the non-production signature fallback path. Safe for local use, risky if enabled in staging.
- Lint coverage is weak. `api`, `watcher`, and the workspace packages use placeholder `lint` scripts that only echo success.
- The root `pnpm.overrides` pin on `@noble/hashes` is still carrying compatibility risk for the OP_NET toolchain. Removing it without regression testing is likely to break deploy tooling.

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 8+

### Install

```bash
pnpm install
```

### Create local env files

Create these files manually before running the stack:

```bash
# apps/api/.env
DATABASE_URL="file:./opfun.db"
PORT=3001
ADMIN_SECRET="dev-secret-change-me"
JWT_SECRET="dev-jwt-secret-change-me"
CORS_ORIGIN="http://localhost:3000"
AUTH_DOMAIN="localhost"
OPNET_RPC_URL=""                     # OP_NET testnet RPC (required for trade broadcast + watcher confirmation)
OPNET_RPC_KEY=""                     # Optional API key for RPC
OPNET_EXPLORER_URL="https://testnet.opnet.org"
MOTOSWAP_FACTORY_ADDRESS="0xa02aa5ca4c307107484d5fb690d811df1cf526f8de204d24528653dcae369a0f"
MOTOSWAP_ROUTER_ADDRESS="0x0e6ff1f2d7db7556cb37729e3738f4dae82659b984b2621fab08e1111b1b937a"
OPNET_TBTC_CONTRACT_ADDRESS=""       # Leave blank until you have a separately verified OP_NET testnet TBTC contract
SHOP_OP721_COLLECTION=""             # OP721 collection address for shop items
PILL_SATS_RATE=70000                 # PILL→sats conversion rate
MOTO_SATS_RATE=65000                 # MOTO→sats conversion rate

# apps/watcher/.env
API_URL="http://localhost:3001"
ADMIN_SECRET="dev-secret-change-me"
WATCH_INTERVAL_MS=300000
OPNET_RPC_URL=""                     # Required for trade confirmation + pool indexing
OPNET_RPC_KEY=""

# apps/web/.env.local
# Local development only: localhost is allowed here.
# In Vercel preview/production, do NOT point NEXT_PUBLIC_API_URL to localhost.
# Recommended production mode is same-origin /api with NEXT_PUBLIC_API_URL left unset.
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_LIQUIDITY_VAULT_ADDRESS="tb1ppdtv25qr5ydzr9733rl23pt9gx36cvffxe8mr82t2ntd9ddf3uus6wecwc"

# apps/web production env (Vercel)
# Leave NEXT_PUBLIC_API_URL unset so the browser stays on same-origin /api.
# Set OPFUN_API_URL on the web deployment so the built-in /api proxy can forward to your public API origin.
OPFUN_API_URL="https://your-api-origin.example.com"
```

### Run

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

### Useful commands

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm secrets:scan
```

## Backlog Reference

The future-feature spec has been updated with current implementation status:

- [FUTURE_FEATURES_OPFUN_UPDATED.md](./FUTURE_FEATURES_OPFUN_UPDATED.md)
