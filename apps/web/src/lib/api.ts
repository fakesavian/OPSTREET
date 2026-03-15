import type {
  ProjectDTO,
  FloorPresenceDTO,
  FloorCalloutDTO,
  FloorChatDTO,
  AvatarCatalogDTO,
  FloorTickerDTO,
  FloorStatsDTO,
} from "@opfun/shared";
import { getApiBase, getApiRuntimeConfig, isLocalApiBase } from "./apiBase";

const BASE =
  typeof window !== "undefined"
    ? getApiBase()
    : "";
const API_RUNTIME =
  typeof window !== "undefined"
    ? getApiRuntimeConfig()
    : {
        mode: "same-origin" as const,
        base: "",
        environment: (process.env["NODE_ENV"] ?? "development") === "development" ? "development" as const : "production" as const,
        explicit: false,
      };

function apiUnavailableError(action: string): Error {
  const localFallback =
    isLocalApiBase(BASE) &&
    typeof window !== "undefined" &&
    !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname.toLowerCase());
  const hint = localFallback
    ? "Do not ship a localhost API target. Leave NEXT_PUBLIC_API_URL unset, set OPFUN_API_URL on the web deployment to your live backend origin, and redeploy."
    : API_RUNTIME.mode === "same-origin"
      ? "Check the same-origin /api proxy and confirm OPFUN_API_URL points at a live backend that can answer /opnet/diagnostics."
      : "Start the local stack with `pnpm dev` and try again.";
  return new Error(
    `Cannot reach API at ${BASE} while ${action}. ${hint}`,
  );
}

function normalizeApiErrorMessage(raw: string, fallback: string): string {
  const message = raw.trim();
  if (!message) return fallback;
  if (/DEPLOYMENT_NOT_FOUND|deployment could not be found/i.test(message)) {
    return "Backend API deployment is unavailable. Update OPFUN_API_URL to a live backend origin and redeploy the web app.";
  }
  if (/API proxy is not configured|Invalid OPFUN_API_URL|Failed to reach backend API at/i.test(message)) {
    return "Backend API is misconfigured for this deployment. Set OPFUN_API_URL to a live backend origin and redeploy the web app.";
  }
  return message;
}

async function fetchOrExplain(url: string, init: RequestInit, action: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw apiUnavailableError(action);
  }
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await res.json().catch(() => null) as { error?: string; message?: string } | null;
    if (payload?.error) return payload.error;
    if (payload?.message) return payload.message;
  }

  const text = (await res.text().catch(() => "")).trim();
  return normalizeApiErrorMessage(text || `${fallback} (HTTP ${res.status})`, fallback);
}

export interface PaginatedProjects {
  items: ProjectDTO[];
  nextCursor?: string | null;
  hasMore?: boolean;
}

export async function fetchProjects(sort: "new" | "trending" = "new", cursor?: string): Promise<PaginatedProjects> {
  const params = new URLSearchParams({ sort });
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`${BASE}/projects?${params}`, { next: { revalidate: 10 } });
  if (!res.ok) throw new Error("Failed to fetch projects");
  const data = await res.json();
  // Backward compatibility: if backend still returns a bare array, wrap it
  if (Array.isArray(data)) return { items: data, nextCursor: null, hasMore: false };
  return data as PaginatedProjects;
}

export async function viewProject(id: string): Promise<void> {
  fetch(`${BASE}/projects/${id}/view`, { method: "POST" }).catch(() => undefined);
}

export interface CheckRun {
  id: string;
  type: string;
  status: string;
  outputJson: string | null;
  createdAt: string;
}

export interface WatchEvent {
  id: string;
  severity: string;
  title: string;
  detailsJson?: string | null;
  txId?: string | null;
  resolved: boolean;
  createdAt: string;
}

