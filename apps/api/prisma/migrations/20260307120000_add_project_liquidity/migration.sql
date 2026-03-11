-- Add required liquidity metadata on project creation for deploy gating.
ALTER TABLE "Project" ADD COLUMN "liquidityToken" TEXT;
ALTER TABLE "Project" ADD COLUMN "liquidityAmount" TEXT;
ALTER TABLE "Project" ADD COLUMN "liquidityFundingTx" TEXT;
