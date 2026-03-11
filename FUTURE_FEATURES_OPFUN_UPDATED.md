# OPFun Secure Launchpad — Future Features Backlog (Game Spec)

> Purpose: keep a **single source of truth** for the “next features” so any AI coding agent can pick this up and implement consistently.
>
> Suggested location in repo:  
> `D:\2025\user\Aicode\opfun-secure-launchpad\docs\FUTURE_FEATURES.md`  
> (Create `/docs` if it doesn’t exist.)

---

## Current Implementation Snapshot (2026-03-07)

This snapshot reflects what is actually implemented in the repository today. The detailed feature sections below still describe the intended end state.

### Status Legend

- `Live`: user-facing API and UI are wired and backed by persistent state.
- `Partial`: meaningful implementation exists, but the full feature spec is not complete.
- `Prototype`: a limited version exists, usually with simplified storage or simulated data.
- `Scaffolded`: schema, entitlements, or placeholder UI copy exists without real workflows.
- `Not started`: no meaningful implementation was found in the repo.

| # | Feature | Status | Current repo state |
| --- | --- | --- | --- |
| 1 | Player Leaderboards | Partial | Earners, callouts, and trending endpoints plus `/leaderboards` UI are implemented. Rankings are based on `simTrade` data and deterministic `calloutGrade` records, not real on-chain history. |
| 2 | Badge / Achievements System | Partial | Badge definitions, awards, profile display, auth achievement badges, and avatar unlock hooks exist. Coverage is limited and does not include deposit-based rewards. |
| 3 | Camora Clan System | Prototype | Clan create/join/leave, license gating, and a clan directory page exist. State is stored in `data/clans.json`; no pooled capital, leader trading, or profit distribution is implemented. |
| 4 | Player Titles + Level Progression | Partial | XP, level, and title recomputation are live and shown in leaderboards/player profiles. Triggers currently come from project creation, SIM trades, and graded callouts only. |
| 5 | Reputation / Trust Score | Partial | `trustScore` is computed server-side and displayed in leaderboard/profile views. Inputs are limited to account age, activity, signal quality, and chat spam counts. |
| 6 | Follow + Copy-Trade System | Not started | No follow graph, copy-trade engine, wallet mirroring, or route/UI surface exists. |
| 7 | Token Achievements | Not started | Project status, pledges, and watch events exist, but there is no token-story achievement system or token milestone UI. |
| 8 | Cosmetics Store | Prototype | Shop, wallet inventory, sprite selection, and item activation exist. Cosmetic depth is limited to sprites and entitlements; no broader profile/UI flair system exists yet. |
| 9 | Clan Wars + Clan Governance | Not started | No clan war logic, governance data model, voting routes, or member decision flow exists. Existing governance references are display copy only. |
| 10 | Role System Inside High-Rank Camoras | Not started | Clan records only distinguish owner versus member. No rank tiers, delegated permissions, or internal role system exists. |
| 11 | NFT Art Gallery | Scaffolded | `PAINT_SET` and `GALLERY_TICKET` entitlements exist in the shop, but there is no gallery page, NFT mint flow, or display/sales system. |
| 12 | Shop (NFT items unlock game features) | Prototype | Shop mint/use APIs and frontend are live, but the receipts are simulated and stored in JSON-backed wallet inventory rather than true NFT ownership. |
| 13 | Camora License System | Partial | `CLAN_FORMATION_LICENSE` exists and gates clan creation. Tiered license sizes, personal trading floors, and clan scaling rules are not implemented. |
| 14 | Illuminati Tier | Not started | No Illuminati tier logic, private hideout system, or hideout customization exists. |

### Cross-Cutting Notes

- Features 1, 2, 4, and 5 are built on simulated trade data and deterministic callout grading, not real trading.
- Features 3, 8, 11, 12, and 13 currently mix Prisma with JSON-file prototype storage and simulated receipts.
- Several future concepts already appear in the Prisma schema, but schema presence should not be treated as a completed implementation.
- Use the status table above as the source of truth for current state.

