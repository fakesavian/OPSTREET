import { networks } from "@btc-vision/bitcoin";
import { Address } from "@btc-vision/transaction";
import { GAME_PAYMENT_TOKENS, type LiquidityToken } from "@opfun/shared";
import {
  ABIDataTypes,
  BitcoinAbiTypes,
  JSONRpcProvider,
  MotoswapPoolAbi,
  MotoSwapFactoryAbi,
  OP_721_ABI,
  type AbstractRpcProvider,
  type BitcoinInterfaceAbi,
  getContract,
} from "opnet";
import type {
  IMotoswapFactoryContract,
  IMotoswapPoolContract,
  IOP721Contract,
} from "opnet";

const OPNET_RPC_URL = (process.env["OPNET_RPC_URL"] ?? "").trim() || "https://testnet.opnet.org";
const OPNET_PROVIDER_TIMEOUT_MS = Number(process.env["OPNET_PROVIDER_TIMEOUT_MS"] ?? 15_000);
const OPNET_NETWORK = networks.testnet;
const DEFAULT_INTERACTION_FEE_RATE = Number(process.env["OPNET_INTERACTION_FEE_RATE"] ?? 5);
const DEFAULT_INTERACTION_MAX_SPEND = BigInt(process.env["OPNET_INTERACTION_MAX_SPEND"] ?? "50000");

/**
 * Fee recipient address for bonding curve launch fees.
 * Must be set via OPNET_FEE_RECIPIENT env var before using bonding curve launches.
 * Receives: 5_000 atomic MOTO launch fee per new curve, plus 1% swap fees.
 */
export const OPNET_FEE_RECIPIENT = (process.env["OPNET_FEE_RECIPIENT"] ?? "").trim();

export const MOTOSWAP_FACTORY_ADDRESS = process.env["MOTOSWAP_FACTORY_ADDRESS"] ?? "";
export const MOTOSWAP_ROUTER_ADDRESS = process.env["MOTOSWAP_ROUTER_ADDRESS"] ?? "";
export const SHOP_OP721_COLLECTION_ADDRESS = process.env["SHOP_OP721_COLLECTION"] ?? "";
const TBTC_CONTRACT_ADDRESS = process.env["OPNET_TBTC_CONTRACT_ADDRESS"] ?? "";

const SHOP_OP721_MINT_ABI: BitcoinInterfaceAbi = [
  {
    name: "mint",
    type: BitcoinAbiTypes.Function,
    inputs: [
      { name: "tokenId", type: ABIDataTypes.UINT256 },
      { name: "to", type: ABIDataTypes.ADDRESS },
    ],
    outputs: [],
  },
  ...OP_721_ABI,
];

let provider: JSONRpcProvider | null = null;
let providerUrl = "";

export class RuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeConfigError";
  }
}

export interface RuntimeConfigRequirements {
  requireRpc?: boolean;
  requireFactory?: boolean;
  requireRouter?: boolean;
  requireShopCollection?: boolean;
}

export interface ProviderHealthResult {
  healthy: boolean;
  url: string;
  blockHeight?: number;
  latencyMs?: number;
  error?: string;
}

export interface RuntimeContractConfig {
  rpcUrl: string;
  factoryAddress: string;
  routerAddress: string;
  shopCollectionAddress: string;
  tbtcContractAddress: string;
}

export interface RuntimeAddressDiagnostic {
  address: string | null;
  configured: boolean;
  valid: boolean;
  codeExists: boolean | null;
  error?: string;
}

export interface RuntimeDiagnostics {
  timestamp: string;
  network: string;
  rpcUrl: string;
  provider: ProviderHealthResult;
  contracts: {
    factory: RuntimeAddressDiagnostic;
    router: RuntimeAddressDiagnostic;
    shopCollection: RuntimeAddressDiagnostic;
    tbtc: RuntimeAddressDiagnostic;
  };
  readiness: {
    liveReads: boolean;
    poolCreation: boolean;
    routerReads: boolean;
    tbtcLiquidity: boolean;
    shopMint: boolean;
  };
}

