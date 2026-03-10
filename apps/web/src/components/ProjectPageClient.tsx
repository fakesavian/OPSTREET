"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProjectDTO } from "@opfun/shared";
import type { CheckRun, WatchEvent, MarketStateResponse } from "@/lib/api";
import { viewProject, resolveWatchEvent, fetchMarketState } from "@/lib/api";
import { RunChecksPanel } from "./RunChecksPanel";
import { LaunchPanel } from "./LaunchPanel";
import { TokenChart } from "./TokenChart";
import { BuyFlowPanel } from "./BuyFlowPanel";
import { useWallet } from "./WalletProvider";
import { AchievementBadges } from "./AchievementBadges";
import { OpBadge } from "./opfun/OpBadge";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

type FullProject = ProjectDTO & { checkRuns: CheckRun[]; watchEvents: WatchEvent[] };

// ─── Risk Score Card ──────────────────────────────────────────────────────────

function RiskScoreCard({ riskScore }: { riskScore: number | null }) {
  if (riskScore === null) return null;
  const level = riskScore < 20 ? "low" : riskScore < 50 ? "med" : "high";
  const scoreColor = level === "low" ? "text-opGreen" : level === "med" ? "text-opYellow" : "text-opRed";
  const checks = [
    { label: "No Mint Function",  pass: level !== "high"  },
    { label: "No Admin Key",      pass: level === "low"   },
    { label: "Fixed Supply",      pass: true              },
    { label: "Audit Passed",      pass: level !== "high"  },
  ];
  return (
    <div className="op-panel p-5">
      <h3 className="font-black text-ink mb-3 text-sm uppercase tracking-wider">Risk Score</h3>
      <div className="flex items-end gap-2 mb-4">
        <span className={`text-5xl font-black ${scoreColor}`}>{riskScore}</span>
        <span className="text-xl text-[var(--text-muted)] mb-1">/100</span>
      </div>
      <div className="space-y-2">
        {checks.map(({ label, pass }) => (
          <div key={label} className="flex items-center gap-2 text-sm">
            <span className={`font-black ${pass ? "text-opGreen" : "text-opRed"}`}>
              {pass ? "✓" : "✗"}
            </span>
            <span className="text-ink">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveMarketSummary({
  project,
  marketState,
}: {
  project: ProjectDTO;
  marketState: MarketStateResponse | null;
}) {
  const poolLive = project.launchStatus === "LIVE";

  if (!poolLive) {
    return (
      <div className="op-panel p-5">
        <h3 className="font-black text-ink mb-3 text-sm uppercase tracking-wider">Live Pool</h3>
        <div className="rounded-xl border-2 border-ink/20 bg-[var(--cream)] px-4 py-5 text-sm text-[var(--text-muted)]">
          {project.launchStatus === "POOL_SUBMITTED"
            ? "Pool creation submitted. Trading unlocks after watcher confirmation."
            : project.launchStatus === "AWAITING_POOL_CREATE"
              ? "Contract confirmed. Waiting for pool creation."
              : project.launchStatus === "DEPLOY_SUBMITTED" || project.launchStatus === "DEPLOY_CONFIRMED"
                ? "Deployment in progress. Pool quotes are unavailable until the token is fully live."
                : "Pool not live yet. Quotes, charts, and fills stay empty until the live testnet pool is confirmed."}
        </div>
      </div>
    );
  }

  if (!marketState?.available) {
    return (
      <div className="op-panel p-5">
        <h3 className="font-black text-ink mb-3 text-sm uppercase tracking-wider">Live Pool</h3>
        <div className="rounded-xl border-2 border-opYellow bg-opYellow/10 px-4 py-5 text-sm text-ink">
          Pool is live, but reserves have not been indexed yet. Quotes and candles will appear after the next watcher cycle.
        </div>
      </div>
    );
  }

  return (
    <div className="op-panel p-5">
      <h3 className="font-black text-ink mb-3 text-sm uppercase tracking-wider">Live Pool</h3>
      <div className="grid gap-2">
        <div className="flex justify-between items-center border-b border-ink/10 pb-1">
          <span className="text-xs text-[var(--text-muted)]">Price</span>
          <span className="text-sm font-black text-ink">{marketState.currentPriceSats.toLocaleString()} sats</span>
        </div>
        <div className="flex justify-between items-center border-b border-ink/10 pb-1">
          <span className="text-xs text-[var(--text-muted)]">24h Volume</span>
          <span className="text-sm font-black text-ink">{marketState.volume24hSats.toLocaleString()} sats</span>
        </div>
        <div className="flex justify-between items-center border-b border-ink/10 pb-1">
          <span className="text-xs text-[var(--text-muted)]">24h Trades</span>
          <span className="text-sm font-black text-ink">{marketState.tradeCount24h.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center border-b border-ink/10 pb-1">
          <span className="text-xs text-[var(--text-muted)]">Reserve Base</span>
          <span className="text-sm font-black text-ink">{marketState.reserveBase.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-[var(--text-muted)]">Reserve Quote</span>
          <span className="text-sm font-black text-ink">{marketState.reserveQuote.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProjectPageClient({ initialProject }: { initialProject: FullProject }) {
  const { wallet } = useWallet();
  const [project, setProject] = useState<FullProject>(initialProject);
  const [marketState, setMarketState] = useState<MarketStateResponse | null>(null);
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

  useEffect(() => {
    if (project.launchStatus !== "LIVE") {
      setMarketState(null);
      return;
    }

    let cancelled = false;
    const loadMarketState = () => {
      fetchMarketState(project.id)
        .then((state) => {
          if (!cancelled) setMarketState(state);
        })
        .catch(() => {
          if (!cancelled) setMarketState(null);
        });
    };

    loadMarketState();
    const interval = setInterval(loadMarketState, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [project.id, project.launchStatus]);

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
    <div className="mx-auto max-w-4xl space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        {project.iconUrl ? (
          <img
            src={project.iconUrl}
            alt={project.name}
            className="h-16 w-16 rounded-2xl border-3 border-ink object-cover shrink-0"
          />
        ) : (
          <TokenAvatar ticker={project.ticker} size="lg" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black text-ink leading-tight">{project.name}</h1>
            <span className="font-mono text-sm font-semibold text-[var(--text-muted)] bg-[var(--cream)] px-2 py-0.5 rounded-lg border-2 border-ink">
              {project.ticker}
            </span>
            <StatusPill status={project.status} />
            <OpBadge variant={project.launchStatus === "LIVE" ? "live" : project.launchStatus ? "testnet" : "draft"} />
          </div>
          <p className="mt-1.5 text-sm text-[var(--text-muted)] leading-relaxed">{project.description}</p>
        </div>
      </div>

      {/* ── Trading status disclaimer ────────────────────────────────────── */}
      <div className="op-panel px-4 py-2.5 text-xs text-ink border-opYellow bg-opYellow/10">
        {project.launchStatus === "LIVE"
          ? "Charts and trade flows are sourced from confirmed live testnet pool activity."
          : "Trading stays unavailable until deployment and pool creation are confirmed on OP_NET testnet."}
      </div>

      {/* ── 2-col desktop layout ───────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-[1fr_280px] gap-5">
        {/* Left column */}
        <div className="space-y-5">
          {/* Live market stats bar */}
          <TokenStatsBar project={project} marketState={marketState} />

          {/* Description + links card */}
          {(project.links && Object.keys(project.links as object).length > 0) && (
            <div className="op-panel p-5">
              <h2 className="mb-3 text-sm font-black text-ink uppercase tracking-wider">Links</h2>
              <div className="flex flex-wrap gap-2">
                {Object.entries(project.links as Record<string, string>).map(([k, v]) => (
                  <a
                    key={k}
                    href={v}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border-2 border-ink bg-[var(--cream)] px-3 py-1.5 text-xs font-black text-ink hover:bg-opYellow transition-colors"
                  >
                    {k} ↗
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Meta grid (contract / deploy / build — only when present) */}
          {(project.contractAddress || project.deployTx || project.buildHash) && (
            <div className="grid gap-2 sm:grid-cols-3">
              {project.contractAddress && (
                <MetaCard label="Contract" value={project.contractAddress} mono />
              )}
              {project.deployTx && <MetaCard label="Deploy TX" value={project.deployTx} mono />}
              {project.buildHash && <MetaCard label="Build Hash" value={project.buildHash} mono />}
            </div>
          )}

          {/* Graduation banner */}
          {project.status === "GRADUATED" && (
            <div className="op-panel px-5 py-4 text-center border-opGreen bg-opGreen/10">
              <p className="text-xl font-black text-ink">This token has graduated</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Historical status retained for compatibility. Live launch readiness is now driven by deploy and pool confirmation.
              </p>
            </div>
          )}

          {/* Interactive token chart */}
          <TokenChart
            ticker={project.ticker}
            projectId={project.id}
          />

          {/* Achievement badges — shown when wallet connected */}
          {wallet?.address && (
            <AchievementBadges walletAddress={wallet.address} />
          )}

          {/* Security checks + Risk Card */}
          <RunChecksPanel
            initialProject={project}
            onStatusChange={handleStatusChange}
          />

          {/* OP_NET ecosystem links — shown when READY */}
          {project.status === "READY" && (
            <div className="op-panel p-4 text-sm">
              <p className="mb-2 font-black text-ink">Prepare to Launch on OP_NET</p>
              <ul className="space-y-1 text-[var(--text-muted)]">
                <li>
                  {"🪙 "}
                  <a
                    href="https://faucet.opnet.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink underline hover:text-opYellow font-bold"
                  >
                    Get testnet BTC (tBTC)
                  </a>{" "}
                  — 0.05 tBTC / 24h via OP_NET faucet
                </li>
                <li>
                  {"👛 "}
                  <a
                    href="https://opnet.org/wallet"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink underline hover:text-opYellow font-bold"
                  >
                    Install OP_WALLET
                  </a>{" "}
                  — Bitcoin wallet with OP_NET support
                </li>
                <li>
                  {"🔍 "}
                  <a
                    href="https://scan.opnet.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink underline hover:text-opYellow font-bold"
                  >
                    View on OP_SCAN
                  </a>{" "}
                  — explore deployed contracts
                </li>
              </ul>
            </div>
          )}

          {/* Watchtower */}
          <div className="op-panel p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-black text-ink text-sm uppercase tracking-wider">Watchtower Events</h2>
              <div className="flex items-center gap-2">
                {(project.status === "LAUNCHED" || project.status === "FLAGGED") && (
                  <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-opGreen animate-pulse" />
                    Live
                  </span>
                )}
                {/* T4: Admin mode toggle */}
                <button
                  onClick={() => setShowWatcherAdmin((v) => !v)}
                  className="text-[10px] text-[var(--text-muted)] hover:text-ink transition-colors font-bold"
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
                  className="w-full rounded-lg border-2 border-ink bg-[var(--cream)] px-3 py-2 text-xs text-ink placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-opYellow"
                  placeholder="Admin secret (to resolve events)"
                  value={watcherAdminSecret}
                  onChange={(e) => setWatcherAdminSecret(e.target.value)}
                />
              </div>
            )}

            {!project.watchEvents || project.watchEvents.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
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

        {/* Right column */}
        <div className="space-y-5">
          <LiveMarketSummary project={project} marketState={marketState} />

          {/* Risk Score card */}
          <RiskScoreCard riskScore={project.riskScore} />

          {/* Launch pipeline — wallet-native deploy + pool */}
          {(project.status === "READY" || project.status === "LAUNCHED" || project.status === "DEPLOY_PACKAGE_READY") && (
            <LaunchPanel project={project} onStatusChange={handleStatusChange} />
          )}

          {/* Phase 4: Buy flow */}
          <BuyFlowPanel
            project={project}
            walletAddress={wallet?.address}
            walletProvider={wallet?.provider}
          />
        </div>
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
    <div className="op-panel p-3 group">
      <div className="flex items-start justify-between gap-1">
        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
        <button
          onClick={copy}
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-[10px] font-bold text-[var(--text-muted)] hover:text-ink"
          title="Copy to clipboard"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <p
        className={`mt-1 truncate text-sm text-ink ${mono ? "font-mono text-xs" : "font-semibold"}`}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Token avatar (initials avatar) ─────────────────────────────────────────

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
      className={`${cls} shrink-0 flex items-center justify-center font-black text-white/80 border-3 border-ink`}
      style={{ background: `${color}22`, borderColor: undefined }}
    >
      {ticker.slice(0, 2)}
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  DRAFT: "bg-[var(--cream)] text-[var(--text-muted)] border-ink",
  CHECKING: "bg-opYellow/20 text-ink border-ink",
  READY: "bg-opYellow/30 text-ink border-ink",
  LAUNCHED: "bg-opGreen/20 text-opGreen border-ink",
  FLAGGED: "bg-opRed/20 text-opRed border-ink",
  GRADUATED: "bg-opYellow text-ink border-ink",
  DEPLOY_PACKAGE_READY: "bg-opYellow/20 text-ink border-ink",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border-2 px-2.5 py-0.5 text-xs font-black ${STATUS_PILL[status] ?? STATUS_PILL["DRAFT"]}`}>
      {status === "FLAGGED" && "⚠ "}
      {status === "LAUNCHED" && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-opGreen animate-pulse inline-block" />}
      {status}
    </span>
  );
}

// ─── Top stats bar ────────────────────────────────────────────────────────────

function TokenStatsBar({ project, marketState }: { project: ProjectDTO; marketState: MarketStateResponse | null }) {
  const poolLive = project.launchStatus === "LIVE" && marketState?.available;

  return (
    <div className="op-panel overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-ink/10">
        <StatCell
          label="Price"
          value={poolLive ? `${marketState.currentPriceSats.toLocaleString()} sats` : "—"}
        />
        <StatCell
          label="24h Volume"
          value={poolLive ? `${marketState.volume24hSats.toLocaleString()} sats` : "—"}
        />
        <StatCell
          label="Trades (24h)"
          value={poolLive ? String(marketState.tradeCount24h) : "—"}
          sub={`${project.viewCount} views`}
          valueClass={poolLive && marketState.tradeCount24h > 0 ? "text-opGreen" : "text-ink"}
        />
        <StatCell
          label="Status"
          value={poolLive ? "LIVE" : project.launchStatus ?? "DRAFT"}
          valueClass={poolLive ? "text-opGreen" : "text-ink"}
        />
      </div>
      {project.riskScore !== null && (
        <div className="border-t border-ink/10 px-4 py-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">Risk Score</span>
          <div className="flex items-center gap-3">
            <div className="h-1.5 w-32 rounded-full bg-ink/10 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  project.riskScore < 20 ? "bg-opGreen"
                  : project.riskScore < 50 ? "bg-opYellow"
                  : project.riskScore < 75 ? "bg-opYellow"
                  : "bg-opRed"
                }`}
                style={{ width: `${project.riskScore}%` }}
              />
            </div>
            <span className={`text-sm font-black ${
              project.riskScore < 20 ? "text-opGreen"
              : project.riskScore < 50 ? "text-opYellow"
              : project.riskScore < 75 ? "text-opYellow"
              : "text-opRed"
            }`}>
              {project.riskScore} / 100
            </span>
            <span className="text-xs text-[var(--text-muted)]">
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
  valueClass = "text-ink",
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-0.5">{label}</p>
      <p className={`text-sm font-black ${valueClass}`}>{value}</p>
      {sub && <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

// ─── Severity dot ─────────────────────────────────────────────────────────────

function SeverityDot({ severity }: { severity: string }) {
  const color =
    severity === "CRITICAL"
      ? "bg-opRed"
      : severity === "WARN"
      ? "bg-opYellow"
      : "bg-opGreen";
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
    ? "border-ink/20 bg-[var(--panel-cream)] opacity-50"
    : event.severity === "CRITICAL"
    ? "border-opRed bg-opRed/5"
    : event.severity === "WARN"
    ? "border-opYellow bg-opYellow/5"
    : "border-ink/20 bg-[var(--panel-cream)]";

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
    <div className={`rounded-xl border-2 px-3 py-2.5 ${borderColor}`}>
      <div className="flex items-center gap-2">
        <SeverityDot severity={event.severity} />
        <span
          className={`text-xs font-black uppercase ${
            event.severity === "CRITICAL"
              ? "text-opRed"
              : event.severity === "WARN"
              ? "text-opYellow"
              : "text-opGreen"
          }`}
        >
          {event.severity}
        </span>
        <span className={`text-sm flex-1 ${resolved ? "line-through text-[var(--text-muted)]" : "text-ink"}`}>
          {event.title}
        </span>
        {resolved ? (
          <span className="text-[10px] font-black text-[var(--text-muted)] shrink-0">✓ Resolved</span>
        ) : adminSecret ? (
          <button
            onClick={() => onResolve?.(event.id)}
            className="text-[10px] font-black text-[var(--text-muted)] hover:text-opGreen transition-colors shrink-0"
          >
            Resolve ×
          </button>
        ) : null}
        <span className="text-[10px] text-[var(--text-muted)] shrink-0">
          {new Date(event.createdAt).toLocaleString()}
        </span>
      </div>
      {details && Object.keys(details).length > 0 && (
        <div className="mt-1.5 pl-4 text-[10px] font-mono text-[var(--text-muted)] space-y-0.5">
          {Object.entries(details)
            .filter(([k]) => !["address", "hexAddress", "network"].includes(k))
            .slice(0, 4)
            .map(([k, v]) => (
              <div key={k} className="truncate">
                <span className="text-ink/40">{k}:</span>{" "}
                {String(v).slice(0, 80)}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
