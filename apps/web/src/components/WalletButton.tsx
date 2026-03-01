"use client";

import { useState } from "react";
import { useWallet } from "./WalletProvider";
import { truncateAddress } from "@/lib/wallet";

/**
 * WalletButton — connect / disconnect UI for Unisat / OKX Bitcoin wallets.
 * variant="default"  → compact header button with dropdown
 * variant="mobile"   → full-width block for the mobile nav drawer
 */
export function WalletButton({ variant = "default" }: { variant?: "default" | "mobile" }) {
  const { wallet, connecting, connectError, connect, disconnect } = useWallet();
  const [showMenu, setShowMenu] = useState(false);

  // ── Connected ─────────────────────────────────────────────────────────────
  if (wallet) {
    if (variant === "mobile") {
      return (
        <div className="rounded-xl border border-green-800/50 bg-green-950/20 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-wider text-zinc-500 mb-0.5">
                Connected via {wallet.provider}
              </p>
              <p className="font-mono text-xs text-green-300 truncate">{wallet.address}</p>
            </div>
            <button
              onClick={disconnect}
              className="text-xs text-red-400 hover:text-red-300 font-semibold shrink-0"
            >
              Disconnect
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu((v) => !v)}
          className="btn-secondary text-xs px-3 py-2 flex items-center gap-2"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />
          <span className="font-mono">{truncateAddress(wallet.address)}</span>
        </button>

        {showMenu && (
          <>
            {/* Backdrop to close menu */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowMenu(false)}
              aria-hidden="true"
            />
            <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-xl border-2 border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1">
                  Connected via {wallet.provider}
                </p>
                <p className="font-mono text-xs text-zinc-300 break-all leading-relaxed">
                  {wallet.address}
                </p>
              </div>
              <button
                onClick={() => { disconnect(); setShowMenu(false); }}
                className="w-full text-left px-4 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-950/30 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Not connected ─────────────────────────────────────────────────────────
  if (variant === "mobile") {
    return (
      <div className="space-y-1.5">
        <button
          onClick={connect}
          disabled={connecting}
          className="btn-primary w-full text-center py-3"
        >
          {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
        {connectError && (
          <p className="text-xs text-red-400 leading-tight">{connectError}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={connect}
        disabled={connecting}
        className="btn-secondary text-xs px-4 py-2"
      >
        {connecting ? "Connecting…" : "Connect Wallet"}
      </button>
      {connectError && (
        <p className="text-[10px] text-red-400 max-w-[180px] text-right leading-tight">
          {connectError}
        </p>
      )}
    </div>
  );
}
