import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { verifyWalletToken, type WalletSession } from "../middleware/verifyWalletToken.js";
import { getWalletInventory } from "../services/shopStore.js";

const SPRITE_IDS = ["sprite-adam", "sprite-alex", "sprite-amelia", "sprite-bob"] as const;
const SpriteSchema = z.enum(SPRITE_IDS);
const PlayerPatchSchema = z.object({
  displayName: z.string().trim().min(2).max(18).optional(),
  bio: z.string().trim().max(180).optional(),
  selectedSpriteId: SpriteSchema.optional(),
});

const SPRITE_OPTIONS = [
  { id: "sprite-adam", label: "Adam", imageUrl: "/sprites/characters/Adam_16x16.png" },
  { id: "sprite-alex", label: "Alex", imageUrl: "/sprites/characters/Alex_16x16.png" },
  { id: "sprite-amelia", label: "Amelia", imageUrl: "/sprites/characters/Amelia_16x16.png" },
  { id: "sprite-bob", label: "Bob", imageUrl: "/sprites/characters/Bob_16x16.png" },
] as const;

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function labelForCharacterId(id: string): string {
  const sprite = SPRITE_OPTIONS.find((option) => option.id === id);
  if (sprite) return sprite.label;
  if (id.startsWith("default-free-")) {
    return `Street ${id.split("-").at(-1) ?? "1"}`;
  }
  return titleCase(id.replace(/^achievement-/, ""));
}

function spritePreviewFor(id: string): { label: string; imageUrl: string | null } {
  const sprite = SPRITE_OPTIONS.find((option) => option.id === id);
  return {
    label: sprite?.label ?? labelForCharacterId(id),
    imageUrl: sprite?.imageUrl ?? null,
  };
}

function normalizeSelectedSpriteId(value: string | null | undefined): (typeof SPRITE_IDS)[number] {
  if (value && (SPRITE_IDS as readonly string[]).includes(value)) {
    return value as (typeof SPRITE_IDS)[number];
  }
  return "sprite-adam";
}

async function readSocialCounts(walletAddress: string): Promise<{ followerCount: number; followingCount: number }> {
  const [followerCount, followingCount] = await Promise.all([
    prisma.userFollow.count({ where: { followingWallet: walletAddress } }),
    prisma.userFollow.count({ where: { followerWallet: walletAddress } }),
  ]);

  return { followerCount, followingCount };
}

