-- CreateTable
CREATE TABLE "PledgeRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pledgedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PledgeRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PledgeRecord_projectId_idx" ON "PledgeRecord"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PledgeRecord_walletAddress_projectId_key" ON "PledgeRecord"("walletAddress", "projectId");
