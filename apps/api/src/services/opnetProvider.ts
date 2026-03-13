/**
 * OPNet testnet provider abstraction.
 *
 * Fetches block status, token prices, and BTC/USD from upstream services.
 * Supports two provider modes via env config:
 *   - Public BTC Vision testnet (default)
 *   - Self-hosted mempool-opnet / op-vm (via OPNET_MEMPOOL_URL / OPNET_VM_URL)
 *
 * No placeholder data. Throws on upstream failure.
 */

const OPNET_EXPLORER_URL = process.env["OPNET_EXPLORER_URL"] || "https://testnet.opnet.org";
const OPNET_MEMPOOL_URL = process.env["OPNET_MEMPOOL_URL"] || "";
const OPNET_VM_URL = process.env["OPNET_VM_URL"] || "";

const UPSTREAM_TIMEOUT_MS = 8_000;
const RETRY_COUNT = 1;
const RETRY_DELAY_MS = 500;
const TARGET_BLOCK_INTERVAL_MS = 10 * 60 * 1000;

export interface BlockStatusData {
  network: string;
  blockHeight: number;
  nextBlockEstimateMs: number;
  timestamp: string;
}

export interface TokenPriceData {
  usd: number;
  change24h: number;
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
}

export interface PricesData {
  prices: Record<string, TokenPriceData>;
  btcUsd: number;
}

export interface ExplorerHealthResult {
  healthy: boolean;
  url: string;
  blockHeight?: number;
  latencyMs?: number;
  error?: string;
}

class UpstreamError extends Error {
  constructor(
    public readonly service: string,
    public readonly statusCode: number | null,
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number = UPSTREAM_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(
  url: string,
  service: string,
  retries: number = RETRY_COUNT,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok) return res;
      lastError = new UpstreamError(service, res.status, `${service} returned HTTP ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  throw lastError ?? new UpstreamError(service, null, `${service} unreachable`);
}

function blockApiBase(): string {
  return OPNET_MEMPOOL_URL || `${OPNET_EXPLORER_URL}/api/v1`;
}

function priceApiBase(): string {
  return OPNET_VM_URL || `${OPNET_EXPLORER_URL}/api/v1`;
}

export function getExplorerBaseUrl(): string {
  return blockApiBase();
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    return Number(BigInt(trimmed));
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return null;
}

function extractBlockHeight(payload: unknown): number | null {
  const direct = parseNumeric(payload);
  if (direct !== null && direct > 0) return direct;

  if (!payload || typeof payload !== "object") return null;
  const source = payload as Record<string, unknown>;
  const fromFields = parseNumeric(
    source["height"] ?? source["blockHeight"] ?? source["latest"] ?? source["block"],
  );

  return fromFields !== null && fromFields > 0 ? fromFields : null;
}

function extractNextBlockEstimateMs(payload: unknown): number {
  if (!payload || typeof payload !== "object") return -1;
  const source = payload as Record<string, unknown>;
  const candidate = parseNumeric(source["nextBlockMs"] ?? source["nextBlockEstimateMs"]);
  if (candidate !== null && candidate > 0) return candidate;

  const blockTimestampMs = extractBlockTimestampMs(source);
  if (blockTimestampMs === null) return -1;

  const ageMs = Date.now() - blockTimestampMs;
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs >= TARGET_BLOCK_INTERVAL_MS) return -1;

  return Math.max(1, TARGET_BLOCK_INTERVAL_MS - ageMs);
}

function extractBlockTimestampMs(payload: Record<string, unknown>): number | null {
  const candidate = [
    payload["timestamp"],
    payload["time"],
    payload["blockTime"],
    payload["blockTimestamp"],
    payload["latestBlockTime"],
    payload["date"],
    payload["createdAt"],
  ].find((value) => value !== undefined && value !== null);

  return parseTimestampMs(candidate);
}

function parseTimestampMs(value: unknown): number | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();

  const numeric = parseNumeric(value);
  if (numeric !== null) {
    if (numeric <= 0) return null;
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }

  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchBlockStatus(): Promise<BlockStatusData> {
  const base = blockApiBase();
  const res = await fetchWithRetry(`${base}/block/latest`, "block-status");

  const payload = (await res.json()) as unknown;
  const blockHeight = extractBlockHeight(payload);
  if (!blockHeight) {
    throw new UpstreamError("block-status", null, "Invalid block height from upstream");
  }

  return {
    network: "opnet-testnet",
    blockHeight,
    nextBlockEstimateMs: extractNextBlockEstimateMs(payload),
    timestamp: new Date().toISOString(),
  };
}

export async function checkExplorerHealth(): Promise<ExplorerHealthResult> {
  const url = getExplorerBaseUrl();
  const startedAt = Date.now();

  try {
    const blockStatus = await fetchBlockStatus();
    return {
      healthy: true,
      url,
      blockHeight: blockStatus.blockHeight,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      healthy: false,
      url,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchTokenPrices(): Promise<PricesData> {
  const base = priceApiBase();

  const [pricesRes, btcUsd] = await Promise.all([
    fetchWithRetry(`${base}/prices`, "prices"),
    fetchBtcUsd(),
  ]);

  const json = (await pricesRes.json()) as {
    prices?: Record<string, TokenPriceData>;
  } & Record<string, TokenPriceData>;

  // Upstream may return { prices: { ... } } or flat { TBTC: { ... }, ... }
  const prices: Record<string, TokenPriceData> = json.prices ?? json;

  return { prices, btcUsd };
}

export async function fetchBtcUsd(): Promise<number> {
  const res = await fetchWithRetry(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    "btc-usd",
  );

  const json = (await res.json()) as { bitcoin?: { usd?: number } };
  const usd = json.bitcoin?.usd;
  if (typeof usd !== "number" || usd <= 0) {
    throw new UpstreamError("btc-usd", null, "Invalid BTC price from CoinGecko");
  }

  return usd;
}
