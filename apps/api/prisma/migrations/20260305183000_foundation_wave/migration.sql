-- CreateTable
CREATE TABLE "Nonce" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WalletQuota" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SimTrade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "projectId" TEXT,
    "tokenSymbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "entryPriceSats" INTEGER NOT NULL,
    "exitPriceSats" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "realizedPnlSats" INTEGER NOT NULL,
    "multiple" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SimTrade_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "UserProfile" ("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SimTrade_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalloutGrade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "calloutId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "multiple" REAL NOT NULL,
    "peakAt" DATETIME NOT NULL,
    "windowUsed" TEXT NOT NULL DEFAULT '7d',
    "gradingVersion" INTEGER NOT NULL DEFAULT 1,
    "gradedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalloutGrade_calloutId_fkey" FOREIGN KEY ("calloutId") REFERENCES "Callout" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalloutGrade_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "UserProfile" ("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "rangeKey" TEXT NOT NULL,
    "realizedPnlSats" INTEGER NOT NULL DEFAULT 0,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "winningTrades" INTEGER NOT NULL DEFAULT 0,
    "winRate" REAL NOT NULL DEFAULT 0,
    "bestTradeMultiple" REAL NOT NULL DEFAULT 0,
    "calloutBestMultiple" REAL NOT NULL DEFAULT 0,
    "calloutAvgMultiple" REAL NOT NULL DEFAULT 0,
    "calloutsGraded" INTEGER NOT NULL DEFAULT 0,
    "calloutHitRate" REAL NOT NULL DEFAULT 0,
    "hotScore" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerStat_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "UserProfile" ("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BadgeDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "iconKey" TEXT NOT NULL,
    "criteriaJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BadgeAward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "awardedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BadgeAward_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "UserProfile" ("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BadgeAward_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "BadgeDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerProgress" (
    "walletAddress" TEXT NOT NULL PRIMARY KEY,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "titleKey" TEXT NOT NULL DEFAULT 'Rookie',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerProgress_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "UserProfile" ("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "XpEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sourceEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "XpEvent_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "UserProfile" ("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerReputation" (
    "walletAddress" TEXT NOT NULL PRIMARY KEY,
    "trustScore" INTEGER NOT NULL DEFAULT 50,
    "componentsJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerReputation_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "UserProfile" ("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Nonce_walletAddress_key" ON "Nonce"("walletAddress");

-- CreateIndex
CREATE INDEX "Nonce_expiresAt_idx" ON "Nonce"("expiresAt");

-- CreateIndex
CREATE INDEX "WalletQuota_walletAddress_action_idx" ON "WalletQuota"("walletAddress", "action");

-- CreateIndex
CREATE UNIQUE INDEX "WalletQuota_walletAddress_action_windowStart_key" ON "WalletQuota"("walletAddress", "action", "windowStart");

-- CreateIndex
CREATE INDEX "SimTrade_walletAddress_createdAt_idx" ON "SimTrade"("walletAddress", "createdAt");

-- CreateIndex
CREATE INDEX "SimTrade_createdAt_idx" ON "SimTrade"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalloutGrade_calloutId_key" ON "CalloutGrade"("calloutId");

-- CreateIndex
CREATE INDEX "CalloutGrade_walletAddress_gradedAt_idx" ON "CalloutGrade"("walletAddress", "gradedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStat_walletAddress_rangeKey_key" ON "PlayerStat"("walletAddress", "rangeKey");

-- CreateIndex
CREATE INDEX "PlayerStat_rangeKey_hotScore_idx" ON "PlayerStat"("rangeKey", "hotScore");

-- CreateIndex
CREATE INDEX "PlayerStat_rangeKey_realizedPnlSats_idx" ON "PlayerStat"("rangeKey", "realizedPnlSats");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeAward_walletAddress_badgeId_key" ON "BadgeAward"("walletAddress", "badgeId");

-- CreateIndex
CREATE INDEX "BadgeAward_walletAddress_awardedAt_idx" ON "BadgeAward"("walletAddress", "awardedAt");

-- CreateIndex
CREATE INDEX "XpEvent_walletAddress_createdAt_idx" ON "XpEvent"("walletAddress", "createdAt");