export async function resolveWatchEvent(
  projectId: string,
  eventId: string,
  adminSecret: string,
): Promise<WatchEvent> {
  const res = await fetch(
    `${BASE}/projects/${projectId}/watch-events/${eventId}/resolve`,
    { method: "PATCH", headers: { "X-Admin-Secret": adminSecret } },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<WatchEvent>;
}

export async function fetchProject(slug: string): Promise<ProjectDTO & {
  checkRuns: CheckRun[];
  watchEvents: WatchEvent[];
}> {
  const res = await fetch(`${BASE}/projects/${slug}`, { next: { revalidate: 5 } });
  if (res.status === 404) throw new Error("NOT_FOUND");
  if (!res.ok) throw new Error("Failed to fetch project");
  return res.json();
}

export async function createProject(data: {
  name: string;
  ticker: string;
  decimals: number;
  maxSupply: string;
  description: string;
  links: Record<string, string>;
  iconUrl?: string;
  sourceRepoUrl?: string;
  liquidityToken?: "TBTC" | "MOTO" | "PILL";
  liquidityAmount?: string;
  liquidityFundingTx?: string;
}): Promise<ProjectDTO> {
  const res = await fetch(`${BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to create project");
  }
  return res.json() as Promise<ProjectDTO>;
}

// ── Floor API ─────────────────────────────────────────────────────────────

export interface FloorProfile {
  walletAddress: string;
  displayName: string;
  activeAvatarId: string;
  muteUntil: string | null;
  avatarCatalog: AvatarCatalogDTO[];
}

export async function floorJoin(data: {
  walletAddress: string;
  displayName?: string;
  avatarId?: string;
}): Promise<FloorProfile> {
  const res = await fetch(`${BASE}/floor/presence/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to join floor");
  return res.json() as Promise<FloorProfile>;
}

export async function floorLeave(walletAddress: string): Promise<void> {
  fetch(`${BASE}/floor/presence/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  }).catch(() => undefined);
}

export async function fetchFloorPresence(): Promise<FloorPresenceDTO[]> {
  const res = await fetch(`${BASE}/floor/presence`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch presence");
  return res.json() as Promise<FloorPresenceDTO[]>;
}

export async function fetchFloorStats(): Promise<FloorStatsDTO> {
  const res = await fetch(`${BASE}/floor/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json() as Promise<FloorStatsDTO>;
}

export async function fetchFloorCallouts(
  limit = 50,
  wallet?: string,
): Promise<FloorCalloutDTO[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (wallet) params.set("wallet", wallet);
  const res = await fetch(`${BASE}/floor/callouts?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch callouts");
  return res.json() as Promise<FloorCalloutDTO[]>;
}

export async function postCallout(data: {
  content: string;
  projectId?: string | null;
}): Promise<{ id: string; createdAt: string }> {
  const res = await fetch(`${BASE}/floor/callouts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; retryAfterMs?: number };
    const e = new Error(err.error ?? "Failed to post callout") as Error & {
      retryAfterMs?: number;
      status?: number;
    };
    e.retryAfterMs = err.retryAfterMs;
    e.status = res.status;
    throw e;
  }
  return res.json() as Promise<{ id: string; createdAt: string }>;
}

export async function reactToCallout(
  calloutId: string,
  data: { reaction: "UP" | "DOWN" },
): Promise<{ upCount: number; downCount: number; userReaction: string }> {
  const res = await fetch(`${BASE}/floor/callouts/${calloutId}/react`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    const e = new Error(err.error ?? "Failed to react") as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  return res.json() as Promise<{ upCount: number; downCount: number; userReaction: string }>;
}

export async function fetchFloorChat(since?: string): Promise<FloorChatDTO[]> {
  const url = since
    ? `${BASE}/floor/chat?since=${encodeURIComponent(since)}`
    : `${BASE}/floor/chat`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch chat");
  return res.json() as Promise<FloorChatDTO[]>;
}

export async function sendChatMessage(data: {
  content: string;
}): Promise<{ id: string; createdAt: string }> {
  const res = await fetch(`${BASE}/floor/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as {
      error?: string;
      retryAfterMs?: number;
      muteUntil?: string;
    };
    const e = new Error(err.error ?? "Failed to send message") as Error & {
      retryAfterMs?: number;
      muteUntil?: string;
      status?: number;
    };
    e.retryAfterMs = err.retryAfterMs;
    e.muteUntil = err.muteUntil;
    e.status = res.status;
    throw e;
  }
  return res.json() as Promise<{ id: string; createdAt: string }>;
}

export async function fetchFloorTicker(): Promise<FloorTickerDTO[]> {
  const res = await fetch(`${BASE}/floor/ticker`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch ticker");
  return res.json() as Promise<FloorTickerDTO[]>;
}

export async function fetchFloorAvatars(wallet?: string): Promise<AvatarCatalogDTO[]> {
  const url = wallet
    ? `${BASE}/floor/avatars?wallet=${encodeURIComponent(wallet)}`
    : `${BASE}/floor/avatars`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch avatars");
  return res.json() as Promise<AvatarCatalogDTO[]>;
}

export async function equipAvatar(
  avatarId: string,
  walletAddress?: string,
): Promise<{ activeAvatarId: string }> {
  const res = await fetch(`${BASE}/floor/avatars/${avatarId}/equip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ walletAddress }),
  });
  if (!res.ok) throw new Error("Failed to equip avatar");
  return res.json() as Promise<{ activeAvatarId: string }>;
}

