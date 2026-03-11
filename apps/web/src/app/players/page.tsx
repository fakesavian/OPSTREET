"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { fetchPlayerProfile } from "@/lib/api";

type PlayerProfile = {
  walletAddress: string;
  displayName: string;
  level: number;
  title: string;
  xp: number;
  trustScore: number;
  badges: Array<{ id: string; name: string; tier: string; iconKey: string }>;
  recentTrades: Array<{
    id: string;
    tokenSymbol: string;
    side: string;
    amountSats: number;
    tokenAmount: number;
    priceSats: number;
    confirmedAt: string;
  }>;
  recentCallouts: Array<{ id: string; content: string; grade: { multiple: number } | null }>;
};

export default function PlayersPage() {
  const { wallet } = useWallet();
  const [queryWallet, setQueryWallet] = useState(wallet?.address ?? "");
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (wallet?.address) setQueryWallet(wallet.address);
  }, [wallet?.address]);

  async function loadProfile(target: string): Promise<void> {
    if (!target) {
      setError("Enter a wallet address.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await fetchPlayerProfile(target);
      setProfile(data as unknown as PlayerProfile);
    } catch (e) {
      setProfile(null);
      setError(e instanceof Error ? e.message : "Failed to load player profile.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24 sm:pb-10">
      <div className="op-panel p-6">
        <h1 className="text-2xl font-black text-ink">Players</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Profile stats, progression, badges, and recent activity.</p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={queryWallet}
            onChange={(e) => setQueryWallet(e.target.value)}
            placeholder="Wallet address"
            className="input flex-1"
          />
          <button
            onClick={() => void loadProfile(queryWallet.trim())}
            disabled={loading}
            className="op-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load Player"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm font-semibold text-opRed">{error}</p>}

      {profile && (
        <>
          <div className="op-panel p-6">
            <p className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">Player</p>
            <h2 className="text-xl font-black text-ink">{profile.displayName}</h2>
            <p className="text-xs text-[var(--text-muted)]">{profile.walletAddress}</p>

            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              <Stat label="Level" value={String(profile.level)} />
              <Stat label="Title" value={profile.title} />
              <Stat label="XP" value={String(profile.xp)} />
              <Stat label="Trust" value={String(profile.trustScore)} />
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="op-panel p-6">
              <h3 className="text-lg font-black text-ink">Badges</h3>
              {profile.badges.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-muted)]">No badges yet.</p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {profile.badges.slice(0, 12).map((badge) => (
                    <div key={badge.id} className="rounded-lg border-2 border-ink/20 bg-[var(--cream)] px-3 py-2">
                      <p className="text-xs font-black text-ink">{badge.name}</p>
                      <p className="text-[10px] uppercase text-[var(--text-muted)]">{badge.tier}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="op-panel p-6">
              <h3 className="text-lg font-black text-ink">Recent Trades</h3>
              {profile.recentTrades.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-muted)]">No confirmed live trades yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {profile.recentTrades.slice(0, 8).map((trade) => (
                    <div key={trade.id} className="rounded-lg border-2 border-ink/20 bg-[var(--cream)] px-3 py-2 text-xs">
                      <p className="font-black text-ink">{trade.side} {trade.tokenSymbol}</p>
                      <p className="text-[var(--text-muted)]">
                        {trade.tokenAmount.toLocaleString()} tokens · {trade.amountSats.toLocaleString()} sats @ {trade.priceSats.toLocaleString()} sats
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border-2 border-ink/20 bg-[var(--cream)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-black text-ink">{value}</p>
    </div>
  );
}
