import type { FastifyInstance } from "fastify";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { verifyWalletToken } from "../middleware/verifyWalletToken.js";
import {
  confirmMint,
  createMintIntent,
  getCollectionAddress,
  getItemOwnership,
  getShopCatalog,
  getWalletInventory,
  hasEntitlement,
  useShopItem,
  type ShopItemKey,
} from "../services/shopStore.js";

const DATA_DIR = resolve(process.cwd(), "data");
const CLANS_FILE = resolve(DATA_DIR, "clans.json");
const CLAN_LICENSE_ITEM: ShopItemKey = "CLAN_FORMATION_LICENSE";

interface ClanRecord {
  id: string;
  name: string;
  tag: string;
  bio: string;
  ownerWallet: string;
  members: string[];
  createdAt: string;
}

const BuyLicenseSchema = z.object({
  walletAddress: z.string().min(10).optional(),
});

const MintIntentSchema = z.object({
  walletAddress: z.string().min(10).optional(),
  itemKey: z.enum(["PAINT_SET", "CLAN_FORMATION_LICENSE", "GALLERY_TICKET"]),
});

const MintConfirmSchema = z.object({
  walletAddress: z.string().min(10).optional(),
  itemKey: z.enum(["PAINT_SET", "CLAN_FORMATION_LICENSE", "GALLERY_TICKET"]),
  mintTxId: z.string().min(8),
});

const UseItemSchema = z.object({
  walletAddress: z.string().min(10).optional(),
  itemKey: z.enum(["PAINT_SET", "CLAN_FORMATION_LICENSE", "GALLERY_TICKET"]),
  active: z.boolean().optional(),
});

const CreateClanSchema = z.object({
  walletAddress: z.string().min(10).optional(),
  name: z.string().trim().min(3).max(32),
  tag: z.string().trim().min(2).max(6),
  bio: z.string().trim().max(220).optional(),
});

const JoinClanSchema = z.object({
  walletAddress: z.string().min(10).optional(),
});

let writeQueue = Promise.resolve();

