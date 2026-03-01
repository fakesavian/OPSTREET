# Decisions Log

This file prevents “conversation compaction” from losing critical choices.

## Project
- Name: OPFun Secure Launchpad (working title)
- Core value: Pump.fun-style onboarding + security gating + watchtower monitoring

## Product decisions
- MVP is **testnet only**.
- No paid RNG / gambling-for-money mechanics.
- “Incubator trading” in MVP is **simulation + pledges**, not a real DEX.
- Primary differentiator is a **Risk Card** + **Verified build metadata** + **Watchtower alerts**.

## Engineering decisions
- Monorepo: pnpm workspaces
- Web: Next.js + Tailwind (neo-brutalism)
- API: Node + Fastify + Zod
- DB: SQLite via Prisma
- Worker: Node interval/cron loop
- OPNet integration: opnet-bob MCP for scaffolding/audit/deploy guidance; wrap outputs into deterministic files.

## Agent workflow decisions
- Require plan approval before code changes.
- Prefer git worktrees per agent stream to avoid conflicts.
- If same error happens 3 times → escalate to Debug Agent.
