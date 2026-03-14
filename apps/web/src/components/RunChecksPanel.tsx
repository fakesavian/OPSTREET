"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import type { ProjectDTO, RiskCard } from "@opfun/shared";
import { getApiBase } from "@/lib/apiBase";

const API = typeof window !== "undefined" ? getApiBase() : "";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft - ready for audit",
  CHECKING: "Running checks...",
  READY: "Checks passed",
  LAUNCHED: "Launched on OP_NET",
  FLAGGED: "Flagged - anomaly detected",
  GRADUATED: "Graduated",
  DEPLOY_PACKAGE_READY: "Deploy package ready",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "text-[var(--text-muted)]",
  CHECKING: "text-opYellow",
  READY: "text-opGreen",
  LAUNCHED: "text-opGreen",
  FLAGGED: "text-opRed",
  GRADUATED: "text-opGreen",
  DEPLOY_PACKAGE_READY: "text-opYellow",
};

interface CheckRun {
  id: string;
  type: string;
  status: string;
  outputJson?: string | null;
  createdAt: string;
}

interface FullProject extends ProjectDTO {
  checkRuns: CheckRun[];
  watchEvents: unknown[];
}

function parseOutput(outputJson?: string | null): null | {
  summary?: string;
  buildHash?: string;
  issues?: Array<{ severity: string; code: string; message: string }>;
} {
  if (!outputJson) return null;
  try {
    return JSON.parse(outputJson) as {
      summary?: string;
      buildHash?: string;
      issues?: Array<{ severity: string; code: string; message: string }>;
    };
  } catch {
    return null;
  }
}

function shortIssue(issue: { severity: string; message: string }): string {
  return `${issue.severity}: ${issue.message.replace(/^BOB-AUDIT:\s*/i, "").replace(/\s+/g, " ").trim()}`;
}

