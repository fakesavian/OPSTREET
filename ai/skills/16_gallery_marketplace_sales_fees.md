# Skill 16 — Gallery + Marketplace (Listings, Purchases, Sales Fees)

## Purpose
Build an NFT art gallery loop:
create art → list → buy → record sale → take platform fee → show in gallery.

## Trigger
- Implementing NFT Art Gallery + Art Dealer license
- Need fee-taking and listing mechanics

## Inputs
- Storage for images (local/dev or S3 later)
- Entitlement system (Art Dealer / Paint Set)
- Fee rate config

## Outputs
- Gallery pages (browse + detail)
- Listing + purchase APIs
- Sales fee accounting

## Steps
1) **Models**
   - `artworks` (creator, metadata, imageUrl)
   - `artListings` (price, asset, status)
   - `artSales` (buyer, price, feePaid)

2) **Permissions**
   - Only `ART_DEALER_LICENSE` can create listings
   - Paint Set required to mint (if enforced)

3) **Purchase flow**
   - Validate listing active
   - Charge buyer (sim/testnet mode)
   - Compute fee
   - Record sale + transfer ownership
   - Mark listing sold

4) **Fee ledger**
   - Record gross / fee / net
   - Expose future admin stats endpoint later

5) **UI**
   - Gallery grid + filters
   - Item detail modal
   - Buy button (disabled if insufficient balance)

6) **Testing**
   - Seed sample art + listings
   - Verify buy updates UI + ownership

## Done criteria
- Players can browse, buy, and see ownership change.
- Fees are recorded and visible in transaction history.

## Common failure modes
- Listings without ownership validation
- Fees not applied consistently

## Rollback plan
- SIM-only transactions first, add on-chain settlement later.
