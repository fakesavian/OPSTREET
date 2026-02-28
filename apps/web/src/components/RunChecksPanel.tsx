"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProjectDTO, RiskCard } from "@opfun/shared";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  CHECKING: "Running checks…",
  READY: "Checks passed",
  LAUNCHED: "Launched",
  FLAGGED: "Flagged",
  GRADUATED: "Graduated",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "text-zinc-400",
  CHECKING: "text-yellow-400",
  READY: "text-green-400",
  LAUNCHED: "text-blue-400",
  FLAGGED: "text-red-400",
  GRADUATED: "text-purple-400",
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

export function RunChecksPanel({ initialProject }: { initialProject: FullProject }) {
  const [project, setProject] = useState<FullProject>(initialProject);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/projects/${project.slug}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as FullProject;
        setProject(data);
        return data.status;
      }
    } catch {
      // ignore
    }
    return project.status;
  }, [project.slug, project.status]);

  // Poll while CHECKING
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
      });
      if (!res.ok && res.status !== 202) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      // Optimistically set CHECKING
      setProject((p) => ({ ...p, status: "CHECKING" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checks");
    } finally {
      setRunning(false);
    }
  }

  const riskCard = project.riskCard as RiskCard | null;
  const statusColor = STATUS_COLOR[project.status] ?? "text-zinc-400";
  const isChecking = project.status === "CHECKING";

  return (
    <div className="space-y-6">
      {/* Status + CTA */}
      <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Status</p>
          <p className={`mt-1 text-lg font-bold ${statusColor}`}>
            {isChecking && (
              <span className="inline-block h-3 w-3 rounded-full bg-yellow-400 mr-2 animate-pulse" />
            )}
            {STATUS_LABELS[project.status] ?? project.status}
          </p>
          {project.buildHash && (
            <p className="mt-1 font-mono text-[11px] text-zinc-600 truncate max-w-xs">
              sha256: {project.buildHash}
            </p>
          )}
        </div>
        {(project.status === "DRAFT" || project.status === "READY" || project.status === "FLAGGED") && (
          <button
            onClick={runChecks}
            disabled={running || isChecking}
            className="btn-primary shrink-0"
          >
            {running || isChecking ? "Running checks…" : "Run Security Checks →"}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Risk Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white">Risk Card</h2>
          {project.riskScore !== null ? (
            <RiskScoreBadge score={project.riskScore} />
          ) : (
            <span className="text-xs text-zinc-500">
              {isChecking ? "Computing…" : "Run checks to generate"}
            </span>
          )}
        </div>

        {riskCard ? (
          <RiskCardView card={riskCard} />
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-700 py-10 text-center">
            {isChecking ? (
              <div className="space-y-2">
                <div className="h-2 w-32 mx-auto rounded bg-zinc-700 animate-pulse" />
                <div className="h-2 w-24 mx-auto rounded bg-zinc-800 animate-pulse" />
                <p className="mt-3 text-xs text-zinc-500">Calling Bob (OpnetDev + OpnetAudit)…</p>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                Click <strong>Run Security Checks</strong> to generate the Risk Card.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Check Runs log */}
      {project.checkRuns.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-bold text-white">Check Run Log</h2>
          <div className="space-y-2">
            {project.checkRuns.map((run) => {
              const output = (() => {
                try {
                  return run.outputJson ? JSON.parse(run.outputJson) : null;
                } catch {
                  return null;
                }
              })();
              return (
                <div key={run.id} className="rounded-lg border border-zinc-800 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <StatusDot status={run.status} />
                      <span className="text-sm font-semibold text-zinc-200">{run.type}</span>
                    </div>
                    <span
                      className={`text-xs font-bold ${
                        run.status === "OK"
                          ? "text-green-400"
                          : run.status === "FAIL"
                          ? "text-red-400"
                          : run.status === "WARN"
                          ? "text-yellow-400"
                          : "text-zinc-500"
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                  {output?.summary && (
                    <p className="text-xs text-zinc-400 mt-1">{output.summary as string}</p>
                  )}
                  {output?.buildHash && (
                    <p className="mt-1 font-mono text-[10px] text-zinc-600">
                      build: {output.buildHash as string}
                    </p>
                  )}
                  {output?.issues && Array.isArray(output.issues) && output.issues.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {(output.issues as Array<{ severity: string; code: string; message: string }>)
                        .filter((i) => i.severity !== "PASS")
                        .map((issue, idx) => (
                          <div key={idx} className="text-xs text-zinc-500">
                            <span
                              className={
                                issue.severity === "FAIL"
                                  ? "text-red-400"
                                  : issue.severity === "WARN"
                                  ? "text-yellow-400"
                                  : "text-blue-400"
                              }
                            >
                              [{issue.severity}]
                            </span>{" "}
                            {issue.code}: {issue.message}
                          </div>
                        ))}
                    </div>
                  )}
                  <p className="mt-1 text-[10px] text-zinc-700">
                    {new Date(run.createdAt).toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "OK"
      ? "bg-green-500"
      : status === "FAIL"
      ? "bg-red-500"
      : status === "WARN"
      ? "bg-yellow-500"
      : status === "PENDING"
      ? "bg-zinc-500 animate-pulse"
      : "bg-zinc-600";
  return <span className={`h-2 w-2 rounded-full shrink-0 ${color}`} />;
}

function RiskScoreBadge({ score }: { score: number }) {
  const label =
    score < 20 ? "LOW RISK" : score < 50 ? "MEDIUM RISK" : score < 75 ? "HIGH RISK" : "CRITICAL";
  const style =
    score < 20
      ? "bg-green-900/40 text-green-300 border-green-800"
      : score < 50
      ? "bg-yellow-900/40 text-yellow-300 border-yellow-800"
      : score < 75
      ? "bg-orange-900/40 text-orange-300 border-orange-800"
      : "bg-red-900/40 text-red-300 border-red-800";
  return (
    <div className={`rounded-xl border px-3 py-1.5 text-center ${style}`}>
      <div className="text-2xl font-black">{score}</div>
      <div className="text-[10px] font-bold">{label}</div>
    </div>
  );
}

function RiskCardView({ card }: { card: RiskCard }) {
  return (
    <div className="space-y-4">
      <RiskSection title="Permissions / Admin Risk">
        <RiskRow label="Owner / admin keys" value={card.permissions.hasOwnerKey} invert />
        <RiskRow label="Can mint more supply" value={card.permissions.canMint} invert />
        <RiskRow label="Can pause transfers" value={card.permissions.canPause} invert />
        <RiskRow label="Can upgrade logic" value={card.permissions.canUpgrade} invert />
        <RiskRow label="Has timelocks" value={card.permissions.hasTimelocks} />
        {card.permissions.timelockDelay !== null && (
          <div className="text-xs text-zinc-500">
            Timelock delay: {card.permissions.timelockDelay}s
          </div>
        )}
      </RiskSection>

      <RiskSection title="Token Economics">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-600">Max Supply</p>
            <p className="font-mono text-zinc-200">
              {Number(card.tokenEconomics.maxSupply).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-600">Decimals</p>
            <p className="font-mono text-zinc-200">{card.tokenEconomics.decimals}</p>
          </div>
        </div>
        {card.tokenEconomics.initialDistributionNotes && (
          <p className="text-xs text-zinc-400 mt-1">
            {card.tokenEconomics.initialDistributionNotes}
          </p>
        )}
        {card.tokenEconomics.transferRestrictions && (
          <p className="text-xs text-yellow-400 mt-1">
            ⚠ {card.tokenEconomics.transferRestrictions}
          </p>
        )}
      </RiskSection>

      <RiskSection title="Release Integrity">
        <RiskRow label="Build hash recorded" value={card.releaseIntegrity.buildHashRecorded} />
        {card.releaseIntegrity.contractMatchesArtifact !== null && (
          <RiskRow
            label="Contract matches artifact"
            value={card.releaseIntegrity.contractMatchesArtifact}
          />
        )}
        {card.releaseIntegrity.auditTimestamp && (
          <div className="text-xs text-zinc-500">
            Audited: {new Date(card.releaseIntegrity.auditTimestamp).toLocaleString()}
          </div>
        )}
        {card.releaseIntegrity.auditSummary && (
          <div
            className={`mt-1 text-xs font-semibold ${
              card.releaseIntegrity.auditSummary.startsWith("PASS")
                ? "text-green-400"
                : card.releaseIntegrity.auditSummary.startsWith("WARN")
                ? "text-yellow-400"
                : "text-red-400"
            }`}
          >
            {card.releaseIntegrity.auditSummary}
          </div>
        )}
      </RiskSection>
    </div>
  );
}

function RiskSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function RiskRow({ label, value, invert }: { label: string; value: boolean; invert?: boolean }) {
  const isRisky = invert ? value : !value;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-300">{label}</span>
      <span className={`font-semibold ${isRisky ? "text-red-400" : "text-green-400"}`}>
        {value ? "Yes" : "No"}
      </span>
    </div>
  );
}
