import { prisma } from "../db.js";

type RangeKey = "all" | "30d" | "7d" | "24h";

interface RangeDef {
  key: RangeKey;
  windowMs: number | null;
}

const RANGES: RangeDef[] = [
  { key: "all", windowMs: null },
  { key: "30d", windowMs: 30 * 24 * 60 * 60 * 1000 },
  { key: "7d", windowMs: 7 * 24 * 60 * 60 * 1000 },
  { key: "24h", windowMs: 24 * 60 * 60 * 1000 },
];

const BADGE_DEFINITIONS = [
  {
    id: "trade-first",
    name: "First Trade",
    description: "Completed your first confirmed trade",
    category: "TRADING",
    tier: "BRONZE",
    iconKey: "trade-1",
    criteria: { type: "trade_count", gte: 1 },
  },
  {
    id: "trade-10",
    name: "10 Trades",
    description: "Completed 10 confirmed trades",
    category: "TRADING",
    tier: "SILVER",
    iconKey: "trade-10",
    criteria: { type: "trade_count", gte: 10 },
  },
  {
    id: "trade-100",
    name: "100 Trades",
    description: "Completed 100 confirmed trades",
    category: "TRADING",
    tier: "GOLD",
    iconKey: "trade-100",
    criteria: { type: "trade_count", gte: 100 },
  },
  {
    id: "pnl-100k",
    name: "Profit 100k sats",
    description: "Reached 100,000 sats realized PnL",
    category: "EARNINGS",
    tier: "BRONZE",
    iconKey: "pnl-100k",
    criteria: { type: "pnl_sats", gte: 100_000 },
  },
  {
    id: "pnl-1m",
    name: "Profit 1M sats",
    description: "Reached 1,000,000 sats realized PnL",
    category: "EARNINGS",
    tier: "SILVER",
    iconKey: "pnl-1m",
    criteria: { type: "pnl_sats", gte: 1_000_000 },
  },
  {
    id: "callout-first",
    name: "First Graded Callout",
    description: "Received a graded signal score",
    category: "SIGNAL",
    tier: "BRONZE",
    iconKey: "callout-1",
    criteria: { type: "callout_count", gte: 1 },
  },
  {
    id: "callout-2x",
    name: "First 2x Callout",
    description: "Hit at least 2x on a graded callout",
    category: "SIGNAL",
    tier: "SILVER",
    iconKey: "callout-2x",
    criteria: { type: "callout_multiple", gte: 2 },
  },
  {
    id: "callout-10x",
    name: "First 10x Callout",
    description: "Hit at least 10x on a graded callout",
    category: "SIGNAL",
    tier: "GOLD",
    iconKey: "callout-10x",
    criteria: { type: "callout_multiple", gte: 10 },
  },
  {
    id: "callout-40x",
    name: "First 40x Callout",
    description: "Hit at least 40x on a graded callout",
    category: "SIGNAL",
    tier: "LEGEND",
    iconKey: "callout-40x",
    criteria: { type: "callout_multiple", gte: 40 },
  },
  {
    id: "callout-avg-2x",
    name: "Signal Consistency",
    description: "10+ graded callouts with average at least 2x",
    category: "SIGNAL",
    tier: "GOLD",
    iconKey: "callout-avg-2x",
    criteria: { type: "callout_avg", gte: 2, minCount: 10 },
  },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function nowCutoff(windowMs: number | null): Date | null {
  if (!windowMs) return null;
  return new Date(Date.now() - windowMs);
}

function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 100)) + 1);
}

function titleFromLevel(level: number): string {
  if (level >= 20) return "Legend";
  if (level >= 10) return "Whale";
  if (level >= 5) return "Operator";
  return "Rookie";
}

