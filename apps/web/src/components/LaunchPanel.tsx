"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProjectDTO } from "@opfun/shared";
import type { LaunchStatusResponse } from "@/lib/api";
import {
  launchBuild,
  fetchLaunchStatus,
  fetchDeployIntent,
  fetchPoolCreateIntent,
  submitDeploy,
  submitPool,
} from "@/lib/api";
import { getOpScanContractUrl, getOpScanHomeUrl } from "@/lib/opscan";
import { useWallet } from "./WalletProvider";
import { signOpnetInteractionWithWallet, submitOpnetDeploymentWithWallet } from "@/lib/wallet";
import { usePendingTx } from "@/context/PendingTxContext";

interface LaunchPanelProps {
  project: ProjectDTO;
  onStatusChange: (newStatus: string, updates?: Partial<ProjectDTO>) => void;
}

type LaunchStep = 0 | 1 | 2 | 3 | 4;

const LAUNCH_STEPS = [
  { label: "Build", desc: "Compile contract artifact" },
  { label: "Sign Deploy", desc: "Sign with your wallet" },
  { label: "Confirm Deploy", desc: "On-chain confirmation" },
  { label: "Sign Pool", desc: "Create liquidity pool" },
  { label: "Live", desc: "Token is live" },
] as const;

function launchStatusToStep(ls: string): LaunchStep {
  switch (ls) {
    case "DRAFT":
    case "FAILED":
      return 0;
    case "BUILDING":
      return 0;
    case "AWAITING_WALLET_DEPLOY":
      return 1;
    case "DEPLOY_SUBMITTED":
      return 2;
    case "DEPLOY_CONFIRMED":
    case "AWAITING_POOL_CREATE":
      return 3;
    case "POOL_SUBMITTED":
      return 3;
    case "LIVE":
      return 4;
    default:
      return 0;
  }
}

