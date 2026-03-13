"use client";

import { useEffect, useState } from "react";
import { fetchBlockStatus, type BlockStatus } from "@/lib/api";

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
            setCountdown(data.nextBlockEstimateMs > 0 ? Math.floor(data.nextBlockEstimateMs / 1000) : null);
            setLastPollOk(true);
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
  const networkTitle = lastPollOk
    ? "OPNET testnet reachable. Badge reflects the latest successful poll."
    : status
      ? "Latest OPNET status poll failed. Showing the last known block height."
      : "OPNET status is currently unavailable.";
  const timerTitle =
    countdown === null
      ? "Next block estimate is unavailable from upstream."
      : "Estimated time until the next OPNET block.";

  return (
    <div className="block-timer-bar flex h-9 items-center justify-between px-4">
      <div className="mx-auto flex max-w-6xl w-full items-center justify-between">
        {/* Left: network indicator */}
        <div className="flex items-center gap-2" title={networkTitle}>
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md border-2 border-ink ${lastPollOk ? "bg-opGreen" : "bg-gray-400"}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${lastPollOk ? "bg-white animate-pulse-dot" : "bg-gray-200"}`} />
          </span>
          <span className="hidden sm:inline font-black tracking-widest uppercase text-[10px] text-ink">
            OPNET TESTNET
          </span>
          <span className="sm:hidden font-black text-[10px] text-ink">OPNET</span>
        </div>

        {/* Center: block height */}
        <div className="flex items-center gap-1.5">
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
