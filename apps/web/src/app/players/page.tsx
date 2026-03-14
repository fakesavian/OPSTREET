"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectDTO } from "@opfun/shared";
import { useWallet } from "@/components/WalletProvider";
import {
  fetchPlayerProfile,
  fetchPlayerSearch,
  fetchProjects,
  followPlayer,
  unfollowPlayer,
  type PlayerProfile,
  type PlayerSearchResult,
} from "@/lib/api";

export default function PlayersPage() {
  const { wallet } = useWallet();
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [popularPlayers, setPopularPlayers] = useState<PlayerSearchResult[]>([]);
  const [popularTokens, setPopularTokens] = useState<ProjectDTO[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [searchLabel, setSearchLabel] = useState("Most searched players");
  const [error, setError] = useState("");
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchPlayerSearch("", 8), fetchProjects("trending")])
      .then(([players, projects]) => {
        if (cancelled) return;
        setPopularPlayers(players);
        setResults(players);
        setPopularTokens(
          [...projects.items]
            .sort((a, b) => b.viewCount - a.viewCount)
            .slice(0, 8),
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load search discovery.");
      })
      .finally(() => {
        if (!cancelled) setDiscoveryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function runSearch(): Promise<void> {
    setSearchLoading(true);
    setError("");
    try {
      const trimmed = query.trim();
      const nextResults = await fetchPlayerSearch(trimmed, 12);
      setResults(nextResults);
      setSearchLabel(trimmed ? `Search results for "${trimmed}"` : "Most searched players");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to search players.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function loadProfile(target: string): Promise<void> {
    if (!target) {
      setError("Choose a player to inspect.");
      return;
    }

    setProfileLoading(true);
    setError("");
    try {
      const data = await fetchPlayerProfile(target);
      setProfile(data);
    } catch (e) {
      setProfile(null);
      setError(e instanceof Error ? e.message : "Failed to load player profile.");
    } finally {
      setProfileLoading(false);
    }
  }

  async function toggleFollow(): Promise<void> {
    if (!profile || profile.viewerIsSelf) return;

    setFollowBusy(true);
    setError("");
    try {
      const counts = profile.viewerIsFollowing
        ? await unfollowPlayer(profile.walletAddress)
        : await followPlayer(profile.walletAddress);

      setProfile((current) =>
        current
          ? {
              ...current,
              followerCount: counts.followerCount,
              viewerIsFollowing: !current.viewerIsFollowing,
            }
          : current,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update follow state.");
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24 sm:pb-10">
      <div className="op-panel p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-ink bg-opYellow text-ink">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl font-black text-ink">Search</h1>
              <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
                Find players, inspect their public profile, and check the most searched tokens.
              </p>
            </div>
          </div>
          <div className="text-xs font-semibold text-[var(--text-muted)]">
            {wallet?.address ? `Connected as ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}` : "Search is public. Follow requires wallet auth."}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
              placeholder="Search display name or wallet"
              className="input pl-12"
            />
          </div>
          <button
            onClick={() => void runSearch()}
            disabled={searchLoading}
            className="op-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {searchLoading ? "Searching..." : "Search"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-[#EF4444] bg-[#FEE2E2] px-4 py-3 text-sm font-bold text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="op-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-ink">{searchLabel}</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Tap a player card to inspect the full profile below.</p>
            </div>
            <span className="rounded-full border-2 border-ink bg-[var(--cream)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-ink">
              {results.length} players
            </span>
          </div>

          {discoveryLoading ? (
            <p className="mt-4 text-sm text-[var(--text-muted)]">Loading search board...</p>
          ) : results.length === 0 ? (
            <div className="mt-4 rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-5 text-sm font-semibold text-[var(--text-muted)]">
              No players matched that search.
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {results.map((player) => (
                <button
                  key={player.walletAddress}
                  onClick={() => void loadProfile(player.walletAddress)}
                  className="rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-4 text-left transition hover:-translate-y-[2px] hover:bg-[#fff3c4]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-black text-ink">{player.displayName}</p>
                      <p className="truncate font-mono text-[10px] text-[var(--text-muted)]">{player.walletAddress}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        <span>LVL {player.level}</span>
                        <span>Trust {player.trustScore}</span>
                        <span>{player.badgesCount} badges</span>
                      </div>
                    </div>
                    <div className="text-right text-xs font-semibold text-[var(--text-secondary)]">
                      <p>Hot {player.hotScore?.toFixed(1) ?? "-"}</p>
                      <p>{player.totalTrades ?? 0} trades</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="op-panel p-6">
          <h2 className="text-xl font-black text-ink">Most Searched Tokens</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Fast access to the coins people are checking most right now.</p>
          {discoveryLoading ? (
            <p className="mt-4 text-sm text-[var(--text-muted)]">Loading token board...</p>
          ) : (
            <div className="mt-4 space-y-3">
              {popularTokens.map((token, index) => (
                <Link
                  key={token.id}
                  href={`/p/${token.slug}`}
                  className="flex items-center gap-3 rounded-[18px] border-[3px] border-ink bg-[var(--panel-cream)] p-4 transition hover:-translate-y-[2px] hover:bg-[#fff3c4]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink bg-opYellow text-sm font-black text-ink">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-ink">{token.name}</p>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">${token.ticker}</p>
                  </div>
                  <div className="text-right text-xs font-semibold text-[var(--text-secondary)]">
                    <p>{token.viewCount.toLocaleString()} views</p>
                    <p>{token.status.replace(/_/g, " ")}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-5 rounded-[18px] border-[3px] border-ink bg-[#fff3c4] p-4">
            <h3 className="text-sm font-black text-ink">Most Searched Players</h3>
            <div className="mt-3 grid gap-2">
              {popularPlayers.slice(0, 4).map((player) => (
                <button
                  key={`popular-${player.walletAddress}`}
                  onClick={() => void loadProfile(player.walletAddress)}
                  className="flex items-center justify-between rounded-xl border-2 border-ink bg-[var(--panel-cream)] px-3 py-2 text-left transition hover:bg-opYellow/30"
                >
                  <span className="truncate text-sm font-black text-ink">{player.displayName}</span>
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">Hot {player.hotScore?.toFixed(1) ?? "-"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {(profileLoading || profile) && (
        <>
          {profileLoading && (
            <div className="op-panel p-6">
              <p className="text-sm text-[var(--text-muted)]">Loading player profile...</p>
            </div>
          )}

          {profile && (
            <>
              <div className="op-panel p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">Player</p>
                    <h2 className="mt-2 text-3xl font-black text-ink">@{profile.displayName}</h2>
                    <p className="mt-1 break-all font-mono text-xs text-[var(--text-muted)]">{profile.walletAddress}</p>
                    <p className="mt-3 max-w-2xl text-sm text-[var(--text-secondary)]">
                      {profile.bio || "No bio set yet."}
                    </p>
                  </div>

                  {!profile.viewerIsSelf && (
                    <button
                      onClick={() => void toggleFollow()}
                      disabled={followBusy}
                      className={`rounded-[18px] border-[3px] px-5 py-3 text-sm font-black transition ${
                        profile.viewerIsFollowing
                          ? "border-ink bg-[var(--panel-cream)] text-ink"
                          : "border-ink bg-opYellow text-ink"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {followBusy ? "Working..." : profile.viewerIsFollowing ? "Unfollow" : "Follow"}
                    </button>
                  )}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-6">
                  <Stat label="Followers" value={String(profile.followerCount)} />
                  <Stat label="Following" value={String(profile.followingCount)} />
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
