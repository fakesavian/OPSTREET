"use client";

import { useState } from "react";
import type { ProjectDTO } from "@opfun/shared";
import { TokenCard } from "@/components/opfun/TokenCard";
import { OpPanel } from "@/components/opfun/OpPanel";
import { OpPill } from "@/components/opfun/OpPill";
import Link from "next/link";

const SORT_FILTERS = ["Live Now", "Newest", "Most Viewed", "Ready", "Launching"] as const;
type SortFilter = (typeof SORT_FILTERS)[number];

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
      const launchRank = Number(Boolean(b.launchStatus)) - Number(Boolean(a.launchStatus));
      if (launchRank !== 0) return launchRank;
      return b.viewCount - a.viewCount;
    })
    .slice(0, 5);
}

function rightRailCopy(project: ProjectDTO): string {
  if (isLive(project)) return "Confirmed pool live";
  if (project.launchStatus) return project.launchStatus.replace(/_/g, " ");
  if (isReady(project)) return "Ready for wallet deploy";
  return "Awaiting build";
}

export function TrendingClient({ initialProjects }: { initialProjects: ProjectDTO[] }) {
  const [activeFilter, setActiveFilter] = useState<SortFilter>("Live Now");
  const sorted = sortProjects(initialProjects, activeFilter);
  const featured = topRailProjects(initialProjects);

  return (
    <div className="pb-20 sm:pb-0">
      <div className="flex gap-6">
        <aside className="hidden w-52 shrink-0 flex-col gap-3 lg:flex">
          <div className="op-panel space-y-1 p-4">
            {[
              { href: "/", label: "Feed" },
              { href: "/trending", label: "Trending" },
              { href: "/leaderboards", label: "Leaders" },
              { href: "/floor", label: "Floor" },
              { href: "/docs", label: "Docs" },
              { href: "/create", label: "Create Coin" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="block rounded-lg border-2 border-transparent px-3 py-2 text-sm font-bold text-ink transition-all hover:border-ink hover:bg-opYellow"
              >
                {label}
              </Link>
            ))}
            <div className="pt-2">
              <Link href="/floor" className="op-btn-primary block w-full py-2 text-center text-xs">
                Open Floor
              </Link>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
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

          {sorted.length === 0 ? (
            <div className="op-panel p-12 text-center">
              <p className="text-[var(--text-muted)]">No projects yet.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {sorted.map((project) => (
                <TokenCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>

        <aside className="hidden w-64 shrink-0 xl:block">
          <OpPanel title="Live Watchlist">
            <div className="space-y-2">
              {featured.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">No live market data yet.</p>
              ) : (
                featured.map((project, index) => (
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
                ))
              )}
            </div>
          </OpPanel>
        </aside>
      </div>
    </div>
  );
}
