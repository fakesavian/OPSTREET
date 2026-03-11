"use client";

import { useState } from "react";
import type { ProjectDTO } from "@opfun/shared";
import { TokenCard } from "./opfun/TokenCard";
import { OpTickerStrip } from "./opfun/OpTickerStrip";

const FILTERS = [
  { label: "All", value: null },
  { label: "Live", value: "LIVE" },
  { label: "Ready", value: "READY" },
  { label: "Launching", value: "LAUNCHING" },
  { label: "Flagged", value: "FLAGGED" },
] as const;

function isLiveProject(project: ProjectDTO): boolean {
  return project.launchStatus === "LIVE" || project.status === "LAUNCHED";
}

function isReadyProject(project: ProjectDTO): boolean {
  return project.status === "READY" || project.status === "DEPLOY_PACKAGE_READY";
}

function isLaunchingProject(project: ProjectDTO): boolean {
  return Boolean(project.launchStatus) && project.launchStatus !== "LIVE";
}

function sortProjects(projects: ProjectDTO[], sort: "new" | "live"): ProjectDTO[] {
  return [...projects].sort((a, b) => {
    if (sort === "live") {
      const liveRank = Number(isLiveProject(b)) - Number(isLiveProject(a));
      if (liveRank !== 0) return liveRank;
      const launchRank = Number(Boolean(b.launchStatus)) - Number(Boolean(a.launchStatus));
      if (launchRank !== 0) return launchRank;
      const views = b.viewCount - a.viewCount;
      if (views !== 0) return views;
    }
    const liveAt = new Date(b.liveAt ?? 0).getTime() - new Date(a.liveAt ?? 0).getTime();
    if (liveAt !== 0) return liveAt;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function matchesFilter(project: ProjectDTO, filter: string | null): boolean {
  if (filter === null) return true;
  if (filter === "LIVE") return isLiveProject(project);
  if (filter === "READY") return isReadyProject(project);
  if (filter === "LAUNCHING") return isLaunchingProject(project);
  return project.status === filter;
}

export function NeoFeedClient({ initialProjects }: { initialProjects: ProjectDTO[] }) {
  const [sort, setSort] = useState<"new" | "live">("live");
  const [filterVal, setFilterVal] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const sorted = sortProjects(initialProjects, sort);
  const afterFilter = sorted.filter((project) => matchesFilter(project, filterVal));
  const query = search.trim().toLowerCase();
  const visible = query
    ? afterFilter.filter(
        (project) =>
          project.name.toLowerCase().includes(query) ||
          project.ticker.toLowerCase().includes(query) ||
          project.description.toLowerCase().includes(query),
      )
    : afterFilter;

  return (
    <section id="feed" className="space-y-4">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">
          Search
        </span>
        <input
          type="search"
          className="input pl-16"
          placeholder="Name, ticker, or description"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <OpTickerStrip
          items={FILTERS.map((filter) => ({ label: filter.label, active: filterVal === filter.value }))}
          onSelect={(label) => {
            const match = FILTERS.find((filter) => filter.label === label);
            setFilterVal(match?.value ?? null);
          }}
        />

        <div className="flex gap-1">
          {(["live", "new"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setSort(item)}
              className={`op-pill ${sort === item ? "op-pill-active" : ""} capitalize`}
            >
              {item === "live" ? "Live first" : "Newest"}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="op-panel p-12 text-center">
          <p className="mb-4 text-[var(--text-muted)]">No projects match this view yet.</p>
          <a href="/create" className="op-btn-primary">
            Create a project
          </a>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <TokenCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </section>
  );
}
