# OPFun Staging Process

How to spin up staging, run the smoke test, and promote to production.

## Spinning Up a Staging Environment

1. Copy `.env.example` to `.env` in `apps/api/` and `apps/watcher/` — fill in:
   - `DATABASE_URL="file:./staging.db"` (separate DB from prod)
   - `JWT_SECRET=<random 32+ chars>`
   - `CORS_ORIGIN=http://localhost:3000`
   - `WATCH_INTERVAL_MS=30000`
   - `OPNET_MNEMONIC=<testnet-only mnemonic — never use mainnet here>`
2. Run `pnpm install`
3. `cd apps/api && npx prisma migrate dev --name staging-init`
4. `cd apps/api && npx prisma db seed`
5. Start API on port 3001: `pnpm --filter api dev`
6. Start watcher: `pnpm --filter watcher dev`
7. Start web on port 3000: `pnpm --filter web dev`

## Running the Smoke Test

1. Follow `docs/TESTNET_SMOKE.md` — all 10 curl steps against `http://localhost:3001`
2. Additional staging-only checks:
   - **Real wallet auth:** Sign a BIP-322 message with Unisat/OKX, POST to `/auth/verify`, confirm session cookie
   - **Real deploy:** Set `OPNET_MNEMONIC`, POST `/projects/:id/confirm-deploy`, confirm status becomes `LAUNCHED`
   - **Watcher:** Confirm watcher log shows contract being monitored after launch

## Pass Criteria

All of the following must pass before promoting to production:

- [ ] All 10 `TESTNET_SMOKE.md` steps return expected status codes
- [ ] Real wallet BIP-322 auth round-trip works (Unisat OR OKX)
- [ ] `/projects/:id/run-checks` returns 401 without auth, 202 with valid session
- [ ] `GET /projects?limit=2` returns `{ items, nextCursor, hasMore }`
- [ ] Watcher log shows `Interval: 30s` (not 300s)
- [ ] At least one real deploy completes (`LAUNCHED` status + contractAddress in DB)
- [ ] Light mode on `/floor` is readable (no invisible text)

## Promoting to Production

1. Merge staging branch to `main` after all pass criteria met
2. Tag release: `git tag v0.1.0-testnet && git push --tags`
3. On production server: `git pull && pnpm install`
4. Run `cd apps/api && npx prisma migrate deploy` (NOT `migrate dev`)
5. Restart all services (API, watcher, web)
6. Run smoke test against production URL
7. Sign off the `RELEASE_CHECKLIST.md`
