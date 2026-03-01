-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 18,
    "maxSupply" TEXT NOT NULL DEFAULT '1000000000',
    "description" TEXT NOT NULL,
    "linksJson" TEXT NOT NULL DEFAULT '{}',
    "iconUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "contractAddress" TEXT,
    "network" TEXT NOT NULL DEFAULT 'testnet',
    "deployTx" TEXT,
    "buildHash" TEXT,
    "sourceRepoUrl" TEXT,
    "riskScore" INTEGER,
    "riskCardJson" TEXT,
    "pledgeCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Project" ("buildHash", "contractAddress", "createdAt", "decimals", "deployTx", "description", "iconUrl", "id", "linksJson", "maxSupply", "name", "network", "riskCardJson", "riskScore", "slug", "sourceRepoUrl", "status", "ticker", "updatedAt") SELECT "buildHash", "contractAddress", "createdAt", "decimals", "deployTx", "description", "iconUrl", "id", "linksJson", "maxSupply", "name", "network", "riskCardJson", "riskScore", "slug", "sourceRepoUrl", "status", "ticker", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
