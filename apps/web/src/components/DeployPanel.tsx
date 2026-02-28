"use client";

import { useState } from "react";
import type { ProjectDTO } from "@opfun/shared";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
const EXPLORER = "https://testnet.opnet.org";

interface DeployPanelProps {
  project: ProjectDTO & { checkRuns: unknown[] };
  onStatusChange: (newStatus: string, updates?: Partial<ProjectDTO>) => void;
}

export function DeployPanel({ project, onStatusChange }: DeployPanelProps) {
  const [adminSecret, setAdminSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"idle" | "scaffolding" | "done" | "manual">("idle");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState("");

  // Confirm-deploy state
  const [showConfirm, setShowConfirm] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [deployTx, setDeployTx] = useState("");
  const [confirming, setConfirming] = useState(false);

  const canDeploy = project.status === "READY" || project.status === "DEPLOY_PACKAGE_READY";
  const isLaunched = project.status === "LAUNCHED";

  async function triggerDeploy() {
    if (!adminSecret) { setError("Enter your admin secret first."); return; }
    setLoading(true); setError(""); setPhase("scaffolding");
    try {
      const res = await fetch(`${API}/projects/${project.id}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
      });
      if (!res.ok && res.status !== 202) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      // Poll for completion
      onStatusChange("CHECKING");
      setPhase("done");
      const instr = await pollForInstructions(project.id, adminSecret);
      setInstructions(instr);
      setPhase("manual");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
      setPhase("idle");
    } finally {
      setLoading(false);
    }
  }

  async function confirmDeploy() {
    if (!contractAddress || !deployTx) { setError("Fill in both contract address and deploy TX."); return; }
    if (!adminSecret) { setError("Admin secret required."); return; }
    setConfirming(true); setError("");
    try {
      const res = await fetch(`${API}/projects/${project.id}/confirm-deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": adminSecret },
        body: JSON.stringify({ contractAddress, deployTx }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      onStatusChange("LAUNCHED", { contractAddress, deployTx });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setConfirming(false);
    }
  }

  if (isLaunched) {
    return (
      <div className="card border-green-900/50 bg-green-950/20">
        <h2 className="font-bold text-white mb-3">Deployed to Testnet</h2>
        <div className="space-y-2 text-sm">
          {project.contractAddress && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Contract Address</p>
              <p className="font-mono text-green-300 text-xs mt-0.5 break-all">
                {project.contractAddress}
              </p>
              <a
                href={`${EXPLORER}/contract/${project.contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
              >
                View on OPNet Testnet Explorer ↗
              </a>
            </div>
          )}
          {project.deployTx && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Deploy TX</p>
              <p className="font-mono text-zinc-400 text-xs mt-0.5 break-all">{project.deployTx}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="font-bold text-white mb-1">Deploy to Testnet</h2>
      <p className="text-xs text-zinc-500 mb-4">
        Admin-gated · OPNet Testnet only · Generates a complete deploy package
      </p>

      {phase === "idle" && canDeploy && (
        <div className="space-y-3">
          <div>
            <label className="label">Admin Secret</label>
            <input
              type="password"
              className="input"
              placeholder="Enter admin secret (ADMIN_SECRET env var)"
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
            />
          </div>
          <button onClick={triggerDeploy} disabled={loading} className="btn-primary w-full">
            Generate Deploy Package →
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            className="btn-secondary w-full text-sm"
          >
            Already deployed? Confirm address manually
          </button>
        </div>
      )}

      {phase === "scaffolding" && (
        <div className="flex items-center gap-3 py-4 text-sm text-zinc-400">
          <span className="h-3 w-3 rounded-full bg-brand-500 animate-pulse" />
          Scaffolding deploy package and compiling contract…
        </div>
      )}

      {phase === "manual" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
              Deploy Instructions
            </p>
            <pre className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed font-mono">
              {instructions || "Deploy package ready. See packages/opnet/generated/ for files."}
            </pre>
          </div>

          <div className="rounded-xl border border-brand-900/50 bg-brand-950/20 p-4 space-y-3">
            <p className="text-sm font-semibold text-zinc-200">
              After running the deploy script, confirm the result:
            </p>
            <div>
              <label className="label">Contract Address</label>
              <input
                className="input font-mono"
                placeholder="bcrt1p..."
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Deploy TX ID</label>
              <input
                className="input font-mono"
                placeholder="txid..."
                value={deployTx}
                onChange={(e) => setDeployTx(e.target.value)}
              />
            </div>
            <button
              onClick={confirmDeploy}
              disabled={confirming}
              className="btn-primary w-full"
            >
              {confirming ? "Confirming…" : "Confirm Deployment →"}
            </button>
          </div>
        </div>
      )}

      {/* Manual confirm overlay (before triggering scaffold) */}
      {showConfirm && phase === "idle" && (
        <div className="mt-4 space-y-3 rounded-xl border border-zinc-700 bg-zinc-900/50 p-4">
          <p className="text-sm font-semibold text-zinc-200">Confirm existing deployment</p>
          <div>
            <label className="label">Admin Secret</label>
            <input type="password" className="input" placeholder="Admin secret"
              value={adminSecret} onChange={(e) => setAdminSecret(e.target.value)} />
          </div>
          <div>
            <label className="label">Contract Address</label>
            <input className="input font-mono" placeholder="bcrt1p..."
              value={contractAddress} onChange={(e) => setContractAddress(e.target.value)} />
          </div>
          <div>
            <label className="label">Deploy TX ID</label>
            <input className="input font-mono" placeholder="txid..."
              value={deployTx} onChange={(e) => setDeployTx(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={confirmDeploy} disabled={confirming} className="btn-primary flex-1">
              {confirming ? "Confirming…" : "Confirm"}
            </button>
            <button onClick={() => setShowConfirm(false)} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      )}

      {!canDeploy && !isLaunched && (
        <p className="text-sm text-zinc-500">
          {project.status === "DRAFT"
            ? "Run security checks first before deploying."
            : project.status === "CHECKING"
            ? "Checks in progress…"
            : `Status '${project.status}' — cannot deploy right now.`}
        </p>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

async function pollForInstructions(projectId: string, adminSecret: string): Promise<string> {
  // Poll until not CHECKING, then fetch deploy-package for instructions
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(`${API}/projects/${projectId}/deploy-package`, {
        headers: { "X-Admin-Secret": adminSecret },
      });
      if (res.ok) {
        const data = (await res.json()) as { instructions?: string };
        if (data.instructions) return data.instructions;
      }
    } catch { /* ignore */ }
  }
  return "See packages/opnet/generated/ for the deploy package and DEPLOY.md for instructions.";
}