// ── Auth API ──────────────────────────────────────────────────────────────

export async function fetchAuthNonce(
  walletAddress: string,
): Promise<{ nonce: string; message: string; expiresAt: string }> {
  const res = await fetchOrExplain(`${BASE}/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
    credentials: "include",
  }, "requesting a wallet nonce");
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to get auth nonce"));
  return res.json() as Promise<{ nonce: string; message: string; expiresAt: string }>;
}

export async function verifyWalletSignature(data: {
  walletAddress: string;
  signature: string;
  nonce: string;
}): Promise<{ walletAddress: string }> {
  const res = await fetchOrExplain(`${BASE}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  }, "verifying the wallet signature");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = normalizeApiErrorMessage(
      (err as { error?: string }).error ?? "Verification failed",
      "Verification failed",
    );
    throw new Error(message);
  }
  return res.json() as Promise<{ walletAddress: string }>;
}

export async function authLogout(): Promise<void> {
  await fetch(`${BASE}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => undefined);
}

export async function fetchAuthMe(): Promise<{ walletAddress: string; provider: string } | null> {
  try {
    const res = await fetch(`${BASE}/auth/me`, { credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<{ walletAddress: string; provider: string }>;
  } catch {
    return null;
  }
}

export interface LeaderboardRow {
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

export interface PlayerSearchResult {
  walletAddress: string;
  displayName: string;
  avatarId: string;
  level: number;
  title: string;
  trustScore: number;
  badgesCount: number;
  hotScore?: number;
  realizedPnlSats?: number;
  calloutHitRate?: number;
  totalTrades?: number;
}

export async function fetchLeaderboard(
  type: "earners" | "callouts" | "trending",
  range: string,
): Promise<{ range: string; items: LeaderboardRow[] }> {
  const res = await fetch(`${BASE}/leaderboards/${type}?range=${encodeURIComponent(range)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch ${type} leaderboard`);
  return res.json() as Promise<{ range: string; items: LeaderboardRow[] }>;
}

export interface PlayerCharacter {
  id: string;
  label: string;
  imageUrl: string | null;
  emoji: string | null;
  tier: string;
  active: boolean;
}

export interface PlayerTokenHolding {
  projectId: string;
  slug: string;
  ticker: string;
  name: string;
  tokenAmount: number;
  estimatedValueSats: number;
  lastTradeAt: string;
}

export interface PlayerCurrentPosition extends PlayerTokenHolding {
  netFlowSats: number;
  currentPriceSats: number;
  tradeCount: number;
}

export interface PlayerFoundationProgress {
  tokensCreated: number;
  calloutsCount: number;
}

export interface PlayerProfile {
  walletAddress: string;
  displayName: string;
  bio: string;
  avatarId: string;
  level: number;
  title: string;
  xp: number;
  trustScore: number;
  followerCount: number;
  followingCount: number;
  viewerIsSelf: boolean;
  viewerIsFollowing: boolean;
  reputationComponents: Record<string, unknown>;
  badges: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    tier: string;
    iconKey: string;
    awardedAt: string;
  }>;
  stats: Record<string, unknown>;
  recentTrades: Array<{
    id: string;
    tokenSymbol: string;
    side: string;
    amountSats: number;
    tokenAmount: number;
    priceSats: number;
    confirmedAt: string;
  }>;
  recentCallouts: Array<{
    id: string;
    content: string;
    projectId: string | null;
    createdAt: string;
    grade: {
      multiple: number;
      peakAt: string;
      windowUsed: string;
      gradingVersion: number;
      gradedAt: string;
    } | null;
  }>;
  foundation: PlayerFoundationProgress;
  currentCharacters: PlayerCharacter[];
  tokenHoldings: PlayerTokenHolding[];
  currentPositions: PlayerCurrentPosition[];
}

export async function fetchPlayerProfile(playerId: string): Promise<PlayerProfile> {
  const res = await fetch(`${BASE}/players/${encodeURIComponent(playerId)}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch player profile");
  return res.json() as Promise<PlayerProfile>;
}

export async function fetchPlayerSearch(query: string, limit: number = 12): Promise<PlayerSearchResult[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query.trim()) params.set("q", query.trim());
  const res = await fetch(`${BASE}/players/search?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to search players");
  return res.json() as Promise<PlayerSearchResult[]>;
}

export async function fetchPlayerBadges(playerId: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${BASE}/players/${encodeURIComponent(playerId)}/badges`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch player badges");
  return res.json() as Promise<Array<Record<string, unknown>>>;
}

export interface PlayerMeSpriteOption {
  id: string;
  label: string;
  imageUrl: string;
}

export interface PlayerMeInventoryItem {
  itemKey: string;
  entitlement: string;
  collectionAddress: string;
  tokenId: string;
  mintTxId: string;
  confirmedAt: string | null;
  active: boolean;
  usedAt: string | null;
  mintedAt: string;
}

export interface PlayerMeProfile {
  walletAddress: string;
  displayName: string;
  bio: string;
  selectedSpriteId: string;
  followerCount: number;
  followingCount: number;
  spriteOptions: PlayerMeSpriteOption[];
  onchainInventory: PlayerMeInventoryItem[];
}

export async function fetchPlayerMe(): Promise<PlayerMeProfile> {
  const res = await fetch(`${BASE}/players/me`, { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to load profile.");
  }
  return res.json() as Promise<PlayerMeProfile>;
}

export async function updatePlayerMe(data: {
  displayName?: string;
  bio?: string;
  selectedSpriteId?: string;
}): Promise<{
  walletAddress: string;
  displayName: string;
  bio: string;
  selectedSpriteId: string;
  followerCount: number;
  followingCount: number;
}> {
  const res = await fetch(`${BASE}/players/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to update profile.");
  }
  return res.json() as Promise<{
    walletAddress: string;
    displayName: string;
    bio: string;
    selectedSpriteId: string;
    followerCount: number;
    followingCount: number;
  }>;
}

export async function followPlayer(playerId: string): Promise<{ followerCount: number; followingCount: number }> {
  const res = await fetch(`${BASE}/players/${encodeURIComponent(playerId)}/follow`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to follow player.");
  }
  return res.json() as Promise<{ followerCount: number; followingCount: number }>;
}

export async function unfollowPlayer(playerId: string): Promise<{ followerCount: number; followingCount: number }> {
  const res = await fetch(`${BASE}/players/${encodeURIComponent(playerId)}/follow`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to unfollow player.");
  }
  return res.json() as Promise<{ followerCount: number; followingCount: number }>;
}

export async function createDevSession(walletAddress: string): Promise<void> {
  const res = await fetchOrExplain(`${BASE}/auth/dev-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
    credentials: "include",
  }, "creating a local dev wallet session");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to create dev session");
  }
}

// ── OPNet Block + Price API ────────────────────────────────────────────

export interface BlockStatus {
  network: string;
  blockHeight: number;
  nextBlockEstimateMs: number;
  timestamp: string;
  source?: "rpc";
  degraded?: boolean;
}

export interface TokenPrice {
  usd: number;
  change24h: number;
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
}

export interface PriceData {
  prices: Record<string, TokenPrice>;
  btcUsd?: number;
}

export interface WalletBalance {
  address: string;
  lookupAddress: string;
  confirmedSats: number;
  unconfirmedSats: number;
  totalSats: number;
  btcUsd: number;
  usd: number;
  timestamp: string;
}

export interface OpnetDiagnosticsResponse {
  timestamp: string;
  runtimeMode: "development" | "preview" | "production";
  network: string;
  rpcUrl: string;
  provider: {
    healthy: boolean;
    blockHeight?: number;
    latencyMs?: number;
    error?: string;
  };
  backendApiTarget: string | null;
  contracts: {
    factory: { configured: boolean; valid: boolean; codeExists: boolean | null; address: string | null; error?: string };
    router: { configured: boolean; valid: boolean; codeExists: boolean | null; address: string | null; error?: string };
    tbtc: { configured: boolean; valid: boolean; codeExists: boolean | null; address: string | null; error?: string };
    shopCollection: { configured: boolean; valid: boolean; codeExists: boolean | null; address: string | null; error?: string };
  };
  readiness: {
    liveReads: boolean;
    poolCreation: boolean;
    routerReads: boolean;
    tbtcLiquidity: boolean;
    shopMint: boolean;
  };
  indexer: {
    latestIndexedBlock: number | null;
    latestIndexedAt: string | null;
    liveBlockLag: number | null;
    confirmationsRequired: number;
  };
  walletCapabilities: {
    auth: boolean;
    launch: boolean;
    trade: boolean;
    shop: boolean;
  };
}

export async function fetchBlockStatus(): Promise<BlockStatus> {
  const res = await fetch(`${BASE}/opnet/block-status`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch block status");
  return res.json() as Promise<BlockStatus>;
}

export async function fetchPrices(): Promise<PriceData> {
  const res = await fetch(`${BASE}/opnet/prices`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch prices");
  return res.json() as Promise<PriceData>;
}

export async function fetchBtcPrice(): Promise<{ usd: number }> {
  const res = await fetch(`${BASE}/opnet/btc-price`, { cache: "no-store" });
  if (!res.ok) throw new Error("BTC price unavailable");
  return res.json() as Promise<{ usd: number }>;
}

export async function fetchWalletBalance(address: string): Promise<WalletBalance> {
  const res = await fetch(`${BASE}/opnet/address-balance/${encodeURIComponent(address)}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Wallet balance unavailable");
  }
  return res.json() as Promise<WalletBalance>;
}

export async function fetchOpnetDiagnostics(): Promise<OpnetDiagnosticsResponse> {
  const res = await fetchOrExplain(`${BASE}/opnet/diagnostics`, {
    credentials: "include",
    cache: "no-store",
  }, "loading OP_NET diagnostics");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to fetch OP_NET diagnostics");
  }
  return res.json() as Promise<OpnetDiagnosticsResponse>;
}

// ── Launch Pipeline API ───────────────────────────────────────────────

export interface LaunchStatusResponse {
  projectId: string;
  ticker: string;
  status: string;
  launchStatus: string;
  launchError: string | null;
  contractAddress: string | null;
  deployTx: string | null;
  buildHash: string | null;
  poolAddress: string | null;
  poolBaseToken: string | null;
  poolTx: string | null;
  liveAt: string | null;
  checkRuns: unknown[];
}

export interface PoolParamsResponse {
  projectId: string;
  ticker: string;
  contractAddress: string;
  factoryAddress: string;
  routerAddress: string;
  liquidityToken: string;
  liquidityAmount: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  instructions: string[];
}

export interface PreparedInteractionResponse {
  offlineBufferHex: string;
  refundTo: string;
  maximumAllowedSatToSpend: string;
  feeRate: number;
}

export interface PoolCreateIntentResponse {
  status: "POOL_CREATE_INTENT";
  projectId: string;
  ticker: string;
  poolBaseToken: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  poolAddress: string;
  factoryAddress: string;
  interaction: PreparedInteractionResponse;
  instructions: string[];
}

export async function fetchPoolParams(projectId: string): Promise<PoolParamsResponse> {
  const res = await fetchOrExplain(`${BASE}/projects/${projectId}/pool-params`, {
    credentials: "include",
    cache: "no-store",
  }, "fetching pool parameters");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<PoolParamsResponse>;
}

export async function fetchPoolCreateIntent(projectId: string): Promise<PoolCreateIntentResponse> {
  const res = await fetchOrExplain(`${BASE}/projects/${projectId}/pool-create-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({}),
  }, "preparing pool creation");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<PoolCreateIntentResponse>;
}

export async function launchBuild(projectId: string): Promise<{ message: string; launchStatus: string }> {
  const res = await fetchOrExplain(`${BASE}/projects/${projectId}/launch-build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  }, "starting launch build");
  if (!res.ok && res.status !== 202) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ message: string; launchStatus: string }>;
}

export async function fetchLaunchStatus(projectId: string): Promise<LaunchStatusResponse> {
  const res = await fetch(`${BASE}/projects/${projectId}/launch-status`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch launch status");
  return res.json() as Promise<LaunchStatusResponse>;
}

export async function submitDeploy(projectId: string, data: {
  deployTx: string;
  contractAddress: string;
  buildHash?: string;
}): Promise<ProjectDTO> {
  const res = await fetchOrExplain(`${BASE}/projects/${projectId}/deploy-submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  }, "submitting deploy transaction");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<ProjectDTO>;
}

export async function submitPool(projectId: string, data: {
  poolTx?: string;
  poolAddress: string;
  poolBaseToken?: string;
  signedFundingTxHex?: string;
  signedInteractionTxHex?: string;
}): Promise<ProjectDTO> {
  const res = await fetchOrExplain(`${BASE}/projects/${projectId}/pool-submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  }, "submitting pool transaction");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<ProjectDTO>;
}

// ── Market State + Candles API ─────────────────────────────────────────

export interface MarketStateResponse {
  projectId: string;
  available: boolean;
  currentPriceSats: number;
  volume24hSats: number;
  tradeCount24h: number;
  reserveBase: number;
  reserveQuote: number;
  lastTradeAt: string | null;
  freshness: {
    dataBucket: "authoritative-live" | "derived-indexed" | "unavailable";
    degraded: boolean;
    stale: boolean;
    staleAgeMs: number | null;
    latestIndexedBlock: number | null;
    latestIndexedAt: string | null;
    confirmationsRequired: number;
  };
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchMarketState(projectId: string): Promise<MarketStateResponse> {
  const res = await fetch(`${BASE}/projects/${projectId}/market-state`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch market state");
  return res.json() as Promise<MarketStateResponse>;
}

export async function fetchCandles(
  projectId: string,
  timeframe: string = "1h",
  limit: number = 100,
): Promise<{
  projectId: string;
  timeframe: string;
  candles: CandleData[];
  freshness: MarketStateResponse["freshness"];
}> {
  const params = new URLSearchParams({ timeframe, limit: String(limit) });
  const res = await fetch(`${BASE}/projects/${projectId}/candles?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch candles");
  return res.json() as Promise<{
    projectId: string;
    timeframe: string;
    candles: CandleData[];
    freshness: MarketStateResponse["freshness"];
  }>;
}

export interface ClanLicenseStatus {
  walletAddress: string | null;
  clansUnlocked: boolean;
  purchasedAt?: string | null;
  sku: string;
}

export type ShopItemKey = "PAINT_SET" | "CLAN_FORMATION_LICENSE" | "GALLERY_TICKET";

export interface ShopCatalogItemState {
  itemKey: ShopItemKey;
  entitlement: string;
  name: string;
  description: string;
  imageUrl: string;
  pricing: {
    amount: number;
    tokenSymbol: string;
    displayToken: string;
    freeMint: boolean;
  };
  owned: boolean;
  mintStatus: "PENDING" | "CONFIRMED" | "FAILED" | null;
  mintedAt: string | null;
  active: boolean;
  collectionAddress: string | null;
  tokenId: string | null;
  mintTxId: string | null;
  confirmedAt: string | null;
}

export interface ShopItemsResponse {
  walletAddress: string | null;
  collectionAddress: string | null;
  items: ShopCatalogItemState[];
}

export interface PreparedInteraction {
  offlineBufferHex: string;
  refundTo: string;
  maximumAllowedSatToSpend: string;
  feeRate: number;
}

export interface MintIntentResponse {
  status: "MINT_INTENT";
  walletAddress: string;
  itemKey: string;
  entitlement: string;
  collectionAddress: string;
  tokenId: string;
  priceAmount: number;
  paymentToken: string;
  interaction: PreparedInteraction | null;
}

export interface MintBroadcastResponse {
  status: "MINT_BROADCAST";
  walletAddress: string;
  itemKey: string;
  entitlement: string;
  collectionAddress: string;
  tokenId: string;
  mintTxId: string;
  fundingTxId: string | null;
  confirmedAt: string | null;
  active: boolean;
}

export interface PoolCreateResponse {
  projectId: string;
  ticker: string;
  poolAddress: string;
  factoryAddress: string;
  interaction: PreparedInteraction;
}

export interface MintConfirmResponse {
  status: "MINT_SUBMITTED" | "ALREADY_CONFIRMED";
  walletAddress: string;
  itemKey: string;
  entitlement: string;
  collectionAddress: string;
  tokenId: string;
  mintTxId: string;
  fundingTxId?: string | null;
  confirmedAt: string | null;
  active: boolean;
}

export async function fetchShopItems(walletAddress?: string): Promise<ShopItemsResponse> {
  const url = walletAddress
    ? `${BASE}/shop/items?wallet=${encodeURIComponent(walletAddress)}`
    : `${BASE}/shop/items`;
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to fetch shop items.");
  }
  return res.json() as Promise<ShopItemsResponse>;
}

export async function shopMintIntent(itemKey: ShopItemKey): Promise<MintIntentResponse> {
  const res = await fetch(`${BASE}/shop/mint-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ itemKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to create mint intent.");
  }
  return res.json() as Promise<MintIntentResponse>;
}

export async function shopMintConfirm(
  itemKey: ShopItemKey,
  signedInteractionTxHex: string,
  signedFundingTxHex?: string,
): Promise<MintConfirmResponse> {
  const res = await fetch(`${BASE}/shop/mint-confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ itemKey, signedInteractionTxHex, signedFundingTxHex }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to confirm mint.");
  }
  return res.json() as Promise<MintConfirmResponse>;
}

