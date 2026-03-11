# Skill 01 — Repo Navigation + Route Discovery (pnpm monorepo)

## Purpose
Quickly identify **where to make changes** in a pnpm monorepo (apps/web + apps/api + packages), including routes, layouts, shared UI, API clients, and env config.

## Trigger
- “Where is this page/component coming from?”
- “Which file controls this route?”
- “I changed something but it doesn’t show up.”
- “Need to find the API call / auth guard / layout wrapper.”

## Inputs
- Repo root path
- Page/feature name (e.g., “Token page”, “Trading Floor”, “Docs”, “Create Coin”)
- Stack specifics (Next/Vite/React Router/etc.) if known

## Outputs
- List of **exact files** to edit (route + component + styles + API client)
- Confirmed local run commands
- Map of relevant modules (web ↔ api ↔ packages)

## Steps (do in order)
1) **Confirm workspace layout**
   - `ls`
   - `cat pnpm-workspace.yaml`
   - `ls apps && ls packages`

2) **Find the web framework + routing system**
   - `cat apps/web/package.json`
   - Look for: `next`, `react-router`, `vite`, `remix`, `tanstack/router`
   - Then locate routing directory:
     - Next App Router: `apps/web/app/**/page.tsx`
     - Next Pages Router: `apps/web/pages/**`
     - React Router: `apps/web/src/routes` or `apps/web/src/App.tsx`

3) **Route discovery**
   - Use ripgrep:
     - `rg -n "token|Token|\[token\]|:token|/token" apps/web -S`
     - `rg -n "Trading Floor|floor|Enter.*Floor" apps/web -S`
     - `rg -n "Docs|documentation" apps/web -S`

4) **Layout discovery**
   - Next: `apps/web/app/layout.tsx` (+ nested layouts)
   - Vite/React: `apps/web/src/App.tsx`, `apps/web/src/layouts/**`

5) **Shared UI discovery**
   - `rg -n "FrameShell|Panel|Pill|Button" apps/web packages -S`
   - Inspect UI folders:
     - `apps/web/src/components/**`
     - `packages/ui/**`

6) **API client discovery**
   - `rg -n "fetch\(|axios\(|ky\(|apiClient|Authorization" apps/web -S`
   - Identify:
     - base URL config
     - auth header injection
     - error handling
     - JSON body rules

7) **Server/API module discovery**
   - `cat apps/api/package.json`
   - `rg -n "router|routes|fastify|express|hono|trpc" apps/api -S`
   - Find the endpoint that matches the web call.

8) **Run commands / sanity checks**
   - `pnpm install`
   - `pnpm --filter web dev`
   - `pnpm --filter api dev`
   - `pnpm --filter web typecheck`
   - `pnpm --filter api typecheck`

## Done criteria
- You can answer: “This UI comes from X, this route is Y, this fetch goes to Z endpoint.”
- You can run web + api locally and reproduce the issue.

## Common failure modes
- Grepping the wrong root (use repo root).
- Next App Router confusion (routes are folders).
- Aliases hide imports (`@/`); inspect `tsconfig.json` / `vite.config`.

## Rollback plan
- Use `git status` + `git checkout -- <files>` if exploration changes anything.
