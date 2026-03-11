import { config } from "dotenv";
config();

import {
  checkContractCode,
  checkProviderHealth,
  fetchLivePoolState,
  fetchTransactionReceipt as fetchOpnetTransactionReceipt,
  getLiquidityTokenContractAddress,
  readStorageSlot,
} from "@opfun/opnet";
import type { LaunchStatus, LiquidityToken, ProjectDTO, WatchSeverity } from "@opfun/shared";

const API_URL = process.env["API_URL"] ?? "http://localhost:3001";
const ADMIN_SECRET = process.env["ADMIN_SECRET"] ?? "dev-secret-change-me";
const POLL_INTERVAL_MS = Number(process.env["WATCH_INTERVAL_MS"] ?? 5 * 60 * 1000);
const OPNET_NETWORK = "testnet";
const OPNET_RPC_URL = process.env["OPNET_RPC_URL"] ?? "";
const OPNET_RPC_KEY = process.env["OPNET_RPC_KEY"] ?? "";
const RPC_TIMEOUT_MS = Number(process.env["WATCH_RPC_TIMEOUT_MS"] ?? 8_000);
const TRADE_SUBMISSION_BATCH = Number(process.env["WATCH_TRADE_SUBMISSION_BATCH"] ?? 100);

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const CHAR_MAP: Record<string, number> = {};
for (let i = 0; i < BECH32_CHARSET.length; i++) CHAR_MAP[BECH32_CHARSET[i]!] = i;

interface FullProject extends ProjectDTO {
  checkRuns: unknown[];
  watchEvents: unknown[];
}

interface LaunchProject {
  id: string;
  ticker: string;
  launchStatus: LaunchStatus | null;
  contractAddress: string | null;
  deployTx: string | null;
  poolTx: string | null;
  poolAddress: string | null;
}

interface PendingTradeSubmission {
  projectId: string;
  ticker: string;
  launchStatus: string | null;
  poolAddress: string | null;
  txId: string;
  walletAddress: string;
  side: "BUY" | "SELL";
  amountSats: number;
  tokenAmount: number;
  paymentToken: string | null;
  paymentAmount: number | null;
  submittedAt: string;
}

interface PendingShopMint {
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

interface ParsedConfirmedTrade {
  walletAddress: string;
  side: "BUY" | "SELL";
  amountSats: number;
  tokenAmount: number;
  blockHeight: number;
  confirmedAt: Date;
}

type JsonRecord = Record<string, unknown>;

function normalizeAddress(address: string | null | undefined): string {
  return (address ?? "").trim().toLowerCase();
}

function resolvePoolBaseToken(project: { poolBaseToken?: string | null; liquidityToken?: string | null }): LiquidityToken {
  const value = project.poolBaseToken ?? project.liquidityToken ?? "MOTO";
  if (value !== "TBTC" && value !== "MOTO" && value !== "PILL") {
    throw new Error(`Unsupported pool base token '${value}'.`);
  }
  return value;
}

function mapLiveReservesToBaseQuote(
  liveState: {
    token0: string;
    token1: string;
    reserve0: bigint;
    reserve1: bigint;
  },
  baseTokenAddress: string,
  quoteTokenAddress: string,
): { reserveBase: number; reserveQuote: number } | null {
  const token0 = normalizeAddress(liveState.token0);
  const token1 = normalizeAddress(liveState.token1);
  const base = normalizeAddress(baseTokenAddress);
  const quote = normalizeAddress(quoteTokenAddress);

  if (!token0 || !token1 || !base || !quote) return null;
  if (token0 === base && token1 === quote) {
    return {
      reserveBase: Number(liveState.reserve0),
      reserveQuote: Number(liveState.reserve1),
    };
  }
  if (token0 === quote && token1 === base) {
    return {
      reserveBase: Number(liveState.reserve1),
      reserveQuote: Number(liveState.reserve0),
    };
  }
  return null;
}

function convertBits(data: number[], from: number, to: number): number[] | null {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << to) - 1;

