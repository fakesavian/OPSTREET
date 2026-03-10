"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProjectDTO } from "@opfun/shared";
import type { LaunchStatusResponse } from "@/lib/api";
import { launchBuild, fetchLaunchStatus, submitDeploy, poolCreate, poolBroadcast } from "@/lib/api";
import { useWallet } from "./WalletProvider";
import { signInteractionBuffer } from "@/lib/wallet";

const EXPLORER = "https://testnet.opnet.org";

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
  const [launch, setLaunch] = useState<LaunchStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(false);

  // Deploy submit form
  const [deployTx, setDeployTx] = useState("");
  const [contractAddr, setContractAddr] = useState("");

  // Pool creation state
  const [poolCreating, setPoolCreating] = useState(false);

  const launchStatus = launch?.launchStatus ?? project.launchStatus ?? "DRAFT";
  const currentStep = launchStatusToStep(launchStatus);
  const canStartBuild = project.status === "READY" || project.status === "LAUNCHED" || project.status === "DEPLOY_PACKAGE_READY";

  // Fetch launch status on mount + poll when in transitional states
  const refreshLaunchStatus = useCallback(async () => {
    try {
      const data = await fetchLaunchStatus(project.id);
      setLaunch(data);
      return data;
    } catch {
      return null;
    }
  }, [project.id]);

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

  async function handleSubmitDeploy() {
    if (!deployTx || !contractAddr) {
      setError("Fill in both deploy TX and contract address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await submitDeploy(project.id, {
        deployTx,
        contractAddress: contractAddr,
        buildHash: launch?.buildHash ?? undefined,
      });
      await refreshLaunchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy submit failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePool() {
    if (!wallet?.address) {
      setError("Connect your wallet first.");
      return;
    }
    setPoolCreating(true);
    setLoading(true);
    setError("");
    try {
      // Step 1: Backend prepares pool creation interaction buffer
      const intent = await poolCreate(project.id);

      // Step 2: Wallet signs the interaction buffer
      const signed = await signInteractionBuffer(intent.interaction.offlineBufferHex);

      // Step 3: Backend broadcasts the signed transaction
      await poolBroadcast(project.id, {
        interactionTransactionRaw: signed.interactionTransactionRaw,
        fundingTransactionRaw: signed.fundingTransactionRaw,
        poolAddress: intent.poolAddress,
      });

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
    return (
      <div className="op-panel border-opGreen">
        <div className="border-b-2 border-ink/10 px-4 py-3">
          <h2 className="font-black text-ink text-sm uppercase tracking-wider">Token Live</h2>
        </div>
        <div className="p-4 space-y-3">
          <LaunchSteps currentStep={4} />
          {launch?.contractAddress && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Contract</p>
              <p className="font-mono text-xs text-ink mt-0.5 break-all">{launch.contractAddress}</p>
              <a
                href={`${EXPLORER}/contract/${launch.contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-ink hover:text-opYellow"
              >
                View on Explorer
              </a>
            </div>
          )}
          {launch?.poolAddress && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Pool</p>
              <p className="font-mono text-xs text-ink mt-0.5 break-all">{launch.poolAddress}</p>
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
    <div className="op-panel">
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
                Run security checks first — project must be in READY status.
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
              <p className="text-xs font-bold text-ink">Build complete. Sign and broadcast the deploy transaction with your wallet.</p>
              {launch?.buildHash && (
                <p className="mt-1 text-[10px] font-mono text-[var(--text-muted)]">
                  Build hash: {launch.buildHash}
                </p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Deploy TX ID</label>
              <input
                className="mt-1 w-full rounded-lg border-2 border-ink bg-[var(--cream)] px-3 py-2 text-xs font-mono text-ink placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-opYellow"
                placeholder="Enter the deploy transaction ID"
                value={deployTx}
                onChange={(e) => setDeployTx(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">Contract Address</label>
              <input
                className="mt-1 w-full rounded-lg border-2 border-ink bg-[var(--cream)] px-3 py-2 text-xs font-mono text-ink placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-opYellow"
                placeholder="bcrt1p..."
                value={contractAddr}
                onChange={(e) => setContractAddr(e.target.value)}
              />
            </div>
            <button
              onClick={handleSubmitDeploy}
              disabled={loading}
              className="w-full py-3 font-black text-sm rounded-xl border-3 border-ink bg-opGreen text-white shadow-hard-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_#111] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Submit Deploy TX"}
            </button>
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
              disabled={loading || !wallet?.address}
              className="w-full py-3 font-black text-sm rounded-xl border-3 border-ink bg-opGreen text-white shadow-hard-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_#111] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {poolCreating ? "Creating pool..." : loading ? "Preparing..." : "Create Liquidity Pool"}
            </button>
            {!wallet?.address && (
              <p className="text-[10px] text-[var(--text-muted)] text-center">
                Connect your wallet to create the pool.
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
    <div className="flex items-center gap-0">
      {LAUNCH_STEPS.map((s, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <div key={s.label} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-black border-2 transition-colors ${
                  done
                    ? "border-opGreen bg-opGreen/20 text-opGreen"
                    : active
                    ? "border-opYellow bg-opYellow/20 text-ink"
                    : "border-ink/20 text-[var(--text-muted)]"
                }`}
              >
                {done ? "\u2713" : i + 1}
              </div>
              <div>
                <p
                  className={`text-[10px] font-black leading-none ${
                    done ? "text-opGreen" : active ? "text-ink" : "text-[var(--text-muted)]"
                  }`}
                >
                  {s.label}
                </p>
                <p className="text-[8px] text-[var(--text-muted)] leading-tight mt-0.5 hidden sm:block">{s.desc}</p>
              </div>
            </div>
            {i < LAUNCH_STEPS.length - 1 && (
              <div className={`mx-1.5 flex-1 h-0.5 ${i < currentStep ? "bg-opGreen" : "bg-ink/10"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