---

## Terms (locked language)
- **Game** = this whole OPFun experience (testnet-first).
- **Player** = an individual wallet identity (tb1p… on OP_NET testnet).
- **Callout** = a player’s signal/opinion/event posted to the feed (ex: “this token is fire”).
- **PnL / Earnings** = **profit made from trading**, not deposited amount.
- **Camora** = clan/guild system where players pool capital and a leader trades on behalf of the group.
- **License** = an NFT-gated or purchase-gated entitlement that unlocks features/areas.

---

## Global rules / product constraints
- Testnet first. If a concept is “real-money like,” make it explicit whether it’s **simulated** or **testnet-real**.
- All leaderboards must show **earnings (PnL)**, not deposits.
- All “fees” must be transparent (shown before action) and recorded as events.
- Store enough event history to audit outcomes (leader actions, pool changes, badge triggers).
- Any NFT-gated feature must have:
  - clear “what you get”
  - a revocation story (if NFT sold/transferred)
  - server-side checks (don’t trust client only)

---

# Feature 1 — Player Leaderboards

## Goal
Create competitive leaderboards for players based on **performance and signal quality**, not just activity.

## Core leaderboard views
1) **Top Earners (All-time / 7D / 30D)**
- Rank players by **Realized PnL** (earnings from trading).
- Display:
  - Player handle (or shortened address)
  - Realized PnL (sats / USD equivalent if shown)
  - Win rate %
  - Total trades
  - Best trade multiple (ex: 10x)
  - Badges count / top badge icons

2) **Best Callouts (Signal Leaderboard)**
- Rank players by “callout performance”
- Display:
  - Best callout multiple (2x / 3x / 4x / 10x / 40x)
  - Avg callout multiple
  - # of callouts graded
  - Hit rate (callouts that went ≥2x)

3) **Trending Players (Momentum)**
- A composite “hot score” for recent performance:
  - Recent PnL + recent callout hits + activity, weighted
- Used for the trading room “screens” and discovery.

## What “callout multiple” means (define it now)
Grade callouts based on token performance after the callout timestamp.

Suggested grading:
- Inputs:
  - `callout.createdAt`
  - `callout.tokenId`
  - price series (simulated or oracle)
- Compute:
  - `calloutEntryPrice = priceAt(createdAt)`
  - `peakPriceWithinWindow = max(price between createdAt and createdAt+window)`
  - `multiple = peakPriceWithinWindow / calloutEntryPrice`
- Default window: **7 days** (configurable)
- Store:
  - `multiple`
  - `peakAt`
  - `windowUsed`
  - `gradingVersion`

> Notes:
> - This rewards “caught the pump” behavior even if the caller didn’t personally trade it.
> - Later: only grade if the caller opened a position within X minutes.

## Data to store (minimum)
- Player profile:
  - `playerId` (address), optional username, avatar, createdAt
- Trades:
  - `tradeId`, `playerId`, token, side, amount, entry/exit, realizedPnL, timestamp
- Callouts:
  - `calloutId`, `playerId`, token, content, createdAt
- Callout grades:
  - `calloutId`, `multiple`, `peakAt`, `window`, `gradedAt`, `gradingVersion`
- Aggregated stats (precomputed):
  - `playerStats` (all-time + rolling windows)

## API endpoints (suggested)
- `GET /leaderboards/earners?range=7d|30d|all`
- `GET /leaderboards/callouts?range=7d|30d|all`
- `GET /leaderboards/trending?range=24h|7d`
- `GET /players/:playerId` → profile + stats + recent activity
- `GET /players/:playerId/callouts` → callouts + grades

## UI requirements
- Leaderboard page with tabs:
  - Earners / Callouts / Trending
- Each row has a “profile drawer”:
  - address + badges + highlights (best multiple, total earned)
- Include “SIMULATED” badge where appropriate.

