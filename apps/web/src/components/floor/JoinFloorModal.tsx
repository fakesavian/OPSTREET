"use client";

import { useEffect, useState } from "react";

interface Props {
  walletAddress: string;
  initialDisplayName?: string;
  onJoin: (displayName: string) => Promise<void>;
  onClose: () => void;
}

export function JoinFloorModal({ walletAddress, initialDisplayName, onJoin, onClose }: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName?.trim() || walletAddress.slice(0, 8));
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDisplayName(initialDisplayName?.trim() || walletAddress.slice(0, 8));
  }, [initialDisplayName, walletAddress]);

  async function handleJoin() {
    const name = displayName.trim();
    if (!name) {
      setError("Display name is required.");
      return;
    }

    setJoining(true);
    setError("");
    try {
      await onJoin(name);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to join. Try again.";
      if (msg.includes("401") || msg.includes("Authentication") || msg.includes("auth")) {
        setError("Connect and verify your wallet first to enter the floor.");
      } else {
        setError(msg);
      }
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-sm op-panel p-6 flex flex-col gap-4">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-[var(--text-muted)] hover:text-ink text-lg font-black leading-none"
          aria-label="Close"
        >
          X
        </button>

        <div>
          <h2 className="text-xl font-black text-ink">Enter the Floor</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Your sprite is controlled from Profile. Set your display name to join.
          </p>
        </div>

        <div>
          <label className="label">Display Name (max 18 chars)</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 18))}
            placeholder="Enter a name..."
            className="input w-full text-sm"
            autoFocus
          />
        </div>

        {error && (
          <div className="rounded-xl border-2 border-opRed bg-opRed/10 px-3 py-2 text-xs font-bold text-opRed">
            {error}
          </div>
        )}

        <button
          onClick={() => void handleJoin()}
          disabled={joining || !displayName.trim()}
          className="op-btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {joining ? "Joining..." : "Enter the Floor"}
        </button>
      </div>
    </div>
  );
}

