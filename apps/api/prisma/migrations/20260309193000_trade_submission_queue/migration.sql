-- CreateTable
CREATE TABLE "TradeSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "paymentToken" TEXT,
    "paymentAmount" REAL,
    "amountSats" INTEGER NOT NULL,
    "tokenAmount" REAL NOT NULL,
    "rawPayloadJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "error" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    "blockHeight" INTEGER,
    CONSTRAINT "TradeSubmission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeSubmission_txId_key" ON "TradeSubmission"("txId");

-- CreateIndex
CREATE INDEX "TradeSubmission_projectId_status_submittedAt_idx" ON "TradeSubmission"("projectId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "TradeSubmission_walletAddress_status_submittedAt_idx" ON "TradeSubmission"("walletAddress", "status", "submittedAt");
