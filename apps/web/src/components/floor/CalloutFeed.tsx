"use client";

import { useState, useCallback } from "react";
import type { FloorCalloutDTO, FloorTickerDTO } from "@opfun/shared";
import { postCallout, reactToCallout } from "@/lib/api";
import { useWallet } from "@/components/WalletProvider";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function formatCooldown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getRiskColor(status: string | null, score: number | null): string {
  if (status === "FLAGGED" || score === null) return "";
  if (score >= 70) return "text-red-500";
  if (score >= 40) return "text-orange-500";
  return "text-green-600";
}

function isAuthError(error: Error & { status?: number }): boolean {
  return error.status === 401 || /auth|session/i.test(error.message);
}

interface Props {
  callouts: FloorCalloutDTO[];
  walletAddress: string | null;
  ticker: FloorTickerDTO[];
  onCalloutPosted: () => void;
  onReacted: () => void;
  className?: string;
}

export function CalloutFeed({ callouts, walletAddress, ticker, onCalloutPosted, onReacted, className }: Props) {
  const { wallet, isVerified, verify, verifying } = useWallet();
  const [content, setContent] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const providerIsManual = wallet?.provider === "manual";
  const canWrite = Boolean(walletAddress && isVerified);

  const [optimisticReactions, setOptimisticReactions] = useState<
    Record<string, { upCount: number; downCount: number; userReaction: "UP" | "DOWN" | null }>
  >({});

  const verificationMessage = providerIsManual
    ? "Manual address mode is read-only for callouts. Connect a wallet extension and sign."
    : "Sign your wallet to verify before posting or reacting.";

  const handleSubmit = useCallback(async () => {
    if (!walletAddress || !content.trim()) return;
    if (!isVerified) {
      if (providerIsManual) {
        setError(verificationMessage);
        return;
      }
      const ok = await verify();
      if (!ok) {
        setError(verificationMessage);
        return;
      }
    }

    setSubmitting(true);
    setError("");
    try {
      await postCallout({
        content: content.trim(),
        projectId: selectedProject || null,
      });
      setContent("");
      setSelectedProject("");
      setShowForm(false);
      onCalloutPosted();
    } catch (e) {
      const err = e as Error & { retryAfterMs?: number; status?: number };
      if (err.retryAfterMs) {
        setCooldownMs(err.retryAfterMs);
        setTimeout(() => setCooldownMs(0), err.retryAfterMs);
      }
      setError(isAuthError(err) ? verificationMessage : err.message);
    } finally {
      setSubmitting(false);
    }
  }, [walletAddress, content, selectedProject, onCalloutPosted, isVerified, providerIsManual, verificationMessage, verify]);

  const handleReact = useCallback(
    async (calloutId: string, reaction: "UP" | "DOWN") => {
      if (!walletAddress) return;
      if (!isVerified) {
        if (providerIsManual) {
          setError(verificationMessage);
          return;
        }
        const ok = await verify();
        if (!ok) {
          setError(verificationMessage);
          return;
        }
      }

      const current = callouts.find((c) => c.id === calloutId);
      if (!current) return;

      const prev = optimisticReactions[calloutId] ?? {
        upCount: current.upCount,
        downCount: current.downCount,
        userReaction: current.userReaction,
      };
      const wasUp = prev.userReaction === "UP";
      const wasDown = prev.userReaction === "DOWN";
      const newUp =
        reaction === "UP" ? prev.upCount + (wasUp ? 0 : 1) : prev.upCount - (wasUp ? 1 : 0);
      const newDown =
        reaction === "DOWN"
          ? prev.downCount + (wasDown ? 0 : 1)
          : prev.downCount - (wasDown ? 1 : 0);

      setOptimisticReactions((state) => ({
        ...state,
        [calloutId]: { upCount: newUp, downCount: newDown, userReaction: reaction },
      }));

      try {
        await reactToCallout(calloutId, { reaction });
        onReacted();
      } catch (e) {
        setOptimisticReactions((state) => {
          const copy = { ...state };
          delete copy[calloutId];
          return copy;
        });

        const err = e as Error & { status?: number };
        if (isAuthError(err)) setError(verificationMessage);
      }
    },
    [walletAddress, isVerified, providerIsManual, verificationMessage, callouts, optimisticReactions, onReacted, verify],
  );

  return (
    <div className={`card flex flex-col gap-2.5 ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wider text-ink">Alpha Callouts</span>
        {walletAddress && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            disabled={cooldownMs > 0 || !canWrite}
            className="btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cooldownMs > 0 ? `Available in ${formatCooldown(cooldownMs)}` : "+ Post"}
          </button>
        )}
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

      {showForm && walletAddress && (
        <div className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-[var(--panel-cream)] p-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 280))}
            placeholder="Share your callout (max 280 chars)"
            rows={3}
            className="input resize-none text-sm"
          />
          <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text-muted)]">
            <span>{content.length}/280</span>
          </div>
          {ticker.length > 0 && (
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="input text-xs"
            >
              <option value="">- No specific token -</option>
              {ticker.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.ticker} · {t.name}
                </option>
              ))}
            </select>
          )}
          {error && <p className="text-xs font-semibold text-opRed">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitting || !content.trim() || !canWrite}
              className="btn-primary flex-1 py-1.5 text-xs disabled:opacity-50"
            >
              {submitting ? "Posting..." : "Post Callout"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setError("");
              }}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="rounded-lg border-2 border-ink bg-opYellow/20 px-3 py-1.5 text-[10px] font-bold text-ink">
        Sentiment signals only. No trade execution.
      </p>

      <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {callouts.length === 0 && (
          <p className="py-6 text-center text-xs text-[var(--text-muted)]">No callouts yet.</p>
        )}
        {callouts.map((c) => {
          const rxn = optimisticReactions[c.id] ?? c;
          return (
            <div
              key={c.id}
              className="flex flex-col gap-1.5 rounded-xl border-2 border-ink bg-[var(--panel-cream)] p-3"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{getAvatarEmoji(c.avatarId)}</span>
                <span className="max-w-[105px] truncate text-xs font-black text-ink">{c.displayName}</span>
                {c.projectTicker && (
                  <span
                    className={`ml-auto rounded border px-1.5 py-0.5 text-[10px] font-black ${
                      c.projectStatus === "FLAGGED"
                        ? "border-opRed bg-red-100 text-opRed"
                        : "border-ink bg-opYellow/20 text-ink"
                    }`}
                  >
                    {c.projectTicker}
                    {c.projectRiskScore !== null && (
                      <span className={`ml-1 ${getRiskColor(c.projectStatus, c.projectRiskScore)}`}>
                        R:{c.projectRiskScore}
                      </span>
                    )}
                  </span>
                )}
              </div>

              <p className="break-words text-sm text-ink">{c.content}</p>

              <div className="mt-0.5 flex items-center gap-2">
                <button
                  onClick={() => handleReact(c.id, "UP")}
                  disabled={!canWrite}
                  className={`flex items-center gap-1 rounded-lg border-2 px-2 py-0.5 text-xs font-bold transition-colors disabled:cursor-not-allowed ${
                    rxn.userReaction === "UP"
                      ? "border-green-700 bg-green-100 text-green-700"
                      : "border-ink bg-[var(--panel-cream)] text-ink hover:bg-green-50"
                  }`}
                >
                  👍 {rxn.upCount}
                </button>
                <button
                  onClick={() => handleReact(c.id, "DOWN")}
                  disabled={!canWrite}
                  className={`flex items-center gap-1 rounded-lg border-2 px-2 py-0.5 text-xs font-bold transition-colors disabled:cursor-not-allowed ${
                    rxn.userReaction === "DOWN"
                      ? "border-opRed bg-red-100 text-opRed"
                      : "border-ink bg-[var(--panel-cream)] text-ink hover:bg-red-50"
                  }`}
                >
                  👎 {rxn.downCount}
                </button>
                <span className="ml-auto text-[10px] font-bold text-[var(--text-muted)]">
                  {new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
