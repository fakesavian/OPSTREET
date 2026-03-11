/**
 * Wallet abstraction — supports Unisat, OKX, OPNet plugin, and manual address entry.
 * Called only from "use client" components (WalletProvider).
 * Used for identity, address resolution, signing, and contract interactions.
 */

export type WalletProviderType = "unisat" | "okx" | "opnet" | "manual";

export interface WalletState {
  address: string;
  provider: WalletProviderType;
  network?: string;
}

// ── Typed provider interfaces ────────────────────────────────────────────

interface UnisatProvider {
  requestAccounts: () => Promise<string[]>;
  getAccounts: () => Promise<string[]>;
  signMessage: (message: string, type: "bip322-simple" | "ecdsa") => Promise<string>;
}

interface OKXBitcoinProvider {
  connect: () => Promise<{ address: string }>;
  signMessage: (message: string, type: "bip322-simple" | "ecdsa") => Promise<string>;
}

interface OPNetProvider {
  requestAccounts?: () => Promise<string[]>;
  getAccounts?: () => Promise<string[]>;
  getCurrentAddress?: () => Promise<string>;
  getNetwork?: () => Promise<unknown>;
  switchNetwork?: (network: string) => Promise<unknown>;
  connect?: () => Promise<{ address: string } | string[]>;
  signMessage?: (message: string, type?: string) => Promise<string>;
  selectedAddress?: string;
  accounts?: string[];
}

type LooseFn = (...args: unknown[]) => Promise<unknown> | unknown;

export interface OpnetTradeRequest {
  projectId: string;
  walletAddress: string;
  contractAddress?: string | null;
  side: "BUY" | "SELL";
  paymentToken: "MOTO" | "PILL";
  paymentAmount?: number;
  tokenAmount?: number;
  amountSats: number;
  confirmBlocks: 1 | 2 | 3;
  maxSlippageBps: number;
  mode: "SWAP" | "SEND";
  walletInteraction?: Record<string, unknown>;
  walletSignedPsbt?: string;
  walletRawTxHex?: string;
}

export interface OpnetTradeSubmitResult {
  txId?: string;
  reservationId?: string;
  signedPsbt?: string;
  signedTxHex?: string;
  raw?: unknown;
}

export interface OpnetLiquidityFundingRequest {
  toAddress: string;
  amountSats: number;
  memo?: string;
}

export interface OpnetPreparedInteraction {
  offlineBufferHex: string;
  refundTo: string;
  maximumAllowedSatToSpend: string;
  feeRate: number;
}

export interface OpnetSignedInteractionResult {
  signedFundingTxHex?: string | null;
  signedInteractionTxHex: string;
}

// ── Bech32m address re-encoding ──────────────────────────────────────────
// OPNet testnet uses HRP "opt" (opt1p... for taproot) instead of "tb" (tb1p...).
// OP_WALLET rejects standard Bitcoin testnet addresses.
// This converts between bech32/bech32m HRPs so the env var can use either format.

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

function bech32CreateChecksum(hrp: string, data: number[], isBech32m: boolean): number[] {
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const polymod = bech32Polymod(values) ^ (isBech32m ? 0x2bc830a3 : 1);
  const ret: number[] = [];
  for (let i = 0; i < 6; i++) ret.push((polymod >> (5 * (5 - i))) & 31);
  return ret;
}

function bech32Decode(str: string): { hrp: string; data: number[]; isBech32m: boolean } | null {
  const pos = str.lastIndexOf("1");
  if (pos < 1 || pos + 7 > str.length || str.length > 90) return null;
  const hrp = str.slice(0, pos).toLowerCase();
  const dataChars = str.slice(pos + 1).toLowerCase();
  const data: number[] = [];
  for (const ch of dataChars) {
    const idx = BECH32_CHARSET.indexOf(ch);
    if (idx === -1) return null;
    data.push(idx);
  }
  const values = [...bech32HrpExpand(hrp), ...data];
  const polymod = bech32Polymod(values);
  const isBech32m = polymod === 0x2bc830a3;
  if (polymod !== 1 && !isBech32m) return null;
  return { hrp, data: data.slice(0, -6), isBech32m };
}

