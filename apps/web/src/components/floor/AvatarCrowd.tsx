"use client";

import { useState } from "react";
import type { FloorPresenceDTO, FloorCalloutDTO, FloorTickerDTO } from "@opfun/shared";
import { AvatarFigure } from "./AvatarFigure";
import { StageScreen } from "./StageScreen";
import { PixelFloorCanvas } from "./PixelFloorCanvas";

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic pseudo-random number from seed [0, 1) */
function seededRand(seed: number, offset: number): number {
  const x = Math.sin(seed + offset) * 10000;
  return x - Math.floor(x);
}

interface Props {
  presence: FloorPresenceDTO[];
  walletAddress: string | null;
  latestCallout: FloorCalloutDTO | null;
  /** Full callout list used to compute busyness frequency */
  callouts?: FloorCalloutDTO[];
  ticker: FloorTickerDTO[];
  onJoinClick?: () => void;
  mobile?: boolean;
  /** Desktop command-center mode: skip stage, fill parent with crowd only */
  crowdOnly?: boolean;
}

export function AvatarCrowd({
  presence,
  walletAddress,
  latestCallout,
  callouts = [],
  ticker,
  onJoinClick,
  mobile = false,
  crowdOnly = false,
}: Props) {
  const [spawnSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000));
  const MAX_AVATARS = mobile ? 12 : 30;
  const displayed = presence.slice(0, MAX_AVATARS);
  const overflow = presence.length - MAX_AVATARS;

  // Compute callout frequency from recency (last 60 seconds)
  const now = Date.now();
  const recentCallouts = callouts.filter((c) => now - new Date(c.createdAt).getTime() < 60_000);
  const calloutFrequency: "low" | "medium" | "high" =
    recentCallouts.length > 8 ? "high"
      : recentCallouts.length > 3 ? "medium"
        : "low";

  // ── crowdOnly mode: fill parent height with pixel floor + crowd ────────
  if (crowdOnly) {
    return (
      <div className="relative h-full w-full overflow-hidden">
        {/* Pixel-art tiled floor + animated NPC traders */}
        <PixelFloorCanvas presence={presence} spawnSeed={spawnSeed} />

        {/* Overlay: empty state prompt */}
        {displayed.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
            <p className="text-sm font-semibold text-zinc-300 drop-shadow-lg">The floor is quiet…</p>
            {!walletAddress && (
              <p className="text-xs text-zinc-400 drop-shadow">Connect your wallet to join.</p>
            )}
            {walletAddress && (
              <button onClick={onJoinClick} className="btn-primary text-xs px-4 py-2">
                Enter the Floor
              </button>
            )}
          </div>
        )}

        {/* Overlay: speech bubbles for real users (positioned above their canvas sprite) */}
        {displayed.map((entry) => {
          const seed = hashStr(`${entry.walletAddress}:${spawnSeed}`);
          const posX = 0.08 + seededRand(seed, 0) * 0.84;
          const posY = 0.08 + seededRand(seed, 1) * 0.72;
          return (
            <AvatarFigure
              key={entry.walletAddress}
              entry={entry}
              latestCallout={latestCallout}
              size="md"
              posX={posX}
              posY={posY}
              calloutFrequency={calloutFrequency}
              bubbleOnly
            />
          );
        })}

        {overflow > 0 && (
          <div className="absolute bottom-2 right-2 z-10 rounded-full border border-amber-900/60 bg-amber-950/80 px-2 py-0.5 text-[10px] text-amber-200 font-mono">
            +{overflow} more
          </div>
        )}
      </div>
    );
  }

  // ── Normal mode (mobile / old desktop card): stage + crowd ─────────────
  const venueHeight = mobile ? 200 : 320;
  const stageHeight = Math.round(venueHeight * 0.38);
  const crowdHeight = venueHeight - stageHeight - 2;

  const speakerCones = [0, 1, 2];

  return (
    <div className="card flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Floor</span>
        {walletAddress && (
          <button
            onClick={onJoinClick}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
          >
            Change Avatar
          </button>
        )}
      </div>

      {/* ── Venue container ─────────────────────────────────────────────── */}
      <div
        className="relative w-full overflow-hidden rounded-xl border border-zinc-800"
        style={{ height: `${venueHeight}px` }}
      >
        {/* ── STAGE AREA (top 38%) ────────────────────────────────────── */}
        <div
          className="relative w-full overflow-hidden"
          style={{
            height: `${stageHeight}px`,
            background: "linear-gradient(180deg, #2d1f1a 0%, #1a1412 100%)",
          }}
        >
          {!mobile && (
            <div className="absolute left-0 top-0 bottom-0 flex w-12 flex-col items-center justify-center gap-2 px-2">
              {speakerCones.map((i) => (
                <div key={i} className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-zinc-700" />
                </div>
              ))}
            </div>
          )}
          {!mobile && (
            <div className="absolute right-0 top-0 bottom-0 flex w-12 flex-col items-center justify-center gap-2 px-2">
              {speakerCones.map((i) => (
                <div key={i} className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-zinc-700" />
                </div>
              ))}
            </div>
          )}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded bg-black border-2 border-zinc-700"
            style={{ width: mobile ? "75%" : "55%", height: "80%" }}
          >
            <StageScreen ticker={ticker} />
          </div>
        </div>

        {/* Stage platform edge */}
        <div className="w-full bg-zinc-600" style={{ height: "2px" }} />

        {/* ── CROWD AREA (bottom 62%) — pixel floor ────────────────────── */}
        <div
          className="relative w-full overflow-hidden"
          style={{ height: `${crowdHeight}px` }}
        >
          {/* Pixel-art tiled floor + animated NPC traders */}
          <PixelFloorCanvas presence={presence} mobile={mobile} spawnSeed={spawnSeed} />

          {/* Overlay: empty state */}
          {displayed.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
              <p className="text-sm font-semibold text-zinc-300 drop-shadow-lg">The floor is quiet…</p>
              {!walletAddress && (
                <p className="text-xs text-zinc-400 drop-shadow">Connect your wallet to join.</p>
              )}
              {walletAddress && (
                <button onClick={onJoinClick} className="btn-primary text-xs px-4 py-2">
                  Enter the Floor
                </button>
              )}
            </div>
          )}

          {/* Overlay: speech bubbles for real users */}
          {displayed.map((entry) => {
            const seed = hashStr(`${entry.walletAddress}:${spawnSeed}`);
            const posX = 0.08 + seededRand(seed, 0) * 0.84;
            const posY = 0.08 + seededRand(seed, 1) * 0.72;
            return (
              <AvatarFigure
                key={entry.walletAddress}
                entry={entry}
                latestCallout={latestCallout}
                size={mobile ? "sm" : "md"}
                posX={posX}
                posY={posY}
                calloutFrequency={calloutFrequency}
                bubbleOnly
              />
            );
          })}

          {overflow > 0 && (
            <div className="absolute bottom-2 right-2 z-10 rounded-full border border-amber-900/60 bg-amber-950/80 px-2 py-0.5 text-[10px] text-amber-200 font-mono">
              +{overflow} more
            </div>
          )}
        </div>
      </div>

      {walletAddress && displayed.length > 0 && (
        <div className="mt-2 text-center">
          <button onClick={onJoinClick} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            Not visible? Click to join →
          </button>
        </div>
      )}
    </div>
  );
}
