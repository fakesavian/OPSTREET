"use client";

import { usePendingTx } from "@/context/PendingTxContext";
import { BtcBlockWaitOverlay } from "./BtcBlockWaitOverlay";

/**
 * Renders the BtcBlockWaitOverlay at the root layout level so it persists
 * across all page navigations. Reads from PendingTxContext which is backed
 * by localStorage.
 */
export function PersistentTxOverlay() {
  const { txId, startedAt, clearPendingTx } = usePendingTx();
  if (!txId) return null;
  return (
    <BtcBlockWaitOverlay
      txId={txId}
      startedAt={startedAt}
      onDismiss={clearPendingTx}
    />
  );
}
