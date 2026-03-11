# Agent Orchestration Brief (Foundation Wave)

This brief maps implementation lanes to local skills in `ai/skills`.

## Skill mapping

- `ai/skills/06_auth_handshake_wallet_connected_not_authed.md`
  - Applied to auth session enforcement for project create and floor write endpoints.
- `ai/skills/07_taproot_bip322_verification.md`
  - Applied to sign-in/verification hardening and smoke-proof checklist updates.
- `ai/skills/10_qa_smoke_test_regression_guard.md`
  - Applied to Playwright smoke expansion and CI smoke gate.
- `ai/skills/11_leaderboard_aggregation_pnl_callouts.md`
  - Applied to player stats aggregation, callout grading, and leaderboard endpoints.
- `ai/skills/12_badges_achievements_event_engine.md`
  - Applied to idempotent badge definitions/awards and event-driven progression hooks.

## Done criteria used across lanes

- No client-controlled wallet identity on authenticated API writes.
- `POST /projects` requires session and enforces wallet/day + IP/day quotas.
- Smoke suite covers auth/rate-limit/project lifecycle/run-checks access/floor spoof rejection.
- Foundation APIs return stable payloads:
  - `/leaderboards/earners`
  - `/leaderboards/callouts`
  - `/leaderboards/trending`
  - `/players/:playerId`
  - `/players/:playerId/callouts`
  - `/players/:playerId/badges`
  - `/sim/trades`
- Badges are idempotent (`walletAddress + badgeId` unique) and data-driven (`BadgeDefinition.criteriaJson`).
