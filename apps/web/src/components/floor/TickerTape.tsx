"use client";

import type { FloorTickerDTO } from "@opfun/shared";

interface Props {
  items: FloorTickerDTO[];
}

function riskDot(riskScore: number | null): string {
  if (riskScore === null) return "";
  if (riskScore >= 70) return "🔴";
  if (riskScore >= 40) return "🟡";
  return "🟢";
}

export function TickerTape({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="border-b-3 border-ink bg-black px-4 py-2 text-xs text-opYellow/40">
        No tokens on the ticker yet.
      </div>
    );
  }

  // Duration scales with token count for consistent per-token speed
  const durationSec = Math.max(20, items.length * 3);

  const chips = items.map((item) => (
    <a
      key={item.id}
      href={`/p/${item.slug}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-opYellow/50 bg-ink px-2.5 py-1 text-xs font-black text-opYellow hover:border-opYellow hover:text-white transition-colors shrink-0"
    >
      {(() => {
        const priceDelta = item.priceDelta24h ?? "";
        return (
          <>
      <span className="font-mono text-opYellow">{item.ticker}</span>
      <span
        className={
          priceDelta.startsWith("+") ? "text-opGreen" : "text-opRed"
        }
      >
        {priceDelta || "0.0%"}
      </span>
          </>
        );
      })()}
      {riskDot(item.riskScore) && (
        <span title={`Risk score: ${item.riskScore}`}>{riskDot(item.riskScore)}</span>
      )}
      {(item.status === "FLAGGED" || item.status === "CRITICAL") && (
        <span className="rounded bg-opRed/20 px-1 text-[10px] font-black text-opRed">
          🚨 FLAGGED
        </span>
      )}
    </a>
  ));

  return (
    <div
      className="ticker-scanlines relative overflow-hidden border-b-3 border-ink bg-black py-2"
      style={{ "--duration": `${durationSec}s` } as React.CSSProperties}
    >
      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          display: flex;
          gap: 12px;
          width: max-content;
          animation: ticker-scroll var(--duration, 30s) linear infinite;
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
        .ticker-scanlines::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,0,0,0.08) 2px,
            rgba(0,0,0,0.08) 4px
          );
        }
      `}</style>
      <div className="ticker-track">
        {/* Duplicate items for seamless loop */}
        {chips}
        {chips}
      </div>
    </div>
  );
}
