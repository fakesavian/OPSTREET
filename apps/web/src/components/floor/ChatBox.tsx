"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { FloorChatDTO } from "@opfun/shared";
import { sendChatMessage } from "@/lib/api";
import { useWallet } from "@/components/WalletProvider";

function getAvatarEmoji(avatarId: string): string {
  const map: Record<string, string> = {
    "default-free-1": "🚀",
    "default-free-2": "🔥",
    "default-free-3": "💎",
    "default-free-4": "🌙",
    "achievement-founder": "👑",
    "achievement-caller": "📡",
    "achievement-og": "⭐",
    "paid-degen": "🎰",
    "paid-whale": "🐋",
    "paid-laser": "👀",
  };
  return map[avatarId] ?? "👤";
}

function isAuthError(error: Error & { status?: number }): boolean {
  return error.status === 401 || /auth|session/i.test(error.message);
}

interface Props {
  messages: FloorChatDTO[];
  walletAddress: string | null;
  muteUntil: string | null;
  onMessageSent: () => void;
  className?: string;
}

export function ChatBox({ messages, walletAddress, muteUntil: muteUntilProp, onMessageSent, className }: Props) {
  const { wallet, isVerified, verify, verifying } = useWallet();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [muteUntil, setMuteUntil] = useState<string | null>(muteUntilProp);
  const [muteRemaining, setMuteRemaining] = useState(0);
  const [sendError, setSendError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const providerIsManual = wallet?.provider === "manual";
  const canWrite = Boolean(walletAddress && isVerified);
  const verificationMessage = providerIsManual
    ? "Manual address mode is read-only for chat. Connect a wallet extension and sign."
    : "Sign your wallet to verify before chatting.";

  useEffect(() => {
    setMuteUntil(muteUntilProp);
  }, [muteUntilProp]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!muteUntil) {
      setMuteRemaining(0);
      return;
    }
    const update = () => {
      const remaining = new Date(muteUntil).getTime() - Date.now();
      if (remaining <= 0) {
        setMuteUntil(null);
        setMuteRemaining(0);
        return;
      }
      setMuteRemaining(remaining);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [muteUntil]);

  useEffect(() => {
    if (cooldownMs <= 0) return;
    const start = Date.now();
    const id = setInterval(() => {
      const remaining = cooldownMs - (Date.now() - start);
      if (remaining <= 0) {
        setCooldownMs(0);
        clearInterval(id);
        return;
      }
      setCooldownMs(remaining);
    }, 120);
    return () => clearInterval(id);
  }, [cooldownMs]);

  const handleSend = useCallback(async () => {
    if (!walletAddress || !input.trim() || sending || cooldownMs > 0) return;
    if (!isVerified) {
      if (providerIsManual) {
        setSendError(verificationMessage);
        return;
      }
      const ok = await verify();
      if (!ok) {
        setSendError(verificationMessage);
        return;
      }
    }

    setSending(true);
    setSendError("");
    try {
      await sendChatMessage({ content: input.trim() });
      setInput("");
      onMessageSent();
    } catch (e) {
      const err = e as Error & { retryAfterMs?: number; muteUntil?: string; status?: number };
      if (err.muteUntil) setMuteUntil(err.muteUntil);
      if (err.retryAfterMs) setCooldownMs(err.retryAfterMs);
      setSendError(isAuthError(err) ? verificationMessage : err.message);
    } finally {
      setSending(false);
    }
  }, [walletAddress, input, sending, cooldownMs, onMessageSent, isVerified, providerIsManual, verificationMessage, verify]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const isMuted = muteRemaining > 0;
  const muteSeconds = Math.ceil(muteRemaining / 1000);
  const coolSeconds = Math.ceil(cooldownMs / 1000);

  return (
    <div className={`card flex flex-col gap-2 ${className ?? "h-[320px]"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wider text-ink">Trollbox</span>
        {!walletAddress && <span className="text-[10px] text-[var(--text-muted)]">Connect wallet to chat</span>}
      </div>

      {walletAddress && !isVerified && (
        <div className="rounded-xl border-2 border-ink bg-opYellow/25 px-3 py-2 text-xs font-semibold text-ink">
          <div className="flex items-center justify-between gap-2">
            <span>{verificationMessage}</span>
            {!providerIsManual && (
              <button
                onClick={() => void verify()}
                disabled={verifying}
                className="btn-secondary shrink-0 px-2.5 py-1 text-[11px] disabled:opacity-50"
              >
                {verifying ? "Signing..." : "Sign to verify"}
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-xs text-[var(--text-muted)]">No messages yet.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-1.5 border-b border-ink/20 pb-1 text-xs last:border-0">
            <span className="shrink-0">{getAvatarEmoji(m.avatarId)}</span>
            <div>
              <span className="mr-1.5 font-black text-ink">
                {(m.displayName || m.walletAddress.slice(0, 6)).slice(0, 12)}
              </span>
              <span className="break-all text-[var(--text-secondary)]">{m.content}</span>
            </div>
          </div>
        ))}
      </div>

      {isMuted && (
        <div className="rounded-lg border-2 border-opRed bg-red-100 px-3 py-1.5 text-[11px] font-semibold text-opRed">
          Muted for {muteSeconds}s (spam detected)
        </div>
      )}

      {walletAddress && (
        <div className="mt-auto flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 200))}
            onKeyDown={handleKeyDown}
            placeholder={isMuted ? `Muted - ${muteSeconds}s remaining` : "Type a message (Enter to send)"}
            disabled={isMuted || sending || !canWrite}
            rows={1}
            className="input flex-1 resize-none py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            onClick={() => void handleSend()}
            disabled={isMuted || sending || cooldownMs > 0 || !input.trim() || !canWrite}
            className="btn-primary shrink-0 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "..." : cooldownMs > 0 ? `${coolSeconds}s` : "Send"}
          </button>
        </div>
      )}

      {sendError && !isMuted && <p className="text-[10px] font-semibold text-opRed">{sendError}</p>}
    </div>
  );
}
