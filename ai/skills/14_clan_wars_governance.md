# Skill 14 — Clan Wars + Clan Governance

## Purpose
Add competitive clan-vs-clan loops and guardrails for leaders.

## Trigger
- Weekly competitions required (PnL/volume/hit rate)
- Members want voting on limits/settings

## Inputs
- Clan stats rollups
- Governance config types

## Outputs
- Clan wars schedule + results
- Governance proposal/vote/apply system

## Steps
1) **Clan wars**
   - Define season calendar (weekly)
   - Metrics:
     - clan PnL
     - callout hit rate
     - volume
   - Compute scores from rollups
   - Persist results and winners
   - Integrate with “TV screens” / featured slots

2) **Governance**
   - Proposal types:
     - allowed tokens list
     - max position size
     - max trades/day
     - risk preset
   - Voting:
     - one-player-one-vote OR weighted by shares (choose one)
   - Apply:
     - store active settings per clan
     - enforce settings in trade endpoint

## Done criteria
- Clan war leaderboard updates and winners display.
- Governance settings actually restrict leader actions.

## Common failure modes
- Governance exists but isn’t enforced
- Wars computed on request (slow)

## Rollback plan
- Keep wars read-only and governance “advisory” until enforcement stable.
