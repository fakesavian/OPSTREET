# Skill 06 — Auth Handshake (Wallet connected ≠ authenticated)

## Purpose
Fix “authentication required” loops by implementing a proper sign-in step:
nonce → sign → verify → JWT → gate routes.

## Trigger
- UI shows wallet connected but actions return “authentication required”
- API endpoints require auth token but web never sends it

## Inputs
- Wallet provider (Unisat/OKX)
- Auth-required endpoints
- Server framework in `apps/api`

## Outputs
- Working sign-in flow
- JWT stored and sent with `Authorization: Bearer <token>`
- Protected endpoints correctly gated

## Steps
1) **Define flow**
   - `GET /auth/nonce?address=...` → returns nonce + message
   - Client signs message
   - `POST /auth/verify` → returns JWT
   - Client stores JWT
   - Client attaches JWT to API calls

2) **Implement API routes**
   - `GET /auth/nonce`
     - create nonce (random), store with TTL (5 min), bind to address
   - `POST /auth/verify`
     - verify signature (BIP-322 for taproot)
     - issue JWT with address + expiry

3) **Add middleware**
   - `requireAuth` checks:
     - Authorization header present
     - JWT valid
     - attaches `req.playerId` / `ctx.playerId`

4) **Front-end integration**
   - When wallet connects, immediately start sign-in:
     - fetch nonce → sign → verify → store token
   - Add `apiFetch` wrapper to add Authorization header automatically.

5) **UX**
   - Show auth state:
     - Connected ✅
     - Signed-in ✅
   - If token expires, re-run sign-in.

## Done criteria
- No “authentication required” when wallet is connected + signed-in.
- Protected API calls succeed with Authorization header.

## Common failure modes
- Wallet connect event doesn’t trigger sign-in
- JWT stored but not attached to requests
- Nonce replay allowed (must invalidate after verify)

## Rollback plan
- Temporarily gate endpoints by address-only in dev, but keep JWT scaffolding.
