"use client";

import { useEffect, useMemo, useState } from "react";

type CurvePoint = {
  date: string;
  pnl: number;
  returnPct: number;
  capital: number;
  activeTrades?: number;
};

type Trade = {
  txId: number;
  symbol: string;
  issuer: string;
  type: "buy" | "sell";
  txDate: string;
  pubDate: string;
  copyDate: string;
  politicianEntryDate: string;
  value: number;
  politicianEntry: number;
  copyEntry: number;
  currentPrice: number;
  currentDate: string;
  politicianReturn: number;
  copyReturn: number;
  politicianPnl: number;
  copyPnl: number;
  reportingGap?: number;
};

type CandidateScore = {
  id: string;
  name: string;
  modelableTrades: number;
  copyPnl: number;
  politicianPnl: number;
  capital: number;
  copyReturnPct: number;
};

type ModelData = {
  selected: { id: string; name: string; reason: string };
  method: { delayDays: number; source: string; tradeLimit: string; sellHandling: string };
  asOf: string;
  candidateScores: CandidateScore[];
  totals: {
    modelableTrades: number;
    capital: number;
    copyPnl: number;
    politicianPnl: number;
    copyReturnPct: number;
    politicianReturnPct: number;
  };
  curves: {
    copyDelayed: CurvePoint[];
    politicianActual: CurvePoint[];
    sp500CopyBasis: CurvePoint[];
  };
  trades: Trade[];
};

type SeriesKey = "copyDelayed" | "politicianActual" | "sp500CopyBasis";

