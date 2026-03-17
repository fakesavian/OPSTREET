"use client";

import { useState } from "react";
import { useWallet } from "./WalletProvider";
import { truncateAddress } from "@/lib/wallet";

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M16 12h.01" />
      <path d="M3 9h18" />
    </svg>
  );
}

export function WalletButton({ variant = "default" }: { variant?: "default" | "mobile" }) {
  const {
    wallet,
    connecting,
    connectError,
    connect,
    connectManual,
    disconnect,
    verifying,
    verifyError,
    verify,
    isVerified,
  } = useWallet();

  const [showMenu, setShowMenu] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const verificationIssue = null; // walletAddress is now always the P2TR BTC address — no conversion needed

  async function handleVerifyClick() {
    const ok = await verify();
    if (ok) setShowMenu(false);
  }

  function handleManualSubmit() {
    const addr = manualAddress.trim();
    if (!addr) return;
    connectManual(addr);
    setManualAddress("");
    setShowManual(false);
  }

  if (wallet) {
    if (variant === "mobile") {
      return (
        <div className="op-panel px-4 py-3 border-opGreen bg-opGreen/5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-black mb-0.5">Wallet</p>
              <p className="font-mono text-xs text-ink font-bold truncate">{wallet.address}</p>
            </div>
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="btn-secondary h-9 w-9 p-0"
              aria-label="Open wallet menu"
            >
              <WalletIcon />
            </button>
          </div>

          {showMenu && (
            <div className="mt-2 rounded-lg border-2 border-ink/20 bg-[var(--cream)] p-2 text-xs">
              <p className={`font-black ${isVerified ? "text-opGreen" : "text-[var(--text-muted)]"}`}>
                {isVerified ? "Verified" : "Not verified"}
              </p>
              {!isVerified && wallet.provider !== "manual" && !verificationIssue && (
                <button
                  onClick={() => void handleVerifyClick()}
                  disabled={verifying}
                  className="mt-2 w-full op-btn-outline text-xs disabled:opacity-50"
                >
                  {verifying ? "Signing..." : "Sign to verify"}
                </button>
              )}
              <a href="/profile" className="mt-2 block w-full op-btn-outline text-center text-xs">
                Profile
              </a>
              <button onClick={disconnect} className="mt-2 w-full rounded-lg border-2 border-opRed px-3 py-2 text-xs font-black text-opRed hover:bg-opRed/10">
                Disconnect
              </button>
            </div>
          )}
          {verifyError && (
            <p className="mt-2 rounded-lg border border-opRed/30 bg-opRed/5 px-2.5 py-2 text-[10px] font-semibold leading-relaxed text-opRed break-words whitespace-normal">
              {verifyError}
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu((v) => !v)}
          className="btn-secondary flex h-12 items-center gap-2 px-3 py-2"
          aria-label="Open wallet menu"
          title={truncateAddress(wallet.address)}
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-opYellow text-ink">
            <WalletIcon />
          </span>
          <span className="font-mono text-xs font-black text-ink">{truncateAddress(wallet.address)}</span>
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} aria-hidden="true" />
            <div className="absolute right-0 top-full mt-2 z-50 w-[22rem] max-w-[calc(100vw-1rem)] op-panel overflow-hidden">
              <div className="px-4 py-3 border-b-2 border-ink/10">
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-black mb-1">
                  Connected via {wallet.provider}{wallet.network ? ` · ${wallet.network}` : ""}
                </p>
                <p className="font-mono text-xs text-ink break-all leading-relaxed font-bold">{wallet.address}</p>
              </div>

              <div className="px-4 py-2 border-b-2 border-ink/10">
                {isVerified ? (
                  <p className="text-[10px] font-black text-opGreen">Verified</p>
                ) : wallet.provider === "manual" ? (
                  <p className="text-[10px] text-[var(--text-muted)] font-semibold">Manual mode session</p>
                ) : verificationIssue ? (
                  <p className="text-[10px] text-[var(--text-muted)] font-semibold leading-tight">
                    OP_WALLET login currently requires a Bitcoin testnet address.
                  </p>
                ) : (
                  <button
                    onClick={() => void handleVerifyClick()}
                    disabled={verifying}
                    className="w-full text-left text-[10px] text-ink font-black hover:text-opGreen transition-colors disabled:opacity-50"
                  >
                    {verifying ? "Signing..." : "Sign to verify"}
                  </button>
                )}
                {verifyError && (
                  <p className="mt-2 rounded-lg border border-opRed/30 bg-opRed/5 px-2.5 py-2 text-[10px] font-bold leading-relaxed text-opRed break-words whitespace-normal">
                    {verifyError}
                  </p>
                )}
              </div>

              <a
                href="/profile"
                onClick={() => setShowMenu(false)}
                className="block w-full px-4 py-2.5 text-xs font-black text-ink hover:bg-opYellow/40 border-b-2 border-ink/10 transition-colors"
              >
                Profile
              </a>

              <a
                href="/settings"
                onClick={() => setShowMenu(false)}
                className="block w-full px-4 py-2.5 text-xs font-black text-ink hover:bg-opYellow/40 border-b-2 border-ink/10 transition-colors"
              >
                Settings
              </a>

              <button
                onClick={() => {
                  disconnect();
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-2.5 text-xs font-black text-opRed hover:bg-opRed/10 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (variant === "mobile") {
    return (
      <div className="space-y-2">
        <button onClick={() => void connect()} disabled={connecting} className="op-btn-outline w-full py-3 text-center text-sm font-black">
          {connecting ? "Connecting..." : "Connect Wallet"}
        </button>

        <a
          href="https://opnet.org/opwallet/"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full op-btn-primary text-center text-sm"
        >
          Create Wallet
        </a>

        {!showManual ? (
          <button onClick={() => setShowManual(true)} className="w-full text-center text-xs text-[var(--text-muted)] hover:text-ink py-1 transition-colors">
            Enter testnet address
          </button>
        ) : (
          <div className="flex flex-col gap-1.5">
            <input
              type="text"
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              placeholder="Paste your testnet address..."
              className="input text-xs py-2 w-full"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={handleManualSubmit} disabled={!manualAddress.trim()} className="op-btn-primary flex-1 text-xs py-2 disabled:opacity-50">
                Connect
              </button>
              <button onClick={() => { setShowManual(false); setManualAddress(""); }} className="rounded-lg border-2 border-ink/30 px-3 py-2 text-xs">
                Cancel
              </button>
            </div>
          </div>
        )}

        {connectError && <p className="text-xs text-opRed leading-tight">{connectError}</p>}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => void connect()}
        disabled={connecting}
        className="op-btn-outline text-sm px-5 py-2.5 font-black"
      >
        {connecting ? "Connecting..." : "Connect Wallet"}
      </button>

      {/* Hints dropdown — shown below button, no impact on nav layout */}
      {!connecting && (
        <div className="absolute right-0 top-full mt-1 flex flex-col items-end gap-1 rounded-xl border-2 border-ink/15 bg-[var(--cream)] px-3 py-2 shadow-sm">
          <a
            href="https://opnet.org/opwallet/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] font-black text-ink/40 hover:text-ink transition-colors whitespace-nowrap"
          >
            Need wallet? Install ↗
          </a>
          {!showManual ? (
            <button
              onClick={() => setShowManual(true)}
              className="text-[9px] text-ink/40 hover:text-ink transition-colors whitespace-nowrap"
            >
              Enter testnet address
            </button>
          ) : (
            <div className="flex items-center gap-1 mt-0.5">
              <input
                type="text"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleManualSubmit();
                  if (e.key === "Escape") { setShowManual(false); setManualAddress(""); }
                }}
                placeholder="Paste testnet address..."
                className="input text-[10px] py-1 px-2 w-48"
                autoFocus
              />
              <button onClick={handleManualSubmit} disabled={!manualAddress.trim()} className="op-btn-primary text-[10px] px-2 py-1 disabled:opacity-50">
                Go
              </button>
              <button onClick={() => { setShowManual(false); setManualAddress(""); }} className="text-[10px] text-ink/40 hover:text-ink px-1">
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {connectError && <p className="absolute right-0 top-full mt-1 text-[10px] text-opRed max-w-[240px] text-right leading-tight">{connectError}</p>}
    </div>
  );
}

