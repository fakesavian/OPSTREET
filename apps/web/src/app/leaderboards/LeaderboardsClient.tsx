"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import type { LeaderboardRow, PlayerProfile } from "@/lib/api";
import { fetchLeaderboard, fetchPlayerProfile, followPlayer, unfollowPlayer } from "@/lib/api";

type TabKey = "earners" | "callouts" | "trending";

interface LeaderboardPayload {
  range: string;
  items: LeaderboardRow[];
}

type SelectedPlayerState =
  | PlayerProfile
  | {
      walletAddress: string;
      error: string;
      title?: string;
      level?: number;
      trustScore?: number;
      badges?: unknown[];
    };

const TAB_LABELS: Record<TabKey, string> = {
  earners: "Top Earners",
  callouts: "Best Callouts",
  trending: "Trending Players",
};

function rangesFor(tab: TabKey): string[] {
  if (tab === "trending") return ["24h", "7d"];
  return ["7d", "30d", "all"];
}

function formatSats(value: number | undefined): string {
  if (typeof value !== "number") return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString()} sats`;
}

function formatPct(value: number | undefined): string {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(1)}%`;
}

export function LeaderboardsClient({ initial, embedded = false }: { initial: LeaderboardPayload; embedded?: boolean }) {
  const { wallet } = useWallet();
  const [tab, setTab] = useState<TabKey>("earners");
  const [range, setRange] = useState<string>(initial.range);
  const [data, setData] = useState<LeaderboardPayload>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayerState | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    const validRanges = rangesFor(tab);
    if (!validRanges.includes(range)) setRange(validRanges[0] ?? "7d");
  }, [tab, range]);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError("");
    fetchLeaderboard(tab, range)
      .then((payload) => {
        if (canceled) return;
        setData(payload);
      })
      .catch((e) => {
        if (canceled) return;
        setError(e instanceof Error ? e.message : "Failed to load leaderboard");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [tab, range]);

  async function openProfile(walletAddress: string) {
    setDrawerLoading(true);
    setSelectedPlayer(null);
    try {
      const profile = await fetchPlayerProfile(walletAddress);
      setSelectedPlayer(profile);
    } catch {
      setSelectedPlayer({ walletAddress, error: "Failed to load player profile" });
    } finally {
      setDrawerLoading(false);
    }
  }

  async function toggleFollow(): Promise<void> {
    if (!selectedPlayer || "error" in selectedPlayer || selectedPlayer.viewerIsSelf) return;

    setFollowBusy(true);
    setError("");
    try {
      const counts = selectedPlayer.viewerIsFollowing
        ? await unfollowPlayer(selectedPlayer.walletAddress)
        : await followPlayer(selectedPlayer.walletAddress);

      setSelectedPlayer((current) => {
        if (!current || "error" in current) return current;
        return {
          ...current,
          followerCount: counts.followerCount,
          viewerIsFollowing: !current.viewerIsFollowing,
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update follow state");
    } finally {
      setFollowBusy(false);
    }
  }

  const rows = data.items;

  return (
    <div className="space-y-4 pb-20 sm:pb-0">
      {!embedded && (
        <div className="op-panel p-4">
          <h1 className="text-2xl font-black text-ink">Player Leaderboards</h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Confirmed live trading metrics and graded signal quality, ranked by performance.</p>
        </div>
      )}

      {embedded && (
        <div className="op-panel p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Leaderboard Room</p>
          <h2 className="mt-2 text-2xl font-black text-ink">Player Leaders</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
            Confirmed live trading metrics and graded signal quality, ranked by performance.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["earners", "callouts", "trending"] as TabKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg border-2 px-3 py-1.5 text-xs font-black transition-colors ${
              tab === key ? "border-ink bg-opYellow text-ink" : "border-ink/30 bg-[var(--panel-cream)] text-ink hover:border-ink"
            }`}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {rangesFor(tab).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-lg border-2 px-2.5 py-1 text-[11px] font-black ${
                range === r ? "border-opGreen bg-opGreen/15 text-opGreen" : "border-ink/30 text-[var(--text-muted)]"
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="op-panel overflow-hidden p-0">
        {loading && <div className="px-4 py-3 text-xs text-[var(--text-muted)]">Loading leaderboard...</div>}
        {error && <div className="px-4 py-3 text-xs text-opRed">{error}</div>}
        {!loading && rows.length === 0 && !error && (
          <div className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">No leaderboard data yet.</div>
        )}

        {!loading && rows.length > 0 && (
          <div className="divide-y-2 divide-ink/10">
            {rows.map((row) => (
              <button
                key={`${tab}-${row.walletAddress}-${row.rank}`}
                onClick={() => void openProfile(row.walletAddress)}
                className="w-full px-4 py-3 text-left transition-colors hover:bg-opYellow/25"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 text-center text-sm font-black text-ink">#{row.rank}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-ink">{row.displayName}</p>
                    <p className="truncate font-mono text-[10px] text-[var(--text-muted)]">{row.walletAddress}</p>
                  </div>
                  <div className="text-right">
                    {tab === "earners" && (
                      <>
                        <p className="text-xs font-black text-ink">{formatSats(row.realizedPnlSats)}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">Win {formatPct(row.winRate)}</p>
                      </>
                    )}
                    {tab === "callouts" && (
                      <>
                        <p className="text-xs font-black text-ink">Best {row.calloutBestMultiple?.toFixed(2) ?? "-"}x</p>
                        <p className="text-[10px] text-[var(--text-muted)]">Avg {row.calloutAvgMultiple?.toFixed(2) ?? "-"}x</p>
                      </>
                    )}
                    {tab === "trending" && (
                      <>
                        <p className="text-xs font-black text-ink">Hot {row.hotScore?.toFixed(1) ?? "-"}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{formatSats(row.realizedPnlSats)}</p>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {(selectedPlayer || drawerLoading) && (
        <div className="op-panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-ink">Player Profile</h2>
            <button
              className="text-xs font-black text-[var(--text-muted)] hover:text-ink"
              onClick={() => setSelectedPlayer(null)}
            >
              Close
            </button>
          </div>

          {drawerLoading && <p className="mt-3 text-xs text-[var(--text-muted)]">Loading profile...</p>}

          {!drawerLoading && selectedPlayer && (
            <div className="mt-3 space-y-3 text-xs">
              <p><span className="font-black">Wallet:</span> {String(selectedPlayer.walletAddress ?? "-")}</p>
              <p><span className="font-black">Title:</span> {String(selectedPlayer.title ?? "Rookie")}</p>
              <p><span className="font-black">Level:</span> {String(selectedPlayer.level ?? 1)}</p>
              <p><span className="font-black">Trust:</span> {String(selectedPlayer.trustScore ?? 50)}</p>
              <p><span className="font-black">Followers:</span> {"error" in selectedPlayer ? 0 : selectedPlayer.followerCount}</p>
              <p><span className="font-black">Following:</span> {"error" in selectedPlayer ? 0 : selectedPlayer.followingCount}</p>
              <p><span className="font-black">Badges:</span> {Array.isArray(selectedPlayer.badges) ? selectedPlayer.badges.length : 0}</p>

              {!("error" in selectedPlayer) && !selectedPlayer.viewerIsSelf && wallet && (
                <button
                  onClick={() => void toggleFollow()}
                  disabled={followBusy}
                  className={`rounded-lg border-2 px-3 py-2 text-xs font-black transition ${
                    selectedPlayer.viewerIsFollowing
                      ? "border-ink bg-[var(--panel-cream)] text-ink"
                      : "border-ink bg-opYellow text-ink"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {followBusy ? "Working..." : selectedPlayer.viewerIsFollowing ? "Unfollow" : "Follow"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
