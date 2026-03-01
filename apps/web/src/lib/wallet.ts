/**
 * Wallet abstraction — supports Unisat and OKX Bitcoin wallets.
 * Called only from "use client" components (WalletProvider).
 * No real transactions — used for identity/address only on testnet.
 */

export type WalletProviderType = "unisat" | "okx";

export interface WalletState {
  address: string;
  provider: WalletProviderType;
}

// Typed declarations for injected wallet globals
interface UnisatProvider {
  requestAccounts: () => Promise<string[]>;
  getAccounts: () => Promise<string[]>;
}

interface OKXBitcoinProvider {
  connect: () => Promise<{ address: string }>;
}

function getUnisat(): UnisatProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { unisat?: UnisatProvider }).unisat;
}

function getOKX(): OKXBitcoinProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const win = window as unknown as { okxwallet?: { bitcoin?: OKXBitcoinProvider } };
  return win.okxwallet?.bitcoin;
}

export async function connectWallet(): Promise<WalletState> {
  if (typeof window === "undefined") {
    throw new Error("Wallet is not available server-side.");
  }

  const unisat = getUnisat();
  if (unisat) {
    const accounts = await unisat.requestAccounts();
    const address = accounts[0];
    if (!address) throw new Error("No account returned from Unisat.");
    return { address, provider: "unisat" };
  }

  const okx = getOKX();
  if (okx) {
    const result = await okx.connect();
    if (!result.address) throw new Error("No address returned from OKX Wallet.");
    return { address: result.address, provider: "okx" };
  }

  throw new Error(
    "No compatible wallet found. Install Unisat Wallet to connect to OP_NET Testnet.",
  );
}

export function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 7)}…${address.slice(-5)}`;
}