export interface LivePoolState {
  poolAddress: string;
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  blockTimestampLast: bigint;
  source: "live";
}

export interface LivePoolReserves {
  reserve0: bigint;
  reserve1: bigint;
  blockTimestampLast: bigint;
  source: "live";
}

export interface PreparedInteraction {
  offlineBufferHex: string;
  refundTo: string;
  maximumAllowedSatToSpend: string;
  feeRate: number;
}

export interface PoolCreationIntent {
  factoryAddress: string;
  poolAddress: string;
  interaction: PreparedInteraction;
}

export interface ShopMintIntent {
  collectionAddress: string;
  tokenId: string;
  interaction: PreparedInteraction;
}

export interface CurveInitIntent {
  /** Address of the BondingCurve contract to be initialized. */
  curveAddress: string;
  /** Encoded initialize() call for the wallet to sign. */
  interaction: PreparedInteraction;
}

export interface SignedInteractionPayload {
  fundingTransactionRaw?: string | null;
  interactionTransactionRaw: string;
}

export interface BroadcastResult {
  success: boolean;
  txId?: string;
  error?: string;
}

export interface BroadcastInteractionResult extends BroadcastResult {
  fundingTxId?: string;
}

export interface TransactionReceiptResult {
  found: boolean;
  status: "confirmed" | "failed" | "pending";
  blockHeight?: number;
  revert?: string;
  raw?: unknown;
}

function ensureConfigured(name: string, value: string, reason?: string): string {
  if (value.trim().length > 0) return value;
  throw new RuntimeConfigError(reason ?? `${name} is not configured.`);
}

function ensureRequirements(requirements: RuntimeConfigRequirements = {}): void {
  if (requirements.requireRpc ?? true) {
    ensureConfigured("OPNET_RPC_URL", OPNET_RPC_URL, "OPNET_RPC_URL is required for OPNet runtime access.");
  }
  if (requirements.requireFactory) {
    ensureConfigured(
      "MOTOSWAP_FACTORY_ADDRESS",
      MOTOSWAP_FACTORY_ADDRESS,
      "MOTOSWAP_FACTORY_ADDRESS is required for in-app pool creation.",
    );
  }
  if (requirements.requireRouter) {
    ensureConfigured(
      "MOTOSWAP_ROUTER_ADDRESS",
      MOTOSWAP_ROUTER_ADDRESS,
      "MOTOSWAP_ROUTER_ADDRESS is required for live router-backed reads.",
    );
  }
  if (requirements.requireShopCollection) {
    ensureConfigured(
      "SHOP_OP721_COLLECTION",
      SHOP_OP721_COLLECTION_ADDRESS,
      "SHOP_OP721_COLLECTION is required for real OP721 minting.",
    );
  }
}

function addressToHex(address: unknown): string | null {
  if (!address || typeof address !== "object") return null;
  const maybeAddress = address as {
    toHex?: () => string;
  };
  if (typeof maybeAddress.toHex !== "function") return null;
  const hex = maybeAddress.toHex();
  return typeof hex === "string" && hex.length > 0 ? hex.toLowerCase() : null;
}

function addressToP2Op(address: unknown): string | null {
  if (!address || typeof address !== "object") return null;
  const maybeAddress = address as {
    p2op?: (network: typeof OPNET_NETWORK) => string;
  };
  if (typeof maybeAddress.p2op !== "function") return null;
  try {
    const opAddress = maybeAddress.p2op(OPNET_NETWORK);
    return typeof opAddress === "string" && opAddress.length > 0 ? opAddress : null;
  } catch {
    return null;
  }
}

