# OPFun Secure Launchpad — Debug Playbook

## Tools at a Glance

| Tool | Command | Purpose |
|------|---------|---------|
| ESLint | `pnpm lint` | Lint all workspaces (Next.js + echo stubs) |
| TypeScript | `pnpm typecheck` | Full monorepo type-check |
| Playwright | `pnpm test` | Browser smoke tests (requires dev server) |
| Gitleaks | `pnpm secrets:scan` | Scan staged+committed files for secrets |
| Prisma Studio | `pnpm --filter api exec prisma studio` | Browse SQLite DB in browser |
| API logs | `pnpm dev` then watch API pane | Fastify structured JSON logs |

---

## Runbook — Common Failure Scenarios

### 1. Project stuck in `CHECKING` status

**Cause:** API crashed or Bob MCP timed out mid-run.

**Fix (development):**
```bash
# Reset stale CHECKING projects to DRAFT
sqlite3 apps/api/prisma/dev.db \
  "UPDATE Project SET status='DRAFT' WHERE status='CHECKING';"
```

**Fix (startup):** Tracked as S4 — add CHECKING→DRAFT reset on API boot.

---

### 2. `postWatchEvent` returns 401

**Cause:** `ADMIN_SECRET` env var mismatch between watcher and API.

**Check:**
```bash
cat apps/watcher/.env          # ADMIN_SECRET=...
cat apps/api/.env              # ADMIN_SECRET=...
```
Both must match. The default `dev-secret-change-me` is fine for local dev.

---

### 3. Bob MCP times out (run-checks hangs)

**Cause:** Network issue or `https://ai.opnet.org/mcp` is unreachable.

**Symptoms:** Project stays `CHECKING` for >30 s.

**Debug:**
```bash
curl -s https://ai.opnet.org/mcp -o /dev/null -w "%{http_code}"
```
Expected: `200` or `405`. Any network error → Bob is down.

**Fallback:** The watcher posts a `WARN` event; the API auto-times-out via `Promise.race` after 30 s and sets status to `FLAGGED`.

---

### 4. Playwright smoke test fails — "Cannot find dev server"

**Cause:** Port 3000 already in use, or `pnpm --filter web dev` failed to start.

**Fix:**
```bash
# Kill whatever is on 3000
npx kill-port 3000
# Then re-run
pnpm test
```

Or start the dev server manually first (playwright.config reuses existing server):
```bash
pnpm dev      # keep running in one terminal
pnpm test     # run in another
```

---

### 5. Gitleaks reports false positive

1. Identify the rule ID from the scan output (e.g., `admin-secret-literal`).
2. Add the file path to `.gitleaks.toml` `[allowlist] paths`.
3. Re-run `pnpm secrets:scan` to confirm it's suppressed.

---

### 6. Prisma migration fails on Windows (`EPERM rename`)

**Cause:** `prisma generate` tries to replace a DLL locked by the running API.

**Fix:** Stop the API (`Ctrl+C`) before running `pnpm db:migrate`, then restart.

---

### 7. TypeScript errors after schema change

After editing `apps/api/prisma/schema.prisma`:
```bash
pnpm --filter api db:migrate      # applies migration + regenerates client
pnpm typecheck                    # should now pass
```

---

## ESLint — False Positive Suppression

Use inline comments sparingly:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const thing = foo as any;
```

Prefer proper types instead.

---

## Three-Strike Rule

If the same error occurs **3 times** (different attempts), stop and:
1. Open a new terminal and reproduce from scratch.
2. Check `docs/WORKTREES.md` for isolation via git worktrees.
3. Escalate — post a detailed error report with full stack traces.
