/**
 * shopStore — Live OP721 shop collection backed by Prisma.
 *
 * All ownership derives from confirmed OP721 mints in one shared collection.
 * No JSON files, no placeholder tx refs. Entitlements require confirmed mint status.
 */

import { createHash } from "node:crypto";
import { prisma } from "../db.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type ShopItemKey = "PAINT_SET" | "CLAN_FORMATION_LICENSE" | "GALLERY_TICKET";
export type EntitlementKey = ShopItemKey;
export type PaymentToken = "MOTO" | "FREE";
export type MintStatus = "PENDING" | "CONFIRMED" | "FAILED";

export interface ShopCatalogItem {
  itemKey: ShopItemKey;
  entitlement: EntitlementKey;
  name: string;
  description: string;
  imageUrl: string;
  priceAmount: number;
  paymentToken: PaymentToken;
  displayToken: "MOTO" | "FREE MINT";
  onePerWallet: boolean;
}

export interface ShopMintRecord {
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

// ── OP721 Collection Config ──────────────────────────────────────────────────

const COLLECTION_ADDRESS = process.env["SHOP_OP721_COLLECTION"] ?? "";

// ── Catalog ──────────────────────────────────────────────────────────────────

const SHOP_CATALOG: ReadonlyArray<ShopCatalogItem> = [
  {
    itemKey: "PAINT_SET",
    entitlement: "PAINT_SET",
    name: "Paint Set",
    description: "Required to create on-chain NFTs that you can sell and display in the gallery.",
    imageUrl: "/opstreet/shop/paint-set.jpg",
    priceAmount: 100,
    paymentToken: "MOTO",
    displayToken: "MOTO",
    onePerWallet: true,
  },
  {
    itemKey: "CLAN_FORMATION_LICENSE",
    entitlement: "CLAN_FORMATION_LICENSE",
    name: "Clan Formation License",
    description: "Required only to form a new clan. Joining existing clans does not require this license.",
    imageUrl: "/opstreet/shop/clan-formation-license.jpg",
    priceAmount: 100,
    paymentToken: "MOTO",
    displayToken: "MOTO",
    onePerWallet: true,
  },
  {
    itemKey: "GALLERY_TICKET",
    entitlement: "GALLERY_TICKET",
    name: "Gallery Ticket",
    description: "One-time access pass for gallery features.",
    imageUrl: "/opstreet/shop/gallery-ticket.png",
    priceAmount: 0,
    paymentToken: "FREE",
    displayToken: "FREE MINT",
    onePerWallet: true,
  },
];

// SKU → OP721 metadata index (used for deterministic tokenId derivation)
const SKU_TOKEN_INDEX: Record<ShopItemKey, number> = {
  PAINT_SET: 1,
  CLAN_FORMATION_LICENSE: 2,
  GALLERY_TICKET: 3,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMintRecord(row: {
  id: string;
  walletAddress: string;
  itemKey: string;
  entitlement: string;
  collectionAddress: string;
  tokenId: string;
  mintTxId: string;
  status: string;
  active: boolean;
  mintedAt: Date;
  confirmedAt: Date | null;
  usedAt: Date | null;
}): ShopMintRecord {
  return {
    id: row.id,
    walletAddress: row.walletAddress,
    itemKey: row.itemKey,
    entitlement: row.entitlement,
    collectionAddress: row.collectionAddress,
    tokenId: row.tokenId,
    mintTxId: row.mintTxId,
    status: row.status,
    active: row.active,
    mintedAt: row.mintedAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    usedAt: row.usedAt?.toISOString() ?? null,
  };
}

/**
 * Derive the expected OP721 tokenId for a given SKU + wallet.
 * Format: `{skuIndex}-{walletAddressSuffix}` — deterministic and unique.
 */
function deriveTokenId(itemKey: ShopItemKey, walletAddress: string): string {
  const skuIdx = BigInt(SKU_TOKEN_INDEX[itemKey]);
  const digest = createHash("sha256")
    .update(`${itemKey}:${walletAddress.trim().toLowerCase()}`)
    .digest("hex");
  const walletComponent = BigInt(`0x${digest.slice(0, 30)}`);
  return ((skuIdx << 120n) | walletComponent).toString(10);
}

function parseNumericTokenId(tokenId: string): bigint {
  const trimmed = tokenId.trim();
  if (/^\d+$/.test(trimmed)) return BigInt(trimmed);

  const legacyPrefix = trimmed.split("-")[0] ?? "";
  if (/^\d+$/.test(legacyPrefix)) return BigInt(legacyPrefix);

  return 0n;
}

// ── Read operations ──────────────────────────────────────────────────────────

export function getShopCatalog(): ReadonlyArray<ShopCatalogItem> {
  return SHOP_CATALOG;
}

export function getCollectionAddress(): string {
  return COLLECTION_ADDRESS;
}

export async function getWalletMintRecords(walletAddress: string): Promise<ShopMintRecord[]> {
  const rows = await prisma.shopMint.findMany({
    where: { walletAddress },
    orderBy: { mintedAt: "desc" },
  });
  return rows.map(toMintRecord);
}

export async function getWalletInventory(walletAddress: string): Promise<ShopMintRecord[]> {
  const rows = await getWalletMintRecords(walletAddress);
  return rows.filter((row) => row.status === "CONFIRMED");
}

export async function hasEntitlement(walletAddress: string, entitlement: EntitlementKey): Promise<boolean> {
  const row = await prisma.shopMint.findFirst({
    where: { walletAddress, entitlement, status: "CONFIRMED" },
  });
  return Boolean(row);
}

export async function getItemOwnership(walletAddress: string, itemKey: ShopItemKey): Promise<ShopMintRecord | null> {
  const row = await prisma.shopMint.findUnique({
    where: { walletAddress_itemKey: { walletAddress, itemKey } },
  });
  if (!row || row.status === "FAILED") return null;
  return toMintRecord(row);
}

// ── Mint intent (step 1: backend prepares mint params) ───────────────────────

export interface MintIntentResult {
  collectionAddress: string;
  tokenId: string;
  itemKey: ShopItemKey;
  entitlement: EntitlementKey;
  priceAmount: number;
  paymentToken: PaymentToken;
  walletAddress: string;
  alreadyOwned: boolean;
  existingRecord: ShopMintRecord | null;
}

export async function createMintIntent(
  walletAddress: string,
  itemKey: ShopItemKey,
): Promise<MintIntentResult> {
  const catalogItem = SHOP_CATALOG.find((item) => item.itemKey === itemKey);
  if (!catalogItem) throw new Error("Unknown item.");

  if (!COLLECTION_ADDRESS) {
    throw new Error("Shop collection not deployed. SHOP_OP721_COLLECTION is not configured.");
  }

  // Check existing ownership
  const existing = await prisma.shopMint.findUnique({
    where: { walletAddress_itemKey: { walletAddress, itemKey } },
  });

  if (existing && existing.status === "CONFIRMED") {
    return {
      collectionAddress: COLLECTION_ADDRESS,
      tokenId: existing.tokenId,
      itemKey: catalogItem.itemKey,
      entitlement: catalogItem.entitlement,
      priceAmount: catalogItem.priceAmount,
      paymentToken: catalogItem.paymentToken,
      walletAddress,
      alreadyOwned: true,
      existingRecord: toMintRecord(existing),
    };
  }

  // If there's a pending mint, return its details
  if (existing && existing.status === "PENDING") {
    return {
      collectionAddress: COLLECTION_ADDRESS,
      tokenId: existing.tokenId,
      itemKey: catalogItem.itemKey,
      entitlement: catalogItem.entitlement,
      priceAmount: catalogItem.priceAmount,
      paymentToken: catalogItem.paymentToken,
      walletAddress,
      alreadyOwned: false,
      existingRecord: toMintRecord(existing),
    };
  }

  // Clean up failed record if present
  if (existing && existing.status === "FAILED") {
    await prisma.shopMint.delete({ where: { id: existing.id } });
  }

  const tokenId = deriveTokenId(itemKey, walletAddress);

  return {
    collectionAddress: COLLECTION_ADDRESS,
    tokenId,
    itemKey: catalogItem.itemKey,
    entitlement: catalogItem.entitlement,
    priceAmount: catalogItem.priceAmount,
    paymentToken: catalogItem.paymentToken,
    walletAddress,
    alreadyOwned: false,
    existingRecord: null,
  };
}

// ── Mint confirm (step 2: wallet signed, tx submitted) ───────────────────────

export interface MintConfirmResult {
  record: ShopMintRecord;
  alreadyConfirmed: boolean;
}

export async function confirmMint(
  walletAddress: string,
  itemKey: ShopItemKey,
  mintTxId: string,
): Promise<MintConfirmResult> {
  const catalogItem = SHOP_CATALOG.find((item) => item.itemKey === itemKey);
  if (!catalogItem) throw new Error("Unknown item.");

  if (!COLLECTION_ADDRESS) {
    throw new Error("Shop collection not deployed.");
  }

  // Check for existing confirmed mint (one-per-wallet)
  const existing = await prisma.shopMint.findUnique({
    where: { walletAddress_itemKey: { walletAddress, itemKey } },
  });

  if (existing && existing.status === "CONFIRMED") {
    return { record: toMintRecord(existing), alreadyConfirmed: true };
  }

  const tokenId = deriveTokenId(itemKey, walletAddress);
  const isAutoActive = itemKey === "CLAN_FORMATION_LICENSE";
  const now = new Date();

  // Upsert: create or update from PENDING/FAILED
  const row = await prisma.shopMint.upsert({
    where: { walletAddress_itemKey: { walletAddress, itemKey } },
    create: {
      walletAddress,
      itemKey: catalogItem.itemKey,
      entitlement: catalogItem.entitlement,
      collectionAddress: COLLECTION_ADDRESS,
      tokenId,
      mintTxId,
      status: "PENDING",
      active: isAutoActive,
      mintedAt: now,
      usedAt: isAutoActive ? now : null,
    },
    update: {
      mintTxId,
      status: "PENDING",
      collectionAddress: COLLECTION_ADDRESS,
      tokenId,
      mintedAt: now,
    },
  });

  return { record: toMintRecord(row), alreadyConfirmed: false };
}

// ── Watcher confirmation (step 3: on-chain confirmed) ────────────────────────

export async function confirmMintOnchain(
  mintTxId: string,
): Promise<ShopMintRecord | null> {
  const row = await prisma.shopMint.findUnique({
    where: { mintTxId },
  });

  if (!row || row.status === "CONFIRMED") return row ? toMintRecord(row) : null;

  const ownership = await checkOnchainOwnership(
    row.collectionAddress,
    row.tokenId,
    row.walletAddress,
  );
  if (ownership !== "owned") {
    return null;
  }

  const updated = await prisma.shopMint.update({
    where: { id: row.id },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });

  return toMintRecord(updated);
}

export async function failMint(
  mintTxId: string,
  _error?: string,
): Promise<ShopMintRecord | null> {
  const row = await prisma.shopMint.findUnique({
    where: { mintTxId },
  });

  if (!row) return null;

  const updated = await prisma.shopMint.update({
    where: { id: row.id },
    data: { status: "FAILED" },
  });

  return toMintRecord(updated);
}

// ── Ownership verification ────────────────────────────────────────────────────

export type OwnershipStatus = "owned" | "not_owned" | "verification_unavailable";

export async function revalidateOwnership(
  walletAddress: string,
  itemKey: ShopItemKey,
): Promise<OwnershipStatus> {
  const row = await prisma.shopMint.findUnique({
    where: { walletAddress_itemKey: { walletAddress, itemKey } },
  });

  if (!row || row.status !== "CONFIRMED") return "not_owned";

  // Always attempt chain verification if collection is configured
  if (COLLECTION_ADDRESS) {
    const chainResult = await checkOnchainOwnership(
      COLLECTION_ADDRESS,
      row.tokenId,
      walletAddress,
    );

    if (chainResult === "owned") return "owned";

    if (chainResult === "not_owned") {
      // Confirmed not-owned on chain — deactivate
      await prisma.shopMint.update({
        where: { id: row.id },
        data: { active: false },
      });
      return "not_owned";
    }

    // Chain check failed — only trust cached ownership if recently confirmed
    if (false) {
      void 0;
      if (false) {
        return "owned"; // Recently confirmed — trust cache briefly
      }
    }

    return "verification_unavailable";
  }

  // No collection configured — cannot verify
  return "verification_unavailable";
}

async function checkOnchainOwnership(
  collectionAddress: string,
  tokenId: string,
  expectedOwner: string,
): Promise<OwnershipStatus> {
  try {
    const { checkOp721Ownership } = await import("@opfun/opnet");
    const owned = await checkOp721Ownership(
      collectionAddress,
      parseNumericTokenId(tokenId),
      expectedOwner,
    );
    return owned ? "owned" : "not_owned";
  } catch {
    return "verification_unavailable";
  }
}

// ── Use / toggle (app-state only, revalidates ownership first) ───────────────

export async function useShopItem(
  walletAddress: string,
  itemKey: ShopItemKey,
  active?: boolean,
): Promise<ShopMintRecord> {
  // Revalidate live ownership before enabling
  const ownership = await revalidateOwnership(walletAddress, itemKey);
  if (ownership === "not_owned") {
    throw new Error("Item not owned. On-chain ownership verification failed.");
  }
  if (ownership === "verification_unavailable") {
    throw new Error("Ownership verification unavailable. Try again when the network is reachable.");
  }

  const row = await prisma.shopMint.findUnique({
    where: { walletAddress_itemKey: { walletAddress, itemKey } },
  });

  if (!row || row.status !== "CONFIRMED") {
    throw new Error("Item not owned or not yet confirmed.");
  }

  const nextActive = typeof active === "boolean" ? active : true;
  const now = new Date();

  const updated = await prisma.shopMint.update({
    where: { id: row.id },
    data: {
      active: nextActive,
      usedAt: nextActive ? now : row.usedAt,
    },
  });

  return toMintRecord(updated);
}

// ── Pending mint listing (for watcher confirmation) ──────────────────────────

export async function listPendingMints(limit = 50): Promise<ShopMintRecord[]> {
  const rows = await prisma.shopMint.findMany({
    where: { status: "PENDING" },
    orderBy: { mintedAt: "asc" },
    take: limit,
  });
  return rows.map(toMintRecord);
}
