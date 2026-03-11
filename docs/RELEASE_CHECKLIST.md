# OPFun Testnet Release Checklist

Go/no-go checklist for the public testnet launch. Every box must be checked before proceeding.

## Environment

- [ ] Node.js >= 20 installed (`node --version`)
- [ ] Current git SHA noted (`git rev-parse HEAD`)
- [ ] `asc --version` returns a version (AssemblyScript compiler present)
- [ ] `OPNET_MNEMONIC` env var set and non-empty
- [ ] Redis running (or Prisma SQLite nonce store confirmed — see Nonce Persistence below)
- [ ] `JWT_SECRET` env var is a random 32+ char string (not the default)
- [ ] `CORS_ORIGIN` env var matches the production domain

## Pre-Launch Checks

- [ ] Staging smoke test passes all 10 steps (see `TESTNET_SMOKE.md`)
- [ ] HTTPS active on both web and API
- [ ] `CORS_ORIGIN` set correctly (no wildcard in production)
- [ ] `JWT_SECRET` rotated from any dev default
- [ ] Rate limit confirmed: 429 after 10 requests/min
- [ ] Auth guard confirmed: 401 on `/projects/:id/run-checks` without cookie
- [ ] Pagination confirmed: `GET /projects` returns `{ items, nextCursor, hasMore }`
- [ ] Real wallet BIP-322 sign+verify round-trip tested (see `BIP322_COMPAT.md`)
- [ ] Watcher reads `WATCH_INTERVAL_MS` from `.env` (not defaulting to 300s)
- [ ] Database backup taken before migration

### Nonce Store Decision: Redis vs Prisma

| Aspect | Redis | Prisma/SQLite |
|--------|-------|---------------|
| TTL support | Native TTL per key | `expiresAt` indexed field + periodic cleanup |
| Schema migration | None needed | Standard Prisma migration |
| Performance | Faster (in-memory) | Slower (disk I/O) |
| Infra dependency | New service to deploy + monitor | Already in stack |
| Ops overhead | Redis backup, monitoring, restarts | Cron/cleanup job for expired rows |

**Recommendation for testnet MVP:** Prisma/SQLite. No new infrastructure dependency.
Upgrade to Redis post-launch if restart frequency or scale warrants it.

**Implementation note:** Add an indexed `expiresAt` field to the nonce table. On each
nonce request, run cleanup:

```ts
await prisma.nonce.deleteMany({
  where: { expiresAt: { lt: new Date() } },
});
```

This keeps the nonce table small without requiring a separate cron process.

## Deploy Steps

- [ ] Run `pnpm install` in monorepo root
- [ ] Run `cd apps/api && npx prisma migrate deploy` (production migration)
- [ ] Run `cd apps/api && npx prisma db seed` (seed data)
- [ ] Start API: `pnpm --filter api start`
- [ ] Start watcher: `WATCH_INTERVAL_MS=30000 pnpm --filter watcher start`
- [ ] Start web: `pnpm --filter web start`
- [ ] Confirm watcher log shows `Interval: 30s`

## Rollback Steps

- [ ] Note previous git SHA before deploy
- [ ] To rollback: `git checkout <previous-sha>`
- [ ] Restore DB backup: `cp backup/dev.db apps/api/prisma/dev.db`
- [ ] Restart API, watcher, web with previous build
- [ ] Verify smoke test passes against rolled-back version

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Date | | | |
| Tester | | | |
| Backend | | | |
| Frontend | | | |
| Security | | | |