function addressToP2Tr(address: unknown): string | null {
  if (!address || typeof address !== "object") return null;
  const maybeAddress = address as {
    p2tr?: (network: typeof OPNET_NETWORK) => string;
  };
  if (typeof maybeAddress.p2tr !== "function") return null;
  try {
    const p2tr = maybeAddress.p2tr(OPNET_NETWORK);
    return typeof p2tr === "string" && p2tr.length > 0 ? p2tr : null;
  } catch {
    return null;
  }
}

function addressToString(address: unknown): string | null {
  const p2op = addressToP2Op(address);
  if (p2op) return p2op;

  if (typeof address === "string") {
    const trimmed = address.trim();
    if (!trimmed || /^0x0+$/i.test(trimmed)) return null;
    return trimmed;
  }

  const hex = addressToHex(address);
  if (hex && !/^0x0+$/i.test(hex)) return hex;

  if (address && typeof address === "object" && "toString" in address) {
    const text = String(address);
    if (text && !/^0x0+$/i.test(text)) return text;
  }

  return null;
}

function normalizeAddressCandidates(address: unknown): string[] {
  const candidates = new Set<string>();
  const push = (value: string | null) => {
    if (value) candidates.add(value.toLowerCase());
  };

  push(addressToString(address));
  push(addressToHex(address));
  push(addressToP2Op(address));
  push(addressToP2Tr(address));

  return Array.from(candidates);
}

function addressMatchesExpected(address: unknown, expectedOwner: string): boolean {
  const expected = expectedOwner.trim().toLowerCase();
  if (!expected) return false;
  return normalizeAddressCandidates(address).includes(expected);
}

function bufferToBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^0x[0-9a-f]+$/i.test(trimmed)) return BigInt(trimmed);
    if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
    return null;
  }
  if (value instanceof Uint8Array) {
    const hex = Buffer.from(value).toString("hex");
    return BigInt(`0x${hex || "0"}`);
  }
  if (Buffer.isBuffer(value)) {
    return BigInt(`0x${value.toString("hex") || "0"}`);
  }
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return bufferToBigInt(objectValue["value"] ?? objectValue["result"]);
  }
  return null;
}

function resultTxId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const result = raw as Record<string, unknown>;
  for (const key of ["result", "txid", "txId", "transactionId", "hash", "identifier"]) {
    const value = result[key];
    if (typeof value === "string" && value.length > 8) return value;
  }
  return undefined;
}

function txBlockHeight(raw: unknown): number | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const result = raw as Record<string, unknown>;
  const blockNumber = result["blockNumber"];
  if (typeof blockNumber === "bigint") return Number(blockNumber);
  if (typeof blockNumber === "number" && Number.isFinite(blockNumber)) return blockNumber;
  if (typeof blockNumber === "string" && blockNumber.length > 0) {
    return Number(blockNumber.startsWith("0x") ? BigInt(blockNumber) : Number(blockNumber));
  }
  return undefined;
}

function buildPreparedInteraction(
  offlineBuffer: Buffer,
  refundTo: string,
  maximumAllowedSatToSpend: bigint,
  feeRate: number,
): PreparedInteraction {
  return {
    offlineBufferHex: offlineBuffer.toString("hex"),
    refundTo,
    maximumAllowedSatToSpend: maximumAllowedSatToSpend.toString(),
    feeRate,
  };
}

export function getProvider(): JSONRpcProvider {
  ensureRequirements({ requireRpc: true });

  if (provider && providerUrl === OPNET_RPC_URL) return provider;

  provider = new JSONRpcProvider(OPNET_RPC_URL, OPNET_NETWORK, OPNET_PROVIDER_TIMEOUT_MS);
  providerUrl = OPNET_RPC_URL;
  return provider;
}

export function getRpcProvider(): AbstractRpcProvider {
  return getProvider() as AbstractRpcProvider;
}

export async function closeProvider(): Promise<void> {
  if (!provider) return;
  await provider.close().catch(() => undefined);
  provider = null;
  providerUrl = "";
}

