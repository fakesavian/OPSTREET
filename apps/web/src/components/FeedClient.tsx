"use client";

import { useState, useCallback } from "react";
import type { ProjectDTO } from "@opfun/shared";
import { pledgeProject } from "@/lib/api";
import { useWallet } from "./WalletProvider";

// ─── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Simulated mcap from pledge count (purely educational) */
function simMcap(pledges: number): string {
  const sats = (100 + (pledges * pledges) / 10) * 1000;
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M`;
  if (sats >= 1_000) return `${Math.round(sats / 1_000)}K`;
  return `${Math.round(sats)}`;
}

/** Deterministic avatar color from ticker string */
function tickerColor(ticker: string): string {
  const palette = ["#f97316", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#eab308"];
  let h = 0;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) % palette.length;
  return palette[h]!;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "draft",
  CHECKING: "checking",
  READY: "ready",
  LAUNCHED: "live",
  FLAGGED: "flagged",
  GRADUATED: "graduated",
  DEPLOY_PACKAGE_READY: "pkg ready",
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT: "text-zinc-500",
  CHECKING: "text-yellow-400",
  READY: "text-blue-400",
  LAUNCHED: "text-green-400",
  FLAGGED: "text-red-400",
  GRADUATED: "text-purple-400",
  DEPLOY_PACKAGE_READY: "text-brand-400",
};

const FILTERS = ["all", "live", "ready", "flagged", "graduated"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_STATUS: Record<Filter, string | null> = {
  all: null,
  live: "LAUNCHED",
  ready: "READY",
  flagged: "FLAGGED",
  graduated: "GRADUATED",
};

// ─── main component ────────────────────────────────────────────────────────────

export function FeedClient({ initialProjects }: { initialProjects: ProjectDTO[] }) {
  const { wallet } = useWallet();
  const [projects, setProjects] = useState(initialProjects);
  const [sort, setSort] = useState<"new" | "trending">("new");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [pledging, setPledging] = useState<Record<string, boolean>>({});

  const sorted = [...projects].sort((a, b) =>
    sort === "trending"
      ? b.pledgeCount - a.pledgeCount
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const filterStatus = FILTER_STATUS[filter];
  const afterFilter = filterStatus ? sorted.filter((p) => p.status === filterStatus) : sorted;
  const q = search.trim().toLowerCase();
  const visible = q
    ? afterFilter.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.ticker.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      )
    : afterFilter;

  // King of the Hill: top trending launched/ready project
  const koth =
    sort === "trending" || filter === "all"
      ? sorted.find((p) => p.status === "LAUNCHED" || p.status === "READY" || p.status === "GRADUATED")
      : null;

  const handlePledge = useCallback(
    async (e: React.MouseEvent, projectId: string) => {
      e.preventDefault();
      if (pledging[projectId]) return;
      setPledging((prev) => ({ ...prev, [projectId]: true }));
      try {
        const result = await pledgeProject(projectId, { walletAddress: wallet?.address });
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? { ...p, pledgeCount: result.pledgeCount, status: result.status as ProjectDTO["status"] }
              : p,
          ),
        );
      } catch { /* silent */ }
      finally {
        setPledging((prev) => ({ ...prev, [projectId]: false }));
      }
    },
    [pledging, wallet?.address],
  );

  return (
    <section id="feed" className="space-y-5">
      {/* King of the Hill */}
      {koth && filter === "all" && (
        <KothCard project={koth} onPledge={handlePledge} pledging={!!pledging[koth.id]} />
      )}

      {/* T2: Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">
          🔍
        </span>
        <input
          type="search"
          className="input pl-9 text-sm"
          placeholder="Search by name, ticker, or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Filters */}
        <div className="flex items-center gap-0.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                filter === f
                  ? "bg-zinc-700 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <div className="flex items-center gap-0.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
            {(["new", "trending"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  sort === s ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {s === "trending" ? "🔥 Trending" : "✦ New"}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-0.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
            <button
              onClick={() => setView("grid")}
              className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                view === "grid" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Grid view"
            >
              ⊞
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                view === "list" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="List view"
            >
              ≡
            </button>
          </div>

          <span className="text-[11px] text-zinc-600 tabular-nums">{visible.length} tokens</span>
        </div>
      </div>

      {/* Feed */}
      {visible.length === 0 ? (
        <div className="card text-center py-16">
          {q ? (
            <p className="text-zinc-500 mb-4">No results for &ldquo;{search}&rdquo;.</p>
          ) : (
            <p className="text-zinc-500 mb-4">No tokens here yet.</p>
          )}
          {!q && <a href="/create" className="btn-primary">Be the first to launch →</a>}
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <GridCard key={p.id} project={p} onPledge={handlePledge} pledging={!!pledging[p.id]} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-zinc-800/60 rounded-xl border border-zinc-800/80 overflow-hidden">
          {/* List header */}
          <div className="grid grid-cols-[1fr_80px_64px_64px_48px] gap-2 items-center px-3 py-2 bg-zinc-900/80 text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">
            <span>Token</span>
            <span className="text-right">Sim MCap</span>
            <span className="text-right">Pledges</span>
            <span className="text-right">Age</span>
            <span />
          </div>
          {visible.map((p) => (
            <ListRow key={p.id} project={p} onPledge={handlePledge} pledging={!!pledging[p.id]} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── King of the Hill card ─────────────────────────────────────────────────────

function KothCard({
  project,
  onPledge,
  pledging,
}: {
  project: ProjectDTO;
  onPledge: (e: React.MouseEvent, id: string) => void;
  pledging: boolean;
}) {
  const color = tickerColor(project.ticker);
  const gradProgress = Math.min((project.pledgeCount / 100) * 100, 100);

  return (
    <a
      href={`/p/${project.slug}`}
      className="group block relative overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 transition-all hover:border-zinc-600"
    >
      {/* Ambient color behind the image */}
      <div
        className="absolute inset-0 opacity-10 blur-3xl"
        style={{ background: color }}
      />

      <div className="relative flex gap-4 p-4">
        {/* Image / avatar */}
        <div className="shrink-0">
          {project.iconUrl ? (
            <img
              src={project.iconUrl}
              alt={project.name}
              className="h-20 w-20 rounded-xl object-cover border border-zinc-700"
            />
          ) : (
            <div
              className="h-20 w-20 rounded-xl flex items-center justify-center text-3xl font-black text-white/90 border border-zinc-700"
              style={{ background: `${color}22`, borderColor: `${color}44` }}
            >
              {project.ticker.slice(0, 2)}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black tracking-widest text-yellow-400 uppercase">
                  👑 King of the Hill
                </span>
                {project.status === "GRADUATED" && (
                  <span className="text-[10px] font-black text-purple-400 uppercase">• Graduated</span>
                )}
              </div>
              <h3 className="text-xl font-black text-white group-hover:text-brand-400 transition-colors leading-tight">
                {project.name}{" "}
                <span className="font-mono text-sm font-semibold text-zinc-500">{project.ticker}</span>
              </h3>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Sim MCap</p>
              <p className="text-lg font-black text-white">{simMcap(project.pledgeCount)}</p>
              <p className="text-[10px] text-zinc-600">sats</p>
            </div>
          </div>

          <p className="text-sm text-zinc-400 line-clamp-1 mb-2">{project.description}</p>

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs text-zinc-500 mb-2">
            <span className="text-green-400 font-semibold">🔥 {project.pledgeCount} pledges</span>
            {project.viewCount > 0 && <span>{project.viewCount} views</span>}
            {project.riskScore !== null && (
              <span className={project.riskScore >= 50 ? "text-red-400" : "text-green-400"}>
                Risk: {project.riskScore}
              </span>
            )}
            <span>{timeAgo(project.createdAt)}</span>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-700"
                style={{ width: `${gradProgress}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-zinc-600 shrink-0">
              {project.pledgeCount}/100 to grad
            </span>
            <button
              onClick={(e) => onPledge(e, project.id)}
              disabled={pledging || project.status === "GRADUATED"}
              className="rounded-lg bg-brand-500/10 border border-brand-700/50 px-3 py-1 text-xs font-bold text-brand-400 hover:bg-brand-500/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-default shrink-0"
            >
              {pledging ? "…" : "Pledge"}
            </button>
          </div>
        </div>
      </div>
    </a>
  );
}

