"use client";

import { useEffect, useState } from "react";
import type { FloorCalloutDTO, FloorPresenceDTO } from "@opfun/shared";
import { PixelAvatarPreview } from "./PixelAvatarPreview";

// Map avatar ID → emoji + color (matches seed data)
const AVATAR_MAP: Record<string, { emoji: string; bg: string }> = {
  "default-free-1": { emoji: "🚀", bg: "bg-blue-600" },
  "default-free-2": { emoji: "🔥", bg: "bg-orange-600" },
  "default-free-3": { emoji: "💎", bg: "bg-cyan-600" },
  "default-free-4": { emoji: "🌙", bg: "bg-indigo-700" },
  "achievement-founder": { emoji: "👑", bg: "bg-yellow-600" },
  "achievement-caller": { emoji: "📡", bg: "bg-green-700" },
  "achievement-og": { emoji: "⭐", bg: "bg-purple-700" },
  "paid-degen": { emoji: "🎰", bg: "bg-red-700" },
  "paid-whale": { emoji: "🐋", bg: "bg-blue-800" },
  "paid-laser": { emoji: "👀", bg: "bg-rose-600" },
};

const DEFAULT_COLORS = [
  "bg-blue-600", "bg-orange-600", "bg-cyan-600", "bg-indigo-700",
  "bg-green-700", "bg-purple-700", "bg-red-700", "bg-rose-600",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getAvatarDisplay(avatarId: string, walletAddress: string) {
  const mapped = AVATAR_MAP[avatarId];
  if (mapped) return mapped;
  return {
    emoji: "👤",
    bg: DEFAULT_COLORS[hashStr(walletAddress) % DEFAULT_COLORS.length]!,
  };
}

// Adaptive bubble duration by floor busyness
const BUBBLE_DURATION_MS = { low: 7000, medium: 5000, high: 3000 } as const;

interface Props {
  entry: FloorPresenceDTO;
  latestCallout: FloorCalloutDTO | null;
  size?: "sm" | "md";
  /** Deterministic position within container [0, 1] */
  posX: number;
  posY: number;
  calloutFrequency?: "low" | "medium" | "high";
  /** When true, render only the speech bubble overlay (canvas handles character) */
  bubbleOnly?: boolean;
}

export function AvatarFigure({ entry, latestCallout, size = "md", posX, posY, calloutFrequency = "low", bubbleOnly = false }: Props) {
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleText, setBubbleText] = useState("");

  const { emoji, bg } = getAvatarDisplay(entry.avatarId, entry.walletAddress);
  const shortName = (entry.displayName || entry.walletAddress.slice(0, 6)).slice(0, 8);

  // Size variants for pixel person
  const headClass = size === "sm" ? "w-5 h-5 text-xs" : "w-6 h-6 text-sm";
  const body = size === "sm" ? { w: 6, h: 14 } : { w: 8, h: 18 };
  const leg = size === "sm" ? { w: 3, h: 8 } : { w: 4, h: 10 };

  const durationMs = BUBBLE_DURATION_MS[calloutFrequency];

  // Show speech bubble when a new callout comes from this wallet
  useEffect(() => {
    if (
      latestCallout &&
      latestCallout.walletAddress === entry.walletAddress &&
      latestCallout.content
    ) {
      setBubbleText(latestCallout.content.slice(0, 80));
      setShowBubble(true);
      const timer = setTimeout(() => setShowBubble(false), durationMs);
      return () => clearTimeout(timer);
    }
  }, [latestCallout, entry.walletAddress, durationMs]);

  // ── bubbleOnly mode: only render the speech bubble at the correct position ──
  if (bubbleOnly) {
    if (!showBubble) return null;
    return (
      <div
        className="absolute z-20 pointer-events-none"
        style={{
          left: `${posX * 85}%`,
          top: `${posY * 80}%`,
          transform: "translate(-50%, -100%)",
        }}
      >
        <div
          className="max-w-[140px] rounded-lg border border-amber-800/60 bg-amber-950/90 px-2 py-1.5 text-[10px] text-amber-100 shadow-lg backdrop-blur-sm"
          style={{
            animation: `fadeInOut ${durationMs}ms ease-in-out forwards`,
          }}
        >
          {bubbleText}
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-0 w-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-amber-800/60" />
        </div>
        <style>{`
          @keyframes fadeInOut {
            0%   { opacity: 0; transform: translateY(4px); }
            10%  { opacity: 1; transform: translateY(0); }
            80%  { opacity: 1; }
            100% { opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  // ── Full rendering mode for non-pixel-floor contexts ─────────
  return (
    <div
      className="absolute flex flex-col items-center gap-0"
      style={{
        left: `${posX * 85}%`,
        top: `${posY * 80}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      {/* Speech bubble */}
      {showBubble && (
        <div
          className="absolute bottom-full mb-2 max-w-[140px] rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-[10px] text-zinc-200 shadow-lg"
          style={{
            animation: `fadeInOut var(--bubble-duration, ${durationMs}ms) ease-in-out forwards`,
            ["--bubble-duration" as string]: `${durationMs}ms`,
            zIndex: 10,
          }}
        >
          {bubbleText}
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-0 w-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-zinc-700" />
        </div>
      )}

      {/* Character — pixel sprite for sprite-* and default-free-* IDs, emoji figure otherwise */}
      {(entry.avatarId.startsWith("sprite-") || entry.avatarId.startsWith("default-free-")) ? (
        <PixelAvatarPreview
          avatarId={entry.avatarId}
          walletAddress={entry.walletAddress}
          frameWidth={size === "sm" ? 20 : 26}
          showShadow={false}
        />
      ) : (
        <>
          {/* HEAD — emoji circle */}
          <div
            className={`${headClass} ${bg} flex items-center justify-center rounded-full border border-white/10 font-bold`}
          >
            {emoji}
          </div>

          {/* BODY — rectangle */}
          <div
            className={`${bg} border border-white/5`}
            style={{ width: body.w, height: body.h, filter: "brightness(0.85)" }}
          />

          {/* LEGS — two side-by-side rectangles */}
          <div className="flex gap-px">
            <div className={bg} style={{ width: leg.w, height: leg.h, filter: "brightness(0.7)" }} />
            <div className={bg} style={{ width: leg.w, height: leg.h, filter: "brightness(0.7)" }} />
          </div>
        </>
      )}

      {/* Display name */}
      <span className="mt-0.5 max-w-[60px] truncate rounded bg-zinc-900/80 px-1 text-[9px] text-zinc-300">
        {shortName}
      </span>

      <style>{`
        @keyframes fadeInOut {
          0%   { opacity: 0; transform: translateY(4px); }
          10%  { opacity: 1; transform: translateY(0); }
          80%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

