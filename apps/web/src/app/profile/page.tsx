"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { truncateAddress } from "@/lib/wallet";
import {
  fetchPlayerMe,
  updatePlayerMe,
  useShopItem as applyShopItem,
  type PlayerMeProfile,
  type PlayerMeInventoryItem,
} from "@/lib/api";

function itemUseLabel(item: PlayerMeInventoryItem): string {
  if (item.itemKey === "PAINT_SET") return item.active ? "Disable" : "Use";
  return item.active ? "Active" : "Use";
}

export default function ProfilePage() {
  const { wallet } = useWallet();
  const walletAddress = wallet?.address;

  const [profile, setProfile] = useState<PlayerMeProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [spriteBusy, setSpriteBusy] = useState<string | null>(null);
  const [itemBusy, setItemBusy] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    if (!walletAddress) {
      setProfile(null);
      return;
    }

    setLoading(true);
    try {
      const next = await fetchPlayerMe();
      setProfile(next);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile.");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  const selectedSprite = useMemo(() => {
    if (!profile) return null;
    return profile.spriteOptions.find((sprite) => sprite.id === profile.selectedSpriteId) ?? null;
  }, [profile]);

  async function chooseSprite(spriteId: string): Promise<void> {
    setSpriteBusy(spriteId);
    setError("");
    try {
      const next = await updatePlayerMe({ selectedSpriteId: spriteId });
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              selectedSpriteId: next.selectedSpriteId,
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to equip sprite.");
    } finally {
      setSpriteBusy(null);
    }
  }

  async function applyInventoryItem(item: PlayerMeInventoryItem): Promise<void> {
    setItemBusy(item.itemKey);
    setError("");
    try {
      const nextActive = item.itemKey === "PAINT_SET" ? !item.active : true;
      await applyShopItem(item.itemKey as "PAINT_SET" | "CLAN_FORMATION_LICENSE" | "GALLERY_TICKET", nextActive);
      await refresh();
      window.dispatchEvent(new Event("opstreet:licenses-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to use item.");
    } finally {
      setItemBusy(null);
    }
  }

  if (!walletAddress) {
    return (
      <div className="op-panel p-6">
        <h1 className="text-2xl font-black text-ink">Profile</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Connect and verify your wallet to open your profile.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-24 sm:pb-10">
      <section className="op-panel p-6">
        <h1 className="text-2xl font-black text-ink">Player Profile</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Wallet: <span className="font-mono text-ink">{truncateAddress(walletAddress)}</span>
        </p>
        {selectedSprite && (
          <div className="mt-4 inline-flex items-center gap-3 rounded-xl border-2 border-ink/20 bg-[var(--cream)] px-3 py-2">
            <img src={selectedSprite.imageUrl} alt={selectedSprite.label} className="h-10 w-10 rounded border-2 border-ink object-contain" />
            <div>
              <p className="text-xs font-black text-ink">Current Sprite</p>
              <p className="text-xs text-[var(--text-muted)]">{selectedSprite.label}</p>
            </div>
          </div>
        )}
      </section>

      <section className="op-panel p-6">
        <h2 className="text-lg font-black text-ink">Sprite Selector</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">This sprite is used on the Trading Floor.</p>
        {loading ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">Loading profile...</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(profile?.spriteOptions ?? []).map((sprite) => {
              const selected = profile?.selectedSpriteId === sprite.id;
              return (
                <button
                  key={sprite.id}
                  onClick={() => void chooseSprite(sprite.id)}
                  disabled={spriteBusy === sprite.id}
                  className={`rounded-xl border-3 p-3 text-left transition-colors ${
                    selected
                      ? "border-ink bg-opYellow"
                      : "border-ink/30 bg-[var(--cream)] hover:border-ink hover:bg-opYellow/20"
                  }`}
                >
                  <img src={sprite.imageUrl} alt={sprite.label} className="h-16 w-16 rounded border-2 border-ink object-contain bg-white" />
                  <p className="mt-2 text-sm font-black text-ink">{sprite.label}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {spriteBusy === sprite.id ? "Saving..." : selected ? "Selected" : "Click to equip"}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="op-panel p-6">
        <h2 className="text-lg font-black text-ink">Onchain Inventory</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">OP721 mints and entitlements verified for this wallet.</p>
        {loading ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">Loading inventory...</p>
        ) : profile?.onchainInventory.length ? (
          <div className="mt-4 space-y-3">
            {profile.onchainInventory.map((item) => (
              <div key={item.itemKey} className="rounded-xl border-2 border-ink/20 bg-[var(--cream)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-ink">{item.itemKey}</p>
                    <p className="text-xs text-[var(--text-muted)]">Entitlement: {item.entitlement}</p>
                    {item.collectionAddress && (
                      <p className="mt-1 text-[10px] font-mono text-[var(--text-secondary)] break-all">Collection: {item.collectionAddress}</p>
                    )}
                    {item.tokenId && (
                      <p className="text-[10px] font-mono text-[var(--text-secondary)] break-all">Token ID: {item.tokenId}</p>
                    )}
                    {item.mintTxId && (
                      <p className="text-[10px] font-mono text-[var(--text-secondary)] break-all">Tx: {item.mintTxId}</p>
                    )}
                    {item.confirmedAt && (
                      <p className="text-[10px] text-[var(--text-muted)]">Confirmed: {new Date(item.confirmedAt).toLocaleString()}</p>
                    )}
                  </div>
                  <button
                    onClick={() => void applyInventoryItem(item)}
                    disabled={itemBusy === item.itemKey || (item.itemKey !== "PAINT_SET" && item.active)}
                    className="op-btn-outline text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {itemBusy === item.itemKey ? "Applying..." : itemUseLabel(item)}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--text-muted)]">No minted items yet. Mint from the Shop page.</p>
        )}
      </section>

      {error && <p className="text-xs font-semibold text-opRed">{error}</p>}
    </div>
  );
}
