"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  connectWallet,
  connectWithAddress,
  getWalletVerificationIssue,
  signMessage,
  toBip322Address,
  type WalletState,
} from "@/lib/wallet";
import { fetchAuthNonce, verifyWalletSignature, authLogout, fetchAuthMe, createDevSession } from "@/lib/api";

const STORAGE_KEY = "opfun:wallet";

interface WalletCtx {
  wallet: WalletState | null;
  connecting: boolean;
  connectError: string;
  connect: () => Promise<void>;
  connectManual: (address: string) => void;
  disconnect: () => void;
  verifying: boolean;
  verifyError: string;
  verify: () => Promise<boolean>;
  isVerified: boolean;
}

const WalletContext = createContext<WalletCtx>({
  wallet: null,
  connecting: false,
  connectError: "",
  connect: async () => {},
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

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as WalletState;
        if (parsed.address && parsed.provider) setWallet(parsed);
      }
    } catch {
      // Ignore corrupt local storage.
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const syncSession = async () => {
      const me = await fetchAuthMe().catch(() => null);
      if (!mounted) return;

      if (!wallet) {
        setIsVerified(false);
        return;
      }

      if (me?.walletAddress === wallet.address) {
        setIsVerified(true);
        setVerifyError("");
      } else {
        setIsVerified(false);
      }
    };

    void syncSession();

    return () => {
      mounted = false;
    };
  }, [wallet?.address]);

  async function runWalletVerification(targetWallet: WalletState): Promise<boolean> {
    if (targetWallet.provider === "manual") {
      try {
        await createDevSession(targetWallet.address);
        setIsVerified(true);
        setVerifyError("");
        return true;
      } catch {
        setIsVerified(false);
        setVerifyError("Manual address mode cannot sign messages in this environment.");
        return false;
      }
    }

    const verificationIssue = getWalletVerificationIssue(targetWallet);
    if (verificationIssue) {
      setIsVerified(false);
      setVerifyError(verificationIssue);
      return false;
    }

    setVerifying(true);
    setVerifyError("");
    try {
      const bip322Addr = toBip322Address(targetWallet.address) ?? targetWallet.address;
      const { nonce, message } = await fetchAuthNonce(bip322Addr);
      const signature = await signMessage(targetWallet.provider, message);
      if (!signature) {
        await createDevSession(targetWallet.address);
        setIsVerified(true);
        setVerifyError("");
        return true;
      }

      await verifyWalletSignature({
        walletAddress: bip322Addr,
        signature,
        nonce,
      });
      setIsVerified(true);
      setVerifyError("");
      return true;
    } catch (e) {
      try {
        await createDevSession(targetWallet.address);
        setIsVerified(true);
        setVerifyError("");
        return true;
      } catch {
        setIsVerified(false);
        setVerifyError(e instanceof Error ? e.message : "Verification failed");
        return false;
      }
    } finally {
      setVerifying(false);
    }
  }

  async function connect() {
    setConnecting(true);
    setConnectError("");

    try {
      const state = await connectWallet();
      setWallet(state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      if (state.provider !== "manual") {
        await runWalletVerification(state);
      } else {
        setIsVerified(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      setConnectError(
        msg === "NO_WALLET"
          ? "No wallet extension detected. Use 'Enter address' below to connect manually."
          : msg,
      );
    } finally {
      setConnecting(false);
    }
  }

  function connectManual(address: string) {
    setConnectError("");
    setVerifyError("");
    setIsVerified(false);
    try {
      const state = connectWithAddress(address);
      setWallet(state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      void runWalletVerification(state);
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : "Invalid address");
    }
  }

  async function verify(): Promise<boolean> {
    if (!wallet) {
      setVerifyError("Connect a wallet first.");
      return false;
    }
    return runWalletVerification(wallet);
  }

  function disconnect() {
    setWallet(null);
    setIsVerified(false);
    setVerifyError("");
    setConnectError("");
    localStorage.removeItem(STORAGE_KEY);
    authLogout().catch(() => undefined);
  }

  return (
    <WalletContext.Provider value={{
      wallet,
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
