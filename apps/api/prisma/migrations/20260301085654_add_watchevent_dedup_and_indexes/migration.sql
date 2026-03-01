-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WatchEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "detailsJson" TEXT,
    "txId" TEXT,
    "dedupKey" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WatchEvent" ("createdAt", "detailsJson", "id", "projectId", "severity", "title", "txId") SELECT "createdAt", "detailsJson", "id", "projectId", "severity", "title", "txId" FROM "WatchEvent";
DROP TABLE "WatchEvent";
ALTER TABLE "new_WatchEvent" RENAME TO "WatchEvent";
CREATE INDEX "WatchEvent_projectId_createdAt_idx" ON "WatchEvent"("projectId", "createdAt");
CREATE INDEX "WatchEvent_projectId_dedupKey_idx" ON "WatchEvent"("projectId", "dedupKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CheckRun_projectId_createdAt_idx" ON "CheckRun"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_pledgeCount_idx" ON "Project"("pledgeCount");