async function ensureBadgeDefinitions(): Promise<void> {
  for (const badge of BADGE_DEFINITIONS) {
    await prisma.badgeDefinition.upsert({
      where: { id: badge.id },
      update: {
        name: badge.name,
        description: badge.description,
        category: badge.category,
        tier: badge.tier,
        iconKey: badge.iconKey,
        criteriaJson: JSON.stringify(badge.criteria),
      },
      create: {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        category: badge.category,
        tier: badge.tier,
        iconKey: badge.iconKey,
        criteriaJson: JSON.stringify(badge.criteria),
      },
    });
  }
}

async function aggregateForRange(walletAddress: string, range: RangeDef): Promise<{
  realizedPnlSats: number;
  totalTrades: number;
  winningTrades: number;
  winRate: number;
  bestTradeMultiple: number;
  calloutBestMultiple: number;
  calloutAvgMultiple: number;
  calloutsGraded: number;
  calloutHitRate: number;
  hotScore: number;
}> {
  const cutoff = nowCutoff(range.windowMs);

  // Read from confirmed TradeFill rows only.
  const [trades, grades] = await Promise.all([
    prisma.tradeFill.findMany({
      where: {
        walletAddress,
        ...(cutoff ? { confirmedAt: { gte: cutoff } } : {}),
      },
      select: { amountSats: true, priceSats: true, side: true, tokenAmount: true },
    }),
    prisma.calloutGrade.findMany({
      where: {
        walletAddress,
        ...(cutoff ? { gradedAt: { gte: cutoff } } : {}),
      },
      select: { multiple: true },
    }),
  ]);

  // Compute PnL from confirmed fills (buy fills are negative PnL, sell fills are positive)
  const realizedPnlSats = trades.reduce((sum, t) => {
    return sum + (t.side === "SELL" ? t.amountSats : -t.amountSats);
  }, 0);
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => t.side === "SELL" && t.amountSats > 0).length;
  const winRate = totalTrades > 0 ? round((winningTrades / totalTrades) * 100) : 0;
  const bestTradeMultiple = 0; // Not applicable without entry/exit tracking per position

  const calloutsGraded = grades.length;
  const calloutBestMultiple = grades.length > 0 ? Math.max(...grades.map((g) => g.multiple)) : 0;
  const calloutAvgMultiple =
    grades.length > 0
      ? round(grades.reduce((sum, g) => sum + g.multiple, 0) / grades.length)
      : 0;
  const calloutHitRate =
    grades.length > 0
      ? round((grades.filter((g) => g.multiple >= 2).length / grades.length) * 100)
      : 0;

  // Momentum score for trending: weighted recent profit + signal quality + activity.
  const hotScore = round(
    realizedPnlSats * 0.001 +
      totalTrades * 2 +
      grades.filter((g) => g.multiple >= 2).length * 8 +
      calloutAvgMultiple * 10,
  );

  return {
    realizedPnlSats,
    totalTrades,
    winningTrades,
    winRate,
    bestTradeMultiple: round(bestTradeMultiple),
    calloutBestMultiple: round(calloutBestMultiple),
    calloutAvgMultiple,
    calloutsGraded,
    calloutHitRate,
    hotScore,
  };
}

export async function refreshPlayerStats(walletAddress: string): Promise<void> {
  for (const range of RANGES) {
    const metrics = await aggregateForRange(walletAddress, range);
    await prisma.playerStat.upsert({
      where: { walletAddress_rangeKey: { walletAddress, rangeKey: range.key } },
      update: metrics,
      create: {
        walletAddress,
        rangeKey: range.key,
        ...metrics,
      },
    });
  }
}

export async function addXp(
  walletAddress: string,
  type: string,
  amount: number,
  sourceEventId?: string,
): Promise<void> {
  if (amount <= 0) return;

  const current = await prisma.playerProgress.findUnique({ where: { walletAddress } });
  const xp = (current?.xp ?? 0) + amount;
  const level = levelFromXp(xp);
  const titleKey = titleFromLevel(level);

  await prisma.xpEvent.create({
    data: { walletAddress, type, amount, sourceEventId: sourceEventId ?? null },
  });

  await prisma.playerProgress.upsert({
    where: { walletAddress },
    update: { xp, level, titleKey },
    create: { walletAddress, xp, level, titleKey },
  });
}

