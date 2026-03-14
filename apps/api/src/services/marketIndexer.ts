/**
 * Market indexer helpers.
 *
 * All market state, fills, candles, and player stats derive from
 * confirmed live testnet data only. No placeholder trade paths remain here.
 */

import { fetchLivePoolState, getLiquidityTokenContractAddress } from "@opfun/opnet";
import type { LiquidityToken } from "@opfun/shared";
import { prisma } from "../db.js";

export interface PoolReserves {
  reserveBase: number;
  reserveQuote: number;
  blockHeight: number;
}

export interface SwapEvent {
  txId: string;
  walletAddress: string;
  side: "BUY" | "SELL";
  amountSats: number;
  tokenAmount: number;
  blockHeight: number;
  confirmedAt: Date;
}

export interface TradeSubmissionInput {
  txId: string;
  walletAddress: string;
  side: "BUY" | "SELL";
  paymentToken?: string | null;
  paymentAmount?: number | null;
  amountSats: number;
  tokenAmount: number;
  rawPayloadJson?: string | null;
}

export interface PendingTradeSubmission {
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
  submittedAt: Date;
}

export interface MarketDataDiagnostics {
  dataBucket: "authoritative-live" | "derived-indexed" | "unavailable";
  liveStateAvailable: boolean;
  indexedStateAvailable: boolean;
  degraded: boolean;
  stale: boolean;
  staleAgeMs: number | null;
  latestIndexedBlock: number | null;
  latestIndexedAt: Date | null;
  confirmationsRequired: number;
}

const TIMEFRAME_SECONDS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

export const MARKET_INDEX_MAX_STALENESS_MS = Number(
  process.env["MARKET_INDEX_MAX_STALENESS_MS"] ?? 10 * 60 * 1000,
);
export const MARKET_CONFIRMATION_BLOCKS = Number(process.env["MARKET_CONFIRMATION_BLOCKS"] ?? 2);

export function priceFromReserves(reserveBase: number, reserveQuote: number): number {
  if (reserveQuote <= 0) return 0;
  return Math.round(reserveBase / reserveQuote);
}

export function getSwapQuote(
  reserveBase: number,
  reserveQuote: number,
  side: "BUY" | "SELL",
  inputAmount: number,
  feeBps: number = 30,
): { outputAmount: number; priceImpactBps: number; effectivePriceSats: number } {
  if (reserveBase <= 0 || reserveQuote <= 0 || inputAmount <= 0) {
    return { outputAmount: 0, priceImpactBps: 0, effectivePriceSats: 0 };
  }

  const feeMultiplier = 1 - feeBps / 10_000;
  const inputAfterFee = inputAmount * feeMultiplier;

  let outputAmount: number;
  let effectivePriceSats: number;

  if (side === "BUY") {
    outputAmount = (reserveQuote * inputAfterFee) / (reserveBase + inputAfterFee);
    effectivePriceSats = outputAmount > 0 ? Math.round(inputAmount / outputAmount) : 0;
  } else {
    outputAmount = (reserveBase * inputAfterFee) / (reserveQuote + inputAfterFee);
    effectivePriceSats = inputAmount > 0 ? Math.round(outputAmount / inputAmount) : 0;
  }

  const spotPrice = priceFromReserves(reserveBase, reserveQuote);
  const priceImpactBps =
    spotPrice > 0 ? Math.round((Math.abs(effectivePriceSats - spotPrice) / spotPrice) * 10_000) : 0;

  return {
    outputAmount: Math.floor(outputAmount),
    priceImpactBps,
    effectivePriceSats,
  };
}

