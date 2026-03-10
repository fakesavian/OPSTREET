"use client";

import Link from "next/link";
import type { ProjectDTO } from "@opfun/shared";

const PALETTE = ["#FFD84D", "#22C55E", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#F97316"];

function tickerBg(ticker: string): string {
  let hash = 0;
  for (const char of ticker) hash = (hash * 31 + char.charCodeAt(0)) % PALETTE.length;
  return PALETTE[hash]!;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function launchLabel(project: ProjectDTO): string {
  if (project.launchStatus === "LIVE") return "Pool live";
  if (project.launchStatus) return project.launchStatus.replace(/_/g, " ");
  if (project.status === "READY" || project.status === "DEPLOY_PACKAGE_READY") return "Ready";
  return project.status;
}

function launchTone(project: ProjectDTO): string {
  if (project.launchStatus === "LIVE") return "bg-opGreen text-white border-ink";
  if (project.launchStatus) return "bg-[#DBEAFE] text-ink border-ink";
  if (project.status === "FLAGGED") return "bg-opRed text-white border-ink";
  if (project.status === "READY" || project.status === "DEPLOY_PACKAGE_READY") return "bg-opYellow text-ink border-ink";
  return "bg-[#e5e7eb] text-ink border-ink";
}

export function LandingTokenCard({ project }: { project: ProjectDTO }) {
  const bg = tickerBg(project.ticker);
  const poolLive = project.launchStatus === "LIVE";

  return (
    <Link href={`/p/${project.slug}`} className="block group">
      <div className="op-panel overflow-hidden transition-all duration-100 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:shadow-hard-lg">
        <div className="flex items-start gap-4 p-5 pb-3">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-3 border-ink text-lg font-black text-white shadow-hard-sm"
            style={{ background: bg }}
          >
            {project.ticker.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="truncate text-base font-black leading-tight text-ink">{project.name}</span>
              <span className="font-mono text-[11px] font-bold text-[var(--text-muted)]">{project.ticker}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-snug text-[var(--text-secondary)]">
              {project.description || "Live OP_NET testnet launch project."}
            </p>
          </div>
        </div>

        <div className="mx-5 mb-3 rounded-lg border-2 border-ink bg-[var(--cream)] p-3 text-xs text-ink">
          <div className="flex items-center justify-between gap-2">
            <span className="font-black">Launch</span>
            <span className={`rounded-full border-2 px-2 py-0.5 text-[10px] font-black ${launchTone(project)}`}>
              {launchLabel(project)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--text-muted)]">
            <span>{project.viewCount} views</span>
            <span>Risk {project.riskScore ?? "pending"}</span>
            <span>{timeAgo(project.createdAt)} ago</span>
          </div>
        </div>

        <div className="border-t-3 border-ink">
          <div
            className={`flex w-full items-center justify-center rounded-b-[13px] py-3 text-sm font-black ${
              poolLive ? "bg-opGreen text-white" : "bg-opYellow text-ink"
            }`}
          >
            {poolLive ? "View live pool" : "View launch status"}
          </div>
        </div>
      </div>
    </Link>
  );
}