## Acceptance criteria
- A player can see their rank and stats.
- Leaderboards update as new trades/callouts happen.
- Callout multiples show clearly (2x / 3x / 10x / 40x).
- “Earnings” means realized PnL only.

---

# Feature 2 — Badge / Achievements System

## Goal
Give players achievements that reward milestones and skill.

## Badge categories
### Trading milestones
- First Trade
- 10 Trades
- 100 Trades
- 1,000 Trades

### Earnings milestones (profit, not deposit)
- Earned $1,000 (or equivalent sats)
- Earned $10,000
- Earned $100,000
- Earned $1,000,000

### Deposit milestones (separate badges)
- Deposited $1,000
- Deposited $10,000
- Deposited $100,000
- Deposited $1,000,000

### Signal/callout badges
- First Graded Callout
- First 2x Callout
- First 10x Callout
- First 40x Callout
- 10 callouts graded with avg ≥2x

## Badge rules
- Badges are **event-driven**: awarded when a trigger condition is met.
- Awarding should be idempotent (no duplicates).
- Badge definitions are data (easy to add new ones without code changes).

## Data model (minimum)
- `badges` table:
  - `badgeId`, `name`, `description`, `category`, `tier`, `iconKey`
  - `criteria` (json)
- `badgeAwards` table:
  - `playerId`, `badgeId`, `awardedAt`, `sourceEventId`

## UI requirements
- Player profile shows:
  - “Top badges” row
  - Full badges grid
- Badge tooltips show what triggered it.

## Acceptance criteria
- Badges award automatically off trades/callout grades/deposits.
- Player profile displays badges instantly after award.

---

# Feature 3 — Camora Clan System (Pooling + Leader Trading)

## Goal
Players form clans (**Camoras**) to pool capital. A **Clan Leader** trades a shared pool and members earn profits **pro-rata** based on their % contribution.

## Core concepts
- **Camora**: a clan with members, a leader, and a pool.
- **Pool**: combined contributions tracked by member shares.
- **Leader trading**: leader executes trades using the pool (not members’ personal wallets).
- **Profit distribution**: members earn based on share of pool.

## Clan sizes (base v1)
- Default (small) Camora: **up to 5 members**
- Growth beyond that is handled by **Camora Licenses** (see Feature 13).

## Monetization (platform fees)
1) **Trading activity fee**
- Fee charged per clan pool trade (configurable % or flat).
- Logged as an event and visible to members.

2) **Clan size upgrades**
- Paid via clan licenses (see Feature 13).

3) **Promotion slots**
- Clan can pay to promote on:
  - “Trading room floor”
  - “TV screens” (rotating featured clan panels)
- Pricing and duration configurable.

## Pool accounting rule (locked)
If pool = $1,000 and a member contributed $100 → they own **10%** of the pool.  
If pool PnL = +100% → that member earns **10% of the profit**, net of fees.

### Important nuance (recommended)
Track pool shares as **units** so deposits/withdrawals don’t break fairness:
- When someone deposits, mint them “pool shares” at current NAV.
- When they withdraw, burn shares.
- Profits increase NAV, not shares.

## Safety constraints (v1)
- Leader can trade the pool, but:
  - Every trade is logged and visible.
  - Members can withdraw their contribution (optional cooldown).
- Clear disclaimers:
  - “Clan leader controls pool trades”
  - “Members are exposed to leader decisions”

## Data to store (minimum)
- `clans`:
  - `clanId`, `name`, `leaderPlayerId`, `createdAt`, `maxMembers`, `status`, `tier`
- `clanMembers`:
  - `clanId`, `playerId`, `role` (leader/member), `joinedAt`
- `clanPoolContributions`:
  - `clanId`, `playerId`, `amount`, `asset` (BTC/MOTO), `timestamp`
- `clanPoolTrades`:
  - `clanId`, `tradeId`, `token`, `side`, `size`, `entry`, `exit`, `realizedPnL`, `timestamp`
- `clanDistributions`:
  - `clanId`, `epochId`, `totalPnL`, `fees`, `memberPayouts[]`, `timestamp`
