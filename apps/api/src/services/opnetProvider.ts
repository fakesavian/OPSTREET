/**
 * OPNet testnet provider abstraction.
 *
 * Fetches core live state from OP_NET RPC and optional UX price data from
 * external upstream services.
 *
 * No explorer data is authoritative for launch/trade logic.
 */

import { checkProviderHealth, getProvider } from "@opfun/opnet";

const OPNET_EXPLORER_URL = process.env["OPNET_EXPLORER_URL"] || "https://testnet.opnet.org";
const OPNET_MEMPOOL_URL = process.env["OPNET_MEMPOOL_URL"] || "";
const OPNET_VM_URL = process.env["OPNET_VM_URL"] || "";
const BTC_TESTNET_BALANCE_API_URL =
  process.env["BTC_TESTNET_BALANCE_API_URL"] || "https://mempool.space/testnet4/api";

const UPSTREAM_TIMEOUT_MS = 8_000;
const RETRY_COUNT = 1;
const RETRY_DELAY_MS = 500;
const TARGET_BLOCK_INTERVAL_MS = 10 * 60 * 1000;

export interface BlockStatusData {
  network: string;
  blockHeight: number;
  nextBlockEstimateMs: number;
  timestamp: string;
  source: "rpc";
  degraded: boolean;
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

export interface AddressBalanceData {
  address: string;
  lookupAddress: string;
  confirmedSats: number;
  unconfirmedSats: number;
  totalSats: number;
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

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i]!;
  }
  return chk;
}

function bech32Decode(str: string): { hrp: string; data: number[]; isBech32m: boolean } | null {
  const pos = str.lastIndexOf("1");
  if (pos < 1 || pos + 7 > str.length || str.length > 90) return null;
  const hrp = str.slice(0, pos).toLowerCase();
  const dataChars = str.slice(pos + 1).toLowerCase();
  const data: number[] = [];
  for (const ch of dataChars) {
    const idx = BECH32_CHARSET.indexOf(ch);
    if (idx === -1) return null;
    data.push(idx);
  }
  const values = [...bech32HrpExpand(hrp), ...data];
  const polymod = bech32Polymod(values);
  const isBech32m = polymod === 0x2bc830a3;
  if (polymod !== 1 && !isBech32m) return null;
  return { hrp, data: data.slice(0, -6), isBech32m };
}

function bech32CreateChecksum(hrp: string, data: number[], isBech32m: boolean): number[] {
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const polymod = bech32Polymod(values) ^ (isBech32m ? 0x2bc830a3 : 1);
  const ret: number[] = [];
  for (let i = 0; i < 6; i++) ret.push((polymod >> (5 * (5 - i))) & 31);
  return ret;
}

function bech32Encode(hrp: string, data: number[], isBech32m: boolean): string {
  const checksum = bech32CreateChecksum(hrp, data, isBech32m);
  return hrp + "1" + [...data, ...checksum].map((d) => BECH32_CHARSET[d]).join("");
}

function toBalanceLookupAddress(address: string): string {
  const lower = address.toLowerCase();
  if (lower.startsWith("tb1") || lower.startsWith("bc1") || lower.startsWith("bcrt1")) {
    return address;
  }
  if (lower.startsWith("opt1")) {
    const decoded = bech32Decode(address);
    if (!decoded) {
      throw new UpstreamError("address-balance", null, "Could not convert OP_NET address into a Bitcoin testnet address.");
    }
    return bech32Encode("tb", decoded.data, decoded.isBech32m);
  }
  return address;
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
  const health = await checkProviderHealth();
  if (!health.healthy || typeof health.blockHeight !== "number") {
    throw new UpstreamError("block-status", null, health.error ?? "OP_NET RPC unavailable");
  }

  let nextBlockEstimateMs = -1;
  try {
    const provider = (await getProvider()) as unknown as {
      getBlock?: (height: number) => Promise<unknown>;
    };
    if (typeof provider.getBlock === "function") {
      const block = await provider.getBlock(health.blockHeight);
      nextBlockEstimateMs = extractNextBlockEstimateMs(block);
    }
  } catch {
    nextBlockEstimateMs = -1;
  }

  return {
    network: "opnet-testnet",
    blockHeight: health.blockHeight,
    nextBlockEstimateMs,
    timestamp: new Date().toISOString(),
    source: "rpc",
    degraded: nextBlockEstimateMs <= 0,
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

export async function fetchAddressBalance(address: string): Promise<AddressBalanceData> {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new UpstreamError("address-balance", null, "Wallet address is required.");
  }

  const lookupAddress = toBalanceLookupAddress(trimmed);
  const res = await fetchWithRetry(
    `${BTC_TESTNET_BALANCE_API_URL.replace(/\/+$/, "")}/address/${encodeURIComponent(lookupAddress)}`,
    "address-balance",
  );

  const json = (await res.json()) as {
    chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
    mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
  };

  const confirmedSats =
    (json.chain_stats?.funded_txo_sum ?? 0) - (json.chain_stats?.spent_txo_sum ?? 0);
  const unconfirmedSats =
    (json.mempool_stats?.funded_txo_sum ?? 0) - (json.mempool_stats?.spent_txo_sum ?? 0);
  const totalSats = confirmedSats + unconfirmedSats;

  return {
    address: trimmed,
    lookupAddress,
    confirmedSats,
    unconfirmedSats,
    totalSats,
  };
}
