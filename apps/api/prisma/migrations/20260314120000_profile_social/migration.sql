ALTER TABLE "UserProfile" ADD COLUMN "bio" TEXT NOT NULL DEFAULT '';

CREATE TABLE "UserFollow" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "followerWallet" TEXT NOT NULL,
  "followingWallet" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserFollow_followerWallet_fkey"
    FOREIGN KEY ("followerWallet") REFERENCES "UserProfile" ("walletAddress")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserFollow_followingWallet_fkey"
    FOREIGN KEY ("followingWallet") REFERENCES "UserProfile" ("walletAddress")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserFollow_followerWallet_followingWallet_key"
ON "UserFollow"("followerWallet", "followingWallet");

CREATE INDEX "UserFollow_followerWallet_createdAt_idx"
ON "UserFollow"("followerWallet", "createdAt");

CREATE INDEX "UserFollow_followingWallet_createdAt_idx"
ON "UserFollow"("followingWallet", "createdAt");
