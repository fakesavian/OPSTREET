import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { verifyWalletToken } from "../middleware/verifyWalletToken.js";
import { getWalletInventory } from "../services/shopStore.js";

const SPRITE_IDS = ["sprite-adam", "sprite-alex", "sprite-amelia", "sprite-bob"] as const;
const SpriteSchema = z.enum(SPRITE_IDS);
const PlayerPatchSchema = z.object({
  displayName: z.string().trim().min(2).max(18).optional(),
  selectedSpriteId: SpriteSchema.optional(),
});

const SPRITE_OPTIONS = [
  { id: "sprite-adam", label: "Adam", imageUrl: "/sprites/characters/Adam_16x16.png" },
  { id: "sprite-alex", label: "Alex", imageUrl: "/sprites/characters/Alex_16x16.png" },
  { id: "sprite-amelia", label: "Amelia", imageUrl: "/sprites/characters/Amelia_16x16.png" },
  { id: "sprite-bob", label: "Bob", imageUrl: "/sprites/characters/Bob_16x16.png" },
] as const;

function normalizeSelectedSpriteId(value: string | null | undefined): (typeof SPRITE_IDS)[number] {
  if (value && (SPRITE_IDS as readonly string[]).includes(value)) {
    return value as (typeof SPRITE_IDS)[number];
  }
  return "sprite-adam";
}

