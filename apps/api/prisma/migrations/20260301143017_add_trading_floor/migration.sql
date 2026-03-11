-- CreateTable
CREATE TABLE "UserProfile" (
    "walletAddress" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL DEFAULT '',
    "activeAvatarId" TEXT NOT NULL DEFAULT 'default-free-1',
    "muteUntil" DATETIME,
    "lastChatAt" DATETIME,
    "lastCalloutAt" DATETIME,
    "chatSpamCount" INTEGER NOT NULL DEFAULT 0,
    "lastSpamAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RoomPresence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "avatarId" TEXT NOT NULL DEFAULT 'default-free-1',
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AvatarCatalog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "bgColor" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'FREE',
    "pricePoints" INTEGER NOT NULL DEFAULT 0,
    "unlockCondition" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "UserAvatarOwnership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "avatarId" TEXT NOT NULL,
    "unlockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAvatarOwnership_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "UserProfile" ("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserAvatarOwnership_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "AvatarCatalog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Callout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "projectId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Callout_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "UserProfile" ("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalloutReaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "calloutId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "reaction" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalloutReaction_calloutId_fkey" FOREIGN KEY ("calloutId") REFERENCES "Callout" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalloutReaction_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "UserProfile" ("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "messageHash" TEXT NOT NULL,
    "isSpam" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "UserProfile" ("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AchievementProgress" (
    "walletAddress" TEXT NOT NULL PRIMARY KEY,
    "calloutsCount" INTEGER NOT NULL DEFAULT 0,
    "tokensCreated" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AchievementProgress_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "UserProfile" ("walletAddress") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomPresence_walletAddress_key" ON "RoomPresence"("walletAddress");

-- CreateIndex
CREATE INDEX "RoomPresence_lastSeen_idx" ON "RoomPresence"("lastSeen");

-- CreateIndex
CREATE INDEX "UserAvatarOwnership_walletAddress_idx" ON "UserAvatarOwnership"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "UserAvatarOwnership_walletAddress_avatarId_key" ON "UserAvatarOwnership"("walletAddress", "avatarId");

-- CreateIndex
CREATE INDEX "Callout_createdAt_idx" ON "Callout"("createdAt");

-- CreateIndex
CREATE INDEX "Callout_walletAddress_idx" ON "Callout"("walletAddress");

-- CreateIndex
CREATE INDEX "CalloutReaction_calloutId_idx" ON "CalloutReaction"("calloutId");

-- CreateIndex
CREATE UNIQUE INDEX "CalloutReaction_calloutId_walletAddress_key" ON "CalloutReaction"("calloutId", "walletAddress");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_walletAddress_createdAt_idx" ON "ChatMessage"("walletAddress", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_walletAddress_messageHash_idx" ON "ChatMessage"("walletAddress", "messageHash");
