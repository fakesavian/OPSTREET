"use client";

import { useMemo, useState, useEffect } from "react";
import type { ProjectDTO } from "@opfun/shared";
import {
  DEFAULT_GAME_PAYMENT_TOKEN,
  GAME_PAYMENT_TOKENS,
  type GamePaymentToken,
} from "@opfun/shared";
import { submitOpnetTradeWithWallet, type WalletProviderType } from "@/lib/wallet";
import { fetchMarketState, type MarketStateResponse } from "@/lib/api";
import { getApiBase } from "@/lib/apiBase";
import { getOpScanContractUrl } from "@/lib/opscan";

const API = typeof window !== "undefined" ? getApiBase() : "";

type OrderMode = "SWAP" | "SEND";
type ConfirmBlocks = 1 | 2 | 3;
type TradeSide = "BUY" | "SELL";

interface BuyQuote {
  status: string;
  message: string;
  ticker: string;
  contractAddress: string | null;
  market: {
    defaultPaymentToken: GamePaymentToken;
    paymentToken: GamePaymentToken;
    availablePaymentTokens: Array<{
      symbol: GamePaymentToken;
      name: string;
      standard: "OP-20";
      contractAddress: string;
    }>;
  };
  quote: {
    side?: TradeSide;
    mode: OrderMode;
    currentPriceSats: number;
    priceImpactBps?: number;
    effectivePriceSats?: number;
    paymentToken: GamePaymentToken;
    paymentTokenContract: string;
    paymentTokenToSats: number;
    requestedPaymentAmount: number;
    requestedSats: number;
    tokenAmount?: number;
    estimatedTokenAmount: number;
    estimatedPaymentAmount?: number;
    confirmBlocks: ConfirmBlocks;
    reorgProtectionLevel: string;
    reorgProtectionFeeSats: number;
    executionAfterBlocks: number;
    maxSlippageBps: number;
    networkFeeSats: number;
    feeEstimateSats: number;
    totalRequiredSats: number;
    slippageBps: number;
  };
  psbtParams: {
    buyerAddress: string;
    contractAddress: string | null;
    paymentToken: GamePaymentToken;
    paymentTokenContract: string;
    paymentAmount: number;
    amountSats: number;
    confirmBlocks: ConfirmBlocks;
    maxSlippageBps: number;
    mode: OrderMode;
    feeRate: number;
    network: string;
    utxoRequired: null;
    psbtHex: null;
  };
  instructions: string[];
}

interface BuyConfirmResponse {
  status: string;
  message: string;
  projectId: string;
  ticker: string;
  walletAddress: string;
  side?: TradeSide;
  mode: OrderMode;
  paymentToken: GamePaymentToken;
  paymentTokenContract: string;
  paymentAmount: number;
  tokenAmount?: number;
  amountSats: number;
  confirmBlocks: ConfirmBlocks;
  maxSlippageBps: number;
  fees: {
    networkFeeSats: number;
    reorgProtectionFeeSats: number;
    totalFeeSats: number;
  };
  signedPsbtReceived?: boolean;
  reservation: {
    reservationId: string;
    targetBlockOffset: number;
  };
  txId?: string;
}

interface BuyFlowPanelProps {
  project: ProjectDTO;
  walletAddress?: string;
  walletProvider?: WalletProviderType;
}

function satsToBtc(sats: number): string {
  return `${(sats / 100_000_000).toFixed(8)} BTC`;
}

function tokenAddressShort(symbol: GamePaymentToken): string {
  const full = GAME_PAYMENT_TOKENS[symbol].contractAddress;
  return `${full.slice(0, 10)}...${full.slice(-6)}`;
}

function Stepper() {
  return (
    <div className="rounded-xl border-2 border-ink bg-[var(--panel-cream)] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <StepBubble step={1} active title="Get Quote" subtitle="Live price from pool." />
        <StepLine />
        <StepBubble step={2} active title="Reserve Swap" subtitle="Lock route and fees." />
        <StepLine />
        <StepBubble step={3} title="Confirm" subtitle="Sign and broadcast." />
      </div>
    </div>
  );
}

