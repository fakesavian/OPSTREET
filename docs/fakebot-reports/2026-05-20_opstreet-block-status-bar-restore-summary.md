# OPSTREET Block Status Bar Restore

Date: 2026-05-20
Task title: Restore and fix OPSTREET block status bar
Project: OPSTREET / opfun-secure-launchpad
Agent manager: FAKEbot
Sub-agents used: None — narrow UI regression fix

## Summary

Restored the global block status bar below the main header and updated it to visibly distinguish OP_NET Testnet from OP_NET Mainnet while keeping the block height and block timer visible at all times.

## Root Cause

`BlockTimerBar` still existed and already fetched `/opnet/block-status`, but it was no longer mounted in the global app layout. That made the block timer and block number disappear from the UI.

## Files Changed

- `apps/web/src/app/layout.tsx`
  - Imported `BlockTimerBar`.
  - Mounted it directly under `OpHeader` inside the sticky top container.

- `apps/web/src/components/opfun/BlockTimerBar.tsx`
  - Added explicit network-kind detection for `mainnet`, `testnet`, and unknown values.
  - Kept the live block number and timer visible.
  - Made Testnet and Mainnet visually distinct:
    - Testnet: blue label/badge.
    - Mainnet: green label/badge.
    - Offline/degraded: red label/badge.
  - Added clearer hover titles for network, block height, and timer status.

## Verification

Commands run:

```bash
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web lint
```

Results:

- Typecheck passed.
- Lint passed with pre-existing warnings only:
  - `src/components/floor/FloatingFloorPanel.tsx` missing `getBounds` dependency warnings.
  - `src/components/WalletProvider.tsx` wallet dependency warning.

## Risks / Blockers

- No secrets changed.
- No commits or pushes made.
- Visual confirmation in browser was not performed in this pass.

## Recommended Next Step

Open the app and verify the sticky header now shows:

- OP_NET network label.
- Blue styling on Testnet.
- Green styling on Mainnet.
- Latest block number.
- Countdown/timer placeholder or live timer.
