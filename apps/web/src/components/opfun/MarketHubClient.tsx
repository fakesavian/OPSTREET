"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ProjectDTO } from "@opfun/shared";
import { fetchProjects } from "@/lib/api";
import { LeaderboardsClient } from "@/app/leaderboards/LeaderboardsClient";
import { TokenCard } from "./TokenCard";
import { OpPanel } from "./OpPanel";
import { OpPill } from "./OpPill";

const SORT_FILTERS = ["Live Now", "Newest", "Most Viewed", "Ready", "Launching"] as const;
type SortFilter = (typeof SORT_FILTERS)[number];
type MarketHubSection = "trending" | "leaders";

function isLive(project: ProjectDTO): boolean {
  return project.launchStatus === "LIVE" || project.status === "LAUNCHED";
}

function isReady(project: ProjectDTO): boolean {
  return project.status === "READY" || project.status === "DEPLOY_PACKAGE_READY";
}

function isLaunching(project: ProjectDTO): boolean {
  return Boolean(project.launchStatus) && project.launchStatus !== "LIVE";
}

function sortProjects(projects: ProjectDTO[], filter: SortFilter): ProjectDTO[] {
  switch (filter) {
    case "Live Now":
      return [...projects].sort((a, b) => {
        const liveRank = Number(isLive(b)) - Number(isLive(a));
        if (liveRank !== 0) return liveRank;
        return new Date(b.liveAt ?? 0).getTime() - new Date(a.liveAt ?? 0).getTime();
      });
    case "Most Viewed":
      return [...projects].sort((a, b) => b.viewCount - a.viewCount);
    case "Ready":
      return [...projects].sort((a, b) => {
        const readyRank = Number(isReady(b)) - Number(isReady(a));
        if (readyRank !== 0) return readyRank;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    case "Launching":
      return [...projects].sort((a, b) => {
        const launchRank = Number(isLaunching(b)) - Number(isLaunching(a));
        if (launchRank !== 0) return launchRank;
        return new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime();
      });
    case "Newest":
    default:
      return [...projects].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

function topRailProjects(projects: ProjectDTO[]): ProjectDTO[] {
  return [...projects]
    .sort((a, b) => {
      const liveRank = Number(isLive(b)) - Number(isLive(a));
      if (liveRank !== 0) return liveRank;
      const viewedRank = b.viewCount - a.viewCount;
      if (viewedRank !== 0) return viewedRank;
      return new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime();
    })
    .slice(0, 5);
}

function rightRailCopy(project: ProjectDTO): string {
  if (isLive(project)) return "Confirmed pool live";
  if (project.launchStatus) return project.launchStatus.replace(/_/g, " ");
  if (isReady(project)) return "Ready for wallet deploy";
  return "Awaiting build";
}

const FETCH_RETRIES = 3;
const FETCH_RETRY_MS = 1500;

export function MarketHubClient({
  initialProjects,
  initialSection = "trending",
}: {
  initialProjects: ProjectDTO[];
  initialSection?: MarketHubSection;
}) {
  const [activeFilter, setActiveFilter] = useState<SortFilter>("Live Now");
  const [projects, setProjects] = useState<ProjectDTO[]>(initialProjects);
  const [loading, setLoading] = useState(initialProjects.length === 0);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (initialProjects.length > 0) {
      setProjects(initialProjects);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      let lastErr = "";
      for (let i = 0; i <= FETCH_RETRIES; i++) {
        if (cancelled) return;
        if (i > 0) await new Promise((r) => setTimeout(r, FETCH_RETRY_MS));
        try {
          const payload = await fetchProjects("trending");
          if (!cancelled) { setProjects(payload.items); setLoading(false); }
          return;
        } catch (err) {
          lastErr = err instanceof Error ? err.message : "Failed to load projects.";
        }
      }
      if (!cancelled) { setError(lastErr); setLoading(false); }
    })();

    return () => { cancelled = true; };
  }, [initialProjects, retryKey]);

  const sortedProjects = useMemo(() => sortProjects(projects, activeFilter), [projects, activeFilter]);
  const featured = useMemo(() => topRailProjects(projects), [projects]);

  const trendingSection = (
    <section key="trending" className="space-y-4" id="trending">
      <div className="op-panel p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Market Board</p>
            <h1 className="mt-2 text-3xl font-black text-ink">Trending + Leaders</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-[var(--text-secondary)]">
              Live token discovery and player leaderboards now sit in one market hub.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="#trending" className="op-btn-outline text-xs">Tokens</Link>
            <Link href="#leaders" className="op-btn-primary text-xs">Leaders</Link>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SORT_FILTERS.map((filter) => (
          <OpPill
            key={filter}
            label={filter}
            active={activeFilter === filter}
            onClick={() => setActiveFilter(filter)}
          />
        ))}
      </div>

      {error && (
        <div className="rounded-xl border-2 border-[#EF4444] bg-[#FEE2E2] px-4 py-3 space-y-2">
          <p className="text-sm font-bold text-[#B91C1C]">{error}</p>
          {/failed to fetch|cannot reach|unreachable/i.test(error) && (
            <p className="text-xs text-[#B91C1C]/80">
              The backend API is not reachable. Make sure <code className="font-mono bg-[#B91C1C]/10 px-1 rounded">OPFUN_API_URL</code> is set in your Vercel project settings and your API server is running.
            </p>
          )}
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#B91C1C] bg-white px-3 py-1 text-xs font-black text-[#B91C1C] hover:bg-[#FEE2E2] transition-colors"
          >
            ↺ Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="op-panel p-12 text-center text-sm font-semibold text-[var(--text-muted)]">Loading market board...</div>
      ) : sortedProjects.length === 0 ? (
        <div className="op-panel p-12 text-center">
          <p className="text-[var(--text-muted)]">No projects yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="grid gap-4 sm:grid-cols-2">
            {sortedProjects.map((project) => (
              <TokenCard key={project.id} project={project} />
            ))}
          </div>

          <aside className="space-y-4">
            <OpPanel title="Most Watched">
              <div className="space-y-2">
                {featured.map((project, index) => (
                  <Link
                    key={project.id}
                    href={`/p/${project.slug}`}
                    className="flex items-center gap-2 rounded-lg border-2 border-transparent p-2 transition-all hover:border-ink hover:bg-opYellow"
                  >
                    <span className="w-5 text-center text-sm font-black text-ink">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-ink">{project.name}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{rightRailCopy(project)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </OpPanel>
          </aside>
        </div>
      )}
    </section>
  );

  const leadersSection = (
    <section key="leaders" id="leaders" className="space-y-4">
      <LeaderboardsClient initial={{ range: "7d", items: [] }} embedded />
    </section>
  );

  const sections = initialSection === "leaders"
    ? [leadersSection, trendingSection]
    : [trendingSection, leadersSection];

  return <div className="space-y-6 pb-20 sm:pb-0">{sections}</div>;
}