- `clanPromotions`:
  - `clanId`, `placement` (floor/screen), `startAt`, `endAt`, `paidAsset`, `paidAmount`

## API endpoints (suggested)
- `POST /clans` create clan
- `POST /clans/:id/join`
- `POST /clans/:id/leave`
- `POST /clans/:id/contribute`
- `POST /clans/:id/withdraw`
- `POST /clans/:id/trade` (leader-only)
- `POST /clans/:id/promote` (leader-only)
- `GET /clans/:id` details + members + pool stats
- `GET /clans/:id/ledger` contributions + trades + fees + distributions

## UI requirements
- “Camora” page:
  - Create / Join
  - Clan profile (leader, members, tier, pool size)
  - Contributions breakdown (% ownership)
  - Trade history (leader actions)
  - Distribution history (who earned what)

## Acceptance criteria
- Players can create/join a Camora.
- Members can contribute and see % ownership.
- Leader can trade, and earnings distribute pro-rata.
- Fees are charged and recorded.

---

# Feature 4 — Player Titles + Level Progression

## Goal
Give each player a visible “rank” and progression track to reinforce the game loop.

## Mechanics
- **Player Level (XP)** earned via:
  - trades executed
  - callouts posted + graded callouts
  - clan activity (if in Camora)
- **Titles** unlocked at level milestones (ex: Rookie → Operator → Whale → Legend).
- Titles show on:
  - leaderboard rows
  - profile header
  - trading room callouts

## Data (minimum)
- `playerProgress`:
  - `playerId`, `xp`, `level`, `titleKey`, `updatedAt`
- `xpEvents`:
  - `eventId`, `playerId`, `type`, `amount`, `createdAt`

## Acceptance criteria
- XP increments on actions.
- Title updates at thresholds.
- UI displays title everywhere player appears.

---

# Feature 5 — Reputation / Trust Score

## Goal
Reduce spam and raise quality by scoring players on behavior + signal performance.

## Inputs (v1)
- Account age / time on platform
- Callout hit rate
- Report rate / moderation flags
- Trade completion consistency
- Verified actions (signature-auth’d sessions)

## Outputs
- `trustScore` 0–100
- Affects:
  - visibility weighting on “Trending Players”
  - callout posting limits
  - eligibility for higher-tier clan roles/licenses (optional)

## Data
- `playerReputation`:
  - `playerId`, `trustScore`, `components` (json), `updatedAt`

## Acceptance criteria
- Trust score is computed and displayed (small badge).
- Low-trust players get rate-limited / de-boosted.

---

# Feature 6 — Follow + Copy-Trade System (Opt-in)

## Goal
Let players follow high performers and optionally mirror their trades (simulated first).

## Mechanics
- Follow/unfollow players
- “Watchlist” feed: trades + callouts from followed players
- **Copy-trade**:
  - opt-in per followed player
  - configurable % sizing
  - simulated mode first, then testnet execution later

## Data
- `follows`:
  - `followerId`, `followedId`, `createdAt`
- `copySettings`:
  - `playerId`, `followedId`, `mode` (off/sim/testnet), `sizePct`, `maxPerDay`

## Acceptance criteria
- Following updates personalized feed.
- Copy trade can run in SIM without breaking existing trade logic.

---

# Feature 7 — Token Achievements (Tokens have “story”)

## Goal
Give each token achievements that show its reputation and highlight fun/meta stats.

## Examples
- “Most Called Out (7D)”
- “Graduated”
- “Most Volatile”
- “Whale Magnet”
- “Rug Suspected” (if risk rules trigger)

## Data
- `tokenAchievements`:
  - `tokenId`, `achievements[]`, `updatedAt`

## Acceptance criteria
- Token page shows achievements row/badges.
- Trending page can sort/filter by achievements.

---

# Feature 8 — Cosmetics Store (Profile + UI Flair)

## Goal
Sell cosmetic upgrades that don’t affect trading outcomes.