function StepBubble({
  step,
  active = false,
  title,
  subtitle,
}: {
  step: number;
  active?: boolean;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 text-xs font-black ${
            active ? "border-ink bg-opYellow text-ink" : "border-ink/20 bg-[var(--cream)] text-[var(--text-muted)]"
          }`}
        >
          {step}
        </span>
      </div>
      <p className="text-[11px] font-black text-ink">{title}</p>
      <p className="text-[10px] text-[var(--text-muted)]">{subtitle}</p>
    </div>
  );
}

function StepLine() {
  return <div className="mt-3 h-[2px] flex-1 bg-ink/15" />;
}

export function BuyFlowPanel({ project, walletAddress, walletProvider }: BuyFlowPanelProps) {
  const [side, setSide] = useState<TradeSide>("BUY");
  const [mode, setMode] = useState<OrderMode>("SWAP");
  const [paymentToken, setPaymentToken] = useState<GamePaymentToken>(DEFAULT_GAME_PAYMENT_TOKEN);
  const [inputAmount, setInputAmount] = useState("1");
  const [confirmBlocks, setConfirmBlocks] = useState<ConfirmBlocks>(2);
  const [slippagePercent, setSlippagePercent] = useState("40");
  const [feeDisplay, setFeeDisplay] = useState<"BTC" | "SATS">("BTC");
  const [quote, setQuote] = useState<BuyQuote | null>(null);
  const [confirmation, setConfirmation] = useState<BuyConfirmResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [market, setMarket] = useState<MarketStateResponse | null>(null);

  const poolLive = project.launchStatus === "LIVE";
  const contractUrl = getOpScanContractUrl(project.contractAddress);
  const poolUrl = getOpScanContractUrl(project.poolAddress);

  // Fetch market state on mount
  useEffect(() => {
    if (!poolLive) return;
    fetchMarketState(project.id).then(setMarket).catch(() => setMarket(null));
  }, [project.id, poolLive]);

  useEffect(() => {
    setQuote(null);
    setConfirmation(null);
    setError("");
  }, [side, paymentToken, mode, confirmBlocks]);

  const localEstimate = useMemo(() => {
    if (!market?.available || market.currentPriceSats <= 0) return 0;
    const amount = Number(inputAmount);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    if (side === "BUY") {
      const paymentToSats = paymentToken === "PILL" ? 70_000 : 65_000;
      const spendSats = amount * paymentToSats;
      return Math.floor((spendSats / market.currentPriceSats) * 1_000_000);
    }
    return Math.max(0, Math.floor(amount * market.currentPriceSats));
  }, [inputAmount, paymentToken, market, side]);

  const shownQuote = quote?.quote;
  const isLiveQuote = quote?.status === "LIVE_QUOTE";

  async function reserveSwap(): Promise<void> {
    if (!walletAddress) { setError("Connect a wallet first."); return; }
    const amount = Number(inputAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setError("Enter a valid amount."); return; }
    const slippage = Number(slippagePercent);
    if (!Number.isFinite(slippage) || slippage < 0.1 || slippage > 40) { setError("Slippage must be between 0.1 and 40."); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/projects/${project.id}/buy-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          walletAddress,
          side,
          paymentToken,
          paymentAmount: side === "BUY" ? amount : undefined,
          tokenAmount: side === "SELL" ? amount : undefined,
          confirmBlocks,
          maxSlippageBps: Math.round(slippage * 100),
          mode,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        if (res.status === 401) throw new Error("Authentication required. Sign your wallet first.");
        if (res.status === 409) throw new Error(err.message ?? err.error ?? "Pool not live yet.");
        if (res.status === 503) throw new Error(err.message ?? "Quote unavailable — try again shortly.");
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const next = (await res.json()) as BuyQuote;
      setQuote(next);
      setConfirmation(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get quote.");
    } finally {
      setLoading(false);
    }
  }

  async function submitReserve(): Promise<void> {
    if (!walletAddress || !quote) return;
    if (!isLiveQuote) { setError("Live quote required."); return; }
    if (walletProvider !== "opnet") { setError("Use an OPNet wallet to sign and submit."); return; }

    setConfirming(true);
    setError("");
    try {
      let walletSubmit: {
        txId?: string; reservationId?: string; signedPsbt?: string; signedTxHex?: string;
      } | null = null;

      try {
        walletSubmit = await submitOpnetTradeWithWallet("opnet", {
          projectId: project.id,
          walletAddress,
          contractAddress: quote.contractAddress,
          side,
          paymentToken: quote.quote.paymentToken,
          paymentAmount: quote.quote.requestedPaymentAmount,
          tokenAmount: quote.quote.tokenAmount,
          amountSats: quote.quote.requestedSats,
          confirmBlocks: quote.quote.confirmBlocks,
          maxSlippageBps: quote.quote.maxSlippageBps,
          mode: quote.quote.mode,
        });
      } catch (walletErr) {
        const message = walletErr instanceof Error ? walletErr.message : String(walletErr);
        if (!/did not return a transaction payload/i.test(message)) throw walletErr;
      }

      if (!walletSubmit?.txId && !walletSubmit?.signedPsbt && !walletSubmit?.signedTxHex) {
        throw new Error("Wallet did not return a signed transaction. Sign and submit from your wallet.");
      }

      const res = await fetch(`${API}/projects/${project.id}/buy-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          walletAddress,
          side,
          paymentToken: quote.quote.paymentToken,
          paymentAmount: quote.quote.requestedPaymentAmount,
          tokenAmount: quote.quote.tokenAmount,
          amountSats: quote.quote.requestedSats,
          confirmBlocks: quote.quote.confirmBlocks,
          maxSlippageBps: quote.quote.maxSlippageBps,
          mode: quote.quote.mode,
          txId: walletSubmit?.txId,
          reservationId: walletSubmit?.reservationId,
          signedPsbt: walletSubmit?.signedPsbt,
          signedTxHex: walletSubmit?.signedTxHex,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 401) throw new Error("Authentication required.");
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setConfirmation((await res.json()) as BuyConfirmResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit.");
    } finally {
      setConfirming(false);
    }
  }

  function resetForm(): void { setQuote(null); setConfirmation(null); setError(""); }

  const networkFeeSats = shownQuote?.networkFeeSats ?? 0;
  const reorgFeeSats = shownQuote?.reorgProtectionFeeSats ?? (confirmBlocks === 1 ? 2_000 : confirmBlocks === 2 ? 5_000 : 8_000);
  const estimatedReceive = side === "BUY"
    ? (shownQuote?.estimatedTokenAmount ?? localEstimate)
    : (shownQuote?.estimatedPaymentAmount ?? localEstimate);

  // Pool not live — show unavailable state
  if (!poolLive) {
    return (
      <div className="space-y-3">
        <div className="op-panel p-5">
          <h3 className="text-sm font-black uppercase tracking-wider text-ink mb-3">Trade</h3>
          <div className="rounded-xl border-2 border-ink/20 bg-[var(--cream)] px-4 py-6 text-center">
            <p className="text-sm font-bold text-[var(--text-muted)]">Pool not live yet</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Trading is available after the token is deployed and a liquidity pool is confirmed on-chain.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <a
                href="#launch-pipeline"
                className="inline-flex items-center rounded-lg border-2 border-ink bg-opYellow px-3 py-1.5 text-xs font-black text-ink transition-colors hover:bg-opYellow/80"
              >
                Finish Launch
              </a>
              {contractUrl && (
                <a
                  href={contractUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-lg border-2 border-ink bg-white px-3 py-1.5 text-xs font-black text-ink transition-colors hover:bg-opYellow/20"
                >
                  Contract on OP_SCAN
                </a>
              )}
              {poolUrl && (
                <a
                  href={poolUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-lg border-2 border-ink bg-white px-3 py-1.5 text-xs font-black text-ink transition-colors hover:bg-opYellow/20"
                >
                  Pool on OP_SCAN
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Stepper />

      <div className="op-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-ink">Trade</h3>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border-2 border-ink px-2 py-1 text-[10px] font-black text-ink">TESTNET</span>
            {market?.available && (
              <span className="rounded-lg border-2 border-opGreen bg-opGreen/20 px-2 py-1 text-[10px] font-black text-opGreen">
                LIVE POOL
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {market?.available ? (
            <div className="rounded-xl border-2 border-opGreen bg-opGreen/10 px-3 py-2 text-xs font-semibold text-opGreen">
              Live pool quotes from confirmed reserves. Price: {market.currentPriceSats.toLocaleString()} sats
            </div>
          ) : (
            <div className="rounded-xl border-2 border-opYellow bg-opYellow/15 px-3 py-2 text-xs font-semibold text-ink">
              Pool reserves not indexed yet. Quotes will be available after the next watcher cycle.
            </div>
          )}

          <div className="inline-flex rounded-xl border-2 border-ink bg-[var(--cream)] p-1">
            <button
              onClick={() => setSide("BUY")}
              className={`rounded-lg px-3 py-1.5 text-xs font-black ${
                side === "BUY" ? "bg-opYellow text-ink" : "text-[var(--text-muted)]"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setSide("SELL")}
              className={`rounded-lg px-3 py-1.5 text-xs font-black ${
                side === "SELL" ? "bg-opYellow text-ink" : "text-[var(--text-muted)]"
              }`}
            >
              Sell
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="inline-flex rounded-xl border-2 border-ink bg-[var(--cream)] p-1">
              <button onClick={() => setMode("SWAP")} className={`rounded-lg px-3 py-1.5 text-xs font-black ${mode === "SWAP" ? "bg-opYellow text-ink" : "text-[var(--text-muted)]"}`}>Swap</button>
              <button onClick={() => setMode("SEND")} className={`rounded-lg px-3 py-1.5 text-xs font-black ${mode === "SEND" ? "bg-opYellow text-ink" : "text-[var(--text-muted)]"}`}>Send</button>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]">
              Slippage %
              <input type="number" min={0.1} max={40} step={0.1} value={slippagePercent} onChange={(e) => setSlippagePercent(e.target.value)}
                className="w-20 rounded-lg border-2 border-ink bg-[var(--cream)] px-2 py-1 text-right font-mono text-xs text-ink" />
            </label>
          </div>

          <div className="rounded-xl border-2 border-ink/20 bg-[var(--cream)] p-3">
            <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-[var(--text-muted)]">{side === "BUY" ? "Spend Amount" : "Sell Amount"}</div>
            <div className="flex gap-2">
              <input type="number" min={0.00000001} step={0.00000001} value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} className="input font-mono flex-1" />
              {side === "BUY" ? (
                <select value={paymentToken} onChange={(e) => setPaymentToken(e.target.value as GamePaymentToken)}
                  className="rounded-lg border-2 border-ink bg-white px-3 py-2 text-sm font-black text-ink">
                  <option value="MOTO">MOTO</option>
                  <option value="PILL">PILL</option>
                </select>
              ) : (
                <div className="rounded-lg border-2 border-ink bg-white px-3 py-2 text-sm font-black text-ink">
                  {project.ticker}
                </div>
              )}
            </div>
            <div className="mt-2 text-[10px] text-[var(--text-muted)]">
              {side === "BUY"
                ? `${GAME_PAYMENT_TOKENS[paymentToken].name} (${tokenAddressShort(paymentToken)})`
                : `${project.ticker} token amount`}
            </div>
          </div>

          <div className="rounded-xl border-2 border-ink/20 bg-[var(--cream)] p-3">
            <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-[var(--text-muted)]">{side === "BUY" ? "Receive Amount" : "Estimated Payout"}</div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-black text-ink">
                {estimatedReceive > 0 ? estimatedReceive.toLocaleString() : "—"}
              </span>
              <span className="rounded-md border-2 border-ink bg-white px-2 py-1 text-[11px] font-black text-ink">
                {side === "BUY" ? project.ticker : paymentToken} {market?.available ? "(live)" : "(est.)"}
              </span>
            </div>
          </div>

          <div className="rounded-xl border-2 border-ink/20 bg-[var(--cream)] p-3">
            <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-[var(--text-muted)]">Reorganization Protection</div>
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as const).map((b) => {
                const active = confirmBlocks === b;
                const label = b === 1 ? "Fast" : b === 2 ? "Recommended" : "Safe";
                const fee = b === 1 ? "2,000 sats" : b === 2 ? "5,000 sats" : "8,000 sats";
                return (
                  <button key={b} onClick={() => setConfirmBlocks(b)} className={`rounded-lg border-2 px-2 py-2 text-left ${active ? "border-opYellow bg-opYellow/20" : "border-ink/20 bg-white"}`}>
                    <div className="text-xs font-black text-ink">{b} block</div>
                    <div className="text-[10px] font-semibold text-[var(--text-muted)]">{label}</div>
                    <div className="text-[10px] font-mono text-ink">{fee}</div>
                    {b === 2 && <div className="mt-1 text-[9px] font-black text-opGreen">Default</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {shownQuote && (
            <div className="rounded-xl border-2 border-ink/20 bg-[var(--cream)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-black uppercase tracking-wide text-[var(--text-muted)]">Estimated Fee</div>
                <select value={feeDisplay} onChange={(e) => setFeeDisplay(e.target.value as "BTC" | "SATS")}
                  className="rounded-md border-2 border-ink bg-white px-2 py-1 text-[10px] font-black text-ink">
                  <option value="BTC">BTC Value</option>
                  <option value="SATS">Sats</option>
                </select>
              </div>
              <div className="font-mono text-sm font-black text-ink">
                {feeDisplay === "BTC"
                  ? `${satsToBtc(networkFeeSats)} + ${satsToBtc(reorgFeeSats)}`
                  : `${networkFeeSats.toLocaleString()} sats + ${reorgFeeSats.toLocaleString()} sats`}
              </div>
            </div>
          )}

          {!walletAddress && (
            <div className="rounded-xl border-2 border-opYellow bg-opYellow/10 px-3 py-2 text-xs font-semibold text-ink">
              Connect a wallet to trade.
            </div>
          )}

          {error && (
            <div className="rounded-xl border-2 border-opRed bg-opRed/10 px-3 py-2 text-xs font-semibold text-opRed">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={resetForm} className="op-btn-outline py-3 text-sm font-black">Cancel</button>
            <button onClick={reserveSwap} disabled={loading || !walletAddress || !market?.available}
              className="op-btn-primary py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? "Getting quote..." : `Get ${side === "BUY" ? "Buy" : "Sell"} Quote`}
            </button>
          </div>

          {quote && (
            <div className="rounded-xl border-2 border-opGreen bg-opGreen/10 p-3">
              <div className="mb-2 text-xs font-black uppercase text-ink">Live Quote</div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg border border-ink/20 bg-white px-2 py-1">
                  <span className="text-[var(--text-muted)]">{side === "BUY" ? "Pay" : "Sell"}</span>
                  <div className="font-mono font-black text-ink">
                    {side === "BUY"
                      ? `${shownQuote?.requestedPaymentAmount.toLocaleString()} ${shownQuote?.paymentToken}`
                      : `${shownQuote?.tokenAmount?.toLocaleString() ?? "0"} ${project.ticker}`}
                  </div>
                </div>
                <div className="rounded-lg border border-ink/20 bg-white px-2 py-1">
                  <span className="text-[var(--text-muted)]">{side === "BUY" ? "Receive" : "Payout"}</span>
                  <div className="font-mono font-black text-ink">
                    {side === "BUY"
                      ? `${shownQuote?.estimatedTokenAmount.toLocaleString()} ${project.ticker}`
                      : `${shownQuote?.estimatedPaymentAmount?.toLocaleString() ?? "0"} ${shownQuote?.paymentToken}`}
                  </div>
                </div>
                {shownQuote?.priceImpactBps !== undefined && shownQuote.priceImpactBps > 0 && (
                  <div className="col-span-2 rounded-lg border border-ink/20 bg-white px-2 py-1">
                    <span className="text-[var(--text-muted)]">Price Impact</span>
                    <div className={`font-mono font-black ${shownQuote.priceImpactBps > 500 ? "text-opRed" : "text-ink"}`}>
                      {(shownQuote.priceImpactBps / 100).toFixed(2)}%
                    </div>
                  </div>
                )}
              </div>
              <button onClick={submitReserve} disabled={confirming || !isLiveQuote}
                className="mt-3 w-full rounded-lg border-2 border-ink bg-opYellow px-3 py-2 text-xs font-black text-ink disabled:opacity-50">
                {confirming ? "Signing + Submitting..." : `Sign + Submit ${side === "BUY" ? "Buy" : "Sell"}`}
              </button>
            </div>
          )}

          {confirmation && (
            <div className="rounded-xl border-2 border-opYellow bg-opYellow/20 p-3">
              <div className="mb-2 text-xs font-black uppercase text-ink">Confirmation</div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Status</span>
                  <span className="font-black text-opGreen">{confirmation.status}</span>
                </div>
                {confirmation.txId && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Tx ID</span>
                    <span className="font-mono font-black text-opGreen">{confirmation.txId}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Payment</span>
                  <span className="font-mono font-black text-ink">
                    {confirmation.side === "SELL" && confirmation.tokenAmount
                      ? `${confirmation.tokenAmount.toLocaleString()} ${project.ticker}`
                      : `${confirmation.paymentAmount.toLocaleString()} ${confirmation.paymentToken}`}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
