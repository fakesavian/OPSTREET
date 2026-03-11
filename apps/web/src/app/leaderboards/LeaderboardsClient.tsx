"use client";

import { useEffect, useState } from "react";
import type { LeaderboardRow } from "@/lib/api";
import { fetchLeaderboard, fetchPlayerProfile } from "@/lib/api";

type TabKey = "earners" | "callouts" | "trending";

interface LeaderboardPayload {
  range: string;
  items: LeaderboardRow[];
}

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

export function LeaderboardsClient({ initial }: { initial: LeaderboardPayload }) {
  const [tab, setTab] = useState<TabKey>("earners");
  const [range, setRange] = useState<string>(initial.range);
  const [data, setData] = useState<LeaderboardPayload>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Record<string, unknown> | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

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

  const rows = data.items;

  return (
    <div className="space-y-4 pb-20 sm:pb-0">
      <div className="op-panel p-4">
        <h1 className="text-2xl font-black text-ink">Player Leaderboards</h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">Confirmed live trading metrics and graded signal quality, ranked by performance.</p>
      </div>

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

      <div className="op-panel p-0 overflow-hidden">
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
                className="w-full text-left px-4 py-3 hover:bg-opYellow/25 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 text-center text-sm font-black text-ink">#{row.rank}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-ink truncate">{row.displayName}</p>
                    <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">{row.walletAddress}</p>
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
            <div className="mt-3 space-y-2 text-xs">
              <p><span className="font-black">Wallet:</span> {String(selectedPlayer.walletAddress ?? "-")}</p>
              <p><span className="font-black">Title:</span> {String(selectedPlayer.title ?? "Rookie")}</p>
              <p><span className="font-black">Level:</span> {String(selectedPlayer.level ?? 1)}</p>
              <p><span className="font-black">Trust:</span> {String(selectedPlayer.trustScore ?? 50)}</p>
              <p><span className="font-black">Badges:</span> {Array.isArray(selectedPlayer.badges) ? selectedPlayer.badges.length : 0}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