export function getRuntimeContractConfig(): RuntimeContractConfig {
  return {
    rpcUrl: OPNET_RPC_URL,
    factoryAddress: MOTOSWAP_FACTORY_ADDRESS,
    routerAddress: MOTOSWAP_ROUTER_ADDRESS,
    shopCollectionAddress: SHOP_OP721_COLLECTION_ADDRESS,
    tbtcContractAddress: TBTC_CONTRACT_ADDRESS,
  };
}

export function getLiquidityTokenContractAddress(symbol: LiquidityToken): string {
  if (symbol === "TBTC") {
    return ensureConfigured(
      "OPNET_TBTC_CONTRACT_ADDRESS",
      TBTC_CONTRACT_ADDRESS,
      "OPNET_TBTC_CONTRACT_ADDRESS is required for TBTC pool creation and reserve mapping.",
    );
  }

  return GAME_PAYMENT_TOKENS[symbol].contractAddress;
}

export function assertRuntimeConfig(requirements?: RuntimeConfigRequirements): RuntimeContractConfig {
  ensureRequirements(requirements);
  return getRuntimeContractConfig();
}

export async function checkProviderHealth(): Promise<ProviderHealthResult> {
  const url = OPNET_RPC_URL;
  if (!url) {
    return { healthy: false, url: "", error: "OPNET_RPC_URL is not configured" };
  }

  const startedAt = Date.now();
  try {
    const blockHeight = await getProvider().getBlockNumber();
    return {
      healthy: true,
      url,
      blockHeight: Number(blockHeight),
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      healthy: false,
      url,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchLivePoolState(poolAddress: string): Promise<LivePoolState | null> {
  if (!poolAddress) return null;

  try {
    const pool = getContract<IMotoswapPoolContract>(
      toContractAddress(poolAddress, "pool address") as never,
      MotoswapPoolAbi,
      getRpcProvider(),
      OPNET_NETWORK,
    );

    const [token0Result, token1Result, reservesResult] = await Promise.all([
      pool.token0(),
      pool.token1(),
      pool.getReserves(),
    ]);

    if (token0Result.revert || token1Result.revert || reservesResult.revert) {
      return null;
    }

    const token0 = addressToString(token0Result.properties.token0);
    const token1 = addressToString(token1Result.properties.token1);
    if (!token0 || !token1) return null;

    return {
      poolAddress,
      token0,
      token1,
      reserve0: reservesResult.properties.reserve0,
      reserve1: reservesResult.properties.reserve1,
      blockTimestampLast: reservesResult.properties.blockTimestampLast,
      source: "live",
    };
  } catch {
    return null;
  }
}

export async function fetchLivePoolReserves(poolAddress: string): Promise<LivePoolReserves | null> {
  const state = await fetchLivePoolState(poolAddress);
  if (!state) return null;

  return {
    reserve0: state.reserve0,
    reserve1: state.reserve1,
    blockTimestampLast: state.blockTimestampLast,
    source: state.source,
  };
}

export async function findPoolAddress(token0: string, token1: string): Promise<string | null> {
  ensureRequirements({ requireFactory: true });

  const factory = getContract<IMotoswapFactoryContract>(
    toContractAddress(MOTOSWAP_FACTORY_ADDRESS, "MOTOSWAP_FACTORY_ADDRESS") as never,
    MotoSwapFactoryAbi,
    getRpcProvider(),
    OPNET_NETWORK,
  );

  const pool = await factory.getPool(
    toContractAddress(token0, "token0 address") as never,
    toContractAddress(token1, "token1 address") as never,
  );
  if (pool.revert) return null;
  return addressToString(pool.properties.pool);
}

export async function preparePoolCreation(
  walletAddress: string,
  token0: string,
  token1: string,
  options?: {
    maximumAllowedSatToSpend?: bigint;
    feeRate?: number;
  },
): Promise<PoolCreationIntent> {
  ensureRequirements({ requireFactory: true });

  const existingPool = await findPoolAddress(token0, token1);
  if (existingPool) {
    throw new RuntimeConfigError(
      `A pool already exists for this pair at ${existingPool}. Recovery requires recording the original transaction metadata.`,
    );
  }

  const maximumAllowedSatToSpend = options?.maximumAllowedSatToSpend ?? DEFAULT_INTERACTION_MAX_SPEND;
  const feeRate = options?.feeRate ?? DEFAULT_INTERACTION_FEE_RATE;

  const factory = getContract<IMotoswapFactoryContract>(
    toContractAddress(MOTOSWAP_FACTORY_ADDRESS, "MOTOSWAP_FACTORY_ADDRESS") as never,
    MotoSwapFactoryAbi,
    getRpcProvider(),
    OPNET_NETWORK,
    walletAddress as never,
  );

  const simulation = await factory.createPool(
    toContractAddress(token0, "token0 address") as never,
    toContractAddress(token1, "token1 address") as never,
  );
  if (simulation.revert) {
    throw new Error(`Pool creation simulation failed: ${simulation.revert}`);
  }

  const poolAddress = addressToString(simulation.properties.address);
  if (!poolAddress) {
    throw new Error("Pool creation simulation did not return a pool address.");
  }

  const offlineBuffer = await simulation.toOfflineBuffer(walletAddress, maximumAllowedSatToSpend);

  return {
    factoryAddress: MOTOSWAP_FACTORY_ADDRESS,
    poolAddress,
    interaction: buildPreparedInteraction(offlineBuffer, walletAddress, maximumAllowedSatToSpend, feeRate),
  };
}

export async function prepareShopMint(
  walletAddress: string,
  tokenId: string,
  options?: {
    maximumAllowedSatToSpend?: bigint;
    feeRate?: number;
  },
): Promise<ShopMintIntent> {
  ensureRequirements({ requireShopCollection: true });

  const numericTokenId = BigInt(tokenId);
  const maximumAllowedSatToSpend = options?.maximumAllowedSatToSpend ?? DEFAULT_INTERACTION_MAX_SPEND;
  const feeRate = options?.feeRate ?? DEFAULT_INTERACTION_FEE_RATE;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opnet getContract proxies ABI methods at runtime
  const collection = getContract(
    toContractAddress(SHOP_OP721_COLLECTION_ADDRESS, "SHOP_OP721_COLLECTION") as never,
    SHOP_OP721_MINT_ABI,
    getRpcProvider(),
    OPNET_NETWORK,
    walletAddress as never,
  ) as unknown as {
    mint: (mintTokenId: bigint, to: Address) => Promise<{
      revert?: string;
      toOfflineBuffer: (refundAddress: string, amount: bigint) => Promise<Buffer>;
    }>;
  };

  const simulation = await collection.mint(
    numericTokenId,
    toContractAddress(walletAddress, "wallet address"),
  );
  if (simulation.revert) {
    throw new Error(`OP721 mint simulation failed: ${simulation.revert}`);
  }

  const offlineBuffer = await simulation.toOfflineBuffer(walletAddress, maximumAllowedSatToSpend);

  return {
    collectionAddress: SHOP_OP721_COLLECTION_ADDRESS,
    tokenId,
    interaction: buildPreparedInteraction(offlineBuffer, walletAddress, maximumAllowedSatToSpend, feeRate),
  };
}

/**
 * prepareCurveInitialization — Simulate and encode a call to BondingCurve.initialize().
 *
 * The caller (creator) must have pre-approved MOTO allowance >= 5_000 atomic units
 * to the curveAddress before calling this. Returns the offline interaction buffer
 * for the wallet to sign and broadcast.
 *
 * Deployment sequence context:
 *   Step 3: Creator calls MOTO.approve(curveAddress, launchFee)
 *   Step 4: Creator calls curve.initialize()  ← this function prepares that call
 */
export async function prepareCurveInitialization(
  walletAddress: string,
  curveAddress: string,
  options?: {
    maximumAllowedSatToSpend?: bigint;
    feeRate?: number;
  },
): Promise<CurveInitIntent> {
  ensureRequirements({ requireRpc: true });

  const maximumAllowedSatToSpend = options?.maximumAllowedSatToSpend ?? DEFAULT_INTERACTION_MAX_SPEND;
  const feeRate = options?.feeRate ?? DEFAULT_INTERACTION_FEE_RATE;

  // ABI for BondingCurve.initialize() — no inputs, returns bool
  const CURVE_INIT_ABI: BitcoinInterfaceAbi = [
    {
      name: "initialize",
      type: BitcoinAbiTypes.Function,
      inputs: [],
      outputs: [{ name: "success", type: ABIDataTypes.BOOL }],
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opnet getContract proxies ABI at runtime
  const curve = getContract(
    toContractAddress(curveAddress, "curveAddress") as never,
    CURVE_INIT_ABI,
    getRpcProvider(),
    OPNET_NETWORK,
    walletAddress as never,
  ) as unknown as {
    initialize: () => Promise<{
      revert?: string;
      toOfflineBuffer: (refundAddress: string, amount: bigint) => Promise<Buffer>;
    }>;
  };

  const simulation = await curve.initialize();
  if (simulation.revert) {
    throw new Error(`BondingCurve.initialize() simulation failed: ${simulation.revert}`);
  }

  const offlineBuffer = await simulation.toOfflineBuffer(walletAddress, maximumAllowedSatToSpend);

  return {
    curveAddress,
    interaction: buildPreparedInteraction(offlineBuffer, walletAddress, maximumAllowedSatToSpend, feeRate),
  };
}

export async function broadcastTransaction(signedPayload: string, isPsbt = false): Promise<BroadcastResult> {
  try {
    const result = await getProvider().sendRawTransaction(signedPayload, isPsbt);
    const txId = resultTxId(result);
    if (!result.success || !txId) {
      return {
        success: false,
        error: result.error ?? "Broadcast returned no transaction ID.",
      };
    }
    return { success: true, txId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function broadcastSignedInteraction(
  payload: SignedInteractionPayload,
): Promise<BroadcastInteractionResult> {
  try {
    let fundingTxId: string | undefined;

    if (payload.fundingTransactionRaw) {
      const funding = await getProvider().sendRawTransaction(payload.fundingTransactionRaw, false);
      const maybeFundingTxId = resultTxId(funding);
      if (!funding.success || !maybeFundingTxId) {
        return {
          success: false,
          error: funding.error ?? "Funding transaction broadcast failed.",
        };
      }
      fundingTxId = maybeFundingTxId;
    }

    const interaction = await getProvider().sendRawTransaction(payload.interactionTransactionRaw, false);
    const txId = resultTxId(interaction);
    if (!interaction.success || !txId) {
      return {
        success: false,
        fundingTxId,
        error: interaction.error ?? "Interaction transaction broadcast failed.",
      };
    }

    return {
      success: true,
      txId,
      fundingTxId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchTransactionReceipt(txId: string): Promise<TransactionReceiptResult> {
  try {
    const providerInstance = getProvider();
    const receipt = await providerInstance.getTransactionReceipt(txId);
    const transaction = await providerInstance.getTransaction(txId).catch(() => null);
    const blockHeight = txBlockHeight(transaction);
    const revert = receipt.revert;

    return {
      found: true,
      status: revert ? "failed" : "confirmed",
      blockHeight,
      revert,
      raw: {
        receipt,
        transaction,
      },
    };
  } catch {
    return { found: false, status: "pending" };
  }
}

async function inspectRuntimeAddress(
  label: string,
  value: string,
  canProbeCode: boolean,
): Promise<RuntimeAddressDiagnostic> {
  const address = value.trim();
  if (!address) {
    return {
      address: null,
      configured: false,
      valid: false,
      codeExists: null,
    };
  }

  try {
    toContractAddress(address, label);

    let codeExists: boolean | null = null;
    if (canProbeCode) {
      const code = await checkContractCode(address);
      codeExists = code.exists;
    }

    return {
      address,
      configured: true,
      valid: true,
      codeExists,
    };
  } catch (error) {
    return {
      address,
      configured: true,
      valid: false,
      codeExists: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getRuntimeDiagnostics(): Promise<RuntimeDiagnostics> {
  const providerHealth = await checkProviderHealth();
  const canProbeCode = providerHealth.healthy;

  const [factory, router, shopCollection, tbtc] = await Promise.all([
    inspectRuntimeAddress("MOTOSWAP_FACTORY_ADDRESS", MOTOSWAP_FACTORY_ADDRESS, canProbeCode),
    inspectRuntimeAddress("MOTOSWAP_ROUTER_ADDRESS", MOTOSWAP_ROUTER_ADDRESS, canProbeCode),
    inspectRuntimeAddress("SHOP_OP721_COLLECTION", SHOP_OP721_COLLECTION_ADDRESS, canProbeCode),
    inspectRuntimeAddress("OPNET_TBTC_CONTRACT_ADDRESS", TBTC_CONTRACT_ADDRESS, canProbeCode),
  ]);

  return {
    timestamp: new Date().toISOString(),
    network: getOpnetNetwork(),
    rpcUrl: OPNET_RPC_URL,
    provider: providerHealth,
    contracts: {
      factory,
      router,
      shopCollection,
      tbtc,
    },
    readiness: {
      liveReads: providerHealth.healthy,
      poolCreation: providerHealth.healthy && factory.valid && factory.codeExists === true,
      routerReads: providerHealth.healthy && router.valid && router.codeExists === true,
      tbtcLiquidity: providerHealth.healthy && tbtc.valid && tbtc.codeExists === true,
      shopMint: providerHealth.healthy && shopCollection.valid && shopCollection.codeExists === true,
    },
  };
}

function toContractAddress(value: string, label: string): Address {
  const normalized = value.trim();
  if (!normalized) {
    throw new RuntimeConfigError(`${label} is not configured.`);
  }

  try {
    return Address.fromString(normalized);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RuntimeConfigError(`Invalid ${label}: ${normalized}. ${detail}`);
  }
}

export async function checkOp721Ownership(
  collectionAddress: string,
  tokenId: bigint,
  expectedOwner: string,
): Promise<boolean> {
  if (!collectionAddress || !expectedOwner.trim()) return false;

  try {
    const collection = getContract<IOP721Contract>(
      toContractAddress(collectionAddress, "collection address") as never,
      OP_721_ABI,
      getRpcProvider(),
      OPNET_NETWORK,
    );
    const result = await collection.ownerOf(tokenId);
    if (result.revert) return false;
    return addressMatchesExpected(result.properties.owner, expectedOwner);
  } catch {
    return false;
  }
}

export async function checkContractCode(
  address: string,
): Promise<{ exists: boolean; codeFingerprint?: string }> {
  try {
    const code = await getProvider().getCode(address, true);
    const codeBuffer = Buffer.isBuffer(code) ? code : Buffer.from(String(code));
    const codeFingerprint = codeBuffer.toString("hex").slice(0, 64);
    if (!codeFingerprint || /^0+$/.test(codeFingerprint)) {
      return { exists: false };
    }
    return { exists: true, codeFingerprint };
  } catch {
    return { exists: false };
  }
}

export async function readStorageSlot(address: string, pointer: string): Promise<bigint | null> {
  try {
    const stored = await getProvider().getStorageAt(address, pointer);
    return bufferToBigInt(stored.value);
  } catch {
    return null;
  }
}

export function getOpnetRpcUrl(): string {
  return OPNET_RPC_URL;
}

export function getOpnetNetwork(): string {
  return "testnet";
}
