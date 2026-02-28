# OPNet “Bob” + Claude Code — MVP Build Plan (Pump.fun‑style + Security Launchpad)

This doc is written for **Claude Code** (and optionally Claude Desktop) to follow end‑to‑end.  
Goal: ship a **working MVP** that feels like Pump.fun onboarding, but with **security gating + verified releases + monitoring** for OP_NET/Bitcoin L1 projects.

---

## 0) What you’re building (MVP scope)

**Product name (working):** OPFun Secure Launchpad

**Core promise:** “Launch fast like Pump.fun — but every launch ships with a transparent **Risk Card**, automated **security checks**, and a **Watchtower** that keeps monitoring after launch.”

### MVP user flows

1. **Creator creates a launch**
   - Inputs: token name, ticker, decimals, max supply, description, links, icon.
   - System scaffolds an OP_20 contract, runs automated checks, produces a **Risk Card**, and deploys to **OP_NET testnet**.
2. **Public launch page**
   - Shows: token metadata, contract address, build hash, audit summary, Risk Card.
3. **Incubator trading (MVP-lite)**
   - **Do NOT build full DEX** in MVP.
   - Provide an **off‑chain bonding curve simulator** + “Reserve / Pledge” leaderboard.
   - “Graduation” is just a status change once criteria is hit (manual/admin or automated).
4. **Watchtower**
   - Background job checks deployed contracts for suspicious events/state changes and flags the project page.

### Non‑goals (explicitly NOT in MVP)
- No mainnet deployments.
- No real-money deposits, no wagering/lootbox-for-cash.
- No full AMM/DEX integration (can be Phase 2).

---

## 1) Set up Bob (OP_NET MCP server) with Claude Code

Bob is an MCP server at:

- `https://ai.opnet.org/mcp`

### 1.1 Prereqs
- Node.js (so `npx` works)
- Claude Code installed and on PATH (`claude` command)

### 1.2 Add Bob as an MCP server (Claude Code)
Run:

```bash
claude mcp add --transport http opnet-bob https://ai.opnet.org/mcp
```

Then in Claude Code, run:

```text
/mcp
```

Confirm `opnet-bob` is listed and authenticated/ready (no API key required).

### 1.3 Safety rule
Treat remote MCP servers as **untrusted**:
- Do **not** paste secrets (wallet seeds, private keys, API keys).
- Do not share proprietary client code if you can avoid it.
- Prefer testnet keys and throwaway repos for experimentation.

---

## 2) Optional: Set up Bob in Claude Desktop (if you want UI + tools)

**Config file path**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add:

```json
{
  "mcpServers": {
    "opnet-bob": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://ai.opnet.org/mcp"]
    }
  }
}
```

Restart Claude Desktop. Bob’s tools should appear in a new conversation.

---

## 3) Repo scaffolding (Claude Code: do this first)

Create a monorepo with clean separation:

```
opfun-secure-launchpad/
  apps/
    web/        # Next.js app (UI)
    api/        # Node API (Fastify or Express)
    watcher/    # Background worker (Watchtower)
  packages/
    shared/     # shared types + utils
    risk/       # risk scoring engine
    opnet/      # opnet integration wrappers (calls Bob tools or OPNet SDK/CLI)
  docs/
    MVP_PLAN.md
```

### Tech choices (MVP defaults)
- **Frontend:** Next.js + Tailwind
- **Backend:** Node + Fastify + Zod
- **DB:** SQLite (MVP) via Prisma (easy migration to Postgres later)
- **Queue:** BullMQ or simple cron (MVP can be cron)
- **Auth:** email magic link *or* “no auth” MVP + admin secret (choose fastest)

---

## 4) Database schema (MVP)

Use Prisma schema roughly like:

- `Project`
  - id, slug, name, ticker, description, links, iconUrl
  - status: `DRAFT | CHECKING | READY | LAUNCHED | FLAGGED | GRADUATED`
  - contractAddress, network (testnet), deployTx
  - buildHash, sourceRepoUrl (optional)
  - riskScore (0–100), riskCardJson
  - createdAt, updatedAt

- `CheckRun`
  - id, projectId, type (`SCAFFOLD | STATIC | AUDIT | DEPLOY`)
  - status (`PENDING | OK | WARN | FAIL`)
  - outputJson, createdAt

- `WatchEvent`
  - id, projectId, severity (`INFO | WARN | CRITICAL`)
  - title, detailsJson, txId (optional), createdAt

---

## 5) The “Risk Card” (what makes you different)

Every project page MUST show these fields:

### Permissions / admin risk
- Owner/admin keys exist? (yes/no)
- Can mint more supply? (yes/no)
- Can pause transfers? (yes/no)
- Can upgrade logic? (yes/no)
- Timelocks on privileged actions? (yes/no + delay)

### Token economics
- Max supply
- Decimals
- Initial distribution notes (MVP: creator statement)
- Any transfer restrictions?

### Release integrity
- Build hash recorded? (yes/no)
- Contract address matches recorded artifact? (yes/no/unknown)
- Audit run timestamp + results summary