export async function shopMintBroadcast(
  itemKey: ShopItemKey,
  interactionTransactionRaw: string,
  fundingTransactionRaw?: string,
): Promise<MintBroadcastResponse> {
  const res = await fetch(`${BASE}/shop/mint-broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ itemKey, interactionTransactionRaw, fundingTransactionRaw }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Mint broadcast failed.");
  }
  return res.json() as Promise<MintBroadcastResponse>;
}

export async function poolCreate(projectId: string): Promise<PoolCreateResponse> {
  const res = await fetchOrExplain(`${BASE}/projects/${projectId}/pool-create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  }, "preparing pool creation");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<PoolCreateResponse>;
}

export async function poolBroadcast(projectId: string, data: {
  interactionTransactionRaw: string;
  fundingTransactionRaw?: string;
  poolAddress: string;
}): Promise<ProjectDTO> {
  const res = await fetchOrExplain(`${BASE}/projects/${projectId}/pool-broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  }, "broadcasting pool creation");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<ProjectDTO>;
}

export async function useShopItem(itemKey: ShopItemKey, active?: boolean): Promise<{
  walletAddress: string;
  itemKey: string;
  entitlement: string;
  active: boolean;
  usedAt: string | null;
  collectionAddress: string;
  tokenId: string;
  mintTxId: string;
}> {
  const res = await fetch(`${BASE}/shop/use`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ itemKey, active }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to use item.");
  }
  return res.json() as Promise<{
    walletAddress: string;
    itemKey: string;
    entitlement: string;
    active: boolean;
    usedAt: string | null;
    collectionAddress: string;
    tokenId: string;
    mintTxId: string;
  }>;
}

export interface ClanDTO {
  id: string;
  name: string;
  tag: string;
  bio: string;
  ownerWallet: string;
  members: string[];
  memberCount: number;
  createdAt: string;
  isMember?: boolean;
  isOwner?: boolean;
}

export async function fetchClanLicenseStatus(walletAddress?: string): Promise<ClanLicenseStatus> {
  const url = walletAddress
    ? `${BASE}/shop/licenses?wallet=${encodeURIComponent(walletAddress)}`
    : `${BASE}/shop/licenses`;
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch clan license status");
  return res.json() as Promise<ClanLicenseStatus>;
}

export async function buyClanLicense(walletAddress: string): Promise<ClanLicenseStatus> {
  const res = await fetch(`${BASE}/shop/licenses/clans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ walletAddress }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to buy clan license");
  }
  return res.json() as Promise<ClanLicenseStatus>;
}

