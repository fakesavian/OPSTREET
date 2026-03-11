import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

const EARNER_RANGES = new Set(["all", "30d", "7d"]);
const TRENDING_RANGES = new Set(["24h", "7d"]);

async function enrichLeaderboardRows(wallets: string[]): Promise<{
  progressByWallet: Map<string, { level: number; titleKey: string }>;
  repByWallet: Map<string, { trustScore: number }>;
  badgeByWallet: Map<string, { count: number; topIcons: string[] }>;
}> {
  if (wallets.length === 0) {
    return {
      progressByWallet: new Map(),
      repByWallet: new Map(),
      badgeByWallet: new Map(),
    };
  }

  const [progressRows, repRows, badgeRows] = await Promise.all([
    prisma.playerProgress.findMany({ where: { walletAddress: { in: wallets } } }),
    prisma.playerReputation.findMany({ where: { walletAddress: { in: wallets } } }),
    prisma.badgeAward.findMany({
      where: { walletAddress: { in: wallets } },
      include: { badge: { select: { iconKey: true } } },
      orderBy: { awardedAt: "desc" },
    }),
  ]);

  const progressByWallet = new Map(
    progressRows.map((row) => [row.walletAddress, { level: row.level, titleKey: row.titleKey }]),
  );
  const repByWallet = new Map(repRows.map((row) => [row.walletAddress, { trustScore: row.trustScore }]));

  const grouped = new Map<string, string[]>();
  for (const row of badgeRows) {
    const current = grouped.get(row.walletAddress) ?? [];
    current.push(row.badge.iconKey);
    grouped.set(row.walletAddress, current);
  }

  const badgeByWallet = new Map<string, { count: number; topIcons: string[] }>();
  for (const [wallet, icons] of grouped.entries()) {
    badgeByWallet.set(wallet, { count: icons.length, topIcons: icons.slice(0, 3) });
  }

  return { progressByWallet, repByWallet, badgeByWallet };
}

export async function leaderboardRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { range?: string; limit?: string } }>("/leaderboards/earners", async (request, reply) => {
    const range = request.query.range ?? "7d";
    if (!EARNER_RANGES.has(range)) {
      return reply.status(400).send({ error: "range must be one of: 7d, 30d, all" });
    }
    const limit = Math.min(Math.max(Number(request.query.limit ?? 50), 1), 100);

    const stats = await prisma.playerStat.findMany({
      where: { rangeKey: range },
      include: { user: { select: { displayName: true, activeAvatarId: true } } },
      orderBy: [{ realizedPnlSats: "desc" }, { hotScore: "desc" }],
      take: limit,
    });

    const wallets = stats.map((s) => s.walletAddress);
    const { progressByWallet, repByWallet, badgeByWallet } = await enrichLeaderboardRows(wallets);

    return reply.send({
      range,
      items: stats.map((row, idx) => {
        const progress = progressByWallet.get(row.walletAddress);
        const rep = repByWallet.get(row.walletAddress);
        const badge = badgeByWallet.get(row.walletAddress) ?? { count: 0, topIcons: [] };
        return {
          rank: idx + 1,
          walletAddress: row.walletAddress,
          displayName: row.user.displayName,
          avatarId: row.user.activeAvatarId,
          realizedPnlSats: row.realizedPnlSats,
          winRate: row.winRate,
          totalTrades: row.totalTrades,
          bestTradeMultiple: row.bestTradeMultiple,
          level: progress?.level ?? 1,
          title: progress?.titleKey ?? "Rookie",
          trustScore: rep?.trustScore ?? 50,
          badgesCount: badge.count,
          topBadgeIcons: badge.topIcons,
        };
      }),
    });
  });

  app.get<{ Querystring: { range?: string; limit?: string } }>("/leaderboards/callouts", async (request, reply) => {
    const range = request.query.range ?? "7d";
    if (!EARNER_RANGES.has(range)) {
      return reply.status(400).send({ error: "range must be one of: 7d, 30d, all" });
    }
    const limit = Math.min(Math.max(Number(request.query.limit ?? 50), 1), 100);

    const stats = await prisma.playerStat.findMany({
      where: { rangeKey: range },
      include: { user: { select: { displayName: true, activeAvatarId: true } } },
      orderBy: [{ calloutBestMultiple: "desc" }, { calloutAvgMultiple: "desc" }, { calloutsGraded: "desc" }],
      take: limit,
    });

    const wallets = stats.map((s) => s.walletAddress);
    const { progressByWallet, repByWallet, badgeByWallet } = await enrichLeaderboardRows(wallets);

    return reply.send({
      range,
      items: stats.map((row, idx) => {
        const progress = progressByWallet.get(row.walletAddress);
        const rep = repByWallet.get(row.walletAddress);
        const badge = badgeByWallet.get(row.walletAddress) ?? { count: 0, topIcons: [] };
        return {
          rank: idx + 1,
          walletAddress: row.walletAddress,
          displayName: row.user.displayName,
          avatarId: row.user.activeAvatarId,
          calloutBestMultiple: row.calloutBestMultiple,
          calloutAvgMultiple: row.calloutAvgMultiple,
          calloutsGraded: row.calloutsGraded,
          calloutHitRate: row.calloutHitRate,
          level: progress?.level ?? 1,
          title: progress?.titleKey ?? "Rookie",
          trustScore: rep?.trustScore ?? 50,
          badgesCount: badge.count,
          topBadgeIcons: badge.topIcons,
        };
      }),
    });
  });

  app.get<{ Querystring: { range?: string; limit?: string } }>("/leaderboards/trending", async (request, reply) => {
    const range = request.query.range ?? "24h";
    if (!TRENDING_RANGES.has(range)) {
      return reply.status(400).send({ error: "range must be one of: 24h, 7d" });
    }
    const limit = Math.min(Math.max(Number(request.query.limit ?? 50), 1), 100);

    const stats = await prisma.playerStat.findMany({
      where: { rangeKey: range },
      include: { user: { select: { displayName: true, activeAvatarId: true } } },
      orderBy: [{ hotScore: "desc" }, { realizedPnlSats: "desc" }],
      take: limit,
    });

    const wallets = stats.map((s) => s.walletAddress);
    const { progressByWallet, repByWallet, badgeByWallet } = await enrichLeaderboardRows(wallets);

    return reply.send({
      range,
      items: stats.map((row, idx) => {
        const progress = progressByWallet.get(row.walletAddress);
        const rep = repByWallet.get(row.walletAddress);
        const badge = badgeByWallet.get(row.walletAddress) ?? { count: 0, topIcons: [] };
        return {
          rank: idx + 1,
          walletAddress: row.walletAddress,
          displayName: row.user.displayName,
          avatarId: row.user.activeAvatarId,
          hotScore: row.hotScore,
          realizedPnlSats: row.realizedPnlSats,
          calloutHitRate: row.calloutHitRate,
          totalTrades: row.totalTrades,
          level: progress?.level ?? 1,
          title: progress?.titleKey ?? "Rookie",
          trustScore: rep?.trustScore ?? 50,
          badgesCount: badge.count,
          topBadgeIcons: badge.topIcons,
        };
      }),
    });
  });
}
