# Skill 15 — Entitlements / NFT Gating (Shop unlocks)

## Purpose
Implement a robust entitlement system for NFT-based unlocks:
Paint Set, Free Gallery Ticket, Art Dealer License, Clan Licenses, Illuminati license.

## Trigger
- “This feature requires owning X NFT”
- Need server-side checks and revocation story

## Inputs
- NFT ownership verification method (testnet)
- Entitlement catalog (keys + rules)
- Purchase/mint flows

## Outputs
- `entitlements` store (playerId + entitlementKey)
- Server-side guards for gated routes/actions
- Usage tracking (free mint ticket)

## Steps
1) **Define entitlement keys**
   - `PAINT_SET`
   - `GALLERY_FREE_MINT_TICKET`
   - `ART_DEALER_LICENSE`
   - `CLAN_LICENSE_CAMORA|GANG|MAFIA|FAMILY|ORG|FIRM`
   - `ILLUMINATI_LICENSE`

2) **Ownership verification**
   - v1: server records purchase/mint receipt
   - v2: verify on-chain holdings periodically + cache result
   - Never trust client-only claims.

3) **Guards**
   - API middleware:
     - `requireEntitlement("PAINT_SET")`
   - UI:
     - show locked state + CTA to shop

4) **Usage metering**
   - For free mint:
     - `usageCount` increments
     - deny when used up

5) **Revocation**
   - If NFT transferred:
     - entitlement becomes inactive after next verification sync
   - Make UX clear.

## Done criteria
- Locked features cannot be used without entitlement (server blocks).
- UI reflects owned/not owned states.

## Common failure modes
- Only checking on client (bypassable)
- No usage tracking for one-time tickets

## Rollback plan
- Gate by server-recorded receipts first, then add on-chain verification later.
