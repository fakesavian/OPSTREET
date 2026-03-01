export type ProjectStatus =
  | "DRAFT"
  | "CHECKING"
  | "READY"
  | "LAUNCHED"
  | "FLAGGED"
  | "GRADUATED"
  | "DEPLOY_PACKAGE_READY";

export type CheckRunType = "SCAFFOLD" | "STATIC" | "AUDIT" | "DEPLOY";
export type CheckRunStatus = "PENDING" | "OK" | "WARN" | "FAIL";
export type WatchSeverity = "INFO" | "WARN" | "CRITICAL";

export interface ProjectDTO {
  id: string;
  slug: string;
  name: string;
  ticker: string;
  decimals: number;
  maxSupply: string;
  description: string;
  links: Record<string, string>;
  iconUrl: string | null;
  status: ProjectStatus;
  contractAddress: string | null;
  network: string;
  deployTx: string | null;
  buildHash: string | null;
  sourceRepoUrl: string | null;
  riskScore: number | null;
  riskCardJson: RiskCard | null;
  /** Parsed version of riskCardJson, added by the API serializer */
  riskCard: RiskCard | null;
  pledgeCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RiskCard {
  permissions: {
    hasOwnerKey: boolean;
    canMint: boolean;
    canPause: boolean;
    canUpgrade: boolean;
    hasTimelocks: boolean;
    timelockDelay: number | null;
  };
  tokenEconomics: {
    maxSupply: string;
    decimals: number;
    transferRestrictions: string | null;
    initialDistributionNotes: string | null;
  };
  releaseIntegrity: {
    buildHashRecorded: boolean;
    contractMatchesArtifact: boolean | null;
    auditTimestamp: string | null;
    auditSummary: string | null;
  };
}

export interface CheckRunDTO {
  id: string;
  projectId: string;
  type: CheckRunType;
  status: CheckRunStatus;
  outputJson: Record<string, unknown> | null;
  createdAt: string;
}

export interface WatchEventDTO {
  id: string;
  projectId: string;
  severity: WatchSeverity;
  title: string;
  detailsJson: Record<string, unknown> | null;
  txId: string | null;
  /** True once the triggering condition is no longer active (admin-resolved). */
  resolved: boolean;
  createdAt: string;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
