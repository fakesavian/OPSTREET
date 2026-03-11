# Skill 05 — API Client Hygiene (Fix empty JSON body)

## Purpose
Eliminate backend errors like:
**“Body cannot be empty when content-type is set to application/json”**
by ensuring JSON requests have valid bodies or correct headers.

## Trigger
- Backend returns the above error
- Audit/pledge endpoints fail
- POST requests show `Content-Type: application/json` with no body

## Inputs
- Failing endpoint(s) (Network tab)
- Web fetch wrapper location

## Outputs
- Standardized request helper
- No request sends JSON header without JSON body

## Steps
1) **Find offenders**
   - `rg -n "Content-Type.*application/json" apps/web -S`
   - `rg -n "fetch\(" apps/web -S`
   - Inspect each POST/PUT/PATCH:
     - if `headers` includes JSON but `body` missing → fix

2) **Fix patterns**
   - If endpoint expects body: send `body: JSON.stringify({})` at minimum.
   - If endpoint expects no body: remove JSON content-type header entirely.

3) **Create/patch a shared client**
   - `apiFetch(path, { method, json })`
   - Only set JSON header when `json !== undefined`
   - Auto-stringify + set header when json exists

4) **Add dev guard**
   - If method in POST/PUT/PATCH and header JSON but body empty → throw (dev only)

5) **Verify**
   - Re-run failing flows (audit/pledge)
   - `pnpm --filter web typecheck`

## Done criteria
- No more “empty body” errors anywhere.
- Network tab shows JSON requests always have non-empty `Request Payload` when JSON header is set.

## Common failure modes
- Multiple fetch wrappers; fix the one actually used.
- FormData requests accidentally labeled JSON.

## Rollback plan
- If uncertain, add `JSON.stringify({})` first (safe) then refine.
