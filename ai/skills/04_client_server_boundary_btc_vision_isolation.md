# Skill 04 — Client/Server Boundary (BTC Vision regression isolation)

## Purpose
Prevent server-only libraries (btc-vision / node crypto / fs) from being bundled into the browser, causing build/hydration/styling breakage.

## Trigger
- “Site broke after installing btc‑vision packages.”
- Vite/Next errors about `fs`, `crypto`, `Buffer`, `process`, hydration mismatch.

## Inputs
- Package name(s) installed (btc-vision, etc.)
- Build error output
- Suspected imports in apps/web

## Outputs
- Zero btc‑vision imports in client bundle
- All btc‑vision usage moved to `apps/api` or server-only modules
- Web build stable again

## Steps
1) **Find client imports**
   - `rg -n "btc-vision|btc\s*vision|vision\b" apps/web -S`
   - Also search shared packages:
     - `rg -n "btc-vision" packages -S`

2) **Check dependency placement**
   - If `apps/web/package.json` depends on btc‑vision → remove it from web
   - Keep it in `apps/api/package.json` only (or a server-only package)

3) **Create API façade**
   - Any web feature needing btc‑vision must call API routes:
     - `GET /vision/...`
     - `POST /vision/...`
   - Web never imports btc‑vision directly.

4) **Server-only guardrails**
   - Next: keep btc-vision in server routes only (not `"use client"`)
   - Vite: node-only deps must live in api, not web

5) **Rebuild and verify**
   - `pnpm --filter web dev`
   - `pnpm --filter web typecheck`
   - Check browser console for hydration issues.

## Done criteria
- Search finds **no btc‑vision** import in `apps/web` client code.
- Web builds and runs consistently.

## Common failure modes
- Indirect import through `packages/*` shared module.
- “Helper” file imported by both server and client.

## Rollback plan
- Temporarily stub API endpoints with fake data while isolating btc‑vision.
- Remove btc‑vision from web dependencies first.
