# Skill 12 — Badges/Achievements Event Engine (Idempotent)

## Purpose
Award badges based on events (trades, PnL milestones, deposits, callout hits) in a way that is **idempotent** and easy to extend.

## Trigger
- “First Trade”, “100 Trades”, “Earned $1M”, “First 10x callout” etc.

## Inputs
- Event sources (trades, deposits, callout grades)
- Badge definitions (data-driven JSON)

## Outputs
- `badges` table + `badgeAwards` table
- Badge awarding function
- UI badge display on profiles/leaderboards

## Steps
1) **Data model**
   - `badges`: definitions
   - `badgeAwards`: (playerId, badgeId) with unique constraint

2) **Define criteria schema**
   - Example:
     - `{ type: "trade_count", gte: 10 }`
     - `{ type: "pnl_realized", gteUsd: 1000000 }`
     - `{ type: "callout_multiple", gte: 10 }`

3) **Awarding pipeline**
   - On event:
     - compute current counters
     - find eligible badges
     - insert awards with ON CONFLICT DO NOTHING

4) **Expose API**
   - `GET /players/:id/badges`

5) **UI**
   - badge grid + tooltip
   - top badges row

## Done criteria
- Awards occur exactly once per badge.
- Adding a new badge requires only data change.

## Common failure modes
- Duplicates (missing unique constraint)
- Race conditions (fix with DB constraints)

## Rollback plan
- Disable auto-award and run a backfill job after fixes.
