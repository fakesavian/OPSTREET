# OPFun Floor Policy

Rules of the floor and moderation standard operating procedures.

## What is Allowed

- Project callouts (announcements about token launches)
- Risk score discussion
- Honest project criticism
- Questions about OP_NET, deploying, and the platform
- Sharing links to public resources (faucets, explorers, docs)

## What is Forbidden

- Spam (repeated identical messages)
- Financial advice ("this will 100x", "buy now")
- Doxxing or personal attacks
- Scam links or phishing URLs
- Coordinated pump messaging
- Impersonating the OPFun team or project owners

## Auto-Mute Rules (Already Implemented)

- **3 messages per minute** from one address triggers a **5-minute auto-mute**
- Muted users receive a `403` response with message `"You are muted until [timestamp]"`
- Mute records stored in the `FloorParticipant.mutedUntil` DB field
- Auto-mutes reset automatically after the mute period expires

## Admin Escalation

- Admin reports come via the report button (P2 feature) or email `abuse@opfun.xyz`
- Admin reviews flagged content in the admin panel (P2 feature)
- Temporary manual mute: `POST /floor/admin/mute` with `{ walletAddress, durationMs }` (requires `x-admin-secret` header)
- Permanent ban: update `FloorParticipant` record directly in DB

## Manually Flagging a Project

Flag a project to hide it from the public feed:

```
POST /projects/:id/flag
Header: x-admin-secret: <ADMIN_SECRET>
```

This sets `project.status = "FLAGGED"` and removes it from the public feed.

To unflag:

```
POST /projects/:id/unflag
Header: x-admin-secret: <ADMIN_SECRET>
```

## Simulated Trading Disclaimer

**IMPORTANT:** All price charts, bonding curves, and pledge counts on OPFun reflect
**simulated paper activity**. No real funds are involved. No tokens have monetary value
until they are deployed to OP_NET mainnet and listed on a live exchange. OPFun is a
launch preparation and community engagement platform, not a trading platform.