function bech32Encode(hrp: string, data: number[], isBech32m: boolean): string {
  const checksum = bech32CreateChecksum(hrp, data, isBech32m);
  return hrp + "1" + [...data, ...checksum].map((d) => BECH32_CHARSET[d]).join("");
}

/**
 * Convert a bech32/bech32m address from one HRP to another.
 * e.g. tb1p... → opt1p... (same witness program, different network prefix).
 */
function convertBech32Hrp(address: string, targetHrp: string): string | null {
  const decoded = bech32Decode(address);
  if (!decoded) return null;
  return bech32Encode(targetHrp, decoded.data, decoded.isBech32m);
}

/**
 * Ensure address uses the OPNet testnet HRP ("opt").
 * If it's a standard Bitcoin testnet address (tb1...), re-encode it.
 * If it's already opt1..., return as-is.
 */
function toOpnetTestnetAddress(address: string): string {
  const lower = address.toLowerCase();
  if (lower.startsWith("opt1")) return address; // Already in OPNet format
  if (lower.startsWith("tb1") || lower.startsWith("bcrt1")) {
    const converted = convertBech32Hrp(address, "opt");
    if (converted) return converted;
  }
  return address; // Return original if conversion fails (let wallet decide)
}

// ── Provider detection ───────────────────────────────────────────────────

type AnyWindow = Window & {
  unisat?: UnisatProvider;
  okxwallet?: { bitcoin?: OKXBitcoinProvider };
  // OPNet wallet plugin — may inject under any of these keys
  opnet?: OPNetProvider;
  opnetWallet?: OPNetProvider;
  btcwallet?: OPNetProvider;
  bitcoin?: OPNetProvider;
};

function getWin(): AnyWindow | undefined {
  if (typeof window === "undefined") return undefined;
  return window as unknown as AnyWindow;
}

function getUnisat(): UnisatProvider | undefined {
  return getWin()?.unisat;
}

function getOKX(): OKXBitcoinProvider | undefined {
  return getWin()?.okxwallet?.bitcoin;
}

function getOPNet(): OPNetProvider | undefined {
  const win = getWin();
  if (!win) return undefined;
  return win.opnet ?? win.opnetWallet ?? win.btcwallet ?? win.bitcoin;
}

function normalizeOPNetNetwork(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim().toLowerCase();
  }
  if (!value || typeof value !== "object") return undefined;

  const obj = value as Record<string, unknown>;
  for (const key of ["network", "name", "chain", "id"]) {
    const field = obj[key];
    if (typeof field === "string" && field.trim().length > 0) {
      return field.trim().toLowerCase();
    }
  }

  return undefined;
}

function isTestnetNetwork(network: string | undefined): boolean {
  return Boolean(network && /testnet/i.test(network));
}

async function getOPNetNetwork(p: OPNetProvider): Promise<string | undefined> {
  if (typeof p.getNetwork !== "function") return undefined;
  try {
    return normalizeOPNetNetwork(await p.getNetwork());
  } catch {
    return undefined;
  }
}

async function ensureOPNetTestnet(p: OPNetProvider): Promise<string | undefined> {
  const current = await getOPNetNetwork(p);
  if (isTestnetNetwork(current)) return current;

  if (typeof p.switchNetwork === "function") {
    try {
      await p.switchNetwork("testnet");
    } catch {
      return current;
    }
  }

  return (await getOPNetNetwork(p)) ?? current;
}

// ── Connect helpers ──────────────────────────────────────────────────────

