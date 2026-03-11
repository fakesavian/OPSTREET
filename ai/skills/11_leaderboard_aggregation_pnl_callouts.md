# Skill 11 — Leaderboard Aggregation (PnL + Callout Multiples)

## Purpose
Build scalable leaderboards for players: Top Earners, Best Callouts, Trending Players.

## Trigger
- Implementing leaderboards
- Need ranking pages and API endpoints

## Inputs
- Trade events model
- Callout model + price series
- Desired time windows (7D/30D/All)

## Outputs
- Aggregated stats tables/rollups
- API endpoints returning leaderboard rows
- UI page with tabs and profile drawer

## Steps
1) **Define stat fields**
   - realizedPnL
   - totalTrades
   - winRate
   - bestTradeMultiple
   - calloutBestMultiple / avgMultiple / hitRate

2) **Choose aggregation strategy**
   - v1: recompute job every N minutes
   - v2: event-driven updates per trade/callout grade

3) **Implement callout grading**
   - entry price at callout time
   - peak within window
   - store multiple + window + gradingVersion

4) **Store rollups**
   - `playerStats` per window:
     - all_time, 30d, 7d
   - Index by (playerId, window)

5) **API endpoints**
   - `GET /leaderboards/earners?range=7d|30d|all`
   - `GET /leaderboards/callouts?range=...`
   - `GET /leaderboards/trending?range=...`

6) **UI**
   - Table/list with rank, address/handle, key stats, badges
   - Profile drawer: highlights + recent activity

## Done criteria
- Leaderboards render with realistic seeded data.
- Stats update when new trades/callouts added.

## Common failure modes
- Computing heavy aggregates on every request (slow)
- Ranking by deposits instead of realized PnL

## Rollback plan
- Cache rollups and add manual recompute endpoint during dev.
