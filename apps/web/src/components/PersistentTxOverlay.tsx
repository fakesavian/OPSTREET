"use client";

import { useEffect, useRef } from "react";
import { usePendingTx } from "@/context/PendingTxContext";
import { useNotifications } from "@/context/NotificationContext";
import { BtcBlockWaitOverlay } from "./BtcBlockWaitOverlay";

/**
 * Renders the BtcBlockWaitOverlay at the root layout level so it persists
 * across all page navigations. Reads from PendingTxContext (backed by localStorage)
 * and bridges into NotificationContext so the tx appears in the bell dropdown.
 */
export function PersistentTxOverlay() {
  const { txId, startedAt, confirmed, clearPendingTx } = usePendingTx();
  const { notifications, addNotification, updateNotification } = useNotifications();

  const prevTxIdRef = useRef<string | null>(null);

  // When a new tx is set, add a notification (deduplicated by txId)
  useEffect(() => {
    if (!txId) return;

    // Already processed this txId
    if (prevTxIdRef.current === txId) return;
    prevTxIdRef.current = txId;

    // Don't add a duplicate if one already exists (e.g., after page reload)
    const existing = notifications.find((n) => n.txId === txId);
    if (existing) return;

    const short = `${txId.slice(0, 10)}…${txId.slice(-8)}`;
    addNotification({
      type: "tx",
      title: "Transaction Pending",
      message: `Awaiting block confirmation — ${short}`,
      txId,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txId]);

  // When confirmed, update the matching notification
  useEffect(() => {
    if (!confirmed || !txId) return;
    const notif = notifications.find((n) => n.txId === txId);
    if (!notif) return;
    if (notif.title === "Transaction Confirmed") return; // already updated
    updateNotification(notif.id, {
      title: "Transaction Confirmed",
      message: "Block confirmed! Your token is on-chain.",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, txId]);

  if (!txId) return null;
  return (
    <BtcBlockWaitOverlay
      txId={txId}
      startedAt={startedAt}
      confirmed={confirmed}
      onDismiss={clearPendingTx}
    />
  );
}
