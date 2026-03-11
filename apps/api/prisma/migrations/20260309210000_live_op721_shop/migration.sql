-- Drop the old ShopMint table (simulated JSON-backed receipts)
DROP TABLE IF EXISTS "ShopMint";

-- Recreate ShopMint with OP721 fields
CREATE TABLE "ShopMint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "entitlement" TEXT NOT NULL,
    "collectionAddress" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "mintTxId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "active" BOOLEAN NOT NULL DEFAULT 0,
    "mintedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    "usedAt" DATETIME
);

-- Unique constraints and indexes
CREATE UNIQUE INDEX "ShopMint_mintTxId_key" ON "ShopMint"("mintTxId");
CREATE UNIQUE INDEX "ShopMint_walletAddress_itemKey_key" ON "ShopMint"("walletAddress", "itemKey");
CREATE INDEX "ShopMint_walletAddress_idx" ON "ShopMint"("walletAddress");
CREATE INDEX "ShopMint_mintTxId_idx" ON "ShopMint"("mintTxId");
