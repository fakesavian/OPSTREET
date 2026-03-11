# Skill 09 — State Persistence (Avatar + Floor Presence)

## Purpose
Fix “Enter the Floor” not populating avatar/character by ensuring player profile persists and presence join payload is correct.

## Trigger
- Enter Trading Floor shows empty character
- Avatar choice doesn’t persist across refresh
- Presence list missing the player

## Inputs
- Floor route/component
- Storage method (localStorage/DB)
- Presence system (websocket/pusher/etc.)

## Outputs
- Player profile persisted (name, avatarId, cosmetics)
- Floor join sends correct payload
- Floor renders avatar reliably

## Steps
1) **Find floor entry flow**
   - `rg -n "Enter Trading Floor|Enter.*Floor|/floor" apps/web -S`
   - Locate click handler and navigation.

2) **Persist player profile**
   - v1: store in localStorage:
     - `{ address, displayName, avatarId }`
   - v2: store server-side in `players` table keyed by address.

3) **Join payload**
   - When entering floor, send:
     - address/playerId
     - displayName
     - avatarId
     - clanId (optional)
   - Ensure server echoes and broadcasts.

4) **Render**
   - Floor scene uses profile state (rehydrated)
   - If missing, show setup modal (choose name/avatar) then retry join.

5) **Recovery**
   - On websocket disconnect: rejoin with same payload.

## Done criteria
- Enter floor always spawns your avatar after wallet connect + sign-in.
- Refresh keeps your avatar.

## Common failure modes
- Profile stored but not loaded before join
- Race condition with auth token
- Server presence expects different field names

## Rollback plan
- Temporarily default to a placeholder avatar (with warning) to avoid blank state.
