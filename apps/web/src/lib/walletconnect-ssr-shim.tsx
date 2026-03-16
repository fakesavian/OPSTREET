/**
 * Server-side shim for @btc-vision/walletconnect.
 *
 * @btc-vision/walletconnect is a pure-ESM package that initialises secp256k1
 * (via @btc-vision/transaction) at import time.  That crashes Next.js static
 * pre-rendering.  On the server we swap the whole package for this no-op shim
 * via webpack resolve.alias — the real package only ever loads in the browser.
 *
 * The shim exports the exact same surface used by WalletProvider.tsx:
 *   - WalletConnectProvider  (just renders children)
 *   - useWalletConnect       (returns safe null/false defaults)
 *   - SupportedWallets       (constant — no crypto involved)
 */

import { createContext, useContext, type ReactNode } from "react";

// ── SupportedWallets ────────────────────────────────────────────────────────

export const SupportedWallets = {
  OP_WALLET: "op-wallet",
  UNISAT: "unisat",
} as const;

// ── useWalletConnect shim ───────────────────────────────────────────────────

const shimCtx = {
  walletAddress: null as string | null,
  walletInstance: null as null,
  connecting: false,
  connectToWallet: (_wallet: unknown) => {},
  disconnect: () => {},
  network: null as null,
  address: null as null,
  publicKey: null as null,
  mldsaPublicKey: null as null,
  hashedMLDSAKey: null as null,
  walletBalance: null as null,
  signer: null as null,
};

const ShimContext = createContext(shimCtx);

export function useWalletConnect() {
  return useContext(ShimContext);
}

// ── WalletConnectProvider shim ──────────────────────────────────────────────

export function WalletConnectProvider({ children }: { children: ReactNode }) {
  return (
    <ShimContext.Provider value={shimCtx}>{children}</ShimContext.Provider>
  );
}
