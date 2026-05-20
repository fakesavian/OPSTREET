"use client";

import { useEffect, useState } from "react";
import { fetchBlockStatus, type BlockStatus } from "@/lib/api";

type NetworkKind = "mainnet" | "testnet" | "unknown";

function getOpnetNetworkKind(network?: string): NetworkKind {
  const normalized = (network ?? "opnet-testnet").toLowerCase();
  if (normalized.includes("mainnet")) return "mainnet";
  if (normalized.includes("testnet")) return "testnet";
  return "unknown";
}

function formatOpnetNetworkLabel(network?: string): string {
  const kind = getOpnetNetworkKind(network);
  if (kind === "mainnet") return "OPNET MAINNET";
  if (kind === "testnet") return "OPNET TESTNET";
  return (network ?? "opnet-testnet").replace(/[-_]+/g, " ").toUpperCase();
}

function getNetworkBadgeClass(kind: NetworkKind, connected: boolean): string {
  if (!connected) return "bg-opRed";
  if (kind === "mainnet" || kind === "testnet") return "bg-opGreen";
  return "bg-opYellow";
}

function getNetworkTextClass(kind: NetworkKind, connected: boolean): string {
  if (!connected) return "bg-opRed text-white";
  if (kind === "mainnet" || kind === "testnet") return "bg-opGreen text-ink";
  return "bg-opYellow text-ink";
}

export function BlockTimerBar() {
  const [status, setStatus] = useState<BlockStatus | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [lastPollOk, setLastPollOk] = useState(false);

  useEffect(() => {
    let mounted = true;

    const poll = () => {
      fetchBlockStatus()
        .then((data) => {
          if (mounted) {
            setStatus(data);
            // Green means connected to the configured OP_NET RPC and receiving
            // block heights. Red means the API returned a degraded/offline poll.
            const healthy = !data.degraded && data.blockHeight > 0;
            setLastPollOk(healthy);
            setCountdown(healthy && data.nextBlockEstimateMs > 0 ? Math.floor(data.nextBlockEstimateMs / 1000) : null);
          }
        })
        .catch(() => {
          if (mounted) {
            setCountdown(null);
            setLastPollOk(false);
          }
        });
    };

    poll();
    const id = setInterval(poll, 10_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c === null || c <= 1) return null;
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const timerLabel =
    countdown === null
      ? "--:--"
      : `${String(Math.floor(countdown / 60)).padStart(2, "0")}:${String(countdown % 60).padStart(2, "0")}`;
  const networkLabel = formatOpnetNetworkLabel(status?.network);
  const networkKind = getOpnetNetworkKind(status?.network);
  const networkTitle = lastPollOk
    ? `${networkLabel} reachable via configured OP_NET RPC. Green indicates an active connection; the text label distinguishes mainnet from testnet.`
    : status
      ? `${networkLabel} status poll failed. Showing the last known block height.`
      : "OPNET status is currently unavailable.";
  const blockTitle = status
    ? `Latest ${networkLabel} block height from OP_NET RPC.`
    : "Latest OP_NET block height is loading.";
  const timerTitle =
    countdown === null
      ? "Next block estimate is unavailable from upstream; the timer stays visible because block timing is required status information."
      : `Estimated time until the next ${networkLabel} block.`;
  const badgeClass = getNetworkBadgeClass(networkKind, lastPollOk);
  const networkTextClass = getNetworkTextClass(networkKind, lastPollOk);

  return (
    <div className="block-timer-bar flex h-9 items-center justify-between px-4">
      <div className="mx-auto flex max-w-6xl w-full items-center justify-between">
        {/* Left: network indicator */}
        <div className="flex items-center gap-2" title={networkTitle}>
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md border-2 border-ink ${badgeClass}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full bg-white ${lastPollOk ? "animate-pulse-dot" : ""}`} />
          </span>
          <span className={`inline-flex h-5 items-center rounded-md border-2 border-ink px-2 font-black tracking-widest uppercase text-[10px] ${networkTextClass}`}>
            {networkLabel}
          </span>
        </div>

        {/* Center: block height */}
        <div className="flex items-center gap-1.5" title={blockTitle}>
          <span className="inline-flex h-5 items-center gap-1.5 rounded-md border-2 border-ink bg-opYellow px-2">
            <svg viewBox="0 0 16 16" className="h-3 w-3 text-ink" fill="currentColor">
              <rect x="3" y="3" width="10" height="10" rx="2" />
            </svg>
            <span className="font-mono text-[11px] font-black text-ink">
              {status ? `#${status.blockHeight.toLocaleString()}` : "---"}
            </span>
          </span>
        </div>

        {/* Right: countdown timer */}
        <div className="flex items-center gap-1.5" title={timerTitle}>
          <span className="inline-flex h-5 items-center gap-1.5 rounded-md border-2 border-ink bg-white px-2">
            <svg viewBox="0 0 16 16" className="h-3 w-3 text-ink" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="8" cy="8" r="5.5" />
              <path d="M8 4.5v3.5l2 1.5" strokeLinecap="round" />
            </svg>
            <span className="font-mono text-[11px] font-black text-ink">
              {timerLabel}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