## Items
- Profile borders
- Nameplates
- Emotes / reactions for callouts
- “TV screen” animation frames
- Clan banners (for Camoras)

## Economy
- Purchasable with BTC/MOTO (or simulated in testnet mode).
- Items can be NFTs or just in-app entitlements (configurable).

## Acceptance criteria
- Player can buy/equip cosmetics.
- Cosmetics display in feed/leaderboard/profile.

---

# Feature 9 — Clan Wars + Clan Governance

## 9A) Clan Wars (Camora vs Camora)

### Goal
Weekly competitions between Camoras for bragging rights, rank, and perks.

### Formats (v1)
- Highest clan PnL (7D)
- Best callout hit rate (7D)
- Most volume (7D)

### Rewards
- Trophy badge for clan
- Featured slot on TV screens
- Cosmetic banner/skin unlock

### Data
- `clanWars`:
  - `warId`, `seasonId`, `metric`, `startAt`, `endAt`
- `clanWarResults`:
  - `warId`, `clanId`, `score`, `rank`

### Acceptance criteria
- War scoreboard exists and updates.
- Winners appear in TV placements.

## 9B) Clan Treasury Governance

### Goal
Members can vote on guardrails for leader behavior (especially for larger clans).

### Governable settings (v1)
- allowed tokens list
- max position size
- max trades per day
- risk tolerance preset

### Data
- `clanGovernanceProposals`:
  - `proposalId`, `clanId`, `type`, `payload`, `createdAt`, `endsAt`
- `clanVotes`:
  - `proposalId`, `playerId`, `vote`, `weight`

### Acceptance criteria
- Proposals can be created and voted.
- Winning proposals apply settings.

---

# Feature 10 — Role System Inside High-Rank Camoras (Tier Gated)

## Goal
Add roles, but only unlock them for **larger / higher-rank Camoras** (not base 5-member).

## Roles (suggested)
- Leader (always)
- Analyst (can post “official” clan callouts)
- Treasurer (can manage contributions/distributions UI actions)
- Recruiter (can invite/approve members)
- Moderator (can manage clan chat/callouts)

## Gate rule (locked)
- Roles beyond “Leader/Member” only unlock at **Gang tier or higher** (see Feature 13).

## Data
- `clanMemberRoles`:
  - `clanId`, `playerId`, `role`, `grantedAt`

## Acceptance criteria
- Role UI appears only for clans with tier >= Gang.
- Permissions enforce server-side.

---

# Feature 11 — NFT Art Gallery

## Goal
Add an in-game art space where players showcase and sell art.

## Core loop
- Players create art (see Paint Set, Feature 12).
- Players mint or list art into the Gallery.
- Other players browse, collect, and buy.
- The game takes a **sales fee** (platform rake).

## Gallery features
- Browse grid + detail modal
- Artist profile pages
- Filters: newest, top sales, trending, price, artist, clan
- “Featured wall” placements purchasable (optional)

## Data (minimum)
- `artworks`:
  - `artId`, `creatorPlayerId`, `title`, `description`, `imageUrl`, `createdAt`
  - `nftTokenId` (optional), `collection`, `chain`
- `artListings`:
  - `listingId`, `artId`, `price`, `asset`, `status`, `createdAt`
- `artSales`:
  - `saleId`, `listingId`, `buyerPlayerId`, `price`, `feePaid`, `createdAt`

## Acceptance criteria
- Gallery page is live.
- Players can view listings and purchases.
- Fees are recorded.

---

# Feature 12 — Shop (NFT items unlock game features)

## Goal
A Shop where NFTs act like “tickets/licenses” that unlock mechanics and areas.

## Shop inventory (locked items)
1) **Paint Set**
- Unlocks:
  - NFT minting ability (for created art)
  - In-app **MS Paint simulator**
- Notes:
  - Paint app should be usable without minting, but minting is Paint Set gated (or vice versa—decide later).

2) **Free Art Gallery Ticket**
- Grants:
  - one free mint (a “free gallery entry”)
