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
const OPNET_SIGN_TIMEOUT_MS = 20_000;

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
  senderAddress?: string;
  /** Raw walletInstance from useWalletConnect() — preferred over window.bitcoin fallback */
  walletInstance?: Record<string, unknown> | null;
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
 * address is passed as a hint to OP_WALLET so it can select the correct key.
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

  // OPNet wallet — attempt if signMessage is available.
  // OP_WALLET may fail BIP-322 for Taproot addresses with "Can not sign for input #0"
  // (a key-tweak mismatch in its internal bitcoinjs-lib usage). We try several call
  // signatures to maximise the chance of getting a valid signature back.
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

        // Try call signatures from most to least specific.
        // Do NOT pass the address as any extra arg — OP_WALLET interprets a
        // third string argument as a pre-computed SHA-256 hash and throws a
        // "Hash mismatch" security error when it doesn't match SHA-256(message).
        const callVariants: unknown[][] = [
          [message, "bip322-simple"],
          [message],
        ];

        let lastError: string | undefined;
        for (const args of callVariants) {
          try {
            const result = await withTimeout(
              Promise.resolve(fn(...args)).then((value) => {
                if (typeof value === "string" && value.length > 0) return value;
                throw new Error("OP_WALLET returned an empty signature.");
              }),
              OPNET_SIGN_TIMEOUT_MS,
              "OP_WALLET did not complete the signature request. Close any blank wallet popup and try again.",
            );
            return result;
          } catch (error) {
            const raw = errorMessage(error);
            // "Can not sign for input" = BIP-322 Taproot key-tweak mismatch — try next variant
            if (/can not sign for input/i.test(raw)) {
              lastError = raw;
              continue;
            }
            const detail = normalizeWalletError(raw);
            throw new Error(
              detail.startsWith("__internal_")
                ? "OP_WALLET could not complete message signing in this build."
                : detail,
            );
          }
        }

        // All variants exhausted with BIP-322 key-tweak mismatch
        if (lastError) {
          throw new Error(
            "OP_WALLET could not sign the authentication message (BIP-322 Taproot key mismatch). " +
            "This is a known limitation. Use 'Enter address' below, paste your wallet address, " +
            "and connect manually instead.",
          );
        }
      }

      const requestFn = obj["request"];
      if (typeof requestFn === "function") {
        const request = requestFn as LooseFn;
        const requestVariants: unknown[] = [
          { method: "signMessage", params: [message, "bip322-simple"] },
          { method: "signMessage", params: [message] },
        ];

        let lastError: string | undefined;
        for (const payload of requestVariants) {
          try {
            const result = await withTimeout(
              Promise.resolve(request(payload)).then((value) => {
                if (typeof value === "string" && value.length > 0) return value;
                throw new Error("OP_WALLET returned an empty signature.");
              }),
              OPNET_SIGN_TIMEOUT_MS,
              "OP_WALLET did not complete the signature request. Close any blank wallet popup and try again.",
            );
            return result;
          } catch (error) {
            const raw = errorMessage(error);
            if (/can not sign for input/i.test(raw)) {
              lastError = raw;
              continue;
            }
            const detail = normalizeWalletError(raw);
            throw new Error(
              detail.startsWith("__internal_")
                ? "OP_WALLET could not complete message signing in this build."
                : detail,
            );
          }
        }

        if (lastError) {
          throw new Error(
            "OP_WALLET could not sign the authentication message (BIP-322 key mismatch). " +
            "Tap 'Enter address' below, paste your wallet address, and use manual sign-in instead.",
          );
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

function getNestedObject(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const value = obj[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function normalizeHexString(value: string): string | null {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (!normalized || normalized.length % 2 !== 0) return null;
  if (!/^[0-9a-f]+$/i.test(normalized)) return null;
  return normalized.toLowerCase();
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input.buffer);
  return new Uint8Array(digest);
}

async function deriveTxIdFromRawHex(rawHex: string): Promise<string | null> {
  const normalized = normalizeHexString(rawHex);
  if (!normalized || normalized.length <= 128) return null;

  const bytes = Uint8Array.from(
    normalized.match(/.{2}/g) ?? [],
    (byte) => Number.parseInt(byte, 16),
  );
  const first = await sha256(bytes);
  const second = await sha256(first);
  return Array.from(second).reverse().map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
  const signedTxHex = getField(obj, [
    "signedTxHex",
    "rawTxHex",
    "rawTransaction",
    "transactionRaw",
    "transactionHex",
    "hex",
  ]);

  if (txId || reservationId || signedPsbt || signedTxHex) {
    return { txId, reservationId, signedPsbt, signedTxHex, raw: value };
  }

  for (const nestedKey of ["result", "data", "payload", "receipt", "transaction", "tx", "response"]) {
    const nested = obj[nestedKey];
    const nestedParsed = parseSubmitResult(nested);
    if (nestedParsed) return nestedParsed;
  }

  const nestedObject = getNestedObject(obj, ["result", "data", "payload", "receipt", "transaction", "tx", "response"]);
  if (nestedObject) {
    const nestedTxId = getField(nestedObject, [
      "txid",
      "txId",
      "transactionId",
      "transactionHash",
      "txHash",
      "hash",
    ]);
    const nestedSignedTxHex = getField(nestedObject, [
      "signedTxHex",
      "rawTxHex",
      "rawTransaction",
      "transactionRaw",
      "transactionHex",
      "hex",
    ]);
    if (nestedTxId || nestedSignedTxHex) {
      return {
        txId: nestedTxId,
        signedTxHex: nestedSignedTxHex,
        raw: value,
      };
    }
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
  if (/could not find.*utxo|no.*spendable.*utxo|insufficient.*utxo/i.test(msg)) {
    return "OP_WALLET could not find confirmed spendable UTXOs. Only confirmed Taproot (p2tr) UTXOs can be spent — fund your Taproot address and wait for at least 1 confirmation, then retry.";
  }
  if (/insufficient|not enough funds|balance too low/i.test(msg)) {
    return "Insufficient funds in OP_WALLET for this transaction and its network fees.";
  }
  if (/reject|denied|cancelled|canceled|declined/i.test(msg)) {
    return "Wallet request was rejected. If a signing popup appeared, tap Approve/Sign (not Cancel). If OP_WALLET keeps rejecting, use 'Enter address' to connect manually.";
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

// ── PSBT-based BTC transfer (browser-safe, no external crypto libs) ──────────
// Used as fallback when wallet's sendBitcoin fails to find UTXOs.
// Fetches UTXOs from OPNet RPC directly, builds a raw PSBT, and asks the wallet
// to sign it via signPsbt() + broadcast via pushTx().

function convertBits5to8(data: number[]): number[] {
  let acc = 0, bits = 0;
  const result: number[] = [];
  for (const v of data) {
    acc = (acc << 5) | v;
    bits += 5;
    while (bits >= 8) { bits -= 8; result.push((acc >> bits) & 0xff); }
  }
  return result;
}

/** Extract the P2TR scriptPubKey bytes from a bech32m address (any HRP). */
function addressToP2TRScript(addr: string): Uint8Array | null {
  const decoded = bech32Decode(addr);
  if (!decoded || decoded.data.length < 2) return null;
  const witnessVersion = decoded.data[0]!;
  const witnessProgram = convertBits5to8(decoded.data.slice(1));
  if (witnessProgram.length !== 32) return null; // P2TR is exactly 32 bytes
  const script = new Uint8Array(34);
  script[0] = 0x50 + witnessVersion; // OP_1 = 0x51
  script[1] = 0x20; // PUSH 32 bytes
  witnessProgram.forEach((b, i) => { script[i + 2] = b; });
  return script;
}

function writeVarInt(n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.from([n]);
  if (n <= 0xffff) return Uint8Array.from([0xfd, n & 0xff, (n >> 8) & 0xff]);
  const b = new Uint8Array(5);
  b[0] = 0xfe; b[1] = n & 0xff; b[2] = (n >> 8) & 0xff;
  b[3] = (n >> 16) & 0xff; b[4] = (n >> 24) & 0xff;
  return b;
}

function writeLE32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff; b[1] = (n >> 8) & 0xff;
  b[2] = (n >> 16) & 0xff; b[3] = (n >> 24) & 0xff;
  return b;
}

function writeLE64(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  let v = n;
  const mask = BigInt(0xff);
  for (let i = 0; i < 8; i++) { b[i] = Number(v & mask); v >>= BigInt(8); }
  return b;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

function concatU8(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

// Accepts both OPNet RPC format (transactionId/outputIndex/value)
// and Unisat/OP_WALLET format (txid/vout/satoshis).
interface OPNetUTXO {
  transactionId?: string;
  txid?: string;
  outputIndex?: number;
  vout?: number;
  value?: number | string | bigint;
  satoshis?: number;
}

function normalizeUTXO(u: OPNetUTXO): { txid: string; vout: number; sats: bigint } | null {
  const txid = ((u.transactionId ?? u.txid) ?? "").toLowerCase().replace(/^0x/, "");
  if (!txid || txid.length !== 64 || !/^[0-9a-f]+$/.test(txid)) return null;
  const vout = u.outputIndex ?? u.vout ?? 0;
  const rawVal = u.value ?? u.satoshis;
  if (rawVal === undefined || rawVal === null) return null;
  try {
    const sats = typeof rawVal === "bigint" ? rawVal
      : typeof rawVal === "string" ? BigInt(rawVal)
      : BigInt(Math.round(rawVal as number));
    if (sats <= BigInt(0)) return null;
    return { txid, vout, sats };
  } catch { return null; }
}

/**
 * Get the 32-byte x-only public key from the wallet for use as TAP_INTERNAL_KEY.
 * Compressed pubkey (33 bytes) → strip first byte → 32-byte x-only.
 */
async function getWalletXOnlyPubKey(opnet: OPNetProvider): Promise<Uint8Array | null> {
  const root = opnet as Record<string, unknown>;
  const candidates = [root, root["bitcoin"], root["opnet"]].filter(
    (v): v is Record<string, unknown> => Boolean(v && typeof v === "object"),
  );
  for (const target of candidates) {
    const getPK = target["getPublicKey"] as LooseFn | undefined;
    if (typeof getPK !== "function") continue;
    try {
      const pk = await getPK();
      if (typeof pk !== "string" || pk.length < 64) continue;
      const hex = pk.startsWith("0x") ? pk.slice(2) : pk;
      // 33-byte compressed (66 hex chars): strip 02/03 prefix → 32-byte x-only
      if (hex.length === 66) return hexToBytes(hex.slice(2));
      // Already 32-byte x-only (64 hex chars)
      if (hex.length === 64) return hexToBytes(hex);
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Builds a PSBTv0 for a P2TR-to-P2TR transfer and returns hex.
 * No crypto libs needed — signing is delegated to the wallet via signPsbt().
 * tapInternalKey (32-byte x-only pubkey) is included as TAP_INTERNAL_KEY (0x15)
 * so Taproot-aware wallets can derive the tweaked key and sign correctly.
 */
function buildP2TRPsbt(
  inputs: Array<{ txid: string; vout: number; value: number; senderScript: Uint8Array }>,
  outputs: Array<{ script: Uint8Array; value: number }>,
  tapInternalKey?: Uint8Array,
): string {
  // ── unsigned transaction ──────────────────────────────────────────────────
  const txInputs = inputs.map((inp) => {
    const txidLE = hexToBytes(inp.txid).reverse();
    return concatU8(txidLE, writeLE32(inp.vout), Uint8Array.from([0x00]), writeLE32(0xfffffffd));
  });
  const txOutputs = outputs.map((o) =>
    concatU8(writeLE64(BigInt(o.value)), writeVarInt(o.script.length), o.script),
  );
  const unsignedTx = concatU8(
    writeLE32(2),
    writeVarInt(txInputs.length), ...txInputs,
    writeVarInt(txOutputs.length), ...txOutputs,
    writeLE32(0),
  );

  // ── PSBT structure ────────────────────────────────────────────────────────
  // Magic "psbt\xff"
  const magic = Uint8Array.from([0x70, 0x73, 0x62, 0x74, 0xff]);

  // Global: UNSIGNED_TX (key type 0x00)
  const globalTx = concatU8(
    writeVarInt(1), Uint8Array.from([0x00]),
    writeVarInt(unsignedTx.length), unsignedTx,
    Uint8Array.from([0x00]), // global map end
  );

  // Per-input maps: WITNESS_UTXO (0x01) + optional TAP_INTERNAL_KEY (0x15)
  const inputMaps = inputs.map((inp) => {
    const witnessVal = concatU8(
      writeLE64(BigInt(inp.value)),
      writeVarInt(inp.senderScript.length),
      inp.senderScript,
    );
    const witnessEntry = concatU8(
      writeVarInt(1), Uint8Array.from([0x01]),
      writeVarInt(witnessVal.length), witnessVal,
    );
    // TAP_INTERNAL_KEY (PSBT key type 0x15): 32-byte x-only pubkey.
    // Required for wallets to sign P2TR inputs via key path spend.
    const tapKeyEntry =
      tapInternalKey && tapInternalKey.length === 32
        ? concatU8(
            writeVarInt(1), Uint8Array.from([0x15]),
            writeVarInt(32), tapInternalKey,
          )
        : new Uint8Array(0);
    return concatU8(witnessEntry, tapKeyEntry, Uint8Array.from([0x00]));
  });

  // Per-output maps: empty
  const outputMaps = outputs.map(() => Uint8Array.from([0x00]));

  const psbt = concatU8(magic, globalTx, ...inputMaps, ...outputMaps);
  return Array.from(psbt).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fallback: fetch UTXOs from OPNet RPC, build PSBT, ask wallet to sign + broadcast.
 * Called only when sendBitcoin variants all fail with UTXO errors.
 */
async function tryPsbtTransfer(
  opnet: OPNetProvider,
  connectedAddr: string,
  vaultAddress: string,
  amountSats: number,
): Promise<{ txId: string; raw?: unknown } | null> {
  // 1. Collect all candidate addresses to try — the wallet may have a separate BTC
  //    address distinct from the account/MLDSA address returned by requestAccounts().
  const addrCandidates = new Set<string>([connectedAddr]);
  try {
    const root = opnet as Record<string, unknown>;
    // opnet.accounts may contain both MLDSA addr and BTC addr
    const walletAccounts = root["accounts"];
    if (Array.isArray(walletAccounts)) walletAccounts.forEach((a) => { if (typeof a === "string" && a) addrCandidates.add(a); });
    // selectedAddress often differs from requestAccounts()[0]
    if (typeof root["selectedAddress"] === "string" && root["selectedAddress"]) addrCandidates.add(root["selectedAddress"]);
    const btcSub = root["bitcoin"] as Record<string, unknown> | undefined;
    if (btcSub) {
      if (typeof btcSub["selectedAddress"] === "string") addrCandidates.add(btcSub["selectedAddress"] as string);
      const btcAccounts = btcSub["accounts"];
      if (Array.isArray(btcAccounts)) btcAccounts.forEach((a) => { if (typeof a === "string" && a) addrCandidates.add(a); });
    }
  } catch { /* ignore */ }
  // Also add tb1 equivalents for each opt1 address (OPNet RPC may index by either)
  for (const a of Array.from(addrCandidates)) {
    const tb1 = convertBech32Hrp(a, "tb");
    if (tb1 && tb1 !== a) addrCandidates.add(tb1);
  }
  console.debug("[PSBT] Address candidates:", Array.from(addrCandidates));

  // 2a. Ask OP_WALLET directly for its UTXOs via getBitcoinUtxos()
  //     Unisat API returns { utxos: [...], total: N } — NOT a bare array.
  let rawUtxos: OPNetUTXO[] = [];
  let spendingAddr = connectedAddr; // which address the UTXOs belong to
  try {
    const root = opnet as Record<string, unknown>;
    const candidates = [root, root["bitcoin"]].filter((v): v is Record<string, unknown> => Boolean(v && typeof v === "object"));
    for (const target of candidates) {
      const fn = target["getBitcoinUtxos"] as LooseFn | undefined;
      if (typeof fn !== "function") continue;
      try {
        const res = await fn(0, 100);
        let arr: unknown[] | undefined;
        if (Array.isArray(res)) { arr = res; }
        else if (res && typeof res === "object") {
          const obj = res as Record<string, unknown>;
          // Unisat: { utxos: [...] } — totalUnavailable = CSV-locked (excluded from utxos)
          arr = (obj["utxos"] ?? obj["confirmed"] ?? obj["data"]) as unknown[] | undefined;
          if (Array.isArray(arr)) console.debug("[PSBT] getBitcoinUtxos obj.utxos:", arr.length, "totalUnavailable(CSV):", obj["totalUnavailable"]);
        }
        if (Array.isArray(arr) && arr.length) { rawUtxos = arr as OPNetUTXO[]; break; }
      } catch (e) { console.debug("[PSBT] getBitcoinUtxos threw:", e); }
    }
  } catch { /* fall through */ }

  // 2b. Server-side proxy using JSON-RPC btc_getUTXOs (avoids CORS)
  //     Try every candidate address — wallet may have a different BTC address.
  if (!rawUtxos.length) {
    for (const addr of Array.from(addrCandidates)) {
      try {
        const resp = await fetch(`/api/opnet-utxos?address=${encodeURIComponent(addr)}`);
        if (!resp.ok) { console.debug("[PSBT] Proxy", resp.status, "for", addr); continue; }
        const data = (await resp.json()) as { confirmed?: OPNetUTXO[]; pending?: OPNetUTXO[]; raw?: OPNetUTXO[] };
        console.debug("[PSBT] Proxy:", addr, "confirmed:", data.confirmed?.length ?? 0, "raw:", data.raw?.length ?? 0);
        const pick = data.confirmed?.length ? data.confirmed : (data.raw?.length ? data.raw : data.pending ?? []);
        if (pick.length) { rawUtxos = pick; spendingAddr = addr; break; }
      } catch (e) { console.debug("[PSBT] Proxy error:", e); }
    }
  }

  // Normalize to a consistent format (handles both OPNet RPC and Unisat wallet formats)
  const utxos = rawUtxos.map(normalizeUTXO).filter((u): u is NonNullable<ReturnType<typeof normalizeUTXO>> => u !== null);
  console.debug("[PSBT] Normalized UTXOs:", utxos.length, "of", rawUtxos.length, "raw, spendingAddr:", spendingAddr);

  if (!utxos.length) {
    const csvHint = rawUtxos.length > 0 ? "UTXOs were found but none had a valid txid/value (unexpected format)." :
      "No UTXOs returned by OPNet RPC or wallet for any discovered address.";
    throw new Error(
      `No spendable UTXOs found (${csvHint}) ` +
      `If your balance appears only under "+ CSV Balances", those funds are time-locked. ` +
      `Use the Faucet button inside OP_WALLET to get fresh spendable tBTC, then retry.`,
    );
  }

  // 3. Derive scripts — use spendingAddr (the address UTXOs were found under)
  const senderScript = addressToP2TRScript(spendingAddr);
  if (!senderScript) {
    throw new Error(`Cannot derive P2TR script for sender address: ${spendingAddr.slice(0, 20)}…`);
  }

  // Also try vault with both HRPs
  const vaultOpt = toOpnetTestnetAddress(vaultAddress);
  const recipientScript = addressToP2TRScript(vaultOpt) ?? addressToP2TRScript(vaultAddress);
  if (!recipientScript) {
    throw new Error(`Cannot derive P2TR script for vault address: ${vaultAddress.slice(0, 20)}…`);
  }

  // 4. Greedy UTXO selection with dynamic fee estimate.
  //    P2TR input ≈ 57.5 vbytes, P2TR output ≈ 43 vbytes, overhead ≈ 11 vbytes.
  //    We don't know input count yet so do two passes: estimate with 1 input first,
  //    then recalculate once the real count is known.
  const FEE_RATE = 3; // sat/vbyte — conservative for testnet
  const estimateFee = (nInputs: number) => BigInt(Math.ceil((nInputs * 58 + 2 * 43 + 11) * FEE_RATE));

  // First pass: select enough UTXOs to cover amount + pessimistic fee
  const sorted = [...utxos].sort((a, b) => Number(b.sats - a.sats));
  const selected: typeof utxos = [];
  let totalIn = BigInt(0);
  for (const utxo of sorted) {
    selected.push(utxo);
    totalIn += utxo.sats;
    const fee = estimateFee(selected.length);
    if (totalIn >= BigInt(amountSats) + fee) break;
  }
  const feeEstimate = estimateFee(selected.length);
  const totalNeeded = BigInt(amountSats) + feeEstimate;
  console.debug("[PSBT] Selected", selected.length, "UTXOs, totalIn:", totalIn.toString(), "fee:", feeEstimate.toString(), "needed:", totalNeeded.toString());
  if (totalIn < totalNeeded) {
    const totalSats = utxos.reduce((s, u) => s + u.sats, BigInt(0));
    throw new Error(
      `UTXOs found (${utxos.length} outputs, ${totalSats.toString()} sats total) but not enough to cover ` +
      `${amountSats} sats + ${feeEstimate.toString()} sat fee. ` +
      `Need ${totalNeeded.toString()} sats — please add more tBTC to this address.`,
    );
  }

  const change = totalIn - BigInt(amountSats) - feeEstimate;
  const outputs: Array<{ script: Uint8Array; value: number }> = [
    { script: recipientScript, value: amountSats },
  ];
  if (change > BigInt(546)) outputs.push({ script: senderScript, value: Number(change) });

  // 4. Get wallet's x-only public key for TAP_INTERNAL_KEY (best-effort)
  const tapInternalKey = await getWalletXOnlyPubKey(opnet).catch(() => null) ?? undefined;
  console.debug("[PSBT] tapInternalKey:", tapInternalKey ? `${tapInternalKey.length} bytes` : "none");

  // 5. Build PSBT (returns hex — OP_WALLET signPsbt expects hex, not base64)
  const psbtHex = buildP2TRPsbt(
    selected.map((u) => ({ txid: u.txid, vout: u.vout, value: Number(u.sats), senderScript: senderScript! })),
    outputs,
    tapInternalKey,
  );
  console.debug("[PSBT] Built PSBT hex length:", psbtHex.length);

  // toSignInputs: one entry per input specifying the address so the wallet
  // can match the correct key path. Use spendingAddr (has the UTXOs).
  const toSignInputs = selected.map((_, i) => ({ index: i, address: spendingAddr }));

  // 6. Have wallet sign and broadcast
  const root = opnet as Record<string, unknown>;
  const targets: Array<Record<string, unknown>> = [root];
  for (const k of ["bitcoin", "opnet"] as const) {
    const s = root[k]; if (s && typeof s === "object") targets.push(s as Record<string, unknown>);
  }

  let lastSignError = "signPsbt not found on wallet";
  for (const target of targets) {
    const signFn = target["signPsbt"] as LooseFn | undefined;
    if (typeof signFn !== "function") continue;

    // OP_WALLET signPsbt(psbtHex, { autoFinalized, toSignInputs }) follows Unisat API.
    const signVariants: unknown[][] = [
      [psbtHex, { autoFinalized: true, toSignInputs }],
      [psbtHex, { autoFinalized: true }],
      [psbtHex],
    ];
    for (const args of signVariants) {
      let signed: unknown;
      try { signed = await signFn(...args); } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.debug("[PSBT] signPsbt threw:", msg);
        lastSignError = msg;
        // Fatal wallet errors (reject, cancelled) — don't retry
        if (/reject|denied|cancelled|canceled/i.test(msg)) throw new Error(msg);
        continue;
      }
      if (!signed) { lastSignError = "signPsbt returned empty"; continue; }

      // Some wallets return a 64-char txid directly when they also broadcast
      if (typeof signed === "string" && /^[0-9a-f]{64}$/i.test(signed)) return { txId: signed, raw: signed };
      if (typeof signed === "object" && signed !== null) {
        const s = signed as Record<string, unknown>;
        const txId = s["txId"] ?? s["txid"] ?? s["hash"] ?? s["result"];
        if (typeof txId === "string" && txId.length >= 32) return { txId, raw: signed };
      }

      // Signed PSBT hex returned — push/broadcast it.
      const signedHex = typeof signed === "string" ? signed : null;
      if (!signedHex) { lastSignError = "signPsbt returned non-string"; continue; }

      for (const pushName of ["pushPsbt", "pushTx", "broadcastTransaction", "broadcast"]) {
        const pushFn = target[pushName] as LooseFn | undefined;
        if (typeof pushFn !== "function") continue;
        try {
          const pushArg = pushName === "pushTx" ? { rawtx: signedHex } : signedHex;
          const pushed = await pushFn(pushArg);
          if (typeof pushed === "string" && pushed.length >= 32) return { txId: pushed, raw: pushed };
          if (typeof pushed === "object" && pushed !== null) {
            const p = pushed as Record<string, unknown>;
            const txId = p["txId"] ?? p["txid"] ?? p["result"];
            if (typeof txId === "string" && txId.length >= 32) return { txId, raw: pushed };
          }
        } catch (e) {
          console.debug("[PSBT]", pushName, "threw:", e);
          lastSignError = `${pushName}: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    }
  }

  throw new Error(`PSBT signing failed: ${lastSignError}`);
}

/**
 * Pre-flight check: fetch UTXOs for address from the OPNet RPC proxy.
 * Used by the UI to show how many spendable UTXOs are available before launching.
 */
export async function checkWalletUtxos(address: string): Promise<{
  count: number;
  totalSats: bigint;
  source: string;
}> {
  // Step 1: Get main address UTXO count via wallet extension (for display only)
  let utxoCount = 0;
  let mainSats = BigInt(0);
  const opnet = getOPNet();
  if (opnet) {
    const root = opnet as Record<string, unknown>;
    const candidates = [root, root["bitcoin"]].filter((v): v is Record<string, unknown> => Boolean(v && typeof v === "object"));
    for (const target of candidates) {
      const fn = target["getBitcoinUtxos"] as LooseFn | undefined;
      if (typeof fn !== "function") continue;
      try {
        const res = await fn(0, 100);
        let arr: unknown[] | undefined;
        if (Array.isArray(res)) { arr = res; }
        else if (res && typeof res === "object") {
          const obj = res as Record<string, unknown>;
          arr = (obj["utxos"] ?? obj["confirmed"] ?? obj["data"]) as unknown[] | undefined;
        }
        if (!Array.isArray(arr) || !arr.length) continue;
        const utxos = (arr as OPNetUTXO[]).map(normalizeUTXO).filter((u): u is NonNullable<ReturnType<typeof normalizeUTXO>> => u !== null);
        utxoCount = utxos.length;
        mainSats = utxos.reduce((s, u) => s + u.sats, BigInt(0));
        break;
      } catch { /* try next */ }
    }
  }

  // Step 2: Use OPNet SDK provider to get balances for main + CSV1 addresses.
  //
  //   OP_WALLET getBitcoinUtxos() ONLY returns main P2TR UTXOs.
  //   CSV1 and CSV2 are derived addresses (P2WSH) computed from the wallet public key.
  //   The only reliable way to include them is:
  //     a) provider.getPublicKeyInfo(addr) → Address object
  //     b) provider.getCSV1ForAddress(addrObj) → { address: string }
  //     c) provider.getBalances([main, csv1]) → { addr: bigint }
  //
  try {
    const { JSONRpcProvider } = await import("opnet");
    const { networks } = await import("@btc-vision/bitcoin");

    const provider = new JSONRpcProvider({
      url: "https://testnet.opnet.org",
      network: networks.testnet,
    });

    // Get the Address object (resolves the public key on-chain)
    const addrObj = await provider.getPublicKeyInfo(address, false);

    // Derive CSV1 address from the public key — addrObj may be undefined for new/unfunded addresses
    let csvAddress: string | undefined;
    if (addrObj) {
      const csv1 = provider.getCSV1ForAddress(addrObj);
      csvAddress = (csv1 as unknown as Record<string, unknown>)?.["address"] as string | undefined;
    }

    const addressesToQuery: string[] = [address];
    if (csvAddress && csvAddress !== address) addressesToQuery.push(csvAddress);

    // getBalances returns Record<address, bigint>
    const balances = await provider.getBalances(addressesToQuery, true);
    const totalProviderSats = Object.values(balances).reduce((s, b) => s + (typeof b === "bigint" ? b : BigInt(String(b))), BigInt(0));

    if (totalProviderSats > BigInt(0)) {
      return {
        // Use max of UTXO count and 1 — if provider sees balance, funds exist
        count: Math.max(utxoCount, totalProviderSats > BigInt(0) ? 1 : 0),
        totalSats: totalProviderSats,
        source: "provider:balances",
      };
    }
  } catch { /* provider unavailable — fall through to UTXO result */ }

  // Step 3: Fallback — use main UTXO result if provider query failed
  if (utxoCount > 0) {
    return { count: utxoCount, totalSats: mainSats, source: "wallet:getBitcoinUtxos" };
  }

  // Step 4: Last resort — OPNet RPC proxy for main address
  try {
    const tb1 = convertBech32Hrp(address, "tb");
    for (const addr of [address, ...(tb1 && tb1 !== address ? [tb1] : [])]) {
      const resp = await fetch(`/api/opnet-utxos?address=${encodeURIComponent(addr)}`);
      if (!resp.ok) continue;
      const data = (await resp.json()) as { confirmed?: OPNetUTXO[]; raw?: OPNetUTXO[] };
      const raw = [...(data.confirmed ?? []), ...(data.raw ?? [])];
      const utxos = raw.map(normalizeUTXO).filter((u): u is NonNullable<ReturnType<typeof normalizeUTXO>> => u !== null);
      if (utxos.length > 0) {
        return {
          count: utxos.length,
          totalSats: utxos.reduce((s, u) => s + u.sats, BigInt(0)),
          source: addr,
        };
      }
    }
  } catch { /* ignore */ }

  return { count: 0, totalSats: BigInt(0), source: address };
}

export async function submitOpnetLiquidityFundingWithWallet(
  provider: WalletProviderType,
  payload: OpnetLiquidityFundingRequest,
): Promise<{ txId: string; raw?: unknown } | null> {
  if (provider !== "opnet") return null;

  const opnet = (payload.walletInstance as OPNetProvider | null | undefined) ?? getOPNet();
  if (!opnet) throw new Error("OPNet wallet extension not found.");

  await ensureOPNetTestnet(opnet);

  if (!Number.isFinite(payload.amountSats) || payload.amountSats <= 0) {
    throw new Error("Liquidity amount in sats must be greater than zero.");
  }

  const rawAddr = payload.toAddress.trim();
  if (!rawAddr) throw new Error("Liquidity vault address is empty.");
  if (!/^(opt1|tb1|bcrt1|[mn2])[a-zA-HJ-NP-Z0-9]{25,}$/i.test(rawAddr)) {
    throw new Error(
      `Vault address "${rawAddr.slice(0, 12)}..." does not look like a valid testnet address. Check NEXT_PUBLIC_LIQUIDITY_VAULT_ADDRESS.`,
    );
  }

  const senderAddress = payload.senderAddress;
  if (!senderAddress) throw new Error("Sender address is required for OPNet BTC transfer.");

  // ── Correct OPNet BTC transfer pattern ───────────────────────────────────
  // Per OPNet docs: TransactionFactory.createBTCTransfer (signer:null → OPWallet signs),
  // then provider.sendRawTransaction() to broadcast to OPNet network.
  // window.opnet.sendBitcoin() does NOT broadcast to OPNet — it is NOT the right API.
  // See: how-to/frontend-btc-transfer.md
  const { TransactionFactory } = await import("@btc-vision/transaction");
  const { JSONRpcProvider } = await import("opnet");
  const { networks: btcNetworks } = await import("@btc-vision/bitcoin");

  const rpcProvider = new JSONRpcProvider({
    url: "https://testnet.opnet.org",
    network: btcNetworks.testnet,
  });

  // Fetch UTXOs for the sender address via OPNet RPC — required by TransactionFactory
  const utxos = await rpcProvider.utxoManager.getUTXOs({
    address: senderAddress,
    optimize: false,
  });

  if (!utxos || utxos.length === 0) {
    throw new Error(
      "No UTXOs found for your wallet address on OPNet testnet. Ensure your wallet has confirmed BTC on the OPNet signet chain.",
    );
  }

  const toAddress = toOpnetTestnetAddress(rawAddr);
  const factory = new TransactionFactory();

  // opnet.web3.sendBitcoin (called by detectFundingOPWallet) SIGNS but does NOT
  // broadcast to OPNet signet. result.tx = raw signed tx hex. We must broadcast
  // explicitly and compute the txid from the raw hex locally.
  const result = await factory.createBTCTransfer({
    utxos,
    from: senderAddress,
    to: toAddress,
    feeRate: 10,
    priorityFee: BigInt(0),
    amount: BigInt(payload.amountSats),
  });

  const rawHex = result?.tx;
  if (!rawHex || typeof rawHex !== "string" || rawHex.length < 64) {
    throw new Error(
      "OP_WALLET did not return a signed transaction. Ensure your wallet is on OPNet Testnet and has confirmed UTXOs.",
    );
  }

  // Compute txid: double-SHA256 of non-witness (legacy) serialization, byte-reversed.
  // @btc-vision/bitcoin Transaction.fromHex handles segwit witness stripping correctly.
  const { Transaction: BtcTransaction } = await import("@btc-vision/bitcoin");
  const txId = BtcTransaction.fromHex(rawHex).getId();

  // Broadcast the signed raw hex to OPNet testnet signet.
  // If the wallet already broadcast it, sendRawTransaction returns null — that's fine.
  const broadcastResult = await rpcProvider.sendRawTransaction(rawHex, false);
  if (broadcastResult && typeof (broadcastResult as unknown as Record<string, unknown>)["success"] !== "undefined") {
    const b = broadcastResult as unknown as Record<string, unknown>;
    if (b["success"] === false) {
      const err = b["error"] as string | undefined;
      // "already in utxo set" = duplicate broadcast = tx is live, not a real failure
      if (err && !err.toLowerCase().includes("already") && !err.toLowerCase().includes("utxo")) {
        throw new Error(`OPNet broadcast rejected: ${err}`);
      }
    }
  }

  return { txId, raw: result };
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