const SERIES: Array<{ key: SeriesKey; label: string; color: string; description: string }> = [
  {
    key: "copyDelayed",
    label: "You: 45-day delay",
    color: "#111111",
    description: "Entry happens 45 days after CapitolTrades publication date.",
  },
  {
    key: "politicianActual",
    label: "Politician timing",
    color: "#22C55E",
    description: "Entry happens on the disclosed transaction date.",
  },
  {
    key: "sp500CopyBasis",
    label: "S&P / SPY benchmark",
    color: "#2563EB",
    description: "Same notional deployment dates as your delayed copy model, invested in SPY.",
  },
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const number = new Intl.NumberFormat("en-US");

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function money(value: number) {
  return `${value >= 0 ? "+" : "-"}${currency.format(Math.abs(value))}`;
}

function scaledMoney(value: number, scale: number) {
  return `${value >= 0 ? "+" : "-"}${currency.format(Math.abs(value * scale))}`;
}

function yFor(value: number, min: number, max: number, height: number) {
  if (max === min) return height / 2;
  return height - ((value - min) / (max - min)) * height;
}

function buildPath(points: CurvePoint[], metric: "pnl" | "returnPct", dates: string[], min: number, max: number, width: number, height: number) {
  const byDate = new Map(points.map((p) => [p.date, p]));
  const coords = dates
    .map((date, index) => {
      const point = byDate.get(date);
      if (!point) return null;
      const x = dates.length <= 1 ? 0 : (index / (dates.length - 1)) * width;
      const y = yFor(point[metric], min, max, height);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean);
  return coords.length ? `M ${coords.join(" L ")}` : "";
}

function MetricCard({ label, value, sub, positive }: { label: string; value: string; sub: string; positive?: boolean }) {
  return (
    <div className="op-panel p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{label}</p>
      <p className={`mt-2 text-2xl font-black ${positive === undefined ? "" : positive ? "text-green-700" : "text-red-600"}`}>{value}</p>
      <p className="mt-1 text-xs font-bold text-[var(--text-secondary)]">{sub}</p>
    </div>
  );
}

function StrategyChart({ data, metric, visible, scale }: { data: ModelData; metric: "pnl" | "returnPct"; visible: Record<SeriesKey, boolean>; scale: number }) {
  const width = 920;
  const height = 360;
  const pad = { top: 16, right: 22, bottom: 34, left: 66 };
  const dates = data.curves.copyDelayed.map((p) => p.date);
  const enabled = SERIES.filter((s) => visible[s.key]);
  const rawValues = enabled.flatMap((s) => data.curves[s.key].map((p) => p[metric] * (metric === "pnl" ? scale : 1)));
  const minRaw = Math.min(0, ...rawValues);
  const maxRaw = Math.max(0, ...rawValues);
  const span = Math.max(1, maxRaw - minRaw);
  const min = minRaw - span * 0.08;
  const max = maxRaw + span * 0.08;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const zeroY = pad.top + yFor(0, min, max, plotH);
  const yTicks = [min, min + (max - min) * 0.25, min + (max - min) * 0.5, min + (max - min) * 0.75, max];

  const lastDate = dates[dates.length - 1];
  const lastPoints = enabled.map((s) => {
    const p = data.curves[s.key][data.curves[s.key].length - 1];
    return { ...s, point: p, value: p?.[metric] ?? 0 };
  });

  return (
    <div className="op-panel overflow-hidden p-4 md:p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Directive performance graph</h2>
          <p className="mt-1 text-sm font-bold text-[var(--text-muted)]">Delayed copy-trade model vs politician timing vs S&P/SPY benchmark.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {enabled.map((s) => {
            const point = data.curves[s.key][data.curves[s.key].length - 1];
            const value = metric === "pnl" ? scaledMoney(point.pnl, scale) : pct(point.returnPct);
            return (
              <span key={s.key} className="rounded-full border-2 border-ink bg-[var(--panel-cream)] px-3 py-1 text-xs font-black shadow-[2px_2px_0_#111]" style={{ color: s.color }}>
                {s.label}: {value}
              </span>
            );
          })}
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[760px] rounded-xl border-3 border-ink bg-white">
          <defs>
            <pattern id="copyGrid" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#111" strokeOpacity="0.06" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x="0" y="0" width={width} height={height} fill="url(#copyGrid)" />
          {yTicks.map((tick) => {
            const y = pad.top + yFor(tick, min, max, plotH);
            return (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#111" strokeOpacity="0.12" strokeWidth="1" />
                <text x={pad.left - 10} y={y + 4} textAnchor="end" className="fill-stone-600 text-[11px] font-bold">
                  {metric === "pnl" ? compactCurrency.format(tick) : `${tick.toFixed(1)}%`}
                </text>
              </g>
            );
          })}
          <line x1={pad.left} x2={width - pad.right} y1={zeroY} y2={zeroY} stroke="#111" strokeWidth="2" strokeDasharray="6 6" />
          {enabled.map((s) => {
            const normalized = metric === "pnl" ? data.curves[s.key].map((p) => ({ ...p, pnl: p.pnl * scale })) : data.curves[s.key];
            const path = buildPath(normalized, metric, dates, min, max, plotW, plotH);
            const lastIndex = dates.indexOf(lastDate);
            const last = normalized[normalized.length - 1];
            const x = pad.left + (lastIndex / Math.max(1, dates.length - 1)) * plotW;
            const y = pad.top + yFor(last?.[metric] ?? 0, min, max, plotH);
            return (
              <g key={s.key}>
                <path d={path} fill="none" stroke="#111" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" transform={`translate(${pad.left},${pad.top})`} opacity="0.18" />
                <path d={path} fill="none" stroke={s.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" transform={`translate(${pad.left},${pad.top})`} />
                <circle cx={x} cy={y} r="6" fill={s.color} stroke="#111" strokeWidth="3" />
              </g>
            );
          })}
          {dates.length > 1 && [0, Math.floor(dates.length / 2), dates.length - 1].map((i) => (
            <text key={i} x={pad.left + (i / (dates.length - 1)) * plotW} y={height - 12} textAnchor={i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"} className="fill-stone-700 text-[12px] font-black">
              {dates[i]}
            </text>
          ))}
        </svg>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {lastPoints.map((item) => (
          <div key={item.key} className="rounded-xl border-3 border-ink bg-[var(--panel-cream)] p-3 shadow-[4px_4px_0_#111]">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border-2 border-ink" style={{ background: item.color }} />
              <p className="text-sm font-black">{item.label}</p>
            </div>
            <p className="mt-1 text-xs font-bold text-[var(--text-muted)]">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TradeTable({ trades, scale }: { trades: Trade[]; scale: number }) {
  const [filter, setFilter] = useState<"all" | "winners" | "laggards">("all");
  const [query, setQuery] = useState("");
  const filtered = trades
    .filter((t) => (filter === "winners" ? t.copyPnl > 0 : filter === "laggards" ? t.copyPnl < 0 : true))
    .filter((t) => `${t.symbol} ${t.issuer}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 16);

  return (
    <div className="op-panel p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-black uppercase">Trade ledger</h2>
          <p className="text-sm font-bold text-[var(--text-muted)]">Sorted by delayed-copy P&L. Positive SELL means the inverse/avoidance signal worked.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {["all", "winners", "laggards"].map((item) => (
            <button key={item} type="button" onClick={() => setFilter(item as typeof filter)} className={`op-pill ${filter === item ? "op-pill-active" : ""}`}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <input className="input mt-4" placeholder="Filter by ticker or issuer" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[860px] space-y-2">
          {filtered.map((trade) => (
            <div key={trade.txId} className="grid grid-cols-[0.8fr_1.7fr_0.8fr_1fr_1fr_1fr_1fr] items-center gap-3 rounded-xl border-2 border-ink bg-white px-3 py-3 text-sm font-bold shadow-[3px_3px_0_#111]">
              <div>
                <p className="font-black">{trade.symbol}</p>
                <p className={`mt-1 inline-flex rounded-full border-2 border-ink px-2 py-0.5 text-[10px] font-black uppercase ${trade.type === "buy" ? "bg-green-200" : "bg-red-200"}`}>{trade.type}</p>
              </div>
              <p className="truncate" title={trade.issuer}>{trade.issuer}</p>
              <p>{compactCurrency.format(trade.value * scale)}</p>
              <div>
                <p>Tx {trade.txDate}</p>
                <p className="text-xs text-[var(--text-muted)]">Pub {trade.pubDate}</p>
              </div>
              <div>
                <p>Copy {trade.copyDate}</p>
                <p className="text-xs text-[var(--text-muted)]">+45 days</p>
              </div>
              <p className={trade.copyPnl >= 0 ? "text-green-700" : "text-red-600"}>{scaledMoney(trade.copyPnl, scale)}<br /><span className="text-xs text-ink">{pct(trade.copyReturn)}</span></p>
              <p className={trade.politicianPnl >= 0 ? "text-green-700" : "text-red-600"}>{scaledMoney(trade.politicianPnl, scale)}<br /><span className="text-xs text-ink">{pct(trade.politicianReturn)}</span></p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CongressCopytradeDashboard() {
  const [data, setData] = useState<ModelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<"pnl" | "returnPct">("pnl");
  const [principal, setPrincipal] = useState(100000);
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({ copyDelayed: true, politicianActual: true, sp500CopyBasis: true });

  useEffect(() => {
    fetch("/data/congress-copytrade-model.json")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load model"));
  }, []);

  const scale = useMemo(() => {
    if (!data?.totals.capital) return 1;
    return principal / data.totals.capital;
  }, [data?.totals.capital, principal]);

  if (error) {
    return <div className="op-panel p-6"><h1 className="text-2xl font-black">Congress copytrade dashboard</h1><p className="mt-3 font-bold text-red-600">Could not load model data: {error}</p></div>;
  }

  if (!data) {
    return <div className="op-panel p-6"><h1 className="text-2xl font-black">Loading congressional model...</h1><p className="mt-3 font-bold text-[var(--text-muted)]">Pulling the static Alpaca/CapitolTrades snapshot.</p></div>;
  }

  const copyFinal = data.curves.copyDelayed[data.curves.copyDelayed.length - 1];
  const politicianFinal = data.curves.politicianActual[data.curves.politicianActual.length - 1];
  const spyFinal = data.curves.sp500CopyBasis[data.curves.sp500CopyBasis.length - 1];
  const positiveCopy = copyFinal.pnl >= 0;
  const bestTrade = data.trades[0];
  const worstTrade = [...data.trades].sort((a, b) => a.copyPnl - b.copyPnl)[0];

  return (
    <div className="space-y-6">
      <style jsx global>{`
        body > footer {
          display: none !important;
        }
      `}</style>
      <section className="op-panel relative overflow-hidden p-5 md:p-7">
        <div className="absolute right-[-48px] top-[-58px] h-44 w-44 rounded-full border-3 border-ink bg-[var(--bg-yellow)] opacity-80" />
        <div className="relative grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="op-pill op-pill-active">45-day STOCK Act delay modeled</span>
              <span className="op-pill">CapitolTrades + Alpaca bars</span>
              <span className="op-pill">SPY benchmark</span>
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-6xl">
              Copy-trading {data.selected.name}
            </h1>
            <p className="mt-4 max-w-3xl text-base font-bold leading-7 text-[var(--text-secondary)] md:text-lg">
              I picked the most profitable modelable politician in the current sample: <strong>{data.selected.name}</strong>. The chart shows what you would have made after waiting 45 days after publication, what the politician-timed entries made, and a regular S&P/SPY benchmark.
            </p>
          </div>
          <div className="rounded-2xl border-3 border-ink bg-white p-4 shadow-[6px_6px_0_#111]">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Model account size</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xl font-black">{currency.format(principal)}</span>
              <input aria-label="Principal" type="range" min="25000" max="1000000" step="25000" value={principal} onChange={(event) => setPrincipal(Number(event.target.value))} className="w-full accent-black" />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-xs font-black">
              {[50000, 100000, 250000, 500000].map((amount) => (
                <button key={amount} type="button" onClick={() => setPrincipal(amount)} className="rounded-lg border-2 border-ink bg-[var(--panel-cream)] px-2 py-1 shadow-[2px_2px_0_#111] hover:bg-[var(--bg-yellow)]">
                  {compactCurrency.format(amount)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Your delayed result" value={scaledMoney(copyFinal.pnl, scale)} sub={`${pct(copyFinal.returnPct)} on active delayed entries`} positive={positiveCopy} />
        <MetricCard label="Politician timing" value={scaledMoney(politicianFinal.pnl, scale)} sub={`${pct(politicianFinal.returnPct)} before disclosure lag`} positive={politicianFinal.pnl >= 0} />
        <MetricCard label="S&P / SPY" value={scaledMoney(spyFinal.pnl, scale)} sub={`${pct(spyFinal.returnPct)} same deployment dates`} positive={spyFinal.pnl >= 0} />
        <MetricCard label="Modelable trades" value={number.format(data.totals.modelableTrades)} sub={`Disclosed notional ${compactCurrency.format(data.totals.capital)} scaled to your account`} />
      </section>

      <section className="op-panel p-4 md:p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-xl font-black uppercase">Controls</h2>
            <p className="text-sm font-bold text-[var(--text-muted)]">Toggle graph lines, switch between dollars and percentage, then inspect the trade ledger.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={`op-pill ${metric === "pnl" ? "op-pill-active" : ""}`} onClick={() => setMetric("pnl")} type="button">$ P&L</button>
            <button className={`op-pill ${metric === "returnPct" ? "op-pill-active" : ""}`} onClick={() => setMetric("returnPct")} type="button">% return</button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {SERIES.map((s) => (
            <button key={s.key} type="button" onClick={() => setVisible((current) => ({ ...current, [s.key]: !current[s.key] }))} className={`op-pill ${visible[s.key] ? "op-pill-active" : ""}`}>
              <span className="mr-2 h-3 w-3 rounded-full border-2 border-ink" style={{ background: s.color }} />
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <StrategyChart data={data} metric={metric} visible={visible} scale={scale} />

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="op-panel p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Best delayed-copy trade</p>
          <h3 className="mt-2 text-2xl font-black">{bestTrade.symbol}</h3>
          <p className="mt-1 truncate font-bold">{bestTrade.issuer}</p>
          <p className="mt-3 text-xl font-black text-green-700">{scaledMoney(bestTrade.copyPnl, scale)} <span className="text-base text-ink">{pct(bestTrade.copyReturn)}</span></p>
          <p className="mt-1 text-xs font-bold text-[var(--text-muted)]">Copied on {bestTrade.copyDate}; politician trade date {bestTrade.txDate}.</p>
        </div>
        <div className="op-panel p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Worst delayed-copy trade</p>
          <h3 className="mt-2 text-2xl font-black">{worstTrade.symbol}</h3>
          <p className="mt-1 truncate font-bold">{worstTrade.issuer}</p>
          <p className="mt-3 text-xl font-black text-red-600">{scaledMoney(worstTrade.copyPnl, scale)} <span className="text-base text-ink">{pct(worstTrade.copyReturn)}</span></p>
          <p className="mt-1 text-xs font-bold text-[var(--text-muted)]">Copied on {worstTrade.copyDate}; politician trade date {worstTrade.txDate}.</p>
        </div>
        <div className="op-panel p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Why this politician?</p>
          <p className="mt-2 text-sm font-bold leading-6 text-[var(--text-secondary)]">{data.selected.reason}</p>
          <p className="mt-3 text-xs font-bold text-[var(--text-muted)]">Snapshot as of {new Date(data.asOf).toLocaleString()}.</p>
        </div>
      </section>

      <section className="op-panel p-4 md:p-5">
        <h2 className="text-xl font-black uppercase">Candidate leaderboard</h2>
        <p className="mt-1 text-sm font-bold text-[var(--text-muted)]">The scan picked the strongest delayed-copy return from modelable current CapitolTrades politicians.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.candidateScores.map((candidate, index) => (
            <div key={candidate.id} className={`rounded-xl border-3 border-ink p-3 shadow-[4px_4px_0_#111] ${index === 0 ? "bg-[var(--bg-yellow)]" : "bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-[var(--text-muted)]">#{index + 1} · {candidate.id}</p>
                  <h3 className="text-lg font-black">{candidate.name}</h3>
                </div>
                <span className={`rounded-full border-2 border-ink px-2 py-1 text-xs font-black ${candidate.copyReturnPct >= 0 ? "bg-green-200" : "bg-red-200"}`}>{pct(candidate.copyReturnPct)}</span>
              </div>
              <p className="mt-2 text-sm font-bold">Delayed P&L: {money(candidate.copyPnl)}</p>
              <p className="text-xs font-bold text-[var(--text-muted)]">{candidate.modelableTrades} modelable trades · {compactCurrency.format(candidate.capital)} disclosed notional</p>
            </div>
          ))}
        </div>
      </section>

      <TradeTable trades={data.trades} scale={scale} />

      <section className="op-panel p-4 text-sm font-bold leading-6 text-[var(--text-secondary)]">
        <h2 className="text-lg font-black uppercase text-ink">Model notes</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Delay rule: entries use the first available Alpaca daily bar on or after publication date + {data.method.delayDays} calendar days.</li>
          <li>Politician line: entries use the first available daily bar on or after the reported transaction date.</li>
          <li>{data.method.sellHandling}</li>
          <li>This is a backtest/visual model, not trading advice. Disclosure values are ranges on source filings; this model uses the CapitolTrades normalized disclosed value.</li>
        </ul>
      </section>
    </div>
  );
}
