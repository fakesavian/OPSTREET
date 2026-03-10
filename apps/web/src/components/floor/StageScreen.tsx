"use client";

import { useEffect, useState } from "react";
import type { FloorTickerDTO } from "@opfun/shared";

function riskDot(riskScore: number | null): string {
  if (riskScore === null) return "";
  if (riskScore >= 70) return "🔴";
  if (riskScore >= 40) return "🟡";
  return "🟢";
}

interface Props {
  ticker: FloorTickerDTO[];
}

export function StageScreen({ ticker }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (ticker.length <= 1) return;
    const id = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % ticker.length);
    }, 10_000);
    return () => clearInterval(id);
  }, [ticker.length]);

  if (ticker.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="font-mono text-xs text-zinc-700">LOADING...</span>
      </div>
    );
  }

  const item = ticker[currentIndex % ticker.length]!;
  const priceDelta = item.priceDelta24h ?? "";
  const deltaPositive = priceDelta.startsWith("+");
  const dot = riskDot(item.riskScore);

  return (
    <div className="flex h-full flex-col items-center justify-center px-3 py-2 text-center">
      <span
        className="font-mono text-xl uppercase tracking-widest text-green-400"
        style={{ textShadow: "0 0 8px #4ade80" }}
      >
        {item.ticker}
      </span>
      <span className="mt-1 max-w-full truncate text-xs text-zinc-400">{item.name}</span>
      <div className="mt-1 flex items-center gap-2">
        <span className={`font-mono text-xs ${deltaPositive ? "text-green-400" : "text-red-400"}`}>
          {priceDelta || "0.0%"}
        </span>
        {dot && (
          <span title={`Risk: ${item.riskScore}`}>{dot}</span>
        )}
      </div>
    </div>
  );
}
