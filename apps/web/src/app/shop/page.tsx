"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  fetchShopItems,
  shopMintIntent,
  shopMintBroadcast,
  useShopItem as applyShopItem,
  type ShopCatalogItemState,
  type ShopItemKey,
} from "@/lib/api";
import { signInteractionBuffer } from "@/lib/wallet";

function formatPrice(item: ShopCatalogItemState): string {
  if (item.pricing.freeMint) return "Free mint";
  return `${item.pricing.amount.toLocaleString()} ${item.pricing.displayToken}`;
}

function shopUseLabel(item: ShopCatalogItemState): string {
  if (item.itemKey === "PAINT_SET") return item.active ? "Paint Set Active" : "Use Paint Set";
  if (item.itemKey === "CLAN_FORMATION_LICENSE") return item.active ? "License Active" : "Use License";
  return item.active ? "Ticket Active" : "Use Ticket";
}

type MintStep = "idle" | "preparing" | "signing" | "broadcasting" | "done";

export default function ShopPage() {
  const { wallet } = useWallet();
  const walletAddress = wallet?.address;

  const [items, setItems] = useState<ShopCatalogItemState[]>([]);
  const [collectionAddress, setCollectionAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyItem, setBusyItem] = useState<ShopItemKey | null>(null);
  const [mintStep, setMintStep] = useState<MintStep>("idle");
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const data = await fetchShopItems(walletAddress);
      setItems(data.items);
      setCollectionAddress(data.collectionAddress ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shop.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  const ownedCount = useMemo(() => items.filter((item) => item.owned).length, [items]);

  async function handleMint(itemKey: ShopItemKey) {
    if (!walletAddress) {
      setError("Connect and verify wallet first.");
      return;
    }

    setBusyItem(itemKey);
    setMintStep("preparing");
    setError("");

    try {
      // Step 1: Backend prepares mint interaction buffer
      const intent = await shopMintIntent(itemKey);

      if (!intent.interaction) {
        throw new Error(
          "Mint interaction could not be prepared. The OP721 collection may not be deployed or configured.",
        );
      }

      // Step 2: Wallet signs the interaction buffer
      setMintStep("signing");
      const signed = await signInteractionBuffer(intent.interaction.offlineBufferHex);

      // Step 3: Backend broadcasts the signed transaction
      setMintStep("broadcasting");
      await shopMintBroadcast(
        itemKey,
        signed.interactionTransactionRaw,
        signed.fundingTransactionRaw,
      );

      setMintStep("done");
      await refresh();
      window.dispatchEvent(new Event("opstreet:licenses-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mint failed.");
    } finally {
      setMintStep("idle");
      setBusyItem(null);
    }
  }

  async function handleUse(item: ShopCatalogItemState) {
    if (!walletAddress) {
      setError("Connect and verify wallet first.");
      return;
    }

    const itemKey = item.itemKey;
    setBusyItem(itemKey);
    setError("");
    try {
      const nextActive = item.itemKey === "PAINT_SET" ? !item.active : true;
      await applyShopItem(itemKey, nextActive);
      await refresh();
      window.dispatchEvent(new Event("opstreet:licenses-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Use action failed.");
    } finally {
      setBusyItem(null);
    }
  }

  function mintButtonLabel(item: ShopCatalogItemState): string {
    if (item.owned) return "Owned";
    if (busyItem !== item.itemKey) return "Mint";
    if (mintStep === "preparing") return "Preparing...";
    if (mintStep === "signing") return "Sign in wallet...";
    if (mintStep === "broadcasting") return "Broadcasting...";
    return "Minting...";
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-24 sm:pb-10">
      <div className="op-panel p-6">
        <h1 className="text-2xl font-black text-ink">OpStreet Shop</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Wallet-bound OP721 items with on-chain ownership verification.
        </p>
        <p className="mt-2 text-xs font-black text-[var(--text-secondary)]">
          {walletAddress ? `Owned items: ${ownedCount}/${items.length}` : "Connect wallet to mint and use items."}
        </p>
        {collectionAddress && (
          <p className="mt-1 text-[10px] font-mono text-[var(--text-muted)] break-all">
            Collection: {collectionAddress}
          </p>
        )}
      </div>

      {loading ? (
        <div className="op-panel p-6 text-sm text-[var(--text-muted)]">Loading shop...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {items.map((item) => (
            <article key={item.itemKey} className="op-panel p-4 flex flex-col gap-3">
              <div className="overflow-hidden rounded-xl border-2 border-ink/20 bg-[var(--cream)]">
                <img src={item.imageUrl} alt={item.name} className="h-44 w-full object-cover" />
              </div>

              <div>
                <h2 className="text-lg font-black text-ink">{item.name}</h2>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{item.description}</p>
              </div>

              <div className="rounded-lg border-2 border-ink/20 bg-[var(--cream)] px-3 py-2 text-xs font-bold text-ink">
                Price: {formatPrice(item)}
              </div>

              {item.owned ? (
                <div className="rounded-lg border-2 border-opGreen/30 bg-opGreen/10 px-3 py-2 text-xs text-ink space-y-1">
                  <p className="font-black text-opGreen">Owned</p>
                  {item.collectionAddress && (
                    <p className="font-mono text-[10px] break-all">Collection: {item.collectionAddress}</p>
                  )}
                  {item.tokenId && (
                    <p className="font-mono text-[10px] break-all">Token ID: {item.tokenId}</p>
                  )}
                  {item.mintTxId && (
                    <p className="font-mono text-[10px] break-all">Tx: {item.mintTxId}</p>
                  )}
                  {item.confirmedAt && (
                    <p className="text-[10px] text-[var(--text-muted)]">Confirmed: {new Date(item.confirmedAt).toLocaleString()}</p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border-2 border-ink/20 bg-[var(--cream)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                  One-time mint per wallet.
                </div>
              )}

              <div className="mt-auto flex gap-2">
                <button
                  onClick={() => void handleMint(item.itemKey)}
                  disabled={!walletAddress || item.owned || busyItem === item.itemKey}
                  className="op-btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {mintButtonLabel(item)}
                </button>

                <button
                  onClick={() => void handleUse(item)}
                  disabled={!walletAddress || !item.owned || busyItem === item.itemKey}
                  className="op-btn-outline flex-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyItem === item.itemKey ? "Applying..." : shopUseLabel(item)}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {error && <p className="text-xs font-semibold text-opRed">{error}</p>}
    </div>
  );
}
