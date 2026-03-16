"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { PixelAvatarPreview } from "@/components/floor/PixelAvatarPreview";
import { submitOpnetLiquidityFundingWithWallet, toBip322Address, truncateAddress } from "@/lib/wallet";
import {
  fetchPlayerMe,
  fetchPlayerProfile,
  fetchPrices,
  fetchWalletBalance,
  updatePlayerMe,
  useShopItem as applyShopItem,
  type PlayerMeProfile,
  type PlayerMeInventoryItem,
  type PlayerProfile,
  type PriceData,
  type WalletBalance,
} from "@/lib/api";
type WalletAction = "deposit" | "receive" | "send" | null;

function usernameFromDisplayName(displayName: string): string {
  const raw = displayName.trim();
  const cleaned = raw.replace(/\s+/g, "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (/^(opt1|tb1|bc1|bcrt1)[a-z0-9]{20,}$/i.test(raw) || cleaned.length > 24) {
    return `@${cleaned.slice(0, 8)}...${cleaned.slice(-6)}`;
  }
  return cleaned ? `@${cleaned.toLowerCase()}` : "@opstreet";
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatSats(value: number): string {
  return `${Math.round(value).toLocaleString()} sats`;
}

function itemUseLabel(item: PlayerMeInventoryItem): string {
  if (item.itemKey === "PAINT_SET") return item.active ? "Disable" : "Use";
  return item.active ? "Active" : "Use";
}

export default function ProfilePage() {
  const { wallet } = useWallet();
  const walletAddress = wallet?.address;

  const [profile, setProfile] = useState<PlayerMeProfile | null>(null);
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [spriteBusy, setSpriteBusy] = useState<string | null>(null);
  const [itemBusy, setItemBusy] = useState<string | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [displayBusy, setDisplayBusy] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [bioBusy, setBioBusy] = useState(false);
  const [selectedBaseId, setSelectedBaseId] = useState("");
  const [activeWalletAction, setActiveWalletAction] = useState<WalletAction>("deposit");
  const [sendTo, setSendTo] = useState("");
  const [sendAmountSats, setSendAmountSats] = useState("");
  const [sendMemo, setSendMemo] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  async function refresh(): Promise<void> {
    if (!walletAddress) {
      setProfile(null);
      setPlayerProfile(null);
      setPriceData(null);
      setWalletBalance(null);
      return;
    }

    setLoading(true);
    try {
      const [meResult, playerResult, priceResult, balanceResult] = await Promise.allSettled([
        fetchPlayerMe(),
        fetchPlayerProfile(walletAddress),
        fetchPrices(),
        fetchWalletBalance(walletAddress),
      ]);

      if (meResult.status === "rejected") {
        throw meResult.reason;
      }

      setProfile(meResult.value);
      setDisplayNameDraft(meResult.value.displayName);
      setBioDraft(meResult.value.bio ?? "");

      if (playerResult.status === "fulfilled") {
        setPlayerProfile(playerResult.value);
      } else {
        setPlayerProfile(null);
      }

      if (priceResult.status === "fulfilled") {
        setPriceData(priceResult.value);
      } else {
        setPriceData(null);
      }

      if (balanceResult.status === "fulfilled") {
        setWalletBalance(balanceResult.value);
      } else {
        setWalletBalance(null);
      }

      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile.");
      setProfile(null);
      setPlayerProfile(null);
      setPriceData(null);
      setWalletBalance(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  useEffect(() => {
    if (profile?.selectedSpriteId) {
      setSelectedBaseId(profile.selectedSpriteId);
    }
  }, [profile?.selectedSpriteId]);

  const selectedSprite = useMemo(() => {
    if (!profile) return null;
    const selectedId = selectedBaseId || profile.selectedSpriteId;
    return profile.spriteOptions.find((sprite) => sprite.id === selectedId) ?? null;
  }, [profile, selectedBaseId]);
  const selectedAvatarId = selectedSprite?.id ?? profile?.selectedSpriteId ?? "sprite-adam";
  const spriteOptions = useMemo(() => profile?.spriteOptions ?? [], [profile?.spriteOptions]);
  const selectedBaseIndex = useMemo(() => {
    if (!spriteOptions.length) return 0;
    const activeId = selectedBaseId || profile?.selectedSpriteId || spriteOptions[0]?.id;
    const foundIndex = spriteOptions.findIndex((sprite) => sprite.id === activeId);
    return foundIndex >= 0 ? foundIndex : 0;
  }, [profile?.selectedSpriteId, selectedBaseId, spriteOptions]);

  const portfolioSats = useMemo(() => {
    return playerProfile?.currentPositions.reduce((sum, position) => sum + position.estimatedValueSats, 0) ?? 0;
  }, [playerProfile]);

  const btcUsd = priceData?.btcUsd ?? 0;
  const portfolioUsd = btcUsd > 0 ? (portfolioSats / 100_000_000) * btcUsd : 0;
  const walletBalanceSats = walletBalance?.totalSats ?? portfolioSats;
  const walletBalanceUsd = walletBalance?.usd ?? portfolioUsd;
  const username = usernameFromDisplayName(profile?.displayName ?? walletAddress ?? "");
  const followerCount = playerProfile?.followerCount ?? profile?.followerCount ?? 0;
  const followingCount = playerProfile?.followingCount ?? profile?.followingCount ?? 0;
  const createdCount = playerProfile?.foundation.tokensCreated ?? 0;
  const bip322Address = walletAddress ? toBip322Address(walletAddress) : null;
  const hasAlternateReceiveAddress = Boolean(bip322Address && bip322Address !== walletAddress);

  function shiftBase(direction: -1 | 1): void {
    if (!spriteOptions.length) return;
    const nextIndex = (selectedBaseIndex + direction + spriteOptions.length) % spriteOptions.length;
    setSelectedBaseId(spriteOptions[nextIndex]!.id);
  }

  async function chooseSprite(spriteId: string): Promise<void> {
    setSpriteBusy(spriteId);
    setError("");
    setNotice("");
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
      setSelectedBaseId(next.selectedSpriteId);
      setNotice("Base character updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to equip sprite.");
    } finally {
      setSpriteBusy(null);
    }
  }

  async function applyInventoryItem(item: PlayerMeInventoryItem): Promise<void> {
    setItemBusy(item.itemKey);
    setError("");
    setNotice("");
    try {
      const nextActive = item.itemKey === "PAINT_SET" ? !item.active : true;
      await applyShopItem(item.itemKey as "PAINT_SET" | "CLAN_FORMATION_LICENSE" | "GALLERY_TICKET", nextActive);
      await refresh();
      window.dispatchEvent(new Event("opstreet:licenses-updated"));
      setNotice(`${item.itemKey} updated.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to use item.");
    } finally {
      setItemBusy(null);
    }
  }

  async function saveDisplayName(): Promise<void> {
    const nextName = displayNameDraft.trim();
    if (nextName.length < 2) {
      setError("Username must be at least 2 characters.");
      return;
    }

    setDisplayBusy(true);
    setError("");
    setNotice("");
    try {
      await updatePlayerMe({ displayName: nextName });
      await refresh();
      setNotice("Username updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update username.");
    } finally {
      setDisplayBusy(false);
    }
  }

  async function copyValue(value: string, label: string): Promise<void> {
    setError("");
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} address copied.`);
    } catch {
      setError("Clipboard access failed.");
    }
  }

  async function saveBio(): Promise<void> {
    setBioBusy(true);
    setError("");
    setNotice("");
    try {
      await updatePlayerMe({ bio: bioDraft.trim() });
      await refresh();
      setNotice("Bio updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update bio.");
    } finally {
      setBioBusy(false);
    }
  }

  async function submitSend(): Promise<void> {
    if (!wallet) {
      setError("Connect a wallet first.");
      return;
    }
    if (wallet.provider !== "opnet") {
      setError("OP_WALLET is required to send from this profile.");
      return;
    }

    const toAddress = sendTo.trim();
    const amountSats = Number(sendAmountSats);
    if (!toAddress) {
      setError("Recipient address is required.");
      return;
    }
    if (!Number.isFinite(amountSats) || amountSats <= 0) {
      setError("Send amount must be greater than zero.");
      return;
    }

    setSendBusy(true);
    setError("");
    setNotice("");
    try {
      const funding = await submitOpnetLiquidityFundingWithWallet(wallet.provider, {
        toAddress,
        amountSats: Math.round(amountSats),
        memo: sendMemo.trim() || undefined,
        senderAddress: walletAddress,
      });
      if (!funding?.txId) {
        throw new Error("Wallet did not return a transaction id.");
      }
      setNotice(`Sent ${formatSats(amountSats)} to ${truncateAddress(toAddress)}. Tx ${funding.txId.slice(0, 12)}...`);
      setSendTo("");
      setSendAmountSats("");
      setSendMemo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send funds.");
    } finally {
      setSendBusy(false);
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
      <section className="op-panel overflow-hidden p-0">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="bg-[var(--panel-cream)] p-6">
            <div className="mx-auto max-w-[760px]">
              <div className="flex items-start gap-4">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-[3px] border-ink bg-opYellow">
                  {selectedSprite ? (
                    <PixelAvatarPreview
                      avatarId={selectedAvatarId}
                      walletAddress={walletAddress}
                      frameWidth={24}
                      showShadow={false}
                    />
                  ) : (
                    <span className="text-xs font-black text-ink">NO BASE</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Wallet Profile</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <h1 className="max-w-full break-all text-[2rem] font-black leading-tight text-ink">{username}</h1>
                    <span className="rounded-full border-2 border-ink bg-opYellow px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-ink">
                      {playerProfile?.title ?? "Rookie"} · LVL {playerProfile?.level ?? 1}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
                    <span className="font-mono text-ink">{truncateAddress(walletAddress)}</span>
                    <button onClick={() => void copyValue(walletAddress, "Wallet")} className="op-btn-outline px-3 py-1 text-[11px]">
                      Copy
                    </button>
                  </div>
                  <p className="mt-3 max-w-xl text-sm text-[var(--text-secondary)]">
                    {bioDraft.trim() || "Customize your floor identity, track live positions, and flex your onchain inventory in one brutalist wallet profile."}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <MetricCard label="Followers" value={String(followerCount)} accent="bg-[var(--panel-cream)]" />
                <MetricCard label="Following" value={String(followingCount)} accent="bg-[var(--panel-cream)]" />
                <MetricCard label="Tokens Created" value={String(createdCount)} accent="bg-[var(--panel-cream)]" />
              </div>
            </div>
          </div>

          <div className="border-t-[3px] border-ink bg-[linear-gradient(180deg,#f7e6be_0%,#e6bd78_48%,#c07b3f_100%)] p-6 text-[#2d1708] lg:border-l-[3px] lg:border-t-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#5d3616]">Tracked Wallet Value</p>
            <div className="mt-4">
              <p className="text-5xl font-black leading-none">{formatUsd(walletBalanceUsd)}</p>
              <p className="mt-2 text-base font-semibold text-[#5d3616]">{formatSats(walletBalanceSats)} across wallet balance</p>
              {walletBalance && walletBalance.unconfirmedSats !== 0 && (
                <p className="mt-1 text-xs font-semibold text-[#6d4320]">
                  Pending mempool delta: {formatSats(walletBalance.unconfirmedSats)}
                </p>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <ActionTile
                label="Deposit"
                caption="Fund this wallet"
                onClick={() => setActiveWalletAction("deposit")}
                tone="mint"
                active={activeWalletAction === "deposit"}
              />
              <ActionTile
                label="Receive"
                caption="Share receive rails"
                onClick={() => setActiveWalletAction("receive")}
                active={activeWalletAction === "receive"}
              />
              <ActionTile
                label="Send"
                caption={wallet?.provider === "opnet" ? "Send from OP_WALLET" : "OP_WALLET required"}
                onClick={() => setActiveWalletAction("send")}
                active={activeWalletAction === "send"}
              />
              <Link href="/create" className="block">
                <ActionTile label="Create" caption="Launch a token" asChild tone="yellow" />
              </Link>
              <Link href="/settings" className="block">
                <ActionTile label="Settings" caption="Sound & preferences" asChild />
              </Link>
            </div>

            {activeWalletAction && (
              <div className="mt-4 rounded-[22px] border-[3px] border-[#75461e] bg-[rgba(255,248,232,0.84)] p-4 shadow-[0_8px_0_rgba(68,37,11,0.18)] backdrop-blur-sm">
                {activeWalletAction === "deposit" && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-black text-[#2d1708]">Deposit rails</p>
                      <p className="mt-1 text-xs font-semibold text-[#6d4320]">
                        Fund this profile through its live wallet addresses. Use the OP_NET address inside OP_WALLET.
                      </p>
                    </div>
                    <AddressRail
                      label="OP_NET address"
                      value={walletAddress}
                      hint="Primary testnet wallet address for profile funding."
                      onCopy={() => void copyValue(walletAddress, "OP_NET")}
                    />
                    {hasAlternateReceiveAddress && bip322Address ? (
                      <AddressRail
                        label="Bitcoin testnet address"
                        value={bip322Address}
                        hint="Fallback rail for tools that expect tb1/bcrt1 formatting."
                        onCopy={() => void copyValue(bip322Address, "Bitcoin testnet")}
                      />
                    ) : null}
                  </div>
                )}

                {activeWalletAction === "receive" && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-black text-[#2d1708]">Receive and share</p>
                      <p className="mt-1 text-xs font-semibold text-[#6d4320]">
                        Share the address that matches the sender wallet. OP_WALLET users should prefer the OP_NET rail.
                      </p>
                    </div>
                    <AddressRail
                      label="Share this OP_NET rail"
                      value={walletAddress}
                      hint="Best option for OP_NET-native transfers."
                      onCopy={() => void copyValue(walletAddress, "Receive")}
                    />
                    {hasAlternateReceiveAddress && bip322Address ? (
                      <AddressRail
                        label="Share this BTC testnet rail"
                        value={bip322Address}
                        hint="Useful when the sender expects tb1 or bcrt1 addresses."
                        onCopy={() => void copyValue(bip322Address, "BTC testnet")}
                      />
                    ) : null}
                  </div>
                )}

                {activeWalletAction === "send" && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-black text-[#2d1708]">Send from profile wallet</p>
                      <p className="mt-1 text-xs font-semibold text-[#6d4320]">
                        This uses the OP_WALLET send flow directly from the connected wallet extension.
                      </p>
                    </div>
                    {wallet?.provider === "opnet" ? (
                      <>
                        <div>
                          <label className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6d4320]">Recipient</label>
                          <input
                            value={sendTo}
                            onChange={(e) => setSendTo(e.target.value)}
                            placeholder="opt1... or tb1..."
                            className="mt-2 w-full rounded-xl border-[3px] border-[#75461e] bg-[#fff5df] px-4 py-3 text-sm font-semibold text-[#2d1708] outline-none placeholder:text-[#9b764d]"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[0.45fr_0.55fr]">
                          <div>
                            <label className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6d4320]">Amount (sats)</label>
                            <input
                              value={sendAmountSats}
                              onChange={(e) => setSendAmountSats(e.target.value.replace(/[^\d]/g, ""))}
                              inputMode="numeric"
                              placeholder="1000"
                              className="mt-2 w-full rounded-xl border-[3px] border-[#75461e] bg-[#fff5df] px-4 py-3 text-sm font-semibold text-[#2d1708] outline-none placeholder:text-[#9b764d]"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6d4320]">Memo</label>
                            <input
                              value={sendMemo}
                              onChange={(e) => setSendMemo(e.target.value)}
                              placeholder="Optional note"
                              className="mt-2 w-full rounded-xl border-[3px] border-[#75461e] bg-[#fff5df] px-4 py-3 text-sm font-semibold text-[#2d1708] outline-none placeholder:text-[#9b764d]"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => void submitSend()}
                          disabled={sendBusy}
                          className="w-full rounded-[18px] border-[3px] border-ink bg-opYellow px-4 py-3 text-sm font-black text-ink shadow-[0_5px_0_#8f5c22] transition hover:-translate-y-[2px] hover:bg-[#ffd347] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {sendBusy ? "Sending..." : "Send With OP_WALLET"}
                        </button>
                      </>
                    ) : (
                      <div className="rounded-[18px] border-[3px] border-[#75461e] bg-[#fff5df] p-4">
                        <p className="text-sm font-semibold text-[#4b2a12]">
                          Connect with OP_WALLET to broadcast a send transaction from this page.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <MiniStat label="XP" value={formatCompact(playerProfile?.xp ?? 0)} />
              <MiniStat label="Trust" value={formatCompact(playerProfile?.trustScore ?? 50)} />
              <MiniStat label="Callouts" value={formatCompact(playerProfile?.foundation.calloutsCount ?? 0)} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="op-panel p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-ink">Character Lab</h2>
            </div>
            <span className="rounded-full border-2 border-ink bg-[var(--cream)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-ink">
              Trading Floor Ready
            </span>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="rounded-[20px] border-[3px] border-ink bg-[#fff3c4] p-4">
              <div className="rounded-[20px] border-[3px] border-ink bg-[radial-gradient(circle_at_center,_rgba(255,216,77,0.65),_rgba(255,251,235,1)_68%)] p-6">
                <div className="mx-auto flex h-[280px] max-w-[260px] items-center justify-center rounded-[24px] border-[3px] border-dashed border-ink bg-[var(--panel-cream)]">
                  {selectedSprite ? (
                    <PixelAvatarPreview
                      avatarId={selectedAvatarId}
                      walletAddress={walletAddress}
                      frameWidth={96}
                      className="scale-[1.15]"
                    />
                  ) : (
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Select a base</span>
                  )}
                </div>
                <p className="mt-4 text-center text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Front-facing floor preview
                </p>
              </div>
              <button
                onClick={() => selectedBaseId && void chooseSprite(selectedBaseId)}
                disabled={!selectedBaseId || spriteBusy === selectedBaseId || selectedBaseId === profile?.selectedSpriteId}
                className="op-btn-primary mt-4 w-full py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {spriteBusy === selectedBaseId ? "Saving Character..." : selectedBaseId === profile?.selectedSpriteId ? "Character Base Live" : "Confirm Character Base"}
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Base Characters</p>
                {loading ? (
                  <p className="mt-3 text-sm text-[var(--text-muted)]">Loading sprite bases...</p>
                ) : (
                  <div className="mt-3 rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-4">
                    {spriteOptions.length ? (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => shiftBase(-1)}
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-[3px] border-ink bg-white text-2xl font-black text-ink transition hover:bg-opYellow"
                          aria-label="Previous base character"
                        >
                          &#8249;
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedBaseId(spriteOptions[selectedBaseIndex]!.id)}
                          className="flex min-w-0 flex-1 items-center gap-4 rounded-[18px] border-[3px] border-ink bg-white px-4 py-4 text-left transition hover:bg-[#fff3c4]"
                        >
                          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-[3px] border-ink bg-[#fffaf0]">
                            <PixelAvatarPreview
                              avatarId={spriteOptions[selectedBaseIndex]!.id}
                              walletAddress={walletAddress}
                              frameWidth={40}
                              showShadow={false}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xl font-black text-ink">{spriteOptions[selectedBaseIndex]!.label}</p>
                            <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                              {profile?.selectedSpriteId === spriteOptions[selectedBaseIndex]!.id ? "Live on Floor" : "Ready to Equip"}
                            </p>
                            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                              {selectedBaseIndex + 1} / {spriteOptions.length}
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => shiftBase(1)}
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-[3px] border-ink bg-white text-2xl font-black text-ink transition hover:bg-opYellow"
                          aria-label="Next base character"
                        >
                          &#8250;
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--text-muted)]">No base characters unlocked yet.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Unlocked Characters</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(playerProfile?.currentCharacters ?? []).map((character) => (
                    <span
                      key={character.id}
                      className={`rounded-full border-2 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${
                        character.active ? "border-ink bg-opYellow text-ink" : "border-ink bg-white text-ink"
                      }`}
                    >
                      {character.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="op-panel p-6">
            <h2 className="text-2xl font-black text-ink">Identity</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="label">Selected Username</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex flex-1 items-center rounded-xl border-[3px] border-ink bg-[var(--panel-cream)] px-4">
                    <span className="text-lg font-black text-[var(--text-muted)]">@</span>
                    <input
                      value={displayNameDraft}
                      onChange={(e) => setDisplayNameDraft(e.target.value.slice(0, 18))}
                      placeholder="Choose a handle"
                      className="w-full bg-transparent px-2 py-3 text-sm font-bold text-ink outline-none"
                    />
                  </div>
                  <button
                    onClick={() => void saveDisplayName()}
                    disabled={displayBusy}
                    className="op-btn-primary min-w-[128px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {displayBusy ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>

              <div>
                <label className="label">Bio</label>
                <textarea
                  value={bioDraft}
                  onChange={(e) => {
                    setBioDraft(e.target.value.slice(0, 180));
                  }}
                  rows={4}
                  placeholder="Trader bio, project thesis, favorite meme sector..."
                  className="input min-h-[120px] resize-none"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold text-[var(--text-muted)]">Persists to your wallet profile across devices.</p>
                  <button
                    onClick={() => void saveBio()}
                    disabled={bioBusy}
                    className="op-btn-outline px-3 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bioBusy ? "Saving..." : "Save Bio"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="op-panel p-6">
            <h2 className="text-2xl font-black text-ink">Onchain Inventory</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">OP721 mints and wallet perks verified for this profile.</p>
            {loading ? (
              <p className="mt-3 text-sm text-[var(--text-muted)]">Loading inventory...</p>
            ) : profile?.onchainInventory.length ? (
              <div className="mt-4 space-y-3">
                {profile.onchainInventory.map((item) => (
                  <div key={item.itemKey} className="rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-ink">{item.itemKey.replace(/_/g, " ")}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Entitlement: {item.entitlement}</p>
                        {item.collectionAddress && (
                          <p className="mt-2 break-all font-mono text-[10px] text-[var(--text-secondary)]">{item.collectionAddress}</p>
                        )}
                        {item.confirmedAt && (
                          <p className="mt-2 text-[10px] font-semibold text-[var(--text-muted)]">
                            Confirmed {new Date(item.confirmedAt).toLocaleString()}
                          </p>
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
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.95fr]">
        <section className="op-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-ink">Open Positions</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Live holdings tracked from confirmed onchain fills.</p>
            </div>
            <Link href="/trending" className="op-btn-primary text-xs">
              Explore Movers
            </Link>
          </div>

          {playerProfile?.currentPositions.length ? (
            <div className="mt-5 space-y-3">
              {playerProfile.currentPositions.slice(0, 6).map((position) => {
                const usdValue = btcUsd > 0 ? (position.estimatedValueSats / 100_000_000) * btcUsd : 0;
                return (
                  <Link
                    key={position.projectId}
                    href={`/p/${position.slug}`}
                    className="block rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-4 transition hover:-translate-y-[2px] hover:bg-[#fff3c4]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-black text-ink">{position.ticker}</p>
                        <p className="text-sm text-[var(--text-muted)]">{position.name}</p>
                        <p className="mt-2 text-xs font-semibold text-[var(--text-secondary)]">
                          {position.tokenAmount.toLocaleString()} tokens · {formatSats(position.netFlowSats)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-ink">{formatUsd(usdValue)}</p>
                        <p className="text-xs text-[var(--text-muted)]">{formatSats(position.estimatedValueSats)}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-6 text-center">
              <p className="text-xl font-black text-ink">Make a move</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">Explore live coins to find your next winner.</p>
            </div>
          )}
        </section>

        <section className="op-panel p-6">
          <h2 className="text-2xl font-black text-ink">Recent Activity</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Latest trades and floor callouts tied to this wallet.</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Trades</p>
              {playerProfile?.recentTrades.length ? (
                playerProfile.recentTrades.slice(0, 5).map((trade) => (
                  <div key={trade.id} className="rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-4">
                    <p className="text-sm font-black text-ink">{trade.side} {trade.tokenSymbol}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {trade.tokenAmount.toLocaleString()} tokens at {trade.priceSats.toLocaleString()} sats
                    </p>
                  </div>
                ))
              ) : (
                <EmptyState copy="No recent trades yet." />
              )}
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Callouts</p>
              {playerProfile?.recentCallouts.length ? (
                playerProfile.recentCallouts.slice(0, 5).map((callout) => (
                  <div key={callout.id} className="rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-4">
                    <p className="text-sm font-semibold text-ink">{callout.content}</p>
                    <p className="mt-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      {callout.grade ? `${callout.grade.multiple.toFixed(2)}x graded` : "Awaiting grade"}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyState copy="No recent callouts yet." />
              )}
            </div>
          </div>
        </section>
      </div>

      {notice && <p className="text-xs font-semibold text-ink">{notice}</p>}
      {error && (
        <div className="rounded-xl border-2 border-[#EF4444] bg-[#FEE2E2] px-4 py-3 text-sm font-bold text-[#B91C1C]">
          &#9888; {error}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className={`rounded-[18px] border-[3px] border-ink p-4 ${accent}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-black text-ink">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border-[3px] border-[#75461e] bg-[rgba(255,246,226,0.78)] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#6d4320]">{label}</p>
      <p className="mt-1 text-lg font-black text-[#2d1708]">{value}</p>
    </div>
  );
}

function ActionTile({
  label,
  caption,
  onClick,
  disabled,
  tone = "default",
  asChild = false,
  active = false,
}: {
  label: string;
  caption: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "mint" | "yellow";
  asChild?: boolean;
  active?: boolean;
}) {
  const toneClass =
    tone === "mint"
      ? "border-ink bg-[#bde7bb] text-ink shadow-[0_5px_0_#6ea06a]"
      : tone === "yellow"
        ? "border-ink bg-opYellow text-ink shadow-[0_5px_0_#8f5c22]"
        : "border-ink bg-[#fff3d4] text-[#2d1708] shadow-[0_5px_0_#b57d44]";

  const className = `flex h-full min-h-[112px] flex-col justify-between rounded-[22px] border-[3px] p-4 text-left transition ${
    disabled ? "cursor-not-allowed opacity-50" : "hover:-translate-y-[2px]"
  } ${toneClass} ${active ? "ring-4 ring-[#fff1bb]" : ""}`;

  if (asChild) {
    return (
      <div className={className}>
        <p className="text-xl font-black">{label}</p>
        <p className="text-xs font-semibold opacity-80">{caption}</p>
      </div>
    );
  }

  return (
    <button onClick={onClick} disabled={disabled} className={className}>
      <p className="text-xl font-black">{label}</p>
      <p className="text-xs font-semibold opacity-80">{caption}</p>
    </button>
  );
}

function AddressRail({
  label,
  value,
  hint,
  onCopy,
}: {
  label: string;
  value: string;
  hint: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-[18px] border-[3px] border-[#75461e] bg-[#fff5df] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6d4320]">{label}</p>
          <p className="mt-2 break-all font-mono text-sm font-semibold text-[#2d1708]">{value}</p>
          <p className="mt-2 text-xs font-semibold text-[#6d4320]">{hint}</p>
        </div>
        <button
          onClick={onCopy}
          className="rounded-xl border-[3px] border-ink bg-opYellow px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-ink shadow-[0_4px_0_#8f5c22] transition hover:-translate-y-[2px] hover:bg-[#ffd347]"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-4">
      <p className="text-sm font-semibold text-[var(--text-muted)]">{copy}</p>
    </div>
  );
}

