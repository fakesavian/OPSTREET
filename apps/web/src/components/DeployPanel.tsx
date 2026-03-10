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

  type DeployStep = 0 | 1 | 2;
  const deployStep: DeployStep = isLaunched
    ? 2
    : phase === "manual" && (contractAddress || deployTx)
    ? 2
    : phase === "manual"
    ? 1
    : 0;

  if (isLaunched) {
    return (
      <div className="op-panel border-opGreen bg-opGreen/10">
        <div className="px-5 py-4 border-b-2 border-ink/10">
          <h2 className="font-black text-ink mb-1">Deployed to Testnet</h2>
        </div>
        <div className="p-5 space-y-3 text-sm">
          {project.contractAddress && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Contract Address</p>
              <p className="font-mono text-opGreen text-xs mt-0.5 break-all">
                {project.contractAddress}
              </p>
              <a
                href={`${EXPLORER}/contract/${project.contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-ink hover:text-opGreen transition-colors"
              >
                View on OPNet Testnet Explorer ↗
              </a>
            </div>
          )}
          {project.deployTx && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Deploy TX</p>
              <p className="font-mono text-[var(--text-muted)] text-xs mt-0.5 break-all">{project.deployTx}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="op-panel">
      <div className="px-5 py-4 border-b-2 border-ink/10">
        <h2 className="font-black text-ink mb-0.5">Deploy to Testnet</h2>
        <p className="text-xs text-[var(--text-muted)]">
          Admin-gated · OPNet Testnet only · Generates a complete deploy package
        </p>
      </div>

      <div className="p-5 space-y-4">
        <DeploySteps currentStep={deployStep} />

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
          <div className="flex items-center gap-3 py-4">
            <span className="h-3 w-3 rounded-full bg-opYellow border-2 border-ink animate-pulse" />
            <span className="text-sm text-ink font-bold">Scaffolding deploy package and compiling contract…</span>
          </div>
        )}

        {phase === "manual" && (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-ink bg-[var(--cream)] p-4">
              <p className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Deploy Instructions
              </p>
              <pre className="text-xs text-ink whitespace-pre-wrap leading-relaxed font-mono">
                {instructions || "Deploy package ready. See packages/opnet/generated/ for files."}
              </pre>
            </div>

            <div className="rounded-xl border-2 border-opGreen/30 bg-opGreen/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-ink">
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
          <div className="mt-4 space-y-3 rounded-xl border-2 border-ink bg-[var(--cream)] p-4">
            <p className="text-sm font-semibold text-ink">Confirm existing deployment</p>
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
          <p className="text-sm text-[var(--text-muted)]">
            {project.status === "DRAFT"
              ? "Run security checks first before deploying."
              : project.status === "CHECKING"
              ? "Checks in progress…"
              : `Status '${project.status}' — cannot deploy right now.`}
          </p>
        )}

        {error && (
          <div className="mt-3 rounded-xl border-2 border-opRed bg-opRed/5 px-4 py-3 text-sm text-opRed">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// 3-step deploy progress indicator
const DEPLOY_STEPS = [
  { label: "Package", desc: "Generate deploy package" },
  { label: "Deploy", desc: "Run deploy.ts script" },
  { label: "Confirm", desc: "Submit contract address" },
] as const;

function DeploySteps({ currentStep }: { currentStep: 0 | 1 | 2 }) {
  return (
    <div className="flex items-center gap-0 mb-1">
      {DEPLOY_STEPS.map((s, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <div key={s.label} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black border-2 transition-colors ${
                  done
                    ? "border-opGreen bg-opGreen/20 text-opGreen"
                    : active
                    ? "border-opYellow bg-opYellow/20 text-ink"
                    : "border-ink/30 text-[var(--text-muted)]"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <div>
                <p
                  className={`text-[11px] font-black leading-none ${
                    done ? "text-opGreen" : active ? "text-ink" : "text-[var(--text-muted)]"
                  }`}
                >
                  {s.label}
                </p>
                <p className="text-[9px] text-[var(--text-muted)] leading-tight mt-0.5">{s.desc}</p>
              </div>
            </div>
            {i < DEPLOY_STEPS.length - 1 && (
              <div className={`mx-2 flex-1 h-0.5 ${i < currentStep ? "bg-opGreen" : "bg-ink/10"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

async function pollForInstructions(projectId: string, adminSecret: string): Promise<string> {
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
