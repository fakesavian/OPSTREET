-- CreateTable
CREATE TABLE "ProjectMarketState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "currentPriceSats" INTEGER NOT NULL DEFAULT 0,
    "volume24hSats" INTEGER NOT NULL DEFAULT 0,
    "tradeCount24h" INTEGER NOT NULL DEFAULT 0,
    "reserveBase" REAL NOT NULL DEFAULT 0,
    "reserveQuote" REAL NOT NULL DEFAULT 0,
    "lastTradeAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectMarketState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMarketState_projectId_key" ON "ProjectMarketState"("projectId");

-- CreateTable
CREATE TABLE "PoolSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "reserveBase" REAL NOT NULL,
    "reserveQuote" REAL NOT NULL,
    "priceSats" INTEGER NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PoolSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PoolSnapshot_projectId_recordedAt_idx" ON "PoolSnapshot"("projectId", "recordedAt");
