# OPFun Secure Launchpad

> Launch fast on OP_NET — every token ships with an automated **Risk Card**, security checks, and live monitoring.

**Testnet only. No real money. Fixed-supply tokens by default.**

---

## Quick start

### 1. Prerequisites

- Node.js ≥ 18
- pnpm ≥ 9 (`npm i -g pnpm`)
- Claude Code + opnet-bob MCP (for Milestone 2+):
  ```bash
  claude mcp add --transport http opnet-bob https://ai.opnet.org/mcp
  ```

### 2. Install dependencies

```bash
cd opfun-secure-launchpad
pnpm install
```

### 3. Set up the database

```bash
pnpm db:migrate
```

Optionally seed a demo project:

```bash
pnpm db:seed
```

### 4. Run everything

```bash
pnpm dev
```

This starts:
| App | URL |
|---|---|
| Web (Next.js) | http://localhost:3000 |
| API (Fastify) | http://localhost:3001 |
| Watcher (logs) | console |

---

## Useful commands

```bash
# Individual apps
pnpm --filter web dev
pnpm --filter api dev
pnpm --filter watcher dev

# Type check all packages
pnpm typecheck

# Lint all
pnpm lint

# Prisma studio
cd apps/api && npx prisma studio
```

---

## API endpoints (Milestone 1)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/projects` | Create a project |
| `GET` | `/projects` | List all projects |
| `GET` | `/projects/:slug` | Get project + check runs + events |
| `POST` | `/projects/:id/run-checks` | *(stub — returns 501 until M2)* |
| `GET` | `/health` | Health check |

---

## Milestones

| # | Status | Description |
|---|--------|-------------|
| 1 | ✅ **Done** | Scaffold + CRUD projects |
| 2 | ⬜ Pending | Bob integration: contract scaffold + Risk Card |
| 3 | ⬜ Pending | Testnet deploy via Bob OpnetCli |
| 4 | ⬜ Pending | Watchtower: real contract monitoring |
| 5 | ⬜ Pending | Pump.fun polish: feed ranking, bonding curve sim |

---

## Structure

```
opfun-secure-launchpad/
  apps/
    web/        # Next.js 14 + Tailwind (port 3000)
    api/        # Fastify + Prisma + SQLite (port 3001)
    watcher/    # Health poll stub → full Watchtower (M4)
  packages/
    shared/     # Shared TypeScript types + utils
    risk/       # Risk scoring engine
    opnet/      # OPNet integration (Bob MCP wrappers)
  docs/
    MVP_PLAN.md
```

---

## Security guardrails

- All tokens default to **fixed supply, no mint, no admin keys**.
- Risky options show as red/critical in the Risk Card.
- No mainnet. No real-money mechanics. No paid RNG.
- Never paste private keys or seed phrases into Bob or any MCP tool.