- Constraints:
  - Track usage so it can’t be reused infinitely.

3) **Art Dealer License**
- Allows a player to:
  - post/list art in the Gallery (things they made in Paint)
  - sell to other players
- Platform takes a sales fee.

## Data
- `entitlements`:
  - `playerId`, `entitlementKey`, `source` (NFT/receipt/admin), `active`, `updatedAt`
- `entitlementUsage`:
  - `playerId`, `entitlementKey`, `usageCount`, `lastUsedAt`

## Acceptance criteria
- Shop displays items + “owned” state.
- Server checks entitlement before enabling features.
- Art Dealer can list; non-dealers cannot.

---

# Feature 13 — Camora License System (Tier Names, Sizes, Personal Trading Floors)

## Goal
Clan “tier tickets” (purchased by the leader only) that:
1) increase max clan size
2) unlock a **personal trading floor** environment themed by tier

## Tier ladder (locked names)
Each tier **doubles** max members starting from 5.

- **Camora** — 5 members (cheapest)
- **Gang** — 10 members
- **Mafia** — 20 members
- **Family** — 40 members
- **Organization** — 80 members
- **Firm** — 160 members

Rules:
- Only the **leader** needs to buy the license.
- Members can join without buying.
- License controls access to tier-specific leader functions + the personal trading floor.

## Personal trading floor themes (locked)
- Camora → **garage**
- Gang → **warehouse**
- Mafia → **club back room**
- Family → **Godfather woodgrain offices**
- Organization → **office**
- Firm → **super lux penthouse**

Each environment should visually scale to accommodate the tier’s max members.

## Data
- `clanLicenses`:
  - `clanId`, `tier`, `ownedByPlayerId`, `purchasedAt`, `asset`, `amount`
- `clanFloorInstances`:
  - `clanId`, `tier`, `sceneKey`, `createdAt`, `config` (json)

## Acceptance criteria
- Leader can purchase/upgrade tier.
- MaxMembers updates immediately.
- Personal floor route becomes available and uses the correct scene theme.

---

# Feature 14 — Illuminati Tier (Ultimate Clan + Hideout Customization)

## Goal
The highest, most expensive tier with special requirements + unlimited clan size.

## Requirements (locked)
- Requires **5 players** who each hold an **Illuminati License** NFT.
- Once requirement is met, an **Illuminati clan** can be formed or upgraded into.
- Clan has **no member limit**.

## Unlocks
- **Hideout customization** feature:
  - customize clan HQ visuals (furniture, screens, banners, lighting, etc.)
  - cosmetic-only (no trading advantage)

## Data
- `illuminatiLicenses`:
  - `playerId`, `owned`, `verifiedAt`
- `clanHideout`:
  - `clanId`, `layout`, `decor`, `updatedAt`

## Acceptance criteria
- System verifies 5 license-holders before enabling Illuminati tier.
- Illuminati clans have unlimited members.
- Hideout customization UI exists and persists settings.

---

# Open questions (fill later, but don’t block v1)
- Are deposits testnet-real, simulated, or both?
- What assets are supported for Shop/Licenses (BTC, MOTO, both)?
- How often are Camora distributions calculated (real-time, daily, manual “settle”)?
- Do members have a cooldown for withdrawals?
- Do we show USD equivalents or sats-only?

---

# Implementation notes for AI agents
- Keep features modular:
  - `/apps/api/src/modules/leaderboards/*`
  - `/apps/api/src/modules/badges/*`
  - `/apps/api/src/modules/clans/*`
  - `/apps/api/src/modules/shop/*`
  - `/apps/api/src/modules/gallery/*`
- Prefer event-driven updates:
  - Trade executed → update playerStats → check badge triggers → update trustScore
  - Callout graded → update calloutStats → check badge triggers
  - Clan trade executed → update clanPool → record fees → update clan wars + clan leaderboard
- Always enforce entitlements server-side.
- Seed scripts are mandatory for UI testing (fake players, fake callouts, fake clan wars, fake gallery listings).
