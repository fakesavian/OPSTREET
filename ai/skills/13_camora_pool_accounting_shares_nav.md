# Skill 13 — Camora Pool Accounting (Shares/NAV or Safe Pro‑Rata)

## Purpose
Correctly track pooled contributions and distribute profits fairly for Camora clans.

## Trigger
- Implementing pooled money + leader trading + distributions

## Inputs
- Contribution events
- Pool trade results (PnL)
- Fee schedule

## Outputs
- Pool accounting model
- Distribution calculations
- Ledger views for transparency

## Recommended approach (shares/NAV)
- Mint pool shares on deposit at current NAV
- Profits increase NAV, not share count
- Withdraw burns shares

## Steps
1) **Pick v1 model**
   - If speed: simple pro‑rata by contribution (but record deposit times)
   - If correctness: shares/NAV (recommended)

2) **Data tables**
   - contributions
   - share balances
   - trades
   - fee events
   - distributions (epochs)

3) **Leader trade execution**
   - Validate permissions
   - Apply trading fee
   - Record trade + resulting PnL

4) **Distribution**
   - Periodic settle (manual or scheduled)
   - Allocate net PnL by shares
   - Store payout results per member

5) **UI/ledger**
   - Show contributions + withdrawals
   - share ownership %
   - trade history
   - distribution history
   - fees paid

## Done criteria
- Members earn proportional to ownership without exploits.
- Ledger is auditable.

## Common failure modes
- Late deposits unfairly capture prior gains
- Floating point errors (use integers/sats)

## Rollback plan
- Freeze deposits during settle in v1, then upgrade to shares model.
