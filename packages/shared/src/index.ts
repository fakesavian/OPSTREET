export type ProjectStatus =
  | "DRAFT"
  | "CHECKING"
  | "READY"
  | "LAUNCHED"
  | "FLAGGED"
  | "GRADUATED"
  | "DEPLOY_PACKAGE_READY";

// ── Live Launch State Machine ─────────────────────────────────────────────────
// Tracks the on-chain lifecycle of a token from creation to live pool.
// Kept separate from ProjectStatus to allow parallel tracking without
// breaking the existing status machine.
export type LaunchStatus =
  | "DRAFT"               // initial — no build started
  | "BUILDING"            // contract is compiling via asc
  | "AWAITING_WALLET_DEPLOY" // compiled, waiting for deployer wallet to sign
  | "DEPLOY_SUBMITTED"    // deploy tx broadcasted, awaiting confirmation
  | "DEPLOY_CONFIRMED"    // deploy tx confirmed on-chain
  | "AWAITING_POOL_CREATE" // contract live, waiting for AMM pool creation
  | "POOL_SUBMITTED"      // pool creation tx broadcasted
  | "LIVE"                // pool confirmed, token is actively trading
  | "FAILED";             // any step failed (see launchError)

export type CheckRunType = "SCAFFOLD" | "STATIC" | "AUDIT" | "DEPLOY";
export type CheckRunStatus = "PENDING" | "OK" | "WARN" | "FAIL";
export type WatchSeverity = "INFO" | "WARN" | "CRITICAL";
export type LiquidityToken = "TBTC" | "MOTO" | "PILL";

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
  liquidityToken: LiquidityToken | null;
  liquidityAmount: string | null;
  liquidityFundingTx: string | null;
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

  // ── Live launch fields (nullable until migration is active) ──
  launchStatus: LaunchStatus | null;
  launchError: string | null;
  poolAddress: string | null;
  poolBaseToken: string | null;
  poolTx: string | null;
  liveAt: string | null;
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

// ── Trading Floor DTOs ───────────────────────────────────────────────────────

export type AvatarTier = "FREE" | "PAID" | "ACHIEVEMENT";
export type CalloutReactionType = "UP" | "DOWN";

export interface FloorPresenceDTO {
  walletAddress: string;
  displayName: string;
  avatarId: string;
  lastSeen: string;
}

export interface FloorCalloutDTO {
  id: string;
  walletAddress: string;
  displayName: string;
  avatarId: string;
  content: string;
  projectId: string | null;
  projectTicker: string | null;
  projectStatus: string | null;
  projectRiskScore: number | null;
  upCount: number;
  downCount: number;
  userReaction: CalloutReactionType | null;
  createdAt: string;
}

export interface FloorChatDTO {
  id: string;
  walletAddress: string;
  displayName: string;
  avatarId: string;
  content: string;
  createdAt: string;
}

export interface AvatarCatalogDTO {
  id: string;
  name: string;
  emoji: string;
  bgColor: string;
  tier: AvatarTier;
  pricePoints: number;
  unlockCondition: string | null;
  description: string;
  owned: boolean;
  active: boolean;
}

export interface FloorTickerDTO {
  id: string;
  slug: string;
  ticker: string;
  name: string;
  riskScore: number | null;
  status: string;
  pledgeCount: number;
  priceDelta24h: string;
  currentPriceSats: number;
  volume24hSats: number;
  tradeCount24h: number;
  calloutCount24h: number;
  hasLiveData: boolean;
  launchStatus?: LaunchStatus | null;
}

export interface FloorStatsDTO {
  activeUsers: number;
  totalCallouts: number;
  totalMessages: number;
}

// Foundation wave DTOs
export interface LeaderboardRowDTO {
  rank: number;
  walletAddress: string;
  displayName: string;
  avatarId: string;
  level: number;
  title: string;
  trustScore: number;
  badgesCount: number;
  topBadgeIcons: string[];
  realizedPnlSats?: number;
  winRate?: number;
  totalTrades?: number;
  bestTradeMultiple?: number;
  calloutBestMultiple?: number;
  calloutAvgMultiple?: number;
  calloutsGraded?: number;
  calloutHitRate?: number;
  hotScore?: number;
}

export interface LeaderboardResponseDTO {
  range: string;
  items: LeaderboardRowDTO[];
}

export type GamePaymentToken = "PILL" | "MOTO";

export interface GamePaymentTokenInfo {
  symbol: GamePaymentToken;
  name: string;
  standard: "OP-20";
  contractAddress: string;
}

export const DEFAULT_GAME_PAYMENT_TOKEN: GamePaymentToken = "MOTO";

export const GAME_PAYMENT_TOKENS: Record<GamePaymentToken, GamePaymentTokenInfo> = {
  PILL: {
    symbol: "PILL",
    name: "Orange Pill",
    standard: "OP-20",
    contractAddress: "opt1sqp5gx9k0nrqph3sy3aeyzt673dz7ygtqxcfdqfle",
  },
  MOTO: {
    symbol: "MOTO",
    name: "Motoswap",
    standard: "OP-20",
    contractAddress: "opt1sqzkx6wm5acawl9m6nay2mjsm6wagv7gazcgtczds",
  },
};

// ── Live Migration DTOs ──────────────────────────────────────────────────────

/** On-chain trade fill recorded by the watcher or RPC listener. */
export interface TradeFillDTO {
  id: string;
  projectId: string;
  txId: string;
  walletAddress: string;
  side: "BUY" | "SELL";
  amountSats: number;
  tokenAmount: number;
  priceSats: number;
  blockHeight: number;
  confirmedAt: string;
}

/** OHLCV candle snapshot for charting. */
export interface CandleSnapshotDTO {
  projectId: string;
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Pool metadata after AMM graduation. */
export interface PoolMetadataDTO {
  id: string;
  projectId: string;
  poolAddress: string;
  baseToken: string;
  quoteToken: string;
  createdTx: string;
  createdAt: string;
}

/** Shop mint record — live OP721 collection ownership. */
export interface ShopMintDTO {
  id: string;
  walletAddress: string;
  itemKey: string;
  entitlement: string;
  collectionAddress: string;
  tokenId: string;
  mintTxId: string;
  status: string;
  active: boolean;
  mintedAt: string;
  confirmedAt: string | null;
  usedAt: string | null;
}

// ── Utilities ────────────────────────────────────────────────────────────────

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
