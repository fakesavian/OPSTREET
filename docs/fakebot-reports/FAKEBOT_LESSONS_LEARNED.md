# FAKEBOT Lessons Learned

## 2026-05-20 — OPSTREET block status bar is required global chrome

- The OPSTREET block status bar must remain mounted globally; users always need OP_NET network, block height, and block timer information.
- Do not remove the block status bar to solve network confusion. Fix the network labeling/styling instead.
- Mainnet and Testnet should be visibly distinct in the UI while still using backend `/opnet/block-status` as the source of truth.
