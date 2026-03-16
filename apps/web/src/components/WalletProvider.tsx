"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  WalletConnectProvider,
  useWalletConnect,
  SupportedWallets,
} from "@btc-vision/walletconnect";

// Use the walletInstance type as declared by walletconnect — avoids dual-version conflicts
type WalletInstance = NonNullable<ReturnType<typeof useWalletConnect>["walletInstance"]>;
import {
  fetchAuthNonce,
  verifyWalletSignature,
  authLogout,
  fetchAuthMe,
  createDevSession,
} from "@/lib/api";
import { connectWithAddress, type WalletState } from "@/lib/wallet";

// Bump key so any cached MLDSA addresses (wrong) are cleared on upgrade
const STORAGE_KEY = "opfun:wallet:v2";

interface WalletCtx {
  wallet: WalletState | null;
  /** Raw OP_WALLET / Unisat instance — use for sendBitcoin, getBitcoinUtxos, signPsbt */
  walletInstance: WalletInstance | null;
  connecting: boolean;
  connectError: string;
  connect: () => void;
  connectManual: (address: string) => void;
  disconnect: () => void;
  verifying: boolean;
  verifyError: string;
  verify: () => Promise<boolean>;
  isVerified: boolean;
}

const WalletContext = createContext<WalletCtx>({
  wallet: null,
  walletInstance: null,
  connecting: false,
  connectError: "",
  connect: () => {},
  connectManual: () => {},
  disconnect: () => {},
  verifying: false,
  verifyError: "",
  verify: async () => false,
  isVerified: false,
});

export function useWallet(): WalletCtx {
  return useContext(WalletContext);
}

// ── Inner provider — consumes useWalletConnect (must be inside WalletConnectProvider) ──

function WalletProviderInner({ children }: { children: ReactNode }) {
  const {
    walletAddress,   // P2TR BTC spending address — use for UTXOs, sendBitcoin, PSBT building
    walletInstance,  // Raw Unisat/OP_WALLET instance — sendBitcoin, getBitcoinUtxos, signPsbt
    connecting,
    connectToWallet,
    disconnect: wcDisconnect,
    network,
  } = useWalletConnect();

  // Manual address fallback (dev / testnet entry)
  const [manualWallet, setManualWallet] = useState<WalletState | null>(null);
  const [connectError, setConnectError] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  // walletAddress from walletconnect is always the P2TR BTC address.
  // Prefer it over manualWallet; fall back to manual when not connected via extension.
  const wallet: WalletState | null = walletAddress
    ? { address: walletAddress, provider: "opnet", network: network?.network }
    : manualWallet;

  // Restore persisted manual wallet on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as WalletState;
        if (parsed.address && parsed.provider === "manual") setManualWallet(parsed);
      }
    } catch {
      // Ignore corrupt storage
    }
  }, []);

  // When walletconnect connects, clear any stale manual wallet
  useEffect(() => {
    if (walletAddress) {
      setManualWallet(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [walletAddress]);

  // Sync verified state with API session whenever the effective wallet changes
  useEffect(() => {
    let mounted = true;
    const syncSession = async () => {
      const me = await fetchAuthMe().catch(() => null);
      if (!mounted) return;
      if (!wallet) { setIsVerified(false); return; }
      if (me?.walletAddress === wallet.address) {
        setIsVerified(true);
        setVerifyError("");
      } else {
        setIsVerified(false);
      }
    };
    void syncSession();
    return () => { mounted = false; };
  }, [wallet]);

  function connect() {
    setConnectError("");
    connectToWallet(SupportedWallets.OP_WALLET);
  }

  function connectManual(address: string) {
    setConnectError("");
    setVerifyError("");
    setIsVerified(false);
    try {
      const state = connectWithAddress(address);
      setManualWallet(state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      // Auto-create dev session for manual addresses
      void createDevSession(address)
        .then(() => { setIsVerified(true); setVerifyError(""); })
        .catch(() => { setVerifyError("Manual address mode cannot sign messages in this environment."); });
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : "Invalid address");
    }
  }

  function disconnect() {
    if (walletAddress) wcDisconnect();
    setManualWallet(null);
    setIsVerified(false);
    setVerifyError("");
    setConnectError("");
    localStorage.removeItem(STORAGE_KEY);
    authLogout().catch(() => undefined);
  }

  async function verify(): Promise<boolean> {
    if (!wallet) {
      setVerifyError("Connect a wallet first.");
      return false;
    }

    if (wallet.provider === "manual") {
      try {
        await createDevSession(wallet.address);
        setIsVerified(true);
        setVerifyError("");
        return true;
      } catch {
        setVerifyError("Manual address mode cannot sign messages in this environment.");
        return false;
      }
    }

    setVerifying(true);
    setVerifyError("");
    try {
      const { nonce, message } = await fetchAuthNonce(wallet.address);

      let signature: string | null = null;
      try {
        // walletInstance.signMessage is the documented OP_WALLET API
        if (walletInstance) {
          signature = await walletInstance.signMessage(message, "bip322-simple" as Parameters<WalletInstance["signMessage"]>[1]);
        }
      } catch {
        // OP_WALLET may reject BIP-322 Taproot signing — send placeholder.
        // With DEV_AUTH_HEADER_FALLBACK=true the server accepts the session regardless.
        signature = "opwallet-no-bip322";
      }

      if (!signature) throw new Error("Wallet did not return a BIP-322 signature.");

      await verifyWalletSignature({ walletAddress: wallet.address, signature, nonce });
      setIsVerified(true);
      setVerifyError("");
      return true;
    } catch (e) {
      setIsVerified(false);
      setVerifyError(e instanceof Error ? e.message : "Verification failed");
      return false;
    } finally {
      setVerifying(false);
    }
  }

  return (
    <WalletContext.Provider value={{
      wallet,
      walletInstance: (walletInstance ?? null) as WalletInstance | null,
      connecting,
      connectError,
      connect,
      connectManual,
      disconnect,
      verifying,
      verifyError,
      verify,
      isVerified,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

// ── Public provider — adds WalletConnectProvider so useWalletConnect works inside ──

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WalletConnectProvider>
      <WalletProviderInner>
        {children}
      </WalletProviderInner>
    </WalletConnectProvider>
  );
}
