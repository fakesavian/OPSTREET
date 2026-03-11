"use client";

import { useState } from "react";
import type { FloorTickerDTO } from "@opfun/shared";
import { TokenChart } from "../TokenChart";
import { useWallet } from "../WalletProvider";
import { submitOpnetTradeWithWallet } from "@/lib/wallet";
import { getApiBase } from "@/lib/apiBase";

type TradeSide = "BUY" | "SELL";
type PaymentToken = "MOTO" | "PILL";

const API = getApiBase();

interface Props {
  ticker: FloorTickerDTO[];
  walletAddress: string | null;
}

export function ChartPanel({ ticker, walletAddress }: Props) {
  const { wallet } = useWallet();
  const [tokenIdx, setTokenIdx] = useState(0);
  const [tradeSide, setTradeSide] = useState<TradeSide>("BUY");
  const [paymentToken, setPaymentToken] = useState<PaymentToken>("MOTO");
  const [tradeAmount, setTradeAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [tradeNotice, setTradeNotice] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [txId, setTxId] = useState("");

  const tokens = ticker;
  const currentToken = tokens.length > 0 ? tokens[tokenIdx % tokens.length] : null;
  const priceDelta = currentToken?.priceDelta24h ?? "";
  const isPos = priceDelta.startsWith("+");

  const prevToken = () => setTokenIdx((i) => (i - 1 + tokens.length) % tokens.length);
  const nextToken = () => setTokenIdx((i) => (i + 1) % tokens.length);

  const executeTrade = async () => {
    if (!currentToken) {
      setTradeNotice("No live pools are indexed yet.");
      return;
    }
    const amount = Number(tradeAmount);
    if (!walletAddress) {
      setTradeNotice("Authentication required. Connect and sign wallet first.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setTradeNotice("Enter a valid amount.");
      return;
    }

    setBusy(true);
    setTradeNotice("");
    setReservationId("");
    setTxId("");
    try {
      const intentRes = await fetch(`${API}/projects/${currentToken.id}/buy-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          walletAddress,
          side: tradeSide,
          paymentToken,
          paymentAmount: tradeSide === "BUY" ? amount : undefined,
          tokenAmount: tradeSide === "SELL" ? amount : undefined,
          mode: "SWAP",
          confirmBlocks: 2,
          maxSlippageBps: 4_000,
        }),
      });

      const intentBody = (await intentRes.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        contractAddress?: string | null;
        quote?: {
          paymentToken?: string;
          requestedPaymentAmount?: number;
          requestedSats?: number;
          tokenAmount?: number;
          confirmBlocks?: number;
          maxSlippageBps?: number;
          mode?: string;
        };
        error?: string;
      };

      if (!intentRes.ok) {
        if (intentRes.status === 401) throw new Error("Authentication required. Sign your wallet first.");
        throw new Error(intentBody.error ?? `Intent failed (HTTP ${intentRes.status})`);
      }

      if (intentBody.status !== "LIVE_QUOTE") {
        setTradeNotice(intentBody.message ?? "Quote unavailable.");
        return;
      }
      if (wallet?.provider !== "opnet") {
        setTradeNotice("Use an OPNet wallet to sign and submit onchain trades from the floor.");
        return;
      }

      let walletSubmit:
        | {
            txId?: string;
            reservationId?: string;
            signedPsbt?: string;
            signedTxHex?: string;
          }
        | null = null;
      try {
        walletSubmit = await submitOpnetTradeWithWallet("opnet", {
          projectId: currentToken.id,
          walletAddress,
          contractAddress: intentBody.contractAddress ?? null,
          side: tradeSide,
          paymentToken: (intentBody.quote?.paymentToken as PaymentToken | undefined) ?? paymentToken,
          paymentAmount: tradeSide === "BUY" ? intentBody.quote?.requestedPaymentAmount ?? amount : undefined,
          tokenAmount: tradeSide === "SELL" ? intentBody.quote?.tokenAmount ?? amount : undefined,
          amountSats: intentBody.quote?.requestedSats ?? 0,
          confirmBlocks: (intentBody.quote?.confirmBlocks as 1 | 2 | 3 | undefined) ?? 2,
          maxSlippageBps: intentBody.quote?.maxSlippageBps ?? 4_000,
          mode: (intentBody.quote?.mode as "SWAP" | "SEND" | undefined) ?? "SWAP",
        });
      } catch (walletErr) {
        const message = walletErr instanceof Error ? walletErr.message : String(walletErr);
        if (!/did not return a transaction payload/i.test(message)) {
          throw walletErr;
        }
      }

      const confirmRes = await fetch(`${API}/projects/${currentToken.id}/buy-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          walletAddress,
          side: tradeSide,
          paymentToken: intentBody.quote?.paymentToken ?? paymentToken,
          paymentAmount: tradeSide === "BUY" ? intentBody.quote?.requestedPaymentAmount ?? amount : undefined,
          tokenAmount: tradeSide === "SELL" ? intentBody.quote?.tokenAmount ?? amount : undefined,
          amountSats: intentBody.quote?.requestedSats,
          confirmBlocks: intentBody.quote?.confirmBlocks ?? 2,
          maxSlippageBps: intentBody.quote?.maxSlippageBps ?? 4_000,
          mode: intentBody.quote?.mode ?? "SWAP",
          txId: walletSubmit?.txId,
          reservationId: walletSubmit?.reservationId,
          signedPsbt: walletSubmit?.signedPsbt,
          signedTxHex: walletSubmit?.signedTxHex,
        }),
      });

      const confirmBody = (await confirmRes.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        txId?: string;
        reservation?: { reservationId?: string };
        error?: string;
      };

      if (!confirmRes.ok) {
        if (confirmRes.status === 401) throw new Error("Authentication required. Sign your wallet first.");
        throw new Error(confirmBody.error ?? `Confirm failed (HTTP ${confirmRes.status})`);
      }

      if (confirmBody.txId) setTxId(confirmBody.txId);
      if (confirmBody.reservation?.reservationId) setReservationId(confirmBody.reservation.reservationId);
      setTradeNotice(confirmBody.message ?? "Trade submitted. Awaiting confirmation.");
    } catch (e) {
      setTradeNotice(e instanceof Error ? e.message : "Trade failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!currentToken) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-lg border-2 border-dashed border-ink/20 bg-[var(--panel-cream)] px-4 text-center text-xs font-semibold text-[var(--text-muted)]">
        No live pools indexed yet.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-1.5 text-[10px]">
        <button onClick={prevToken} className="btn-secondary px-2 py-0.5 text-[10px]">←</button>
        <span className="font-mono text-sm font-black text-ink">${currentToken.ticker}</span>
        <span className="max-w-[70px] truncate text-[var(--text-muted)]">{currentToken.name}</span>
        <span className={`font-black ${isPos ? "text-green-600" : "text-opRed"}`}>{priceDelta || "0.0%"}</span>
        <button onClick={nextToken} className="btn-secondary ml-auto px-2 py-0.5 text-[10px]">→</button>
      </div>

      <div className="min-h-0 flex-1">
        <TokenChart ticker={currentToken.ticker} projectId={currentToken.id} fitToContainer />
      </div>

      <div className="shrink-0 border-t-2 border-ink/20 pt-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex overflow-hidden rounded-lg border-2 border-ink">
            <button
              onClick={() => setTradeSide("BUY")}
              className={`px-2 py-0.5 text-[10px] font-black ${tradeSide === "BUY" ? "bg-green-500 text-ink" : "bg-[var(--panel-cream)] text-ink"}`}
            >
              BUY
            </button>
            <button
              onClick={() => setTradeSide("SELL")}
              className={`px-2 py-0.5 text-[10px] font-black ${tradeSide === "SELL" ? "bg-opRed text-white" : "bg-[var(--panel-cream)] text-ink"}`}
            >
              SELL
            </button>
          </div>

          <input
            type="number"
            value={tradeAmount}
            onChange={(e) => setTradeAmount(e.target.value)}
            placeholder={tradeSide === "BUY" ? "MOTO amount" : `${currentToken.ticker} amount`}
            className="input w-24 px-2 py-1 text-[10px]"
          />

          <select
            value={paymentToken}
            onChange={(e) => setPaymentToken(e.target.value as PaymentToken)}
            className="rounded-lg border-2 border-ink bg-[var(--panel-cream)] px-2 py-1 text-[10px] font-black text-ink"
          >
            <option value="MOTO">MOTO</option>
            <option value="PILL">PILL</option>
          </select>

          <button onClick={() => void executeTrade()} disabled={busy} className="btn-primary px-2.5 py-1 text-[10px] disabled:opacity-50">
            {busy ? "Submitting..." : "Execute"}
          </button>

          <a href={`/p/${currentToken.slug}`} className="btn-secondary px-2 py-1 text-[10px]">Open Token</a>
        </div>

        {tradeNotice && <p className="mt-1 text-[9px] font-semibold text-[var(--text-muted)]">{tradeNotice}</p>}
        {reservationId && <p className="mt-0.5 text-[9px] font-mono text-ink">Reservation: {reservationId}</p>}
        {txId && <p className="mt-0.5 text-[9px] font-mono text-opGreen">Tx: {txId}</p>}
      </div>
    </div>
  );
}