async function connectOPNetProvider(
  p: OPNetProvider,
): Promise<{ address: string; network?: string }> {
  const network = await ensureOPNetTestnet(p);
  // Try requestAccounts first (Unisat-style)
  if (typeof p.requestAccounts === "function") {
    const accounts = await p.requestAccounts();
    const addr = Array.isArray(accounts) ? accounts[0] : undefined;
    if (addr) return { address: addr, network };
  }
  // Try connect() (OKX-style — returns object or array)
  if (typeof p.connect === "function") {
    const result = await p.connect();
    if (Array.isArray(result) && result[0]) return { address: result[0], network };
    if (result && typeof result === "object" && "address" in result && result.address) {
      return { address: result.address, network };
    }
  }
  // Try getAccounts
  if (typeof p.getAccounts === "function") {
    const accounts = await p.getAccounts();
    if (accounts[0]) return { address: accounts[0], network };
  }
  // Try getCurrentAddress
  if (typeof p.getCurrentAddress === "function") {
    const address = await p.getCurrentAddress();
    if (address) return { address, network };
  }
  // Try selectedAddress / accounts properties
  if (p.selectedAddress) return { address: p.selectedAddress, network };
  if (p.accounts?.[0]) return { address: p.accounts[0], network };
  throw new Error("OPNet wallet connected but returned no address.");
}

// ── Main connect function ────────────────────────────────────────────────

export async function connectWallet(): Promise<WalletState> {
  if (typeof window === "undefined") {
    throw new Error("Wallet is not available server-side.");
  }

  // 1. Try Unisat
  const unisat = getUnisat();
  if (unisat) {
    const accounts = await unisat.requestAccounts();
    const address = accounts[0];
    if (!address) throw new Error("No account returned from Unisat.");
    return { address, provider: "unisat" };
  }

  // 2. Try OKX
  const okx = getOKX();
  if (okx) {
    const result = await okx.connect();
    if (!result.address) throw new Error("No address returned from OKX Wallet.");
    return { address: result.address, provider: "okx" };
  }

  // 3. Try OPNet wallet plugin (window.opnet / window.opnetWallet / window.btcwallet / window.bitcoin)
  const opnet = getOPNet();
  if (opnet) {
    const result = await connectOPNetProvider(opnet);
    if (result.network && !isTestnetNetwork(result.network)) {
      throw new Error(`OP_WALLET is on ${result.network}. Switch to testnet and try again.`);
    }
    return { address: result.address, provider: "opnet", network: result.network };
  }

  throw new Error("NO_WALLET");
}

/**
 * Connect with a manually-entered address for local testnet development.
 * Validates it looks like a Bitcoin address — no signing required.
 */
export function connectWithAddress(address: string): WalletState {
  const trimmed = address.trim();
  // Basic sanity check — Bitcoin addresses are 25–62 chars
  if (trimmed.length < 10) {
    throw new Error("Address is too short to be valid.");
  }
  return { address: trimmed, provider: "manual" };
}

