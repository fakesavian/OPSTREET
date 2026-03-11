-- Live migration scaffold: adds tables and columns needed for testnet→live transition.
-- No existing data is modified or deleted.

-- Add live launch columns to Project
ALTER TABLE "Project" ADD COLUMN "launchStatus" TEXT;
ALTER TABLE "Project" ADD COLUMN "launchError" TEXT;
ALTER TABLE "Project" ADD COLUMN "poolAddress" TEXT;
ALTER TABLE "Project" ADD COLUMN "poolBaseToken" TEXT;
ALTER TABLE "Project" ADD COLUMN "poolTx" TEXT;
ALTER TABLE "Project" ADD COLUMN "liveAt" DATETIME;

CREATE INDEX "Project_launchStatus_idx" ON "Project"("launchStatus");

-- On-chain trade fills (replaces SimTrade for real trades)
CREATE TABLE "TradeFill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "amountSats" INTEGER NOT NULL,
    "tokenAmount" REAL NOT NULL,
    "priceSats" INTEGER NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "confirmedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeFill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TradeFill_projectId_confirmedAt_idx" ON "TradeFill"("projectId", "confirmedAt");
CREATE INDEX "TradeFill_walletAddress_confirmedAt_idx" ON "TradeFill"("walletAddress", "confirmedAt");
CREATE INDEX "TradeFill_txId_idx" ON "TradeFill"("txId");

-- OHLCV candle snapshots
CREATE TABLE "CandleSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "time" INTEGER NOT NULL,
    "open" REAL NOT NULL,
    "high" REAL NOT NULL,
    "low" REAL NOT NULL,
    "close" REAL NOT NULL,
    "volume" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandleSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CandleSnapshot_projectId_timeframe_time_key" ON "CandleSnapshot"("projectId", "timeframe", "time");
CREATE INDEX "CandleSnapshot_projectId_timeframe_time_idx" ON "CandleSnapshot"("projectId", "timeframe", "time");

-- AMM pool metadata
CREATE TABLE "PoolMetadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "baseToken" TEXT NOT NULL,
    "quoteToken" TEXT NOT NULL,
    "createdTx" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PoolMetadata_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PoolMetadata_projectId_key" ON "PoolMetadata"("projectId");

-- On-chain shop mints (replaces JSON file)
CREATE TABLE "ShopMint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "entitlement" TEXT NOT NULL,
    "txRef" TEXT NOT NULL,
    "paymentToken" TEXT NOT NULL,
    "priceAmount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT 0,
    "mintedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" DATETIME
);

CREATE UNIQUE INDEX "ShopMint_walletAddress_itemKey_key" ON "ShopMint"("walletAddress", "itemKey");
CREATE INDEX "ShopMint_walletAddress_idx" ON "ShopMint"("walletAddress");

-- Wallet feature activation state
CREATE TABLE "WalletFeatureState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT 0,
    "activatedAt" DATETIME,
    "deactivatedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "WalletFeatureState_walletAddress_featureKey_key" ON "WalletFeatureState"("walletAddress", "featureKey");
CREATE INDEX "WalletFeatureState_walletAddress_idx" ON "WalletFeatureState"("walletAddress");