export async function playerRoutes(app: FastifyInstance) {
  app.get("/players/me", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const walletAddress = request.walletSession?.walletAddress;
    if (!walletAddress) return reply.status(401).send({ error: "Authentication required." });

    const profile = await prisma.userProfile.upsert({
      where: { walletAddress },
      update: {},
      create: {
        walletAddress,
        displayName: walletAddress.slice(0, 8),
        activeAvatarId: "sprite-adam",
      },
    });

    const inventory = await getWalletInventory(walletAddress);
    return reply.send({
      walletAddress,
      displayName: profile.displayName,
      selectedSpriteId: normalizeSelectedSpriteId(profile.activeAvatarId),
      spriteOptions: SPRITE_OPTIONS,
      onchainInventory: inventory.map((row) => ({
        itemKey: row.itemKey,
        entitlement: row.entitlement,
        collectionAddress: row.collectionAddress,
        tokenId: row.tokenId,
        mintTxId: row.mintTxId,
        confirmedAt: row.confirmedAt,
        active: row.active,
        usedAt: row.usedAt,
        mintedAt: row.mintedAt,
      })),
    });
  });

  app.patch("/players/me", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const walletAddress = request.walletSession?.walletAddress;
    if (!walletAddress) return reply.status(401).send({ error: "Authentication required." });

    const parsed = PlayerPatchSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const next = await prisma.userProfile.upsert({
      where: { walletAddress },
      update: {
        ...(parsed.data.displayName ? { displayName: parsed.data.displayName } : {}),
        ...(parsed.data.selectedSpriteId ? { activeAvatarId: parsed.data.selectedSpriteId } : {}),
      },
      create: {
        walletAddress,
        displayName: parsed.data.displayName ?? walletAddress.slice(0, 8),
        activeAvatarId: parsed.data.selectedSpriteId ?? "sprite-adam",
      },
    });

    if (parsed.data.selectedSpriteId) {
      await prisma.roomPresence.updateMany({
        where: { walletAddress },
        data: { avatarId: parsed.data.selectedSpriteId },
      });
    }

    return reply.send({
      walletAddress,
      displayName: next.displayName,
      selectedSpriteId: normalizeSelectedSpriteId(next.activeAvatarId),
    });
  });

  app.get<{ Params: { playerId: string } }>("/players/:playerId", async (request, reply) => {
    const playerId = request.params.playerId;

    const [profile, stats, progress, reputation, badgeAwards, recentTrades, recentCallouts] = await Promise.all([
      prisma.userProfile.findUnique({ where: { walletAddress: playerId } }),
      prisma.playerStat.findMany({ where: { walletAddress: playerId } }),
      prisma.playerProgress.findUnique({ where: { walletAddress: playerId } }),
      prisma.playerReputation.findUnique({ where: { walletAddress: playerId } }),
      prisma.badgeAward.findMany({
        where: { walletAddress: playerId },
        include: { badge: true },
        orderBy: { awardedAt: "desc" },
      }),
      prisma.tradeFill.findMany({
        where: { walletAddress: playerId },
        include: {
          project: {
            select: { ticker: true },
          },
        },
        orderBy: { confirmedAt: "desc" },
        take: 10,
      }),
      prisma.callout.findMany({
        where: { walletAddress: playerId },
        include: { grade: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    if (!profile && stats.length === 0 && !progress && !reputation) {
      return reply.status(404).send({ error: "Player not found" });
    }

    const statsByRange = stats.reduce<Record<string, unknown>>((acc, row) => {
      acc[row.rangeKey] = {
        realizedPnlSats: row.realizedPnlSats,
        totalTrades: row.totalTrades,
        winningTrades: row.winningTrades,
        winRate: row.winRate,
        bestTradeMultiple: row.bestTradeMultiple,
        calloutBestMultiple: row.calloutBestMultiple,
        calloutAvgMultiple: row.calloutAvgMultiple,
        calloutsGraded: row.calloutsGraded,
        calloutHitRate: row.calloutHitRate,
        hotScore: row.hotScore,
        updatedAt: row.updatedAt.toISOString(),
      };
      return acc;
    }, {});

    return reply.send({
      walletAddress: playerId,
      displayName: profile?.displayName ?? playerId.slice(0, 8),
      avatarId: profile?.activeAvatarId ?? "default-free-1",
      level: progress?.level ?? 1,
      title: progress?.titleKey ?? "Rookie",
      xp: progress?.xp ?? 0,
      trustScore: reputation?.trustScore ?? 50,
      reputationComponents: (() => {
        if (!reputation?.componentsJson) return {};
        try {
          return JSON.parse(reputation.componentsJson) as Record<string, unknown>;
        } catch {
          return {};
        }
      })(),
      badges: badgeAwards.map((award) => ({
        id: award.badge.id,
        name: award.badge.name,
        description: award.badge.description,
        category: award.badge.category,
        tier: award.badge.tier,
        iconKey: award.badge.iconKey,
        awardedAt: award.awardedAt.toISOString(),
      })),
      stats: statsByRange,
      recentTrades: recentTrades.map((trade) => ({
        id: trade.id,
        tokenSymbol: trade.project.ticker,
        side: trade.side,
        amountSats: trade.amountSats,
        tokenAmount: trade.tokenAmount,
        priceSats: trade.priceSats,
        confirmedAt: trade.confirmedAt.toISOString(),
      })),
      recentCallouts: recentCallouts.map((callout) => ({
        id: callout.id,
        content: callout.content,
        projectId: callout.projectId,
        createdAt: callout.createdAt.toISOString(),
        grade: callout.grade
          ? {
              multiple: callout.grade.multiple,
              peakAt: callout.grade.peakAt.toISOString(),
              windowUsed: callout.grade.windowUsed,
              gradingVersion: callout.grade.gradingVersion,
              gradedAt: callout.grade.gradedAt.toISOString(),
            }
          : null,
      })),
    });
  });

  app.get<{ Params: { playerId: string } }>("/players/:playerId/callouts", async (request, reply) => {
    const playerId = request.params.playerId;
    const rows = await prisma.callout.findMany({
      where: { walletAddress: playerId },
      include: {
        grade: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return reply.send(
      rows.map((row) => ({
        id: row.id,
        walletAddress: row.walletAddress,
        content: row.content,
        projectId: row.projectId,
        createdAt: row.createdAt.toISOString(),
        grade: row.grade
          ? {
              multiple: row.grade.multiple,
              peakAt: row.grade.peakAt.toISOString(),
              windowUsed: row.grade.windowUsed,
              gradingVersion: row.grade.gradingVersion,
              gradedAt: row.grade.gradedAt.toISOString(),
            }
          : null,
      })),
    );
  });

  app.get<{ Params: { playerId: string } }>("/players/:playerId/badges", async (request, reply) => {
    const playerId = request.params.playerId;
    const awards = await prisma.badgeAward.findMany({
      where: { walletAddress: playerId },
      include: { badge: true },
      orderBy: { awardedAt: "desc" },
    });

    return reply.send(
      awards.map((award) => ({
        id: award.badge.id,
        name: award.badge.name,
        description: award.badge.description,
        category: award.badge.category,
        tier: award.badge.tier,
        iconKey: award.badge.iconKey,
        criteria: (() => {
          try {
            return JSON.parse(award.badge.criteriaJson) as Record<string, unknown>;
          } catch {
            return {};
          }
        })(),
        awardedAt: award.awardedAt.toISOString(),
      })),
    );
  });
}