// ─── Grid card ─────────────────────────────────────────────────────────────────

function GridCard({
  project,
  onPledge,
  pledging,
}: {
  project: ProjectDTO;
  onPledge: (e: React.MouseEvent, id: string) => void;
  pledging: boolean;
}) {
  const color = tickerColor(project.ticker);
  const isGraduated = project.status === "GRADUATED";
  const isHot = project.pledgeCount >= 10 && !isGraduated;
  const gradProgress = Math.min((project.pledgeCount / 100) * 100, 100);
  const statusColor = STATUS_COLOR[project.status] ?? "text-zinc-500";

  return (
    <a href={`/p/${project.slug}`} className="token-card group relative flex flex-col overflow-hidden">
      {/* Hot / Graduated badge */}
      {(isHot || isGraduated) && (
        <span
          className={`absolute top-2 right-2 z-10 rounded-full px-1.5 py-0.5 text-[9px] font-black tracking-wide text-white shadow ${
            isGraduated ? "bg-purple-600" : "bg-orange-500"
          }`}
        >
          {isGraduated ? "GRAD" : "HOT"}
        </span>
      )}

      {/* Top: image + title row */}
      <div className="flex gap-3 p-3">
        {/* Avatar */}
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
              className="h-14 w-14 rounded-xl flex items-center justify-center text-lg font-black text-white/80"
              style={{ background: `${color}22`, border: `1px solid ${color}44` }}
            >
              {project.ticker.slice(0, 2)}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-sm text-white group-hover:text-brand-400 transition-colors truncate leading-tight">
              {project.name}
            </span>
            <span className="font-mono text-[10px] text-zinc-500 shrink-0">{project.ticker}</span>
          </div>
          <p className="text-xs text-zinc-500 line-clamp-2 mt-0.5 leading-relaxed">
            {project.description}
          </p>
        </div>
      </div>

      {/* Progress bar (for LAUNCHED / READY) */}
      {(project.status === "LAUNCHED" || project.status === "READY") && (
        <div className="mx-3 mb-2">
          <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                gradProgress >= 75
                  ? "bg-gradient-to-r from-orange-500 to-red-500"
                  : "bg-gradient-to-r from-brand-600 to-brand-400"
              }`}
              style={{ width: `${gradProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Bottom stats row */}
      <div className="flex items-center justify-between px-3 pb-3 mt-auto">
        <div className="flex items-center gap-3 text-[11px]">
          {/* Sim mcap */}
          <span className="text-white font-semibold">{simMcap(project.pledgeCount)} sats</span>
          {/* Status */}
          <span className={`font-medium ${statusColor}`}>
            {project.status === "FLAGGED" ? "⚠ " : ""}
            {STATUS_LABEL[project.status] ?? project.status}
          </span>
          {/* Age */}
          <span className="text-zinc-600">{timeAgo(project.createdAt)}</span>
        </div>

        {/* Pledge button */}
        <button
          onClick={(e) => onPledge(e, project.id)}
          disabled={pledging || isGraduated}
          className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-all ${
            isGraduated
              ? "text-purple-500 cursor-default"
              : "text-orange-400 hover:bg-orange-950/50 active:scale-95"
          }`}
        >
          {pledging ? (
            <span className="animate-pulse">…</span>
          ) : (
            <>
              <span>{isGraduated ? "★" : "🔥"}</span>
              <span className="tabular-nums">{project.pledgeCount}</span>
            </>
          )}
        </button>
      </div>
    </a>
  );
}

// ─── List row (Trenches-style) ─────────────────────────────────────────────────

function ListRow({
  project,
  onPledge,
  pledging,
}: {
  project: ProjectDTO;
  onPledge: (e: React.MouseEvent, id: string) => void;
  pledging: boolean;
}) {
  const color = tickerColor(project.ticker);
  const isGraduated = project.status === "GRADUATED";
  const statusColor = STATUS_COLOR[project.status] ?? "text-zinc-500";

  return (
    <a
      href={`/p/${project.slug}`}
      className="grid grid-cols-[1fr_80px_64px_64px_48px] gap-2 items-center px-3 py-2.5
        bg-zinc-900/40 hover:bg-zinc-800/60 transition-colors group"
    >
      {/* Token info */}
      <div className="flex items-center gap-2.5 min-w-0">
        {project.iconUrl ? (
          <img
            src={project.iconUrl}
            alt=""
            className="h-8 w-8 rounded-lg object-cover shrink-0"
            style={{ border: `1px solid ${color}44` }}
          />
        ) : (
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white/70 shrink-0"
            style={{ background: `${color}22`, border: `1px solid ${color}44` }}
          >
            {project.ticker.slice(0, 2)}
          </div>
        )}
        <div className="min-w-0">
          <span className="text-sm font-semibold text-white group-hover:text-brand-400 transition-colors truncate block leading-tight">
            {project.name}{" "}
            <span className="font-mono text-[10px] text-zinc-500">{project.ticker}</span>
          </span>
          <span className={`text-[10px] font-medium ${statusColor}`}>
            {STATUS_LABEL[project.status] ?? project.status}
          </span>
        </div>
      </div>

      {/* Sim mcap */}
      <div className="text-right">
        <span className="text-xs font-semibold text-zinc-300 tabular-nums">
          {simMcap(project.pledgeCount)}
        </span>
        <span className="text-[9px] text-zinc-600 ml-0.5">sats</span>
      </div>

      {/* Pledges */}
      <div className="text-right text-xs text-green-400 font-semibold tabular-nums">
        {project.pledgeCount}
      </div>

      {/* Age */}
      <div className="text-right text-[11px] text-zinc-600">
        {timeAgo(project.createdAt)}
      </div>

      {/* Pledge button */}
      <div className="flex justify-end">
        <button
          onClick={(e) => onPledge(e, project.id)}
          disabled={pledging || isGraduated}
          className={`rounded-lg px-2 py-1 text-[10px] font-bold transition-all ${
            isGraduated
              ? "text-purple-500 cursor-default"
              : "text-orange-400 hover:bg-orange-950/50 active:scale-95"
          }`}
        >
          {pledging ? "…" : isGraduated ? "★" : "🔥"}
        </button>
      </div>
    </a>
  );
}
