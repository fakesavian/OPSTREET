"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { connectWallet, type WalletState } from "@/lib/wallet";

const STORAGE_KEY = "opfun:wallet";

interface WalletCtx {
  wallet: WalletState | null;
  connecting: boolean;
  connectError: string;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletCtx>({
  wallet: null,
  connecting: false,
  connectError: "",
  connect: async () => {},
  disconnect: () => {},
});

export function useWallet(): WalletCtx {
  return useContext(WalletContext);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  // Restore persisted wallet on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as WalletState;
        if (parsed.address && parsed.provider) setWallet(parsed);
      }
    } catch {
      // corrupt storage — ignore
    }
  }, []);

  async function connect() {
    setConnecting(true);
    setConnectError("");
    try {
      const state = await connectWallet();
      setWallet(state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  function disconnect() {
    setWallet(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <WalletContext.Provider value={{ wallet, connecting, connectError, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}
