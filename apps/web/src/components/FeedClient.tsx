"use client";

import { useState } from "react";
import type { ProjectDTO } from "@opfun/shared";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function tickerColor(ticker: string): string {
  const palette = ["#f97316", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#eab308"];
  let hash = 0;
  for (const char of ticker) hash = (hash * 31 + char.charCodeAt(0)) % palette.length;
  return palette[hash]!;
}

function isLiveProject(project: ProjectDTO): boolean {
  return project.launchStatus === "LIVE" || project.status === "LAUNCHED";
}

function isLaunchReady(project: ProjectDTO): boolean {
  return project.status === "READY" || project.status === "DEPLOY_PACKAGE_READY";
}

function launchLabel(project: ProjectDTO): string {
  if (project.launchStatus === "LIVE") return "pool live";
  if (project.launchStatus) return project.launchStatus.toLowerCase().replace(/_/g, " ");
  if (isLaunchReady(project)) return "ready";
  return project.status.toLowerCase().replace(/_/g, " ");
}

function launchTone(project: ProjectDTO): string {
  if (project.launchStatus === "LIVE") return "text-emerald-400";
  if (project.launchStatus) return "text-sky-400";
  if (project.status === "FLAGGED") return "text-red-400";
  if (isLaunchReady(project)) return "text-amber-300";
  return "text-zinc-500";
}

function sortProjects(projects: ProjectDTO[], sort: "new" | "live"): ProjectDTO[] {
  const ranked = [...projects];
  ranked.sort((a, b) => {
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
  return ranked;
}

const FILTERS = ["all", "live", "launching", "ready", "flagged"] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(project: ProjectDTO, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "live") return isLiveProject(project);
  if (filter === "launching") return Boolean(project.launchStatus) && project.launchStatus !== "LIVE";
  if (filter === "ready") return isLaunchReady(project);
  return project.status === "FLAGGED";
}

export function FeedClient({ initialProjects }: { initialProjects: ProjectDTO[] }) {
  const [sort, setSort] = useState<"new" | "live">("live");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");

  const sorted = sortProjects(initialProjects, sort);
  const filtered = sorted.filter((project) => matchesFilter(project, filter));
  const query = search.trim().toLowerCase();
  const visible = query
    ? filtered.filter((project) =>
        [project.name, project.ticker, project.description].some((value) =>
          value.toLowerCase().includes(query),
        ),
      )
    : filtered;

  const spotlight = sorted.find(isLiveProject) ?? sorted.find(isLaunchReady) ?? sorted[0] ?? null;

  return (
    <section id="feed" className="space-y-5">
      {spotlight ? <SpotlightCard project={spotlight} /> : null}

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
          Search
        </span>
        <input
          type="search"
          className="input pl-16 text-sm"
          placeholder="Name, ticker, or description"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
          {FILTERS.map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                filter === item ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
            {(["live", "new"] as const).map((item) => (
              <button
                key={item}
                onClick={() => setSort(item)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  sort === item ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {item === "live" ? "Live first" : "Newest"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
            <button
              onClick={() => setView("grid")}
              className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                view === "grid" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Grid view"
            >
              Grid
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                view === "list" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="List view"
            >
              List
            </button>
          </div>

          <span className="text-[11px] text-zinc-600 tabular-nums">{visible.length} projects</span>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card py-16 text-center">
          {query ? (
            <p className="mb-4 text-zinc-500">No results for &quot;{search}&quot;.</p>
          ) : (
            <p className="mb-4 text-zinc-500">No projects match this view yet.</p>
          )}
          {!query ? (
            <a href="/create" className="btn-primary">
              Create a project
            </a>
          ) : null}
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <GridCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800/80">
          <div className="grid grid-cols-[1fr_120px_72px] items-center gap-2 bg-zinc-900/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
            <span>Project</span>
            <span className="text-right">Launch</span>
            <span className="text-right">Age</span>
          </div>
          <div className="flex flex-col divide-y divide-zinc-800/60">
            {visible.map((project) => (
              <ListRow key={project.id} project={project} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SpotlightCard({ project }: { project: ProjectDTO }) {
  const color = tickerColor(project.ticker);

  return (
    <a
      href={`/p/${project.slug}`}
      className="group relative block overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 transition-all hover:border-zinc-600"
    >
      <div className="absolute inset-0 opacity-10 blur-3xl" style={{ background: color }} />

      <div className="relative flex gap-4 p-4">
        <div className="shrink-0">
          {project.iconUrl ? (
            <img
              src={project.iconUrl}
              alt={project.name}
              className="h-20 w-20 rounded-xl border border-zinc-700 object-cover"
            />
          ) : (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-xl border border-zinc-700 text-3xl font-black text-white/90"
              style={{ background: `${color}22`, borderColor: `${color}44` }}
            >
              {project.ticker.slice(0, 2)}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-yellow-400">
                  {isLiveProject(project) ? "Live spotlight" : "Launch spotlight"}
                </span>
              </div>
              <h3 className="leading-tight text-xl font-black text-white transition-colors group-hover:text-brand-400">
                {project.name}{" "}
                <span className="font-mono text-sm font-semibold text-zinc-500">{project.ticker}</span>
              </h3>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600">Launch</p>
              <p className={`text-sm font-black ${launchTone(project)}`}>{launchLabel(project)}</p>
            </div>
          </div>

          <p className="mb-2 line-clamp-2 text-sm text-zinc-400">{project.description}</p>

          <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
            <span>{project.viewCount} views</span>
            <span>{timeAgo(project.createdAt)}</span>
            <span className={project.riskScore !== null && project.riskScore >= 50 ? "text-red-400" : "text-emerald-400"}>
              Risk: {project.riskScore ?? "pending"}
            </span>
            {project.liveAt ? <span>Live since {timeAgo(project.liveAt)}</span> : null}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-300">
            {isLiveProject(project)
              ? "Confirmed pool data drives quotes, charts, and fills."
              : "Trading stays disabled until deployment and pool creation are confirmed on OP_NET testnet."}
          </div>
        </div>
      </div>
    </a>
  );
}

function GridCard({ project }: { project: ProjectDTO }) {
  const color = tickerColor(project.ticker);

  return (
    <a href={`/p/${project.slug}`} className="token-card group relative flex flex-col overflow-hidden">
      <div className="flex gap-3 p-3">
        <div className="shrink-0">
          {project.iconUrl ? (
            <img
              src={project.iconUrl}
              alt=""
              className="h-14 w-14 rounded-xl object-cover"
              style={{ border: `1px solid ${color}44` }}
            />
          ) : (
            <div
              className="flex h-14 w-14 items-center justify-center rounded-xl text-lg font-black text-white/80"
              style={{ background: `${color}22`, border: `1px solid ${color}44` }}
            >
              {project.ticker.slice(0, 2)}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-bold leading-tight text-white transition-colors group-hover:text-brand-400">
              {project.name}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-zinc-500">{project.ticker}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">{project.description}</p>
        </div>
      </div>

      <div className="mx-3 mb-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-300">
        <div className="flex items-center justify-between gap-2">
          <span>Launch</span>
          <span className={`font-semibold ${launchTone(project)}`}>{launchLabel(project)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-zinc-500">
          <span>Views {project.viewCount}</span>
          <span>Risk {project.riskScore ?? "pending"}</span>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between px-3 pb-3 text-[11px]">
        <span className={launchTone(project)}>{launchLabel(project)}</span>
        <span className="text-zinc-600">{timeAgo(project.createdAt)}</span>
      </div>
    </a>
  );
}

function ListRow({ project }: { project: ProjectDTO }) {
  const color = tickerColor(project.ticker);

  return (
    <a
      href={`/p/${project.slug}`}
      className="grid grid-cols-[1fr_120px_72px] items-center gap-2 bg-zinc-900/40 px-3 py-2.5 transition-colors hover:bg-zinc-800/60 group"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {project.iconUrl ? (
          <img
            src={project.iconUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-lg object-cover"
            style={{ border: `1px solid ${color}44` }}
          />
        ) : (
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-black text-white/70"
            style={{ background: `${color}22`, border: `1px solid ${color}44` }}
          >
            {project.ticker.slice(0, 2)}
          </div>
        )}
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight text-white transition-colors group-hover:text-brand-400">
            {project.name}{" "}
            <span className="font-mono text-[10px] text-zinc-500">{project.ticker}</span>
          </span>
          <span className={`text-[10px] font-medium ${launchTone(project)}`}>{launchLabel(project)}</span>
        </div>
      </div>

      <div className="text-right text-xs font-semibold">
        <span className={launchTone(project)}>{launchLabel(project)}</span>
      </div>

      <div className="text-right text-[11px] text-zinc-600">{timeAgo(project.createdAt)}</div>
    </a>
  );
}
