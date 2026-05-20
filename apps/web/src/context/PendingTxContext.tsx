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
  purpose?: PendingTxPurpose;
}

type PendingTxPurpose = "opnet" | "funding";

interface PendingTxState {
  txId: string | null;
  startedAt: number | null;
  confirmed: boolean;
  /** Call this when a BTC funding transaction is broadcast */
  setPendingTx: (txId: string, purpose?: PendingTxPurpose) => void;
  /** Call this to dismiss the overlay (user action or confirmation) */
  clearPendingTx: () => void;
}

const OP_NET_TX_STATUS_API = "/api/opnet-tx";
const POLL_INTERVAL_MS = 30_000;
const TXID_RE = /^[0-9a-f]{64}$/i;

const PendingTxContext = createContext<PendingTxState>({
  txId: null,
  startedAt: null,
  confirmed: false,
  setPendingTx: () => undefined,
  clearPendingTx: () => undefined,
});

export function PendingTxProvider({ children }: { children: React.ReactNode }) {
  const [txId, setTxId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [purpose, setPurpose] = useState<PendingTxPurpose>("opnet");
  const [confirmed, setConfirmed] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored: StoredTx = JSON.parse(raw) as StoredTx;
      if (!stored.txId || !stored.startedAt) return;
      if (!stored.txId.startsWith("testnet-skip-") && !TXID_RE.test(stored.txId)) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      // Discard if TTL expired
      if (Date.now() - stored.startedAt > TTL_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      setTxId(stored.txId);
      setStartedAt(stored.startedAt);
      // Backward compatibility: pending txs saved before purpose tracking were
      // create-page funding txs, so treat missing purpose as funding. Deploy/pool
      // pages write "opnet" explicitly when they reopen their own pending tx.
      setPurpose(stored.purpose === "opnet" ? "opnet" : "funding");
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Poll OP_NET RPC for confirmation (~every 30s). Do not use public mempool
  // pages here: this app runs against OP_NET's configured chain/RPC, and mempool
  // explorers can lag or disagree for freshly-broadcast interaction txs.
  useEffect(() => {
    if (!txId || confirmed) return;
    // Skip fake testnet-skip txIds
    if (txId.startsWith("testnet-skip-")) return;

    const pendingTxId = txId;

    async function checkConfirmed() {
      try {
        const res = await fetch(`${OP_NET_TX_STATUS_API}?txId=${encodeURIComponent(pendingTxId)}&purpose=${purpose}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json() as { confirmed?: boolean; status?: string };
        if (data.confirmed || data.status === "confirmed" || data.status === "failed") setConfirmed(true);
      } catch {
        // network error — retry next interval
      }
    }

    void checkConfirmed();
    const id = setInterval(() => void checkConfirmed(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [txId, confirmed, purpose]);

  const setPendingTx = useCallback((id: string, pendingPurpose: PendingTxPurpose = "opnet") => {
    const pendingId = id.trim();
    if (!pendingId.startsWith("testnet-skip-") && !TXID_RE.test(pendingId)) {
      console.warn("Ignoring invalid pending tx id", pendingId.slice(0, 32));
      localStorage.removeItem(STORAGE_KEY);
      setTxId(null);
      setStartedAt(null);
      setPurpose("opnet");
      setConfirmed(false);
      return;
    }
    if (pendingId === txId && pendingPurpose === purpose) return;
    const now = Date.now();
    const stored: StoredTx = { txId: pendingId, startedAt: now, purpose: pendingPurpose };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    setTxId(pendingId);
    setStartedAt(now);
    setPurpose(pendingPurpose);
    setConfirmed(false);
  }, [txId, purpose]);

  const clearPendingTx = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setTxId(null);
    setStartedAt(null);
    setPurpose("opnet");
  }, []);

  return (
    <PendingTxContext.Provider value={{ txId, startedAt, confirmed, setPendingTx, clearPendingTx }}>
      {children}
    </PendingTxContext.Provider>
  );
}

export function usePendingTx() {
  return useContext(PendingTxContext);
}
