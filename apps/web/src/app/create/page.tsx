"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/lib/api";
import { DEFAULT_GAME_PAYMENT_TOKEN, GAME_PAYMENT_TOKENS } from "@opfun/shared";
import { useWallet } from "@/components/WalletProvider";
import { submitOpnetLiquidityFundingWithWallet, checkWalletUtxos } from "@/lib/wallet";
import { usePendingTx } from "@/context/PendingTxContext";

const STEPS = ["Token Info", "Links", "Review"] as const;
type Step = 0 | 1 | 2;
type FieldErrors = Partial<Record<string, string>>;
type TouchedFields = Partial<Record<string, boolean>>;

const DEFAULT_LIQUIDITY_VAULT_ADDRESS = "opt1pq4p904uy5zv76wcyac2sqrulpmluys6y6kulpyy7uerhkr9nxvgs3y2sce";
const LIQUIDITY_VAULT_ADDRESS =
  process.env["NEXT_PUBLIC_LIQUIDITY_VAULT_ADDRESS"]?.trim() || DEFAULT_LIQUIDITY_VAULT_ADDRESS;
const LIQUIDITY_TOKEN_TO_SATS: Record<"TBTC" | "MOTO" | "PILL", number> = {
  TBTC: 100_000_000,
  MOTO: 65_000,
  PILL: 70_000,
};
const SATS_PER_TBTC = 100_000_000;

function getLiquidityFundingPreview(
  liquidityToken: "TBTC" | "MOTO" | "PILL",
  liquidityAmount: string,
) {
  const liquidityUnits = Number(liquidityAmount);
  const satsRate = LIQUIDITY_TOKEN_TO_SATS[liquidityToken];
  const valid = Number.isFinite(liquidityUnits) && liquidityUnits > 0;
  const totalSats = valid
    ? Math.max(1, Math.round(liquidityUnits * satsRate))
    : 0;

  return {
    liquidityUnits,
    satsRate,
    totalSats,
    totalTbtc: totalSats / SATS_PER_TBTC,
    valid,
  };
}

function formatSats(value: number): string {
  return value.toLocaleString();
}

function formatTbtc(value: number): string {
  return value.toFixed(8);
}

function validateStep0(form: {
  name: string;
  ticker: string;
  decimals: number;
  maxSupply: string;
  description: string;
  liquidityToken: "TBTC" | "MOTO" | "PILL";
  liquidityAmount: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name || form.name.length < 2) errors["name"] = "Name must be at least 2 characters.";
  if (form.name.length > 80) errors["name"] = "Name must be 80 characters or fewer.";
  if (!form.ticker || form.ticker.length < 2) errors["ticker"] = "Ticker must be at least 2 characters.";
  if (form.ticker.length > 10) errors["ticker"] = "Ticker must be 10 characters or fewer.";
  if (!/^[A-Z0-9]+$/.test(form.ticker)) errors["ticker"] = "Ticker must be uppercase A-Z and 0-9 only.";
  if (!form.maxSupply || !/^\d+$/.test(form.maxSupply)) errors["maxSupply"] = "Max supply must be a positive whole number.";
  else if (Number(form.maxSupply) <= 0) errors["maxSupply"] = "Max supply must be greater than zero.";
  if (!form.description || form.description.length < 10) errors["description"] = "Description must be at least 10 characters.";
  if (form.description.length > 2000) errors["description"] = "Description must be 2000 characters or fewer.";
  if (!["TBTC", "MOTO", "PILL"].includes(form.liquidityToken)) errors["liquidityToken"] = "Select a liquidity token.";
  if (!form.liquidityAmount || !/^\d+(\.\d+)?$/.test(form.liquidityAmount)) {
    errors["liquidityAmount"] = "Liquidity amount must be a positive number.";
  } else if (Number(form.liquidityAmount) <= 0) {
    errors["liquidityAmount"] = "Liquidity amount must be greater than zero.";
  }
  return errors;
}

