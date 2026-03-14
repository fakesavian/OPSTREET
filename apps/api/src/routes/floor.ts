import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { verifyWalletToken } from "../middleware/verifyWalletToken.js";
import { gradeCallout } from "../services/foundation.js";
import { getPriceDelta24h } from "../services/marketIndexer.js";

// ── Constants ──────────────────────────────────────────────────────────────

const PRESENCE_ACTIVE_MS = 5 * 60 * 1000;          // 5 min
const CALLOUT_COOLDOWN_MS = 2 * 60 * 60 * 1000;    // 2 h
const CHAT_COOLDOWN_MS = 3 * 1000;                  // 3 s
const CHAT_DEDUP_WINDOW_MS = 60 * 1000;             // 60 s
const CHAT_SPAM_WINDOW_MS = 60 * 1000;              // 60 s
const CHAT_SPAM_THRESHOLD = 3;
const MUTE_DURATION_MS = 5 * 60 * 1000;            // 5 min

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeContent(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Derive a stable avatar bg-color class from wallet address */
function walletToColor(addr: string): string {
  const colors = [
    "bg-blue-600", "bg-orange-600", "bg-cyan-600", "bg-indigo-700",
    "bg-green-700", "bg-purple-700", "bg-red-700", "bg-rose-600",
  ];
  let hash = 0;
  for (let i = 0; i < addr.length; i++) hash = (hash * 31 + addr.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length]!;
}

// ── Validation schemas ────────────────────────────────────────────────────

const JoinSchema = z.object({
  walletAddress: z.string().min(10),
  displayName: z.string().max(18).optional(),
  avatarId: z.string().optional(),
});

const CalloutSchema = z.object({
  walletAddress: z.string().min(10).optional(),
  content: z.string().min(1).max(280),
  projectId: z.string().optional().nullable(),
});

const ReactSchema = z.object({
  walletAddress: z.string().min(10).optional(),
  reaction: z.enum(["UP", "DOWN"]),
});

const ChatSchema = z.object({
  walletAddress: z.string().min(10).optional(),
  content: z.string().min(1).max(200),
});

const EquipSchema = z.object({
  walletAddress: z.string().min(10).optional(),
});

const LeaveSchema = z.object({
  walletAddress: z.string().min(10),
});

// ── Grant avatar helper ────────────────────────────────────────────────────

async function grantAvatarIfNeeded(walletAddress: string, avatarId: string): Promise<void> {
  const avatar = await prisma.avatarCatalog.findUnique({ where: { id: avatarId } });
  if (!avatar) return;
  await prisma.userAvatarOwnership.upsert({
    where: { walletAddress_avatarId: { walletAddress, avatarId } },
    update: {},
    create: { walletAddress, avatarId },
  });
}

function getSessionWallet(request: { walletSession?: { walletAddress: string } }): string | null {
  return request.walletSession?.walletAddress ?? null;
}

// ── Route registration ─────────────────────────────────────────────────────

export async function floorRoutes(app: FastifyInstance) {

  // ── GET /floor/stats ────────────────────────────────────────────────────

  app.get("/floor/stats", async (_req, reply) => {
    const since = new Date(Date.now() - PRESENCE_ACTIVE_MS);
    const [activeUsers, totalCallouts, totalMessages] = await Promise.all([
      prisma.roomPresence.count({ where: { lastSeen: { gt: since } } }),
      prisma.callout.count(),
      prisma.chatMessage.count({ where: { isSpam: false } }),
    ]);
    return reply.send({ activeUsers, totalCallouts, totalMessages });
  });

  // ── POST /floor/presence/join ───────────────────────────────────────────

  app.post("/floor/presence/join", async (request, reply) => {
    const parsed = JoinSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });

    const { walletAddress, displayName, avatarId } = parsed.data;
    const cleanName = (displayName ?? "")
      .trim()
      .replace(/[<>&]/g, "")
      .slice(0, 18);

    // Upsert UserProfile (create if new)
    const existing = await prisma.userProfile.findUnique({ where: { walletAddress } });
    const profile = await prisma.userProfile.upsert({
      where: { walletAddress },
      update: {
        ...(cleanName ? { displayName: cleanName } : {}),
        ...(avatarId ? { activeAvatarId: avatarId } : {}),
        updatedAt: new Date(),
      },
      create: {
        walletAddress,
        displayName: cleanName || walletAddress.slice(0, 8),
        activeAvatarId: avatarId ?? "default-free-1",
      },
    });

    // Auto-grant free avatars on first join
    if (!existing) {
      for (const freeId of ["default-free-1", "default-free-2", "default-free-3", "default-free-4"]) {
        await grantAvatarIfNeeded(walletAddress, freeId);
      }
    }

    // Upsert RoomPresence
    await prisma.roomPresence.upsert({
      where: { walletAddress },
      update: {
        displayName: profile.displayName,
        avatarId: profile.activeAvatarId,
        lastSeen: new Date(),
      },
      create: {
        walletAddress,
        displayName: profile.displayName,
        avatarId: profile.activeAvatarId,
      },
    });

    // Return profile + free avatar catalog
    const catalog = await prisma.avatarCatalog.findMany({ orderBy: { sortOrder: "asc" } });
    const ownedIds = await prisma.userAvatarOwnership
      .findMany({ where: { walletAddress }, select: { avatarId: true } })
      .then((rows) => new Set(rows.map((r) => r.avatarId)));

    return reply.send({
      walletAddress: profile.walletAddress,
      displayName: profile.displayName,
      activeAvatarId: profile.activeAvatarId,
      muteUntil: profile.muteUntil?.toISOString() ?? null,
      avatarCatalog: catalog.map((a) => ({
        ...a,
        owned: ownedIds.has(a.id),
        active: a.id === profile.activeAvatarId,
      })),
    });
  });

  // ── POST /floor/presence/leave ──────────────────────────────────────────

  app.post("/floor/presence/leave", async (request, reply) => {
    const parsed = LeaveSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Validation failed" });

    const staleTime = new Date(Date.now() - PRESENCE_ACTIVE_MS - 1000);
    await prisma.roomPresence.updateMany({
      where: { walletAddress: parsed.data.walletAddress },
      data: { lastSeen: staleTime },
    });
    return reply.status(204).send();
  });

  // ── GET /floor/presence ─────────────────────────────────────────────────

  app.get("/floor/presence", async (_req, reply) => {
    const since = new Date(Date.now() - PRESENCE_ACTIVE_MS);
    const rows = await prisma.roomPresence.findMany({
      where: { lastSeen: { gt: since } },
      orderBy: { lastSeen: "desc" },
    });
    return reply.send(rows.map((r) => ({
      walletAddress: r.walletAddress,
      displayName: r.displayName,
      avatarId: r.avatarId,
      lastSeen: r.lastSeen.toISOString(),
    })));
  });

  // ── POST /floor/callouts ────────────────────────────────────────────────

  app.post("/floor/callouts", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const parsed = CalloutSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });

    const sessionWallet = getSessionWallet(request);
    if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });
    if (parsed.data.walletAddress && parsed.data.walletAddress !== sessionWallet) {
      return reply.status(400).send({ error: "walletAddress mismatch with authenticated session." });
    }

    const walletAddress = sessionWallet;
    const { content, projectId } = parsed.data;

    // Ensure UserProfile exists
    const profile = await prisma.userProfile.findUnique({ where: { walletAddress } });
    if (!profile) {
      return reply.status(403).send({ error: "Join the floor first." });
    }

    // 2h cooldown
    if (profile.lastCalloutAt) {
      const elapsed = Date.now() - profile.lastCalloutAt.getTime();
      if (elapsed < CALLOUT_COOLDOWN_MS) {
        return reply.status(429).send({
          error: "Callout cooldown active.",
          retryAfterMs: CALLOUT_COOLDOWN_MS - elapsed,
        });
      }
    }

    // Validate projectId if provided
    if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) return reply.status(404).send({ error: "Project not found." });
    }

    const callout = await prisma.callout.create({
      data: { walletAddress, content: content.trim(), projectId: projectId ?? null },
    });

    // Foundation wave: deterministic grading to power signal leaderboard.
    await gradeCallout(callout.id, walletAddress, projectId).catch(() => undefined);

    await prisma.userProfile.update({
      where: { walletAddress },
      data: { lastCalloutAt: new Date() },
    });

    // Achievement: increment calloutsCount
    const achievement = await prisma.achievementProgress.upsert({
      where: { walletAddress },
      update: { calloutsCount: { increment: 1 } },
      create: { walletAddress, calloutsCount: 1, tokensCreated: 0 },
    });

    // Unlock achievement avatars
    if (achievement.calloutsCount >= 10) {
      await grantAvatarIfNeeded(walletAddress, "achievement-caller");
    }
    if (achievement.calloutsCount >= 50) {
      await grantAvatarIfNeeded(walletAddress, "achievement-og");
    }

    return reply.status(201).send({ id: callout.id, createdAt: callout.createdAt.toISOString() });
  });

  // ── GET /floor/callouts ─────────────────────────────────────────────────

  app.get<{ Querystring: { limit?: string; wallet?: string } }>("/floor/callouts", async (request, reply) => {
    const limit = Math.min(Number(request.query.limit ?? 50), 100);
    const viewerWallet = request.query.wallet ?? null;

    const callouts = await prisma.callout.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { displayName: true, activeAvatarId: true } },
        reactions: true,
      },
    });

    // Fetch project info for callouts that have projectId
    const projectIds = [...new Set(callouts.map((c) => c.projectId).filter(Boolean))] as string[];
    const projectsMap = new Map<string, { ticker: string; status: string; riskScore: number | null }>();
    if (projectIds.length > 0) {
      const projects = await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, ticker: true, status: true, riskScore: true },
      });
      for (const p of projects) projectsMap.set(p.id, p);
    }

    const result = callouts.map((c) => {
      const upCount = c.reactions.filter((r) => r.reaction === "UP").length;
      const downCount = c.reactions.filter((r) => r.reaction === "DOWN").length;
      const userRxn = viewerWallet
        ? (c.reactions.find((r) => r.walletAddress === viewerWallet)?.reaction ?? null)
        : null;
      const proj = c.projectId ? projectsMap.get(c.projectId) : null;

      return {
        id: c.id,
        walletAddress: c.walletAddress,
        displayName: c.user.displayName,
        avatarId: c.user.activeAvatarId,
        content: c.content,
        projectId: c.projectId,
        projectTicker: proj?.ticker ?? null,
        projectStatus: proj?.status ?? null,
        projectRiskScore: proj?.riskScore ?? null,
        upCount,
        downCount,
        userReaction: userRxn as "UP" | "DOWN" | null,
        createdAt: c.createdAt.toISOString(),
      };
    });

    return reply.send(result);
  });

  // ── POST /floor/callouts/:id/react ──────────────────────────────────────

  app.post<{ Params: { id: string } }>("/floor/callouts/:id/react",
    { preHandler: [verifyWalletToken] },
    async (request, reply) => {
    const parsed = ReactSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Validation failed" });

    const sessionWallet = getSessionWallet(request);
    if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });
    if (parsed.data.walletAddress && parsed.data.walletAddress !== sessionWallet) {
      return reply.status(400).send({ error: "walletAddress mismatch with authenticated session." });
    }

    const walletAddress = sessionWallet;
    const { reaction } = parsed.data;
    const { id: calloutId } = request.params;

    const callout = await prisma.callout.findUnique({ where: { id: calloutId } });
    if (!callout) return reply.status(404).send({ error: "Callout not found." });

    // Ensure UserProfile exists
    await prisma.userProfile.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress, displayName: walletAddress.slice(0, 8) },
    });

    await prisma.calloutReaction.upsert({
      where: { calloutId_walletAddress: { calloutId, walletAddress } },
      update: { reaction },
      create: { calloutId, walletAddress, reaction },
    });

    const [upCount, downCount] = await Promise.all([
      prisma.calloutReaction.count({ where: { calloutId, reaction: "UP" } }),
      prisma.calloutReaction.count({ where: { calloutId, reaction: "DOWN" } }),
    ]);

    return reply.send({ upCount, downCount, userReaction: reaction });
  });

  // ── POST /floor/chat ────────────────────────────────────────────────────

  app.post("/floor/chat", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const parsed = ChatSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });

    const sessionWallet = getSessionWallet(request);
    if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });
    if (parsed.data.walletAddress && parsed.data.walletAddress !== sessionWallet) {
      return reply.status(400).send({ error: "walletAddress mismatch with authenticated session." });
    }

    const walletAddress = sessionWallet;
    const { content } = parsed.data;
    const now = new Date();

    // Get or create profile
    const profile = await prisma.userProfile.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress, displayName: walletAddress.slice(0, 8) },
    });

    // 1. Mute check
    if (profile.muteUntil && profile.muteUntil > now) {
      return reply.status(429).send({
        error: "Muted",
        muteUntil: profile.muteUntil.toISOString(),
      });
    }

    // 2. Cooldown check (3s)
    if (profile.lastChatAt) {
      const elapsed = now.getTime() - profile.lastChatAt.getTime();
      if (elapsed < CHAT_COOLDOWN_MS) {
        return reply.status(429).send({
          error: "Cooldown",
          retryAfterMs: CHAT_COOLDOWN_MS - elapsed,
        });
      }
    }

    // 3. Hash dedup — check for same message in last 60s
    const hash = sha256(normalizeContent(content));
    const dupWindow = new Date(now.getTime() - CHAT_DEDUP_WINDOW_MS);
    const duplicate = await prisma.chatMessage.findFirst({
      where: {
        walletAddress,
        messageHash: hash,
        createdAt: { gt: dupWindow },
      },
    });

    if (duplicate) {
      // Spam counter logic
      const spamWindow = new Date(now.getTime() - CHAT_SPAM_WINDOW_MS);
      const newSpamCount =
        profile.lastSpamAt && profile.lastSpamAt > spamWindow
          ? profile.chatSpamCount + 1
          : 1;
      const shouldMute = newSpamCount >= CHAT_SPAM_THRESHOLD;

      await prisma.userProfile.update({
        where: { walletAddress },
        data: {
          chatSpamCount: shouldMute ? 0 : newSpamCount,
          lastSpamAt: now,
          ...(shouldMute ? { muteUntil: new Date(now.getTime() + MUTE_DURATION_MS) } : {}),
        },
      });

      return reply.status(429).send({
        error: "Duplicate message",
        ...(shouldMute ? { muteUntil: new Date(now.getTime() + MUTE_DURATION_MS).toISOString() } : {}),
      });
    }

    // 4. Save message + update lastChatAt
    const message = await prisma.chatMessage.create({
      data: { walletAddress, content: content.trim(), messageHash: hash },
    });

    await prisma.userProfile.update({
      where: { walletAddress },
      data: { lastChatAt: now },
    });

    return reply.status(201).send({ id: message.id, createdAt: message.createdAt.toISOString() });
  });

  // ── GET /floor/chat ─────────────────────────────────────────────────────

  app.get<{ Querystring: { since?: string } }>("/floor/chat", async (request, reply) => {
    const since = request.query.since ? new Date(request.query.since) : undefined;

    const messages = await prisma.chatMessage.findMany({
      where: {
        isSpam: false,
        ...(since ? { createdAt: { gt: since } } : {}),
      },
      orderBy: { createdAt: since ? "asc" : "desc" },
      take: 100,
      include: {
        user: { select: { displayName: true, activeAvatarId: true } },
      },
    });

    const result = messages.map((m) => ({
      id: m.id,
      walletAddress: m.walletAddress,
      displayName: m.user.displayName,
      avatarId: m.user.activeAvatarId,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));

    // If no since filter, return newest-first (already desc); else return asc for appending
    return reply.send(since ? result : result.reverse());
  });

  // ── GET /floor/ticker ───────────────────────────────────────────────────

  app.get("/floor/ticker", async (_req, reply) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [projects, calloutCounts] = await Promise.all([
      prisma.project.findMany({
        include: { marketState: true },
      }),
      prisma.callout.groupBy({
        by: ["projectId"],
        where: {
          projectId: { not: null },
          createdAt: { gt: since },
        },
        _count: { _all: true },
      }),
    ]);

    const calloutCountByProjectId = new Map<string, number>();
    for (const row of calloutCounts) {
      if (!row.projectId) continue;
      calloutCountByProjectId.set(row.projectId, row._count._all);
    }

    const enriched = await Promise.all(projects.map(async (project) => {
      const marketState = project.marketState;
      const hasLiveData = Boolean(marketState && marketState.reserveBase > 0 && marketState.reserveQuote > 0);
      const priceDelta24h = hasLiveData ? await getPriceDelta24h(project.id) : "";
      const calloutCount24h = calloutCountByProjectId.get(project.id) ?? 0;

      return {
        sortKey: {
          live: hasLiveData ? 1 : 0,
          volume24hSats: marketState?.volume24hSats ?? 0,
          tradeCount24h: marketState?.tradeCount24h ?? 0,
          calloutCount24h,
          currentPriceSats: marketState?.currentPriceSats ?? 0,
          viewCount: project.viewCount,
          recentLaunchAt: project.liveAt?.getTime() ?? 0,
          createdAt: project.createdAt.getTime(),
        },
        id: project.id,
        slug: project.slug,
        ticker: project.ticker,
        name: project.name,
        riskScore: project.riskScore,
        status: project.status,
        launchStatus: project.launchStatus,
        priceDelta24h,
        currentPriceSats: marketState?.currentPriceSats ?? 0,
        volume24hSats: marketState?.volume24hSats ?? 0,
        tradeCount24h: marketState?.tradeCount24h ?? 0,
        calloutCount24h,
        hasLiveData,
      };
    }));

    const result = enriched
      .sort((a, b) =>
        b.sortKey.live - a.sortKey.live ||
        b.sortKey.volume24hSats - a.sortKey.volume24hSats ||
        b.sortKey.tradeCount24h - a.sortKey.tradeCount24h ||
        b.sortKey.calloutCount24h - a.sortKey.calloutCount24h ||
        b.sortKey.currentPriceSats - a.sortKey.currentPriceSats ||
        b.sortKey.viewCount - a.sortKey.viewCount ||
        b.sortKey.recentLaunchAt - a.sortKey.recentLaunchAt ||
        b.sortKey.createdAt - a.sortKey.createdAt,
      )
      .slice(0, 20)
      .map(({ sortKey: _sortKey, ...row }) => row);

    return reply.send(result);
  });

  // ── GET /floor/avatars ──────────────────────────────────────────────────

  app.get<{ Querystring: { wallet?: string } }>("/floor/avatars", async (request, reply) => {
    const walletAddress = request.query.wallet ?? null;

    const catalog = await prisma.avatarCatalog.findMany({ orderBy: { sortOrder: "asc" } });

    if (!walletAddress) {
      return reply.send(catalog.map((a) => ({ ...a, owned: a.tier === "FREE", active: false })));
    }

    const profile = await prisma.userProfile.findUnique({ where: { walletAddress } });
    const ownedIds = await prisma.userAvatarOwnership
      .findMany({ where: { walletAddress }, select: { avatarId: true } })
      .then((rows) => new Set(rows.map((r) => r.avatarId)));

    return reply.send(
      catalog.map((a) => ({
        ...a,
        owned: ownedIds.has(a.id),
        active: a.id === (profile?.activeAvatarId ?? "default-free-1"),
      })),
    );
  });

  // ── POST /floor/avatars/:id/equip ───────────────────────────────────────

  app.post<{ Params: { id: string } }>("/floor/avatars/:id/equip",
    { preHandler: [verifyWalletToken] },
    async (request, reply) => {
    const parsed = EquipSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Validation failed" });

    const sessionWallet = getSessionWallet(request);
    if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });
    if (parsed.data.walletAddress && parsed.data.walletAddress !== sessionWallet) {
      return reply.status(400).send({ error: "walletAddress mismatch with authenticated session." });
    }

    const walletAddress = sessionWallet;
    const { id: avatarId } = request.params;

    const avatar = await prisma.avatarCatalog.findUnique({ where: { id: avatarId } });
    if (!avatar) return reply.status(404).send({ error: "Avatar not found." });

    // Check ownership (free avatars always pass)
    if (avatar.tier !== "FREE") {
      const owned = await prisma.userAvatarOwnership.findUnique({
        where: { walletAddress_avatarId: { walletAddress, avatarId } },
      });
      if (!owned) return reply.status(403).send({ error: "You don't own this avatar." });
    }

    await prisma.userProfile.upsert({
      where: { walletAddress },
      update: { activeAvatarId: avatarId },
      create: { walletAddress, displayName: walletAddress.slice(0, 8), activeAvatarId: avatarId },
    });

    // Update presence too
    await prisma.roomPresence.updateMany({
      where: { walletAddress },
      data: { avatarId },
    });

    return reply.send({ activeAvatarId: avatarId });
  });
}

// ── Achievement hook (called from projects.ts after project creation) ──────

export async function onProjectCreated(walletAddress: string): Promise<void> {
  if (!walletAddress || walletAddress.length < 10) return;

  const achievement = await prisma.achievementProgress.upsert({
    where: { walletAddress },
    update: { tokensCreated: { increment: 1 } },
    create: { walletAddress, tokensCreated: 1, calloutsCount: 0 },
  });

  // Founder avatar on first token
  if (achievement.tokensCreated >= 1) {
    await prisma.userProfile.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress, displayName: walletAddress.slice(0, 8) },
    });
    const owned = await prisma.userAvatarOwnership.findUnique({
      where: { walletAddress_avatarId: { walletAddress, avatarId: "achievement-founder" } },
    });
    if (!owned) {
      await prisma.userAvatarOwnership.create({
        data: { walletAddress, avatarId: "achievement-founder" },
      }).catch(() => undefined); // ignore if avatar doesn't exist
    }
  }
}