async function rollCandle(
  projectId: string,
  tradeTime: Date,
  priceSats: number,
  volumeSats: number,
): Promise<void> {
  const epochSec = Math.floor(tradeTime.getTime() / 1000);

  for (const [timeframe, seconds] of Object.entries(TIMEFRAME_SECONDS)) {
    const candleTime = Math.floor(epochSec / seconds) * seconds;
    const existing = await prisma.candleSnapshot.findUnique({
      where: {
        projectId_timeframe_time: {
          projectId,
          timeframe,
          time: candleTime,
        },
      },
    });

    if (existing) {
      await prisma.candleSnapshot.update({
        where: { id: existing.id },
        data: {
          high: Math.max(existing.high, priceSats),
          low: Math.min(existing.low, priceSats),
          close: priceSats,
          volume: existing.volume + volumeSats,
        },
      });
      continue;
    }

    await prisma.candleSnapshot.create({
      data: {
        projectId,
        timeframe,
        time: candleTime,
        open: priceSats,
        high: priceSats,
        low: priceSats,
        close: priceSats,
        volume: volumeSats,
      },
    });
  }
}

async function refreshLiveDerivations(projectId: string, walletAddress: string, tradeId: string): Promise<void> {
  const { gradeCallout, recordFoundationProgressFromTrade } = await import("./foundation.js");

  await recordFoundationProgressFromTrade(walletAddress, tradeId);

  const pendingCallouts = await prisma.callout.findMany({
    where: {
      projectId,
      grade: { is: null },
    },
    select: {
      id: true,
      walletAddress: true,
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  for (const callout of pendingCallouts) {
    await gradeCallout(callout.id, callout.walletAddress, projectId).catch(() => undefined);
  }
}

export async function recordPoolSnapshot(projectId: string, reserves: PoolReserves): Promise<void> {
  const priceSats = priceFromReserves(reserves.reserveBase, reserves.reserveQuote);

  await prisma.poolSnapshot.create({
    data: {
      projectId,
      reserveBase: reserves.reserveBase,
      reserveQuote: reserves.reserveQuote,
      priceSats,
      blockHeight: reserves.blockHeight,
    },
  });

  await prisma.projectMarketState.upsert({
    where: { projectId },
    update: {
      currentPriceSats: priceSats,
      reserveBase: reserves.reserveBase,
      reserveQuote: reserves.reserveQuote,
    },
    create: {
      projectId,
      currentPriceSats: priceSats,
      reserveBase: reserves.reserveBase,
      reserveQuote: reserves.reserveQuote,
    },
  });
}

export async function recordTradeFill(projectId: string, event: SwapEvent): Promise<string> {
  const existing = await prisma.tradeFill.findFirst({
    where: { txId: event.txId },
  });
  if (existing) return existing.id;

  const priceSats = event.tokenAmount > 0 ? Math.round(event.amountSats / event.tokenAmount) : 0;

  const fill = await prisma.tradeFill.create({
    data: {
      projectId,
      txId: event.txId,
      walletAddress: event.walletAddress,
      side: event.side,
      amountSats: event.amountSats,
      tokenAmount: event.tokenAmount,
      priceSats,
      blockHeight: event.blockHeight,
      confirmedAt: event.confirmedAt,
    },
  });

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [volume24h, tradeCount24h] = await Promise.all([
    prisma.tradeFill.aggregate({
      where: {
        projectId,
        confirmedAt: { gte: oneDayAgo },
      },
      _sum: { amountSats: true },
    }),
    prisma.tradeFill.count({
      where: {
        projectId,
        confirmedAt: { gte: oneDayAgo },
      },
    }),
  ]);

  await prisma.projectMarketState.upsert({
    where: { projectId },
    update: {
      currentPriceSats: priceSats,
      volume24hSats: volume24h._sum.amountSats ?? 0,
      tradeCount24h,
      lastTradeAt: event.confirmedAt,
    },
    create: {
      projectId,
      currentPriceSats: priceSats,
      volume24hSats: volume24h._sum.amountSats ?? 0,
      tradeCount24h,
      lastTradeAt: event.confirmedAt,
    },
  });

  await rollCandle(projectId, fill.confirmedAt, priceSats, event.amountSats);

  await refreshLiveDerivations(projectId, event.walletAddress, fill.id).catch((error) => {
    console.error("[marketIndexer] Failed to refresh live derivations:", error);
  });

  return fill.id;
}

export async function queueTradeSubmission(
  projectId: string,
  submission: TradeSubmissionInput,
): Promise<{ id: string; txId: string; status: string }> {
  const existingFill = await prisma.tradeFill.findFirst({
    where: {
      projectId,
      txId: submission.txId,
    },
  });

  if (existingFill) {
    const queued = await prisma.tradeSubmission.upsert({
      where: { txId: submission.txId },
      update: {
        walletAddress: submission.walletAddress,
        side: submission.side,
        paymentToken: submission.paymentToken ?? null,
        paymentAmount: submission.paymentAmount ?? null,
        amountSats: submission.amountSats,
        tokenAmount: submission.tokenAmount,
        rawPayloadJson: submission.rawPayloadJson ?? undefined,
        status: "CONFIRMED",
        error: null,
        confirmedAt: existingFill.confirmedAt,
        blockHeight: existingFill.blockHeight,
      },
      create: {
        projectId,
        txId: submission.txId,
        walletAddress: submission.walletAddress,
        side: submission.side,
        paymentToken: submission.paymentToken ?? null,
        paymentAmount: submission.paymentAmount ?? null,
        amountSats: submission.amountSats,
        tokenAmount: submission.tokenAmount,
        rawPayloadJson: submission.rawPayloadJson ?? null,
        status: "CONFIRMED",
        confirmedAt: existingFill.confirmedAt,
        blockHeight: existingFill.blockHeight,
      },
    });

    return { id: queued.id, txId: queued.txId, status: queued.status };
  }

  const queued = await prisma.tradeSubmission.upsert({
    where: { txId: submission.txId },
    update: {
      walletAddress: submission.walletAddress,
      side: submission.side,
      paymentToken: submission.paymentToken ?? null,
      paymentAmount: submission.paymentAmount ?? null,
      amountSats: submission.amountSats,
      tokenAmount: submission.tokenAmount,
      rawPayloadJson: submission.rawPayloadJson ?? undefined,
      status: "SUBMITTED",
      error: null,
      confirmedAt: null,
      blockHeight: null,
    },
    create: {
      projectId,
      txId: submission.txId,
      walletAddress: submission.walletAddress,
      side: submission.side,
      paymentToken: submission.paymentToken ?? null,
      paymentAmount: submission.paymentAmount ?? null,
      amountSats: submission.amountSats,
      tokenAmount: submission.tokenAmount,
      rawPayloadJson: submission.rawPayloadJson ?? null,
      status: "SUBMITTED",
    },
  });

  return { id: queued.id, txId: queued.txId, status: queued.status };
}

export async function listPendingTradeSubmissions(limit: number = 100): Promise<PendingTradeSubmission[]> {
  const rows = await prisma.tradeSubmission.findMany({
    where: { status: "SUBMITTED" },
    take: limit,
    orderBy: { submittedAt: "asc" },
    include: {
      project: {
        select: {
          ticker: true,
          launchStatus: true,
          poolAddress: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    projectId: row.projectId,
    ticker: row.project.ticker,
    launchStatus: row.project.launchStatus,
    poolAddress: row.project.poolAddress,
    txId: row.txId,
    walletAddress: row.walletAddress,
    side: row.side as "BUY" | "SELL",
    amountSats: row.amountSats,
    tokenAmount: row.tokenAmount,
    paymentToken: row.paymentToken,
    paymentAmount: row.paymentAmount,
    submittedAt: row.submittedAt,
  }));
}

export async function confirmTradeSubmission(projectId: string, event: SwapEvent): Promise<string> {
  const fillId = await recordTradeFill(projectId, event);

  await prisma.tradeSubmission.upsert({
    where: { txId: event.txId },
    update: {
      walletAddress: event.walletAddress,
      side: event.side,
      amountSats: event.amountSats,
      tokenAmount: event.tokenAmount,
      status: "CONFIRMED",
      error: null,
      confirmedAt: event.confirmedAt,
      blockHeight: event.blockHeight,
    },
    create: {
      projectId,
      txId: event.txId,
      walletAddress: event.walletAddress,
      side: event.side,
      amountSats: event.amountSats,
      tokenAmount: event.tokenAmount,
      status: "CONFIRMED",
      confirmedAt: event.confirmedAt,
      blockHeight: event.blockHeight,
    },
  });

  return fillId;
}

export async function failTradeSubmission(projectId: string, txId: string, error: string): Promise<boolean> {
  const existing = await prisma.tradeSubmission.findFirst({
    where: {
      projectId,
      txId,
    },
    select: { id: true },
  });

  if (!existing) return false;

  await prisma.tradeSubmission.update({
    where: { id: existing.id },
    data: {
      status: "FAILED",
      error,
      confirmedAt: null,
      blockHeight: null,
    },
  });

  return true;
}

function normalizeAddress(address: string | null | undefined): string {
  return (address ?? "").trim().toLowerCase();
}

function resolvePoolBaseToken(project: {
  poolBaseToken: string | null;
  liquidityToken: string | null;
}): LiquidityToken {
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

export async function getLiveQuote(
  projectId: string,
  side: "BUY" | "SELL",
  inputAmount: number,
): Promise<{
  available: boolean;
  priceSats: number;
  outputAmount: number;
  priceImpactBps: number;
  effectivePriceSats: number;
  reserveBase: number;
  reserveQuote: number;
  source: "live" | "indexed";
  snapshotAgeMs?: number;
} | null> {
  // Try live on-chain reserves first
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      poolAddress: true,
      contractAddress: true,
      liquidityToken: true,
      poolBaseToken: true,
      marketState: {
        select: {
          reserveBase: true,
          reserveQuote: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!project?.poolAddress || !project.contractAddress) {
    return null;
  }

  let reserveBase = 0;
  let reserveQuote = 0;
  let source: "live" | "indexed" = "indexed";
  let snapshotAgeMs: number | undefined;

  try {
    const baseToken = resolvePoolBaseToken(project);
    const baseTokenAddress = getLiquidityTokenContractAddress(baseToken);
    const liveState = await fetchLivePoolState(project.poolAddress);
    if (liveState) {
      const mapped = mapLiveReservesToBaseQuote(liveState, baseTokenAddress, project.contractAddress);
      if (mapped && mapped.reserveBase > 0 && mapped.reserveQuote > 0) {
        reserveBase = mapped.reserveBase;
        reserveQuote = mapped.reserveQuote;
        source = "live";
      }
    }
  } catch {
    // Fall through to indexed reserves if live RPC or runtime config is unavailable.
  }

  // Fall back to indexed reserves with freshness enforcement
  if (reserveBase <= 0 || reserveQuote <= 0) {
    const snapshot = await prisma.poolSnapshot.findFirst({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
    });
    const marketState = project.marketState ?? await prisma.projectMarketState.findUnique({
      where: { projectId },
      select: {
        reserveBase: true,
        reserveQuote: true,
        updatedAt: true,
      },
    });

    if ((!snapshot || snapshot.reserveBase <= 0 || snapshot.reserveQuote <= 0) && marketState) {
      snapshotAgeMs = Date.now() - marketState.updatedAt.getTime();
      if (
        snapshotAgeMs <= MARKET_INDEX_MAX_STALENESS_MS &&
        marketState.reserveBase > 0 &&
        marketState.reserveQuote > 0
      ) {
        reserveBase = marketState.reserveBase;
        reserveQuote = marketState.reserveQuote;
        source = "indexed";
      }
    }

    if ((reserveBase <= 0 || reserveQuote <= 0) && (!snapshot || snapshot.reserveBase <= 0 || snapshot.reserveQuote <= 0)) {
      return null;
    }

    if (reserveBase > 0 && reserveQuote > 0) {
      // A recent indexed market-state fallback is already available.
    } else {
    if (!snapshot) {
      return null;
    }
    snapshotAgeMs = Date.now() - snapshot.recordedAt.getTime();
    if (snapshotAgeMs > MARKET_INDEX_MAX_STALENESS_MS) {
      return null; // Indexed reserves are stale — refuse to quote
    }

    reserveBase = snapshot.reserveBase;
    reserveQuote = snapshot.reserveQuote;
    source = "indexed";
    }
  }

  const quote = getSwapQuote(reserveBase, reserveQuote, side, inputAmount);
  return {
    available: true,
    priceSats: priceFromReserves(reserveBase, reserveQuote),
    outputAmount: quote.outputAmount,
    priceImpactBps: quote.priceImpactBps,
    effectivePriceSats: quote.effectivePriceSats,
    reserveBase,
    reserveQuote,
    source,
    snapshotAgeMs,
  };
}

export async function getCandles(
  projectId: string,
  timeframe: string = "1h",
  limit: number = 100,
): Promise<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>> {
  const candles = await prisma.candleSnapshot.findMany({
    where: { projectId, timeframe },
    orderBy: { time: "desc" },
    take: limit,
  });

  return candles.reverse().map((candle) => ({
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));
}

export async function getMarketDataDiagnostics(projectId: string): Promise<MarketDataDiagnostics> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      poolAddress: true,
      marketState: {
        select: {
          reserveBase: true,
          reserveQuote: true,
          updatedAt: true,
        },
      },
    },
  });

  const latestSnapshot = await prisma.poolSnapshot.findFirst({
    where: { projectId },
    orderBy: [{ blockHeight: "desc" }, { recordedAt: "desc" }],
    select: {
      reserveBase: true,
      reserveQuote: true,
      blockHeight: true,
      recordedAt: true,
    },
  });

  const indexedUpdatedAt = latestSnapshot?.recordedAt ?? project?.marketState?.updatedAt ?? null;
  const staleAgeMs = indexedUpdatedAt ? Date.now() - indexedUpdatedAt.getTime() : null;
  const stale = staleAgeMs === null ? true : staleAgeMs > MARKET_INDEX_MAX_STALENESS_MS;
  const indexedStateAvailable = Boolean(
    latestSnapshot
      ? latestSnapshot.reserveBase > 0 && latestSnapshot.reserveQuote > 0
      : project?.marketState && project.marketState.reserveBase > 0 && project.marketState.reserveQuote > 0,
  );

  let liveStateAvailable = false;
  if (project?.poolAddress) {
    try {
      liveStateAvailable = Boolean(await fetchLivePoolState(project.poolAddress));
    } catch {
      liveStateAvailable = false;
    }
  }

  const dataBucket = liveStateAvailable
    ? "authoritative-live"
    : indexedStateAvailable
      ? "derived-indexed"
      : "unavailable";

  return {
    dataBucket,
    liveStateAvailable,
    indexedStateAvailable,
    degraded: !liveStateAvailable,
    stale,
    staleAgeMs,
    latestIndexedBlock: latestSnapshot?.blockHeight ?? null,
    latestIndexedAt: indexedUpdatedAt,
    confirmationsRequired: MARKET_CONFIRMATION_BLOCKS,
  };
}

export async function getPriceDelta24h(projectId: string): Promise<string> {
  const state = await prisma.projectMarketState.findUnique({
    where: { projectId },
  });
  if (!state || state.currentPriceSats <= 0) return "";

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const oldSnapshot = await prisma.poolSnapshot.findFirst({
    where: {
      projectId,
      recordedAt: { lte: oneDayAgo },
    },
    orderBy: { recordedAt: "desc" },
  });

  if (!oldSnapshot || oldSnapshot.priceSats <= 0) return "";

  const change = ((state.currentPriceSats - oldSnapshot.priceSats) / oldSnapshot.priceSats) * 100;
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}
