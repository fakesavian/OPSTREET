"use client";

/**
 * PendingTxContext — global persistent transaction overlay.
 *
 * Stores the pending BTC txId in localStorage so it survives page navigation
 * and browser refreshes. The BtcBlockWaitOverlay is rendered once in the root
 * layout and will show on every page until dismissed, confirmed, or expired.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "opstreet_pending_tx";
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — max reasonable BTC block wait

interface StoredTx {
  txId: string;
  startedAt: number; // epoch ms
}

interface PendingTxState {
  txId: string | null;
  startedAt: number | null;
  /** Call this when a BTC funding transaction is broadcast */
  setPendingTx: (txId: string) => void;
  /** Call this to dismiss the overlay (user action or confirmation) */
  clearPendingTx: () => void;
}

const PendingTxContext = createContext<PendingTxState>({
  txId: null,
  startedAt: null,
  setPendingTx: () => undefined,
  clearPendingTx: () => undefined,
});

export function PendingTxProvider({ children }: { children: React.ReactNode }) {
  const [txId, setTxId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored: StoredTx = JSON.parse(raw) as StoredTx;
      if (!stored.txId || !stored.startedAt) return;
      // Discard if TTL expired
      if (Date.now() - stored.startedAt > TTL_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      setTxId(stored.txId);
      setStartedAt(stored.startedAt);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const setPendingTx = useCallback((id: string) => {
    const now = Date.now();
    const stored: StoredTx = { txId: id, startedAt: now };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    setTxId(id);
    setStartedAt(now);
  }, []);

  const clearPendingTx = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setTxId(null);
    setStartedAt(null);
  }, []);

  return (
    <PendingTxContext.Provider value={{ txId, startedAt, setPendingTx, clearPendingTx }}>
      {children}
    </PendingTxContext.Provider>
  );
}

export function usePendingTx() {
  return useContext(PendingTxContext);
}