export default function CreatePage() {
  const router = useRouter();
  const { wallet, walletInstance } = useWallet();
  const { setPendingTx } = usePendingTx();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState({
    name: "", ticker: "", decimals: 18, maxSupply: "1000000000", description: "",
    liquidityToken: "MOTO" as "TBTC" | "MOTO" | "PILL", liquidityAmount: "100",
    website: "", twitter: "", github: "", iconUrl: "", sourceRepoUrl: "",
  });
  const [touched, setTouched] = useState<TouchedFields>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [utxoCheck, setUtxoCheck] = useState<{ count: number; totalSats: string; loading: boolean } | null>(null);
  const [skipFunding, setSkipFunding] = useState(false);

  // When entering Review step, pre-flight check UTXOs so user knows before clicking Launch
  useEffect(() => {
    if (step !== 2 || !wallet?.address) return;
    setUtxoCheck({ count: 0, totalSats: "0", loading: true });
    checkWalletUtxos(wallet.address).then((result) => {
      setUtxoCheck({
        count: result.count,
        totalSats: result.totalSats.toString(),
        loading: false,
      });
    }).catch(() => {
      setUtxoCheck({ count: -1, totalSats: "0", loading: false });
    });
  }, [step, wallet?.address]);

  const step0Errors = validateStep0(form);
  const fundingPreview = getLiquidityFundingPreview(form.liquidityToken, form.liquidityAmount);
  const showError = (field: string) => (touched[field] || submitAttempted) ? step0Errors[field] : undefined;
  function blur(field: string) { setTouched((t) => ({ ...t, [field]: true })); }
  function set(field: string, value: string | number) { setForm((prev) => ({ ...prev, [field]: value })); }

  function next(e: React.FormEvent) {
    e.preventDefault();
    if (step === 0) {
      setSubmitAttempted(true);
      if (Object.keys(step0Errors).length > 0) return;
    }
    if (step < 2) setStep((s) => (s + 1) as Step);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!wallet) throw new Error("Connect an OP_WALLET first.");
      if (!fundingPreview.valid) {
        throw new Error("Liquidity amount must be greater than zero.");
      }

      let fundingTxId: string;

      if (skipFunding) {
        // Testnet skip: no BTC transfer — create project with placeholder tx
        fundingTxId = `testnet-skip-${Date.now()}`;
      } else {
        if (wallet.provider !== "opnet") throw new Error("OP_WALLET is required to fund initial liquidity.");

        const funding = await submitOpnetLiquidityFundingWithWallet(wallet.provider, {
          toAddress: LIQUIDITY_VAULT_ADDRESS,
          amountSats: fundingPreview.totalSats,
          memo: `OpStreet liquidity ${form.ticker}`,
          senderAddress: wallet.address,
          walletInstance: walletInstance as Record<string, unknown> | null,
        });
        if (!funding?.txId) {
          throw new Error("Liquidity funding transaction was not returned by wallet.");
        }
        fundingTxId = funding.txId;
        // Show block-wait overlay globally — persists across page navigation
        setPendingTx(fundingTxId);
      }

      const links: Record<string, string> = {};
      if (form.website) links["website"] = form.website;
      if (form.twitter) links["twitter"] = form.twitter;
      if (form.github) links["github"] = form.github;
      const project = await createProject({
        name: form.name, ticker: form.ticker.toUpperCase(), decimals: form.decimals,
        maxSupply: form.maxSupply, description: form.description, links,
        iconUrl: form.iconUrl || undefined, sourceRepoUrl: form.sourceRepoUrl || undefined,
        liquidityToken: form.liquidityToken,
        liquidityAmount: form.liquidityAmount,
        liquidityFundingTx: fundingTxId,
      });
      router.push(`/p/${project.slug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      if (/insufficient funds/i.test(msg) && !/utxo|csv|spendable/i.test(msg)) {
        setError(
          `${msg} Need at least ${formatSats(fundingPreview.totalSats)} sats (${formatTbtc(fundingPreview.totalTbtc)} tBTC) plus network fees.`,
        );
      } else if (/invalid.*address|invalid.*recipient/i.test(msg)) {
        setError(`${msg} Open OP_WALLET and verify you are on "OP_NET Testnet" (Signet).`);
      } else {
        // Show the actual error — psbt path now returns descriptive messages
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-6">
      {/* Header */}
      <div className="op-panel mb-8 space-y-3 p-5">
        <h1 className="text-3xl font-black text-ink">Launch a Token</h1>
        <p className="text-sm font-bold text-ink">
          Fixed supply &middot; No mint &middot; No hidden admin powers.
        </p>
        <p className="text-xs font-semibold text-[var(--text-secondary)]">
          Default platform payment token:{" "}
          <span className="font-black text-ink">${DEFAULT_GAME_PAYMENT_TOKEN}</span>{" "}
          ({GAME_PAYMENT_TOKENS[DEFAULT_GAME_PAYMENT_TOKEN].contractAddress}).
          Alternate supported token:{" "}
          <span className="font-black text-ink">$PILL</span>.
        </p>
        <a
          href="https://opnet.org/opwallet/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border-2 border-ink bg-opYellow px-2 py-1 text-[10px] font-black text-ink hover:bg-opYellow/80 transition-colors"
        >
          Install OP_WALLET &rarr;
        </a>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <button
              type="button"
              onClick={() => i < step && setStep(i as Step)}
              className={`flex items-center gap-2 text-xs font-black transition-colors ${
                i === step ? "text-ink" : i < step ? "text-opGreen cursor-pointer" : "text-[var(--text-muted)] cursor-default"
              }`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black border-2 transition-colors ${
                i === step ? "border-ink bg-opYellow text-ink"
                : i < step ? "border-opGreen bg-opGreen/20 text-opGreen"
                : "border-ink/30 text-[var(--text-muted)]"
              }`}>
                {i < step ? "\u2713" : i + 1}
              </span>
              {label}
            </button>
            {i < STEPS.length - 1 && (
              <div className={`mx-2 flex-1 h-0.5 border-t-2 ${i < step ? "border-opGreen" : "border-ink/20"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Token Info */}
      {step === 0 && (
        <form onSubmit={next} noValidate className="space-y-5">
          <div className="op-panel p-5 space-y-4">
            <h2 className="font-black text-ink text-sm uppercase tracking-wider">Token Basics</h2>

            <FieldGroup label="Token name *" error={showError("name")}>
              <input
                className={`input ${showError("name") ? "border-opRed" : ""}`}
                placeholder="e.g. Orange Protocol"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => blur("name")}
                autoFocus
              />
            </FieldGroup>

            <div className="grid grid-cols-2 gap-4">
              <FieldGroup label="Ticker *" error={showError("ticker")}>
                <input
                  className={`input font-mono uppercase ${showError("ticker") ? "border-opRed" : ""}`}
                  placeholder="ORP"
                  value={form.ticker}
                  onChange={(e) => set("ticker", e.target.value.toUpperCase())}
                  onBlur={() => blur("ticker")}
                />
                {!showError("ticker") && <p className="mt-1 text-[11px] text-[var(--text-muted)]">Uppercase A-Z / 0-9</p>}
              </FieldGroup>
              <FieldGroup label="Decimals">
                <input
                  className="input"
                  type="number" min={0} max={18}
                  value={form.decimals}
                  onChange={(e) => set("decimals", parseInt(e.target.value, 10))}
                />
              </FieldGroup>
            </div>

            <FieldGroup label="Max supply *" error={showError("maxSupply")}>
              <input
                className={`input font-mono ${showError("maxSupply") ? "border-opRed" : ""}`}
                placeholder="1000000000"
                value={form.maxSupply}
                onChange={(e) => set("maxSupply", e.target.value)}
                onBlur={() => blur("maxSupply")}
              />
              {!showError("maxSupply") && (
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">Fixed forever &mdash; cannot be increased after launch.</p>
              )}
            </FieldGroup>

            <div className="grid grid-cols-2 gap-4">
              <FieldGroup label="Initial liquidity token *" error={showError("liquidityToken")}>
                <select
                  className={`input ${showError("liquidityToken") ? "border-opRed" : ""}`}
                  value={form.liquidityToken}
                  onChange={(e) => set("liquidityToken", e.target.value as "TBTC" | "MOTO" | "PILL")}
                  onBlur={() => blur("liquidityToken")}
                >
                  <option value="TBTC">TBTC</option>
                  <option value="MOTO">MOTO</option>
                  <option value="PILL">PILL</option>
                </select>
              </FieldGroup>
              <FieldGroup label="Initial liquidity amount *" error={showError("liquidityAmount")}>
                <input
                  className={`input font-mono ${showError("liquidityAmount") ? "border-opRed" : ""}`}
                  placeholder="100"
                  value={form.liquidityAmount}
                  onChange={(e) => set("liquidityAmount", e.target.value)}
                  onBlur={() => blur("liquidityAmount")}
                />
              </FieldGroup>
            </div>

            <FieldGroup label="Description *" error={showError("description")}>
              <textarea
                className={`input min-h-[90px] resize-y ${showError("description") ? "border-opRed" : ""}`}
                placeholder="What is this token for? Who is it for?"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                onBlur={() => blur("description")}
              />
              <p className="mt-1 text-[11px] text-[var(--text-muted)] text-right">{form.description.length} / 2000</p>
            </FieldGroup>
          </div>

          {submitAttempted && Object.keys(step0Errors).length > 0 && (
            <div className="op-panel px-4 py-3 text-sm text-opRed border-opRed bg-opRed/5">
              &#9888; Fix the errors above before continuing.
            </div>
          )}

          <button type="submit" className="op-btn-primary w-full py-3 text-base">Next: Links &rarr;</button>
        </form>
      )}

      {/* Step 1: Links */}
      {step === 1 && (
        <form onSubmit={next} className="space-y-5">
          <div className="op-panel p-5 space-y-4">
            <h2 className="font-black text-ink text-sm uppercase tracking-wider">Links</h2>
            <p className="text-xs text-[var(--text-muted)]">All optional. Help the community find your project.</p>
            {(["website", "twitter", "github"] as const).map((field) => (
              <div key={field}>
                <label className="label">{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                <input
                  className="input"
                  type="url"
                  placeholder="https://..."
                  value={form[field]}
                  onChange={(e) => set(field, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="op-panel p-5 space-y-4">
            <h2 className="font-black text-ink text-sm uppercase tracking-wider">Advanced (optional)</h2>
            <div>
              <label className="label">Icon URL</label>
              <input className="input" type="url" placeholder="https://..." value={form.iconUrl} onChange={(e) => set("iconUrl", e.target.value)} />
            </div>
            <div>
              <label className="label">Source Repo</label>
              <input className="input" type="url" placeholder="https://github.com/..." value={form.sourceRepoUrl} onChange={(e) => set("sourceRepoUrl", e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(0)} className="op-btn-outline flex-1 py-3">&larr; Back</button>
            <button type="submit" className="op-btn-primary flex-1 py-3">Next: Review &rarr;</button>
          </div>
        </form>
      )}

      {/* Step 2: Review */}
      {step === 2 && (
        <form onSubmit={submit} className="space-y-5">
          <div className="op-panel p-5 space-y-4">
            <h2 className="font-black text-ink text-sm uppercase tracking-wider">Review Your Token</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <ReviewRow label="Name" value={form.name} />
              <ReviewRow label="Ticker" value={form.ticker} mono />
              <ReviewRow label="Max Supply" value={Number(form.maxSupply).toLocaleString()} mono />
              <ReviewRow label="Decimals" value={String(form.decimals)} mono />
              <ReviewRow label="Liquidity Token" value={form.liquidityToken} mono />
              <ReviewRow label="Liquidity Amount" value={form.liquidityAmount} mono />
            </div>
            <div className="rounded-xl border-2 border-ink bg-[#FFF7E8] px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-ink/60 mb-1">Description</p>
              <p className="text-ink text-sm leading-relaxed">{form.description}</p>
            </div>
            {(form.website || form.twitter || form.github) && (
              <div className="flex flex-wrap gap-2">
                {form.website && <LinkChip label="Website" href={form.website} />}
                {form.twitter && <LinkChip label="Twitter" href={form.twitter} />}
                {form.github && <LinkChip label="GitHub" href={form.github} />}
              </div>
            )}
          </div>

          <div className="rounded-xl border-2 border-ink bg-[#FFF2B8] px-4 py-3">
            <p className="font-black text-ink mb-2 text-sm uppercase tracking-wider">Initial Funding Summary</p>
            <ul className="space-y-1 text-xs font-bold text-ink">
              <li>
                {form.liquidityAmount} {form.liquidityToken} × {formatSats(fundingPreview.satsRate)} sats = {formatSats(fundingPreview.totalSats)} sats
              </li>
              <li>{formatTbtc(fundingPreview.totalTbtc)} tBTC will be sent from OP_WALLET to the liquidity vault.</li>
              <li>Your OP_WALLET needs at least {formatSats(fundingPreview.totalSats)} sats + network fees.</li>
            </ul>
          </div>

          {/* Safe defaults */}
          <div className="rounded-xl border-2 border-[#15803D] bg-[#D1FAE5] px-4 py-3">
            <p className="font-black text-[#15803D] mb-2 text-sm">&#10003; Safe Defaults Confirmed</p>
            <ul className="text-[#166534] space-y-0.5 text-xs font-bold">
              <li>&#10003; Fixed supply &mdash; cannot mint more tokens</li>
              <li>&#10003; No admin keys &mdash; no privileged functions</li>
              <li>&#10003; No pause &mdash; transfers always enabled</li>
              <li>&#10003; No upgrade &mdash; contract is immutable</li>
              <li>&#10003; Deployed on OP_NET</li>
            </ul>
          </div>

          {/* Skip funding toggle — shown when no spendable UTXOs */}
          {utxoCheck && !utxoCheck.loading && utxoCheck.count <= 0 && (
            <div className="rounded-xl border-2 border-ink bg-[#FFF7E8] px-4 py-3 space-y-3">
              <p className="text-xs font-black text-ink uppercase tracking-wider">Testnet: Skip BTC Funding</p>
              <p className="text-xs text-ink/70">
                Your BTC is CSV time-locked. Enable this to create the token record now and fund liquidity later once your BTC unlocks.
              </p>
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  role="switch"
                  aria-checked={skipFunding}
                  onClick={() => setSkipFunding((v) => !v)}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-[3px] border-ink transition-colors ${skipFunding ? "bg-[#4ade80]" : "bg-[#d4d4d4]"}`}
                >
                  <span className={`h-4 w-4 rounded-full border-[2px] border-ink bg-white shadow-sm transition-transform ${skipFunding ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
                </button>
                <span className="text-sm font-black text-ink">{skipFunding ? "Skip enabled — no BTC transfer" : "Skip disabled — BTC transfer required"}</span>
              </label>
            </div>
          )}

          {/* UTXO pre-flight diagnostic */}
          {utxoCheck && (() => {
            const availSats = BigInt(utxoCheck.totalSats);
            const needSats = BigInt(fundingPreview.totalSats);
            const hasEnough = availSats >= needSats;
            const shortfall = needSats - availSats;
            return (
              <div className={`rounded-xl border-2 px-4 py-3 text-xs font-bold ${
                utxoCheck.loading ? "border-ink/30 bg-[#F5F5F0] text-ink/60"
                : utxoCheck.count > 0 && hasEnough ? "border-[#15803D] bg-[#D1FAE5] text-[#166534]"
                : utxoCheck.count > 0 && !hasEnough ? "border-[#EF4444] bg-[#FEE2E2] text-[#B91C1C]"
                : "border-[#B45309] bg-[#FEF3C7] text-[#92400E]"
              }`}>
                {utxoCheck.loading && "⟳ Checking spendable UTXOs on OPNet RPC…"}
                {!utxoCheck.loading && utxoCheck.count > 0 && hasEnough && (
                  <>&#10003; {utxoCheck.count} spendable UTXO{utxoCheck.count > 1 ? "s" : ""} found — {(Number(utxoCheck.totalSats) / 1e8).toFixed(8)} tBTC available</>
                )}
                {!utxoCheck.loading && utxoCheck.count > 0 && !hasEnough && (
                  <>&#9888; Only {(Number(utxoCheck.totalSats) / 1e8).toFixed(8)} tBTC available but {(Number(needSats) / 1e8).toFixed(8)} tBTC needed. Need {shortfall.toLocaleString()} more sats — use the Faucet inside OP_WALLET or reduce the liquidity amount.</>
                )}
                {!utxoCheck.loading && utxoCheck.count === 0 && (
                  <>&#9888; No spendable UTXOs found for your address on OPNet RPC. If your balance shows only under &ldquo;+ CSV Balances&rdquo; in OP_WALLET, those funds are time-locked — fund this address with fresh tBTC from the signet faucet first.</>
                )}
                {!utxoCheck.loading && utxoCheck.count === -1 && (
                  <>⚠ Could not reach OPNet RPC to check UTXOs. Proceeding anyway.</>
                )}
              </div>
            );
          })()}

          {error && (
            <div className="rounded-xl border-2 border-[#EF4444] bg-[#FEE2E2] px-4 py-3 text-sm font-bold text-[#B91C1C]">&#9888; {error}</div>
          )}

          {(() => {
            const insufficientBalance = !skipFunding && utxoCheck && !utxoCheck.loading
              && utxoCheck.count > 0
              && BigInt(utxoCheck.totalSats) < BigInt(fundingPreview.totalSats);
            return (
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(1)} className="op-btn-outline flex-1 py-3">&larr; Back</button>
                <button
                  type="submit"
                  disabled={loading || !!insufficientBalance}
                  title={insufficientBalance ? `Need ${fundingPreview.totalSats.toLocaleString()} sats but only ${Number(utxoCheck!.totalSats).toLocaleString()} available` : undefined}
                  className="op-btn-primary flex-1 py-3 text-base disabled:opacity-50"
                >
                  {loading ? "Creating..." : skipFunding ? "Create Token (no BTC transfer) →" : "Launch Token →"}
                </button>
              </div>
            );
          })()}
        </form>
      )}
    </div>
  );
}

function FieldGroup({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs font-black text-opRed flex items-center gap-1">&#9888; {error}</p>}
    </div>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border-2 border-ink bg-[#FFF7E8] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider font-bold text-ink/60">{label}</p>
      <p className={`mt-0.5 text-sm text-ink ${mono ? "font-mono font-black" : "font-bold"}`}>{value}</p>
    </div>
  );
}

function LinkChip({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      className="rounded-lg border-2 border-ink bg-[#FFF7E8] px-2.5 py-1 text-xs font-black text-ink hover:bg-opYellow transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {label} &#8599;
    </a>
  );
}