export async function fetchClans(walletAddress?: string): Promise<{ items: ClanDTO[]; total: number }> {
  const url = walletAddress
    ? `${BASE}/clans?wallet=${encodeURIComponent(walletAddress)}`
    : `${BASE}/clans`;
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch clans");
  return res.json() as Promise<{ items: ClanDTO[]; total: number }>;
}

export async function fetchMyClan(): Promise<{ clan: ClanDTO | null }> {
  const res = await fetch(`${BASE}/clans/me`, { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    if (res.status === 401) return { clan: null };
    throw new Error("Failed to fetch your clan");
  }
  return res.json() as Promise<{ clan: ClanDTO | null }>;
}

export async function createClan(data: {
  walletAddress: string;
  name: string;
  tag: string;
  bio?: string;
}): Promise<{ clan: ClanDTO }> {
  const res = await fetch(`${BASE}/clans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to create clan");
  }
  return res.json() as Promise<{ clan: ClanDTO }>;
}

export async function joinClan(clanId: string, walletAddress: string): Promise<{ clan: ClanDTO }> {
  const res = await fetch(`${BASE}/clans/${encodeURIComponent(clanId)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ walletAddress }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to join clan");
  }
  return res.json() as Promise<{ clan: ClanDTO }>;
}

export async function leaveClan(clanId: string, walletAddress: string): Promise<{ left: boolean }> {
  const res = await fetch(`${BASE}/clans/${encodeURIComponent(clanId)}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ walletAddress }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to leave clan");
  }
  return res.json() as Promise<{ left: boolean }>;
}
