import type { RiskCard } from "@opfun/shared";

/**
 * Compute a 0–100 risk score from a RiskCard.
 * Higher score = more risk.
 */
export function computeRiskScore(card: RiskCard): number {
  let score = 0;

  // Permissions risk (up to 50 points)
  if (card.permissions.hasOwnerKey) score += 10;
  if (card.permissions.canMint) score += 20;
  if (card.permissions.canPause) score += 10;
  if (card.permissions.canUpgrade) score += 15;
  if (!card.permissions.hasTimelocks) score += 5;

  // Release integrity (up to 30 points)
  if (!card.releaseIntegrity.buildHashRecorded) score += 15;
  if (card.releaseIntegrity.contractMatchesArtifact === false) score += 15;

  // Token economics (up to 20 points)
  if (card.tokenEconomics.transferRestrictions) score += 10;
  if (!card.tokenEconomics.initialDistributionNotes) score += 10;

  return Math.min(100, score);
}

export function riskLabel(score: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score < 20) return "LOW";
  if (score < 50) return "MEDIUM";
  if (score < 75) return "HIGH";
  return "CRITICAL";
}

export function defaultRiskCard(opts: {
  maxSupply: string;
  decimals: number;
}): RiskCard {
  return {
    permissions: {
      hasOwnerKey: false,
      canMint: false,
      canPause: false,
      canUpgrade: false,
      hasTimelocks: false,
      timelockDelay: null,
    },
    tokenEconomics: {
      maxSupply: opts.maxSupply,
      decimals: opts.decimals,
      transferRestrictions: null,
      initialDistributionNotes: null,
    },
    releaseIntegrity: {
      buildHashRecorded: false,
      contractMatchesArtifact: null,
      auditTimestamp: null,
      auditSummary: null,
    },
  };
}
