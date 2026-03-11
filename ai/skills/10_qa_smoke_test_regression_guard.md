# Skill 10 — QA + Smoke Tests (Regression Guard)

## Purpose
Avoid breaking builds and core flows while iterating quickly.

## Trigger
- After any UI/auth/API change
- Before merging changes or handing off

## Inputs
- Repo root
- Must-pass flows list (MVP)

## Outputs
- Quick pass/fail report
- Screenshots for key pages
- Typecheck and runtime sanity

## Steps
1) **Typecheck**
   - `pnpm --filter web typecheck`
   - `pnpm --filter api typecheck`

2) **Run dev**
   - `pnpm --filter api dev`
   - `pnpm --filter web dev`

3) **Smoke flows**
   - Landing loads (desktop + mobile)
   - Wallet connect + sign-in succeeds (token present)
   - Create coin flow reaches success screen
   - Audit/pledge calls do not error with empty body
   - Token page chart is interactive
   - Floor enter spawns avatar

4) **Capture screenshots**
   - Desktop @1440: landing, token page
   - Mobile @390: landing, token page

5) **Check console**
   - No hydration mismatch errors
   - No unhandled promise rejections

## Done criteria
- All must-pass flows succeed.
- No typecheck errors.

## Common failure modes
- Only testing desktop
- Ignoring network errors
- Skipping typecheck

## Rollback plan
- Revert last commit(s) or isolate feature behind a flag.