  for (const value of data) {
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      result.push((acc >> bits) & maxv);
    }
  }

  if (bits >= from || ((acc << (to - bits)) & maxv)) return null;
  return result;
}

function p2trToHex(address: string): string | null {
  const lower = address.toLowerCase();
  const sep = lower.lastIndexOf("1");
  if (sep < 1) return null;

  const dataStr = lower.slice(sep + 1);
  if (dataStr.length < 8) return null;

  const payload = dataStr.slice(0, -6);
  const fiveBit: number[] = [];
  for (const char of payload) {
    const value = CHAR_MAP[char];
    if (value === undefined) return null;
    fiveBit.push(value);
  }

  if (fiveBit.length === 0) return null;
  if (fiveBit[0] !== 1) return null;

  const decoded = convertBits(fiveBit.slice(1), 5, 8);
  if (!decoded || decoded.length !== 32) return null;
  return `0x${decoded.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStorageValue(text: string): number {
  const trimmed = text.trim();
  const hexMatch = /0x([0-9a-fA-F]+)/.exec(trimmed);
  if (hexMatch) return Number.parseInt(hexMatch[1]!, 16);

  const numberMatch = /^(\d+(?:\.\d+)?)$/.exec(trimmed);
  if (numberMatch) return Number(numberMatch[1]);

  try {
    const parsed = JSON.parse(trimmed) as { value?: string | number; result?: string | number };
    const value = parsed.value ?? parsed.result;
    return toNumber(value) ?? 0;
  } catch {
    return 0;
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    if (!value) return null;
    if (value.startsWith("0x")) {
      const parsed = Number.parseInt(value.slice(2), 16);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "bigint") return Number(value);
  if (isRecord(value)) {
    return toNumber(value.value ?? value.amount ?? value.result);
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    if (!value) return null;
    if (/^\d+$/.test(value) || /^0x[0-9a-f]+$/i.test(value)) {
      const numeric = toNumber(value);
      return numeric === null ? null : toDate(numeric);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function collectRecords(value: unknown, depth = 0, seen = new Set<unknown>()): JsonRecord[] {
  if (depth > 6 || value === null || value === undefined || seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectRecords(entry, depth + 1, seen));
  }

  if (!isRecord(value)) return [];

  const nested = Object.values(value).flatMap((entry) => collectRecords(entry, depth + 1, seen));
  return [value, ...nested];
}

function firstValue(records: JsonRecord[], keys: string[]): unknown {
  for (const record of records) {
    for (const key of keys) {
      if (key in record && record[key] !== undefined && record[key] !== null) {
        return record[key];
      }
    }
  }
  return undefined;
}

function firstString(records: JsonRecord[], keys: string[]): string | null {
  const value = firstValue(records, keys);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function firstNumber(records: JsonRecord[], keys: string[]): number | null {
  return toNumber(firstValue(records, keys));
}

function swapContext(receipt: unknown): JsonRecord[] {
  const records = collectRecords(receipt);
  const matched = records.filter((record) => {
    const label = [
      record.event,
      record.eventName,
      record.name,
      record.type,
      record.kind,
      record.action,
    ]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase();

    return label.includes("swap") || label.includes("buy") || label.includes("sell");
  });

  return matched.length > 0 ? matched : records;
}

function receiptStatus(receipt: unknown): "pending" | "confirmed" | "failed" {
  const records = collectRecords(receipt);
  const statusValue = firstValue(records, ["status", "success", "ok", "confirmed"]);
  const blockHeight = firstNumber(records, ["blockHeight", "blockNumber", "height"]);

  if (typeof statusValue === "boolean") {
    return statusValue ? "confirmed" : "failed";
  }
  if (typeof statusValue === "string") {
    const normalized = statusValue.toLowerCase();
    if (normalized === "failed" || normalized === "reverted" || normalized === "error" || normalized === "0x0") {
      return "failed";
    }
    if (normalized === "confirmed" || normalized === "success" || normalized === "ok" || normalized === "0x1") {
      return "confirmed";
    }
  }
  if (typeof statusValue === "number") {
    if (statusValue === 0) return "failed";
    if (statusValue > 0) return "confirmed";
  }
  if ((blockHeight ?? 0) > 0) return "confirmed";
  return "pending";
}

function parseConfirmedTrade(
  receipt: unknown,
  submission: PendingTradeSubmission,
): ParsedConfirmedTrade | null {
  const records = swapContext(receipt);
  const label = [
    firstString(records, ["side", "direction"]),
    records
      .map((record) => [record.event, record.eventName, record.name, record.type].find((value) => typeof value === "string"))
      .filter((value): value is string => typeof value === "string")
      .join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let side: "BUY" | "SELL" = submission.side;
  if (label.includes("sell")) side = "SELL";
  if (label.includes("buy")) side = "BUY";

  const walletAddress =
    firstString(records, ["walletAddress", "from", "sender", "owner", "trader", "user"]) ?? submission.walletAddress;
  const blockHeight = firstNumber(records, ["blockHeight", "blockNumber", "height"]) ?? 0;
  const confirmedAt =
    toDate(firstValue(records, ["confirmedAt", "blockTime", "timestamp", "time", "blockTimestamp"])) ?? new Date();

  const buyBaseKeys = ["amountSats", "baseAmount", "amountInSats", "baseIn", "spentSats", "satsIn", "amountIn", "inputAmount"];
  const buyTokenKeys = ["tokenAmount", "quoteAmount", "amountOutQuote", "quoteOut", "tokensOut", "amountOut", "outputAmount", "receivedTokens"];
  const sellBaseKeys = ["amountSats", "baseAmount", "amountOutSats", "baseOut", "receivedSats", "satsOut", "amountOut", "outputAmount"];
  const sellTokenKeys = ["tokenAmount", "quoteAmount", "amountInQuote", "quoteIn", "tokensIn", "amountIn", "inputAmount", "soldTokens"];

  const amountSats = side === "BUY"
    ? firstNumber(records, buyBaseKeys)
    : firstNumber(records, sellBaseKeys);
  const tokenAmount = side === "BUY"
    ? firstNumber(records, buyTokenKeys)
    : firstNumber(records, sellTokenKeys);

  if (!walletAddress || (amountSats ?? 0) <= 0 || (tokenAmount ?? 0) <= 0) {
    return null;
  }

  return {
    walletAddress,
    side,
    amountSats: amountSats!,
    tokenAmount: tokenAmount!,
    blockHeight,
    confirmedAt,
  };
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) throw new Error(`API ${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": ADMIN_SECRET,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(error.error ?? `API ${path} returned ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function fetchLaunchedProjects(): Promise<FullProject[]> {
  const body = await apiGet<FullProject[] | { items: FullProject[] }>("/projects?status=LAUNCHED");
  const items = Array.isArray(body) ? body : body.items;
  return items.filter((project) => project.contractAddress);
}

async function fetchPendingLaunchProjects(): Promise<LaunchProject[]> {
  const body = await apiGet<LaunchProject[] | { items: LaunchProject[] }>("/projects?status=LAUNCHED&includeAll=true");
  const items = Array.isArray(body) ? body : body.items;
  return items.filter((project) => project.launchStatus === "DEPLOY_SUBMITTED" || project.launchStatus === "POOL_SUBMITTED");
}

async function fetchPendingTradeSubmissions(): Promise<PendingTradeSubmission[]> {
  const response = await fetch(`${API_URL}/trade-submissions/pending?limit=${TRADE_SUBMISSION_BATCH}`, {
    headers: {
      "X-Admin-Secret": ADMIN_SECRET,
    },
  });

  if (!response.ok) {
    throw new Error(`API /trade-submissions/pending returned ${response.status}`);
  }

  const body = (await response.json()) as { items?: PendingTradeSubmission[] };
  return body.items ?? [];
}

async function fetchPendingShopMints(): Promise<PendingShopMint[]> {
  const response = await fetch(`${API_URL}/shop/mints/pending?limit=100`, {
    headers: {
      "X-Admin-Secret": ADMIN_SECRET,
    },
  });

  if (!response.ok) {
    throw new Error(`API /shop/mints/pending returned ${response.status}`);
  }

  const body = (await response.json()) as { items?: PendingShopMint[] };
  return body.items ?? [];
}

async function postWatchEvent(
  projectId: string,
  severity: WatchSeverity,
  title: string,
  detailsJson?: Record<string, unknown>,
  dedupKey?: string,
): Promise<void> {
  try {
    await apiPost(`/projects/${projectId}/watch-events`, {
      severity,
      title,
      detailsJson,
      dedupKey,
    });
  } catch (error) {
    console.error("[watcher] Failed to post watch event:", error);
  }
}

async function confirmLaunchOnChain(project: LaunchProject): Promise<void> {
  if (project.launchStatus === "DEPLOY_SUBMITTED" && project.contractAddress) {
    try {
      const result = await checkContractCode(project.contractAddress);
      if (result.exists) {
        await apiPost(`/projects/${project.id}/confirm-deploy-onchain`, {
          contractAddress: project.contractAddress,
        });
      }
    } catch (error) {
      console.error(`[watcher] ${project.ticker}: deploy confirmation check failed`, error);
    }
  }

  if (project.launchStatus === "POOL_SUBMITTED" && project.poolAddress) {
    try {
      const result = await checkContractCode(project.poolAddress);
      if (result.exists) {
        await apiPost(`/projects/${project.id}/confirm-pool-onchain`, {
          poolAddress: project.poolAddress,
        });
      }
    } catch (error) {
      console.error(`[watcher] ${project.ticker}: pool confirmation check failed`, error);
    }
  }
}

async function indexPoolReserves(project: FullProject): Promise<void> {
  const poolAddress = project.poolAddress;
  if (!poolAddress || !project.contractAddress) return;

  try {
    const baseToken = resolvePoolBaseToken(project);
    const baseTokenAddress = getLiquidityTokenContractAddress(baseToken);
    const liveState = await fetchLivePoolState(poolAddress);
    if (!liveState) return;

    const reserves = mapLiveReservesToBaseQuote(liveState, baseTokenAddress, project.contractAddress);
    if (!reserves || reserves.reserveBase <= 0 || reserves.reserveQuote <= 0) return;

    await apiPost(`/projects/${project.id}/pool-snapshot`, {
      reserveBase: reserves.reserveBase,
      reserveQuote: reserves.reserveQuote,
      blockHeight: 0,
    });
  } catch (error) {
    console.error(`[indexer] ${project.ticker}: reserve indexing failed`, error);
  }
}

async function fetchTransactionReceipt(txId: string): Promise<unknown | null> {
  try {
    const result = await fetchOpnetTransactionReceipt(txId);
    if (result.found) return result;
    return null;
  } catch {
    return null;
  }
}

async function confirmTradeSubmission(
  submission: PendingTradeSubmission,
  trade: ParsedConfirmedTrade,
): Promise<void> {
  await apiPost(`/projects/${submission.projectId}/trade-submissions/${submission.txId}/confirm`, {
    walletAddress: trade.walletAddress,
    side: trade.side,
    amountSats: trade.amountSats,
    tokenAmount: trade.tokenAmount,
    blockHeight: trade.blockHeight,
    confirmedAt: trade.confirmedAt.toISOString(),
  });
}

async function failTradeSubmission(submission: PendingTradeSubmission, error: string): Promise<void> {
  await apiPost(`/projects/${submission.projectId}/trade-submissions/${submission.txId}/fail`, {
    error,
  });
}

async function confirmShopMint(mintTxId: string): Promise<void> {
  await apiPost(`/shop/mints/${mintTxId}/confirm`, {});
}

async function failShopMint(mintTxId: string, error: string): Promise<void> {
  await apiPost(`/shop/mints/${mintTxId}/fail`, { error });
}

async function indexPendingTrades(): Promise<{ checked: number; confirmed: number; failed: number }> {
  if (!OPNET_RPC_URL) {
    return { checked: 0, confirmed: 0, failed: 0 };
  }

  const submissions = await fetchPendingTradeSubmissions();
  let checked = 0;
  let confirmed = 0;
  let failed = 0;

  for (const submission of submissions) {
    checked++;

    try {
      const receipt = await fetchTransactionReceipt(submission.txId);
      if (!receipt) continue;

      const status = receiptStatus(receipt);
      if (status === "failed") {
        await failTradeSubmission(submission, "Transaction failed on-chain");
        failed++;
        continue;
      }
      if (status !== "confirmed") continue;

      const parsed = parseConfirmedTrade(receipt, submission);
      if (!parsed) {
        console.log(`[indexer] ${submission.ticker}: ${submission.txId} confirmed but swap fields are not indexed yet`);
        continue;
      }

      await confirmTradeSubmission(submission, parsed);
      confirmed++;
    } catch (error) {
      console.error(`[indexer] ${submission.ticker}: trade confirmation failed`, error);
    }
  }

  return { checked, confirmed, failed };
}

async function indexPendingShopMints(): Promise<{ checked: number; confirmed: number; failed: number }> {
  if (!OPNET_RPC_URL) {
    return { checked: 0, confirmed: 0, failed: 0 };
  }

  const mints = await fetchPendingShopMints();
  let checked = 0;
  let confirmed = 0;
  let failed = 0;

  for (const mint of mints) {
    checked++;

    try {
      const receipt = await fetchTransactionReceipt(mint.mintTxId);
      if (!receipt) continue;

      const status = receiptStatus(receipt);
      if (status === "failed") {
        await failShopMint(mint.mintTxId, "Mint transaction failed on-chain");
        failed++;
        continue;
      }
      if (status !== "confirmed") continue;

      try {
        await confirmShopMint(mint.mintTxId);
        confirmed++;
      } catch (error) {
        console.warn(`[shop] ${mint.itemKey}: mint confirmed but ownership revalidation is still pending`, error);
      }
    } catch (error) {
      console.error(`[shop] ${mint.itemKey}: mint confirmation failed`, error);
    }
  }

  return { checked, confirmed, failed };
}

const lastCodeHash = new Map<string, string>();
const lastOwnerSlot = new Map<string, string>();
const pollCycleCount = new Map<string, number>();

async function monitorProject(project: FullProject): Promise<void> {
  const { id, ticker, contractAddress } = project;
  if (!contractAddress) return;

  let codePresent = false;
  let codeSummary = "";
  try {
    const result = await checkContractCode(contractAddress);
    codePresent = result.exists;
    codeSummary = result.codeFingerprint ?? "";
  } catch (error) {
    await postWatchEvent(
      id,
      "WARN",
      "Provider error - cannot verify contract",
      { error: error instanceof Error ? error.message : String(error) },
      `RPC_ERROR:${id}`,
    );
    return;
  }

  if (!codePresent) {
    await postWatchEvent(
      id,
      "CRITICAL",
      "Contract code missing - possible rug or self-destruct",
      { address: contractAddress, rpcResponse: codeSummary },
      `CODE_MISSING:${id}`,
    );
    return;
  }

  const previousCode = lastCodeHash.get(id);
  const fingerprint = codeSummary.slice(0, 64);
  if (previousCode !== undefined && previousCode !== fingerprint) {
    await postWatchEvent(
      id,
      "CRITICAL",
      "Contract bytecode changed since last check",
      { address: contractAddress, prevFingerprint: previousCode, currFingerprint: fingerprint },
      `CODE_CHANGE:${id}:${fingerprint.slice(0, 8)}`,
    );
  }
  lastCodeHash.set(id, fingerprint);

  try {
    const slotValue = await readStorageSlot(contractAddress, "0x00");
    if (slotValue !== null) {
      const previousOwner = lastOwnerSlot.get(id);
      const ownerFingerprint = slotValue.toString(16).padStart(64, "0").slice(0, 128);
      if (previousOwner !== undefined && previousOwner !== ownerFingerprint) {
        await postWatchEvent(
          id,
          "WARN",
          "Storage slot 0 changed since last check",
          { prevValue: previousOwner, currValue: ownerFingerprint },
          `OWNER_CHANGE:${id}:${ownerFingerprint.slice(0, 8)}`,
        );
      }
      lastOwnerSlot.set(id, ownerFingerprint);
    }
  } catch {
    // Non-fatal.
  }

  const cycles = (pollCycleCount.get(id) ?? 0) + 1;
  pollCycleCount.set(id, cycles);
  if (cycles % 3 === 0) {
    await postWatchEvent(id, "INFO", "Contract alive - code and storage verified", {
      address: contractAddress,
      network: OPNET_NETWORK,
      cycle: cycles,
    });
  }
}

let cycleCount = 0;

async function runWatchCycle(): Promise<void> {
  cycleCount++;
  const startedAt = Date.now();
  console.log(`[watcher] Cycle #${cycleCount} starting at ${new Date().toISOString()}`);

  let projects: FullProject[];
  try {
    projects = await fetchLaunchedProjects();
  } catch (error) {
    console.error("[watcher] Failed to fetch launched projects", error);
    return;
  }

  for (const project of projects) {
    try {
      await monitorProject(project);
    } catch (error) {
      console.error(`[watcher] ${project.ticker}: monitor failure`, error);
    }
  }

  let launchChecked = 0;
  try {
    const pendingLaunch = await fetchPendingLaunchProjects();
    for (const project of pendingLaunch) {
      await confirmLaunchOnChain(project);
      launchChecked++;
    }
  } catch (error) {
    console.error("[watcher] Failed to confirm launch pipeline", error);
  }

  let poolsIndexed = 0;
  const liveProjects = projects.filter((project) => project.launchStatus === "LIVE" && project.poolAddress);
  for (const project of liveProjects) {
    try {
      await indexPoolReserves(project);
      poolsIndexed++;
    } catch (error) {
      console.error(`[indexer] ${project.ticker}: pool indexing failure`, error);
    }
  }

  let tradesChecked = 0;
  let tradesConfirmed = 0;
  let tradesFailed = 0;
  try {
    const tradeStats = await indexPendingTrades();
    tradesChecked = tradeStats.checked;
    tradesConfirmed = tradeStats.confirmed;
    tradesFailed = tradeStats.failed;
  } catch (error) {
    console.error("[indexer] Pending trade indexing failed", error);
  }

  let mintsChecked = 0;
  let mintsConfirmed = 0;
  let mintsFailed = 0;
  try {
    const mintStats = await indexPendingShopMints();
    mintsChecked = mintStats.checked;
    mintsConfirmed = mintStats.confirmed;
    mintsFailed = mintStats.failed;
  } catch (error) {
    console.error("[shop] Pending mint indexing failed", error);
  }

  console.log(JSON.stringify({
    event: "watcher_cycle",
    cycle: cycleCount,
    projectsScanned: projects.length,
    launchChecked,
    poolsIndexed,
    tradesChecked,
    tradesConfirmed,
    tradesFailed,
    mintsChecked,
    mintsConfirmed,
    mintsFailed,
    elapsedMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  }));
}

console.log("[watcher] OPFun watcher starting");
console.log(`[watcher] API: ${API_URL}`);
console.log(`[watcher] Network: ${OPNET_NETWORK}`);
console.log(`[watcher] Interval: ${POLL_INTERVAL_MS / 1000}s`);
console.log(`[watcher] Trade RPC: ${OPNET_RPC_URL ? "configured" : "disabled"}`);

const providerHealth = await checkProviderHealth();
if (!providerHealth.healthy) {
  console.error("[watcher] FATAL: OPNet provider health check failed.", providerHealth);
  process.exit(1);
}
console.log(
  `[watcher] OPNet provider healthy at block ${providerHealth.blockHeight ?? "unknown"} (${providerHealth.latencyMs ?? 0}ms)`,
);

await runWatchCycle();
setInterval(() => {
  runWatchCycle().catch((error) => {
    console.error("[watcher] Unhandled cycle error", error);
  });
}, POLL_INTERVAL_MS);