export async function recomputeReputation(walletAddress: string): Promise<void> {
  const [profile, allStats] = await Promise.all([
    prisma.userProfile.findUnique({ where: { walletAddress } }),
    prisma.playerStat.findUnique({ where: { walletAddress_rangeKey: { walletAddress, rangeKey: "all" } } }),
  ]);

  const accountAgeDays = profile
    ? Math.max(0, (Date.now() - profile.createdAt.getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  const ageScore = clamp(accountAgeDays / 90, 0, 1); // 90+ days = full age score
  const tradeScore = clamp((allStats?.totalTrades ?? 0) / 50, 0, 1);
  const signalScore = clamp((allStats?.calloutHitRate ?? 0) / 100, 0, 1);
  const activityScore = clamp(((allStats?.totalTrades ?? 0) + (allStats?.calloutsGraded ?? 0)) / 120, 0, 1);
  const spamPenalty = clamp((profile?.chatSpamCount ?? 0) * 0.1, 0, 0.35);

  const trust = clamp(
    Math.round((ageScore * 20 + tradeScore * 25 + signalScore * 35 + activityScore * 20) * (1 - spamPenalty)),
    0,
    100,
  );

  await prisma.playerReputation.upsert({
    where: { walletAddress },
    update: {
      trustScore: trust,
      componentsJson: JSON.stringify({
        accountAgeDays: round(accountAgeDays),
        ageScore: round(ageScore),
        tradeScore: round(tradeScore),
        signalScore: round(signalScore),
        activityScore: round(activityScore),
        spamPenalty: round(spamPenalty),
      }),
    },
    create: {
      walletAddress,
      trustScore: trust,
      componentsJson: JSON.stringify({
        accountAgeDays: round(accountAgeDays),
        ageScore: round(ageScore),
        tradeScore: round(tradeScore),
        signalScore: round(signalScore),
        activityScore: round(activityScore),
        spamPenalty: round(spamPenalty),
      }),
    },
  });
}

interface BadgeContext {
  totalTrades: number;
  realizedPnlSats: number;
  calloutsGraded: number;
  calloutBestMultiple: number;
  calloutAvgMultiple: number;
}

function isBadgeEligible(criteria: Record<string, unknown>, context: BadgeContext): boolean {
  const type = typeof criteria.type === "string" ? criteria.type : "";
  switch (type) {
    case "trade_count": {
      const gte = typeof criteria.gte === "number" ? criteria.gte : Number(criteria.gte ?? 0);
      return context.totalTrades >= gte;
    }
    case "pnl_sats": {
      const gte = typeof criteria.gte === "number" ? criteria.gte : Number(criteria.gte ?? 0);
      return context.realizedPnlSats >= gte;
    }
    case "callout_count": {
      const gte = typeof criteria.gte === "number" ? criteria.gte : Number(criteria.gte ?? 0);
      return context.calloutsGraded >= gte;
    }
    case "callout_multiple": {
      const gte = typeof criteria.gte === "number" ? criteria.gte : Number(criteria.gte ?? 0);
      return context.calloutBestMultiple >= gte;
    }
    case "callout_avg": {
      const gte = typeof criteria.gte === "number" ? criteria.gte : Number(criteria.gte ?? 0);
      const minCount =
        typeof criteria.minCount === "number" ? criteria.minCount : Number(criteria.minCount ?? 0);
      return context.calloutsGraded >= minCount && context.calloutAvgMultiple >= gte;
    }
    default:
      return false;
  }
}

export async function evaluateBadges(walletAddress: string, sourceEventId?: string): Promise<void> {
  await ensureBadgeDefinitions();

  const stat = await prisma.playerStat.findUnique({
    where: { walletAddress_rangeKey: { walletAddress, rangeKey: "all" } },
  });

  const context: BadgeContext = {
    totalTrades: stat?.totalTrades ?? 0,
    realizedPnlSats: stat?.realizedPnlSats ?? 0,
    calloutsGraded: stat?.calloutsGraded ?? 0,
    calloutBestMultiple: stat?.calloutBestMultiple ?? 0,
    calloutAvgMultiple: stat?.calloutAvgMultiple ?? 0,
  };

  const defs = await prisma.badgeDefinition.findMany();
  for (const badge of defs) {
    let criteria: Record<string, unknown>;
    try {
      criteria = JSON.parse(badge.criteriaJson) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (!isBadgeEligible(criteria, context)) continue;

    await prisma.badgeAward.upsert({
      where: { walletAddress_badgeId: { walletAddress, badgeId: badge.id } },
      update: {},
      create: {
        walletAddress,
        badgeId: badge.id,
        sourceEventId: sourceEventId ?? null,
      },
    });
  }
}

/**
 * Grade a callout using live market data.
 *
 * Callout grading requires a live pool with confirmed trades. If the project
 * has no live market data, grading is skipped (the callout remains ungraded).
 * No synthetic/deterministic multiples are generated.
 */
export async function gradeCallout(
  calloutId: string,
  walletAddress: string,
  projectId?: string | null,
): Promise<void> {
  const existing = await prisma.calloutGrade.findUnique({ where: { calloutId } });
  if (existing) return;

  if (!projectId) return; // No project = no price to grade against

  // Look up market state for the project
  const marketState = await prisma.projectMarketState.findUnique({
    where: { projectId },
  });

  // Cannot grade without live price data
  if (!marketState || marketState.currentPriceSats <= 0) {
    return; // Callout remains ungraded — will be graded when live data arrives
  }

  // Get the price at callout time from the closest candle
  const callout = await prisma.callout.findUnique({
    where: { id: calloutId },
    select: { createdAt: true },
  });
  if (!callout) return;

  const calloutTimeSec = Math.floor(callout.createdAt.getTime() / 1000);
  const calloutCandle = await prisma.candleSnapshot.findFirst({
    where: {
      projectId,
      timeframe: "1h",
      time: { lte: calloutTimeSec },
    },
    orderBy: { time: "desc" },
  });

  const entryPrice = calloutCandle?.close ?? marketState.currentPriceSats;
  if (entryPrice <= 0) return;

  // Find peak price since callout (from 1h candles)
  const peakCandle = await prisma.candleSnapshot.findFirst({
    where: {
      projectId,
      timeframe: "1h",
      time: { gte: calloutTimeSec },
    },
    orderBy: { high: "desc" },
  });

  if (!peakCandle) return; // No candles since callout = can't grade yet

  const peakPrice = peakCandle.high;
  const multiple = round(peakPrice / entryPrice, 2);
  const peakAt = new Date(peakCandle.time * 1000);

  await prisma.calloutGrade.create({
    data: {
      calloutId,
      walletAddress,
      multiple,
      peakAt,
      windowUsed: "7d",
      gradingVersion: 2, // v2 = live grading
    },
  });

  await refreshPlayerStats(walletAddress);
  await addXp(walletAddress, "callout_graded", 20, calloutId);
  await recomputeReputation(walletAddress);
  await evaluateBadges(walletAddress, calloutId);
}

export async function recordFoundationProgressFromTrade(walletAddress: string, tradeId: string): Promise<void> {
  await refreshPlayerStats(walletAddress);
  await addXp(walletAddress, "confirmed_trade", 35, tradeId);
  await recomputeReputation(walletAddress);
  await evaluateBadges(walletAddress, tradeId);
}

export async function recordFoundationProgressFromProjectCreate(walletAddress: string, projectId: string): Promise<void> {
  await addXp(walletAddress, "project_create", 25, projectId);
  await refreshPlayerStats(walletAddress);
  await recomputeReputation(walletAddress);
  await evaluateBadges(walletAddress, projectId);
}

export async function seedFoundationData(): Promise<void> {
  await ensureBadgeDefinitions();
}
