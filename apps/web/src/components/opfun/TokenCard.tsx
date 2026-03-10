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
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function launchLabel(project: ProjectDTO): string {
  if (project.launchStatus === "LIVE" || project.status === "LAUNCHED") return "Live pool";
  if (project.launchStatus) return project.launchStatus.replace(/_/g, " ");
  if (project.status === "READY" || project.status === "DEPLOY_PACKAGE_READY") return "Ready";
  return project.status;
}

function launchCls(project: ProjectDTO): string {
  if (project.launchStatus === "LIVE" || project.status === "LAUNCHED") return "bg-opGreen text-white border-ink";
  if (project.launchStatus) return "bg-[#DBEAFE] text-ink border-ink";
  if (project.status === "FLAGGED") return "bg-opRed text-white border-opRed";
  if (project.status === "READY" || project.status === "DEPLOY_PACKAGE_READY") return "bg-opYellow text-ink border-ink";
  return "bg-[#e5e7eb] text-ink border-ink";
}

function riskCls(score: number | null): string {
  if (score === null) return "bg-[#e5e7eb] text-ink";
  if (score < 20) return "bg-opGreen text-white";
  if (score < 50) return "bg-opYellow text-ink";
  return "bg-opRed text-white";
}

export function TokenCard({ project }: { project: ProjectDTO }) {
  const bg = tickerBg(project.ticker);
  const live = project.launchStatus === "LIVE" || project.status === "LAUNCHED";

  return (
    <Link href={`/p/${project.slug}`} className="block group">
      <div className="op-panel p-4 transition-all duration-100 group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] group-hover:shadow-hard-lg">
        <div className="mb-3 flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-3 border-ink text-sm font-black text-white"
            style={{ background: bg }}
          >
            {project.ticker.slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-black text-ink">{project.name}</span>
              <span className="rounded border border-ink bg-opYellow px-1 font-mono text-[10px] font-bold">
                ${project.ticker}
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{timeAgo(project.createdAt)}</div>
          </div>
        </div>

        <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
          {project.description}
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border-2 px-2 py-0.5 text-[10px] font-black ${launchCls(project)}`}>
            {launchLabel(project)}
          </span>
          {project.riskScore !== null ? (
            <span className={`rounded border border-ink px-1.5 py-0.5 text-[10px] font-black ${riskCls(project.riskScore)}`}>
              Risk {project.riskScore}
            </span>
          ) : null}
          <span className="ml-auto text-[10px] text-[var(--text-muted)]">{project.viewCount} views</span>
        </div>

        <div className="flex items-center justify-between border-t-2 border-ink/10 pt-3">
          <div className="text-[10px] font-bold text-[var(--text-muted)]">
            {project.liveAt ? `Live ${timeAgo(project.liveAt)}` : "OP_NET testnet"}
          </div>
          <span className={`text-[10px] font-black ${live ? "text-opGreen" : "text-ink"}`}>
            {live ? "Open live market" : "Open launch page"}
          </span>
        </div>
      </div>
    </Link>
  );
}
