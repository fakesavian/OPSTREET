"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import {
  createClan,
  fetchClanLicenseStatus,
  fetchClans,
  fetchMyClan,
  joinClan,
  leaveClan,
  type ClanDTO,
} from "@/lib/api";

export default function ClansPage() {
  const { wallet } = useWallet();
  const walletAddress = wallet?.address;

  const [clans, setClans] = useState<ClanDTO[]>([]);
  const [myClan, setMyClan] = useState<ClanDTO | null>(null);
  const [licenseUnlocked, setLicenseUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [bio, setBio] = useState("");

  async function reload(): Promise<void> {
    setLoading(true);
    try {
      const list = await fetchClans(walletAddress);
      setClans(list.items);

      if (!walletAddress) {
        setLicenseUnlocked(false);
        setMyClan(null);
      } else {
        const [license, mine] = await Promise.all([
          fetchClanLicenseStatus(walletAddress),
          fetchMyClan(),
        ]);
        setLicenseUnlocked(license.clansUnlocked);
        setMyClan(mine.clan);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load clans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  async function onCreateClan(): Promise<void> {
    if (!walletAddress) return;
    if (!name.trim() || !tag.trim()) {
      setError("Clan name and tag are required.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await createClan({ walletAddress, name: name.trim(), tag: tag.trim(), bio: bio.trim() || undefined });
      setName("");
      setTag("");
      setBio("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create clan.");
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(clanId: string): Promise<void> {
    if (!walletAddress) return;
    setBusy(true);
    setError("");
    try {
      await joinClan(clanId, walletAddress);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join clan.");
    } finally {
      setBusy(false);
    }
  }

  async function onLeave(): Promise<void> {
    if (!walletAddress || !myClan) return;
    setBusy(true);
    setError("");
    try {
      await leaveClan(myClan.id, walletAddress);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to leave clan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24 sm:pb-10">
      <div className="op-panel p-6">
        <h1 className="text-2xl font-black text-ink">Clans</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Team up with other players, build identity, and compete.
        </p>
      </div>

      {!walletAddress && (
        <div className="op-panel border-opYellow p-5 text-sm font-semibold text-ink">
          Connect wallet to unlock clan features.
        </div>
      )}

      {walletAddress && !licenseUnlocked && !myClan && (
        <div className="op-panel border-opYellow bg-opYellow/15 p-5">
          <p className="text-sm font-black text-ink">Clan Formation License required to create a clan.</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">You can still join existing clans without a license.</p>
          <a href="/shop" className="op-btn-primary mt-3">Open Shop</a>
        </div>
      )}

      {walletAddress && licenseUnlocked && !myClan && (
        <div className="op-panel p-6">
          <h2 className="text-lg font-black text-ink">Create Clan</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Clan name"
              className="input"
            />
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value.toUpperCase())}
              placeholder="Tag (2-6 chars)"
              className="input"
            />
          </div>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 220))}
            placeholder="Clan bio (optional)"
            className="input mt-2 resize-none"
            rows={3}
          />
          <button
            onClick={() => void onCreateClan()}
            disabled={busy}
            className="op-btn-primary mt-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Creating..." : "Create Clan"}
          </button>
        </div>
      )}

      {myClan && (
        <div className="op-panel p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">Your Clan</p>
              <h2 className="text-xl font-black text-ink">[{myClan.tag}] {myClan.name}</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{myClan.bio || "No clan bio."}</p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Members: {myClan.memberCount}</p>
            </div>
            <button
              onClick={() => void onLeave()}
              disabled={busy}
              className="op-btn-outline text-opRed"
            >
              Leave Clan
            </button>
          </div>
        </div>
      )}

      <div className="op-panel p-6">
        <h2 className="text-lg font-black text-ink">Clan Directory</h2>
        {loading ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">Loading clans...</p>
        ) : clans.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">No clans yet. Start the first one.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {clans.map((clan) => (
              <div key={clan.id} className="rounded-xl border-2 border-ink/20 bg-[var(--cream)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-ink">[{clan.tag}] {clan.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{clan.memberCount} members</p>
                  </div>
                  {walletAddress && !myClan && (
                    <button
                      onClick={() => void onJoin(clan.id)}
                      disabled={busy}
                      className="op-btn-primary text-xs"
                    >
                      Join
                    </button>
                  )}
                </div>
                {clan.bio && <p className="mt-1 text-xs text-[var(--text-secondary)]">{clan.bio}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm font-semibold text-opRed">{error}</p>}
    </div>
  );
}
