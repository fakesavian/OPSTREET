"use client";

/**
 * ClientProviders — wraps WalletProvider for the root layout.
 *
 * WalletProvider imports @btc-vision/walletconnect which is a pure-ESM
 * package that runs secp256k1/WASM init at import time. That crashes Next.js
 * static prerendering. This file is itself a "use client" component so Next.js
 * never tries to SSR-prerender it.
 */

import { WalletProvider } from "@/components/WalletProvider";
import type { ReactNode } from "react";

export function ClientProviders({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