function readOptionalViewerWallet(request: FastifyRequest): string | null {
  try {
    const token = (request.cookies as Record<string, string | undefined>)["opfun_session"];
    if (!token) return null;
    const payload = request.server.jwt.verify<WalletSession>(token);
    return payload.walletAddress;
  } catch {
    return null;
  }
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
        bio: "",
        activeAvatarId: "sprite-adam",
      },
    });

    const [inventory, social] = await Promise.all([
      getWalletInventory(walletAddress),
      readSocialCounts(walletAddress),
    ]);
    return reply.send({
      walletAddress,
      displayName: profile.displayName,
      bio: profile.bio,
      selectedSpriteId: normalizeSelectedSpriteId(profile.activeAvatarId),
      followerCount: social.followerCount,
      followingCount: social.followingCount,
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
        ...(parsed.data.bio !== undefined ? { bio: parsed.data.bio } : {}),
        ...(parsed.data.selectedSpriteId ? { activeAvatarId: parsed.data.selectedSpriteId } : {}),
      },
      create: {
        walletAddress,
        displayName: parsed.data.displayName ?? walletAddress.slice(0, 8),
        bio: parsed.data.bio ?? "",
        activeAvatarId: parsed.data.selectedSpriteId ?? "sprite-adam",
      },
    });

    if (parsed.data.selectedSpriteId) {
      await prisma.roomPresence.updateMany({
        where: { walletAddress },
        data: { avatarId: parsed.data.selectedSpriteId },
      });
    }

    const social = await readSocialCounts(walletAddress);

    return reply.send({
      walletAddress,
      displayName: next.displayName,
      bio: next.bio,
      selectedSpriteId: normalizeSelectedSpriteId(next.activeAvatarId),
      followerCount: social.followerCount,
      followingCount: social.followingCount,
    });
  });

  app.post<{ Params: { playerId: string } }>("/players/:playerId/follow", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const followerWallet = request.walletSession?.walletAddress;
    const followingWallet = request.params.playerId;
    if (!followerWallet) return reply.status(401).send({ error: "Authentication required." });
    if (followerWallet === followingWallet) {
      return reply.status(400).send({ error: "You cannot follow yourself." });
    }

    await Promise.all([
      prisma.userProfile.upsert({
        where: { walletAddress: followerWallet },
        update: {},
        create: {
          walletAddress: followerWallet,
          displayName: followerWallet.slice(0, 8),
          bio: "",
          activeAvatarId: "sprite-adam",
        },
      }),
      prisma.userProfile.upsert({
        where: { walletAddress: followingWallet },
        update: {},
        create: {
          walletAddress: followingWallet,
          displayName: followingWallet.slice(0, 8),
          bio: "",
          activeAvatarId: "sprite-adam",
        },
      }),
    ]);

    await prisma.userFollow.upsert({
      where: {
        followerWallet_followingWallet: {
          followerWallet,
          followingWallet,
        },
      },
      update: {},
      create: {
        followerWallet,
        followingWallet,
      },
    });

    return reply.send(await readSocialCounts(followingWallet));
  });

  app.delete<{ Params: { playerId: string } }>("/players/:playerId/follow", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const followerWallet = request.walletSession?.walletAddress;
    const followingWallet = request.params.playerId;
    if (!followerWallet) return reply.status(401).send({ error: "Authentication required." });

    await prisma.userFollow.deleteMany({
      where: {
        followerWallet,
        followingWallet,
      },
    });

    return reply.send(await readSocialCounts(followingWallet));
  });

  app.get<{ Querystring: { q?: string; limit?: string } }>("/players/search", async (request, reply) => {
    const query = (request.query.q ?? "").trim();
    const limit = Math.min(Math.max(Number(request.query.limit ?? 12), 1), 24);

    if (!query) {
      const stats = await prisma.playerStat.findMany({
        where: { rangeKey: "24h" },
        include: { user: { select: { displayName: true, activeAvatarId: true } } },
        orderBy: [{ hotScore: "desc" }, { realizedPnlSats: "desc" }],
        take: limit,
      });

      const wallets = stats.map((row) => row.walletAddress);
      const [progressRows, reputationRows, badgeRows] = await Promise.all([
        prisma.playerProgress.findMany({ where: { walletAddress: { in: wallets } } }),
        prisma.playerReputation.findMany({ where: { walletAddress: { in: wallets } } }),
        prisma.badgeAward.findMany({ where: { walletAddress: { in: wallets } } }),
      ]);

      const progressByWallet = new Map(progressRows.map((row) => [row.walletAddress, row]));
      const reputationByWallet = new Map(reputationRows.map((row) => [row.walletAddress, row]));
      const badgeCountByWallet = badgeRows.reduce<Map<string, number>>((acc, row) => {
        acc.set(row.walletAddress, (acc.get(row.walletAddress) ?? 0) + 1);
        return acc;
      }, new Map());

      return reply.send(stats.map((row) => ({
        walletAddress: row.walletAddress,
        displayName: row.user.displayName,
        avatarId: row.user.activeAvatarId,
        level: progressByWallet.get(row.walletAddress)?.level ?? 1,
        title: progressByWallet.get(row.walletAddress)?.titleKey ?? "Rookie",
        trustScore: reputationByWallet.get(row.walletAddress)?.trustScore ?? 50,
        badgesCount: badgeCountByWallet.get(row.walletAddress) ?? 0,
        hotScore: row.hotScore,
        realizedPnlSats: row.realizedPnlSats,
        calloutHitRate: row.calloutHitRate,
        totalTrades: row.totalTrades,
      })));
    }

    const profiles = await prisma.userProfile.findMany({
      where: {
        OR: [
          { walletAddress: { contains: query } },
          { displayName: { contains: query } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    if (profiles.length === 0) {
      return reply.send([]);
    }

    const wallets = profiles.map((row) => row.walletAddress);
    const [progressRows, reputationRows, badgeRows, statRows] = await Promise.all([
      prisma.playerProgress.findMany({ where: { walletAddress: { in: wallets } } }),
      prisma.playerReputation.findMany({ where: { walletAddress: { in: wallets } } }),
      prisma.badgeAward.findMany({ where: { walletAddress: { in: wallets } } }),
      prisma.playerStat.findMany({
        where: {
          walletAddress: { in: wallets },
          rangeKey: { in: ["24h", "7d"] },
        },
      }),
    ]);

    const progressByWallet = new Map(progressRows.map((row) => [row.walletAddress, row]));
    const reputationByWallet = new Map(reputationRows.map((row) => [row.walletAddress, row]));
    const badgeCountByWallet = badgeRows.reduce<Map<string, number>>((acc, row) => {
      acc.set(row.walletAddress, (acc.get(row.walletAddress) ?? 0) + 1);
      return acc;
    }, new Map());
    const statsByWallet = new Map<string, (typeof statRows)[number]>();
    for (const row of statRows) {
      const current = statsByWallet.get(row.walletAddress);
      if (!current || current.rangeKey !== "24h") {
        statsByWallet.set(row.walletAddress, row);
      }
    }

    return reply.send(profiles.map((profile) => {
      const progress = progressByWallet.get(profile.walletAddress);
      const reputation = reputationByWallet.get(profile.walletAddress);
      const stats = statsByWallet.get(profile.walletAddress);
      return {
        walletAddress: profile.walletAddress,
        displayName: profile.displayName,
        avatarId: profile.activeAvatarId,
        level: progress?.level ?? 1,
        title: progress?.titleKey ?? "Rookie",
        trustScore: reputation?.trustScore ?? 50,
        badgesCount: badgeCountByWallet.get(profile.walletAddress) ?? 0,
        hotScore: stats?.hotScore ?? 0,
        realizedPnlSats: stats?.realizedPnlSats ?? 0,
        calloutHitRate: stats?.calloutHitRate ?? 0,
        totalTrades: stats?.totalTrades ?? 0,
      };
    }));
  });

  app.get<{ Params: { playerId: string } }>("/players/:playerId", async (request, reply) => {
    const playerId = request.params.playerId;

    const [profile, stats, progress, reputation, foundation, badgeAwards, recentTrades, recentCallouts, tradeHistory, avatarOwnerships] = await Promise.all([
      prisma.userProfile.findUnique({ where: { walletAddress: playerId } }),
      prisma.playerStat.findMany({ where: { walletAddress: playerId } }),
      prisma.playerProgress.findUnique({ where: { walletAddress: playerId } }),
      prisma.playerReputation.findUnique({ where: { walletAddress: playerId } }),
      prisma.achievementProgress.findUnique({ where: { walletAddress: playerId } }),
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
      prisma.tradeFill.findMany({
        where: { walletAddress: playerId },
        include: {
          project: {
            select: { id: true, slug: true, ticker: true, name: true },
          },
        },
        orderBy: { confirmedAt: "desc" },
      }),
      prisma.userAvatarOwnership.findMany({
        where: { walletAddress: playerId },
        include: {
          avatar: {
            select: { id: true, name: true, emoji: true, tier: true },
          },
        },
      }),
    ]);

    if (!profile && stats.length === 0 && !progress && !reputation) {
      return reply.status(404).send({ error: "Player not found" });
    }

    const positionProjectIds = [...new Set(tradeHistory.map((row) => row.projectId))];
    const marketStates = positionProjectIds.length > 0
      ? await prisma.projectMarketState.findMany({
          where: { projectId: { in: positionProjectIds } },
        })
      : [];
    const marketStateByProjectId = new Map(marketStates.map((row) => [row.projectId, row]));

    const positions = new Map<string, {
      projectId: string;
      slug: string;
      ticker: string;
      name: string;
      tokenAmount: number;
      netFlowSats: number;
      tradeCount: number;
      lastTradeAt: string;
    }>();
    for (const trade of tradeHistory) {
      const current = positions.get(trade.projectId) ?? {
        projectId: trade.projectId,
        slug: trade.project.slug,
        ticker: trade.project.ticker,
        name: trade.project.name,
        tokenAmount: 0,
        netFlowSats: 0,
        tradeCount: 0,
        lastTradeAt: trade.confirmedAt.toISOString(),
      };
      current.tokenAmount += trade.side === "BUY" ? trade.tokenAmount : -trade.tokenAmount;
      current.netFlowSats += trade.side === "BUY" ? trade.amountSats : -trade.amountSats;
      current.tradeCount += 1;
      if (trade.confirmedAt.toISOString() > current.lastTradeAt) {
        current.lastTradeAt = trade.confirmedAt.toISOString();
      }
      positions.set(trade.projectId, current);
    }

    const currentPositions = [...positions.values()]
      .filter((row) => Math.abs(row.tokenAmount) > 0.000001)
      .map((row) => {
        const marketState = marketStateByProjectId.get(row.projectId);
        const currentPriceSats = marketState?.currentPriceSats ?? 0;
        return {
          projectId: row.projectId,
          slug: row.slug,
          ticker: row.ticker,
          name: row.name,
          tokenAmount: Number(row.tokenAmount.toFixed(4)),
          netFlowSats: row.netFlowSats,
          currentPriceSats,
          estimatedValueSats: Math.round(Math.max(row.tokenAmount, 0) * currentPriceSats),
          tradeCount: row.tradeCount,
          lastTradeAt: row.lastTradeAt,
        };
      })
      .sort((a, b) => b.estimatedValueSats - a.estimatedValueSats || b.tokenAmount - a.tokenAmount);

    const currentCharactersMap = new Map<string, {
      id: string;
      label: string;
      imageUrl: string | null;
      emoji: string | null;
      tier: string;
      active: boolean;
    }>();
    for (const row of avatarOwnerships) {
      currentCharactersMap.set(row.avatar.id, {
        id: row.avatar.id,
        label: row.avatar.name,
        imageUrl: null,
        emoji: row.avatar.emoji,
        tier: row.avatar.tier,
        active: row.avatar.id === profile?.activeAvatarId,
      });
    }

    const activeCharacterId = profile?.activeAvatarId ?? "default-free-1";
    if (!currentCharactersMap.has(activeCharacterId)) {
      const preview = spritePreviewFor(activeCharacterId);
      currentCharactersMap.set(activeCharacterId, {
        id: activeCharacterId,
        label: preview.label,
        imageUrl: preview.imageUrl,
        emoji: null,
        tier: "ACTIVE",
        active: true,
      });
    }

    const currentCharacters = [...currentCharactersMap.values()]
      .map((row) => ({
        ...row,
        active: row.id === activeCharacterId,
      }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.label.localeCompare(b.label));

    const viewerWalletAddress = readOptionalViewerWallet(request);
    const [social, viewerFollow] = await Promise.all([
      readSocialCounts(playerId),
      viewerWalletAddress && viewerWalletAddress !== playerId
        ? prisma.userFollow.findUnique({
            where: {
              followerWallet_followingWallet: {
                followerWallet: viewerWalletAddress,
                followingWallet: playerId,
              },
            },
          })
        : Promise.resolve(null),
    ]);
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
      bio: profile?.bio ?? "",
      avatarId: profile?.activeAvatarId ?? "default-free-1",
      level: progress?.level ?? 1,
      title: progress?.titleKey ?? "Rookie",
      xp: progress?.xp ?? 0,
      trustScore: reputation?.trustScore ?? 50,
      followerCount: social.followerCount,
      followingCount: social.followingCount,
      viewerIsSelf: viewerWalletAddress === playerId,
      viewerIsFollowing: viewerFollow !== null,
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
      foundation: {
        tokensCreated: foundation?.tokensCreated ?? 0,
        calloutsCount: foundation?.calloutsCount ?? 0,
      },
      currentCharacters,
      tokenHoldings: currentPositions.map((position) => ({
        projectId: position.projectId,
        slug: position.slug,
        ticker: position.ticker,
        name: position.name,
        tokenAmount: position.tokenAmount,
        estimatedValueSats: position.estimatedValueSats,
        lastTradeAt: position.lastTradeAt,
      })),
      currentPositions,
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


