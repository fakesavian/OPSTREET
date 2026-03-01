"use client";

import { useEffect, useRef, useState } from "react";

/**
 * BondingCurvePanel — purely client-side bonding curve simulator.
 *
 * Formula: price(n) = BASE_PRICE + n² / CURVE_FACTOR  (in sats)
 *
 * This is a visual/educational simulator only — no real funds, no on-chain trades.
 * Graduation threshold: 100 pledges.
 */

const BASE_PRICE = 100; // sats at 0 pledges
const CURVE_FACTOR = 10; // divisor for the quadratic term
const GRADUATION_PLEDGES = 100;
const CHART_STEPS = 50; // number of data points in the SVG path

function curvePrice(n: number): number {
  return BASE_PRICE + (n * n) / CURVE_FACTOR;
}

interface BondingCurvePanelProps {
  pledgeCount: number;
  ticker: string;
  status: string;
  onPledge: () => void;
  pledging: boolean;
}

export function BondingCurvePanel({
  pledgeCount,
  ticker,
  status,
  onPledge,
  pledging,
}: BondingCurvePanelProps) {
  // S12: brief "Pledged!" success flash after pledging completes
  const [justPledged, setJustPledged] = useState(false);
  const prevPledging = useRef(false);
  useEffect(() => {
    if (prevPledging.current && !pledging) {
      setJustPledged(true);
      const t = setTimeout(() => setJustPledged(false), 2000);
      return () => clearTimeout(t);
    }
    prevPledging.current = pledging;
  }, [pledging]);

  const isGraduated = status === "GRADUATED";
  const canPledge = status === "LAUNCHED" || status === "READY";
  const currentPrice = curvePrice(pledgeCount);
  const graduationPrice = curvePrice(GRADUATION_PLEDGES);
  const progress = Math.min((pledgeCount / GRADUATION_PLEDGES) * 100, 100);

  // Build SVG path for the curve
  const W = 400;
  const H = 120;
  const PAD = { t: 8, r: 8, b: 24, l: 40 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const maxPrice = curvePrice(GRADUATION_PLEDGES);
  const minPrice = BASE_PRICE;

  const toX = (n: number) => PAD.l + (n / GRADUATION_PLEDGES) * chartW;
  const toY = (p: number) =>
    PAD.t + chartH - ((p - minPrice) / (maxPrice - minPrice)) * chartH;

  const points: [number, number][] = [];
  for (let i = 0; i <= CHART_STEPS; i++) {
    const n = (i / CHART_STEPS) * GRADUATION_PLEDGES;
    points.push([toX(n), toY(curvePrice(n))]);
  }
  const pathD =
    "M " + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ");

  // Current position dot
  const dotX = toX(pledgeCount);
  const dotY = toY(currentPrice);

  // Graduation line X
  const gradX = toX(GRADUATION_PLEDGES);

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h2 className="font-bold text-white">Bonding Curve Simulator</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Simulated price · no real funds · {GRADUATION_PLEDGES} pledges to graduate
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">Current price</p>
          <p className="text-xl font-black text-brand-400">
            {Math.round(currentPrice).toLocaleString()} sats
          </p>
          <p className="text-[10px] text-zinc-600">
            per {ticker}
          </p>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative w-full overflow-hidden rounded-xl bg-zinc-900/60 border border-zinc-800">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: "auto", display: "block" }}
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map((f) => {
            const y = PAD.t + chartH * (1 - f);
            const price = minPrice + f * (maxPrice - minPrice);
            return (
              <g key={f}>
                <line
                  x1={PAD.l}
                  y1={y}
                  x2={W - PAD.r}
                  y2={y}
                  stroke="#27272a"
                  strokeWidth="0.5"
                />
                <text x={PAD.l - 4} y={y + 3} textAnchor="end" fill="#52525b" fontSize="7">
                  {Math.round(price)}
                </text>
              </g>
            );
          })}

          {/* Graduation threshold vertical line */}
          <line
            x1={gradX}
            y1={PAD.t}
            x2={gradX}
            y2={H - PAD.b}
            stroke="#7c3aed"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <text x={gradX - 2} y={PAD.t + 6} textAnchor="end" fill="#7c3aed" fontSize="6">
            GRAD
          </text>

          {/* Filled area under curve */}
          <path
            d={`${pathD} L ${toX(GRADUATION_PLEDGES).toFixed(1)},${(H - PAD.b).toFixed(1)} L ${PAD.l.toFixed(1)},${(H - PAD.b).toFixed(1)} Z`}
            fill="url(#curveGrad)"
            opacity="0.3"
          />

          {/* Curve line */}
          <path d={pathD} fill="none" stroke="#f97316" strokeWidth="1.5" />

          {/* Current position dot */}
          {pledgeCount > 0 && pledgeCount <= GRADUATION_PLEDGES && (
            <>
              <circle cx={dotX} cy={dotY} r="4" fill="#f97316" />
              <circle cx={dotX} cy={dotY} r="7" fill="#f97316" opacity="0.2" />
            </>
          )}

          {/* X-axis labels */}
          {[0, 25, 50, 75, 100].map((n) => (
            <text key={n} x={toX(n)} y={H - 6} textAnchor="middle" fill="#52525b" fontSize="7">
              {n}
            </text>
          ))}
          <text
            x={W / 2}
            y={H - 1}
            textAnchor="middle"
            fill="#3f3f46"
            fontSize="6"
          >
            pledges
          </text>

          <defs>
            <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Graduation progress */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5 text-xs">
          <span className="text-zinc-500">
            {isGraduated ? "Graduated!" : `${pledgeCount} / ${GRADUATION_PLEDGES} pledges to graduation`}
          </span>
          <span className="font-mono text-zinc-400">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isGraduated
                ? "bg-purple-500"
                : progress >= 75
                ? "bg-gradient-to-r from-orange-500 to-red-500"
                : "bg-gradient-to-r from-brand-600 to-brand-400"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        {isGraduated ? (
          <p className="mt-2 text-center text-sm font-bold text-purple-400">
            This token has graduated
          </p>
        ) : (
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-600">
            <span>Base: {BASE_PRICE} sats</span>
            <span>Graduation at: {Math.round(graduationPrice).toLocaleString()} sats</span>
          </div>
        )}
      </div>

      {/* S12: Pledge CTA with success flash */}
      {canPledge && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={onPledge}
            disabled={pledging || justPledged}
            className={`btn-primary flex-1 py-2.5 ${
              justPledged
                ? "!bg-green-600 !border-green-700 !shadow-[3px_3px_0_#14532d]"
                : ""
            }`}
          >
            {pledging
              ? "Pledging…"
              : justPledged
              ? "Pledged! ♥"
              : "Pledge support ♥"}
          </button>
          <div className="text-right text-xs text-zinc-500">
            <p>Next price</p>
            <p className="font-mono font-bold text-zinc-300">
              {Math.round(curvePrice(pledgeCount + 1)).toLocaleString()} sats
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