export function RunChecksPanel({
  initialProject,
  onStatusChange,
}: {
  initialProject: FullProject;
  onStatusChange?: (status: string, updates?: Partial<ProjectDTO>) => void;
}) {
  const [project, setProject] = useState<FullProject>(initialProject);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/projects/${project.slug}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as FullProject;
        setProject(data);
        onStatusChange?.(data.status, {
          riskScore: data.riskScore,
          riskCard: data.riskCard,
          buildHash: data.buildHash,
        });
        return data.status;
      }
    } catch {
      // Ignore transient polling errors.
    }
    return project.status;
  }, [project.slug, project.status, onStatusChange]);

  useEffect(() => {
    if (project.status !== "CHECKING") return;
    const interval = setInterval(async () => {
      const newStatus = await refresh();
      if (newStatus !== "CHECKING") clearInterval(interval);
    }, 2000);
    return () => clearInterval(interval);
  }, [project.status, refresh]);

  async function runChecks() {
    setRunning(true);
    setError("");
    try {
      const res = await fetch(`${API}/projects/${project.id}/run-checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok && res.status !== 202) {
        const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`);
      }
      setProject((p) => ({ ...p, status: "CHECKING" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checks");
    } finally {
      setRunning(false);
    }
  }

  const riskCard = project.riskCard as RiskCard | null;
  const statusColor = STATUS_COLOR[project.status] ?? "text-[var(--text-muted)]";
  const isChecking = project.status === "CHECKING";

  return (
    <div className="space-y-5">
      <div className="op-panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1">Audit Status</p>
          <p className={`text-lg font-black ${statusColor} flex items-center gap-2`}>
            {isChecking && <span className="inline-block h-3 w-3 rounded-full bg-opYellow border-2 border-ink animate-pulse" />}
            {STATUS_LABELS[project.status] ?? project.status}
          </p>
          {project.buildHash && (
            <p className="mt-1 font-mono text-[10px] text-[var(--text-muted)] truncate max-w-xs">sha256: {project.buildHash}</p>
          )}
        </div>
        {(project.status === "DRAFT" || project.status === "READY" || project.status === "FLAGGED") && (
          <button
            onClick={runChecks}
            disabled={running || isChecking}
            className="op-btn-primary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running || isChecking ? "Running..." : "Run Security Checks"}
          </button>
        )}
      </div>

      {error && <div className="op-panel px-4 py-3 text-sm text-opRed border-opRed bg-opRed/5">Warning: {error}</div>}

      <div className="op-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-ink text-sm uppercase tracking-wider">Risk Card</h2>
          {project.riskScore !== null ? (
            <RiskScoreBadge score={project.riskScore} />
          ) : (
            <span className="text-xs text-[var(--text-muted)]">{isChecking ? "Computing..." : "Run checks to generate"}</span>
          )}
        </div>

        {riskCard ? (
          <RiskCardView card={riskCard} riskScore={project.riskScore} />
        ) : (
          <div className="rounded-xl border-2 border-dashed border-ink/30 py-10 text-center">
            {isChecking ? (
              <div className="space-y-3">
                <div className="flex justify-center gap-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-2 w-2 rounded-full bg-opYellow border border-ink animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <p className="text-xs text-[var(--text-muted)]">Running Bob (OpnetDev + OpnetAudit)...</p>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">Click <strong className="text-ink">Run Security Checks</strong> to generate the Risk Card.</p>
            )}
          </div>
        )}
      </div>

      {project.checkRuns.length > 0 && (
        <details className="op-panel p-5">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-ink text-sm uppercase tracking-wider">Check Run Log</h2>
              <span className="text-xs font-black text-[var(--text-muted)]">{project.checkRuns.length} runs - click to expand</span>
            </div>
          </summary>

          <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {project.checkRuns.map((run) => {
              const output = parseOutput(run.outputJson);
              const issues = Array.isArray(output?.issues) ? output.issues.filter((i) => i.severity !== "PASS") : [];
              const failCount = issues.filter((i) => i.severity === "FAIL").length;
              const warnCount = issues.filter((i) => i.severity === "WARN").length;

              return (
                <div key={run.id} className="rounded-xl border-2 border-ink/20 bg-[var(--cream)] px-3 py-2.5">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusDot status={run.status} />
                      <span className="text-sm font-black text-ink">{run.type}</span>
                    </div>
                    <span className={`text-xs font-black ${
                      run.status === "OK"
                        ? "text-opGreen"
                        : run.status === "FAIL"
                        ? "text-opRed"
                        : run.status === "WARN"
                        ? "text-opYellow"
                        : "text-[var(--text-muted)]"
                    }`}>{run.status}</span>
                  </div>

                  {output?.summary && <p className="mt-1 text-xs text-[var(--text-muted)]">{output.summary}</p>}
                  {(failCount > 0 || warnCount > 0) && (
                    <p className="mt-1 text-[11px] font-black text-ink">{failCount} critical / {warnCount} warnings</p>
                  )}

                  {issues.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {issues.slice(0, 3).map((issue, idx) => (
                        <p key={`${run.id}-short-${idx}`} className="text-xs text-[var(--text-muted)]">{shortIssue(issue)}</p>
                      ))}
                      {issues.length > 3 && (
                        <details>
                          <summary className="cursor-pointer text-[11px] font-black text-ink">
                            Show {issues.length - 3} more technical checks
                          </summary>
                          <div className="mt-1 space-y-1">
                            {issues.slice(3).map((issue, idx) => (
                              <p key={`${run.id}-full-${idx}`} className="text-xs text-[var(--text-muted)]">
                                <span className={issue.severity === "FAIL" ? "text-opRed" : issue.severity === "WARN" ? "text-opYellow" : "text-opGreen"}>
                                  [{issue.severity}]
                                </span>{" "}
                                {issue.code}: {issue.message}
                              </p>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}

                  {output?.buildHash && (
                    <p className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">build: {output.buildHash}</p>
                  )}
                  <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">{new Date(run.createdAt).toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "OK"
      ? "bg-opGreen"
      : status === "FAIL"
      ? "bg-opRed"
      : status === "WARN"
      ? "bg-opYellow"
      : status === "PENDING"
      ? "bg-ink/30 animate-pulse"
      : "bg-ink/20";
  return <span className={`h-2 w-2 rounded-full shrink-0 border border-ink/20 ${color}`} />;
}

function RiskScoreBadge({ score }: { score: number }) {
  const label = score < 20 ? "LOW RISK" : score < 50 ? "MEDIUM" : score < 75 ? "HIGH RISK" : "CRITICAL";
  const cls =
    score < 20
      ? "bg-opGreen/20 text-opGreen border-opGreen"
      : score < 50
      ? "bg-opYellow/30 text-ink border-ink"
      : score < 75
      ? "bg-[#FED7AA] text-ink border-ink"
      : "bg-opRed/20 text-opRed border-opRed";
  return (
    <div className={`op-panel rounded-xl border-2 px-3 py-1.5 text-center shadow-hard-sm ${cls}`}>
      <div className="text-2xl font-black">{score}</div>
      <div className="text-[10px] font-black">{label}</div>
    </div>
  );
}

function RiskCardView({ card, riskScore }: { card: RiskCard; riskScore?: number | null }) {
  const score = riskScore ?? 0;
  const barColor = score < 20 ? "bg-opGreen" : score < 40 ? "bg-opYellow" : score < 70 ? "bg-[#F97316]" : "bg-opRed";
  const barLabel = score < 20 ? "LOW RISK" : score < 40 ? "MEDIUM RISK" : score < 70 ? "HIGH RISK" : "CRITICAL";
  const hasPrivilege = card.permissions.hasOwnerKey || card.permissions.canMint || card.permissions.canUpgrade || card.permissions.canPause;
  const noTimelockPenalty = hasPrivilege && !card.permissions.hasTimelocks;

  return (
    <div className="space-y-4">
      {riskScore !== null && riskScore !== undefined && (
        <div className="rounded-xl border-2 border-ink bg-[var(--cream)] px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">Risk Score</span>
            <span className={`text-sm font-black ${score < 20 ? "text-opGreen" : score < 40 ? "text-ink" : score < 70 ? "text-[#F97316]" : "text-opRed"}`}>
              {score} / 100 - {barLabel}
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-ink/10 overflow-hidden border border-ink/20">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(score, 100)}%` }} />
          </div>
        </div>
      )}

      <RiskSection title="Permissions / Admin Risk">
        <RiskRow label="Owner / admin keys" value={card.permissions.hasOwnerKey} invert points={25} />
        <RiskRow label="Can mint more supply" value={card.permissions.canMint} invert points={40} />
        <RiskRow label="Can pause transfers" value={card.permissions.canPause} invert points={15} />
        <RiskRow label="Can upgrade logic" value={card.permissions.canUpgrade} invert points={25} />
        <RiskRow label="Has timelocks" value={card.permissions.hasTimelocks} points={15} timelockRow />
        {noTimelockPenalty && (
          <div className="flex items-center gap-1.5 rounded-lg bg-opRed/5 border-2 border-opRed/30 px-2 py-1.5 text-xs text-opRed">
            <span>!</span>
            <span>Privileged controls active without timelocks <span className="font-black">+15 pts</span></span>
          </div>
        )}
        {card.permissions.timelockDelay !== null && (
          <div className="text-xs text-[var(--text-muted)] pl-1">Timelock delay: {card.permissions.timelockDelay}s</div>
        )}
      </RiskSection>

      <RiskSection title="Token Economics">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Max Supply</p>
            <p className="font-mono font-black text-ink">{Number(card.tokenEconomics.maxSupply).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Decimals</p>
            <p className="font-mono font-black text-ink">{card.tokenEconomics.decimals}</p>
          </div>
        </div>
        {card.tokenEconomics.initialDistributionNotes && <p className="text-xs text-[var(--text-muted)] mt-1">{card.tokenEconomics.initialDistributionNotes}</p>}
        {card.tokenEconomics.transferRestrictions && <p className="text-xs text-opRed mt-1">Warning: {card.tokenEconomics.transferRestrictions}</p>}
      </RiskSection>

      <RiskSection title="Release Integrity">
        <RiskRow label="Build hash recorded" value={card.releaseIntegrity.buildHashRecorded} points={10} />
        {card.releaseIntegrity.contractMatchesArtifact !== null && <ArtifactVerifiedBadge verified={card.releaseIntegrity.contractMatchesArtifact} />}
        {card.releaseIntegrity.auditTimestamp && (
          <div className="text-xs text-[var(--text-muted)]">Audited: {new Date(card.releaseIntegrity.auditTimestamp).toLocaleString()}</div>
        )}
        {card.releaseIntegrity.auditSummary && (
          <div className={`mt-1 text-xs font-black ${card.releaseIntegrity.auditSummary.startsWith("PASS") ? "text-opGreen" : card.releaseIntegrity.auditSummary.startsWith("WARN") ? "text-opYellow" : "text-opRed"}`}>
            {card.releaseIntegrity.auditSummary}
          </div>
        )}
      </RiskSection>
    </div>
  );
}

function ArtifactVerifiedBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <div className="flex items-center gap-2 rounded-xl border-2 border-opGreen bg-opGreen/10 px-3 py-2">
        <span className="text-opGreen text-lg font-black">OK</span>
        <div>
          <p className="text-xs font-black text-opGreen">Artifact Verified</p>
          <p className="text-[10px] text-[var(--text-muted)]">Deployed contract matches the recorded build hash.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border-2 border-opYellow bg-opYellow/10 px-3 py-2">
      <span className="text-ink text-lg font-black">?</span>
      <div>
        <p className="text-xs font-black text-ink">Artifact Unverified</p>
        <p className="text-[10px] text-[var(--text-muted)]">Confirm deploy to link contract to build hash.</p>
      </div>
    </div>
  );
}

function RiskSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-ink/20 bg-[var(--cream)] p-4">
      <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function RiskRow({
  label,
  value,
  invert,
  points,
  timelockRow,
}: {
  label: string;
  value: boolean;
  invert?: boolean;
  points?: number;
  timelockRow?: boolean;
}) {
  const isRisky = timelockRow ? !value : invert ? value : !value;
  const showPoints = points !== undefined && isRisky;
  return (
    <div className={`flex items-center justify-between text-sm rounded-lg px-2.5 py-1.5 border-2 ${isRisky ? "bg-opRed/5 border-opRed/30" : "bg-opGreen/5 border-opGreen/20"}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-black ${isRisky ? "text-opRed" : "text-opGreen"}`}>{isRisky ? "NO" : "YES"}</span>
        <span className="text-ink font-semibold">{label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {showPoints && <span className="text-[10px] font-black text-opRed bg-opRed/10 px-1.5 py-0.5 rounded border border-opRed/20">+{points} pts</span>}
        <span className={`font-black text-xs ${isRisky ? "text-opRed" : "text-opGreen"}`}>{value ? "Yes" : "No"}</span>
      </div>
    </div>
  );
}