export function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 7)}…${address.slice(-5)}`;
}

function isBitcoinMessageAddress(address: string): boolean {
  return /^(bc1|tb1|bcrt1)/i.test(address);
}

/**
 * Convert an OPNet testnet address (opt1p...) back to a Bitcoin testnet
 * address (tb1p...) for BIP-322 signature verification.
 * If the address is already tb1/bc1/bcrt1, return as-is.
 * Returns null if conversion fails.
 */
export function toBip322Address(address: string): string | null {
  const lower = address.toLowerCase();
  if (lower.startsWith("tb1") || lower.startsWith("bc1") || lower.startsWith("bcrt1")) {
    return address;
  }
  if (lower.startsWith("opt1")) {
    const converted = convertBech32Hrp(address, "tb");
    if (converted) return converted;
  }
  return null;
}

export function getWalletVerificationIssue(wallet: WalletState): string | null {
  if (
    wallet.provider === "opnet" &&
    wallet.address.length > 0 &&
    !isBitcoinMessageAddress(wallet.address)
  ) {
    // If we can convert the opt1 address to tb1, verification can proceed
    if (toBip322Address(wallet.address)) return null;
    return "OP_WALLET connected on an OP_NET address. This build can connect to testnet, but login verification still expects a Bitcoin BIP-322 address (tb1/bc1).";
  }

  return null;
}

/**
 * Sign a message using BIP-322 simple proof.
 * Returns null for manual address (cannot sign) or unsupported wallets.
 */
export async function signMessage(
  provider: WalletProviderType,
  message: string,
): Promise<string | null> {
  if (provider === "manual") return null;

  const unisat = getUnisat();
  if (provider === "unisat" && unisat) {
    return unisat.signMessage(message, "bip322-simple");
  }

  const okx = getOKX();
  if (provider === "okx" && okx) {
    return okx.signMessage(message, "bip322-simple");
  }

  // OPNet wallet — attempt if signMessage is available
  const opnet = getOPNet();
  if (provider === "opnet" && opnet) {
    const candidateObjects: Array<Record<string, unknown>> = [
      opnet as Record<string, unknown>,
      (opnet as Record<string, unknown>)["bitcoin"] as Record<string, unknown>,
    ].filter(Boolean);

    for (const obj of candidateObjects) {
      const signFn = obj["signMessage"];
      if (typeof signFn === "function") {
        const fn = signFn as LooseFn;
        const attempts: unknown[][] = [
          [message, "bip322-simple"],
          [message],
          [{ message, type: "bip322-simple" }],
          [{ message }],
        ];
        for (const args of attempts) {
          try {
            const result = await fn(...args);
            if (typeof result === "string" && result.length > 0) return result;
          } catch {
            // Try next signature variant.
          }
        }
      }

      const requestFn = obj["request"];
      if (typeof requestFn === "function") {
        const request = requestFn as LooseFn;
        const attempts: unknown[][] = [
          [{ method: "signMessage", params: [message, "bip322-simple"] }],
          [{ method: "signMessage", params: [message] }],
          [{ method: "signMessage", params: { message, type: "bip322-simple" } }],
        ];
        for (const args of attempts) {
          try {
            const result = await request(...args);
            if (typeof result === "string" && result.length > 0) return result;
          } catch {
            // Try next request payload variant.
          }
        }
      }
    }
  }

  return null;
}

function getField(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function parseSubmitResult(value: unknown): OpnetTradeSubmitResult | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = parseSubmitResult(entry);
      if (parsed) return parsed;
    }
    return null;
  }
  if (typeof value === "string") {
    if (value.length >= 64 && /^[0-9a-fA-F]+$/.test(value)) {
      return { txId: value, raw: value };
    }
    return { reservationId: value, raw: value };
  }
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const txId = getField(obj, ["txid", "txId", "transactionId", "hash", "txHash", "transactionHash"]);
  const reservationId = getField(obj, ["reservationId", "orderId", "id"]);
  const signedPsbt = getField(obj, ["signedPsbt", "psbt", "signed_psbt"]);
  const signedTxHex = getField(obj, ["signedTxHex", "rawTxHex", "rawTransaction", "hex"]);

  if (txId || reservationId || signedPsbt || signedTxHex) {
    return { txId, reservationId, signedPsbt, signedTxHex, raw: value };
  }

  for (const nestedKey of ["result", "data", "payload"]) {
    const nested = obj[nestedKey];
    const nestedParsed = parseSubmitResult(nested);
    if (nestedParsed) return nestedParsed;
  }

  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    for (const key of ["message", "error", "reason", "details"]) {
      const val = obj[key];
      if (typeof val === "string" && val.trim().length > 0) return val;
    }
  }
  return "Unknown wallet error.";
}

function normalizeWalletError(raw: string): string {
  const msg = raw.trim();
  if (/duplicated wallet|same key|mldsa|conflict/i.test(msg)) {
    return "OP_WALLET reports a duplicate wallet/MLDSA key conflict. Open the wallet and tap \"Resolve Now\" before submitting trades.";
  }
  if (/insufficient|not enough funds|balance too low/i.test(msg)) {
    return "Insufficient funds in OP_WALLET for this transaction and its network fees.";
  }
  if (/reject|denied|cancelled|canceled|declined/i.test(msg)) {
    return "Wallet request was rejected.";
  }
  if (/not connected|unauthori|permission/i.test(msg)) {
    return "Wallet is not authorized for this site. Reconnect and sign again.";
  }
  if (/invalid.*address|invalid.*recipient/i.test(msg)) {
    return "Invalid recipient address — ensure OP_WALLET is on the OP_NET testnet network, then retry.";
  }
  // Internal wallet TypeError from 'signer' in stringArg — not a user-actionable error
  if (/Cannot use 'in' operator/i.test(msg)) {
    return "__internal_call_format_mismatch__";
  }
  return msg;
}

function isFatalWalletError(msg: string): boolean {
  return /duplicated wallet|same key|mldsa|conflict|insufficient|not enough funds|balance too low|reject|denied|cancelled|canceled|declined|not connected|unauthori|permission|invalid.*address|invalid.*recipient/i.test(
    msg,
  );
}

export async function signOpnetInteractionWithWallet(
  provider: WalletProviderType,
  interaction: OpnetPreparedInteraction,
): Promise<OpnetSignedInteractionResult> {
  if (provider !== "opnet") {
    throw new Error("Use an OPNet wallet to sign this interaction.");
  }

  const opnet = getOPNet();
  if (!opnet) {
    throw new Error("OPNet wallet extension not found.");
  }

  await ensureOPNetTestnet(opnet);

  try {
    const signed = await signInteractionBuffer(interaction.offlineBufferHex);
    return {
      signedFundingTxHex: signed.fundingTransactionRaw ?? null,
      signedInteractionTxHex: signed.interactionTransactionRaw,
    };
  } catch (error) {
    const normalized = normalizeWalletError(errorMessage(error));
    throw new Error(normalized);
  }
}

function methodArgs(methodName: string, payload: OpnetTradeRequest): unknown[][] {
  if (methodName === "pushTx") {
    if (!payload.walletRawTxHex) return [];
    return [[payload.walletRawTxHex], [{ rawtx: payload.walletRawTxHex }]];
  }
  if (methodName === "pushPsbt" || methodName === "signPsbt") {
    if (!payload.walletSignedPsbt) return [];
    return [[payload.walletSignedPsbt], [{ psbtHex: payload.walletSignedPsbt }]];
  }
  if (methodName === "broadcast") {
    const tx = payload.walletRawTxHex;
    const psbt = payload.walletSignedPsbt;
    const args: unknown[][] = [];
    if (tx) args.push([[{ raw: tx, psbt: false }]]);
    if (psbt) args.push([[{ raw: psbt, psbt: true }]]);
    return args;
  }
  if (methodName === "signAndBroadcastInteraction" || methodName === "signInteraction") {
    if (!payload.walletInteraction) return [];
    return [
      [payload.walletInteraction],
      [{ interactionParameters: payload.walletInteraction }],
    ];
  }
  return [
    [payload],
    [{ order: payload }],
    [payload.projectId, payload],
    [payload.side, payload],
  ];
}

async function callProviderFunction(
  target: Record<string, unknown>,
  methodName: string,
  payload: OpnetTradeRequest,
  failures: string[],
): Promise<OpnetTradeSubmitResult | null> {
  const fn = target[methodName];
  if (typeof fn !== "function") return null;
  const invoke = fn as LooseFn;
  const attempts = methodArgs(methodName, payload);
  if (attempts.length === 0) return null;
  for (const args of attempts) {
    try {
      const result = await invoke(...args);
      const parsed = parseSubmitResult(result);
      if (parsed) return parsed;
    } catch (error) {
      const normalized = normalizeWalletError(errorMessage(error));
      failures.push(`direct:${methodName}:${normalized}`);
      if (isFatalWalletError(normalized)) throw new Error(normalized);
      // Try next call format.
    }
  }
  return null;
}

async function callProviderRequest(
  target: Record<string, unknown>,
  methodName: string,
  payload: OpnetTradeRequest,
  failures: string[],
): Promise<OpnetTradeSubmitResult | null> {
  const requestFn = target["request"];
  if (typeof requestFn !== "function") return null;
  const request = requestFn as LooseFn;
  const methodSpecific = methodArgs(methodName, payload);
  const payloads: unknown[] = [
    ...methodSpecific.map((params) => ({ method: methodName, params })),
    { method: methodName, params: [payload] },
    { method: methodName, params: payload },
    { method: methodName, params: { order: payload } },
    { method: methodName, params: [{ order: payload }] },
  ];
  for (const entry of payloads) {
    try {
      const result = await request(entry);
      const parsed = parseSubmitResult(result);
      if (parsed) return parsed;
    } catch (error) {
      const normalized = normalizeWalletError(errorMessage(error));
      failures.push(`request:${methodName}:${normalized}`);
      if (isFatalWalletError(normalized)) throw new Error(normalized);
      // Try next request format.
    }
  }
  return null;
}

export async function submitOpnetTradeWithWallet(
  provider: WalletProviderType,
  payload: OpnetTradeRequest,
): Promise<OpnetTradeSubmitResult | null> {
  if (provider !== "opnet") return null;
  const opnet = getOPNet();
  if (!opnet) throw new Error("OPNet wallet extension not found.");

  const targets: Array<Record<string, unknown>> = [
    opnet as Record<string, unknown>,
    ((opnet as Record<string, unknown>)["bitcoin"] ?? {}) as Record<string, unknown>,
    ((opnet as Record<string, unknown>)["opnet"] ?? {}) as Record<string, unknown>,
  ];
  const root = opnet as Record<string, unknown>;
  for (const value of Object.values(root)) {
    if (value && typeof value === "object") {
      targets.push(value as Record<string, unknown>);
    }
  }

  const directMethods = [
    "signAndBroadcastInteraction",
    "signInteraction",
    "broadcast",
    "pushTx",
    "pushPsbt",
    "signPsbt",
    "sendBitcoin",
    "reserveSwap",
    "submitSwap",
    "swap",
    "trade",
    "submitTrade",
    "createOrder",
  ];
  const requestMethods = [
    "opnet_reserveSwap",
    "opnet_submitSwap",
    "opnet_trade",
    "opnet_swap",
    "wallet_reserveSwap",
    "wallet_submitSwap",
    "wallet_trade",
    "reserveSwap",
    "submitSwap",
    "trade",
    "swap",
    "signAndBroadcastInteraction",
    "signInteraction",
    "broadcast",
    "pushTx",
    "pushPsbt",
    "signPsbt",
    "sendBitcoin",
    "sendTransaction",
    "broadcastTransaction",
  ];
  const failures: string[] = [];

  for (const target of targets) {
    const dynamicDirect = Object.keys(target).filter((key) => {
      if (typeof target[key] !== "function") return false;
      if (/^(connect|disconnect|request|getAccounts|requestAccounts|signMessage)$/i.test(key)) return false;
      return /(swap|trade|order|reserve|submit|transaction|broadcast|send)/i.test(key);
    });
    const dynamicRequest = Array.from(new Set([...requestMethods, ...dynamicDirect]));

    for (const methodName of directMethods) {
      const result = await callProviderFunction(target, methodName, payload, failures);
      if (result) return result;
    }
    for (const methodName of dynamicDirect) {
      const result = await callProviderFunction(target, methodName, payload, failures);
      if (result) return result;
    }
    for (const methodName of dynamicRequest) {
      const result = await callProviderRequest(target, methodName, payload, failures);
      if (result) return result;
    }
  }

  const firstFailure = failures.find((f) => /duplicated wallet|same key|mldsa|conflict|reject|denied|cancelled|canceled|declined|not connected|unauthori|permission/i.test(f));
  if (firstFailure) {
    throw new Error(firstFailure.split(":").slice(2).join(":").trim());
  }

  throw new Error("OPNet wallet did not return a transaction payload. The wallet likely needs valid interaction/tx params from backend for this token.");
}

export async function submitOpnetLiquidityFundingWithWallet(
  provider: WalletProviderType,
  payload: OpnetLiquidityFundingRequest,
): Promise<{ txId: string; raw?: unknown } | null> {
  if (provider !== "opnet") return null;
  const opnet = getOPNet();
  if (!opnet) throw new Error("OPNet wallet extension not found.");

  // Ensure wallet is on testnet before sending to a tb1p address
  await ensureOPNetTestnet(opnet);

  if (!Number.isFinite(payload.amountSats) || payload.amountSats <= 0) {
    throw new Error("Liquidity amount in sats must be greater than zero.");
  }

  // Validate vault address format before calling the wallet
  const rawAddr = payload.toAddress.trim();
  if (!rawAddr) {
    throw new Error("Liquidity vault address is empty.");
  }
  if (!/^(opt1|tb1|bcrt1|[mn2])[a-zA-HJ-NP-Z0-9]{25,}$/i.test(rawAddr)) {
    throw new Error(
      `Vault address "${rawAddr.slice(0, 12)}..." does not look like a valid testnet address. Check NEXT_PUBLIC_LIQUIDITY_VAULT_ADDRESS.`
    );
  }

  // OP_WALLET on OPNet testnet uses "opt" HRP — convert tb1/bcrt1 → opt1
  const addr = toOpnetTestnetAddress(rawAddr);

  const targets: Array<Record<string, unknown>> = [
    opnet as Record<string, unknown>,
    ((opnet as Record<string, unknown>)["bitcoin"] ?? {}) as Record<string, unknown>,
    ((opnet as Record<string, unknown>)["opnet"] ?? {}) as Record<string, unknown>,
  ];
  const root = opnet as Record<string, unknown>;
  for (const value of Object.values(root)) {
    if (value && typeof value === "object") targets.push(value as Record<string, unknown>);
  }

  // OP_WALLET internally checks `'signer' in firstArg` to detect call format.
  // Passing a string (address) as firstArg crashes with "Cannot use 'in' operator".
  // ONLY use object-format calls where firstArg is always an object.
  const sendOpts = {
    to: addr,
    amount: payload.amountSats,
    feeRate: 5,
    memo: payload.memo ?? "OpStreet liquidity",
    signer: null,
    mldsaSigner: null,
  };

  const calls: Array<{ via: "direct" | "request"; target: Record<string, unknown>; payload: unknown }> = [];
  for (const target of targets) {
    if (typeof target["sendBitcoin"] === "function") {
      // Object-format ONLY — never pass string as first arg (wallet does 'signer' in firstArg).
      calls.push({
        via: "direct",
        target,
        payload: [sendOpts],
      });
    }
    if (typeof target["request"] === "function") {
      calls.push(
        {
          via: "request",
          target,
          payload: { method: "sendBitcoin", params: sendOpts },
        },
        {
          via: "request",
          target,
          payload: { method: "sendBitcoin", params: [sendOpts] },
        },
      );
    }
    if (typeof target["_request"] === "function") {
      calls.push({
        via: "request",
        target: { request: target["_request"] as LooseFn },
        payload: { method: "sendBitcoin", params: sendOpts },
      });
    }
  }

  const failures: string[] = [];
  for (const call of calls) {
    try {
      const result =
        call.via === "direct"
          ? await (call.target["sendBitcoin"] as LooseFn)(...(call.payload as unknown[]))
          : await (call.target["request"] as LooseFn)(call.payload);
      const parsed = parseSubmitResult(result);
      if (parsed?.txId) return { txId: parsed.txId, raw: parsed.raw };
      if (parsed?.reservationId) return { txId: parsed.reservationId, raw: parsed.raw };
      if (typeof result === "string" && result.length > 8) return { txId: result, raw: result };
    } catch (error) {
      const normalized = normalizeWalletError(errorMessage(error));
      failures.push(normalized);
      if (isFatalWalletError(normalized)) throw new Error(normalized);
    }
  }

  // Surface the first user-actionable error, skip internal call-format mismatches
  const userError = failures.find((f) => !f.startsWith("__internal_"));
  throw new Error(
    userError ??
      "Wallet did not return a funding transaction id. Ensure OP_WALLET is unlocked and approved.",
  );
}

// ── Wallet-native interaction signing ─────────────────────────────────────

export interface SignedInteractionResult {
  interactionTransactionRaw: string;
  fundingTransactionRaw?: string;
}

/**
 * Ask the connected OP_WALLET to sign a prepared interaction buffer.
 * The buffer is produced server-side by preparePoolCreation / prepareShopMint.
 * The wallet returns the signed raw transaction(s) for broadcast.
 */
export async function signInteractionBuffer(
  offlineBufferHex: string,
): Promise<SignedInteractionResult> {
  const opnet = getOPNet();
  if (!opnet) throw new Error("OPNet wallet extension not found.");

  const api = opnet as Record<string, unknown>;
  const payload = { interactionBuffer: offlineBufferHex };

  // Try direct method calls first, then request-style calls
  const directMethods = [
    "signAndBroadcastInteraction",
    "signInteraction",
    "signTransaction",
  ];

  for (const methodName of directMethods) {
    const fn = api[methodName];
    if (typeof fn !== "function") continue;
    try {
      const result = await (fn as LooseFn)(payload);
      const parsed = parseSignedInteraction(result);
      if (parsed) return parsed;
    } catch (err) {
      const msg = normalizeWalletError(errorMessage(err));
      if (isFatalWalletError(msg)) throw new Error(msg);
    }
  }

  // Try request-style
  if (typeof api["request"] === "function") {
    const request = api["request"] as (args: { method: string; params: unknown }) => Promise<unknown>;
    const requestMethods = [
      "signAndBroadcastInteraction",
      "signInteraction",
      "signTransaction",
      "opnet_signInteraction",
    ];

    for (const method of requestMethods) {
      try {
        const result = await request({ method, params: payload });
        const parsed = parseSignedInteraction(result);
        if (parsed) return parsed;
      } catch (err) {
        const msg = normalizeWalletError(errorMessage(err));
        if (isFatalWalletError(msg)) throw new Error(msg);
      }
    }
  }

  throw new Error(
    "Wallet could not sign the interaction. Ensure OP_WALLET is connected and supports contract interactions.",
  );
}

function parseSignedInteraction(result: unknown): SignedInteractionResult | null {
  if (!result || typeof result !== "object") return null;
  const obj = result as Record<string, unknown>;

  // Look for the interaction transaction raw hex
  const interactionRaw =
    obj["interactionTransactionRaw"] ??
    obj["interactionTxRaw"] ??
    obj["signedTxHex"] ??
    obj["rawTransaction"] ??
    obj["hex"] ??
    obj["result"];

  if (typeof interactionRaw !== "string" || interactionRaw.length < 10) return null;

  const fundingRaw =
    obj["fundingTransactionRaw"] ??
    obj["fundingTxRaw"];

  return {
    interactionTransactionRaw: interactionRaw,
    fundingTransactionRaw: typeof fundingRaw === "string" && fundingRaw.length > 10 ? fundingRaw : undefined,
  };
}
