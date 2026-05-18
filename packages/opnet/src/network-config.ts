export type OpnetNetworkName = "mainnet" | "regtest" | "legacy-testnet";

export interface OpnetNetworkConfig {
  network: OpnetNetworkName;
  rpcUrl: string;
  timeoutMs: number;
  bitcoinNetworkKey: "bitcoin" | "regtest" | "testnet";
}

export interface OpnetWalletNetworkConfig {
  network: OpnetNetworkName;
  rpcUrl: string;
  bitcoinNetworkKey: OpnetNetworkConfig["bitcoinNetworkKey"];
  /** Network name expected by browser OP_WALLET switchNetwork/getNetwork APIs. */
  walletNetwork: "mainnet" | "regtest" | "testnet";
  /** OP_NET P2OP address HRP for this network flavor. */
  opnetAddressHrp: "op" | "opr" | "opt";
  /** Bitcoin BIP-322/P2TR address HRP for this network flavor. */
  bitcoinAddressHrp: "bc" | "bcrt" | "tb";
}

export const DEFAULT_OPNET_RPC_URLS: Record<OpnetNetworkName, string> = {
  mainnet: "https://mainnet.opnet.org",
  regtest: "https://regtest.opnet.org",
  "legacy-testnet": "https://testnet.opnet.org",
};

export const OP_NET_ADDRESS_HRPS = ["op", "opr", "opt"] as const;
export const BITCOIN_ADDRESS_HRPS = ["bc", "bcrt", "tb"] as const;

export function normalizeOpnetNetworkName(value: string | undefined): OpnetNetworkName {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "regtest") return "regtest";
  if (normalized === "mainnet" || normalized === "bitcoin") return "mainnet";
  if (normalized === "testnet" || normalized === "legacy-testnet" || normalized === "legacy_testnet") {
    return "legacy-testnet";
  }
  throw new Error(`Unsupported OPNET_NETWORK "${value}". Expected one of: mainnet, regtest, legacy-testnet.`);
}

export function inferOpnetNetworkFromRpcUrl(rpcUrl: string): OpnetNetworkName | null {
  const normalized = rpcUrl.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("regtest.opnet.org")) return "regtest";
  if (normalized.includes("mainnet.opnet.org")) return "mainnet";
  if (normalized.includes("testnet.opnet.org")) return "legacy-testnet";
  return null;
}

export function resolveOpnetNetworkName(explicitNetwork: string | undefined, rpcUrlOverride = ""): OpnetNetworkName {
  if ((explicitNetwork ?? "").trim()) return normalizeOpnetNetworkName(explicitNetwork);
  return inferOpnetNetworkFromRpcUrl(rpcUrlOverride) ?? "regtest";
}

export function getBitcoinNetworkKey(network: OpnetNetworkName): OpnetNetworkConfig["bitcoinNetworkKey"] {
  if (network === "mainnet") return "bitcoin";
  if (network === "legacy-testnet") return "testnet";
  return "regtest";
}

export function getDefaultOpnetRpcUrl(network: OpnetNetworkName): string {
  return DEFAULT_OPNET_RPC_URLS[network];
}

export function getOpnetJsonRpcUrlFromRpcUrl(rpcUrl: string): string {
  const normalized = rpcUrl.trim().replace(/\/+$/, "");
  if (normalized.endsWith("/api/v1/json-rpc")) return normalized;
  return `${normalized}/api/v1/json-rpc`;
}

export function getOpnetWalletNetworkConfig(
  network: OpnetNetworkName,
  rpcUrl = getDefaultOpnetRpcUrl(network),
): OpnetWalletNetworkConfig {
  if (network === "mainnet") {
    return {
      network,
      rpcUrl,
      bitcoinNetworkKey: "bitcoin",
      walletNetwork: "mainnet",
      opnetAddressHrp: "op",
      bitcoinAddressHrp: "bc",
    };
  }

  if (network === "legacy-testnet") {
    return {
      network,
      rpcUrl,
      bitcoinNetworkKey: "testnet",
      walletNetwork: "testnet",
      opnetAddressHrp: "opt",
      bitcoinAddressHrp: "tb",
    };
  }

  return {
    network,
    rpcUrl,
    bitcoinNetworkKey: "regtest",
    walletNetwork: "regtest",
    opnetAddressHrp: "opr",
    bitcoinAddressHrp: "bcrt",
  };
}

export function normalizeWalletNetworkName(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value.trim().toLowerCase();
  if (!value || typeof value !== "object") return undefined;

  const obj = value as Record<string, unknown>;
  for (const key of ["network", "name", "chain", "id"]) {
    const field = obj[key];
    if (typeof field === "string" && field.trim().length > 0) return field.trim().toLowerCase();
  }

  return undefined;
}

export function isWalletNetworkCompatible(reportedNetwork: string | undefined, target: OpnetNetworkName): boolean {
  const normalized = normalizeWalletNetworkName(reportedNetwork);
  if (!normalized) return false;

  const config = getOpnetWalletNetworkConfig(target);
  if (normalized === target || normalized === config.walletNetwork) return true;

  if (target === "mainnet") return normalized.includes("mainnet") || normalized === "bitcoin";
  if (target === "regtest") return normalized.includes("regtest");
  return normalized.includes("testnet") || normalized.includes("legacy-testnet");
}
