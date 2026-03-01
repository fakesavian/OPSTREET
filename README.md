# OPFun Secure Launchpad

> **Pump.fun-style token launches on OP_NET — with a Risk Card on every token.**

Every token launched here ships with:
- Automated OP_20 contract scaffolding (via Bob AI / OPNet MCP)
- A transparent **Risk Card** — permissions, token economics, release integrity
- A 0–100 **risk score** computed from static analysis
- A **Watchtower** that monitors deployed contracts and alerts on anomalies
- A **bonding curve simulator** + pledge / graduation mechanic
- **Bitcoin wallet login** (Unisat / OKX) for identity and pledge attribution

**Testnet only. No real funds.**

---

## Quick start

### Prerequisites

- Node.js >= 18
- pnpm >= 9 (`npm install -g pnpm`)

### Install

```bash
cd opfun-secure-launchpad
pnpm install
```

### Database setup

```bash
pnpm db:migrate
pnpm --filter api db:seed    # optional: seed a demo project
```

### Run everything locally

```bash
pnpm dev
```

| Process | URL | Description |
|---------|-----|-------------|
| `apps/web` | http://localhost:3000 | Next.js UI |
| `apps/api` | http://localhost:3001 | Fastify REST API |
| `apps/watcher` | — | Watchtower worker (polls every 5 min) |

---

## Environment variables

### `apps/api/.env`

```env
DATABASE_URL="file:./dev.db"
PORT=3001
ADMIN_SECRET="change-me-in-production"   # required — API exits in prod if default
# DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."  # optional: CRITICAL alerts
# APP_URL="https://yourapp.com"                               # used in Discord embed links
```

### `apps/watcher/.env` (or shell env)

```env
API_URL=http://localhost:3001
ADMIN_SECRET=change-me-in-production
WATCH_INTERVAL_MS=300000     # 5 minutes default
```

### `apps/web/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## Connect Bob (OPNet MCP)

Bob scaffolds OP_20 contracts and runs security audits automatically.

```bash
claude mcp add opnet-bob --transport http https://ai.opnet.org/mcp
```

No API key required. The API calls Bob when you click **Run Security Checks**.
**Never** paste private keys or mnemonics into any prompt that reaches Bob.

---

## Wallet login

Click **Connect Wallet** in the header (desktop) or mobile nav drawer.
Supports [Unisat](https://unisat.io) and OKX Wallet (Bitcoin/Taproot).

- Address is stored in `localStorage` only — nothing sent to the server except for pledge attribution.
- Pledges are rate-limited 1 per wallet address (or IP if no wallet) per project per 24 h.

---

## Project lifecycle

```
DRAFT → CHECKING → READY → LAUNCHED → GRADUATED
                       ↑         ↓
                    FLAGGED  (Watchtower CRITICAL event)
```

| Status | Meaning |
|--------|---------|
| `DRAFT` | Created, not yet checked |
| `CHECKING` | Scaffold + audit in progress |
| `READY` | Checks passed, Risk Card generated |
| `DEPLOY_PACKAGE_READY` | Deploy package generated, awaiting manual deploy |
| `LAUNCHED` | Deployed to OP_NET testnet — Watchtower active |
| `FLAGGED` | Watchtower detected a CRITICAL anomaly |
| `GRADUATED` | Reached 100 pledges |

---

## API reference

### Projects

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/projects` | — | Create project |
| `GET` | `/projects?sort=new\|trending&status=LAUNCHED` | — | List projects (filterable) |
| `GET` | `/projects/:slug` | — | Full project with checkRuns + watchEvents |
| `POST` | `/projects/:id/run-checks` | — | Trigger async scaffold + audit |
| `POST` | `/projects/:id/pledge` | — | Pledge (body: `{ walletAddress? }`) |
| `POST` | `/projects/:id/view` | — | Record a page view |

### Deploy (X-Admin-Secret required)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/projects/:id/deploy` | Generate deploy package |
| `POST` | `/projects/:id/confirm-deploy` | Record contract address + TX |
| `GET` | `/projects/:id/deploy-package` | Get deploy instructions |

### Watch Events

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/projects/:id/watch-events` | Admin | Write event (Watchtower) |
| `GET` | `/projects/:id/watch-events` | — | List events (newest first) |
| `PATCH` | `/projects/:id/watch-events/:eventId/resolve` | Admin | Mark event resolved |

---

## QA / security

```bash
pnpm typecheck      # TypeScript across all packages
pnpm lint           # ESLint (Next.js rules)
pnpm test           # Playwright smoke tests (requires running web app)
pnpm secrets:scan   # Gitleaks scan of git history
```

---

## Monorepo structure

```
opfun-secure-launchpad/
├── apps/
│   ├── web/       Next.js 14 App Router + Tailwind (neo-brutalism)
│   ├── api/       Fastify + Prisma + Zod + SQLite
│   └── watcher/   Watchtower background worker
├── packages/
│   ├── shared/    TypeScript types (ProjectDTO) + slugify
│   ├── opnet/     Bob MCP client, scaffolder, auditor, deployer
│   └── risk/      Risk scoring stub (scoring lives in opnet/auditor.ts)
├── tests/         Playwright smoke tests
├── tools/         gitleaks portable binary (gitignored)
├── DECISIONS.md   Engineering non-negotiables
├── RISK_CARD_SPEC.md  Risk Card JSON schema + scoring rubric
└── TODO.md        Live backlog
```

---

## Milestones

| # | Name | Status |
|---|------|--------|
| M1 | Skeleton + CRUD + UI pages | ✅ Done |
| M2 | Contract scaffolding + Risk Card | ✅ Done |
| M3 | Testnet deploy flow | ✅ Done |
| M4 | Watchtower monitoring | ✅ Done |
| M5 | Trending feed, bonding curve, graduation, wallet login | ✅ Done |
