"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProjectDTO } from "@opfun/shared";
import type { CheckRun, WatchEvent } from "@/lib/api";
import { pledgeProject, viewProject, resolveWatchEvent } from "@/lib/api";
import { RunChecksPanel } from "./RunChecksPanel";
import { DeployPanel } from "./DeployPanel";
import { BondingCurvePanel } from "./BondingCurvePanel";
import { useWallet } from "./WalletProvider";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

type FullProject = ProjectDTO & { checkRuns: CheckRun[]; watchEvents: WatchEvent[] };

export function ProjectPageClient({ initialProject }: { initialProject: FullProject }) {
  const { wallet } = useWallet();
  const [project, setProject] = useState<FullProject>(initialProject);
  const [pledging, setPledging] = useState(false);
  // T4: admin secret for resolving watch events
  const [watcherAdminSecret, setWatcherAdminSecret] = useState("");
  const [showWatcherAdmin, setShowWatcherAdmin] = useState(false);

  function handleStatusChange(newStatus: string, updates?: Partial<ProjectDTO>) {
    setProject((p) => ({ ...p, status: newStatus as ProjectDTO["status"], ...updates }));
  }

  // Record a view on mount
  useEffect(() => {
    viewProject(project.id);
  }, [project.id]);

  // Poll watch events every 30s when the contract is LAUNCHED (being monitored)
  useEffect(() => {
    if (project.status !== "LAUNCHED" && project.status !== "FLAGGED") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/projects/${project.id}/watch-events`, { cache: "no-store" });
        if (res.ok) {
          const events = (await res.json()) as WatchEvent[];
          setProject((p) => ({ ...p, watchEvents: events }));
        }
      } catch {
        // ignore — network blip
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [project.id, project.status]);

  const handlePledge = useCallback(async () => {
    if (pledging) return;
    setPledging(true);
    try {
      const result = await pledgeProject(project.id, { walletAddress: wallet?.address });
      setProject((p) => ({
        ...p,
        pledgeCount: result.pledgeCount,
        status: result.status as ProjectDTO["status"],
      }));
    } catch {
      // silent
    } finally {
      setPledging(false);
    }
  }, [project.id, pledging, wallet?.address]);

  // T4: resolve a watch event
  const handleResolveEvent = useCallback(
    async (eventId: string) => {
      if (!watcherAdminSecret) return;
      try {
        await resolveWatchEvent(project.id, eventId, watcherAdminSecret);
        setProject((p) => ({
          ...p,
          watchEvents: p.watchEvents.map((ev) =>
            ev.id === eventId ? { ...ev, resolved: true } : ev,
          ),
        }));
      } catch {
        // silent — error visible if nothing changes
      }
    },
    [project.id, watcherAdminSecret],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        {project.iconUrl ? (
          <img
            src={project.iconUrl}
            alt={project.name}
            className="h-16 w-16 rounded-2xl border border-zinc-700 object-cover shrink-0"
          />
        ) : (
          <TokenAvatar ticker={project.ticker} size="lg" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black text-white leading-tight">{project.name}</h1>
            <span className="font-mono text-sm font-semibold text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-lg">
              {project.ticker}
            </span>
            <StatusPill status={project.status} />
          </div>
          <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">{project.description}</p>
        </div>
      </div>

      {/* ── Pump.fun-style top stats bar ────────────────────────────────────── */}
      <TokenStatsBar project={project} />

      {/* ── Meta grid (contract / deploy / build — only when present) ─────── */}
      {(project.contractAddress || project.deployTx || project.buildHash) && (
        <div className="grid gap-2 sm:grid-cols-3">
          {project.contractAddress && (
            <MetaCard label="Contract" value={project.contractAddress} mono />
          )}
          {project.deployTx && <MetaCard label="Deploy TX" value={project.deployTx} mono />}
          {project.buildHash && <MetaCard label="Build Hash" value={project.buildHash} mono />}
        </div>
      )}

      {/* Links */}
      {project.links && Object.keys(project.links as object).length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">Links</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(project.links as Record<string, string>).map(([k, v]) => (
              <a
                key={k}
                href={v}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs py-1.5 px-3"
              >
                {k} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Graduation banner */}
      {project.status === "GRADUATED" && (
        <div className="rounded-xl border border-purple-700/50 bg-purple-950/30 px-5 py-4 text-center">
          <p className="text-xl font-black text-purple-300">This token has graduated</p>
          <p className="mt-1 text-sm text-zinc-400">
            Reached {project.pledgeCount} pledges · Eligible for mainnet consideration.
          </p>
        </div>
      )}

      {/* Bonding curve + pledge */}
      <BondingCurvePanel
        pledgeCount={project.pledgeCount}
        ticker={project.ticker}
        status={project.status}
        onPledge={handlePledge}
        pledging={pledging}
      />

      {/* Security checks + Risk Card */}
      <RunChecksPanel
        initialProject={project}
        onStatusChange={handleStatusChange}
      />

      {/* Deploy panel — shows when READY or LAUNCHED */}
      {(project.status === "READY" || project.status === "LAUNCHED" || project.status === "CHECKING") && (
        <DeployPanel project={project} onStatusChange={handleStatusChange} />
      )}

      {/* Watchtower */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-white">Watchtower Events</h2>
          <div className="flex items-center gap-2">
            {(project.status === "LAUNCHED" || project.status === "FLAGGED") && (
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            )}
            {/* T4: Admin mode toggle */}
            <button
              onClick={() => setShowWatcherAdmin((v) => !v)}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              {showWatcherAdmin ? "Hide admin" : "Admin"}
            </button>
          </div>
        </div>

        {/* T4: Admin secret input — shown only when admin mode active */}
        {showWatcherAdmin && (
          <div className="mb-3">
            <input
              type="password"
              className="input text-xs"
              placeholder="Admin secret (to resolve events)"
              value={watcherAdminSecret}
              onChange={(e) => setWatcherAdminSecret(e.target.value)}
            />
          </div>
        )}

        {!project.watchEvents || project.watchEvents.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {project.status === "LAUNCHED" || project.status === "FLAGGED"
              ? "No anomalies detected yet. Watcher polls every 5 minutes."
              : "Watchtower activates once the contract is deployed."}
          </p>
        ) : (
          <div className="space-y-2">
            {project.watchEvents.map((ev) => (
              <WatchEventRow
                key={ev.id}
                event={ev}
                adminSecret={watcherAdminSecret}
                onResolve={handleResolveEvent}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// T3: MetaCard with copy-to-clipboard
function MetaCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => undefined);
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 group">
      <div className="flex items-start justify-between gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
        <button
          onClick={copy}
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-[10px] font-semibold text-zinc-500 hover:text-zinc-300"
          title="Copy to clipboard"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <p
        className={`mt-1 truncate text-sm text-zinc-200 ${mono ? "font-mono text-xs" : "font-semibold"}`}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Token avatar (initials fallback) ─────────────────────────────────────────

const PALETTE = ["#f97316","#22c55e","#3b82f6","#a855f7","#ec4899","#14b8a6","#eab308"];
function tickerBg(ticker: string): string {
  let h = 0;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) % PALETTE.length;
  return PALETTE[h]!;
}

function TokenAvatar({ ticker, size = "md" }: { ticker: string; size?: "md" | "lg" }) {
  const color = tickerBg(ticker);
  const cls = size === "lg" ? "h-16 w-16 text-xl rounded-2xl" : "h-10 w-10 text-sm rounded-xl";
  return (
    <div
      className={`${cls} shrink-0 flex items-center justify-center font-black text-white/80 border`}
      style={{ background: `${color}22`, borderColor: `${color}44` }}
    >
      {ticker.slice(0, 2)}
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  DRAFT: "bg-zinc-800 text-zinc-400",
  CHECKING: "bg-yellow-900/50 text-yellow-300",
  READY: "bg-blue-900/50 text-blue-300",
  LAUNCHED: "bg-green-900/50 text-green-300",
  FLAGGED: "bg-red-900/50 text-red-300",
  GRADUATED: "bg-purple-900/50 text-purple-300",
  DEPLOY_PACKAGE_READY: "bg-orange-900/50 text-orange-300",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[status] ?? STATUS_PILL["DRAFT"]}`}>
      {status === "FLAGGED" && "⚠ "}
      {status === "LAUNCHED" && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse inline-block" />}
      {status}
    </span>
  );
}

// ─── Top stats bar (like pump.fun) ────────────────────────────────────────────

const BASE_PRICE = 100;
const CURVE_FACTOR = 10;
function curvePrice(n: number) { return BASE_PRICE + (n * n) / CURVE_FACTOR; }

function simMcap(pledges: number): string {
  const sats = curvePrice(pledges) * 1000;
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(2)}M sats`;
  if (sats >= 1_000) return `${Math.round(sats / 1_000)}K sats`;
  return `${Math.round(sats)} sats`;
}

function TokenStatsBar({ project }: { project: ProjectDTO }) {
  const price = Math.round(curvePrice(project.pledgeCount));
  const progress = Math.min(Math.round((project.pledgeCount / 100) * 100), 100);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-zinc-800">
        <StatCell label="Sim Price" value={`${price.toLocaleString()} sats`} />
        <StatCell label="Sim MCap" value={simMcap(project.pledgeCount)} />
        <StatCell
          label="Pledges"
          value={String(project.pledgeCount)}
          sub={`${project.viewCount} views`}
          valueClass="text-green-400"
        />
        <StatCell
          label="B. Curve"
          value={`${progress}%`}
          valueClass={progress >= 100 ? "text-purple-400" : progress >= 75 ? "text-orange-400" : "text-brand-400"}
          sub={
            <div className="mt-1 h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  progress >= 100 ? "bg-purple-500" : "bg-brand-500"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          }
        />
      </div>
      {project.riskScore !== null && (
        <div className="border-t border-zinc-800 px-4 py-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">Risk Score</span>
          <div className="flex items-center gap-3">
            <div className="h-1.5 w-32 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  project.riskScore < 20 ? "bg-green-500"
                  : project.riskScore < 50 ? "bg-yellow-500"
                  : project.riskScore < 75 ? "bg-orange-500"
                  : "bg-red-500"
                }`}
                style={{ width: `${project.riskScore}%` }}
              />
            </div>
            <span className={`text-sm font-bold ${
              project.riskScore < 20 ? "text-green-400"
              : project.riskScore < 50 ? "text-yellow-400"
              : project.riskScore < 75 ? "text-orange-400"
              : "text-red-400"
            }`}>
              {project.riskScore} / 100
            </span>
            <span className="text-xs text-zinc-600">
              {project.riskScore < 20 ? "Low Risk" : project.riskScore < 50 ? "Medium Risk" : project.riskScore < 75 ? "High Risk" : "Critical"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  sub,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${valueClass}`}>{value}</p>
      {sub && <div className="mt-0.5 text-[10px] text-zinc-600">{sub}</div>}
    </div>
  );
}

// ─── Severity dot ─────────────────────────────────────────────────────────────

function SeverityDot({ severity }: { severity: string }) {
  const color =
    severity === "CRITICAL"
      ? "bg-red-500"
      : severity === "WARN"
      ? "bg-yellow-500"
      : "bg-blue-500";
  return <span className={`h-2 w-2 rounded-full ${color} shrink-0`} />;
}

function WatchEventRow({
  event,
  adminSecret,
  onResolve,
}: {
  event: WatchEvent;
  adminSecret?: string;
  onResolve?: (id: string) => void;
}) {
  const resolved = event.resolved;
  const borderColor = resolved
    ? "border-zinc-800 bg-zinc-900/20 opacity-50"
    : event.severity === "CRITICAL"
    ? "border-red-900 bg-red-950/20"
    : event.severity === "WARN"
    ? "border-yellow-900 bg-yellow-950/10"
    : "border-zinc-800 bg-zinc-900/30";

  const details = (() => {
    if (!event.detailsJson) return null;
    try {
      return typeof event.detailsJson === "string"
        ? (JSON.parse(event.detailsJson) as Record<string, unknown>)
        : (event.detailsJson as Record<string, unknown>);
    } catch {
      return null;
    }
  })();

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${borderColor}`}>
      <div className="flex items-center gap-2">
        <SeverityDot severity={event.severity} />
        <span
          className={`text-xs font-bold uppercase ${
            event.severity === "CRITICAL"
              ? "text-red-400"
              : event.severity === "WARN"
              ? "text-yellow-400"
              : "text-blue-400"
          }`}
        >
          {event.severity}
        </span>
        <span className={`text-sm flex-1 ${resolved ? "line-through text-zinc-500" : "text-zinc-200"}`}>
          {event.title}
        </span>
        {resolved ? (
          <span className="text-[10px] font-semibold text-zinc-600 shrink-0">✓ Resolved</span>
        ) : adminSecret ? (
          <button
            onClick={() => onResolve?.(event.id)}
            className="text-[10px] font-semibold text-zinc-500 hover:text-green-400 transition-colors shrink-0"
          >
            Resolve ×
          </button>
        ) : null}
        <span className="text-[10px] text-zinc-600 shrink-0">
          {new Date(event.createdAt).toLocaleString()}
        </span>
      </div>
      {details && Object.keys(details).length > 0 && (
        <div className="mt-1.5 pl-4 text-[10px] font-mono text-zinc-500 space-y-0.5">
          {Object.entries(details)
            .filter(([k]) => !["address", "hexAddress", "network"].includes(k))
            .slice(0, 4)
            .map(([k, v]) => (
              <div key={k} className="truncate">
                <span className="text-zinc-600">{k}:</span>{" "}
                {String(v).slice(0, 80)}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
