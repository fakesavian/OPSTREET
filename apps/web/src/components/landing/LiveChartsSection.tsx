"use client";

import { useEffect, useState } from "react";
import { fetchPrices, type PriceData } from "@/lib/api";
import { TokenChart } from "@/components/TokenChart";

const TICKERS = ["TBTC", "PILL", "MOTO"] as const;

export function LiveChartsSection() {
  const [data, setData] = useState<PriceData | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let mounted = true;

    const poll = () => {
      fetchPrices()
        .then((d) => {
          if (mounted) {
            setData(d);
            setUnavailable(false);
          }
        })
        .catch(() => {
          if (mounted) setUnavailable(true);
        });
    };

    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <section className="mt-6">
      <h2 className="text-lg font-black text-ink mb-3">Live Charts</h2>
      <div className="grid gap-4 sm:grid-cols-3 overflow-x-auto">
        {TICKERS.map((ticker) => {
          const tp = data?.prices[ticker];
          return (
            <div key={ticker} className="op-panel op-card-hover min-w-[260px]">
              {tp && (
                <div className="flex items-center gap-2 border-b-2 border-ink/10 px-3 py-1.5">
                  <span className="text-xs font-black text-ink">${ticker}</span>
                  <span className="font-mono text-xs font-bold text-ink">${tp.usd.toFixed(4)}</span>
                  <span className={`text-[10px] font-black ${tp.change24h >= 0 ? "text-green-600" : "text-opRed"}`}>
                    {tp.change24h >= 0 ? "+" : ""}{tp.change24h.toFixed(2)}%
                  </span>
                </div>
              )}
              {unavailable && !data ? (
                <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
                  <span className="font-bold">Upstream unavailable</span>
                  <span className="text-[10px]">Retrying...</span>
                </div>
              ) : (
                <TokenChart
                  ticker={ticker}
                  candles={tp?.candles}
                  btcUsd={data?.btcUsd}
                  defaultPriceDisplay="USD"
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