function normalizeTag(tag: string): string {
  return tag.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJsonFile<T>(path: string, defaultValue: T): Promise<T> {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function loadClans(): Promise<ClanRecord[]> {
  return readJsonFile<ClanRecord[]>(CLANS_FILE, []);
}

function toClanResponse(clan: ClanRecord, walletAddress?: string | null): Record<string, unknown> {
  const isMember = walletAddress ? clan.members.includes(walletAddress) : false;
  const isOwner = walletAddress ? clan.ownerWallet === walletAddress : false;
  return {
    id: clan.id,
    name: clan.name,
    tag: clan.tag,
    bio: clan.bio,
    ownerWallet: clan.ownerWallet,
    members: clan.members,
    memberCount: clan.members.length,
    createdAt: clan.createdAt,
    isMember,
    isOwner,
  };
}

async function walletHasClanLicense(walletAddress: string): Promise<boolean> {
  return hasEntitlement(walletAddress, CLAN_LICENSE_ITEM);
}

export async function clanAndShopRoutes(app: FastifyInstance) {
  // ── GET /shop/items — catalog with ownership from confirmed OP721 mints ────
  app.get<{ Querystring: { wallet?: string } }>("/shop/items", async (request, reply) => {
    const sessionWallet = request.walletSession?.walletAddress ?? null;
    const requestedWallet = request.query.wallet?.trim() ?? null;
    const walletAddress = sessionWallet ?? requestedWallet;

    const owned = walletAddress ? await getWalletInventory(walletAddress) : [];
    const ownershipByItem = new Map(owned.map((row) => [row.itemKey, row]));

    return reply.send({
      walletAddress,
      collectionAddress: getCollectionAddress() || null,
      items: getShopCatalog().map((item) => {
        const mine = ownershipByItem.get(item.itemKey) ?? null;
        return {
          itemKey: item.itemKey,
          entitlement: item.entitlement,
          name: item.name,
          description: item.description,
          imageUrl: item.imageUrl,
          pricing: {
            amount: item.priceAmount,
            tokenSymbol: item.paymentToken,
            displayToken: item.displayToken,
            freeMint: item.paymentToken === "FREE",
          },
          owned: Boolean(mine),
          mintedAt: mine?.mintedAt ?? null,
          active: mine?.active ?? false,
          collectionAddress: mine?.collectionAddress ?? null,
          tokenId: mine?.tokenId ?? null,
          mintTxId: mine?.mintTxId ?? null,
          confirmedAt: mine?.confirmedAt ?? null,
        };
      }),
    });
  });

  // ── POST /shop/mint-intent — returns params for wallet to sign OP721 mint ──
  app.post("/shop/mint-intent", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const parsed = MintIntentSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const sessionWallet = request.walletSession?.walletAddress;
    if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });
    if (parsed.data.walletAddress && parsed.data.walletAddress !== sessionWallet) {
      return reply.status(400).send({ error: "walletAddress mismatch with authenticated session." });
    }

    try {
      const intent = await createMintIntent(sessionWallet, parsed.data.itemKey);
      if (intent.alreadyOwned) {
        return reply.status(409).send({
          error: "Already owned.",
          record: intent.existingRecord,
        });
      }

      // Prepare the on-chain interaction buffer for wallet signing
      let interaction: { offlineBufferHex: string; refundTo: string; maximumAllowedSatToSpend: string; feeRate: number } | null = null;
      try {
        const { prepareShopMint } = await import("@opfun/opnet");
        const mintIntent = await prepareShopMint(sessionWallet, intent.tokenId);
        interaction = mintIntent.interaction;
      } catch {
        // Interaction preparation failed — will be reported to frontend
      }

      return reply.send({
        status: "MINT_INTENT",
        walletAddress: sessionWallet,
        itemKey: intent.itemKey,
        entitlement: intent.entitlement,
        collectionAddress: intent.collectionAddress,
        tokenId: intent.tokenId,
        priceAmount: intent.priceAmount,
        paymentToken: intent.paymentToken,
        pendingRecord: intent.existingRecord,
        interaction,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create mint intent.";
      return reply.status(400).send({ error: message });
    }
  });

  // ── POST /shop/mint-confirm — wallet submits signed tx, backend records ────
  app.post("/shop/mint-confirm", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const parsed = MintConfirmSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const sessionWallet = request.walletSession?.walletAddress;
    if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });
    if (parsed.data.walletAddress && parsed.data.walletAddress !== sessionWallet) {
      return reply.status(400).send({ error: "walletAddress mismatch with authenticated session." });
    }

    try {
      const result = await confirmMint(sessionWallet, parsed.data.itemKey, parsed.data.mintTxId);
      return reply.status(result.alreadyConfirmed ? 200 : 201).send({
        status: result.alreadyConfirmed ? "ALREADY_CONFIRMED" : "MINT_SUBMITTED",
        walletAddress: sessionWallet,
        itemKey: result.record.itemKey,
        entitlement: result.record.entitlement,
        collectionAddress: result.record.collectionAddress,
        tokenId: result.record.tokenId,
        mintTxId: result.record.mintTxId,
        confirmedAt: result.record.confirmedAt,
        active: result.record.active,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to confirm mint.";
      if (message.includes("Already")) {
        return reply.status(409).send({ error: message });
      }
      return reply.status(400).send({ error: message });
    }
  });

  // ── POST /shop/mint-broadcast — wallet signed, backend broadcasts + records ─
  app.post("/shop/mint-broadcast", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const sessionWallet = request.walletSession?.walletAddress;
    if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });

    const body = request.body as {
      itemKey?: string;
      interactionTransactionRaw?: string;
      fundingTransactionRaw?: string;
    };

    if (!body.itemKey || !body.interactionTransactionRaw) {
      return reply.status(400).send({ error: "itemKey and interactionTransactionRaw are required." });
    }

    const validKeys = ["PAINT_SET", "CLAN_FORMATION_LICENSE", "GALLERY_TICKET"];
    if (!validKeys.includes(body.itemKey)) {
      return reply.status(400).send({ error: "Invalid itemKey." });
    }

    try {
      const { broadcastSignedInteraction } = await import("@opfun/opnet");
      const result = await broadcastSignedInteraction({
        interactionTransactionRaw: body.interactionTransactionRaw,
        fundingTransactionRaw: body.fundingTransactionRaw ?? null,
      });

      if (!result.success || !result.txId) {
        return reply.status(502).send({
          error: "Mint broadcast failed",
          detail: result.error ?? "No transaction ID returned.",
        });
      }

      // Record the mint with the broadcast txId
      const confirmResult = await confirmMint(
        sessionWallet,
        body.itemKey as "PAINT_SET" | "CLAN_FORMATION_LICENSE" | "GALLERY_TICKET",
        result.txId,
      );

      return reply.status(201).send({
        status: "MINT_BROADCAST",
        walletAddress: sessionWallet,
        itemKey: confirmResult.record.itemKey,
        entitlement: confirmResult.record.entitlement,
        collectionAddress: confirmResult.record.collectionAddress,
        tokenId: confirmResult.record.tokenId,
        mintTxId: result.txId,
        fundingTxId: result.fundingTxId ?? null,
        confirmedAt: confirmResult.record.confirmedAt,
        active: confirmResult.record.active,
      });
    } catch (err) {
      return reply.status(502).send({
        error: "Mint broadcast failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ── POST /shop/use — toggle app-state, revalidates ownership first ─────────
  app.post("/shop/use", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const parsed = UseItemSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const sessionWallet = request.walletSession?.walletAddress;
    if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });
    if (parsed.data.walletAddress && parsed.data.walletAddress !== sessionWallet) {
      return reply.status(400).send({ error: "walletAddress mismatch with authenticated session." });
    }

    try {
      const updated = await useShopItem(sessionWallet, parsed.data.itemKey, parsed.data.active);
      return reply.send({
        walletAddress: sessionWallet,
        itemKey: updated.itemKey,
        entitlement: updated.entitlement,
        active: updated.active,
        usedAt: updated.usedAt,
        collectionAddress: updated.collectionAddress,
        tokenId: updated.tokenId,
        mintTxId: updated.mintTxId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to use item.";
      if (message.includes("not owned") || message.includes("not yet confirmed")) {
        return reply.status(404).send({ error: message });
      }
      return reply.status(400).send({ error: message });
    }
  });

  // ── GET /shop/licenses — clan license check ────────────────────────────────
  app.get<{ Querystring: { wallet?: string } }>("/shop/licenses", async (request, reply) => {
    const walletAddress = request.query.wallet?.trim() ?? null;
    if (!walletAddress) {
      return reply.send({
        walletAddress: null,
        clansUnlocked: false,
        sku: "clans-license",
      });
    }

    const row = await getItemOwnership(walletAddress, CLAN_LICENSE_ITEM);
    const confirmed = row !== null && row.status === "CONFIRMED";
    return reply.send({
      walletAddress,
      clansUnlocked: confirmed,
      purchasedAt: row?.mintedAt ?? null,
      mintTxId: row?.mintTxId ?? null,
      collectionAddress: row?.collectionAddress ?? null,
      sku: "clans-license",
    });
  });

  // ── POST /shop/licenses/clans — mint-intent shortcut for clan license ──────
  app.post("/shop/licenses/clans", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const parsed = BuyLicenseSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "Validation failed" });

    const sessionWallet = request.walletSession?.walletAddress;
    if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });
    if (parsed.data.walletAddress && parsed.data.walletAddress !== sessionWallet) {
      return reply.status(400).send({ error: "walletAddress mismatch with authenticated session." });
    }

    try {
      const intent = await createMintIntent(sessionWallet, CLAN_LICENSE_ITEM);
      if (intent.alreadyOwned) {
        return reply.status(200).send({
          walletAddress: sessionWallet,
          sku: "clans-license",
          clansUnlocked: true,
          alreadyOwned: true,
          purchasedAt: intent.existingRecord?.mintedAt ?? null,
          mintTxId: intent.existingRecord?.mintTxId ?? null,
        });
      }

      return reply.status(200).send({
        status: "MINT_INTENT",
        walletAddress: sessionWallet,
        sku: "clans-license",
        clansUnlocked: false,
        alreadyOwned: false,
        collectionAddress: intent.collectionAddress,
        tokenId: intent.tokenId,
        priceAmount: intent.priceAmount,
        paymentToken: intent.paymentToken,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create license intent.";
      return reply.status(400).send({ error: message });
    }
  });

  app.get<{ Querystring: { wallet?: string } }>("/clans", async (request, reply) => {
    const wallet = request.query.wallet ?? null;
    const clans = await loadClans();
    return reply.send({
      items: clans
        .slice()
        .sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name))
        .map((clan) => toClanResponse(clan, wallet)),
      total: clans.length,
    });
  });

  app.get("/clans/me", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const walletAddress = request.walletSession?.walletAddress;
    if (!walletAddress) return reply.status(401).send({ error: "Authentication required." });

    const clans = await loadClans();
    const clan = clans.find((row) => row.members.includes(walletAddress));
    if (!clan) return reply.send({ clan: null });
    return reply.send({ clan: toClanResponse(clan, walletAddress) });
  });

  app.post("/clans", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const parsed = CreateClanSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const sessionWallet = request.walletSession?.walletAddress;
    if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });
    if (parsed.data.walletAddress && parsed.data.walletAddress !== sessionWallet) {
      return reply.status(400).send({ error: "walletAddress mismatch with authenticated session." });
    }

    const walletAddress = sessionWallet;

    const result = await withWriteLock(async () => {
      const clans = await loadClans();

      if (!(await walletHasClanLicense(walletAddress))) {
        return { status: 403 as const, payload: { error: "Clan license required. Buy from Shop first." } };
      }
      if (clans.some((clan) => clan.members.includes(walletAddress))) {
        return { status: 409 as const, payload: { error: "You are already in a clan." } };
      }

      const normalizedTag = normalizeTag(parsed.data.tag);
      if (!normalizedTag) {
        return { status: 400 as const, payload: { error: "Tag must contain letters or numbers." } };
      }
      if (clans.some((clan) => clan.tag.toUpperCase() === normalizedTag)) {
        return { status: 409 as const, payload: { error: "Clan tag already exists." } };
      }

      const id = `clan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const clan: ClanRecord = {
        id,
        name: cleanName(parsed.data.name),
        tag: normalizedTag,
        bio: parsed.data.bio?.trim() ?? "",
        ownerWallet: walletAddress,
        members: [walletAddress],
        createdAt: new Date().toISOString(),
      };

      clans.push(clan);
      await writeJsonFile(CLANS_FILE, clans);
      return { status: 201 as const, payload: { clan: toClanResponse(clan, walletAddress) } };
    });

    return reply.status(result.status).send(result.payload);
  });

  app.post<{ Params: { clanId: string } }>("/clans/:clanId/join", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const parsed = JoinClanSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "Validation failed" });

    const sessionWallet = request.walletSession?.walletAddress;
    if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });
    if (parsed.data.walletAddress && parsed.data.walletAddress !== sessionWallet) {
      return reply.status(400).send({ error: "walletAddress mismatch with authenticated session." });
    }

    const walletAddress = sessionWallet;
    const clanId = request.params.clanId;

    const result = await withWriteLock(async () => {
      const clans = await loadClans();

      const existingClan = clans.find((clan) => clan.members.includes(walletAddress));
      if (existingClan) {
        return { status: 409 as const, payload: { error: "You are already in a clan." } };
      }

      const clan = clans.find((row) => row.id === clanId);
      if (!clan) return { status: 404 as const, payload: { error: "Clan not found." } };
      if (clan.members.length >= 30) {
        return { status: 409 as const, payload: { error: "Clan is full." } };
      }

      clan.members.push(walletAddress);
      await writeJsonFile(CLANS_FILE, clans);
      return { status: 200 as const, payload: { clan: toClanResponse(clan, walletAddress) } };
    });

    return reply.status(result.status).send(result.payload);
  });

  app.post<{ Params: { clanId: string } }>("/clans/:clanId/leave", { preHandler: [verifyWalletToken] }, async (request, reply) => {
    const parsed = JoinClanSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "Validation failed" });

    const sessionWallet = request.walletSession?.walletAddress;
    if (!sessionWallet) return reply.status(401).send({ error: "Authentication required." });
    if (parsed.data.walletAddress && parsed.data.walletAddress !== sessionWallet) {
      return reply.status(400).send({ error: "walletAddress mismatch with authenticated session." });
    }

    const walletAddress = sessionWallet;
    const clanId = request.params.clanId;

    const result = await withWriteLock(async () => {
      const clans = await loadClans();
      const idx = clans.findIndex((row) => row.id === clanId);
      if (idx < 0) return { status: 404 as const, payload: { error: "Clan not found." } };

      const clan = clans[idx]!;
      if (!clan.members.includes(walletAddress)) {
        return { status: 409 as const, payload: { error: "You are not a member of this clan." } };
      }

      clan.members = clan.members.filter((member) => member !== walletAddress);
      if (clan.members.length === 0) {
        clans.splice(idx, 1);
        await writeJsonFile(CLANS_FILE, clans);
        return { status: 200 as const, payload: { left: true, clanDeleted: true } };
      }

      if (clan.ownerWallet === walletAddress) {
        clan.ownerWallet = clan.members[0]!;
      }

      await writeJsonFile(CLANS_FILE, clans);
      return { status: 200 as const, payload: { left: true, clanDeleted: false, clan: toClanResponse(clan, walletAddress) } };
    });

    return reply.status(result.status).send(result.payload);
  });
}
