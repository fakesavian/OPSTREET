"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { fetchCandles } from "@/lib/api";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type PriceDisplay = "USD" | "SATS" | "MCAP";

interface TokenChartProps {
  ticker: string;
  projectId?: string;
  candles?: Candle[];
  fitToContainer?: boolean;
  btcUsd?: number;
  defaultPriceDisplay?: PriceDisplay;
}

type TimeFrame = "1H" | "4H" | "1D" | "1W";
type ChartMode = "line" | "candle";

const TIMEFRAMES: TimeFrame[] = ["1H", "4H", "1D", "1W"];
const API_TIMEFRAMES: Record<TimeFrame, { timeframe: string; limit: number }> = {
  "1H": { timeframe: "1m", limit: 60 },
  "4H": { timeframe: "5m", limit: 48 },
  "1D": { timeframe: "15m", limit: 96 },
  "1W": { timeframe: "4h", limit: 42 },
};
const PAD = { top: 10, right: 60, bottom: 28, left: 12 };

function formatPrice(p: number): string {
  if (p >= 1000000) return `${(p / 1000000).toFixed(2)}M`;
  if (p >= 1000) return `${(p / 1000).toFixed(1)}K`;
  return p.toFixed(p < 10 ? 2 : 0);
}

function formatTime(ts: number, tf: TimeFrame): string {
  const d = new Date(ts * 1000);
  if (tf === "1W" || tf === "1D") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function TokenChart({ ticker, projectId, candles: externalCandles, fitToContainer = false, btcUsd = 0, defaultPriceDisplay = "USD" }: TokenChartProps) {
  const [tf, setTf] = useState<TimeFrame>("1D");
  const [mode, setMode] = useState<ChartMode>("candle");
  const [priceDisplay, setPriceDisplay] = useState<PriceDisplay>(defaultPriceDisplay);
  const [indexedCandles, setIndexedCandles] = useState<Candle[]>([]);
  const [loadingIndexedCandles, setLoadingIndexedCandles] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgSize, setSvgSize] = useState({ w: 600, h: 260 });
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; candleIdx: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSvgSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (externalCandles) {
      setIndexedCandles([]);
      setLoadingIndexedCandles(false);
      return;
    }
    if (!projectId) {
      setIndexedCandles([]);
      setLoadingIndexedCandles(false);
      return;
    }

    let cancelled = false;
    const config = API_TIMEFRAMES[tf];
    setLoadingIndexedCandles(true);

    fetchCandles(projectId, config.timeframe, config.limit)
      .then((payload) => {
        if (!cancelled) setIndexedCandles(payload.candles);
      })
      .catch(() => {
        if (!cancelled) setIndexedCandles([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingIndexedCandles(false);
      });

    return () => {
      cancelled = true;
    };
  }, [externalCandles, projectId, tf]);

  const candles = useMemo(() => externalCandles ?? indexedCandles, [externalCandles, indexedCandles]);

  const { w, h } = svgSize;
  const chartW = Math.max(1, w - PAD.left - PAD.right);
  const chartH = Math.max(1, h - PAD.top - PAD.bottom);

  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const minLow = lows.length > 0 ? Math.min(...lows) : 0;
  const maxHigh = highs.length > 0 ? Math.max(...highs) : 1;
  const priceRange = maxHigh - minLow || 1;

  const toX = (i: number) => PAD.left + (i / Math.max(candles.length - 1, 1)) * chartW;
  const toY = (p: number) => PAD.top + chartH - ((p - minLow) / priceRange) * chartH;

  const yTicks = useMemo(() => {
    const count = 5;
    const step = priceRange / (count - 1);
    return Array.from({ length: count }, (_, i) => minLow + i * step);
  }, [minLow, priceRange]);

  const xTickIdxs = useMemo(() => {
    if (candles.length === 0) return [];
    const count = Math.min(6, candles.length);
    if (count === 1) return [0];
    return Array.from({ length: count }, (_, i) => Math.round((i * (candles.length - 1)) / (count - 1)));
  }, [candles.length]);

  const getCandleIdx = useCallback((clientX: number): number => {
    if (!svgRef.current || candles.length === 0) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = (clientX - rect.left) * (w / rect.width);
    const chartX = svgX - PAD.left;
    const idx = Math.round((chartX / chartW) * (candles.length - 1));
    return Math.max(0, Math.min(candles.length - 1, idx));
  }, [w, chartW, candles.length]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || candles.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (w / rect.width);
    const svgY = (e.clientY - rect.top) * (h / rect.height);
    const idx = getCandleIdx(e.clientX);
    setCrosshair({ x: svgX, y: svgY, candleIdx: idx });
  }, [w, h, candles.length, getCandleIdx]);

  const hoveredCandle = crosshair ? candles[crosshair.candleIdx] : null;
  const firstCandle = candles[0];
  const lastCandle = candles[candles.length - 1];
  const priceChange = firstCandle && lastCandle
    ? ((lastCandle.close - firstCandle.open) / firstCandle.open) * 100
    : 0;
  const isUp = priceChange >= 0;

  const ASSUMED_TOTAL_SUPPLY = 21_000_000;
  const satsPerBtc = 100_000_000;

  function displayPrice(satPrice: number): string {
    if (priceDisplay === "SATS") return formatPrice(satPrice);
    if (priceDisplay === "MCAP") {
      const mcap = (satPrice / satsPerBtc) * btcUsd * ASSUMED_TOTAL_SUPPLY;
      if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(2)}M`;
      if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(1)}K`;
      return `$${mcap.toFixed(0)}`;
    }
    // USD
    const usd = (satPrice / satsPerBtc) * btcUsd;
    if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}K`;
    if (usd >= 1) return `$${usd.toFixed(2)}`;
    if (usd >= 0.01) return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(6)}`;
  }

  return (
    <div className={fitToContainer ? "op-panel flex h-full min-h-0 flex-col overflow-hidden" : "op-panel overflow-hidden"}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b-2 border-ink/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-ink">${ticker}</span>
          {lastCandle && <span className="font-mono text-xs font-black text-ink">{displayPrice(lastCandle.close)}</span>}
          <span className={`text-xs font-black ${isUp ? "text-green-600" : "text-opRed"}`}>
            {isUp ? "+" : ""}{priceChange.toFixed(2)}%
          </span>
          {candles.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-opGreen/20 px-2 py-0.5 text-[9px] font-black text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          ) : loadingIndexedCandles ? (
            <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-opYellow/20 px-2 py-0.5 text-[9px] font-black text-ink">
              Indexing
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-gray-200 px-2 py-0.5 text-[9px] font-black text-gray-500">
              No data
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <div className="flex overflow-hidden rounded-lg border-2 border-ink">
            {TIMEFRAMES.map((t) => (
              <button
                key={t}
                onClick={() => setTf(t)}
                className={`px-2 py-1 text-[10px] font-black ${
                  tf === t ? "bg-opYellow text-ink" : "bg-[var(--panel-cream)] text-[var(--text-muted)]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border-2 border-ink">
            {(["candle", "line"] as ChartMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-1 text-[10px] font-black ${
                  mode === m ? "bg-opYellow text-ink" : "bg-[var(--panel-cream)] text-[var(--text-muted)]"
                }`}
              >
                {m === "candle" ? "Candle" : "Line"}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border-2 border-ink">
            {(["USD", "SATS", "MCAP"] as PriceDisplay[]).map((pd) => (
              <button
                key={pd}
                onClick={() => setPriceDisplay(pd)}
                className={`px-2 py-1 text-[10px] font-black ${
                  priceDisplay === pd ? "bg-opYellow text-ink" : "bg-[var(--panel-cream)] text-[var(--text-muted)]"
                }`}
              >
                {pd}
              </button>
            ))}
          </div>
        </div>
      </div>

      {hoveredCandle && (
        <div className="flex shrink-0 flex-wrap gap-2 border-b-2 border-ink/10 bg-opYellow/20 px-3 py-1 text-[10px] font-mono font-black text-ink">
          <span>O: {displayPrice(hoveredCandle.open)}</span>
          <span className="text-green-700">H: {displayPrice(hoveredCandle.high)}</span>
          <span className="text-opRed">L: {displayPrice(hoveredCandle.low)}</span>
          <span className={hoveredCandle.close >= hoveredCandle.open ? "text-green-700" : "text-opRed"}>
            C: {displayPrice(hoveredCandle.close)}
          </span>
          <span className="text-[var(--text-muted)]">Vol: {hoveredCandle.volume.toLocaleString()}</span>
          <span className="text-[var(--text-muted)]">{formatTime(hoveredCandle.time, tf)}</span>
        </div>
      )}

      {candles.length === 0 ? (
        <div
          className="flex items-center justify-center text-xs text-[var(--text-muted)] font-bold"
          style={{ height: fitToContainer ? undefined : 260, minHeight: fitToContainer ? 180 : undefined }}
        >
          {loadingIndexedCandles ? "Loading live candles..." : "No confirmed trades yet"}
        </div>
      ) : (
      <div
        ref={containerRef}
        className={fitToContainer ? "min-h-[180px] flex-1 select-none" : "select-none"}
        style={fitToContainer ? { cursor: "crosshair" } : { height: 260, cursor: "crosshair" }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          height="100%"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setCrosshair(null)}
          style={{ display: "block" }}
        >
          {yTicks.map((price) => {
            const y = toY(price);
            return (
              <g key={price}>
                <line x1={PAD.left} y1={y} x2={w - PAD.right} y2={y} stroke="#11111115" strokeWidth={1} />
                <text x={w - PAD.right + 4} y={y + 3.5} fontSize={9} fill="#666666" fontFamily="monospace" fontWeight="bold">
                  {displayPrice(price)}
                </text>
              </g>
            );
          })}

          {xTickIdxs.map((idx) => {
            const candle = candles[idx];
            if (!candle) return null;
            const x = toX(idx);
            return (
              <text key={idx} x={x} y={h - 6} fontSize={8} fill="#666666" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
                {formatTime(candle.time, tf)}
              </text>
            );
          })}

          {mode === "line" ? (
            <>
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {candles.length > 0 && (
                <>
                  <path
                    d={`M ${toX(0)} ${toY(candles[0]!.close)} ${candles.map((c, i) => `L ${toX(i)} ${toY(c.close)}`).join(" ")} L ${toX(candles.length - 1)} ${PAD.top + chartH} L ${PAD.left} ${PAD.top + chartH} Z`}
                    fill="url(#lineGrad)"
                  />
                  <path
                    d={`M ${toX(0)} ${toY(candles[0]!.close)} ${candles.map((c, i) => `L ${toX(i)} ${toY(c.close)}`).join(" ")}`}
                    fill="none"
                    stroke="#22C55E"
                    strokeWidth={2}
                  />
                </>
              )}
            </>
          ) : (
            candles.map((c, i) => {
              const x = toX(i);
              const candleW = Math.max(1, (chartW / Math.max(1, candles.length)) * 0.7);
              const isGreen = c.close >= c.open;
              const color = isGreen ? "#22C55E" : "#EF4444";
              const bodyTop = toY(Math.max(c.open, c.close));
              const bodyBot = toY(Math.min(c.open, c.close));
              const bodyH = Math.max(1, bodyBot - bodyTop);
              return (
                <g key={i}>
                  <line x1={x} y1={toY(c.high)} x2={x} y2={toY(c.low)} stroke={color} strokeWidth={1} />
                  <rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} opacity={0.9} rx={0.5} />
                </g>
              );
            })
          )}

          {crosshair && crosshair.x >= PAD.left && crosshair.x <= w - PAD.right && (
            <>
              <line x1={crosshair.x} y1={PAD.top} x2={crosshair.x} y2={PAD.top + chartH} stroke="#111111" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
              <line x1={PAD.left} y1={crosshair.y} x2={w - PAD.right} y2={crosshair.y} stroke="#111111" strokeWidth={1} strokeDasharray="3 3" opacity={0.3} />
              {(() => {
                const price = minLow + ((PAD.top + chartH - crosshair.y) / chartH) * priceRange;
                return (
                  <g>
                    <rect x={w - PAD.right + 1} y={crosshair.y - 7} width={PAD.right - 2} height={14} fill="#111111" rx={2} />
                    <text
                      x={w - PAD.right + PAD.right / 2}
                      y={crosshair.y + 3.5}
                      fontSize={9}
                      fill="white"
                      textAnchor="middle"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {displayPrice(Math.max(0, price))}
                    </text>
                  </g>
                );
              })()}
            </>
          )}
        </svg>
      </div>
      )}

      <div className="flex shrink-0 items-center justify-between border-t-2 border-ink/10 px-3 py-1 text-[9px] font-bold text-[var(--text-muted)]">
        <span>Auto-fit chart inside monitor</span>
        <span>{priceDisplay === "USD" ? `BTC: $${btcUsd.toLocaleString()}` : priceDisplay === "MCAP" ? "Market Cap est." : "Live data"}</span>
      </div>
    </div>
  );
}