export function LaunchPanel({ project, onStatusChange }: LaunchPanelProps) {
  const { wallet } = useWallet();
  const { setPendingTx } = usePendingTx();
  const [launch, setLaunch] = useState<LaunchStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(false);

  // Deploy signing state (auto-filled from OP_WALLET result; no manual form)
  const [deployTx, setDeployTx] = useState("");
  const [contractAddr, setContractAddr] = useState("");

  // Pool creation state
  const [poolCreating, setPoolCreating] = useState(false);

  const launchStatus = launch?.launchStatus ?? project.launchStatus ?? "DRAFT";
  const currentStep = launchStatusToStep(launchStatus);
  const canStartBuild =
    project.status === "DRAFT" ||
    project.status === "CHECKING" ||
    project.status === "READY" ||
    project.status === "FLAGGED" ||
    project.status === "LAUNCHED" ||
    project.status === "DEPLOY_PACKAGE_READY";

  const applyLaunchStatusToPage = useCallback((data: LaunchStatusResponse) => {
    const nextLaunchStatus = data.launchStatus as ProjectDTO["launchStatus"];
    onStatusChange(data.status, {
      launchStatus: nextLaunchStatus,
      launchError: nextLaunchStatus === "FAILED" ? data.launchError : null,
      contractAddress: data.contractAddress,
      deployTx: data.deployTx,
      buildHash: data.buildHash,
      poolAddress: data.poolAddress,
      poolBaseToken: data.poolBaseToken,
      poolTx: data.poolTx,
      liveAt: data.liveAt,
    });
  }, [onStatusChange]);

  // Fetch launch status on mount + poll when in transitional states. Keep the
  // parent project card/header in sync too; otherwise the page can keep showing
  // a stale BUILDING state while this panel has already advanced.
  const refreshLaunchStatus = useCallback(async () => {
    try {
      const data = await fetchLaunchStatus(project.id);
      setLaunch(data);
      applyLaunchStatusToPage(data);
      return data;
    } catch {
      return null;
    }
  }, [applyLaunchStatusToPage, project.id]);

  useEffect(() => {
    refreshLaunchStatus();
  }, [refreshLaunchStatus]);

  // Poll during BUILDING or DEPLOY_SUBMITTED or POOL_SUBMITTED
  useEffect(() => {
    const needsPoll =
      launchStatus === "BUILDING" ||
      launchStatus === "DEPLOY_SUBMITTED" ||
      launchStatus === "POOL_SUBMITTED";
    if (!needsPoll) {
      setPolling(false);
      return;
    }
    setPolling(true);
    const id = setInterval(async () => {
      const data = await refreshLaunchStatus();
      if (data && data.launchStatus !== launchStatus) {
        // Status changed — stop polling
        setPolling(false);
        if (data.launchStatus === "LIVE") {
          onStatusChange("LAUNCHED", {
            contractAddress: data.contractAddress ?? undefined,
            deployTx: data.deployTx ?? undefined,
          });
        }
      }
    }, 3000);
    return () => clearInterval(id);
  }, [launchStatus, refreshLaunchStatus, onStatusChange]);

  async function handleStartBuild() {
    if (!wallet?.address) {
      setError("Connect your wallet first.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await launchBuild(project.id);
      await refreshLaunchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Build failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignDeploy() {
    if (!wallet?.address) {
      setError("Connect your wallet first.");
      return;
    }
    if (wallet.provider !== "opnet") {
      setError("Use OP_WALLET to sign and broadcast the deploy transaction in-app.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const intent = await fetchDeployIntent(project.id);
      const deployed = await submitOpnetDeploymentWithWallet(wallet.provider, intent);
      if (!deployed) throw new Error("OP_WALLET did not sign the deploy transaction.");

      setDeployTx(deployed.deployTx);
      setContractAddr(deployed.contractAddress);

      await submitDeploy(project.id, {
        deployTx: deployed.deployTx,
        contractAddress: deployed.contractAddress,
        buildHash: intent.buildHash ?? launch?.buildHash ?? undefined,
      });
      setPendingTx(deployed.deployTx);
      await refreshLaunchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy signing failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePool() {
    if (!wallet?.address) {
      setError("Connect your wallet first.");
      return;
    }
    if (wallet.provider !== "opnet") {
      setError("Use OP_WALLET to create the pool in-app.");
      return;
    }
    setPoolCreating(true);
    setLoading(true);
    setError("");
    try {
      const intent = await fetchPoolCreateIntent(project.id);
      const signed = await signOpnetInteractionWithWallet(wallet.provider, intent.interaction);
      const updated = await submitPool(project.id, {
        poolAddress: intent.poolAddress,
        poolBaseToken: intent.poolBaseToken,
        signedFundingTxHex: signed.signedFundingTxHex ?? undefined,
        signedInteractionTxHex: signed.signedInteractionTxHex,
      });

      if (updated.poolTx) setPendingTx(updated.poolTx);

      await refreshLaunchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pool creation failed");
    } finally {
      setPoolCreating(false);
      setLoading(false);
    }
  }

  // ── LIVE state ──
  if (launchStatus === "LIVE") {
    const contractUrl = getOpScanContractUrl(launch?.contractAddress);
    const poolUrl = getOpScanContractUrl(launch?.poolAddress);
    return (
      <div id="launch-pipeline" tabIndex={-1} className="op-panel border-opGreen scroll-mt-36 focus:outline-none focus:ring-4 focus:ring-opYellow/40">
        <div className="border-b-2 border-ink/10 px-4 py-3">
          <h2 className="font-black text-ink text-sm uppercase tracking-wider">Token Live</h2>
        </div>
        <div className="p-4 space-y-3">
          <LaunchSteps currentStep={4} />
          {launch?.contractAddress && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Contract</p>
              <p className="font-mono text-xs text-ink mt-0.5 break-all">{launch.contractAddress}</p>
              {contractUrl && (
                <a
                  href={contractUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-ink hover:text-opYellow"
                >
                  View on OP_SCAN
                </a>
              )}
            </div>
          )}
          {launch?.poolAddress && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Pool</p>
              <p className="font-mono text-xs text-ink mt-0.5 break-all">{launch.poolAddress}</p>
              {poolUrl && (
                <a
                  href={poolUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-ink hover:text-opYellow"
                >
                  View pool on OP_SCAN
                </a>
              )}
            </div>
          )}
          {launch?.liveAt && (
            <p className="text-[10px] text-[var(--text-muted)]">
              Live since {new Date(launch.liveAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id="launch-pipeline" tabIndex={-1} className="op-panel scroll-mt-36 focus:outline-none focus:ring-4 focus:ring-opYellow/40">
      <div className="border-b-2 border-ink/10 px-4 py-3">
        <h2 className="font-black text-ink text-sm uppercase tracking-wider">Launch Pipeline</h2>
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
          Wallet-native deploy — your wallet signs all transactions
        </p>
      </div>

      <div className="p-4 space-y-4">
        <LaunchSteps currentStep={currentStep} />

        {/* DRAFT / FAILED — Start Build */}
        {(launchStatus === "DRAFT" || launchStatus === "FAILED") && (
          <div className="space-y-3">
            {launchStatus === "FAILED" && launch?.launchError && (
              <div className="rounded-xl border-2 border-opRed bg-opRed/5 px-3 py-2 text-xs text-opRed">
                Last error: {launch.launchError}
              </div>
            )}
            {!canStartBuild && (
              <p className="text-xs text-[var(--text-muted)]">
                Launch is unavailable from this project status.
              </p>
            )}
            {canStartBuild && (
              <button
                onClick={handleStartBuild}
                disabled={loading || !wallet?.address}
                className="w-full py-3 font-black text-sm rounded-xl border-3 border-ink bg-opYellow text-ink shadow-hard-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_#111] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Starting build..." : launchStatus === "FAILED" ? "Retry Build" : "Start Build"}
              </button>
            )}
            {!wallet?.address && canStartBuild && (
              <p className="text-[10px] text-[var(--text-muted)] text-center">
                Connect your wallet to start the launch pipeline.
              </p>
            )}
          </div>
        )}

        {/* BUILDING — Wait */}
        {launchStatus === "BUILDING" && (
          <div className="flex items-center gap-3 py-4">
            <span className="h-3 w-3 rounded-full bg-opYellow animate-pulse" />
            <span className="text-sm text-ink font-bold">Compiling contract artifact...</span>
          </div>
        )}

        {/* AWAITING_WALLET_DEPLOY — Sign Deploy */}
        {launchStatus === "AWAITING_WALLET_DEPLOY" && (
          <div className="space-y-3">
            <div className="rounded-xl border-2 border-ink bg-opYellow/10 px-3 py-2">
              <p className="text-xs font-bold text-ink">Build complete. OP_WALLET will sign, broadcast, and submit the deploy details automatically.</p>
              {launch?.buildHash && (
                <p className="mt-1 text-[10px] font-mono text-[var(--text-muted)]">
                  Build hash: {launch.buildHash}
                </p>
              )}
            </div>
            {(deployTx || contractAddr) && (
              <div className="rounded-xl border-2 border-ink/20 bg-[var(--cream)] px-3 py-2 space-y-2">
                {deployTx && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Deploy TX ID</p>
                    <p className="font-mono text-[10px] text-ink break-all">{deployTx}</p>
                  </div>
                )}
                {contractAddr && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Contract Address</p>
                    <p className="font-mono text-[10px] text-ink break-all">{contractAddr}</p>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={handleSignDeploy}
              disabled={loading || !wallet?.address || wallet.provider !== "opnet"}
              className="w-full py-3 font-black text-sm rounded-xl border-3 border-ink bg-opGreen text-white shadow-hard-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_#111] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all disabled:opacity-50"
            >
              {loading ? "Signing deploy..." : "Sign & Submit Deploy"}
            </button>
            {wallet?.address && wallet.provider !== "opnet" && (
              <p className="text-[10px] text-[var(--text-muted)] text-center">
                Switch to OP_WALLET to sign and submit deploy automatically.
              </p>
            )}
          </div>
        )}

        {/* DEPLOY_SUBMITTED — Waiting for on-chain confirmation */}
        {launchStatus === "DEPLOY_SUBMITTED" && (
          <div className="flex items-center gap-3 py-4">
            <span className="h-3 w-3 rounded-full bg-opYellow animate-pulse" />
            <div>
              <p className="text-sm text-ink font-bold">Waiting for deploy confirmation...</p>
              <p className="text-[10px] text-[var(--text-muted)]">
                The watcher is monitoring the blockchain for your deploy TX.
              </p>
            </div>
          </div>
        )}

        {/* DEPLOY_CONFIRMED / AWAITING_POOL_CREATE — Create Pool */}
        {(launchStatus === "DEPLOY_CONFIRMED" || launchStatus === "AWAITING_POOL_CREATE") && (
          <div className="space-y-3">
            <div className="rounded-xl border-2 border-ink bg-opGreen/10 px-3 py-2">
              <p className="text-xs font-bold text-ink">Deploy confirmed. Create a Motoswap liquidity pool to enable trading.</p>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                Your wallet will sign the pool creation transaction. The backend simulates the interaction, your wallet signs it, and the app broadcasts the result.
              </p>
            </div>

            <button
              onClick={handleCreatePool}
              disabled={loading || !wallet?.address || wallet.provider !== "opnet"}
              className="w-full py-3 font-black text-sm rounded-xl border-3 border-ink bg-opGreen text-white shadow-hard-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_#111] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {poolCreating ? "Creating pool..." : loading ? "Preparing..." : "Create Liquidity Pool"}
            </button>
            {!wallet?.address && (
              <p className="text-[10px] text-[var(--text-muted)] text-center">
                Connect your wallet to create the pool.
              </p>
            )}
            {wallet?.address && wallet.provider !== "opnet" && (
              <p className="text-[10px] text-[var(--text-muted)] text-center">
                OP_WALLET is required for the pool creation transaction.
              </p>
            )}
          </div>
        )}

        {/* POOL_SUBMITTED — Waiting for pool confirmation */}
        {launchStatus === "POOL_SUBMITTED" && (
          <div className="flex items-center gap-3 py-4">
            <span className="h-3 w-3 rounded-full bg-opGreen animate-pulse" />
            <div>
              <p className="text-sm text-ink font-bold">Waiting for pool confirmation...</p>
              <p className="text-[10px] text-[var(--text-muted)]">
                Almost there — watcher is confirming your pool on-chain.
              </p>
              <a
                href={getOpScanHomeUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-ink hover:text-opYellow"
              >
                Open OP_SCAN
              </a>
            </div>
          </div>
        )}

        {polling && (
          <p className="text-[10px] text-center text-[var(--text-muted)]">
            Auto-refreshing every 3s...
          </p>
        )}

        {error && (
          <div className="rounded-xl border-2 border-opRed bg-opRed/5 px-3 py-2 text-xs text-opRed">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Launch step indicator ──

function LaunchSteps({ currentStep }: { currentStep: LaunchStep }) {
  return (
    <div className="grid gap-2">
      {LAUNCH_STEPS.map((s, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        const statusLabel = done ? "Done" : active ? "Now" : "Next";
        return (
          <div
            key={s.label}
            className={`min-w-0 rounded-xl border-2 px-2.5 py-2 transition-colors ${
              done
                ? "border-opGreen bg-opGreen/10"
                : active
                  ? "border-opYellow bg-opYellow/15"
                  : "border-ink/15 bg-[var(--cream)]/60"
            }`}
          >
            <div className="flex min-w-0 items-start gap-2">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-black ${
                  done
                    ? "border-opGreen bg-opGreen/20 text-opGreen"
                    : active
                      ? "border-opYellow bg-opYellow/30 text-ink"
                      : "border-ink/20 text-[var(--text-muted)]"
                }`}
              >
                {done ? "\u2713" : i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p
                    className={`min-w-0 text-[11px] font-black leading-tight ${
                      done ? "text-opGreen" : active ? "text-ink" : "text-[var(--text-muted)]"
                    }`}
                  >
                    {s.label}
                  </p>
                  <span className="shrink-0 rounded-full border border-ink/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-[var(--text-muted)]">
                    {statusLabel}
                  </span>
                </div>
                <p className="mt-0.5 break-words text-[9px] leading-snug text-[var(--text-muted)]">{s.desc}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