**MVP approach:** store a JSON `riskCardJson` and compute a `riskScore` from simple rules.

---

## 6) OP_NET integration strategy (MVP)

You have two options. Pick **A** first for speed.

### A) “AI-assisted OPNet integration” (fastest)
Use Bob tools:
- `OpnetDev` to scaffold OP_20 contract templates
- `OpnetAudit` to run audits/checks
- `OpnetCli` to deploy to testnet (or get exact CLI steps)

**Claude Code should call these tools as needed**. The repo should wrap outputs into predictable files:
- `packages/opnet/generated/<projectId>/...`
- `apps/api` stores addresses + hashes in DB

### B) “Direct SDK/CLI integration” (more control)
If OPNet provides a stable TS SDK/CLI, use it directly in `packages/opnet/`.
Still keep Bob connected for guidance, but don’t depend on it at runtime.

---

## 7) Implementation milestones (Claude Code checklist)

### Milestone 1 — Skeleton + UI pages (Day 1)
- [ ] Create monorepo + tooling
- [ ] Next.js web app with routes:
  - `/` (feed)
  - `/create`
  - `/p/[slug]` (project page)
  - `/admin` (basic)
- [ ] API server with endpoints:
  - `POST /projects`
  - `GET /projects`
  - `GET /projects/:slug`
  - `POST /projects/:id/run-checks`

**Acceptance**
- You can create a project and see it on a project page (no chain yet).

### Milestone 2 — Contract scaffolding + checks (Day 2–3)
- [ ] On “run-checks”, Claude Code calls Bob `OpnetDev` to scaffold OP_20 contract
- [ ] Save contract files into `packages/opnet/generated/<projectId>/`
- [ ] Run Bob `OpnetAudit` and store results in `CheckRun`
- [ ] Generate Risk Card JSON + risk score

**Acceptance**
- Clicking “Run checks” produces a Risk Card and shows it on the project page.

### Milestone 3 — Testnet deploy (Day 3–4)
- [ ] Add “Deploy” button (admin‑gated)
- [ ] Use Bob `OpnetCli` (or documented OPNet CLI) to deploy to testnet
- [ ] Store contract address + deploy tx + build hash
- [ ] Mark status `LAUNCHED`

**Acceptance**
- You can deploy one token to testnet and see address/tx on the project page.

### Milestone 4 — Watchtower (Day 4–5)
- [ ] `apps/watcher` runs on interval (every 2–5 min)
- [ ] For each launched project, query recent activity (events/tx/state via OPNet tooling)
- [ ] Create `WatchEvent` if:
  - privileged action executed
  - mint happens (if mintable)
  - ownership changes
  - unusual activity thresholds (simple rules)

**Acceptance**
- Watchtower writes events to DB and the project page shows them.

### Milestone 5 — “Pump-like” polish (Day 5–7)
- [ ] Trending feed: rank by pledges, clicks, or “watchers”
- [ ] Bonding curve simulator: purely client-side
- [ ] Graduation threshold: `pledges >= X` or `watchers >= Y`
- [ ] Nice UX: app-store cards, clean CTA, frictionless create flow

**Acceptance**
- The experience feels “one-screen simple” and addictive without real trading.

---

## 8) Guardrails (must follow)

### Don’t create a rug factory
- Default template should be fixed supply, no mint, no hidden admin powers.
- If creator chooses risky options, Risk Card must show it in red/critical.

### Avoid gambling mechanics in MVP
- No paid RNG.
- If you add “gacha,” keep it cosmetic-only or earned-only, with clear odds.

### Logging / privacy
- Do not log sensitive user input.
- Do not store secrets in repo.

---

## 9) What Claude Code should output (deliverables)

1. Working monorepo with:
   - `apps/web` (Next.js)
   - `apps/api` (Fastify/Express)
   - `apps/watcher` (watchtower worker)
2. Prisma schema + migrations
3. Risk engine (`packages/risk`)
4. OPNet wrapper (`packages/opnet`) + generated contract folders
5. README with:
   - setup
   - how to connect Bob
   - how to run locally
   - how to deploy MVP

---

## 10) Claude Code “Execution Prompt” (paste this into Claude Code)

> You are Claude Code building the repo described in `docs/MVP_PLAN.md`.  
> You must use the installed MCP server `opnet-bob` for OPNet-specific scaffolding, audits, and deployment guidance.  
> Implement Milestones 1→5 in order.  
> After each milestone: run tests, run lint, and create a git commit with a clear message.  
> Use safe defaults: fixed-supply OP_20, no mint, no admin keys unless explicitly enabled.  
> Target OP_NET **testnet only**.  
> Produce a README with exact commands to run the app locally.

---

## 11) Quick commands (local dev)

Recommended:

```bash
# install
pnpm i

# dev all
pnpm dev

# api only
pnpm --filter api dev

# web only
pnpm --filter web dev

# watcher only
pnpm --filter watcher dev
```

(Claude Code should implement the exact scripts in package.json.)
